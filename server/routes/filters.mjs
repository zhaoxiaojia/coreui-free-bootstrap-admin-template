import { Router } from 'express'
import pool from '../db.mjs'
import {
  buildPerformanceConditions,
  buildTestReportConditions,
  normalizeFilters
} from '../utils/filter-utils.mjs'
import { createLogger } from '../utils/logger.mjs'

const router = Router()
const logger = createLogger({ name: 'api.filters' })

router.get('/', async (req, res, next) => {
  const filters = normalizeFilters(req.query)
  const testReportLimit = Math.min(Math.max(Number.parseInt(req.query.test_report_limit ?? '200', 10) || 200, 10), 1000)
  logger.info('filters_request_received', {
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
      startDate: filters.startDate?.toISOString?.() ?? null,
      endDate: filters.endDate?.toISOString?.() ?? null
    },
    testReportLimit
  })

  try {
    const connection = await pool.getConnection()
    try {
      logger.info('filters_connection_acquired', {})
      const [productLines] = await connection.query(
        'SELECT DISTINCT project_type FROM project WHERE project_type IS NOT NULL ORDER BY project_type'
      )

      const [wifiModules] = await connection.query(
        'SELECT DISTINCT wifi_module AS value FROM project WHERE wifi_module IS NOT NULL ORDER BY wifi_module'
      )

      const [interfaces] = await connection.query(
        'SELECT DISTINCT interface AS value FROM project WHERE interface IS NOT NULL ORDER BY interface'
      )

      const [brands] = await connection.query(
        'SELECT DISTINCT customer AS value FROM project WHERE customer IS NOT NULL ORDER BY customer'
      )

      const [mainChips] = await connection.query(
        'SELECT DISTINCT soc AS value FROM project WHERE soc IS NOT NULL ORDER BY soc'
      )

      const [ecosystems] = await connection.query(
        'SELECT DISTINCT ecosystem AS value FROM project WHERE ecosystem IS NOT NULL ORDER BY ecosystem'
      )

      const [reportTypes] = await connection.query(`
        SELECT COALESCE(NULLIF(TRIM(report_type), ''), '__NULL__') AS report_type, COUNT(*) AS count
        FROM test_report
        GROUP BY COALESCE(NULLIF(TRIM(report_type), ''), '__NULL__')
        ORDER BY count DESC, report_type ASC
      `)

      const [reportNameBuckets] = await connection.query(`
        SELECT
          CASE
            WHEN UPPER(COALESCE(report_name, csv_name, '')) LIKE 'RVR%' THEN 'RVR'
            WHEN UPPER(COALESCE(report_name, csv_name, '')) LIKE 'RVO%' THEN 'RVO'
            WHEN UPPER(COALESCE(report_name, csv_name, '')) LIKE 'PERFORMANCE%' THEN 'PEAK_THROUGHPUT'
            ELSE 'OTHER'
          END AS bucket,
          COUNT(*) AS count
        FROM test_report
        GROUP BY bucket
        ORDER BY bucket ASC
      `)

      const projectFilter = buildTestReportConditions(filters, { exclude: ['project'] })
      const projectJoinPerf = projectFilter.requiresPerformanceJoin
        ? 'INNER JOIN performance p ON p.test_report_id = tr.id'
        : ''
      let projectQuery = `
        SELECT DISTINCT pr.project_name AS value
        FROM project pr
        INNER JOIN test_report tr ON tr.project_id = pr.id
        LEFT JOIN dut d ON d.test_report_id = tr.id
        ${projectJoinPerf}
        WHERE pr.project_name IS NOT NULL
          AND pr.project_name <> ''
      `
      if (projectFilter.conditions.length > 0) {
        projectQuery += ` AND ${projectFilter.conditions.join(' AND ')}`
      }
      projectQuery += ' ORDER BY pr.project_name'
      logger.info('filters_project_query', {
        conditions: projectFilter.conditions,
        params: projectFilter.params,
        requiresPerformanceJoin: projectFilter.requiresPerformanceJoin
      })
      const [projects] = await connection.query(projectQuery, projectFilter.params)

      const standardFilter = buildPerformanceConditions(filters, { exclude: ['standard'], includeBase: false })
      let standardQuery = `
        SELECT DISTINCT p.wifi_mode AS value
        FROM performance p
        INNER JOIN test_report tr ON tr.id = p.test_report_id
        INNER JOIN project pr ON pr.id = tr.project_id
        LEFT JOIN dut d ON d.test_report_id = tr.id
        WHERE p.wifi_mode IS NOT NULL
      `
      if (standardFilter.conditions.length > 0) {
        standardQuery += ` AND ${standardFilter.conditions.join(' AND ')}`
      }
      standardQuery += ' ORDER BY p.wifi_mode'
      logger.info('filters_standard_query', {
        conditions: standardFilter.conditions,
        params: standardFilter.params
      })
      const [standards] = await connection.query(standardQuery, standardFilter.params)

      const testReportFilter = buildTestReportConditions(filters, { exclude: ['testReport'] })
      const reportJoinPerf = testReportFilter.requiresPerformanceJoin
        ? 'INNER JOIN performance p ON p.test_report_id = tr.id'
        : ''

      let testReportQuery = `
        SELECT t.value
        FROM (
          SELECT tr.csv_name AS value, MAX(tr.id) AS max_id
          FROM test_report tr
          INNER JOIN project pr ON pr.id = tr.project_id
          LEFT JOIN dut d ON d.test_report_id = tr.id
          ${reportJoinPerf}
          WHERE tr.csv_name IS NOT NULL
      `
      if (testReportFilter.conditions.length > 0) {
        testReportQuery += ` AND ${testReportFilter.conditions.join(' AND ')}`
      }
      testReportQuery += `
          GROUP BY tr.csv_name
          ORDER BY max_id DESC
          LIMIT ?
        ) t
        ORDER BY t.value
      `
      logger.info('filters_test_report_query', {
        conditions: testReportFilter.conditions,
        params: [...testReportFilter.params, testReportLimit],
        requiresPerformanceJoin: testReportFilter.requiresPerformanceJoin
      })
      const [testReports] = await connection.query(testReportQuery, [...testReportFilter.params, testReportLimit])

      let reportNameQuery = `
        SELECT t.value
        FROM (
          SELECT tr.report_name AS value, MAX(tr.id) AS max_id
          FROM test_report tr
          INNER JOIN project pr ON pr.id = tr.project_id
          LEFT JOIN dut d ON d.test_report_id = tr.id
          ${reportJoinPerf}
          WHERE tr.report_name IS NOT NULL
      `
      if (testReportFilter.conditions.length > 0) {
        reportNameQuery += ` AND ${testReportFilter.conditions.join(' AND ')}`
      }
      reportNameQuery += `
          GROUP BY tr.report_name
          ORDER BY max_id DESC
          LIMIT ?
        ) t
        ORDER BY t.value
      `
      const [reportNames] = await connection.query(reportNameQuery, [...testReportFilter.params, testReportLimit])

      logger.info('filters_query_result_counts', {
        productLines: productLines.length,
        wifiModules: wifiModules.length,
        interfaces: interfaces.length,
        brands: brands.length,
        mainChips: mainChips.length,
        ecosystems: ecosystems.length,
        projects: projects.length,
        standards: standards.length,
        testReports: testReports.length,
        reportNames: reportNames.length,
        sample: {
          productLines: productLines.slice(0, 5).map(row => row.project_type),
          projects: projects.slice(0, 5).map(row => row.value),
          standards: standards.slice(0, 5).map(row => row.value),
          testReports: testReports.slice(0, 5).map(row => row.value),
          reportNames: reportNames.slice(0, 5).map(row => row.value)
        },
        reportTypes: reportTypes.map(row => ({
          report_type: row.report_type,
          count: Number(row.count)
        })),
        reportNameBuckets: reportNameBuckets.map(row => ({
          bucket: row.bucket,
          count: Number(row.count)
        })),
        selectedReportFilters: {
          csvNames: filters.testReportCsvNames,
          reportNames: filters.reportNames
        }
      })

      res.json({
        productLines: productLines.map(row => row.project_type),
        brands: brands.map(row => row.value),
        mainChips: mainChips.map(row => row.value),
        ecosystems: ecosystems.map(row => row.value),
        massProductionStatuses: [],
        dutConnectTypes: [],
        wifiModules: wifiModules.map(row => row.value),
        interfaces: interfaces.map(row => row.value),
        projects: projects.map(row => row.value),
        projectOptions: projects.map(row => ({
          value: `${row.value}`,
          label: row.value
        })),
        standards: standards.map(row => row.value),
        testReports: testReports.map(row => row.value),
        reportNames: reportNames.map(row => row.value)
      })
    } finally {
      logger.info('filters_connection_release', {})
      connection.release()
    }
  } catch (error) {
    logger.error('filters_request_failed', {
      message: error?.message ?? String(error),
      code: error?.code ?? null,
      sqlState: error?.sqlState ?? null
    })
    next(error)
  }
})

export default router
