#!/usr/bin/env node

import mysql from 'mysql2/promise'

const toNumber = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? 'localhost',
  port: toNumber(process.env.DB_PORT, 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '123456',
  database: process.env.DB_NAME ?? 'wifi_test',
  waitForConnections: true,
  connectionLimit: toNumber(process.env.DB_POOL_SIZE, 10),
  queueLimit: 0
})

export default pool
