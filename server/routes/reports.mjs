import { Router } from 'express'
import pool from '../db.mjs'
import { buildScenarioProjectLeaderboardQuery } from '../services/leaderboard-queries.mjs'
import { normalizeFilters } from '../utils/filter-utils.mjs'

const router = Router()

const DEFAULT_LIMIT = Number.parseInt(process.env.API_REPORTS_DEFAULT_LIMIT ?? '10', 10)
const MAX_LIMIT = Number.parseInt(process.env.API_REPORTS_MAX_LIMIT ?? '50', 10)
const SCORE_QUERY_LIMIT = Number.parseInt(process.env.API_REPORTS_SCORE_LIMIT ?? '500', 10)

const toIso = value => (value ? new Date(value).toISOString() : null)

const clampLimit = raw => {
  const parsed = Number.parseInt(`${raw ?? ''}`, 10)
  if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, MAX_LIMIT)
  return Math.min(DEFAULT_LIMIT, MAX_LIMIT)
}

const reportFromSql = `
  FROM performance p
  INNER JOIN execution ex ON ex.id = p.execution_id
  INNER JOIN test_report tr ON tr.id = ex.test_report_id
  INNER JOIN project pr ON pr.id = tr.project_id
  INNER JOIN dut d ON d.id = ex.dut_id
`

const reportSelectSql = `
  SELECT
    p.execution_id AS report_id,
    p.data_type,
    MAX(p.csv_name) AS csv_name,
    MAX(tr.case_path) AS case_path,
    MAX(tr.report_name) AS report_name,
    MAX(COALESCE(tr.updated_at, tr.created_at, ex.updated_at, ex.created_at, p.created_at)) AS last_updated_at,
    pr.id AS project_id,
    pr.brand,
    pr.product_line,
    pr.project_name,
    pr.main_chip,
    pr.wifi_module,
    pr.interface,
    pr.ecosystem,
    COALESCE(d.mass_production_status, pr.mass_production_status) AS mass_production_status,
    d.id AS dut_id,
    d.serial_number AS dut_serial_number,
    d.connect_type AS dut_connect_type,
    d.software_version AS dut_software_version,
    d.adb_device AS dut_adb_device,
    d.telnet_ip AS dut_telnet_ip
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
    d.mass_production_status,
    pr.mass_production_status,
    d.id,
    d.serial_number,
    d.connect_type,
    d.software_version,
    d.adb_device,
    d.telnet_ip
`

const toScoreKey = (projectId, dataType) => `${projectId}|${dataType}`

const buildScoreMap = async (connection, rows) => {
  const scoreMap = new Map()
  const dataTypes = [...new Set(rows.map(row => `${row.data_type ?? ''}`.trim()).filter(Boolean))]
  if (dataTypes.length === 0) return scoreMap

  for (const dataType of dataTypes) {
    const filters = normalizeFilters({ data_type: dataType })
    const { sql, params } = buildScenarioProjectLeaderboardQuery({
      scenarioKey: 'performance',
      filters,
      limit: SCORE_QUERY_LIMIT
    })
    const [scoreRows] = await connection.query(sql, params)
    for (const row of scoreRows ?? []) {
      if (!Number.isFinite(Number(row.project_id))) continue
      scoreMap.set(toScoreKey(Number(row.project_id), dataType), row.score !== null ? Number(row.score) : null)
    }
  }

  return scoreMap
}

const mapReportRow = (row, scoreMap) => {
  const projectId = row.project_id ? Number(row.project_id) : null
  const dataType = row.data_type ?? null
  const scoreKey = projectId !== null && dataType ? toScoreKey(projectId, dataType) : null

  return {
    reportId: Number(row.report_id),
    score: scoreKey ? (scoreMap.get(scoreKey) ?? null) : null,
    dataType,
    csvName: row.csv_name ?? null,
    reportName: row.report_name ?? null,
    casePath: row.case_path ?? null,
    lastUpdatedAt: toIso(row.last_updated_at),
    project: projectId
      ? {
          projectId,
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
          serialNumber: row.dut_serial_number ?? null,
          connectType: row.dut_connect_type ?? null,
          softwareVersion: row.dut_software_version ?? null,
          adbDevice: row.dut_adb_device ?? null,
          telnetIp: row.dut_telnet_ip ?? null
        }
      : null
  }
}

router.get('/recent', async (req, res, next) => {
  const limit = clampLimit(req.query.limit)

  try {
    const connection = await pool.getConnection()
    try {
      const [rows] = await connection.query(
        `
          WITH base AS (
            SELECT
              p.execution_id AS report_id,
              p.data_type,
              MAX(p.csv_name) AS csv_name,
              MAX(tr.case_path) AS case_path,
              MAX(tr.report_name) AS report_name,
              MAX(COALESCE(tr.updated_at, tr.created_at, ex.updated_at, ex.created_at, p.created_at)) AS last_updated_at,
              tr.id AS test_report_id,
              pr.id AS project_id,
              pr.brand,
              pr.product_line,
              pr.project_name,
              pr.main_chip,
              pr.wifi_module,
              pr.interface,
              pr.ecosystem,
              COALESCE(d.mass_production_status, pr.mass_production_status) AS mass_production_status,
              d.id AS dut_id,
              d.serial_number AS dut_serial_number,
              d.connect_type AS dut_connect_type,
              d.software_version AS dut_software_version,
              d.adb_device AS dut_adb_device,
              d.telnet_ip AS dut_telnet_ip
            ${reportFromSql}
            GROUP BY
              p.execution_id,
              p.data_type,
              tr.id,
              pr.id,
              pr.brand,
              pr.product_line,
              pr.project_name,
              pr.main_chip,
              pr.wifi_module,
              pr.interface,
              pr.ecosystem,
              d.mass_production_status,
              pr.mass_production_status,
              d.id,
              d.serial_number,
              d.connect_type,
              d.software_version,
              d.adb_device,
              d.telnet_ip
          ),
          ranked AS (
            SELECT
              *,
              ROW_NUMBER() OVER (
                PARTITION BY test_report_id, data_type
                ORDER BY last_updated_at DESC, report_id DESC
              ) AS rn
            FROM base
          )
          SELECT
            report_id,
            data_type,
            csv_name,
            case_path,
            report_name,
            last_updated_at,
            project_id,
            brand,
            product_line,
            project_name,
            main_chip,
            wifi_module,
            interface,
            ecosystem,
            mass_production_status,
            dut_id,
            dut_serial_number,
            dut_connect_type,
            dut_software_version,
            dut_adb_device,
            dut_telnet_ip
          FROM ranked
          WHERE rn = 1
          ORDER BY last_updated_at DESC, report_id DESC
          LIMIT ?
        `,
        [limit]
      )
      const scoreMap = await buildScoreMap(connection, rows ?? [])

      res.json({
        limit,
        rows: (rows ?? []).map(row => mapReportRow(row, scoreMap))
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
  const project = typeof req.query.project === 'string' ? req.query.project.trim() : ''
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
          conditions.push('(p.execution_id = ? OR p.csv_name LIKE ? OR p.data_type LIKE ? OR tr.report_name LIKE ?)')
          params.push(numericId, `%${q}%`, `%${q}%`, `%${q}%`)
        } else {
          conditions.push('(p.csv_name LIKE ? OR p.data_type LIKE ? OR tr.report_name LIKE ?)')
          params.push(`%${q}%`, `%${q}%`, `%${q}%`)
        }
      }

      if (project) {
        conditions.push('pr.project_name = ?')
        params.push(project)
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
        conditions.push('COALESCE(d.mass_production_status, pr.mass_production_status) = ?')
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
      const scoreMap = await buildScoreMap(connection, rows ?? [])

      res.json({
        q,
        project,
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
        rows: (rows ?? []).map(row => mapReportRow(row, scoreMap))
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
      const scoreMap = await buildScoreMap(connection, rows ?? [])

      res.json({
        rows: ids
          .flatMap(id => {
            const matches = (rows ?? []).filter(row => Number(row.report_id) === id)
            return matches.map(row => mapReportRow(row, scoreMap))
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
      const scoreMap = await buildScoreMap(connection, [row])

      res.json(mapReportRow(row, scoreMap))
    } finally {
      connection.release()
    }
  } catch (error) {
    next(error)
  }
})

export default router
