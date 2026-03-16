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
        'SELECT DISTINCT product_line FROM project WHERE product_line IS NOT NULL ORDER BY product_line'
      )

      const [wifiModules] = await connection.query(
        'SELECT DISTINCT wifi_module AS value FROM project WHERE wifi_module IS NOT NULL ORDER BY wifi_module'
      )

      const [interfaces] = await connection.query(
        'SELECT DISTINCT interface AS value FROM project WHERE interface IS NOT NULL ORDER BY interface'
      )

      const [brands] = await connection.query(
        'SELECT DISTINCT brand AS value FROM project WHERE brand IS NOT NULL ORDER BY brand'
      )

      const [mainChips] = await connection.query(
        'SELECT DISTINCT main_chip AS value FROM project WHERE main_chip IS NOT NULL ORDER BY main_chip'
      )

      const [ecosystems] = await connection.query(
        'SELECT DISTINCT ecosystem AS value FROM project WHERE ecosystem IS NOT NULL ORDER BY ecosystem'
      )

      const [massProductionStatuses] = await connection.query(
        `SELECT DISTINCT mass_production_status AS value
         FROM dut
         WHERE mass_production_status IS NOT NULL
         ORDER BY value`
      )

      const [dutConnectTypes] = await connection.query(
        'SELECT DISTINCT connect_type AS value FROM dut WHERE connect_type IS NOT NULL ORDER BY connect_type'
      )

      const projectFilter = buildTestReportConditions(filters, { exclude: ['project'] })
      const projectJoinPerf = projectFilter.requiresPerformanceJoin
        ? 'INNER JOIN performance p ON p.execution_id = ex.id'
        : ''
      let projectQuery = `
        SELECT DISTINCT pr.project_name AS value
        FROM project pr
        INNER JOIN test_report tr ON tr.project_id = pr.id
        INNER JOIN execution ex ON ex.test_report_id = tr.id
        INNER JOIN dut d ON d.id = ex.dut_id
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
        SELECT DISTINCT p.standard AS value
        FROM performance p
        INNER JOIN execution ex ON ex.id = p.execution_id
        INNER JOIN test_report tr ON tr.id = ex.test_report_id
        INNER JOIN project pr ON pr.id = tr.project_id
        INNER JOIN dut d ON d.id = ex.dut_id
        WHERE p.standard IS NOT NULL
      `
      if (standardFilter.conditions.length > 0) {
        standardQuery += ` AND ${standardFilter.conditions.join(' AND ')}`
      }
      standardQuery += ' ORDER BY p.standard'
      const [standards] = await connection.query(standardQuery, standardFilter.params)

      const testReportFilter = buildTestReportConditions(filters, { exclude: ['testReport'] })
      const reportJoinPerf = testReportFilter.requiresPerformanceJoin
        ? `INNER JOIN performance p ON p.execution_id = ex.id`
        : ''

      let testReportQuery = `
        SELECT t.value
        FROM (
          SELECT ex.csv_name AS value, MAX(ex.id) AS max_id
          FROM execution ex
          INNER JOIN test_report tr ON tr.id = ex.test_report_id
          INNER JOIN project pr ON pr.id = tr.project_id
          INNER JOIN dut d ON d.id = ex.dut_id
          ${reportJoinPerf}
          WHERE ex.csv_name IS NOT NULL
      `
      if (testReportFilter.conditions.length > 0) {
        testReportQuery += ` AND ${testReportFilter.conditions.join(' AND ')}`
      }
      testReportQuery += `
          GROUP BY ex.csv_name
          ORDER BY max_id DESC
          LIMIT ?
        ) t
        ORDER BY t.value
      `
      const [testReports] = await connection.query(testReportQuery, [...testReportFilter.params, testReportLimit])

      let reportNameQuery = `
        SELECT t.value
        FROM (
          SELECT tr.report_name AS value, MAX(ex.id) AS max_id
          FROM test_report tr
          INNER JOIN project pr ON pr.id = tr.project_id
          INNER JOIN execution ex ON ex.test_report_id = tr.id
          INNER JOIN dut d ON d.id = ex.dut_id
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
        productLines: productLines.map(row => row.product_line),
        brands: brands.map(row => row.value),
        mainChips: mainChips.map(row => row.value),
        ecosystems: ecosystems.map(row => row.value),
        massProductionStatuses: massProductionStatuses.map(row => row.value),
        dutConnectTypes: dutConnectTypes.map(row => row.value),
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
