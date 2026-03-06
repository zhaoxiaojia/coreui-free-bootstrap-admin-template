import { Router } from 'express'
import pool from '../db.mjs'

const router = Router()

const DEFAULT_LIMIT = Number.parseInt(process.env.API_REPORTS_DEFAULT_LIMIT ?? '10', 10)
const MAX_LIMIT = Number.parseInt(process.env.API_REPORTS_MAX_LIMIT ?? '50', 10)

const toIso = value => (value ? new Date(value).toISOString() : null)

const clampLimit = raw => {
  const parsed = Number.parseInt(`${raw ?? ''}`, 10)
  if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, MAX_LIMIT)
  return Math.min(DEFAULT_LIMIT, MAX_LIMIT)
}

const reportFromSql = `
  FROM performance p
  INNER JOIN test_run ex ON ex.id = p.execution_id
  INNER JOIN test_case tc ON tc.id = ex.test_case_id
  INNER JOIN project pr ON pr.id = tc.project_id
  INNER JOIN dut d ON d.id = ex.dut_id
`

const reportSelectSql = `
  SELECT
    p.execution_id AS report_id,
    p.data_type,
    MAX(p.csv_name) AS csv_name,
    MAX(tc.case_path) AS case_path,
    MAX(tc.report_name) AS report_name,
    MAX(p.created_at) AS last_updated_at,
    pr.id AS project_id,
    pr.brand,
    pr.product_line,
    pr.project_name,
    pr.main_chip,
    pr.wifi_module,
    pr.interface,
    pr.ecosystem,
    pr.mass_production_status,
    d.id AS dut_id,
    d.connect_type AS dut_connect_type,
    d.software_version AS dut_software_version,
    d.main_chip AS dut_main_chip,
    d.wifi_module AS dut_wifi_module,
    d.interface AS dut_interface
  ${reportFromSql}
`

const reportGroupBySql = `
  GROUP BY
    p.execution_id,
    p.data_type,
    pr.id,
    pr.brand,
    pr.product_line,
    pr.project_name,
    pr.main_chip,
    pr.wifi_module,
    pr.interface,
    pr.ecosystem,
    pr.mass_production_status,
    d.id,
    d.connect_type,
    d.software_version,
    d.main_chip,
    d.wifi_module,
    d.interface
`

const mapReportRow = row => ({
  reportId: Number(row.report_id),
  dataType: row.data_type ?? null,
  csvName: row.csv_name ?? null,
  reportName: row.report_name ?? null,
  casePath: row.case_path ?? null,
  lastUpdatedAt: toIso(row.last_updated_at),
  project: row.project_id
    ? {
        projectId: Number(row.project_id),
        brand: row.brand ?? null,
        productLine: row.product_line ?? null,
        projectName: row.project_name ?? null,
        mainChip: row.main_chip ?? null,
        wifiModule: row.wifi_module ?? null,
        interface: row.interface ?? null,
        ecosystem: row.ecosystem ?? null,
        massProductionStatus: row.mass_production_status ?? null
      }
    : null,
  dut: row.dut_id
    ? {
        dutId: Number(row.dut_id),
        connectType: row.dut_connect_type ?? null,
        softwareVersion: row.dut_software_version ?? null,
        mainChip: row.dut_main_chip ?? null,
        wifiModule: row.dut_wifi_module ?? null,
        interface: row.dut_interface ?? null
      }
    : null
})

router.get('/recent', async (req, res, next) => {
  const limit = clampLimit(req.query.limit)

  try {
    const connection = await pool.getConnection()
    try {
      const [rows] = await connection.query(
        `
          ${reportSelectSql}
          ${reportGroupBySql}
          ORDER BY last_updated_at DESC, report_id DESC
          LIMIT ?
        `,
        [limit]
      )

      res.json({
        limit,
        rows: rows.map(mapReportRow)
      })
    } finally {
      connection.release()
    }
  } catch (error) {
    next(error)
  }
})

router.get('/', async (req, res, next) => {
  const limit = clampLimit(req.query.limit)
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const numericId = q && /^\d+$/.test(q) ? Number.parseInt(q, 10) : null
  const projectId = req.query.project_id ?? req.query.projectId ?? null
  const dataType = typeof req.query.data_type === 'string' ? req.query.data_type.trim() : (typeof req.query.dataType === 'string' ? req.query.dataType.trim() : '')
  const brand = typeof req.query.brand === 'string' ? req.query.brand.trim() : ''
  const productLine = typeof req.query.product_line === 'string' ? req.query.product_line.trim() : (typeof req.query.productLine === 'string' ? req.query.productLine.trim() : '')
  const mainChip = typeof req.query.main_chip === 'string' ? req.query.main_chip.trim() : (typeof req.query.mainChip === 'string' ? req.query.mainChip.trim() : '')
  const wifiModule = typeof req.query.wifi_module === 'string' ? req.query.wifi_module.trim() : (typeof req.query.wifiModule === 'string' ? req.query.wifiModule.trim() : '')
  const iface = typeof req.query.interface === 'string' ? req.query.interface.trim() : ''
  const ecosystem = typeof req.query.ecosystem === 'string' ? req.query.ecosystem.trim() : ''
  const massProductionStatus = typeof req.query.mass_production_status === 'string'
    ? req.query.mass_production_status.trim()
    : (typeof req.query.massProductionStatus === 'string' ? req.query.massProductionStatus.trim() : '')
  const dutConnectType = typeof req.query.dut_connect_type === 'string'
    ? req.query.dut_connect_type.trim()
    : (typeof req.query.dutConnectType === 'string' ? req.query.dutConnectType.trim() : '')

  try {
    const connection = await pool.getConnection()
    try {
      const params = []
      const conditions = []

      if (q) {
        if (numericId !== null) {
          conditions.push('(p.execution_id = ? OR p.csv_name LIKE ? OR p.data_type LIKE ? OR tc.report_name LIKE ?)')
          params.push(numericId, `%${q}%`, `%${q}%`, `%${q}%`)
        } else {
          conditions.push('(p.csv_name LIKE ? OR p.data_type LIKE ? OR tc.report_name LIKE ?)')
          params.push(`%${q}%`, `%${q}%`, `%${q}%`)
        }
      }

      if (projectId !== null && projectId !== undefined && `${projectId}`.trim() !== '') {
        const parsedProjectId = Number.parseInt(`${projectId}`, 10)
        if (Number.isFinite(parsedProjectId)) {
          conditions.push('pr.id = ?')
          params.push(parsedProjectId)
        }
      }

      if (dataType) {
        conditions.push('p.data_type = ?')
        params.push(dataType)
      }

      if (brand) {
        conditions.push('pr.brand = ?')
        params.push(brand)
      }

      if (productLine) {
        conditions.push('pr.product_line = ?')
        params.push(productLine)
      }

      if (mainChip) {
        conditions.push('pr.main_chip = ?')
        params.push(mainChip)
      }

      if (wifiModule) {
        conditions.push('pr.wifi_module = ?')
        params.push(wifiModule)
      }

      if (iface) {
        conditions.push('pr.interface = ?')
        params.push(iface)
      }

      if (ecosystem) {
        conditions.push('pr.ecosystem = ?')
        params.push(ecosystem)
      }

      if (massProductionStatus) {
        conditions.push('pr.mass_production_status = ?')
        params.push(massProductionStatus)
      }

      if (dutConnectType) {
        conditions.push('d.connect_type = ?')
        params.push(dutConnectType)
      }

      const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const [rows] = await connection.query(
        `
          ${reportSelectSql}
          ${whereSql}
          ${reportGroupBySql}
          ORDER BY last_updated_at DESC, report_id DESC
          LIMIT ?
        `,
        [...params, limit]
      )

      res.json({
        q,
        projectId: projectId ? `${projectId}` : '',
        dataType,
        brand,
        productLine,
        mainChip,
        wifiModule,
        interface: iface,
        ecosystem,
        massProductionStatus,
        dutConnectType,
        limit,
        rows: rows.map(mapReportRow)
      })
    } finally {
      connection.release()
    }
  } catch (error) {
    next(error)
  }
})

router.get('/batch/by-ids', async (req, res, next) => {
  const raw = typeof req.query.ids === 'string' ? req.query.ids.trim() : ''
  const ids = raw
    .split(',')
    .map(value => Number.parseInt(value.trim(), 10))
    .filter(value => Number.isFinite(value) && value > 0)

  if (ids.length === 0) {
    res.json({ rows: [] })
    return
  }

  const placeholders = ids.map(() => '?').join(', ')

  try {
    const connection = await pool.getConnection()
    try {
      const [rows] = await connection.query(
        `
          ${reportSelectSql}
          WHERE p.execution_id IN (${placeholders})
          ${reportGroupBySql}
        `,
        ids
      )

      res.json({
        rows: ids
          .flatMap(id => {
            const matches = rows.filter(row => Number(row.report_id) === id)
            return matches.map(mapReportRow)
          })
      })
    } finally {
      connection.release()
    }
  } catch (error) {
    next(error)
  }
})

router.get('/types', async (req, res, next) => {
  try {
    const connection = await pool.getConnection()
    try {
      const [rows] = await connection.query(
        `
          SELECT DISTINCT p.data_type AS data_type
          FROM performance p
          WHERE p.data_type IS NOT NULL AND p.data_type <> ''
          ORDER BY p.data_type
        `
      )
      res.json({ rows: rows.map(row => ({ dataType: row.data_type })) })
    } finally {
      connection.release()
    }
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  const reportId = Number.parseInt(req.params.id, 10)
  const dataType = typeof req.query.data_type === 'string' ? req.query.data_type.trim() : (typeof req.query.dataType === 'string' ? req.query.dataType.trim() : '')

  try {
    const connection = await pool.getConnection()
    try {
      const params = [reportId]
      let whereSql = 'WHERE p.execution_id = ?'
      if (dataType) {
        whereSql += ' AND p.data_type = ?'
        params.push(dataType)
      }

      const [rows] = await connection.query(
        `
          ${reportSelectSql}
          ${whereSql}
          ${reportGroupBySql}
          ORDER BY last_updated_at DESC
          LIMIT 1
        `,
        params
      )

      const row = rows?.[0]
      if (!row) {
        res.status(404).json({ error: 'Not found' })
        return
      }

      res.json(mapReportRow(row))
    } finally {
      connection.release()
    }
  } catch (error) {
    next(error)
  }
})

export default router
