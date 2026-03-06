#!/usr/bin/env node

import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from './db.mjs'
import filtersRouter from './routes/filters.mjs'
import performanceRouter from './routes/performance.mjs'
import leaderboardRouter from './routes/leaderboard.mjs'
import leaderboardScenariosRouter from './routes/leaderboard-scenarios.mjs'
import reportsRouter from './routes/reports.mjs'

const app = express()

app.use(cors())
app.use(express.json())

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok' })
  } catch (error) {
    console.error('Health check failed', error)
    res.status(500).json({ status: 'error', message: 'Database connection failed' })
  }
})

app.use('/api/filters', filtersRouter)
app.use('/api/performance', performanceRouter)
app.use('/api/leaderboard', leaderboardRouter)
app.use('/api/leaderboard-scenarios', leaderboardScenariosRouter)
app.use('/api/reports', reportsRouter)

const shouldServeStatic = ['1', 'true', 'yes', 'on'].includes(String(process.env.SERVE_STATIC ?? '').toLowerCase())
if (shouldServeStatic) {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const staticDir = process.env.STATIC_DIR
    ? path.resolve(process.env.STATIC_DIR)
    : path.resolve(__dirname, '..', 'dist')

  app.get('*', (req, res, next) => {
    if (req.method !== 'GET') return next()
    if (req.path.startsWith('/api/')) return next()
    if (path.posix.extname(req.path)) return next()

    const requestedPath = req.path === '/' ? '/index' : req.path
    const candidatePath = path.join(staticDir, `${requestedPath}.html`)

    if (!candidatePath.startsWith(staticDir)) return next()
    if (!fs.existsSync(candidatePath)) return next()

    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
    res.redirect(302, `${requestedPath}.html${qs}`)
  })

  app.use(express.static(staticDir))
}

app.use((err, req, res, next) => {
  console.error('API error', err)
  const includeDetails = (process.env.NODE_ENV ?? '').toLowerCase() !== 'production'
  res.status(500).json({
    error: 'Internal server error',
    ...(includeDetails
      ? {
          message: err?.message ?? String(err),
          code: err?.code ?? null,
          sqlState: err?.sqlState ?? null
        }
      : {})
  })
})

const defaultPort = shouldServeStatic ? '3000' : '5000'
const port = Number.parseInt(process.env.API_PORT ?? process.env.PORT ?? defaultPort, 10)

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
  if (shouldServeStatic) console.log('Static files served from dist/ (set STATIC_DIR to override)')
})
