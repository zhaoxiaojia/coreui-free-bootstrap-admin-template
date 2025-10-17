import { Router } from 'express'
import pool from '../db.mjs'
import { allowedDeviceOptions, buildPerformanceConditions, normalizeFilters } from '../utils/filter-utils.mjs'

const router = Router()

const isValidDate = value => value instanceof Date && !Number.isNaN(value.getTime())

const DEFAULT_LIMIT = Number.parseInt(process.env.API_DEFAULT_LIMIT ?? '1000', 10)
const MAX_LIMIT = Number.parseInt(process.env.API_MAX_LIMIT ?? '5000', 10)

router.get('/', async (req, res, next) => {
  const filters = normalizeFilters(req.query)

  if (filters.deviceValue && !filters.deviceColumn) {
    return res.status(400).json({
      error: 'deviceType must be adb_device or telnet_ip and used together with deviceValue'
    })
  }

  if (filters.deviceTypeRaw && !allowedDeviceOptions.includes(filters.deviceTypeRaw)) {
    return res.status(400).json({
      error: 'Unsupported deviceType. Allowed values: adb_device or telnet_ip'
    })
  }

  if (filters.startDate && !isValidDate(filters.startDate)) {
    return res.status(400).json({ error: 'The start date format is invalid' })
  }

  if (filters.endDate && !isValidDate(filters.endDate)) {
    return res.status(400).json({ error: 'The end date format is invalid' })
  }

  try {
    const connection = await pool.getConnection()
    try {
      const performanceFilter = buildPerformanceConditions(filters)
      const rawLimit = filters.limit ?? DEFAULT_LIMIT
      const appliedLimit = Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, MAX_LIMIT)
        : null
      const limitForQuery = appliedLimit ? appliedLimit + 1 : null

      let query = `
        SELECT
          p.path_loss_db,
          p.throughput_avg_mbps,
          p.created_at,
          p.test_report_id,
          p.band,
          p.bandwidth_mhz,
          p.standard,
          p.direction,
          p.center_freq_mhz,
          p.test_category,
          p.protocol,
          p.csv_name,
          tr.case_path,
          d.product_line,
          d.project,
          d.adb_device,
          d.telnet_ip
        FROM performance p
        INNER JOIN test_report tr ON tr.id = p.test_report_id
        INNER JOIN dut d ON d.id = tr.dut_id
      `
      if (performanceFilter.conditions.length > 0) {
        query += ` WHERE ${performanceFilter.conditions.join(' AND ')}`
      }

      query += `
        ORDER BY
          p.path_loss_db ASC,
          p.created_at ASC,
          p.id ASC
      `
      const params = [...performanceFilter.params]
      if (limitForQuery) {
        query += ' LIMIT ?'
        params.push(limitForQuery)
      }

      const [rows] = await connection.query(query, params)

      let truncated = false
      let effectiveRows = rows
      if (appliedLimit && rows.length > appliedLimit) {
        truncated = true
        effectiveRows = rows.slice(0, appliedLimit)
      }

      const data = effectiveRows.map(row => ({
        pathLossDb: row.path_loss_db !== null ? Number(row.path_loss_db) : null,
        throughputAvgMbps: row.throughput_avg_mbps !== null ? Number(row.throughput_avg_mbps) : null,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        testReportId: row.test_report_id ?? null,
        band: row.band ?? null,
        bandwidthMhz: row.bandwidth_mhz !== null ? Number(row.bandwidth_mhz) : null,
        standard: row.standard ?? null,
        direction: row.direction ?? null,
        centerFreqMhz: row.center_freq_mhz !== null ? Number(row.center_freq_mhz) : null,
        testCategory: row.test_category ?? null,
        protocol: row.protocol ?? null,
        csvName: row.csv_name ?? null,
        casePath: row.case_path ?? null,
        productLine: row.product_line ?? null,
        project: row.project ?? null,
        adbDevice: row.adb_device ?? null,
        telnetIp: row.telnet_ip ?? null
      }))

      let throughputSum = 0
      let throughputCount = 0
      let throughputMax = Number.NEGATIVE_INFINITY
      let throughputMin = Number.POSITIVE_INFINITY
      let minPathLoss = Number.POSITIVE_INFINITY
      let maxPathLoss = Number.NEGATIVE_INFINITY
      let latestCreatedAt = null

      for (const row of data) {
        if (row.throughputAvgMbps !== null) {
          throughputSum += row.throughputAvgMbps
          throughputCount += 1
          throughputMax = Math.max(throughputMax, row.throughputAvgMbps)
          throughputMin = Math.min(throughputMin, row.throughputAvgMbps)
        }

        if (row.pathLossDb !== null) {
          minPathLoss = Math.min(minPathLoss, row.pathLossDb)
          maxPathLoss = Math.max(maxPathLoss, row.pathLossDb)
        }

        if (row.createdAt) {
          const createdAtDate = new Date(row.createdAt)
          if (!latestCreatedAt || createdAtDate > latestCreatedAt) {
            latestCreatedAt = createdAtDate
          }
        }
      }

      const summary = {
        count: data.length,
        throughput: throughputCount > 0
          ? {
              average: throughputSum / throughputCount,
              max: throughputMax,
              min: throughputMin
            }
          : {
              average: null,
              max: null,
              min: null
            },
        pathLoss: Number.isFinite(minPathLoss) && Number.isFinite(maxPathLoss)
          ? {
              min: minPathLoss,
              max: maxPathLoss
            }
          : { min: null, max: null },
        lastUpdatedAt: latestCreatedAt ? latestCreatedAt.toISOString() : null
      }

      res.json({
        data,
        summary,
        filters: {
          productLine: filters.productLine,
          project: filters.project,
          standard: filters.standard,
          band: filters.band,
          bandwidthMhz: filters.bandwidthMhz,
          deviceType: filters.deviceColumn,
          deviceValue: filters.deviceValue,
          start: filters.startDate ? filters.startDate.toISOString() : null,
          end: filters.endDate ? filters.endDate.toISOString() : null
        },
        metadata: {
          requestedLimit: rawLimit ?? null,
          appliedLimit,
          totalReturned: data.length,
          truncated
        }
      })
    } finally {
      connection.release()
    }
  } catch (error) {
    next(error)
  }
})

export default router
