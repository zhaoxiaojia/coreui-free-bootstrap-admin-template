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

const reportSelectSql = `
  SELECT
    tr.id AS report_id,
    tr.execution_id,
    tr.dut_id,
    tr.csv_name,
    tr.csv_path,
    tr.data_type,
    tr.case_path,
    tr.created_at,
    tr.updated_at,
    ex.case_path AS execution_case_path,
    d.connect_type AS dut_connect_type,
    d.software_version AS dut_software_version,
    d.main_chip AS dut_main_chip,
    d.wifi_module AS dut_wifi_module,
    d.interface AS dut_interface,
    pr.id AS project_id,
    pr.brand,
    pr.product_line,
    pr.project_name,
    pr.main_chip,
    pr.wifi_module,
    pr.interface,
    pr.ecosystem,
    pr.mass_production_status
  FROM test_report tr
  LEFT JOIN execution ex ON ex.id = tr.execution_id
  LEFT JOIN dut d ON d.id = tr.dut_id
  LEFT JOIN test_case tc ON tc.case_path = COALESCE(tr.case_path, ex.case_path)
  LEFT JOIN project pr ON pr.id = tc.project_id
`

const mapReportRow = row => ({
  reportId: Number(row.report_id),
  executionId: row.execution_id !== null ? Number(row.execution_id) : null,
  dutId: row.dut_id !== null ? Number(row.dut_id) : null,
  csvName: row.csv_name,
  csvPath: row.csv_path,
  dataType: row.data_type,
  casePath: row.case_path ?? row.execution_case_path ?? null,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
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
    : null
  ,
  dut: row.dut_connect_type || row.dut_software_version || row.dut_main_chip || row.dut_wifi_module || row.dut_interface
    ? {
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
          ORDER BY tr.created_at DESC, tr.id DESC
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
          conditions.push('(tr.id = ? OR tr.csv_name LIKE ? OR tr.data_type LIKE ?)')
          params.push(numericId, `%${q}%`, `%${q}%`)
        } else {
          conditions.push('(tr.csv_name LIKE ? OR tr.data_type LIKE ?)')
          params.push(`%${q}%`, `%${q}%`)
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
        conditions.push('tr.data_type = ?')
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
          ORDER BY tr.created_at DESC, tr.id DESC
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
          WHERE tr.id IN (${placeholders})
        `,
        ids
      )

      const rowById = new Map(rows.map(row => [Number(row.report_id), row]))
      res.json({
        rows: ids
          .map(id => rowById.get(id))
          .filter(Boolean)
          .map(mapReportRow)
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
          SELECT DISTINCT tr.data_type AS data_type
          FROM test_report tr
          WHERE tr.data_type IS NOT NULL AND tr.data_type <> ''
          ORDER BY tr.data_type
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

  try {
    const connection = await pool.getConnection()
    try {
      const [rows] = await connection.query(
        `
          ${reportSelectSql}
          WHERE tr.id = ?
          LIMIT 1
        `,
        [reportId]
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
