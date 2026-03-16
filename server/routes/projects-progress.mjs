import { Router } from 'express'
import pool from '../db.mjs'

const router = Router()

const CATEGORY_DEFS = [
  {
    key: 'performance',
    label: 'Performance',
    matchSql: `p.execution_id IS NOT NULL OR LOWER(ex.csv_name) LIKE '%perf%' OR LOWER(tr.report_name) LIKE '%perf%' OR LOWER(ex.csv_name) LIKE '%throughput%' OR LOWER(tr.report_name) LIKE '%throughput%'`
  },
  {
    key: 'function',
    label: 'Function',
    matchSql: `LOWER(ex.csv_name) LIKE '%func%' OR LOWER(tr.report_name) LIKE '%func%' OR LOWER(ex.csv_name) LIKE '%function%' OR LOWER(tr.report_name) LIKE '%function%'`
  },
  {
    key: 'stress',
    label: 'Stress',
    matchSql: `LOWER(ex.csv_name) LIKE '%stress%' OR LOWER(tr.report_name) LIKE '%stress%' OR LOWER(ex.csv_name) LIKE '%load%' OR LOWER(tr.report_name) LIKE '%load%'`
  },
  {
    key: 'ota',
    label: 'OTA',
    matchSql: `LOWER(ex.csv_name) LIKE '%ota%' OR LOWER(tr.report_name) LIKE '%ota%'`
  },
  {
    key: 'furniture',
    label: 'Furniture',
    matchSql: `LOWER(ex.csv_name) LIKE '%furniture%' OR LOWER(tr.report_name) LIKE '%furniture%'`
  }
]

router.get('/progress', async (req, res, next) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '100', 10) || 100, 1), 500)

  try {
    const connection = await pool.getConnection()
    try {
      const categoryColumns = CATEGORY_DEFS.map(def => `MAX(CASE WHEN ${def.matchSql} THEN 1 ELSE 0 END) AS has_${def.key}`)
        .join(',\n          ')

      const sql = `
        SELECT
          pr.project_name AS project,
          MAX(ex.id) AS last_run_id,
          MAX(d.mass_production_status) AS lifecycle_phase,
          ${categoryColumns}
        FROM execution ex
        INNER JOIN dut d ON d.id = ex.dut_id
        LEFT JOIN test_report tr ON tr.id = ex.test_report_id
        LEFT JOIN project pr ON pr.id = tr.project_id
        LEFT JOIN performance p ON p.execution_id = ex.id
        WHERE pr.project_name IS NOT NULL AND pr.project_name <> ''
        GROUP BY pr.project_name
        ORDER BY last_run_id DESC
        LIMIT ?
      `

      const [rows] = await connection.query(sql, [limit])
      const normalized = (rows ?? []).map(row => {
        const items = CATEGORY_DEFS.map(def => ({
          key: def.key,
          label: def.label,
          done: Number(row?.[`has_${def.key}`] ?? 0) === 1
        }))
        const doneCount = items.filter(item => item.done).length
        return {
          project: row.project,
          lastRunId: Number(row.last_run_id ?? 0) || null,
          phase: row.lifecycle_phase ?? null,
          doneCount,
          totalCount: items.length,
          items
        }
      })

      res.json({ rows: normalized })
    } finally {
      connection.release()
    }
  } catch (error) {
    next(error)
  }
})

export default router
