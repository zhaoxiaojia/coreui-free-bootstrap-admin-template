/* global Chart, coreui, XLSX */

/**
 * Wi-Fi performance dashboard script
 * - Loads filter options
 * - Retrieves performance data by criteria
 * - Renders Path Loss (dB) vs Throughput (Mbps) line charts
 * - Supports exporting to Excel
 */

(() => {
  const DEFAULT_API_BASE = new URL('/api', window.location.origin).toString()
  const API_BASE = window.WIFI_DASHBOARD_API_BASE ?? DEFAULT_API_BASE
  const DEFAULT_LIMIT = Number.parseInt(window.WIFI_DASHBOARD_MAX_POINTS ?? '1000', 10)
  const FILTER_PROMPT_MESSAGE = 'Choose filters and click "Apply Filters" to run the query.'

  const form = document.getElementById('filtersForm')
  const productLineSelect = document.getElementById('filterProductLine')
  const projectSelect = document.getElementById('filterProject')
  const testReportSelect = document.getElementById('filterTestReport')
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
  const dataTypeTabs = document.getElementById('performanceDataTypeTabs')
  const metricCards = document.getElementById('metricCards')
  const slaPassRateEl = document.getElementById('slaPassRate')
  const slaPassTrendEl = document.getElementById('slaPassTrend')
  const slaPassChangeEl = document.getElementById('slaPassChange')
  const lastUpdatedEl = document.getElementById('lastUpdated')
  const scenarioSections = new Map()
  const chartInstances = new Map()
  const chartEmptyStates = new Map()
  const polarCharts = { uplink: null, downlink: null }

  const DATA_TYPE_OPTIONS = [
    { value: 'PEAK_THROUGHPUT', label: 'Peak Throughput' },
    { value: 'RVR', label: 'RVR' },
    { value: 'RVO', label: 'RVO' }
  ]
  let selectedDataType = 'PEAK_THROUGHPUT'

  let latestDataset = []
  let isLoading = false
  let cachedFilterOptions = null
  let isSyncingFilters = false

  const WEEKLY_TESTS_ENDPOINT = window.WIFI_WEEKLY_TESTS_ENDPOINT ?? `${API_BASE}/weekly-tests-summary`

  const formatDuration = totalMinutes => {
    if (totalMinutes === null || totalMinutes === undefined || Number.isNaN(Number(totalMinutes))) return null
    const minutes = Math.max(0, Math.round(Number(totalMinutes)))
    const hours = Math.floor(minutes / 60)
    const remaining = minutes % 60
    if (hours > 0) return `${hours}h ${remaining}m`
    return `${minutes}m`
  }

  const fetchJson = async url => {
    const response = await fetch(url)
    if (!response.ok) {
      const error = new Error(`Request failed (${response.status})`)
      throw error
    }
    return response.json()
  }

  const buildMetricCard = ({ gradient, icon, label, value, trendIcon, trendText }) => {
    const trendMarkup = trendText
      ? `<div class="metric-trend">${trendIcon ? `<svg class="icon"><use xlink:href="${trendIcon}"></use></svg>` : ''}${trendText}</div>`
      : ''
    return `
      <div class="col-12 col-sm-6 col-xl-3">
        <div class="metric-card ${gradient} h-100">
          <div class="metric-icon">
            <svg class="icon">
              <use xlink:href="${icon}"></use>
            </svg>
          </div>
          <div class="metric-label">${label}</div>
          <div class="metric-value">${value}</div>
          ${trendMarkup}
        </div>
      </div>
    `.trim()
  }

  const renderWeeklyTestCards = payload => {
    if (!metricCards) return
    const data = payload ?? window.WIFI_WEEKLY_TESTS ?? {}

    const totalCount = Number.isFinite(Number(data.weekTestCount)) ? Number(data.weekTestCount) : null
    const durationText = formatDuration(data.weekTotalDurationMinutes ?? data.weekTotalDurationMins ?? null)
    const longestProject = data.longestTest?.projectName ?? null
    const longestName = data.longestTest?.testName ?? data.longestTest?.testContent ?? null
    const longestDuration = formatDuration(data.longestTest?.durationMinutes ?? data.longestTest?.durationMins ?? null)

    const cards = []
    cards.push(buildMetricCard({
      gradient: 'gradient-amber',
      icon: 'node_modules/@coreui/icons/sprites/free.svg#cil-layers',
      label: 'Weekly Tests (Count)',
      value: totalCount !== null ? `${totalCount} runs` : 'N/A',
      trendIcon: '',
      trendText: ''
    }))

    cards.push(buildMetricCard({
      gradient: 'gradient-indigo',
      icon: 'node_modules/@coreui/icons/sprites/free.svg#cil-clock',
      label: 'Weekly Tests (Total Duration)',
      value: durationText || 'N/A',
      trendIcon: '',
      trendText: ''
    }))

    const detailParts = [longestProject, longestName].filter(Boolean)
    const detailText = detailParts.join(' · ')
    cards.push(buildMetricCard({
      gradient: 'gradient-emerald',
      icon: 'node_modules/@coreui/icons/sprites/free.svg#cil-chart-line',
      label: 'Longest Test (Project / Content)',
      value: detailText || 'N/A',
      trendIcon: '',
      trendText: ''
    }))

    cards.push(buildMetricCard({
      gradient: 'gradient-pink',
      icon: 'node_modules/@coreui/icons/sprites/free.svg#cil-timer',
      label: 'Longest Test (Duration)',
      value: longestDuration || 'N/A',
      trendIcon: '',
      trendText: ''
    }))

    metricCards.innerHTML = cards.join('')
  }

  const renderHeroStats = payload => {
    const data = payload ?? null
    const passRate = data?.slaPassRate ?? data?.sla_pass_rate ?? null
    const passChange = data?.slaChangePercent ?? data?.sla_change_percent ?? null
    const lastUpdated = data?.lastUpdated ?? data?.last_updated ?? null

    if (slaPassRateEl) {
      slaPassRateEl.textContent = passRate === null || passRate === undefined ? 'N/A' : `${passRate}%`
    }
    if (slaPassChangeEl && slaPassTrendEl) {
      if (passChange === null || passChange === undefined) {
        slaPassTrendEl.classList.add('d-none')
        slaPassChangeEl.textContent = 'N/A'
      } else {
        slaPassTrendEl.classList.remove('d-none')
        slaPassChangeEl.textContent = `${passChange}%`
      }
    }
    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = lastUpdated ?? 'N/A'
    }
  }

  const loadWeeklyTests = () => {
    if (!metricCards) return
    if (window.WIFI_WEEKLY_TESTS) {
      renderWeeklyTestCards(window.WIFI_WEEKLY_TESTS)
      renderHeroStats(window.WIFI_WEEKLY_TESTS)
      return
    }
    fetchJson(WEEKLY_TESTS_ENDPOINT)
      .then(payload => {
        renderWeeklyTestCards(payload)
        renderHeroStats(payload)
      })
      .catch(() => {
        renderWeeklyTestCards({})
        renderHeroStats({})
      })
  }

  const multiSelectControllers = new Map()

  const normalizeOptionRecord = raw => {
    if (raw && typeof raw === 'object' && 'value' in raw) {
      const value = raw.value ?? ''
      const label = raw.label ?? `${value}`
      return { value: `${value}`, label: label === undefined || label === null ? `${value}` : `${label}` }
    }

    if (raw === null || raw === undefined) {
      return null
    }

    const value = `${raw}`
    return { value, label: value }
  }

  class DropdownMultiSelect {
    constructor(select, { placeholder, searchPlaceholder = 'Search…', showSelectAll = true } = {}) {
      if (!select) {
        throw new Error('DropdownMultiSelect requires a select element')
      }

      this.select = select
      this.placeholder = placeholder || 'Select options'
      this.searchPlaceholder = searchPlaceholder || 'Search…'
      this.showSelectAll = showSelectAll
      this.disabled = Boolean(select.disabled)
      this.isOpen = false
      this.options = []
      this.optionLookup = new Map()
      this.optionItems = new Map()
      this.selectedValues = new Set()

      this.handleDocumentClick = this.handleDocumentClick.bind(this)
      this.handleDocumentKeyDown = this.handleDocumentKeyDown.bind(this)
      this.handleControlKeyDown = this.handleControlKeyDown.bind(this)

      this.initialize()
    }

    initialize() {
      this.select.multiple = true
      this.select.classList.add('d-none')

      this.container = document.createElement('div')
      this.container.className = 'multi-select'
      if (this.select.id) {
        this.container.dataset.selectTarget = this.select.id
      }

      this.control = document.createElement('button')
      this.control.type = 'button'
      this.control.className = 'multi-select__control form-select d-flex align-items-center justify-content-between'
      this.control.setAttribute('aria-haspopup', 'listbox')
      this.control.setAttribute('aria-expanded', 'false')
      this.control.disabled = this.disabled

      this.summary = document.createElement('div')
      this.summary.className = 'multi-select__summary placeholder text-truncate'
      this.summary.textContent = this.placeholder

      this.tags = document.createElement('div')
      this.tags.className = 'multi-select__tags flex-wrap'
      this.tags.hidden = true

      this.control.append(this.summary, this.tags)

      this.dropdown = document.createElement('div')
      this.dropdown.className = 'multi-select__dropdown card border-0 shadow-lg'
      this.dropdown.setAttribute('role', 'listbox')
      this.dropdown.setAttribute('aria-multiselectable', 'true')
      this.dropdown.setAttribute('aria-hidden', 'true')

      this.searchWrapper = document.createElement('div')
      this.searchWrapper.className = 'multi-select__search p-2 border-bottom'

      this.searchInput = document.createElement('input')
      this.searchInput.type = 'search'
      this.searchInput.className = 'form-control form-control-sm'
      this.searchInput.placeholder = this.searchPlaceholder
      this.searchInput.setAttribute('aria-label', 'Search options')

      this.searchWrapper.appendChild(this.searchInput)

      this.optionsContainer = document.createElement('div')
      this.optionsContainer.className = 'multi-select__options'

      this.emptyState = document.createElement('div')
      this.emptyState.className = 'multi-select__empty text-body-secondary small text-center'
      this.emptyState.textContent = 'No options available'
      this.emptyState.hidden = true

      this.actions = document.createElement('div')
      this.actions.className = 'multi-select__actions d-flex gap-2 border-top p-2'

      this.clearButton = document.createElement('button')
      this.clearButton.type = 'button'
      this.clearButton.className = 'btn btn-light btn-sm flex-fill'
      this.clearButton.textContent = 'Clear'

      this.selectAllButton = document.createElement('button')
      this.selectAllButton.type = 'button'
      this.selectAllButton.className = 'btn btn-primary btn-sm flex-fill'
      this.selectAllButton.textContent = 'Select All'

      this.actions.append(this.clearButton, this.selectAllButton)

      this.dropdown.append(this.searchWrapper, this.optionsContainer, this.emptyState, this.actions)
      this.container.append(this.control, this.dropdown)

      this.select.parentNode?.insertBefore(this.container, this.select.nextSibling)

      this.attachBaseEvents()
      this.syncFromSelect()
      this.updateActionStates()
    }

    attachBaseEvents() {
      this.control.addEventListener('click', () => {
        if (this.disabled) {
          return
        }

        this.toggle()
      })
      this.control.addEventListener('keydown', this.handleControlKeyDown)

      this.searchInput.addEventListener('input', () => {
        this.applyFilter(this.searchInput.value)
      })

      this.clearButton.addEventListener('click', () => {
        if (this.disabled) {
          return
        }

        this.clear(false)
        this.focusSearch()
      })

      if (this.showSelectAll) {
        this.selectAllButton.addEventListener('click', () => {
          if (this.disabled || this.options.length === 0) {
            return
          }

          if (this.selectedValues.size === this.options.length) {
            this.clear(false)
          } else {
            this.selectAll(false)
          }
          this.focusSearch()
        })
      } else {
        this.selectAllButton.classList.add('d-none')
      }

      this.optionsContainer.addEventListener('change', event => {
        const target = event.target
        if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
          return
        }

        this.toggleValue(target.value, target.checked)
      })
    }

    handleControlKeyDown(event) {
      if (this.disabled) {
        return
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        this.toggle()
        return
      }

      if (event.key === 'Escape' && this.isOpen) {
        event.preventDefault()
        this.close()
      }
    }

    handleDocumentClick(event) {
      if (!this.container.contains(event.target)) {
        this.close()
      }
    }

    handleDocumentKeyDown(event) {
      if (event.key === 'Escape') {
        this.close()
        this.control.focus({ preventScroll: true })
      }
    }

    open() {
      if (this.isOpen || this.disabled) {
        return
      }

      this.isOpen = true
      this.container.classList.add('is-open')
      this.dropdown.setAttribute('aria-hidden', 'false')
      this.control.setAttribute('aria-expanded', 'true')

      document.addEventListener('mousedown', this.handleDocumentClick)
      document.addEventListener('touchstart', this.handleDocumentClick)
      document.addEventListener('keydown', this.handleDocumentKeyDown)

      window.requestAnimationFrame(() => {
        this.searchInput.focus({ preventScroll: true })
      })
    }

    close() {
      if (!this.isOpen) {
        return
      }

      this.isOpen = false
      this.container.classList.remove('is-open')
      this.dropdown.setAttribute('aria-hidden', 'true')
      this.control.setAttribute('aria-expanded', 'false')

      document.removeEventListener('mousedown', this.handleDocumentClick)
      document.removeEventListener('touchstart', this.handleDocumentClick)
      document.removeEventListener('keydown', this.handleDocumentKeyDown)

      this.searchInput.value = ''
      this.applyFilter('')
    }

    toggle() {
      if (this.isOpen) {
        this.close()
      } else {
        this.open()
      }
    }

    focusSearch() {
      if (this.isOpen) {
        this.searchInput.focus({ preventScroll: true })
      }
    }

    applyFilter(term) {
      const normalized = term.trim().toLowerCase()
      let visibleCount = 0

      this.optionItems.forEach(item => {
        const matches = !normalized || item.searchText.includes(normalized)
        item.element.hidden = !matches
        if (matches) {
          visibleCount += 1
        }
      })

      if (this.options.length === 0) {
        this.emptyState.hidden = false
        this.emptyState.textContent = 'No options available'
      } else {
        this.emptyState.hidden = visibleCount > 0
        if (visibleCount === 0) {
          this.emptyState.textContent = 'No matches found'
        }
      }
    }

    syncFromSelect() {
      const selected = Array.from(this.select.options)
        .filter(option => option.value !== '' && option.selected)
        .map(option => option.value)
      this.selectedValues = new Set(selected)
      this.updateSummary()
      this.updateActionStates()
    }

    setPlaceholder(nextPlaceholder) {
      if (nextPlaceholder && nextPlaceholder !== this.placeholder) {
        this.placeholder = nextPlaceholder
      }
      this.updateSummary()
    }

    setOptions(optionList, { preserveSelection = true } = {}) {
      const normalizedOptions = optionList
        .map(normalizeOptionRecord)
        .filter(option => option !== null)

      this.options = normalizedOptions
      this.optionLookup = new Map(normalizedOptions.map(option => [option.value, option.label]))
      this.optionItems.clear()

      const previousSelection = preserveSelection ? Array.from(this.selectedValues) : []
      this.selectedValues = new Set(previousSelection.filter(value => this.optionLookup.has(value)))

      this.rebuildSelectElement()
      this.renderOptions()
      this.updateSummary()
      this.updateActionStates()
    }

    rebuildSelectElement() {
      const previousFocus = this.select.contains(document.activeElement) ? document.activeElement : null
      this.select.innerHTML = ''

      this.options.forEach(option => {
        const optionElement = document.createElement('option')
        optionElement.value = option.value
        optionElement.textContent = option.label
        optionElement.selected = this.selectedValues.has(option.value)
        this.select.appendChild(optionElement)
      })

      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus({ preventScroll: true })
      }
    }

    renderOptions() {
      this.optionsContainer.innerHTML = ''
      this.optionItems.clear()

      this.options.forEach(option => {
        const wrapper = document.createElement('label')
        wrapper.className = 'multi-select__option form-check align-items-center'
        wrapper.dataset.value = option.value

        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.className = 'form-check-input'
        checkbox.value = option.value
        checkbox.checked = this.selectedValues.has(option.value)

        const label = document.createElement('span')
        label.className = 'form-check-label'
        label.textContent = option.label

        wrapper.append(checkbox, label)
        this.optionsContainer.appendChild(wrapper)

        this.optionItems.set(option.value, {
          element: wrapper,
          checkbox,
          searchText: `${option.label}`.toLowerCase()
        })
      })

      this.applyFilter(this.searchInput.value)
    }

    updateSummary() {
      const values = Array.from(this.selectedValues)
      if (values.length === 0) {
        this.summary.textContent = this.placeholder
        this.summary.classList.add('placeholder')
        this.tags.hidden = true
        this.tags.innerHTML = ''
        return
      }

      this.summary.textContent = ''
      this.summary.classList.remove('placeholder')
      this.tags.hidden = false
      this.tags.innerHTML = ''

      const visibleCount = 2
      values.slice(0, visibleCount).forEach(value => {
        const badge = document.createElement('span')
        badge.className = 'multi-select__tag badge text-bg-primary-subtle text-primary-emphasis'
        badge.textContent = this.optionLookup.get(value) ?? value
        this.tags.appendChild(badge)
      })

      if (values.length > visibleCount) {
        const remainder = document.createElement('span')
        remainder.className = 'multi-select__tag badge text-bg-light border text-secondary'
        remainder.textContent = `+${values.length - visibleCount} more`
        this.tags.appendChild(remainder)
      }
    }

    updateActionStates() {
      const totalOptions = this.options.length
      const selectedCount = this.selectedValues.size
      this.clearButton.disabled = selectedCount === 0
      if (this.showSelectAll) {
        this.selectAllButton.disabled = totalOptions === 0 || selectedCount === totalOptions
      }
    }

    toggleValue(value, isSelected, { silent = false } = {}) {
      if (!this.optionLookup.has(value)) {
        return
      }

      if (isSelected) {
        this.selectedValues.add(value)
      } else {
        this.selectedValues.delete(value)
      }

      const optionItem = this.optionItems.get(value)
      if (optionItem) {
        optionItem.checkbox.checked = isSelected
      }

      this.updateSelectElement()
      this.updateSummary()
      this.updateActionStates()

      if (!silent) {
        this.emitChange()
      }
    }

    updateSelectElement() {
      const selected = new Set(this.selectedValues)
      Array.from(this.select.options).forEach(option => {
        option.selected = selected.has(option.value)
      })
    }

    emitChange() {
      const event = new Event('change', { bubbles: true })
      this.select.dispatchEvent(event)
    }

    setSelected(values, { silent = false } = {}) {
      const normalizedValues = Array.from(new Set(values.filter(value => this.optionLookup.has(value))))
      this.selectedValues = new Set(normalizedValues)

      this.optionItems.forEach((item, value) => {
        item.checkbox.checked = this.selectedValues.has(value)
      })

      this.updateSelectElement()
      this.updateSummary()
      this.updateActionStates()

      if (!silent) {
        this.emitChange()
      }
    }

    getSelectedValues() {
      return Array.from(this.selectedValues)
    }

    clear(silent = false) {
      if (this.selectedValues.size === 0) {
        return
      }

      this.selectedValues.clear()
      this.optionItems.forEach(item => {
        item.checkbox.checked = false
      })
      this.updateSelectElement()
      this.updateSummary()
      this.updateActionStates()

      if (!silent) {
        this.emitChange()
      }
    }

    selectAll(silent = false) {
      if (this.options.length === 0) {
        return
      }

      const values = this.options.map(option => option.value)
      this.selectedValues = new Set(values)
      this.optionItems.forEach(item => {
        item.checkbox.checked = true
      })
      this.updateSelectElement()
      this.updateSummary()
      this.updateActionStates()

      if (!silent) {
        this.emitChange()
      }
    }

    setDisabled(nextState) {
      this.disabled = Boolean(nextState)
      this.control.disabled = this.disabled
      this.container.classList.toggle('is-disabled', this.disabled)
      if (this.disabled) {
        this.close()
      }
    }
  }

  const registerMultiSelect = (element, options) => {
    if (!element) {
      return null
    }

    const controller = new DropdownMultiSelect(element, options)
    multiSelectControllers.set(element.id, controller)
    return controller
  }

  const getMultiSelect = element => {
    if (!element || !element.id) {
      return null
    }
    return multiSelectControllers.get(element.id) ?? null
  }

  const getSelectedValues = element => {
    const controller = getMultiSelect(element)
    if (controller) {
      return controller.getSelectedValues()
    }

    if (!element) {
      return []
    }

    if (element.multiple) {
      return Array.from(element.selectedOptions || []).map(option => option.value).filter(value => value !== '')
    }

    return element.value ? [element.value] : []
  }

  const setMultiSelectPlaceholder = (element, placeholder) => {
    const controller = getMultiSelect(element)
    if (controller) {
      controller.setPlaceholder(placeholder)
    } else if (element) {
      element.dataset.placeholder = placeholder
    }
  }

  const setMultiSelectDisabled = (element, disabled) => {
    const controller = getMultiSelect(element)
    if (controller) {
      controller.setDisabled(disabled)
    } else if (element) {
      element.disabled = Boolean(disabled)
    }
  }

  const clearMultiSelect = element => {
    const controller = getMultiSelect(element)
    if (controller) {
      controller.clear(true)
    } else if (element) {
      if (element.multiple) {
        Array.from(element.options).forEach(option => {
          option.selected = false
        })
      } else {
        element.value = ''
      }
    }
  }

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
    if (item.project) return item.project
    const parts = []
    if (item.band) {
      const bandLabel = formatBand(item.band) || item.band
      if (bandLabel) parts.push(bandLabel)
    }
    if (Number.isFinite(item.bandwidthMhz)) parts.push(`${item.bandwidthMhz}MHz`)
    if (item.standard) parts.push(item.standard.toUpperCase())
    const channel = deriveChannelFromFrequency(item.centerFreqMhz)
    if (channel !== null) parts.push(`CH ${channel}`)
    return parts.length > 0 ? parts.join(' ') : 'Unknown Project'
  }

  const sanitizeScenarioKeyForId = value => {
    const raw = `${value ?? ''}`
    const sanitized = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '')
    return sanitized || 'scenario'
  }

  const formatScenarioGroupKey = value => {
    const raw = `${value ?? ''}`.trim()
    if (!raw) return ''
    const parts = raw.split('|').map(part => part.trim()).filter(Boolean)
    const keepKeys = new Set(['BAND', 'BANDWIDTH', 'BW', 'STANDARD', 'SSID', 'CHANNEL'])
    const kept = parts
      .map(part => part.split('=').map(token => token.trim()))
      .filter(([key, val]) => key && val && keepKeys.has(key.toUpperCase()))
      .map(([key, val]) => {
        if (key.toUpperCase() === 'BANDWIDTH') return `BW=${val}`
        return `${key.toUpperCase()}=${val}`
      })
    return kept.join(' · ')
  }

  const parseScenarioGroupValue = (scenarioGroupKey, key) => {
    const raw = `${scenarioGroupKey ?? ''}`
    if (!raw) return null
    const match = raw.match(new RegExp(`(?:^|\\|)\\s*${key}\\s*=\\s*([^|]+)`, 'i'))
    return match?.[1]?.trim() ?? null
  }

  const resolveScenarioIdentity = item => {
    const scenarioKey = item.scenarioGroupKey || item.casePath || 'scenario'
    const labelParts = []

    if (item.scenarioGroupKey) {
      const compact = formatScenarioGroupKey(item.scenarioGroupKey)
      if (compact) {
        labelParts.push(compact)
      }
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
      label: labelParts.join(' · ')
    }
  }

  

  const formatScenarioHeading = label => {
    const resolved = `${label ?? ''}`.trim()
    if (!resolved) {
      return 'Scenario'
    }

    return resolved
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
      product_line: getSelectedValues(productLineSelect),
      project: getSelectedValues(projectSelect),
      test_report_csv_name: testReportSelect ? getSelectedValues(testReportSelect) : [],
      standard: getSelectedValues(standardSelect),
      band: getSelectedValues(bandSelect),
      bandwidth_mhz: getSelectedValues(bandwidthSelect),
      data_type: selectedDataType,
      device_type: deviceTypeSelect.value || '',
      device_value: getSelectedValues(deviceValueSelect),
      start_date: startDateInput.value || '',
      end_date: endDateInput.value || '',
      limit: DEFAULT_LIMIT
    }
  }

  const buildQueryString = filters => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value
          .map(item => `${item}`.trim())
          .filter(item => item.length > 0)
          .forEach(item => {
            params.append(key, item)
          })
      } else if (value !== undefined && value !== null && `${value}`.trim() !== '') {
        params.set(key, value)
      }
    })
    return params.toString()
  }

  const populateSelect = (element, values, placeholder, formatLabel = value => value) => {
    if (!element) {
      return
    }

    const controller = getMultiSelect(element)
    const normalizedOptions = (values ?? [])
      .map(value => {
        if (value && typeof value === 'object' && 'value' in value) {
          const label = value.label ?? (formatLabel ? formatLabel(value.value) : value.value)
          return { value: `${value.value}`, label: label ?? `${value.value}` }
        }

        const optionLabel = formatLabel ? formatLabel(value) : value
        const resolvedLabel = optionLabel === undefined || optionLabel === null ? value : optionLabel
        return { value: `${value}`, label: `${resolvedLabel}` }
      })
      .filter(option => {
        if (option.value === undefined || option.value === null) {
          return false
        }
        return `${option.value}`.trim().length > 0
      })

    if (controller) {
      controller.setPlaceholder(placeholder)
      controller.setOptions(normalizedOptions)
      return
    }

    const previousValues = element.multiple
      ? Array.from(element.selectedOptions || []).map(option => option.value)
      : [element.value]

    element.innerHTML = ''

    const placeholderOption = document.createElement('option')
    placeholderOption.value = ''
    placeholderOption.textContent = placeholder
    element.appendChild(placeholderOption)

    normalizedOptions.forEach(option => {
      const optionElement = document.createElement('option')
      optionElement.value = option.value
      optionElement.textContent = option.label
      element.appendChild(optionElement)
    })

    if (element.multiple) {
      const validValues = new Set(normalizedOptions.map(option => option.value))
      Array.from(element.options).forEach(option => {
        option.selected = validValues.has(option.value) && previousValues.includes(option.value)
      })
    } else {
      const selectedValue = previousValues.find(value => normalizedOptions.some(option => option.value === value))
      element.value = selectedValue ?? ''
    }
  }

  const populateBandwidthSelect = (values, placeholder) => {
    const numericValues = (values ?? [])
      .map(value => Number(value))
      .filter(value => Number.isFinite(value))
      .sort((a, b) => a - b)

    const formatted = numericValues.map(value => ({
      value: value.toString(),
      label: `${value} MHz`
    }))

    populateSelect(bandwidthSelect, formatted, placeholder)
  }

  const refreshDeviceValueOptions = deviceOptions => {
    const deviceType = deviceTypeSelect.value
    const resolvedOptions = deviceOptions ?? cachedFilterOptions?.devices ?? {}
    const options = resolvedOptions[deviceType] ?? []
    const placeholder = deviceType === '' ? 'Select a device field first' : 'All Device Values'

    setMultiSelectPlaceholder(deviceValueSelect, placeholder)

    if (deviceType === '') {
      setMultiSelectDisabled(deviceValueSelect, true)
      clearMultiSelect(deviceValueSelect)
      const controller = getMultiSelect(deviceValueSelect)
      if (controller) {
        controller.setOptions([], { preserveSelection: false })
      } else {
        populateSelect(deviceValueSelect, [], placeholder)
      }
      return
    }

    setMultiSelectDisabled(deviceValueSelect, false)
    populateSelect(deviceValueSelect, options, placeholder)
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

  const clearAllCharts = () => {
    const keys = Array.from(new Set([...chartInstances.keys(), ...scenarioSections.keys()]))
    keys.forEach(key => removeScenarioCharts(key))

    ORDERED_DIRECTIONS.forEach(direction => {
      polarCharts[direction]?.destroy()
      polarCharts[direction] = null
    })

    if (chartGroupsContainer) {
      chartGroupsContainer.innerHTML = ''
    }
  }

  const renderPeakTable = data => {
    if (!chartGroupsContainer) {
      return
    }

    const rows = (data ?? [])
      .filter(item => Number.isFinite(item.throughputAvgMbps))
      .sort((a, b) => Number(b.throughputAvgMbps) - Number(a.throughputAvgMbps))
      .slice(0, 20)

    const table = document.createElement('table')
    table.className = 'table table-sm align-middle mb-0'
    table.innerHTML = `
      <thead>
        <tr>
          <th>Project</th>
          <th>Throughput (Mbps)</th>
          <th>Band</th>
          <th>Bandwidth</th>
          <th>Standard</th>
          <th>Direction</th>
          <th>Timestamp</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(item => `
          <tr>
            <td>${item.project ?? '-'}</td>
            <td>${formatNumber(item.throughputAvgMbps)}</td>
            <td>${formatBand(item.band) || item.band || '-'}</td>
            <td>${Number.isFinite(item.bandwidthMhz) ? `${item.bandwidthMhz} MHz` : '-'}</td>
            <td>${item.standard ?? '-'}</td>
            <td>${DIRECTION_SETTINGS[normalizeDirection(item.direction)]?.label ?? '-'}</td>
            <td>${item.createdAt ? formatDateTime(item.createdAt) : '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    `

    chartGroupsContainer.innerHTML = ''
    const wrapper = document.createElement('div')
    wrapper.className = 'table-responsive'
    wrapper.appendChild(table)
    chartGroupsContainer.appendChild(wrapper)
  }

  const ensurePolarSection = () => {
    if (!chartGroupsContainer) {
      return null
    }

    if (chartGroupsContainer.querySelector('[data-polar-section="rvo"]')) {
      return chartGroupsContainer.querySelector('[data-polar-section="rvo"]')
    }

    const section = document.createElement('div')
    section.className = 'chart-scenario d-flex flex-column gap-3'
    section.dataset.polarSection = 'rvo'

    const scenarioLabel = document.createElement('div')
    scenarioLabel.className = 'small text-body-secondary fw-semibold'
    scenarioLabel.dataset.scenarioLabel = 'rvo'
    scenarioLabel.style.display = 'none'
    section.appendChild(scenarioLabel)

    ORDERED_DIRECTIONS.forEach(direction => {
      const directionSection = document.createElement('div')
      directionSection.className = 'chart-section'

      const directionTitle = document.createElement('h6')
      directionTitle.className = 'fw-semibold mb-3'
      directionTitle.textContent = `${DIRECTION_SETTINGS[direction].label} (Polar)`
      directionSection.appendChild(directionTitle)

      const container = document.createElement('div')
      container.className = 'chart-container position-relative'
      container.style.minHeight = '320px'

      const canvas = document.createElement('canvas')
      canvas.style.minHeight = '320px'
      canvas.style.width = '100%'
      canvas.id = `performancePolar-${direction}`
      container.appendChild(canvas)

      directionSection.appendChild(container)
      section.appendChild(directionSection)

      const chart = new Chart(canvas, {
        type: 'radar',
        data: { labels: [], datasets: [] },
        options: {
          maintainAspectRatio: false,
          elements: {
            line: { borderWidth: 2 },
            point: { radius: 2 }
          },
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                title: items => items?.[0]?.label ?? '',
                label: context => `${context.dataset?.label ?? ''}: ${formatNumber(context.parsed?.r)} Mbps`
              }
            }
          },
          scales: {
            r: {
              beginAtZero: true,
              ticks: { display: true },
              title: { display: true, text: 'Throughput (Mbps)' }
            }
          }
        }
      })

      polarCharts[direction] = chart
    })

    chartGroupsContainer.innerHTML = ''
    chartGroupsContainer.appendChild(section)
    return section
  }

  const resolveRvoScenarioLabel = data => {
    const labels = Array.from(new Set((data ?? []).map(item => {
      const compact = item.scenarioGroupKey ? formatScenarioGroupKey(item.scenarioGroupKey) : ''
      if (compact) return compact
      return resolveScenarioIdentity(item).label
    }))).filter(Boolean)

    if (labels.length === 1) {
      return labels[0]
    }

    if (labels.length > 1) {
      return `Multiple Scenarios (${labels.length})`
    }

    return ''
  }

  const updateRvoCharts = data => {
    const section = ensurePolarSection()
    if (section) {
      const labelNode = section.querySelector('[data-scenario-label="rvo"]')
      if (labelNode) {
        const label = resolveRvoScenarioLabel(data)
        labelNode.textContent = label
        labelNode.style.display = label ? 'block' : 'none'
      }
    }

    const palette = getColorPalette()
    const toFill = color => {
      if (!color) return 'rgba(50,31,219,0.15)'
      if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', ', 0.15)')
      return color
    }

    ORDERED_DIRECTIONS.forEach(direction => {
      const points = (data ?? [])
        .filter(item => normalizeDirection(item.direction) === direction)
        .filter(item =>
          Number.isFinite(item.angleDeg) &&
          Number.isFinite(item.pathLossDb) &&
          Number.isFinite(item.throughputAvgMbps)
        )

      const angles = Array.from(new Set(points.map(item => Number(item.angleDeg)))).sort((a, b) => a - b)
      const labels = angles.map(angle => `${formatNumber(angle, 0)}°`)

      const lossGroups = new Map()
      points.forEach(item => {
        const channel = deriveChannelFromFrequency(item.centerFreqMhz)
        const scenarioChannel = channel === null
          ? Number.parseInt(parseScenarioGroupValue(item.scenarioGroupKey, 'CHANNEL') ?? '', 10)
          : channel
        const channelLabel = Number.isFinite(scenarioChannel) ? `CH${scenarioChannel}` : 'CH?'
        const lossLabel = `${formatNumber(item.pathLossDb, 0)}dB`
        const key = `${channelLabel} ${lossLabel}`

        if (!lossGroups.has(key)) {
          lossGroups.set(key, new Map())
        }
        lossGroups.get(key).set(Number(item.angleDeg), item.throughputAvgMbps)
      })

      const datasets = Array.from(lossGroups.entries())
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([label, map], index) => {
        const color = palette[index % palette.length]?.border ?? '#321fdb'
        const dataPoints = angles.map(angle => map.get(angle) ?? null)
        return {
          label,
          data: dataPoints,
          borderColor: color,
          backgroundColor: toFill(color),
          pointBackgroundColor: color,
          fill: false,
          spanGaps: true
        }
      })

      const chart = polarCharts[direction]
      if (!chart) return
      chart.data.labels = labels
      chart.data.datasets = datasets
      chart.update()
    })
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

  const updateVisualization = data => {
    if (selectedDataType === 'PEAK_THROUGHPUT') {
      clearAllCharts()
      renderPeakTable(data)
      exportButton.disabled = !(data && data.length > 0)
      return
    }

    if (selectedDataType === 'RVO') {
      clearAllCharts()
      updateRvoCharts(data)
      exportButton.disabled = !(data && data.length > 0)
      return
    }

    clearAllCharts()
    updateCharts(data)
  }

  document.documentElement.addEventListener('ColorSchemeChange', () => {
    updateVisualization(latestDataset)
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
        if (testReportSelect) {
          populateSelect(testReportSelect, filterOptions.testReports ?? [], 'All Test Reports')
        }
        populateSelect(standardSelect, filterOptions.standards, 'All Standards')
        populateSelect(
          bandSelect,
          filterOptions.bands,
          'All Bands',
          value => formatBand(value) || value
        )
        populateBandwidthSelect(filterOptions.bandwidths ?? [], 'All Bandwidths')
        refreshDeviceValueOptions(filterOptions.devices ?? {})
        isSyncingFilters = false
      }

      if (refreshData) {
        const { data, metadata } = await fetchPerformanceData()
        latestDataset = data
        updateVisualization(data)

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
        updateVisualization([])
        setStatus(FILTER_PROMPT_MESSAGE)
      } else if (pendingStatus) {
        setStatus(pendingStatus)
      }
    } catch (error) {
      console.error(error)
      setStatus(error.message ?? 'An error occurred while loading data. Please try again later.')
      if (refreshData) {
        updateVisualization([])
        latestDataset = []
      }
      isSyncingFilters = false
    } finally {
      isSyncingFilters = false
      setLoadingState(false)
    }
  }

  const handleFormSubmit = async event => {
    event.preventDefault()
    await loadFiltersAndData({ refreshFilters: false, refreshData: true })
  }

  const handleFormReset = () => {
    window.setTimeout(() => {
      multiSelectControllers.forEach(controller => {
        controller.clear(true)
      })
      setMultiSelectPlaceholder(deviceValueSelect, 'Select a device field first')
      setMultiSelectDisabled(deviceValueSelect, true)
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

    registerMultiSelect(productLineSelect, { placeholder: 'All Product Lines' })
    registerMultiSelect(projectSelect, { placeholder: 'All Projects' })
    if (testReportSelect) {
      registerMultiSelect(testReportSelect, { placeholder: 'All Test Reports' })
    }
    registerMultiSelect(standardSelect, { placeholder: 'All Standards' })
    registerMultiSelect(bandSelect, { placeholder: 'All Bands' })
    registerMultiSelect(bandwidthSelect, { placeholder: 'All Bandwidths' })
    registerMultiSelect(deviceValueSelect, {
      placeholder: 'Select a device field first',
      showSelectAll: true
    })
    setMultiSelectDisabled(deviceValueSelect, true)

    form.addEventListener('submit', handleFormSubmit)
    form.addEventListener('reset', handleFormReset)
    refreshButton.addEventListener('click', () => {
      loadFiltersAndData({ refreshFilters: false, refreshData: true })
    })
    exportButton.addEventListener('click', exportToExcel)
    deviceTypeSelect.addEventListener('change', handleDeviceTypeChange)
    productLineSelect.addEventListener('change', handleCriteriaChange)
    projectSelect.addEventListener('change', handleCriteriaChange)
    testReportSelect?.addEventListener('change', handleCriteriaChange)

    if (dataTypeTabs) {
      dataTypeTabs.querySelectorAll('[data-performance-datatype]').forEach(button => {
        button.addEventListener('click', () => {
          const value = button.dataset.performanceDatatype
          if (!value) return
          selectedDataType = value
          dataTypeTabs.querySelectorAll('[data-performance-datatype]').forEach(inner => {
            const isActive = inner.dataset.performanceDatatype === selectedDataType
            inner.classList.toggle('active', isActive)
            inner.setAttribute('aria-selected', isActive ? 'true' : 'false')
          })
          loadFiltersAndData({ refreshFilters: false, refreshData: true })
        })
      })
    }

    loadWeeklyTests()
    loadFiltersAndData({ refreshFilters: true, refreshData: false, initial: true })
  }

  document.addEventListener('DOMContentLoaded', init)
})()
