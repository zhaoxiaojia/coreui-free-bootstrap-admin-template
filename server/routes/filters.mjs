import { Router } from 'express'
import pool from '../db.mjs'
import {
  buildPerformanceConditions,
  buildTestReportConditions,
  normalizeFilters
} from '../utils/filter-utils.mjs'

const router = Router()

router.get('/', async (req, res, next) => {
  const filters = normalizeFilters(req.query)
  const testReportLimit = Math.min(Math.max(Number.parseInt(req.query.test_report_limit ?? '200', 10) || 200, 10), 1000)

  try {
    const connection = await pool.getConnection()
    try {
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

      const [massProductionStatuses] = await connection.query('SELECT NULL AS value WHERE 1 = 0')
      const [dutConnectTypes] = await connection.query('SELECT NULL AS value WHERE 1 = 0')

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

      res.json({
        productLines: productLines.map(row => row.project_type),
        brands: brands.map(row => row.value),
        mainChips: mainChips.map(row => row.value),
        ecosystems: ecosystems.map(row => row.value),
        massProductionStatuses: massProductionStatuses.map(row => row.value).filter(Boolean),
        dutConnectTypes: dutConnectTypes.map(row => row.value).filter(Boolean),
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
      connection.release()
    }
  } catch (error) {
    next(error)
  }
})

export default router
