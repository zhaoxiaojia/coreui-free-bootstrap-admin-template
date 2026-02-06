import { Router } from 'express'
import pool from '../db.mjs'
import {
  allowedDeviceOptions,
  buildPerformanceConditions,
  buildTestReportConditions,
  normalizeFilters
} from '../utils/filter-utils.mjs'

const router = Router()

router.get('/', async (req, res, next) => {
  const filters = normalizeFilters(req.query)

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

      const projectParams = []
      const projectConditions = ['pr.project_name IS NOT NULL']
      if (filters.productLines.length > 0) {
        const placeholders = filters.productLines.map(() => '?').join(', ')
        projectConditions.push(`pr.product_line IN (${placeholders})`)
        projectParams.push(...filters.productLines)
      }
      let projectQuery = `
        SELECT DISTINCT
          pr.id,
          pr.brand,
          pr.product_line,
          pr.project_name
        FROM project pr
        WHERE ${projectConditions.join(' AND ')}
        ORDER BY pr.project_name
      `
      const [projects] = await connection.query(projectQuery, projectParams)

      const deviceResults = {}
      for (const deviceColumn of allowedDeviceOptions) {
        const deviceParams = []
        const deviceConditions = [`e.${deviceColumn} IS NOT NULL`]
        if (filters.productLines.length > 0) {
          const placeholders = filters.productLines.map(() => '?').join(', ')
          deviceConditions.push(`pr.product_line IN (${placeholders})`)
          deviceParams.push(...filters.productLines)
        }
        if (filters.projects.length > 0) {
          const placeholders = filters.projects.map(() => '?').join(', ')
          deviceConditions.push(`pr.project_name IN (${placeholders})`)
          deviceParams.push(...filters.projects)
        }

        let deviceQuery = `
          SELECT DISTINCT e.${deviceColumn} AS value
          FROM execution e
          INNER JOIN test_report tr ON tr.id = e.test_report_id
          INNER JOIN project pr ON pr.id = tr.project_id
          WHERE ${deviceConditions.join(' AND ')}
          ORDER BY e.${deviceColumn}
        `
        const [rows] = await connection.query(deviceQuery, deviceParams)
        deviceResults[deviceColumn] = rows.map(row => row.value)
      }

      const standardFilter = buildPerformanceConditions(filters, { exclude: ['standard'], includeBase: false })
      let standardQuery = `
        SELECT DISTINCT p.standard AS value
        FROM performance p
        INNER JOIN execution e ON e.id = p.execution_id
        INNER JOIN test_report tr ON tr.id = e.test_report_id
        INNER JOIN project pr ON pr.id = tr.project_id
        WHERE p.standard IS NOT NULL
      `
      if (standardFilter.conditions.length > 0) {
        standardQuery += ` AND ${standardFilter.conditions.join(' AND ')}`
      }
      standardQuery += ' ORDER BY p.standard'
      const [standards] = await connection.query(standardQuery, standardFilter.params)

      const bandFilter = buildPerformanceConditions(filters, { exclude: ['band'], includeBase: false })
      let bandQuery = `
        SELECT DISTINCT p.band AS value
        FROM performance p
        INNER JOIN execution e ON e.id = p.execution_id
        INNER JOIN test_report tr ON tr.id = e.test_report_id
        INNER JOIN project pr ON pr.id = tr.project_id
        WHERE p.band IS NOT NULL
      `
      if (bandFilter.conditions.length > 0) {
        bandQuery += ` AND ${bandFilter.conditions.join(' AND ')}`
      }
      bandQuery += ' ORDER BY p.band'
      const [bands] = await connection.query(bandQuery, bandFilter.params)

      const bandwidthFilter = buildPerformanceConditions(filters, { exclude: ['bandwidth'], includeBase: false })
      let bandwidthQuery = `
        SELECT DISTINCT p.bandwidth_mhz AS value
        FROM performance p
        INNER JOIN execution e ON e.id = p.execution_id
        INNER JOIN test_report tr ON tr.id = e.test_report_id
        INNER JOIN project pr ON pr.id = tr.project_id
        WHERE p.bandwidth_mhz IS NOT NULL
      `
      if (bandwidthFilter.conditions.length > 0) {
        bandwidthQuery += ` AND ${bandwidthFilter.conditions.join(' AND ')}`
      }
      bandwidthQuery += ' ORDER BY p.bandwidth_mhz'
      const [bandwidths] = await connection.query(bandwidthQuery, bandwidthFilter.params)

      const testReportFilter = buildTestReportConditions(filters, { exclude: ['testReport'] })
      let testReportQuery = `
        SELECT DISTINCT e.csv_name AS value
        FROM execution e
        INNER JOIN test_report tr ON tr.id = e.test_report_id
        INNER JOIN project pr ON pr.id = tr.project_id
      `
      if (testReportFilter.requiresPerformanceJoin) {
        testReportQuery += `
          INNER JOIN performance p ON p.execution_id = e.id
        `
      }
      testReportQuery += `
        WHERE e.csv_name IS NOT NULL
      `
      if (testReportFilter.conditions.length > 0) {
        testReportQuery += ` AND ${testReportFilter.conditions.join(' AND ')}`
      }
      testReportQuery += ' ORDER BY e.csv_name'
      const [testReports] = await connection.query(testReportQuery, testReportFilter.params)

      let reportNameQuery = `
        SELECT DISTINCT tr.report_name AS value
        FROM test_report tr
        INNER JOIN project pr ON pr.id = tr.project_id
        INNER JOIN execution e ON e.test_report_id = tr.id
      `
      if (testReportFilter.requiresPerformanceJoin) {
        reportNameQuery += `
          INNER JOIN performance p ON p.execution_id = e.id
        `
      }
      reportNameQuery += `
        WHERE tr.report_name IS NOT NULL
      `
      if (testReportFilter.conditions.length > 0) {
        reportNameQuery += ` AND ${testReportFilter.conditions.join(' AND ')}`
      }
      reportNameQuery += ' ORDER BY tr.report_name'
      const [reportNames] = await connection.query(reportNameQuery, testReportFilter.params)

      res.json({
        productLines: productLines.map(row => row.product_line),
        wifiModules: wifiModules.map(row => row.value),
        interfaces: interfaces.map(row => row.value),
        projects: projects.map(row => row.project_name),
        projectOptions: projects.map(row => ({
          value: `${row.id}`,
          label: row.project_name,
          id: row.id,
          brand: row.brand,
          productLine: row.product_line,
          projectName: row.project_name,
          wifiModule: row.wifi_module ?? null,
          interface: row.interface ?? null
        })),
        devices: deviceResults,
        standards: standards.map(row => row.value),
        bands: bands.map(row => row.value),
        bandwidths: bandwidths.map(row => row.value),
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
