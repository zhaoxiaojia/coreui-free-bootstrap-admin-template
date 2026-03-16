import fs from 'node:fs'
import path from 'node:path'

const toBoolean = value => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase())

const ensureDir = filePath => {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

const safeJson = data => {
  try {
    return JSON.stringify(data)
  } catch {
    return JSON.stringify({ message: 'Failed to serialize log payload.' })
  }
}

export const createLogger = ({
  name = 'app',
  logFile = process.env.LOG_FILE ?? '',
  consoleEnabled = toBoolean(process.env.LOG_CONSOLE ?? 'true')
} = {}) => {
  const fileEnabled = Boolean(logFile)
  const resolvedLogFile = fileEnabled ? path.resolve(logFile) : ''

  if (fileEnabled) {
    ensureDir(resolvedLogFile)
  }

  const writeLine = line => {
    if (consoleEnabled) {
      console.log(line)
    }
    if (fileEnabled) {
      fs.appendFile(resolvedLogFile, `${line}\n`, () => {})
    }
  }

  const log = (level, message, fields = {}) => {
    const line = safeJson({
      ts: new Date().toISOString(),
      level,
      name,
      message,
      ...fields
    })
    writeLine(line)
  }

  return {
    info: (message, fields) => log('info', message, fields),
    warn: (message, fields) => log('warn', message, fields),
    error: (message, fields) => log('error', message, fields)
  }
}

