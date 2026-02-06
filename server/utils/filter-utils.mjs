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

const parsePositiveIntegerList = value => {
  return uniqueValues(
    flattenQueryValue(value)
      .map(item => parsePositiveInteger(item))
      .filter(item => item !== null)
  )
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

const flattenQueryValue = value => {
  if (Array.isArray(value)) {
    return value.flatMap(item => flattenQueryValue(item))
  }

  if (value === undefined || value === null) {
    return []
  }

  return [value]
}

const parseStringList = value => {
  return flattenQueryValue(value)
    .map(item => (typeof item === 'string' ? item : `${item ?? ''}`))
    .map(item => item.trim())
    .filter(item => item.length > 0)
}

const parseNumberList = value => {
  return flattenQueryValue(value)
    .map(item => Number(item))
    .filter(item => Number.isFinite(item))
}

const uniqueValues = values => {
  return [...new Set(values)]
}

const addConditionForValues = (conditions, params, column, values) => {
  const unique = uniqueValues(values ?? [])
  if (unique.length === 0) {
    return false
  }

  if (unique.length === 1) {
    conditions.push(`${column} = ?`)
    params.push(unique[0])
    return true
  }

  const placeholders = unique.map(() => '?').join(', ')
  conditions.push(`${column} IN (${placeholders})`)
  params.push(...unique)
  return true
}

export const normalizeFilters = query => {
  const productLines = uniqueValues(parseStringList(query.product_line ?? query.productLine))
  const projects = uniqueValues(parseStringList(query.project ?? query.project_name ?? query.projectName))
  const projectIds = parsePositiveIntegerList(query.project_id ?? query.projectId)
  const hardwareVersions = uniqueValues(parseStringList(query.hardware_version ?? query.hardwareVersion))
  const wifiModules = uniqueValues(parseStringList(query.wifi_module ?? query.wifiModule))
  const interfaces = uniqueValues(parseStringList(query.interface))
  const standards = uniqueValues(parseStringList(query.standard))
  const bands = uniqueValues(parseStringList(query.band))
  const bandwidthsMhz = uniqueValues(parseNumberList(query.bandwidth_mhz ?? query.bandwidthMhz))
  const dataTypes = uniqueValues(parseStringList(query.data_type ?? query.dataType))
  const testReportCsvNames = uniqueValues(
    parseStringList(
      query.test_report_csv_name ??
        query.testReportCsvName ??
        query.test_report ??
        query.testReport ??
        query.csv_name ??
        query.csvName
    )
  )
  const reportNames = uniqueValues(parseStringList(query.report_name ?? query.reportName))

  const requestedDeviceType = trimOrNull(query.deviceType ?? query.device_type)
  const deviceColumn = allowedDeviceColumns.has(requestedDeviceType) ? requestedDeviceType : null
  const deviceValues = uniqueValues(parseStringList(query.deviceValue ?? query.device_value))

  const startDate = parseDate(query.start ?? query.start_date ?? query.startDate)
  const endDate = parseEndDate(query.end ?? query.end_date ?? query.endDate)
  const limit = parsePositiveInteger(query.limit ?? query.max_points ?? query.maxPoints)

  const pathLossMin = parseNumber(query.path_loss_min ?? query.pathLossMin)
  const pathLossMax = parseNumber(query.path_loss_max ?? query.pathLossMax)
  const rssiMin = parseNumber(query.rssi_min ?? query.rssiMin)
  const rssiMax = parseNumber(query.rssi_max ?? query.rssiMax)

  return {
    productLines,
    projects,
    projectIds,
    hardwareVersions,
    wifiModules,
    interfaces,
    standards,
    bands,
    bandwidthsMhz,
    dataTypes,
    testReportCsvNames,
    reportNames,
    deviceValues,
    pathLossMin,
    pathLossMax,
    rssiMin,
    rssiMax,
    productLine: productLines[0] ?? null,
    project: projects[0] ?? null,
    projectId: projectIds[0] ?? null,
    hardwareVersion: hardwareVersions[0] ?? null,
    wifiModule: wifiModules[0] ?? null,
    interface: interfaces[0] ?? null,
    standard: standards[0] ?? null,
    band: bands[0] ?? null,
    bandwidthMhz: bandwidthsMhz[0] ?? null,
    dataType: dataTypes[0] ?? null,
    testReportCsvName: testReportCsvNames[0] ?? null,
    reportName: reportNames[0] ?? null,
    deviceTypeRaw: requestedDeviceType,
    deviceColumn,
    deviceValue: deviceValues[0] ?? null,
    startDate,
    endDate,
    limit
  }
}

export const buildDutConditions = (filters, { exclude = [] } = {}) => {
  const conditions = []
  const params = []

  if (!exclude.includes('productLine')) {
    addConditionForValues(conditions, params, 'product_line', filters.productLines)
  }

  if (!exclude.includes('project')) {
    addConditionForValues(conditions, params, 'project', filters.projects)
  }

  if (!exclude.includes('device') && filters.deviceColumn) {
    addConditionForValues(conditions, params, filters.deviceColumn, filters.deviceValues)
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

  if (!exclude.includes('productLine')) {
    addConditionForValues(conditions, params, 'pr.product_line', filters.productLines)
  }

  if (!exclude.includes('projectId')) {
    addConditionForValues(conditions, params, 'pr.id', filters.projectIds)
  }

  if (!exclude.includes('project')) {
    addConditionForValues(conditions, params, 'pr.project_name', filters.projects)
  }

  if (!exclude.includes('hardwareVersion')) {
    addConditionForValues(conditions, params, 'pr.hardware_version', filters.hardwareVersions)
  }

  if (!exclude.includes('wifiModule')) {
    addConditionForValues(conditions, params, 'pr.wifi_module', filters.wifiModules)
  }

  if (!exclude.includes('interface')) {
    addConditionForValues(conditions, params, 'pr.interface', filters.interfaces)
  }

  if (!exclude.includes('device') && filters.deviceColumn) {
    addConditionForValues(conditions, params, `e.${filters.deviceColumn}`, filters.deviceValues)
  }

  if (!exclude.includes('standard')) {
    addConditionForValues(conditions, params, 'p.standard', filters.standards)
  }

  if (!exclude.includes('band')) {
    addConditionForValues(conditions, params, 'p.band', filters.bands)
  }

  if (!exclude.includes('bandwidth')) {
    addConditionForValues(conditions, params, 'p.bandwidth_mhz', filters.bandwidthsMhz)
  }

  if (!exclude.includes('dataType')) {
    addConditionForValues(conditions, params, 'p.data_type', filters.dataTypes)
  }

  if (!exclude.includes('pathLoss') && filters.pathLossMin != null) {
    conditions.push('p.path_loss_db >= ?')
    params.push(filters.pathLossMin)
  }

  if (!exclude.includes('pathLoss') && filters.pathLossMax != null) {
    conditions.push('p.path_loss_db <= ?')
    params.push(filters.pathLossMax)
  }

  if (!exclude.includes('rssi') && filters.rssiMin != null) {
    conditions.push('p.rssi >= ?')
    params.push(filters.rssiMin)
  }

  if (!exclude.includes('rssi') && filters.rssiMax != null) {
    conditions.push('p.rssi <= ?')
    params.push(filters.rssiMax)
  }

  if (!exclude.includes('testReport')) {
    addConditionForValues(conditions, params, 'e.csv_name', filters.testReportCsvNames)
    addConditionForValues(conditions, params, 'tr.report_name', filters.reportNames)
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

export const buildTestReportConditions = (filters, { exclude = [] } = {}) => {
  const conditions = []
  const params = []
  let requiresPerformanceJoin = false

  if (!exclude.includes('productLine')) {
    addConditionForValues(conditions, params, 'pr.product_line', filters.productLines)
  }

  if (!exclude.includes('projectId')) {
    addConditionForValues(conditions, params, 'pr.id', filters.projectIds)
  }

  if (!exclude.includes('project')) {
    addConditionForValues(conditions, params, 'pr.project_name', filters.projects)
  }

  if (!exclude.includes('hardwareVersion')) {
    addConditionForValues(conditions, params, 'pr.hardware_version', filters.hardwareVersions)
  }

  if (!exclude.includes('wifiModule')) {
    addConditionForValues(conditions, params, 'pr.wifi_module', filters.wifiModules)
  }

  if (!exclude.includes('interface')) {
    addConditionForValues(conditions, params, 'pr.interface', filters.interfaces)
  }

  if (!exclude.includes('device') && filters.deviceColumn) {
    addConditionForValues(conditions, params, `e.${filters.deviceColumn}`, filters.deviceValues)
  }

  if (!exclude.includes('standard')) {
    if (addConditionForValues(conditions, params, 'p.standard', filters.standards)) {
      requiresPerformanceJoin = true
    }
  }

  if (!exclude.includes('band')) {
    if (addConditionForValues(conditions, params, 'p.band', filters.bands)) {
      requiresPerformanceJoin = true
    }
  }

  if (!exclude.includes('bandwidth')) {
    if (addConditionForValues(conditions, params, 'p.bandwidth_mhz', filters.bandwidthsMhz)) {
      requiresPerformanceJoin = true
    }
  }

  if (!exclude.includes('testReport')) {
    addConditionForValues(conditions, params, 'e.csv_name', filters.testReportCsvNames)
    addConditionForValues(conditions, params, 'tr.report_name', filters.reportNames)
  }

  if (!exclude.includes('startDate') && filters.startDate) {
    conditions.push('p.created_at >= ?')
    params.push(filters.startDate)
    requiresPerformanceJoin = true
  }

  if (!exclude.includes('endDate') && filters.endDate) {
    conditions.push('p.created_at <= ?')
    params.push(filters.endDate)
    requiresPerformanceJoin = true
  }

  return { conditions, params, requiresPerformanceJoin }
}
