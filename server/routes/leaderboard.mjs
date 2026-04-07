import { Router } from 'express'
import pool from '../db.mjs'
import { buildPerformanceConditions, normalizeFilters } from '../utils/filter-utils.mjs'
import { buildScenarioProjectLeaderboardQuery } from '../services/leaderboard-queries.mjs'
import { getLeaderboardScenario } from '../services/leaderboard-scenarios.mjs'
import { createLogger } from '../utils/logger.mjs'

const router = Router()
const logger = createLogger({ name: 'api.leaderboard' })

const DEFAULT_LIMIT = Number.parseInt(process.env.API_LEADERBOARD_DEFAULT_LIMIT ?? '20', 10)
const MAX_LIMIT = Number.parseInt(process.env.API_LEADERBOARD_MAX_LIMIT ?? '100', 10)

const allowedMetrics = new Set([
  'throughput_avg_mbps',
  'throughput_peak_mbps',
  'target_throughput_mbps',
  'latency_ms',
  'packet_loss'
])

router.get('/', async (req, res, next) => {
  const filters = normalizeFilters(req.query)
  const metric = typeof req.query.metric === 'string' ? req.query.metric.trim() : ''
  const metricColumn = allowedMetrics.has(metric) ? metric : 'throughput_avg_mbps'
  const aggregate = typeof req.query.aggregate === 'string' ? req.query.aggregate.trim() : ''
  const scenarioKey = typeof req.query.scenario === 'string' ? req.query.scenario.trim() : ''

  const requestedLimit = Number.parseInt(`${req.query.limit ?? ''}`, 10)
  const appliedLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_LIMIT)
    : Math.min(DEFAULT_LIMIT, MAX_LIMIT)

  try {
    const connection = await pool.getConnection()
    try {
      const scenario = getLeaderboardScenario(scenarioKey)
      if (scenario) {
        const { sql, params, metric: resolvedMetric, scoring } = buildScenarioProjectLeaderboardQuery({
          scenarioKey,
          filters,
          limit: appliedLimit
        })
        const [rows] = await connection.query(sql, params)
        if (!rows || rows.length === 0) {
          logger.warn('leaderboard_empty', {
            scenario: scenarioKey,
            metric: resolvedMetric,
            limit: appliedLimit,
            filters
          })
        }

        res.json({
          scenario: scenario.key,
          metric: resolvedMetric,
          scoring,
          limit: appliedLimit,
          rows: rows.map(row => ({
            projectId: row.project_id,
            brand: row.brand,
            productLine: row.product_line,
            projectName: row.project_name,
            hardwareVersion: null,
            score: row.score !== null ? Number(row.score) : null,
            sampleCount: row.sample_count !== null ? Number(row.sample_count) : 0,
            lastUpdatedAt: row.last_updated_at ? new Date(row.last_updated_at).toISOString() : null,
            details: {
              compositeRaw: row.composite_raw !== null ? Number(row.composite_raw) : null,
              theoreticalCeilingMbps: row.theoretical_ceiling_mbps !== null ? Number(row.theoretical_ceiling_mbps) : null
            }
          }))
        })
        return
      }

      if (aggregate === 'project') {
        const { sql, params, metric: resolvedMetric, scoring } = buildScenarioProjectLeaderboardQuery({
          scenarioKey: 'performance',
          filters,
          limit: appliedLimit
        })
        const [rows] = await connection.query(sql, params)
        if (!rows || rows.length === 0) {
          logger.warn('leaderboard_empty', {
            scenario: 'performance',
            metric: resolvedMetric,
            limit: appliedLimit,
            filters
          })
        }

        res.json({
          scenario: 'performance',
          metric: resolvedMetric,
          scoring,
          limit: appliedLimit,
          rows: rows.map(row => ({
            projectId: row.project_id,
            brand: row.brand,
            productLine: row.product_line,
            projectName: row.project_name,
            hardwareVersion: null,
            score: row.score !== null ? Number(row.score) : null,
            sampleCount: row.sample_count !== null ? Number(row.sample_count) : 0,
            lastUpdatedAt: row.last_updated_at ? new Date(row.last_updated_at).toISOString() : null,
            details: {
              compositeRaw: row.composite_raw !== null ? Number(row.composite_raw) : null,
              theoreticalCeilingMbps: row.theoretical_ceiling_mbps !== null ? Number(row.theoretical_ceiling_mbps) : null
            }
          }))
        })
        return
      }

      const perfFilter = buildPerformanceConditions(filters, { includeBase: false })
      const conditions = [...perfFilter.conditions]
      const params = [...perfFilter.params]

      conditions.push(`p.${metricColumn} IS NOT NULL`)

      let query = `
        SELECT
          pr.id AS project_id,
          pr.customer AS brand,
          pr.project_type AS product_line,
          pr.project_name,
          p.wifi_mode AS standard,
          p.band,
          p.bandwidth_mhz,
          p.protocol,
          p.direction,
          AVG(p.${metricColumn}) AS score,
          COUNT(*) AS sample_count,
          MAX(p.created_at) AS last_updated_at
        FROM performance p
        INNER JOIN test_report tr ON tr.id = p.test_report_id
        INNER JOIN project pr ON pr.id = tr.project_id
        LEFT JOIN dut d ON d.test_report_id = tr.id
      `
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`
      }

      query += `
        GROUP BY
          pr.id,
          pr.customer,
          pr.project_type,
          pr.project_name,
          p.wifi_mode,
          p.band,
          p.bandwidth_mhz,
          p.protocol,
          p.direction
        ORDER BY
          score DESC,
          last_updated_at DESC
        LIMIT ?
      `
      params.push(appliedLimit)

      const [rows] = await connection.query(query, params)
      if (!rows || rows.length === 0) {
        logger.warn('leaderboard_empty', {
          scenario: 'raw',
          metric: metricColumn,
          limit: appliedLimit,
          filters
        })
      }

      res.json({
        metric: metricColumn,
        limit: appliedLimit,
        rows: rows.map(row => ({
          projectId: row.project_id,
          brand: row.brand,
          productLine: row.product_line,
          projectName: row.project_name,
          hardwareVersion: null,
          standard: row.standard,
          band: row.band,
          bandwidthMhz: row.bandwidth_mhz !== null ? Number(row.bandwidth_mhz) : null,
          protocol: row.protocol,
          direction: row.direction,
          score: row.score !== null ? Number(row.score) : null,
          sampleCount: row.sample_count !== null ? Number(row.sample_count) : 0,
          lastUpdatedAt: row.last_updated_at ? new Date(row.last_updated_at).toISOString() : null
        }))
      })
    } finally {
      connection.release()
    }
  } catch (error) {
    next(error)
  }
})

export default router
