#!/usr/bin/env node

import mysql from 'mysql2/promise'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const loadEnvFile = filePath => {
  try {
    if (!fs.existsSync(filePath)) return
    const content = fs.readFileSync(filePath, 'utf8')
    content.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return

      const index = trimmed.indexOf('=')
      if (index <= 0) return

      const key = trimmed.slice(0, index).trim()
      const rawValue = trimmed.slice(index + 1).trim()
      if (!key || Object.hasOwn(process.env, key)) return

      const value = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
      process.env[key] = value
    })
  } catch {
    // Ignore .env parsing issues and fall back to process.env defaults.
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
;[
  path.join(process.cwd(), '.env.local'),
  path.join(process.cwd(), '.env'),
  path.join(__dirname, '.env.local'),
  path.join(__dirname, '.env')
].forEach(loadEnvFile)

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
