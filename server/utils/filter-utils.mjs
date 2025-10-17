const trimOrNull = value => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

const parseNumber = value => {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const parsePositiveInteger = value => {
  const numberValue = parseNumber(value)
  if (numberValue === null) {
    return null
  }

  const intValue = Number.parseInt(numberValue, 10)
  return Number.isNaN(intValue) || intValue <= 0 ? null : intValue
}

const parseDate = value => {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const parseEndDate = value => {
  const date = parseDate(value)
  if (!date) {
    return null
  }

  date.setHours(23, 59, 59, 999)
  return date
}

const allowedDeviceColumns = new Set(['adb_device', 'telnet_ip'])

export const normalizeFilters = query => {
  const productLine = trimOrNull(query.product_line ?? query.productLine)
  const project = trimOrNull(query.project)
  const standard = trimOrNull(query.standard)
  const band = trimOrNull(query.band)
  const bandwidthMhz = parseNumber(query.bandwidth_mhz ?? query.bandwidthMhz)

  const requestedDeviceType = trimOrNull(query.deviceType ?? query.device_type)
  const deviceColumn = allowedDeviceColumns.has(requestedDeviceType) ? requestedDeviceType : null
  const deviceValue = trimOrNull(query.deviceValue ?? query.device_value)

  const startDate = parseDate(query.start ?? query.start_date ?? query.startDate)
  const endDate = parseEndDate(query.end ?? query.end_date ?? query.endDate)
  const limit = parsePositiveInteger(query.limit ?? query.max_points ?? query.maxPoints)

  return {
    productLine,
    project,
    standard,
    band,
    bandwidthMhz,
    deviceTypeRaw: requestedDeviceType,
    deviceColumn,
    deviceValue,
    startDate,
    endDate,
    limit
  }
}

export const buildDutConditions = (filters, { exclude = [] } = {}) => {
  const conditions = []
  const params = []

  if (!exclude.includes('productLine') && filters.productLine) {
    conditions.push('product_line = ?')
    params.push(filters.productLine)
  }

  if (!exclude.includes('project') && filters.project) {
    conditions.push('project = ?')
    params.push(filters.project)
  }

  if (!exclude.includes('device') && filters.deviceColumn && filters.deviceValue) {
    conditions.push(`${filters.deviceColumn} = ?`)
    params.push(filters.deviceValue)
  }

  return { conditions, params }
}

export const buildPerformanceConditions = (filters, { exclude = [], includeBase = true } = {}) => {
  const conditions = []
  const params = []

  if (includeBase) {
    conditions.push('p.path_loss_db IS NOT NULL')
    conditions.push('p.throughput_avg_mbps IS NOT NULL')
  }

  if (!exclude.includes('productLine') && filters.productLine) {
    conditions.push('d.product_line = ?')
    params.push(filters.productLine)
  }

  if (!exclude.includes('project') && filters.project) {
    conditions.push('d.project = ?')
    params.push(filters.project)
  }

  if (!exclude.includes('device') && filters.deviceColumn && filters.deviceValue) {
    conditions.push(`d.${filters.deviceColumn} = ?`)
    params.push(filters.deviceValue)
  }

  if (!exclude.includes('standard') && filters.standard) {
    conditions.push('p.standard = ?')
    params.push(filters.standard)
  }

  if (!exclude.includes('band') && filters.band) {
    conditions.push('p.band = ?')
    params.push(filters.band)
  }

  if (!exclude.includes('bandwidth') && filters.bandwidthMhz !== null) {
    conditions.push('p.bandwidth_mhz = ?')
    params.push(filters.bandwidthMhz)
  }

  if (!exclude.includes('startDate') && filters.startDate) {
    conditions.push('p.created_at >= ?')
    params.push(filters.startDate)
  }

  if (!exclude.includes('endDate') && filters.endDate) {
    conditions.push('p.created_at <= ?')
    params.push(filters.endDate)
  }

  return { conditions, params }
}

export const allowedDeviceOptions = [...allowedDeviceColumns]
