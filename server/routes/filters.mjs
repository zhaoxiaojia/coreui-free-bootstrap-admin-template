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
        'SELECT DISTINCT mass_production_status AS value FROM project WHERE mass_production_status IS NOT NULL ORDER BY mass_production_status'
      )

      const [dutConnectTypes] = await connection.query(
        'SELECT DISTINCT connect_type AS value FROM dut WHERE connect_type IS NOT NULL ORDER BY connect_type'
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
        const deviceConditions = [`d.${deviceColumn} IS NOT NULL`]
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
          SELECT DISTINCT d.${deviceColumn} AS value
          FROM test_run ex
          INNER JOIN test_case tc ON tc.id = ex.test_case_id
          INNER JOIN project pr ON pr.id = tc.project_id
          INNER JOIN dut d ON d.id = ex.dut_id
          WHERE ${deviceConditions.join(' AND ')}
          ORDER BY d.${deviceColumn}
        `
        const [rows] = await connection.query(deviceQuery, deviceParams)
        deviceResults[deviceColumn] = rows.map(row => row.value)
      }

      const standardFilter = buildPerformanceConditions(filters, { exclude: ['standard'], includeBase: false })
      let standardQuery = `
        SELECT DISTINCT p.standard AS value
        FROM performance p
        INNER JOIN test_run ex ON ex.id = p.execution_id
        INNER JOIN test_case tc ON tc.id = ex.test_case_id
        INNER JOIN project pr ON pr.id = tc.project_id
        INNER JOIN dut d ON d.id = ex.dut_id
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
        INNER JOIN test_run ex ON ex.id = p.execution_id
        INNER JOIN test_case tc ON tc.id = ex.test_case_id
        INNER JOIN project pr ON pr.id = tc.project_id
        INNER JOIN dut d ON d.id = ex.dut_id
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
        INNER JOIN test_run ex ON ex.id = p.execution_id
        INNER JOIN test_case tc ON tc.id = ex.test_case_id
        INNER JOIN project pr ON pr.id = tc.project_id
        INNER JOIN dut d ON d.id = ex.dut_id
        WHERE p.bandwidth_mhz IS NOT NULL
      `
      if (bandwidthFilter.conditions.length > 0) {
        bandwidthQuery += ` AND ${bandwidthFilter.conditions.join(' AND ')}`
      }
      bandwidthQuery += ' ORDER BY p.bandwidth_mhz'
      const [bandwidths] = await connection.query(bandwidthQuery, bandwidthFilter.params)

      const testReportFilter = buildTestReportConditions(filters, { exclude: ['testReport'] })
      let testReportQuery = `
        SELECT DISTINCT ex.csv_name AS value
        FROM test_run ex
        INNER JOIN test_case tc ON tc.id = ex.test_case_id
        INNER JOIN project pr ON pr.id = tc.project_id
        INNER JOIN dut d ON d.id = ex.dut_id
      `
      if (testReportFilter.requiresPerformanceJoin) {
        testReportQuery += `
          INNER JOIN performance p ON p.execution_id = ex.id
        `
      }
      testReportQuery += `
        WHERE ex.csv_name IS NOT NULL
      `
      if (testReportFilter.conditions.length > 0) {
        testReportQuery += ` AND ${testReportFilter.conditions.join(' AND ')}`
      }
      testReportQuery += ' ORDER BY ex.csv_name'
      const [testReports] = await connection.query(testReportQuery, testReportFilter.params)

      let reportNameQuery = `
        SELECT DISTINCT tc.report_name AS value
        FROM test_case tc
        INNER JOIN project pr ON pr.id = tc.project_id
        INNER JOIN test_run ex ON ex.test_case_id = tc.id
        INNER JOIN dut d ON d.id = ex.dut_id
      `
      if (testReportFilter.requiresPerformanceJoin) {
        reportNameQuery += `
          INNER JOIN performance p ON p.execution_id = ex.id
        `
      }
      reportNameQuery += `
        WHERE tc.report_name IS NOT NULL
      `
      if (testReportFilter.conditions.length > 0) {
        reportNameQuery += ` AND ${testReportFilter.conditions.join(' AND ')}`
      }
      reportNameQuery += ' ORDER BY tc.report_name'
      const [reportNames] = await connection.query(reportNameQuery, testReportFilter.params)

      res.json({
        productLines: productLines.map(row => row.product_line),
        brands: brands.map(row => row.value),
        mainChips: mainChips.map(row => row.value),
        ecosystems: ecosystems.map(row => row.value),
        massProductionStatuses: massProductionStatuses.map(row => row.value),
        dutConnectTypes: dutConnectTypes.map(row => row.value),
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
