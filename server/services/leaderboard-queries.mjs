import { buildPerformanceConditions } from '../utils/filter-utils.mjs'
import { compositeThroughputWeightsV1, getLeaderboardScenario } from './leaderboard-scenarios.mjs'

const protocolEfficiencySql = (weights, protocolColumn = 'protocol') => `
  CASE
    WHEN ${protocolColumn} = 'TCP' THEN ${weights.theoreticalCeiling.defaults.TCP}
    WHEN ${protocolColumn} = 'UDP' THEN ${weights.theoreticalCeiling.defaults.UDP}
    ELSE ${weights.theoreticalCeiling.defaults.default}
  END
`

const protocolWeightSql = weights => `
  CASE
    WHEN protocol = 'TCP' THEN ${weights.protocol.TCP}
    WHEN protocol = 'UDP' THEN ${weights.protocol.UDP}
    ELSE ${weights.protocol.default}
  END
`

const bandWeightSql = weights => `
  CASE
    WHEN band = '2.4' THEN ${weights.band['2.4']}
    WHEN band = '5' THEN ${weights.band['5']}
    WHEN band = '6' THEN ${weights.band['6']}
    ELSE ${weights.band.default}
  END
`

const standardWeightSql = weights => `
  CASE
    WHEN wifi_mode = '11n' THEN ${weights.standard['11n']}
    WHEN wifi_mode = '11ac' THEN ${weights.standard['11ac']}
    WHEN wifi_mode = '11ax' THEN ${weights.standard['11ax']}
    WHEN wifi_mode = '11be' THEN ${weights.standard['11be']}
    ELSE ${weights.standard.default}
  END
`

const theoreticalPhyRateSql = (weights, standardColumn = 'wifi_mode', bandwidthColumn = 'bandwidth_mhz') => {
  const mapping = weights?.theoreticalCeiling?.phyRateMbpsByStandardBandwidth ?? null
  if (!mapping || typeof mapping !== 'object') return 'NULL'

  const standardCases = Object.entries(mapping)
    .filter(([, bandwidthMap]) => bandwidthMap && typeof bandwidthMap === 'object')
    .map(([standard, bandwidthMap]) => {
      const bwCases = Object.entries(bandwidthMap)
        .filter(([bw, rate]) => Number.isFinite(Number(bw)) && Number.isFinite(Number(rate)))
        .map(([bw, rate]) => `WHEN ${bandwidthColumn} = ${Number(bw)} THEN ${Number(rate)}`)
        .join('\n    ')

      if (!bwCases) return null
      return `WHEN ${standardColumn} = '${standard}' THEN (CASE\n    ${bwCases}\n    ELSE NULL\n  END)`
    })
    .filter(Boolean)
    .join('\n  ')

  if (!standardCases) return 'NULL'

  return `
  CASE
  ${standardCases}
    ELSE NULL
  END
`
}

export const buildScenarioProjectLeaderboardQuery = ({ scenarioKey, filters, limit }) => {
  const scenario = getLeaderboardScenario(scenarioKey) ?? getLeaderboardScenario('performance')
  const weights = compositeThroughputWeightsV1
  const requireGolden = ['1', 'true', 'yes', 'on'].includes(String(process.env.API_REQUIRE_GOLDEN ?? '').toLowerCase())

  const perfFilter = buildPerformanceConditions(filters, { includeBase: false })
  const conditions = [...perfFilter.conditions]
  const params = [...perfFilter.params]

  conditions.push('COALESCE(p.throughput_avg_mbps, p.throughput_peak_mbps, kv.throughput_mbps) IS NOT NULL')
  if (requireGolden) {
    conditions.push('tr.is_golden = 1')
  }

  if (scenario?.filters?.pathLossMin !== undefined) {
    conditions.push('p.attenuation >= ?')
    params.push(scenario.filters.pathLossMin)
  }
  if (scenario?.filters?.pathLossMax !== undefined) {
    conditions.push('p.attenuation <= ?')
    params.push(scenario.filters.pathLossMax)
  }
  if (scenario?.filters?.rssiMax !== undefined) {
    conditions.push('p.rssi <= ?')
    params.push(scenario.filters.rssiMax)
  }

  if (!filters.startDate && !filters.endDate) {
    const days = Number.isFinite(Number(scenario.defaultDays)) ? Number(scenario.defaultDays) : 180
    conditions.push(`p.created_at >= DATE_SUB(NOW(), INTERVAL ${Math.max(1, Math.trunc(days))} DAY)`)
  }

  const protocolWeight = protocolWeightSql(weights)
  const bandWeight = bandWeightSql(weights)
  const standardWeight = standardWeightSql(weights)
  const defaultEfficiency = protocolEfficiencySql(weights, 'p.protocol')
  const theoreticalPhyRate = theoreticalPhyRateSql(weights, 'p.wifi_mode', 'p.bandwidth_mhz')
  const whereClause = conditions.length ? conditions.join(' AND ') : '1=1'

  const sql = `
    SELECT
      ps.project_id,
      ps.brand,
      ps.product_line,
      ps.project_name,
      NULL AS hardware_version,
      ps.sample_count,
      ps.last_updated_at,
      ROUND(
        LEAST(
          1,
          GREATEST(
            0,
            COALESCE(
              (ps.composite_raw / NULLIF(ps.theoretical_ceiling_mbps, 0)),
              (ps.composite_raw / NULLIF(mx.max_composite_raw, 0))
            )
          )
        ) *
        (${weights.sampleFactor.base} + ${weights.sampleFactor.extra} * LEAST(1, LOG10(ps.sample_count + 1) / LOG10(${weights.sampleFactor.fullSamples} + 1))) *
        ${weights.scoreScale}
      ) AS score,
      ps.composite_raw,
      ps.theoretical_ceiling_mbps
    FROM (
      SELECT
        gs.project_id,
        gs.brand,
        gs.product_line,
        gs.project_name,
        SUM(
          (${protocolWeight}) * (${bandWeight}) * (${standardWeight}) *
          (${weights.throughput.avg} * gs.avg_throughput_avg_mbps + ${weights.throughput.peak} * gs.avg_throughput_peak_mbps)
        ) / NULLIF(SUM(
          (${protocolWeight}) * (${bandWeight}) * (${standardWeight})
        ), 0) AS composite_raw,
        SUM(
          (${protocolWeight}) * (${bandWeight}) * (${standardWeight}) *
          (gs.theoretical_phy_rate_mbps * gs.protocol_efficiency)
        ) / NULLIF(SUM(
          (${protocolWeight}) * (${bandWeight}) * (${standardWeight})
        ), 0) AS theoretical_ceiling_mbps,
        SUM(gs.sample_count) AS sample_count,
        MAX(gs.last_updated_at) AS last_updated_at
      FROM (
        SELECT
          pr.id AS project_id,
          pr.customer AS brand,
          pr.project_type AS product_line,
          pr.project_name,
          p.wifi_mode,
          p.band,
          p.bandwidth_mhz,
          p.protocol,
          AVG(COALESCE(p.throughput_avg_mbps, kv.throughput_mbps)) AS avg_throughput_avg_mbps,
          AVG(COALESCE(p.throughput_peak_mbps, p.throughput_avg_mbps, kv.throughput_mbps)) AS avg_throughput_peak_mbps,
          MAX((${theoreticalPhyRate})) AS theoretical_phy_rate_mbps,
          (${defaultEfficiency}) AS protocol_efficiency,
          COUNT(*) AS sample_count,
          MAX(p.created_at) AS last_updated_at
        FROM performance p
        INNER JOIN test_report tr ON tr.id = p.test_report_id
        INNER JOIN project pr ON pr.id = tr.project_id
        LEFT JOIN dut d ON d.test_report_id = tr.id
        LEFT JOIN (
          SELECT test_report_id, AVG(metric_value) AS throughput_mbps
          FROM perf_metric_kv
          WHERE metric_name = 'throughput'
          GROUP BY test_report_id
        ) kv ON kv.test_report_id = p.test_report_id
        WHERE ${whereClause}
        GROUP BY
          pr.id,
          pr.customer,
          pr.project_type,
          pr.project_name,
          p.wifi_mode,
          p.band,
          p.bandwidth_mhz,
          p.protocol
      ) gs
      GROUP BY
        gs.project_id,
        gs.brand,
        gs.product_line,
        gs.project_name
    ) ps
    CROSS JOIN (
      SELECT MAX(composite_raw) AS max_composite_raw
      FROM (
        SELECT
          SUM(
            (${protocolWeight}) * (${bandWeight}) * (${standardWeight}) *
            (${weights.throughput.avg} * gs.avg_throughput_avg_mbps + ${weights.throughput.peak} * gs.avg_throughput_peak_mbps)
          ) / NULLIF(SUM(
            (${protocolWeight}) * (${bandWeight}) * (${standardWeight})
          ), 0) AS composite_raw
        FROM (
          SELECT
            pr.id AS project_id,
            pr.customer AS brand,
            pr.project_type AS product_line,
            pr.project_name,
            p.wifi_mode,
            p.band,
            p.bandwidth_mhz,
            p.protocol,
            AVG(COALESCE(p.throughput_avg_mbps, kv.throughput_mbps)) AS avg_throughput_avg_mbps,
            AVG(COALESCE(p.throughput_peak_mbps, p.throughput_avg_mbps, kv.throughput_mbps)) AS avg_throughput_peak_mbps
          FROM performance p
          INNER JOIN test_report tr ON tr.id = p.test_report_id
          INNER JOIN project pr ON pr.id = tr.project_id
          LEFT JOIN dut d ON d.test_report_id = tr.id
          LEFT JOIN (
            SELECT test_report_id, AVG(metric_value) AS throughput_mbps
            FROM perf_metric_kv
            WHERE metric_name = 'throughput'
            GROUP BY test_report_id
          ) kv ON kv.test_report_id = p.test_report_id
          WHERE ${whereClause}
          GROUP BY
            pr.id,
            pr.customer,
            pr.project_type,
            pr.project_name,
            p.wifi_mode,
            p.band,
            p.bandwidth_mhz,
            p.protocol
        ) gs
        GROUP BY
          gs.project_id,
          gs.brand,
          gs.product_line,
          gs.project_name
      ) ranked
    ) mx
    ORDER BY score DESC, last_updated_at DESC
    LIMIT ?
  `

  return {
    scenario,
    metric: 'composite_score',
    scoring: scenario?.scoring ?? null,
    sql,
    params: [...params, ...params, limit]
  }
}
