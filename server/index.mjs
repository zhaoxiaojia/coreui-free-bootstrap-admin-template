#!/usr/bin/env node

import express from 'express'
import cors from 'cors'
import pool from './db.mjs'
import filtersRouter from './routes/filters.mjs'
import performanceRouter from './routes/performance.mjs'
import leaderboardRouter from './routes/leaderboard.mjs'
import leaderboardScenariosRouter from './routes/leaderboard-scenarios.mjs'

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

const port = Number.parseInt(process.env.API_PORT ?? process.env.PORT ?? '5000', 10)

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`)
})
