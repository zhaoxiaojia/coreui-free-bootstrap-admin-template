import { Router } from 'express'
import pool from '../db.mjs'
import { allowedDeviceOptions, buildPerformanceConditions, getCanonicalDataType, normalizeFilters } from '../utils/filter-utils.mjs'
import { createLogger } from '../utils/logger.mjs'

const router = Router()
const logger = createLogger({ name: 'api.performance' })

const isValidDate = value => value instanceof Date && !Number.isNaN(value.getTime())

const DEFAULT_LIMIT = Number.parseInt(process.env.API_DEFAULT_LIMIT ?? '1000', 10)
const MAX_LIMIT = Number.parseInt(process.env.API_MAX_LIMIT ?? '5000', 10)

router.get('/', async (req, res, next) => {
  const filters = normalizeFilters(req.query)
  const canonicalDataType = getCanonicalDataType(filters)
  logger.info('performance_request_received', {
    rawQuery: req.query ?? {},
    normalizedFilters: {
      productLine: filters.productLine,
      productLines: filters.productLines,
      project: filters.project,
      projects: filters.projects,
      testReportCsvName: filters.testReportCsvName,
      testReportCsvNames: filters.testReportCsvNames,
      standard: filters.standard,
      standards: filters.standards,
      dataType: filters.dataType,
      limit: filters.limit ?? null,
      startDate: filters.startDate?.toISOString?.() ?? null,
      endDate: filters.endDate?.toISOString?.() ?? null
    }
  })

  if (filters.deviceValue && !filters.deviceColumn) {
    return res.status(400).json({
      error: 'deviceType must be adb_device or ip and used together with deviceValue'
    })
  }

  if (filters.deviceTypeRaw && !allowedDeviceOptions.includes(filters.deviceTypeRaw)) {
    return res.status(400).json({
      error: 'Unsupported deviceType. Allowed values: adb_device or ip'
    })
  }

  if (filters.startDate && !isValidDate(filters.startDate)) {
    return res.status(400).json({ error: 'The start date format is invalid' })
  }

  if (filters.endDate && !isValidDate(filters.endDate)) {
    return res.status(400).json({ error: 'The end date format is invalid' })
  }

  try {
    const connection = await pool.getConnection()
    try {
      const performanceFilter = buildPerformanceConditions(filters)
      const rawLimit = filters.limit ?? DEFAULT_LIMIT
      const appliedLimit = Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, MAX_LIMIT)
        : null
      const limitForQuery = appliedLimit ? appliedLimit + 1 : null

      let query = `
        SELECT
          p.attenuation,
          COALESCE(p.throughput_avg_mbps, p.throughput_peak_mbps, kv.throughput_mbps) AS throughput_value_mbps,
          p.throughput_avg_mbps,
          p.throughput_peak_mbps,
          p.created_at,
          p.test_report_id,
          p.scenario_group_key,
          p.band,
          p.bandwidth_mhz,
          p.wifi_mode,
          p.direction,
          p.channel,
          p.angle,
          p.test_category,
          p.protocol,
          tr.csv_name,
          tr.report_type,
          tr.id AS test_report_id,
          tr.report_name,
          tr.case_path,
          tr.project_id,
          pr.customer,
          pr.project_type,
          pr.project_name,
          d.adb_device,
          d.ip
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
      `
      if (performanceFilter.conditions.length > 0) {
        query += ` WHERE ${performanceFilter.conditions.join(' AND ')}`
      }

      query += `
        ORDER BY
          p.attenuation ASC,
          p.created_at ASC,
          p.id ASC
      `
      const params = [...performanceFilter.params]
      if (limitForQuery) {
        query += ' LIMIT ?'
        params.push(limitForQuery)
      }

      logger.info('performance_query_built', {
        conditions: performanceFilter.conditions,
        params,
        appliedLimit,
        limitForQuery
      })

      const [rows] = await connection.query(query, params)
      logger.info('performance_query_rows', {
        rowCount: rows.length,
        sample: rows.slice(0, 3).map(row => ({
          project_name: row.project_name,
          report_name: row.report_name,
          csv_name: row.csv_name,
          report_type: row.report_type,
          wifi_mode: row.wifi_mode,
          attenuation: row.attenuation,
          angle: row.angle,
          throughput_avg_mbps: row.throughput_avg_mbps,
          created_at: row.created_at
        }))
      })

      if (rows.length === 0 && (canonicalDataType === 'RVO' || canonicalDataType === 'RVR')) {
        let diagnosticQuery = `
          SELECT
            COUNT(*) AS candidate_count,
            SUM(CASE WHEN p.angle IS NOT NULL THEN 1 ELSE 0 END) AS angle_present_count,
            SUM(CASE WHEN p.attenuation IS NOT NULL THEN 1 ELSE 0 END) AS attenuation_present_count,
            SUM(CASE WHEN COALESCE(p.throughput_avg_mbps, p.throughput_peak_mbps, kv.throughput_mbps) IS NOT NULL THEN 1 ELSE 0 END) AS throughput_present_count
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
        `
        const diagnosticFilter = buildPerformanceConditions(filters, { includeBase: false })
        if (diagnosticFilter.conditions.length > 0) {
          diagnosticQuery += ` WHERE ${diagnosticFilter.conditions.join(' AND ')}`
        }
        const [diagnosticRows] = await connection.query(diagnosticQuery, diagnosticFilter.params)
        logger.info('performance_zero_result_diagnostics', {
          canonicalDataType,
          conditionsWithoutBase: diagnosticFilter.conditions,
          paramsWithoutBase: diagnosticFilter.params,
          diagnostic: diagnosticRows?.[0] ?? null,
          selectedReportFilters: {
            csvNames: filters.testReportCsvNames,
            reportNames: filters.reportNames
          }
        })
      }

      let truncated = false
      let effectiveRows = rows
      if (appliedLimit && rows.length > appliedLimit) {
        truncated = true
        effectiveRows = rows.slice(0, appliedLimit)
      }

      const data = effectiveRows.map(row => ({
        pathLossDb: row.attenuation !== null ? Number(row.attenuation) : null,
        throughputAvgMbps: row.throughput_value_mbps !== null ? Number(row.throughput_value_mbps) : null,
        throughputSource: row.throughput_avg_mbps !== null
          ? 'throughput_avg_mbps'
          : row.throughput_peak_mbps !== null
            ? 'throughput_peak_mbps'
            : 'perf_metric_kv',
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        executionId: row.test_report_id ?? null,
        testReportId: row.test_report_id ?? null,
        scenarioGroupKey: row.scenario_group_key ?? null,
        band: row.band ?? null,
        bandwidthMhz: row.bandwidth_mhz !== null ? Number(row.bandwidth_mhz) : null,
        standard: row.wifi_mode ?? null,
        direction: row.direction ?? null,
        centerFreqMhz: row.channel !== null ? Number(row.channel) : null,
        angleDeg: row.angle !== null ? Number(row.angle) : null,
        testCategory: row.test_category ?? null,
        protocol: row.protocol ?? null,
        csvName: row.csv_name ?? null,
        dataType: row.report_type ?? null,
        reportName: row.report_name ?? null,
        casePath: row.case_path ?? null,
        projectId: row.project_id ?? null,
        brand: row.customer ?? null,
        productLine: row.project_type ?? null,
        project: row.project_name ?? null,
        adbDevice: row.adb_device ?? null,
        telnetIp: row.ip ?? null
      }))

      let throughputSum = 0
      let throughputCount = 0
      let throughputMax = Number.NEGATIVE_INFINITY
      let throughputMin = Number.POSITIVE_INFINITY
      let minPathLoss = Number.POSITIVE_INFINITY
      let maxPathLoss = Number.NEGATIVE_INFINITY
      let latestCreatedAt = null

      for (const row of data) {
        if (row.throughputAvgMbps !== null) {
          throughputSum += row.throughputAvgMbps
          throughputCount += 1
          throughputMax = Math.max(throughputMax, row.throughputAvgMbps)
          throughputMin = Math.min(throughputMin, row.throughputAvgMbps)
        }

        if (row.pathLossDb !== null) {
          minPathLoss = Math.min(minPathLoss, row.pathLossDb)
          maxPathLoss = Math.max(maxPathLoss, row.pathLossDb)
        }

        if (row.createdAt) {
          const createdAtDate = new Date(row.createdAt)
          if (!latestCreatedAt || createdAtDate > latestCreatedAt) {
            latestCreatedAt = createdAtDate
          }
        }
      }

      const summary = {
        count: data.length,
        throughput: throughputCount > 0
          ? {
              average: throughputSum / throughputCount,
              max: throughputMax,
              min: throughputMin
            }
          : {
              average: null,
              max: null,
              min: null
            },
        pathLoss: Number.isFinite(minPathLoss) && Number.isFinite(maxPathLoss)
          ? {
              min: minPathLoss,
              max: maxPathLoss
            }
          : { min: null, max: null },
        lastUpdatedAt: latestCreatedAt ? latestCreatedAt.toISOString() : null
      }

      res.json({
        data,
        summary,
        filters: {
          productLine: filters.productLine,
          productLines: filters.productLines,
          project: filters.project,
          projects: filters.projects,
          testReportCsvName: filters.testReportCsvName,
          testReportCsvNames: filters.testReportCsvNames,
          standard: filters.standard,
          standards: filters.standards,
          band: filters.band,
          bands: filters.bands,
          bandwidthMhz: filters.bandwidthMhz,
          bandwidthsMhz: filters.bandwidthsMhz,
          deviceType: filters.deviceColumn,
          deviceValue: filters.deviceValue,
          deviceValues: filters.deviceValues,
          start: filters.startDate ? filters.startDate.toISOString() : null,
          end: filters.endDate ? filters.endDate.toISOString() : null
        },
        metadata: {
          requestedLimit: rawLimit ?? null,
          appliedLimit,
          totalReturned: data.length,
          truncated
        }
      })
    } finally {
      logger.info('performance_connection_release', {})
      connection.release()
    }
  } catch (error) {
    logger.error('performance_request_failed', {
      message: error?.message ?? String(error),
      code: error?.code ?? null,
      sqlState: error?.sqlState ?? null
    })
    next(error)
  }
})

export default router
