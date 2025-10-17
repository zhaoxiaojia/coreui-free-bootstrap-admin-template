import { Router } from 'express'
import pool from '../db.mjs'
import { allowedDeviceOptions, buildDutConditions, buildPerformanceConditions, normalizeFilters } from '../utils/filter-utils.mjs'

const router = Router()

router.get('/', async (req, res, next) => {
  const filters = normalizeFilters(req.query)

  try {
    const connection = await pool.getConnection()
    try {
      const [productLines] = await connection.query(
        'SELECT DISTINCT product_line FROM dut WHERE product_line IS NOT NULL ORDER BY product_line'
      )

      const projectFilter = buildDutConditions(filters, { exclude: ['project'] })
      let projectQuery = 'SELECT DISTINCT project FROM dut WHERE project IS NOT NULL'
      if (projectFilter.conditions.length > 0) {
        projectQuery += ` AND ${projectFilter.conditions.join(' AND ')}`
      }
      projectQuery += ' ORDER BY project'
      const [projects] = await connection.query(projectQuery, projectFilter.params)

      const deviceResults = {}
      for (const deviceColumn of allowedDeviceOptions) {
        const deviceFilter = buildDutConditions(filters, { exclude: ['device'] })
        let deviceQuery = `SELECT DISTINCT ${deviceColumn} AS value FROM dut WHERE ${deviceColumn} IS NOT NULL`
        if (deviceFilter.conditions.length > 0) {
          deviceQuery += ` AND ${deviceFilter.conditions.join(' AND ')}`
        }
        deviceQuery += ` ORDER BY ${deviceColumn}`
        const [rows] = await connection.query(deviceQuery, deviceFilter.params)
        deviceResults[deviceColumn] = rows.map(row => row.value)
      }

      const standardFilter = buildPerformanceConditions(filters, { exclude: ['standard'], includeBase: false })
      let standardQuery = `
        SELECT DISTINCT p.standard AS value
        FROM performance p
        INNER JOIN test_report tr ON tr.id = p.test_report_id
        INNER JOIN dut d ON d.id = tr.dut_id
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
        INNER JOIN test_report tr ON tr.id = p.test_report_id
        INNER JOIN dut d ON d.id = tr.dut_id
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
        INNER JOIN test_report tr ON tr.id = p.test_report_id
        INNER JOIN dut d ON d.id = tr.dut_id
        WHERE p.bandwidth_mhz IS NOT NULL
      `
      if (bandwidthFilter.conditions.length > 0) {
        bandwidthQuery += ` AND ${bandwidthFilter.conditions.join(' AND ')}`
      }
      bandwidthQuery += ' ORDER BY p.bandwidth_mhz'
      const [bandwidths] = await connection.query(bandwidthQuery, bandwidthFilter.params)

      res.json({
        productLines: productLines.map(row => row.product_line),
        projects: projects.map(row => row.project),
        devices: deviceResults,
        standards: standards.map(row => row.value),
        bands: bands.map(row => row.value),
        bandwidths: bandwidths.map(row => row.value)
      })
    } finally {
      connection.release()
    }
  } catch (error) {
    next(error)
  }
})

export default router
