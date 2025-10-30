/* global Chart, coreui, XLSX */

/**
 * Wi-Fi performance dashboard script
 * - Loads filter options
 * - Retrieves performance data by criteria
 * - Renders Path Loss (dB) vs Throughput (Mbps) line charts
 * - Supports exporting to Excel
 */

(() => {
  const API_BASE = window.WIFI_DASHBOARD_API_BASE ?? 'http://localhost:5000/api'
  const DEFAULT_LIMIT = Number.parseInt(window.WIFI_DASHBOARD_MAX_POINTS ?? '1000', 10)
  const FILTER_PROMPT_MESSAGE = 'Choose filters and click "Apply Filters" to run the query.'

  const form = document.getElementById('filtersForm')
  const productLineSelect = document.getElementById('filterProductLine')
  const projectSelect = document.getElementById('filterProject')
  const standardSelect = document.getElementById('filterStandard')
  const bandSelect = document.getElementById('filterBand')
  const bandwidthSelect = document.getElementById('filterBandwidth')
  const deviceTypeSelect = document.getElementById('filterDeviceType')
  const deviceValueSelect = document.getElementById('filterDeviceValue')
  const startDateInput = document.getElementById('filterStartDate')
  const endDateInput = document.getElementById('filterEndDate')
  const statusMessage = document.getElementById('statusMessage')
  const refreshButton = document.getElementById('refreshButton')
  const exportButton = document.getElementById('exportButton')
  const DIRECTION_SETTINGS = {
    uplink: {
      label: 'Tx (Uplink)'
    },
    downlink: {
      label: 'Rx (Downlink)'
    }
  }
  const ORDERED_DIRECTIONS = ['uplink', 'downlink']
  const chartGroupsContainer = document.getElementById('performanceChartGroups')
  const scenarioSections = new Map()
  const chartInstances = new Map()
  const chartEmptyStates = new Map()

  let latestDataset = []
  let isLoading = false
  let cachedFilterOptions = null
  let isSyncingFilters = false

  const formatNumber = (value, fractionDigits = 2) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '--'
    }

    return Number(value).toFixed(fractionDigits)
  }

  const formatDateTime = value => {
    if (!value) {
      return '--'
    }

    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString()
  }

  const formatBand = value => {
    const raw = `${value ?? ''}`.trim()
    if (!raw) {
      return ''
    }

    let normalized = raw.replace(/band\s*/i, '').replace(/\s+/g, '')
    if (!normalized) {
      normalized = raw.replace(/\s+/g, '')
    }

    normalized = normalized.replace(/ghz$/i, '')
    normalized = normalized.replace(/g$/i, '')

    if (!normalized) {
      return raw.replace(/\s+/g, '')
    }

    const numeric = Number.parseFloat(normalized)
    if (Number.isFinite(numeric)) {
      const trimmed = Number(numeric.toFixed(2))
      return `${trimmed}G`
    }

    return `${normalized}G`
  }

  const removeSummaryRowIfPresent = () => {
    const summaryLabels = ['Data Points', 'Average Throughput']
    const rows = Array.from(document.querySelectorAll('.row'))
    const summaryRow = rows.find(row => {
      const text = row.textContent?.replace(/\s+/g, '') ?? ''
      return summaryLabels.every(label => text.includes(label))
    })

    summaryRow?.remove()
  }

  const tooltipProximityPlugin = {
    id: 'tooltipProximity',
    afterEvent(chart, args) {
      const { event, inChartArea } = args
      if (!event) {
        return
      }

      if (event.type === 'mouseout' || !inChartArea) {
        chart.tooltip?.setActiveElements([], { x: 0, y: 0 })
        chart.update('none')
        return
      }

      if (event.type !== 'mousemove') {
        return
      }

      const tooltip = chart.tooltip
      if (!tooltip) {
        return
      }
      const nativeEvent = event.native ?? event

      const getPosition = () => {
        if (typeof event.x === 'number' && typeof event.y === 'number') {
          return { x: event.x, y: event.y }
        }

        const relative = Chart.helpers?.getRelativePosition?.(nativeEvent, chart)
        if (relative) {
          return relative
        }

        if ('offsetX' in nativeEvent && 'offsetY' in nativeEvent && typeof nativeEvent.offsetX === 'number' && typeof nativeEvent.offsetY === 'number') {
          return { x: nativeEvent.offsetX, y: nativeEvent.offsetY }
        }

        if (typeof nativeEvent.clientX === 'number' && typeof nativeEvent.clientY === 'number' && nativeEvent.target?.getBoundingClientRect) {
          const rect = nativeEvent.target.getBoundingClientRect()
          return { x: nativeEvent.clientX - rect.left, y: nativeEvent.clientY - rect.top }
        }

        return null
      }

      const position = getPosition()
      if (!position) {
        tooltip.setActiveElements([], { x: 0, y: 0 })
        chart.update('none')
        return
      }

      const nearest = chart.getElementsAtEventForMode(nativeEvent, 'nearest', { intersect: true }, true)
      if (!nearest.length) {
        tooltip.setActiveElements([], { x: 0, y: 0 })
        chart.update('none')
        return
      }

      const { element } = nearest[0]
      if (!element) {
        tooltip.setActiveElements([], { x: 0, y: 0 })
        chart.update('none')
        return
      }

      const distance = Math.hypot(position.x - element.x, position.y - element.y)
      const radius = element.options?.hitRadius ?? element.options?.radius ?? 0

      if (!Number.isFinite(radius) || distance > radius) {
        tooltip.setActiveElements([], { x: 0, y: 0 })
        chart.update('none')
        return
      }

      const { datasetIndex, index } = nearest[0]
      const activeElements = tooltip.getActiveElements()
      const alreadyActive =
        activeElements.length === 1 &&
        activeElements[0].datasetIndex === datasetIndex &&
        activeElements[0].index === index

      if (!alreadyActive) {
        tooltip.setActiveElements([{ datasetIndex, index }], { x: element.x, y: element.y })
        chart.update('none')
      }
    }
  }

  const setStatus = message => {
    if (!statusMessage) {
      return
    }

    statusMessage.textContent = message
  }

  const setLoadingState = (nextState, message) => {
    isLoading = nextState
    refreshButton.disabled = nextState
    if (nextState) {
      exportButton.disabled = true
      if (message) {
        setStatus(message)
      }
    } else {
      exportButton.disabled = exportButton.disabled || latestDataset.length === 0
    }
  }

  const normalizeDirection = value => {
    if (!value) {
      return null
    }

    const normalized = `${value}`.trim().toLowerCase()
    if (normalized === 'tx') {
      return 'uplink'
    }
    if (normalized === 'rx') {
      return 'downlink'
    }

    return normalized === 'uplink' || normalized === 'downlink' ? normalized : null
  }

  const deriveChannelFromFrequency = freqMhz => {
    if (!Number.isFinite(freqMhz)) {
      return null
    }

    if (freqMhz === 2484) {
      return 14
    }

    if (freqMhz >= 2412 && freqMhz <= 2472) {
      return Math.round((freqMhz - 2407) / 5)
    }

    if (freqMhz >= 5000 && freqMhz <= 5900) {
      return Math.round((freqMhz - 5000) / 5)
    }

    if (freqMhz >= 5925 && freqMhz <= 7125) {
      return Math.round((freqMhz - 5950) / 5)
    }

    return null
  }

  const buildSeriesKey = item => {
    const reportComponent = item.testReportId !== null && item.testReportId !== undefined
      ? String(item.testReportId)
      : 'unknown-report'
    if (item.scenarioGroupKey) {
      return `${reportComponent}__${item.scenarioGroupKey}`
    }

    return reportComponent
  }

  const buildDatasetLabel = item => {
    const parts = []

    if (item.band) {
      const bandLabel = formatBand(item.band) || item.band
      if (bandLabel) {
        parts.push(bandLabel)
      }
    }

    if (Number.isFinite(item.bandwidthMhz)) {
      parts.push(`${item.bandwidthMhz}MHz`)
    }

    if (item.standard) {
      parts.push(item.standard.toUpperCase())
    }

    const channel = deriveChannelFromFrequency(item.centerFreqMhz)
    if (channel !== null) {
      parts.push(`CH ${channel}`)
    }

    return parts.length > 0 ? parts.join(' ') : 'Unknown Test'
  }

  const sanitizeScenarioKeyForId = value => {
    const raw = `${value ?? ''}`
    const sanitized = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '')
    return sanitized || 'scenario'
  }

  const resolveScenarioIdentity = item => {
    const scenarioKey = item.scenarioGroupKey || item.casePath || 'scenario'
    const labelParts = []

    if (item.scenarioGroupKey) {
      labelParts.push(item.scenarioGroupKey)
    }

    if (item.casePath && !labelParts.some(part => part.toLowerCase() === item.casePath.toLowerCase())) {
      labelParts.push(item.casePath)
    }

    const channel = deriveChannelFromFrequency(item.centerFreqMhz)
    if (
      channel !== null &&
      !labelParts.some(part => part.toLowerCase().includes(`ch ${channel}`.toLowerCase())) &&
      !labelParts.some(part => part.toLowerCase().includes(`ch${channel}`.toLowerCase()))
    ) {
      labelParts.push(`CH ${channel}`)
    }

    if (labelParts.length === 0) {
      labelParts.push('Scenario')
    }

    return {
      key: scenarioKey,
      label: labelParts.join(' • ')
    }
  }

  const formatScenarioHeading = label => {
    const resolved = `${label ?? ''}`.trim()
    if (!resolved) {
      return 'Scenario'
    }

    return resolved.toLowerCase().startsWith('scenario') ? resolved : `Scenario: ${resolved}`
  }

  const COLOR_TOKEN_SETS = [
    { token: '--cui-primary', rgbToken: '--cui-primary-rgb', fallback: '#321fdb', fallbackRgb: '50,31,219' },
    { token: '--cui-info', rgbToken: '--cui-info-rgb', fallback: '#39f', fallbackRgb: '51,153,255' },
    { token: '--cui-success', rgbToken: '--cui-success-rgb', fallback: '#2eb85c', fallbackRgb: '46,184,92' },
    { token: '--cui-warning', rgbToken: '--cui-warning-rgb', fallback: '#f9b115', fallbackRgb: '249,177,21' },
    { token: '--cui-danger', rgbToken: '--cui-danger-rgb', fallback: '#e55353', fallbackRgb: '229,83,83' },
    { token: '--cui-dark', rgbToken: '--cui-dark-rgb', fallback: '#212431', fallbackRgb: '33,36,49' },
    { token: '--cui-secondary', rgbToken: '--cui-secondary-rgb', fallback: '#9da5b1', fallbackRgb: '157,165,177' }
  ]

  const getColorPalette = () =>
    COLOR_TOKEN_SETS.map(set => {
      const borderColor = coreui.Utils.getStyle(set.token) || set.fallback
      const rgb = coreui.Utils.getStyle(set.rgbToken) || set.fallbackRgb
      return {
        border: borderColor,
        point: borderColor,
        fill: `rgba(${rgb}, 0.16)`
      }
    })

  const collectFilters = () => {
    return {
      product_line: productLineSelect.value || '',
      project: projectSelect.value || '',
      standard: standardSelect.value || '',
      band: bandSelect.value || '',
      bandwidth_mhz: bandwidthSelect.value || '',
      device_type: deviceTypeSelect.value || '',
      device_value: deviceValueSelect.value || '',
      start_date: startDateInput.value || '',
      end_date: endDateInput.value || '',
      limit: DEFAULT_LIMIT
    }
  }

  const buildQueryString = filters => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && `${value}`.trim() !== '') {
        params.set(key, value)
      }
    })
    return params.toString()
  }

  const populateSelect = (element, values, placeholder, selectedValue, formatLabel = value => value) => {
    const previousValue = selectedValue ?? element.value
    element.innerHTML = ''

    const placeholderOption = document.createElement('option')
    placeholderOption.value = ''
    placeholderOption.textContent = placeholder
    element.appendChild(placeholderOption)

    values.forEach(value => {
      const option = document.createElement('option')
      option.value = value
      const label = formatLabel ? formatLabel(value) : value
      option.textContent = label ?? value
      element.appendChild(option)
    })

    if (previousValue && values.includes(previousValue)) {
      element.value = previousValue
    } else {
      element.value = ''
    }
  }

  const populateBandwidthSelect = (values, placeholder) => {
    const numericValues = values
      .map(value => Number(value))
      .filter(value => Number.isFinite(value))
      .sort((a, b) => a - b)

    const formatted = numericValues.map(value => ({
      label: `${value} MHz`,
      value: value.toString()
    }))

    const previousValue = bandwidthSelect.value
    bandwidthSelect.innerHTML = ''

    const placeholderOption = document.createElement('option')
    placeholderOption.value = ''
    placeholderOption.textContent = placeholder
    bandwidthSelect.appendChild(placeholderOption)

    formatted.forEach(item => {
      const option = document.createElement('option')
      option.value = item.value
      option.textContent = item.label
      bandwidthSelect.appendChild(option)
    })

    if (formatted.some(item => item.value === previousValue)) {
      bandwidthSelect.value = previousValue
    } else {
      bandwidthSelect.value = ''
    }
  }

  const refreshDeviceValueOptions = deviceOptions => {
    const deviceType = deviceTypeSelect.value
    const resolvedOptions = deviceOptions ?? cachedFilterOptions?.devices ?? {}
    const options = resolvedOptions[deviceType] ?? []
    deviceValueSelect.disabled = deviceType === ''
    populateSelect(
      deviceValueSelect,
      options,
      deviceType === '' ? 'Select a device field first' : 'All Devices',
      deviceValueSelect.value
    )
    if (deviceType === '') {
      deviceValueSelect.value = ''
    }
  }

  const fetchFilters = async () => {
    const filters = collectFilters()
    const queryString = buildQueryString(filters)
    const endpoint = queryString ? `${API_BASE}/filters?${queryString}` : `${API_BASE}/filters`
    const response = await fetch(endpoint)
    if (!response.ok) {
      throw new Error('Failed to fetch filter options')
    }
    return response.json()
  }

  const fetchPerformanceData = async () => {
    const filters = collectFilters()
    const queryString = buildQueryString(filters)
    const endpoint = queryString ? `${API_BASE}/performance?${queryString}` : `${API_BASE}/performance`
    const response = await fetch(endpoint)
    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || 'Failed to fetch performance data')
    }
    return response.json()
  }

  const prepareScenarioGroups = data => {
    const scenarios = new Map()

    data.forEach(item => {
      const direction = normalizeDirection(item.direction)
      if (!direction || !Number.isFinite(item.pathLossDb) || !Number.isFinite(item.throughputAvgMbps)) {
        return
      }

      const identity = resolveScenarioIdentity(item)
      const scenarioKey = identity.key || 'scenario'
      if (!scenarios.has(scenarioKey)) {
        scenarios.set(scenarioKey, {
          key: scenarioKey,
          label: identity.label || 'Scenario',
          directions: {
            uplink: new Map(),
            downlink: new Map()
          }
        })
      }

      const scenarioEntry = scenarios.get(scenarioKey)
      if (identity.label && identity.label !== scenarioEntry.label) {
        const shouldReplace = scenarioEntry.label === 'Scenario' || identity.label.length > scenarioEntry.label.length
        if (shouldReplace) {
          scenarioEntry.label = identity.label
        }
      }

      const bucket = scenarioEntry.directions[direction]
      const seriesKey = buildSeriesKey(item)
      if (!seriesKey) {
        return
      }

      if (!bucket.has(seriesKey)) {
        bucket.set(seriesKey, {
          label: buildDatasetLabel(item),
          points: []
        })
      }

      bucket.get(seriesKey).points.push({
        x: item.pathLossDb,
        y: item.throughputAvgMbps,
        createdAt: item.createdAt,
        testReportId: item.testReportId,
        scenarioGroupKey: item.scenarioGroupKey,
        band: item.band,
        bandwidthMhz: item.bandwidthMhz,
        standard: item.standard,
        centerFreqMhz: item.centerFreqMhz,
        channel: deriveChannelFromFrequency(item.centerFreqMhz),
        casePath: item.casePath,
        testCategory: item.testCategory,
        protocol: item.protocol
      })
    })

    return Array.from(scenarios.values()).map(scenario => ({
      key: scenario.key,
      label: scenario.label,
      directions: Object.fromEntries(
        ORDERED_DIRECTIONS.map(direction => [
          direction,
          Array.from(scenario.directions[direction].values()).map(group => ({
            label: group.label,
            points: group.points.sort((a, b) => a.x - b.x)
          }))
        ])
      )
    }))
  }

  const ensureScenarioSection = (scenarioKey, scenarioLabel) => {
    if (!chartGroupsContainer) {
      return null
    }

    const headingText = formatScenarioHeading(scenarioLabel)
    const existing = scenarioSections.get(scenarioKey)
    if (existing) {
      if (existing.titleElement && existing.titleElement.textContent !== headingText) {
        existing.titleElement.textContent = headingText
      }
      return existing
    }

    const section = document.createElement('section')
    section.className = 'chart-scenario d-flex flex-column gap-3'
    section.dataset.scenarioKey = scenarioKey

    const title = document.createElement('h6')
    title.className = 'fw-semibold mb-2'
    title.textContent = headingText
    section.appendChild(title)

    const directionBlocks = {}

    ORDERED_DIRECTIONS.forEach(direction => {
      const directionSection = document.createElement('div')
      directionSection.className = 'chart-section'

      const directionTitle = document.createElement('h6')
      directionTitle.className = 'fw-semibold mb-3'
      directionTitle.textContent = DIRECTION_SETTINGS[direction].label
      directionSection.appendChild(directionTitle)

      const container = document.createElement('div')
      container.className = 'chart-container position-relative'
      container.style.minHeight = '320px'

      const canvas = document.createElement('canvas')
      canvas.style.minHeight = '320px'
      canvas.style.width = '100%'
      canvas.id = `performanceChart-${sanitizeScenarioKeyForId(scenarioKey)}-${direction}`
      container.appendChild(canvas)

      const emptyState = document.createElement('div')
      emptyState.className = 'chart-empty-state fw-semibold position-absolute top-50 start-50 translate-middle text-center'
      emptyState.style.display = 'none'
      emptyState.textContent = `No data for ${DIRECTION_SETTINGS[direction].label}. Adjust the filters and try again.`
      container.appendChild(emptyState)

      directionSection.appendChild(container)
      section.appendChild(directionSection)

      directionBlocks[direction] = {
        headingElement: directionTitle,
        canvas,
        emptyState
      }
    })

    chartGroupsContainer.appendChild(section)

    const record = { section, titleElement: title, directionBlocks }
    scenarioSections.set(scenarioKey, record)
    chartEmptyStates.set(
      scenarioKey,
      Object.fromEntries(
        ORDERED_DIRECTIONS.map(direction => [direction, directionBlocks[direction].emptyState])
      )
    )
    return record
  }

  const ensureDirectionalChart = (scenarioKey, scenarioLabel, direction) => {
    const section = ensureScenarioSection(scenarioKey, scenarioLabel)
    if (!section) {
      return null
    }

    let scenarioCharts = chartInstances.get(scenarioKey)
    if (!scenarioCharts) {
      scenarioCharts = {}
      chartInstances.set(scenarioKey, scenarioCharts)
    }

    if (scenarioCharts[direction]) {
      return scenarioCharts[direction]
    }

    const canvas = section.directionBlocks[direction]?.canvas
    if (!canvas) {
      return null
    }

    const chart = new Chart(canvas, {
      type: 'line',
      data: { datasets: [] },
      options: {
        maintainAspectRatio: false,
        parsing: false,
        interaction: {
          mode: 'nearest',
          intersect: true
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              usePointStyle: true,
              padding: 16,
              boxHeight: 10,
              boxWidth: 20,
              color: coreui.Utils.getStyle('--cui-body-color'),
              font: {
                size: 14,
                weight: '600',
                family: coreui.Utils.getStyle('--cui-body-font-family') || 'inherit'
              }
            }
          },
          tooltip: {
            mode: 'nearest',
            position: 'nearest',
            intersect: true,
            external: coreui.ChartJS.customTooltips,
            callbacks: {
              title: items => {
                if (!items || items.length === 0) {
                  return ''
                }
                const { raw } = items[0]
                const scenario = raw?.scenarioLabel ?? 'Scenario'
                return [`${scenario}`, `Path Loss: ${formatNumber(raw?.x)} dB`]
              },
              label: context => {
                const { raw } = context
                const lines = [
                  `Throughput: ${formatNumber(raw?.y)} Mbps`,
                  raw?.directionLabel ? `Direction: ${raw.directionLabel}` : null,
                  raw?.band ? `Band: ${formatBand(raw.band) || raw.band}` : null,
                  Number.isFinite(raw?.bandwidthMhz) ? `Bandwidth: ${raw.bandwidthMhz} MHz` : null,
                  raw?.channel !== null && raw?.channel !== undefined ? `Channel: ${raw.channel}` : null,
                  Number.isFinite(raw?.centerFreqMhz) ? `Center Frequency: ${formatNumber(raw.centerFreqMhz, 0)} MHz` : null,
                  raw?.standard ? `Standard: ${raw.standard}` : null,
                  raw?.protocol ? `Protocol: ${raw.protocol}` : null,
                  raw?.testCategory ? `Test Category: ${raw.testCategory}` : null,
                  raw?.casePath ? `Case: ${raw.casePath}` : null,
                  raw?.createdAt ? `Timestamp: ${formatDateTime(raw.createdAt)}` : null
                ]
                return lines.filter(Boolean)
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            title: {
              display: true,
              text: 'Path Loss (dB)'
            },
            ticks: {
              color: coreui.Utils.getStyle('--cui-body-color')
            },
            grid: {
              color: coreui.Utils.getStyle('--cui-border-color-translucent')
            }
          },
          y: {
            beginAtZero: false,
            title: {
              display: true,
              text: 'Throughput (Mbps)'
            },
            ticks: {
              color: coreui.Utils.getStyle('--cui-body-color')
            },
            grid: {
              color: coreui.Utils.getStyle('--cui-border-color-translucent')
            }
          }
        }
      },
      plugins: [tooltipProximityPlugin]
    })

    canvas.addEventListener('mouseleave', () => {
      chart.tooltip.setActiveElements([], { x: 0, y: 0 })
      chart.update()
    })

    scenarioCharts[direction] = chart
    return chart
  }

  const updateDirectionalChart = (scenarioKey, scenarioLabel, direction, groups) => {
    const chart = ensureDirectionalChart(scenarioKey, scenarioLabel, direction)
    if (!chart) {
      return
    }

    const palette = getColorPalette()
    const directionLabel = DIRECTION_SETTINGS[direction].label
    const datasets = groups.map((group, index) => {
      const colors = palette[index % palette.length] ?? {
        border: '#321fdb',
        point: '#321fdb',
        fill: 'rgba(50,31,219,0.16)'
      }

      const points = group.points.map(point => ({
        ...point,
        band: formatBand(point.band) || point.band,
        scenarioLabel: scenarioLabel || group.label,
        directionLabel
      }))

      return {
        label: group.label,
        data: points,
        parsing: false,
        borderColor: colors.border,
        backgroundColor: colors.fill,
        pointBackgroundColor: colors.point,
        pointBorderColor: colors.point,
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: false
      }
    })

    chart.data.datasets = datasets
    chart.options.plugins.legend.display = datasets.length > 0
    chart.options.scales.x.ticks.color = coreui.Utils.getStyle('--cui-body-color')
    chart.options.scales.x.grid.color = coreui.Utils.getStyle('--cui-border-color-translucent')
    chart.options.scales.y.ticks.color = coreui.Utils.getStyle('--cui-body-color')
    chart.options.scales.y.grid.color = coreui.Utils.getStyle('--cui-border-color-translucent')
    chart.update()
    window.requestAnimationFrame(() => {
      chart.resize()
    })

    const emptyState = chartEmptyStates.get(scenarioKey)?.[direction]
    if (emptyState) {
      emptyState.style.display = datasets.length === 0 ? 'block' : 'none'
    }
  }

  const removeScenarioCharts = scenarioKey => {
    const charts = chartInstances.get(scenarioKey)
    if (charts) {
      ORDERED_DIRECTIONS.forEach(direction => {
        charts[direction]?.destroy()
      })
      chartInstances.delete(scenarioKey)
    }

    const section = scenarioSections.get(scenarioKey)
    if (section) {
      section.section.remove()
      scenarioSections.delete(scenarioKey)
    }

    chartEmptyStates.delete(scenarioKey)
  }

  const updateCharts = data => {
    const scenarios = prepareScenarioGroups(data)
    const activeKeys = new Set(scenarios.map(item => item.key))

    const knownKeys = new Set([...chartInstances.keys(), ...scenarioSections.keys()])
    knownKeys.forEach(key => {
      if (!activeKeys.has(key)) {
        removeScenarioCharts(key)
      }
    })

    scenarios.forEach(scenario => {
      const record = ensureScenarioSection(scenario.key, scenario.label)
      if (!record) {
        return
      }

      chartGroupsContainer.appendChild(record.section)

      ORDERED_DIRECTIONS.forEach(direction => {
        updateDirectionalChart(scenario.key, scenario.label, direction, scenario.directions[direction] ?? [])
      })
    })

    const hasPoints = scenarios.some(scenario =>
      ORDERED_DIRECTIONS.some(direction =>
        (scenario.directions[direction] ?? []).some(group => group.points.length > 0)
      )
    )
    exportButton.disabled = !hasPoints
  }

  document.documentElement.addEventListener('ColorSchemeChange', () => {
    updateCharts(latestDataset)
  })



  const exportToExcel = () => {
    if (!latestDataset || latestDataset.length === 0) {
      window.alert('No data available to export. Please load data first.')
      return
    }

    const formatDirectionLabel = value => {
      const normalized = normalizeDirection(value)
      if (normalized === 'uplink') {
        return 'Tx'
      }
      if (normalized === 'downlink') {
        return 'Rx'
      }
      return value ?? ''
    }

    const sheetData = latestDataset.map((row, index) => ({
      Index: index + 1,
      Path_Loss_dB: row.pathLossDb,
      Throughput_Avg_Mbps: row.throughputAvgMbps,
      Direction: formatDirectionLabel(row.direction),
      Band: formatBand(row.band) || row.band,
      Bandwidth_MHz: row.bandwidthMhz,
      Channel: deriveChannelFromFrequency(row.centerFreqMhz),
      Center_Freq_MHz: row.centerFreqMhz,
      Standard: row.standard,
      Test_Category: row.testCategory,
      Protocol: row.protocol,
      Case_Path: row.casePath,
      Product_Line: row.productLine,
      Project: row.project,
      ADB_Device: row.adbDevice,
      Telnet_IP: row.telnetIp,
      Created_At: row.createdAt
    }))

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(sheetData)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Performance')
    const timestamp = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0]
    XLSX.writeFile(workbook, `wifi-performance-${timestamp}.xlsx`)
  }

  const loadFiltersAndData = async ({ refreshFilters = true, refreshData = true, initial = false, statusMessage: pendingStatus } = {}) => {
    if (!refreshFilters && !refreshData) {
      return
    }

    const loadingMessage = refreshData ? 'Loading data, please wait...' : 'Refreshing filter options...'
    setLoadingState(true, loadingMessage)

    try {
      if (refreshFilters) {
        const filterOptions = await fetchFilters()
        cachedFilterOptions = filterOptions

        isSyncingFilters = true
        populateSelect(productLineSelect, filterOptions.productLines, 'All Product Lines')
        populateSelect(projectSelect, filterOptions.projects, 'All Projects')
        populateSelect(standardSelect, filterOptions.standards, 'All Standards')
        populateSelect(
          bandSelect,
          filterOptions.bands,
          'All Bands',
          undefined,
          value => formatBand(value) || value
        )
        populateBandwidthSelect(filterOptions.bandwidths ?? [], 'All Bandwidths')
        refreshDeviceValueOptions(filterOptions.devices ?? {})
        isSyncingFilters = false
      }

      if (refreshData) {
        const { data, metadata } = await fetchPerformanceData()
        latestDataset = data
        updateCharts(data)

        if (data.length === 0) {
          setStatus('No data matched the current filters.')
        } else if (metadata?.truncated) {
          const appliedLimit = metadata.appliedLimit ?? DEFAULT_LIMIT
          setStatus(`Loaded ${data.length} records (exceeded ${appliedLimit}, truncated).`)
        } else {
          setStatus(`Successfully loaded ${data.length} records.`)
        }
      } else if (initial) {
        latestDataset = []
        updateCharts([])
        setStatus(FILTER_PROMPT_MESSAGE)
      } else if (pendingStatus) {
        setStatus(pendingStatus)
      }
    } catch (error) {
      console.error(error)
      setStatus(error.message ?? 'An error occurred while loading data. Please try again later.')
      if (refreshData) {
        updateCharts([])
        latestDataset = []
      }
    } finally {
      setLoadingState(false)
    }
  }

  const handleFormSubmit = async event => {
    event.preventDefault()
    await loadFiltersAndData({ refreshFilters: true, refreshData: true })
  }

  const handleFormReset = () => {
    window.setTimeout(() => {
      deviceValueSelect.disabled = true
      loadFiltersAndData({ refreshFilters: true, refreshData: false, initial: true })
    }, 0)
  }

  const handleDeviceTypeChange = () => {
    loadFiltersAndData({
      refreshFilters: true,
      refreshData: false,
      statusMessage: 'Device list updated. Select a device value and apply the filters.'
    })
  }

  const handleCriteriaChange = () => {
    if (isSyncingFilters || isLoading) {
      return
    }

    loadFiltersAndData({ refreshFilters: true, refreshData: false })
  }

  const init = () => {
    removeSummaryRowIfPresent()
    if (!form) {
      console.warn('Filter form not found. wifi-dashboard.js was not initialized.')
      return
    }

    form.addEventListener('submit', handleFormSubmit)
    form.addEventListener('reset', handleFormReset)
    refreshButton.addEventListener('click', () => {
      loadFiltersAndData({ refreshFilters: false, refreshData: true })
    })
    exportButton.addEventListener('click', exportToExcel)
    deviceTypeSelect.addEventListener('change', handleDeviceTypeChange)
    productLineSelect.addEventListener('change', handleCriteriaChange)
    projectSelect.addEventListener('change', handleCriteriaChange)

    loadFiltersAndData({ refreshFilters: true, refreshData: false, initial: true })
  }

  document.addEventListener('DOMContentLoaded', init)
})()

