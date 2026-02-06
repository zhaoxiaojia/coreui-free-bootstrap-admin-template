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
    WHEN standard = '11n' THEN ${weights.standard['11n']}
    WHEN standard = '11ac' THEN ${weights.standard['11ac']}
    WHEN standard = '11ax' THEN ${weights.standard['11ax']}
    WHEN standard = '11be' THEN ${weights.standard['11be']}
    ELSE ${weights.standard.default}
  END
`

const theoreticalPhyRateSql = (weights, standardColumn = 'standard', bandwidthColumn = 'bandwidth_mhz') => {
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

  const perfFilter = buildPerformanceConditions(filters, { includeBase: false })
  const conditions = [...perfFilter.conditions]
  const params = [...perfFilter.params]

  // Base requirements for throughput-based composite scoring.
  conditions.push('p.throughput_avg_mbps IS NOT NULL')
  conditions.push('tr.is_golden = 1')

  // Scenario-specific filters (can be extended later).
  if (scenario?.filters?.pathLossMin !== undefined) {
    conditions.push('p.path_loss_db >= ?')
    params.push(scenario.filters.pathLossMin)
  }
  if (scenario?.filters?.pathLossMax !== undefined) {
    conditions.push('p.path_loss_db <= ?')
    params.push(scenario.filters.pathLossMax)
  }
  if (scenario?.filters?.rssiMax !== undefined) {
    conditions.push('p.rssi <= ?')
    params.push(scenario.filters.rssiMax)
  }

  // If the caller didn't specify a time range, keep the query fast and relevant by default.
  if (!filters.startDate && !filters.endDate) {
    const days = Number.isFinite(Number(scenario.defaultDays)) ? Number(scenario.defaultDays) : 180
    conditions.push(`p.created_at >= DATE_SUB(NOW(), INTERVAL ${Math.max(1, Math.trunc(days))} DAY)`)
  }

  const protocolWeight = protocolWeightSql(weights)
  const bandWeight = bandWeightSql(weights)
  const standardWeight = standardWeightSql(weights)
  const defaultEfficiency = protocolEfficiencySql(weights, 'p.protocol')
  const theoreticalPhyRate = theoreticalPhyRateSql(weights, 'p.standard', 'p.bandwidth_mhz')
  const p95 = Number(weights.theoreticalCeiling?.percentile ?? 0.95)
  const whereClause = conditions.length ? conditions.join(' AND ') : '1=1'

  const sql = `
    WITH efficiency_samples AS (
      SELECT
        p.protocol,
        (${theoreticalPhyRate}) AS theoretical_phy_rate_mbps,
        LEAST(
          1,
          GREATEST(0, (p.throughput_avg_mbps / NULLIF((${theoreticalPhyRate}), 0)))
        ) AS eff
      FROM performance p
      INNER JOIN execution e ON e.id = p.execution_id
      INNER JOIN test_report tr ON tr.id = e.test_report_id
      INNER JOIN project pr ON pr.id = tr.project_id
      WHERE ${whereClause}
        AND (${theoreticalPhyRate}) IS NOT NULL AND (${theoreticalPhyRate}) > 0
        AND p.throughput_avg_mbps IS NOT NULL
    ),
    eff_ranked AS (
      SELECT
        protocol,
        eff,
        ROW_NUMBER() OVER (PARTITION BY protocol ORDER BY eff) AS rn,
        COUNT(*) OVER (PARTITION BY protocol) AS cnt
      FROM efficiency_samples
      WHERE eff IS NOT NULL
    ),
    protocol_eff AS (
      SELECT
        protocol,
        eff AS eff_p95
      FROM eff_ranked
      WHERE rn = GREATEST(1, CEIL(${p95} * cnt))
    ),
    group_scores AS (
      SELECT
        pr.id AS project_id,
        pr.brand,
        pr.product_line,
        pr.project_name,
        NULL AS hardware_version,
        p.standard,
        p.band,
        p.bandwidth_mhz,
        p.protocol,
        AVG(p.throughput_avg_mbps) AS avg_throughput_avg_mbps,
        AVG(COALESCE(p.throughput_peak_mbps, p.throughput_avg_mbps)) AS avg_throughput_peak_mbps,
        MAX((${theoreticalPhyRate})) AS theoretical_phy_rate_mbps,
        COALESCE(MAX(pe.eff_p95), (${defaultEfficiency})) AS protocol_efficiency,
        COUNT(*) AS sample_count,
        MAX(p.created_at) AS last_updated_at
      FROM performance p
      INNER JOIN execution e ON e.id = p.execution_id
      INNER JOIN test_report tr ON tr.id = e.test_report_id
      INNER JOIN project pr ON pr.id = tr.project_id
      LEFT JOIN protocol_eff pe ON pe.protocol = p.protocol
      WHERE ${whereClause}
      GROUP BY
        pr.id,
        pr.brand,
        pr.product_line,
        pr.project_name,
        p.standard,
        p.band,
        p.bandwidth_mhz,
        p.protocol
    ),
    project_scores AS (
      SELECT
        project_id,
        brand,
        product_line,
        project_name,
        NULL AS hardware_version,
        SUM(
          (${protocolWeight}) * (${bandWeight}) * (${standardWeight}) *
          (${weights.throughput.avg} * avg_throughput_avg_mbps + ${weights.throughput.peak} * avg_throughput_peak_mbps)
        ) / NULLIF(SUM(
          (${protocolWeight}) * (${bandWeight}) * (${standardWeight})
        ), 0) AS composite_raw,
        SUM(
          (${protocolWeight}) * (${bandWeight}) * (${standardWeight}) *
          (theoretical_phy_rate_mbps * protocol_efficiency)
        ) / NULLIF(SUM(
          (${protocolWeight}) * (${bandWeight}) * (${standardWeight})
        ), 0) AS theoretical_ceiling_mbps,
        SUM(sample_count) AS sample_count,
        MAX(last_updated_at) AS last_updated_at
      FROM group_scores
      GROUP BY
        project_id,
        brand,
        product_line,
        project_name
    )
    SELECT
      project_id,
      brand,
      product_line,
      project_name,
      NULL AS hardware_version,
      sample_count,
      last_updated_at,
      ROUND(
        LEAST(
          1,
          GREATEST(
            0,
            COALESCE(
              (composite_raw / NULLIF(theoretical_ceiling_mbps, 0)),
              (composite_raw / NULLIF(MAX(composite_raw) OVER (), 0))
            )
          )
        ) *
        (${weights.sampleFactor.base} + ${weights.sampleFactor.extra} * LEAST(1, LOG10(sample_count + 1) / LOG10(${weights.sampleFactor.fullSamples} + 1))) *
        ${weights.scoreScale}
      ) AS score,
      composite_raw,
      theoretical_ceiling_mbps
    FROM project_scores
    ORDER BY score DESC, last_updated_at DESC
    LIMIT ?
  `

  return {
    scenario,
    metric: 'composite_score',
    scoring: scenario?.scoring ?? null,
    sql,
    // `whereClause` is used twice (efficiency + group scores), so duplicate filter params.
    params: [...params, ...params, limit]
  }
}
