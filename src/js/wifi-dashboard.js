/* global Chart, coreui, XLSX, jspdf */

/**
 * Wi-Fi performance dashboard script
 * - Loads filter options
 * - Retrieves performance data by criteria
 * - Renders Path Loss (dB) vs Throughput (Mbps) line charts
 * - Supports exporting to Excel
 */

(() => {
  if (window.__wifiDashboardScriptLoaded) {
    // In dev/hot-reload scenarios, the same script can be evaluated more than once.
    // Avoid double-binding listeners which can cause repeated fetches and "flashing" UI.
    return
  }
  window.__wifiDashboardScriptLoaded = true

  const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1'
  const debug = (...args) => {
    if (!debugEnabled) return
    console.info('[wifi-dashboard]', ...args)
  }
  const warn = (...args) => console.warn('[wifi-dashboard]', ...args)
  const SIDEBAR_DATATYPE_KEY = 'wifi-dashboard-last-datatype'
  const DEFAULT_API_BASE = new URL('/api', window.location.origin).toString()
  const API_BASE = window.WIFI_DASHBOARD_API_BASE ?? DEFAULT_API_BASE
  const DEFAULT_LIMIT = Number.parseInt(window.WIFI_DASHBOARD_MAX_POINTS ?? '1000', 10)
  const FILTER_PROMPT_MESSAGE = 'Choose filters and click "Apply Filters" to run the query.'
  const FILTER_STATE_KEY = 'wifi-dashboard-filter-state'
  const getFilterStateKey = () => `${FILTER_STATE_KEY}:${selectedDataType}`

  const form = document.getElementById('filtersForm')
  const productLineSelect = document.getElementById('filterProductLine')
  const projectSelect = document.getElementById('filterProject')
  const testReportSelect = document.getElementById('filterTestReport')
  const standardSelect = document.getElementById('filterStandard')
  const startDateInput = document.getElementById('filterStartDate')
  const endDateInput = document.getElementById('filterEndDate')
  const statusMessage = document.getElementById('statusMessage')
  const refreshButton = document.getElementById('refreshButton')
  const exportDropdownToggle = document.getElementById('exportDropdownToggle')
  const exportExcelButton = document.getElementById('exportExcelButton')
  const exportPdfButton = document.getElementById('exportPdfButton')
  const DIRECTION_SETTINGS = {
    uplink: {
      label: 'Tx (Uplink)'
    },
    downlink: {
      label: 'Rx (Downlink)'
    }
  }
  const ORDERED_DIRECTIONS = ['uplink', 'downlink']
  const CHART_LAYOUT = {
    PEAK_THROUGHPUT: {
      minHeight: 320,
      emptyStateMaxWidth: 420,
      containerPadding: '1.25rem',
      scenarioGapClass: 'gap-3',
      directionTitleClass: 'fw-semibold mb-3',
      containerMaxWidth: null,
      containerHeight: null
    },
    RVR: {
      minHeight: 168,
      emptyStateMaxWidth: 300,
      containerPadding: '0.5rem',
      scenarioGapClass: 'gap-2',
      directionTitleClass: 'fw-semibold mb-2',
      containerMaxWidth: null,
      containerHeight: 'min(55vh, 432px)'
    },
    RVO: {
      minHeight: 168,
      emptyStateMaxWidth: 300,
      containerPadding: '0.5rem',
      scenarioGapClass: 'gap-2',
      directionTitleClass: 'fw-semibold mb-2',
      containerMaxWidth: null,
      containerHeight: 'min(55vh, 432px)'
    }
  }
  const chartGroupsContainer = document.getElementById('performanceChartGroups')
  const dataTypeTabs = document.getElementById('performanceDataTypeTabs')
  const metricCards = document.getElementById('metricCards')
  const slaPassRateEl = document.getElementById('slaPassRate')
  const slaPassTrendEl = document.getElementById('slaPassTrend')
  const slaPassChangeEl = document.getElementById('slaPassChange')
  const lastUpdatedEl = document.getElementById('lastUpdated')
  const selectedFilesList = document.getElementById('selectedFilesList')
  const selectedFilesCount = document.getElementById('selectedFilesCount')
  const scenarioSections = new Map()
  const chartInstances = new Map()
  const chartEmptyStates = new Map()
  const polarChartInstances = new Map()

  const DATA_TYPE_OPTIONS = [
    { value: 'PEAK_THROUGHPUT', label: 'Peak Throughput' },
    { value: 'RVR', label: 'RVR' },
    { value: 'RVO', label: 'RVO' }
  ]
  let selectedDataType = 'PEAK_THROUGHPUT'

  const getSelectedDataTypeFromUrl = () => {
    const params = new URLSearchParams(window.location.search)
    const raw = params.get('datatype') ?? params.get('dataType') ?? params.get('type')
    if (!raw) return null
    const normalized = raw.toUpperCase()
    if (DATA_TYPE_OPTIONS.some(option => option.value === normalized)) {
      return normalized
    }
    return null
  }

  const getSelectedDataTypeFromSession = () => {
    const stored = (sessionStorage.getItem(SIDEBAR_DATATYPE_KEY) || '').trim().toUpperCase()
    return DATA_TYPE_OPTIONS.some(option => option.value === stored) ? stored : null
  }

  const syncSidebarDataTypeLinks = () => {
    const sidebarLinks = document.querySelectorAll(".sidebar .nav-group-items .nav-link[data-wifi-dashboard-datatype], .sidebar .nav-group-items .nav-link[href*='wifi-dashboard.html']")
    let hasActiveChild = false
    sidebarLinks.forEach(link => {
      const datasetType = (link.dataset.wifiDashboardDatatype ?? '').toUpperCase()
      let linkType = datasetType || null
      if (!linkType) {
        try {
          const url = new URL(link.getAttribute('href') ?? '', window.location.origin)
          linkType = (url.searchParams.get('datatype') ?? url.searchParams.get('dataType') ?? '').toUpperCase()
        } catch {
          linkType = null
        }
      }

      const isActive = Boolean(linkType) && linkType === selectedDataType
      link.classList.toggle('active', isActive)
      if (isActive) {
        hasActiveChild = true
        link.setAttribute('aria-current', 'page')
      } else {
        link.removeAttribute('aria-current')
      }
    })

    const sectionLink = document.querySelector(".sidebar .nav-group.show > .wifi-db-label")
    if (sectionLink) {
      sectionLink.classList.toggle('active', hasActiveChild)
      sectionLink.classList.toggle('is-section-active', hasActiveChild)
      if (hasActiveChild) {
        sectionLink.setAttribute('aria-current', 'page')
      } else {
        sectionLink.removeAttribute('aria-current')
      }
    }

    debug('syncSidebarDataTypeLinks', {
      selectedDataType,
      activeSection: hasActiveChild,
      links: Array.from(sidebarLinks)
        .map(link => ({
          href: link.getAttribute('href'),
          dataType: link.dataset.wifiDashboardDatatype ?? null,
          text: (link.textContent || '').trim(),
          active: link.classList.contains('active')
        }))
        .filter(item => Boolean(item.dataType) || (item.href ?? '').includes('datatype='))
    })
  }

  const syncSelectedDataTypeToUrl = () => {
    const url = new URL(window.location.href)
    url.pathname = `${url.pathname.replace(/\/[^/]*$/, '')}/wifi-dashboard.html`
    url.searchParams.set('datatype', selectedDataType)
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    sessionStorage.setItem(SIDEBAR_DATATYPE_KEY, selectedDataType)
    debug('syncSelectedDataTypeToUrl', {
      selectedDataType,
      href: window.location.href
    })
  }

  let latestDataset = []
  let isLoading = false
  let cachedFilterOptions = null
  let isSyncingFilters = false
  let restoredFilterState = null

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
    debug('fetchJson:start', { url })
    const response = await fetch(url)
    if (!response.ok) {
      const error = new Error(`Request failed (${response.status})`)
      warn('fetchJson:failed', { url, status: response.status })
      throw error
    }
    debug('fetchJson:ok', { url, status: response.status })
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
    if (metricCards.classList.contains('d-none')) return
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

      this.clearButton.addEventListener('click', event => {
        // Keep dropdown behavior self-contained; never let it bubble into the form.
        // (Some browsers/plugins may treat nested button clicks as form interactions.)
        event.preventDefault()
        event.stopPropagation()
        if (this.disabled) {
          return
        }

        this.clear(false)
        this.focusSearch()
      })

      if (this.showSelectAll) {
        this.selectAllButton.addEventListener('click', event => {
          event.preventDefault()
          event.stopPropagation()
          if (this.disabled || this.options.length === 0) {
            return
          }

          if (this.selectedValues.size === this.options.length) {
            this.clear(false)
          } else {
            this.selectAll(false)
          }
          this.close()
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
      exportDropdownToggle && (exportDropdownToggle.disabled = true)
      exportExcelButton && (exportExcelButton.disabled = true)
      exportPdfButton && (exportPdfButton.disabled = true)
      if (message) {
        setStatus(message)
      }
    } else {
      const shouldDisable = latestDataset.length === 0
      exportDropdownToggle && (exportDropdownToggle.disabled = shouldDisable)
      exportExcelButton && (exportExcelButton.disabled = shouldDisable)
      exportPdfButton && (exportPdfButton.disabled = shouldDisable)
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

  const resolveEffectiveDirection = item => {
    const normalized = normalizeDirection(item?.direction)
    if (normalized) {
      return normalized
    }

    if (selectedDataType === 'RVR' || selectedDataType === 'RVO') {
      return 'uplink'
    }

    return null
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

  const formatProjectLabel = item => {
    const nickname = (item?.projectNickname ?? '').trim()
    if (nickname) return nickname
    if (item?.projectId !== null && item?.projectId !== undefined) return `Project ${item.projectId}`
    const projectName = (item?.project ?? '').trim()
    if (projectName) return projectName
    return 'Unknown Project'
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

  const resolveScenarioDescriptor = item => {
    const rawBandwidth =
      parseScenarioGroupValue(item.scenarioGroupKey, 'BANDWIDTH') ??
      parseScenarioGroupValue(item.scenarioGroupKey, 'BW')
    const parsedBandwidth = Number.parseFloat(rawBandwidth ?? '')
    const parsedChannel = Number.parseInt(parseScenarioGroupValue(item.scenarioGroupKey, 'CHANNEL') ?? '', 10)

    return {
      band: item.band ?? parseScenarioGroupValue(item.scenarioGroupKey, 'BAND') ?? null,
      bandwidthMhz: Number.isFinite(item.bandwidthMhz)
        ? item.bandwidthMhz
        : (Number.isFinite(parsedBandwidth) ? parsedBandwidth : null),
      standard: item.standard ?? parseScenarioGroupValue(item.scenarioGroupKey, 'STANDARD') ?? null,
      channel: deriveChannelFromFrequency(item.centerFreqMhz) ?? (Number.isFinite(parsedChannel) ? parsedChannel : null)
    }
  }

  const buildScenarioKey = item => {
    const descriptor = resolveScenarioDescriptor(item)
    const parts = []
    if (descriptor.band) parts.push(`BAND=${String(descriptor.band).toUpperCase()}`)
    if (descriptor.standard) parts.push(`STANDARD=${String(descriptor.standard).toUpperCase()}`)
    if (Number.isFinite(descriptor.bandwidthMhz)) parts.push(`BW=${descriptor.bandwidthMhz}`)
    if (Number.isFinite(descriptor.channel)) parts.push(`CHANNEL=${descriptor.channel}`)
    if (parts.length > 0) return parts.join('|')
    return item.casePath || item.scenarioGroupKey || 'scenario'
  }

  const buildDatasetLabel = item => {
    const descriptor = resolveScenarioDescriptor(item)
    const baseLabel =
      formatProjectLabel(item) ||
      item.reportName ||
      (item.testReportId !== null && item.testReportId !== undefined ? `Report ${item.testReportId}` : 'Unknown Project')
    if (descriptor.channel !== null && descriptor.channel !== undefined) {
      return `${baseLabel} CH ${descriptor.channel}`
    }
    const parts = []
    const projectLabel = formatProjectLabel(item)
    if (projectLabel && projectLabel !== 'Unknown Project') parts.push(projectLabel)
    if (descriptor.band) {
      const bandLabel = formatBand(descriptor.band) || descriptor.band
      if (bandLabel) parts.push(bandLabel)
    }
    if (Number.isFinite(descriptor.bandwidthMhz)) parts.push(`${descriptor.bandwidthMhz}MHz`)
    if (descriptor.standard) parts.push(String(descriptor.standard).toUpperCase())
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
    const descriptor = resolveScenarioDescriptor(item)
    const scenarioKey = buildScenarioKey(item)
    const labelParts = []

    if (descriptor.band) {
      labelParts.push(formatBand(descriptor.band) || descriptor.band)
    }
    if (descriptor.standard) {
      labelParts.push(String(descriptor.standard).toUpperCase())
    }
    if (Number.isFinite(descriptor.bandwidthMhz)) {
      labelParts.push(`${descriptor.bandwidthMhz}MHz`)
    }
    if (Number.isFinite(descriptor.channel)) {
      labelParts.push(`CH ${descriptor.channel}`)
    }
    if (labelParts.length === 0 && item.casePath) {
      labelParts.push(item.casePath)
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

  const getChartLayout = () => CHART_LAYOUT[selectedDataType] ?? CHART_LAYOUT.PEAK_THROUGHPUT

  const collectFilters = () => {
    const apiDataType = selectedDataType === 'PEAK_THROUGHPUT' ? 'performance' : selectedDataType
    const collected = {
      product_line: getSelectedValues(productLineSelect),
      project: getSelectedValues(projectSelect),
      report_name: testReportSelect ? getSelectedValues(testReportSelect) : [],
      standard: getSelectedValues(standardSelect),
      data_type: apiDataType,
      start_date: startDateInput.value || '',
      end_date: endDateInput.value || '',
      limit: DEFAULT_LIMIT
    }
    debug('collectFilters', collected)
    return collected
  }

  const saveFilterState = () => {
    try {
      const payload = {
        dataType: selectedDataType,
        productLines: getSelectedValues(productLineSelect),
        projects: getSelectedValues(projectSelect),
        reportNames: testReportSelect ? getSelectedValues(testReportSelect) : [],
        standards: getSelectedValues(standardSelect),
        startDate: startDateInput?.value || '',
        endDate: endDateInput?.value || ''
      }
      sessionStorage.setItem(getFilterStateKey(), JSON.stringify(payload))
    } catch {
      // Ignore session storage failures.
    }
  }

  const loadFilterState = () => {
    try {
      const raw = sessionStorage.getItem(getFilterStateKey())
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }

  const applyRestoredSelections = filterOptions => {
    if (!restoredFilterState) {
      return
    }

    const selectValues = (element, values, validOptions) => {
      if (!element || !Array.isArray(values)) return
      const valid = new Set((validOptions ?? []).map(item => `${item}`))
      const next = values.filter(value => valid.has(`${value}`))
      const controller = getMultiSelect(element)
      if (controller) {
        controller.setSelected(next, { silent: true })
      }
    }

    selectValues(productLineSelect, restoredFilterState.productLines, filterOptions?.productLines)
    selectValues(projectSelect, restoredFilterState.projects, filterOptions?.projects)
    selectValues(testReportSelect, restoredFilterState.reportNames, filterOptions?.reportNames)
    selectValues(standardSelect, restoredFilterState.standards, filterOptions?.standards)

    if (startDateInput) {
      startDateInput.value = restoredFilterState.startDate || ''
    }
    if (endDateInput) {
      endDateInput.value = restoredFilterState.endDate || ''
    }

    restoredFilterState = null
  }

  const escapeHtml = value =>
    `${value ?? ''}`
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')

  const renderSelectedFiles = (files, { placeholder = 'No matching files.' } = {}) => {
    if (!selectedFilesList) return

    const resolved = Array.from(new Set((files ?? []).map(item => `${item ?? ''}`.trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    if (selectedFilesCount) selectedFilesCount.textContent = `${resolved.length}`

    if (resolved.length === 0) {
      selectedFilesList.innerHTML = `<li class="list-group-item bg-transparent">${escapeHtml(placeholder)}</li>`
      return
    }

    selectedFilesList.innerHTML = resolved
      .map(name => `<li class="list-group-item bg-transparent text-truncate" title="${escapeHtml(name)}">${escapeHtml(name)}</li>`)
      .join('')
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

  const fetchFilters = async () => {
    const filters = collectFilters()
    const queryString = buildQueryString(filters)
    const endpoints = []
    endpoints.push(queryString ? `${API_BASE}/filters?${queryString}` : `${API_BASE}/filters`)
    if (queryString) {
      endpoints.push(`${API_BASE}/filters`)
    }

    let lastError = null
    for (const endpoint of endpoints) {
      debug('fetchFilters:request', { endpoint, filters })
      const response = await fetch(endpoint)
      if (response.ok) {
        const payload = await response.json()
        debug('fetchFilters:success', {
          endpoint,
          keys: Object.keys(payload || {}),
          counts: {
            productLines: payload?.productLines?.length ?? null,
            projects: payload?.projects?.length ?? null,
            standards: payload?.standards?.length ?? null,
            testReports: payload?.testReports?.length ?? null,
            reportNames: payload?.reportNames?.length ?? null
          },
          samples: {
            productLines: payload?.productLines?.slice?.(0, 5) ?? [],
            projects: payload?.projects?.slice?.(0, 5) ?? [],
            standards: payload?.standards?.slice?.(0, 5) ?? []
          }
        })
        return payload
      }

      const message = await response.text()
      warn('fetchFilters:failed', { endpoint, status: response.status, message })
      lastError = new Error(message || `Failed to fetch filter options (${response.status})`)
    }

    throw lastError ?? new Error('Failed to fetch filter options')
  }

  const fetchPerformanceData = async () => {
    const filters = collectFilters()
    const queryString = buildQueryString(filters)
    const endpoint = queryString ? `${API_BASE}/performance?${queryString}` : `${API_BASE}/performance`
    debug('fetchPerformanceData:request', { endpoint, filters })
    const response = await fetch(endpoint)
    if (!response.ok) {
      const message = await response.text()
      warn('fetchPerformanceData:failed', { endpoint, status: response.status, message })
      throw new Error(message || 'Failed to fetch performance data')
    }
    const payload = await response.json()
    debug('fetchPerformanceData:success', {
      endpoint,
      rowCount: payload?.data?.length ?? null,
      summary: payload?.summary ?? null,
      metadata: payload?.metadata ?? null,
      sample: payload?.data?.slice?.(0, 3) ?? []
    })
    return payload
  }

  const prepareScenarioGroups = data => {
    const scenarios = new Map()

    data.forEach(item => {
      const direction = resolveEffectiveDirection(item)
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

  const preparePolarScenarioGroups = data => {
    const scenarios = new Map()

    ;(data ?? []).forEach(item => {
      const direction = resolveEffectiveDirection(item)
      if (!direction || !Number.isFinite(item.angleDeg) || !Number.isFinite(item.throughputAvgMbps)) {
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

      const bucket = scenarios.get(scenarioKey).directions[direction]
      const seriesKey = buildSeriesKey(item)
      if (!bucket.has(seriesKey)) {
        bucket.set(seriesKey, {
          label: buildDatasetLabel(item),
          angles: new Map()
        })
      }

      const angle = Number(item.angleDeg)
      if (!bucket.get(seriesKey).angles.has(angle)) {
        bucket.get(seriesKey).angles.set(angle, [])
      }
      bucket.get(seriesKey).angles.get(angle).push(Number(item.throughputAvgMbps))
    })

    return Array.from(scenarios.values()).map(scenario => ({
      key: scenario.key,
      label: scenario.label,
      directions: Object.fromEntries(
        ORDERED_DIRECTIONS.map(direction => [
          direction,
          Array.from(scenario.directions[direction].values()).map(group => ({
            label: group.label,
            angles: group.angles
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
    section.className = `chart-scenario d-flex flex-column ${getChartLayout().scenarioGapClass || 'gap-3'}`
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
      directionTitle.className = getChartLayout().directionTitleClass || 'fw-semibold mb-3'
      directionTitle.textContent = DIRECTION_SETTINGS[direction].label
      directionSection.appendChild(directionTitle)

      const container = document.createElement('div')
      container.className = 'chart-container position-relative'
      container.style.minHeight = `${getChartLayout().minHeight}px`
      if (getChartLayout().containerPadding) {
        container.style.padding = getChartLayout().containerPadding
      }
      if (getChartLayout().containerHeight) {
        container.style.height = getChartLayout().containerHeight
      }
      if (Number.isFinite(getChartLayout().containerMaxWidth)) {
        container.style.maxWidth = `${getChartLayout().containerMaxWidth}px`
        container.style.marginInline = 'auto'
      }

      const canvas = document.createElement('canvas')
      canvas.style.minHeight = `${getChartLayout().minHeight}px`
      canvas.style.width = '100%'
      canvas.style.maxWidth = '100%'
      canvas.style.height = '100%'
      canvas.id = `performanceChart-${sanitizeScenarioKeyForId(scenarioKey)}-${direction}`
      container.appendChild(canvas)

      const emptyState = document.createElement('div')
      emptyState.className = 'chart-empty-state fw-semibold position-absolute top-50 start-50 translate-middle text-center'
      emptyState.style.display = 'none'
      emptyState.style.maxWidth = `${getChartLayout().emptyStateMaxWidth}px`
      emptyState.style.width = 'calc(100% - 2rem)'
      emptyState.style.padding = '0.85rem 1rem'
      emptyState.style.fontSize = '0.95rem'
      emptyState.style.lineHeight = '1.4'
      emptyState.textContent = `No data for ${DIRECTION_SETTINGS[direction].label}. Adjust the filters and try again.`
      container.appendChild(emptyState)

      directionSection.appendChild(container)
      section.appendChild(directionSection)

      directionBlocks[direction] = {
        section: directionSection,
        headingElement: directionTitle,
        canvas,
        emptyState,
        hasData: false
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

  const syncDirectionVisibilityForScenario = scenarioKey => {
    const record = scenarioSections.get(scenarioKey)
    if (!record) return

    const blocks = record.directionBlocks ?? {}
    const hasDataByDirection = ORDERED_DIRECTIONS.map(direction => Boolean(blocks[direction]?.hasData))
    const dataCount = hasDataByDirection.filter(Boolean).length

    ORDERED_DIRECTIONS.forEach((direction, idx) => {
      const section = blocks[direction]?.section
      if (!section) return

      if (dataCount === 1) {
        section.style.display = hasDataByDirection[idx] ? '' : 'none'
        return
      }

      section.style.display = ''
    })
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

    const record = scenarioSections.get(scenarioKey)
    if (record?.directionBlocks?.[direction]) {
      record.directionBlocks[direction].hasData = datasets.length > 0
      syncDirectionVisibilityForScenario(scenarioKey)
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

    const polarCharts = polarChartInstances.get(scenarioKey)
    if (polarCharts) {
      ORDERED_DIRECTIONS.forEach(direction => {
        polarCharts[direction]?.destroy()
      })
      polarChartInstances.delete(scenarioKey)
    }

    chartEmptyStates.delete(scenarioKey)
  }

  const clearAllCharts = () => {
    const keys = Array.from(new Set([...chartInstances.keys(), ...scenarioSections.keys(), ...polarChartInstances.keys()]))
    keys.forEach(key => removeScenarioCharts(key))

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
            <td>${formatProjectLabel(item) ?? '-'}</td>
            <td>${formatNumber(item.throughputAvgMbps)}</td>
            <td>${formatBand(item.band) || item.band || '-'}</td>
            <td>${Number.isFinite(item.bandwidthMhz) ? `${item.bandwidthMhz} MHz` : '-'}</td>
            <td>${item.standard ?? '-'}</td>
            <td>${DIRECTION_SETTINGS[resolveEffectiveDirection(item)]?.label ?? '-'}</td>
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

  const ensurePolarDirectionalChart = (scenarioKey, scenarioLabel, direction) => {
    const section = ensureScenarioSection(scenarioKey, scenarioLabel)
    if (!section) {
      return null
    }

    let scenarioCharts = polarChartInstances.get(scenarioKey)
    if (!scenarioCharts) {
      scenarioCharts = {}
      polarChartInstances.set(scenarioKey, scenarioCharts)
    }

    if (scenarioCharts[direction]) {
      return scenarioCharts[direction]
    }

    const canvas = section.directionBlocks[direction]?.canvas
    if (!canvas) {
      return null
    }

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
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: coreui.Utils.getStyle('--cui-body-color')
            }
          },
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
            grid: {
              circular: true
            },
            ticks: { display: true },
            pointLabels: {
              display: true,
              centerPointLabels: false,
              color: coreui.Utils.getStyle('--cui-body-color'),
              font: {
                size: 11,
                family: coreui.Utils.getStyle('--cui-body-font-family') || 'inherit'
              }
            },
            title: { display: true, text: 'Throughput (Mbps)' }
          }
        }
      }
    })

    scenarioCharts[direction] = chart
    return chart
  }

  const updatePolarDirectionalChart = (scenarioKey, scenarioLabel, direction, groups) => {
    const chart = ensurePolarDirectionalChart(scenarioKey, scenarioLabel, direction)
    if (!chart) {
      return
    }

    const palette = getColorPalette()
    const toFill = color => {
      if (!color) return 'rgba(50,31,219,0.15)'
      if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', ', 0.15)')
      return color
    }
    const angleSet = new Set()
    groups.forEach(group => {
      group.angles?.forEach?.((_, key) => {
        const value = Number(key)
        if (Number.isFinite(value)) angleSet.add(value)
      })
    })
    const observedAngles = Array.from(angleSet.values()).sort((a, b) => a - b)
    const pickStep = anglesList => {
      if (anglesList.some(angle => Math.abs(angle % 30) < 1e-9)) return 30
      if (anglesList.some(angle => Math.abs(angle % 45) < 1e-9)) return 45
      if (anglesList.some(angle => Math.abs(angle % 15) < 1e-9)) return 15
      return 45
    }
    const step = pickStep(observedAngles)
    const angles = observedAngles.length > 0 && observedAngles.length < 6
      ? Array.from({ length: Math.floor(360 / step) + 1 }, (_, idx) => idx * step)
      : observedAngles
    const labels = angles.map(angle => `${formatNumber(angle, 0)}°`)

    const datasets = groups.map((group, index) => {
      const color = palette[index % palette.length]?.border ?? '#321fdb'
      return {
        label: group.label,
        data: angles.map(angle => {
          const values = group.angles.get(angle) ?? []
          if (values.length === 0) return null
          const sum = values.reduce((acc, value) => acc + Number(value || 0), 0)
          return sum / values.length
        }),
        borderColor: color,
        backgroundColor: toFill(color),
        pointBackgroundColor: color,
        fill: false,
        spanGaps: true
      }
    })

    chart.data.labels = labels
    chart.data.datasets = datasets
    chart.options.plugins.legend.display = datasets.length > 0
    chart.options.plugins.legend.labels.color = coreui.Utils.getStyle('--cui-body-color')
    chart.options.scales.r.pointLabels.color = coreui.Utils.getStyle('--cui-body-color')
    chart.update()

    const hasAnyPoint = datasets.some(dataset => (dataset.data ?? []).some(value => Number.isFinite(value)))
    const emptyState = chartEmptyStates.get(scenarioKey)?.[direction]
    if (emptyState) {
      emptyState.style.display = hasAnyPoint ? 'none' : 'block'
    }

    const record = scenarioSections.get(scenarioKey)
    if (record?.directionBlocks?.[direction]) {
      record.directionBlocks[direction].hasData = hasAnyPoint
      syncDirectionVisibilityForScenario(scenarioKey)
    }
  }

  const updateRvoCharts = data => {
    const scenarios = preparePolarScenarioGroups(data)
    const activeKeys = new Set(scenarios.map(item => item.key))
    const knownKeys = new Set([...polarChartInstances.keys(), ...scenarioSections.keys()])
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
        updatePolarDirectionalChart(scenario.key, scenario.label, direction, scenario.directions[direction] ?? [])
      })
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
    exportDropdownToggle && (exportDropdownToggle.disabled = !hasPoints)
    exportExcelButton && (exportExcelButton.disabled = !hasPoints)
    exportPdfButton && (exportPdfButton.disabled = !hasPoints)
  }

  const updateVisualization = data => {
    if (selectedDataType === 'PEAK_THROUGHPUT') {
      clearAllCharts()
      renderPeakTable(data)
      const enabled = Boolean(data && data.length > 0)
      exportDropdownToggle && (exportDropdownToggle.disabled = !enabled)
      exportExcelButton && (exportExcelButton.disabled = !enabled)
      // Peak Throughput is currently rendered as a table (no chart canvas). Keep PDF disabled to avoid errors.
      exportPdfButton && (exportPdfButton.disabled = true)
      return
    }

    if (selectedDataType === 'RVO') {
      clearAllCharts()
      updateRvoCharts(data)
      const enabled = Boolean(data && data.length > 0)
      exportDropdownToggle && (exportDropdownToggle.disabled = !enabled)
      exportExcelButton && (exportExcelButton.disabled = !enabled)
      exportPdfButton && (exportPdfButton.disabled = !enabled)
      return
    }

    clearAllCharts()
    updateCharts(data)
  }

  document.addEventListener('app:themechange', () => {
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

  const exportToPdf = () => {
    const JsPdf = window.jspdf?.jsPDF
    if (!JsPdf) {
      throw new Error('PDF export is unavailable (jsPDF not loaded).')
    }

    const readCssVar = (name, fallback) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      return value || fallback
    }

    const buildCanvasTitle = canvas => {
      const directionTitle = canvas.closest('.chart-section')?.querySelector('h6')?.textContent?.trim() ?? ''
      const scenarioTitle = canvas.closest('section')?.querySelector('h6')?.textContent?.trim() ?? ''
      const parts = [scenarioTitle, directionTitle].filter(Boolean)
      return parts.length > 0 ? parts.join(' - ') : 'Chart'
    }

    const renderCanvasForPdf = (canvas, { padding = 16 } = {}) => {
      // Chart canvases are transparent. When exported to JPEG/PNG, transparent pixels may become black in viewers.
      // Composite into a solid background that matches the dashboard surface.
      const bg = readCssVar('--app-surface-alt', readCssVar('--cui-body-bg', '#ffffff'))
      const composed = document.createElement('canvas')
      composed.width = canvas.width + padding * 2
      composed.height = canvas.height + padding * 2
      const ctx = composed.getContext('2d')
      if (!ctx) {
        throw new Error('Failed to create PDF export canvas.')
      }
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, composed.width, composed.height)
      ctx.drawImage(canvas, padding, padding)
      return composed
    }

    const canvases = Array.from(chartGroupsContainer?.querySelectorAll('canvas') ?? [])
      .filter(canvas => canvas instanceof HTMLCanvasElement)
      .filter(canvas => canvas.offsetParent !== null)
      .filter(canvas => canvas.width > 0 && canvas.height > 0)

    if (canvases.length === 0) {
      throw new Error('No charts available for PDF export.')
    }

    const doc = new JsPdf({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 24
    const slotGap = 14
    const titleHeight = 36
    const perPage = 2

    const availableWidth = pageWidth - margin * 2
    const availableHeight = pageHeight - margin * 2
    const slotHeight = (availableHeight - slotGap) / 2

    canvases.forEach((canvas, index) => {
      const pageIndex = Math.floor(index / perPage)
      const slotIndex = index % perPage
      if (pageIndex > 0 && slotIndex === 0) {
        doc.addPage()
      }

      const slotTop = margin + slotIndex * (slotHeight + slotGap)

      const title = buildCanvasTitle(canvas)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.text(title, margin, slotTop + 16)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.text(`Type: ${selectedDataType}`, margin, slotTop + 32)

      const composed = renderCanvasForPdf(canvas, { padding: 18 })
      const imgWidth = composed.width
      const imgHeight = composed.height

      const imgAvailableWidth = availableWidth
      const imgAvailableHeight = slotHeight - titleHeight
      const scale = Math.min(imgAvailableWidth / imgWidth, imgAvailableHeight / imgHeight)
      const drawWidth = imgWidth * scale
      const drawHeight = imgHeight * scale
      const x = margin + (imgAvailableWidth - drawWidth) / 2
      const y = slotTop + titleHeight

      const dataUrl = composed.toDataURL('image/png')
      doc.addImage(dataUrl, 'PNG', x, y, drawWidth, drawHeight)
    })

    const timestamp = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0]
    doc.save(`wifi-performance-${timestamp}.pdf`)
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
          populateSelect(testReportSelect, filterOptions.reportNames ?? [], 'All Test Reports')
        }
        populateSelect(standardSelect, filterOptions.standards, 'All Standards')
        applyRestoredSelections(filterOptions)

        const selected = testReportSelect ? getSelectedValues(testReportSelect) : []
        const filesToShow = selected.length > 0 ? selected : []
        renderSelectedFiles(filesToShow, { placeholder: 'Select test reports and apply the filters.' })
        isSyncingFilters = false
      }

      if (refreshData) {
        const selectedReports = testReportSelect ? getSelectedValues(testReportSelect) : []
        if (testReportSelect && selectedReports.length === 0) {
          latestDataset = []
          updateVisualization([])
          renderSelectedFiles([], { placeholder: 'Select test reports and apply the filters.' })
          setStatus('Select at least one test report.')
          return
        }
        const { data, metadata } = await fetchPerformanceData()
        latestDataset = data
        updateVisualization(data)
        const reportsToShow = data.length > 0
          ? (data ?? []).map(row => row.reportName ?? row.csvName).filter(Boolean)
          : selectedReports
        renderSelectedFiles(reportsToShow, { placeholder: 'No data loaded.' })
        saveFilterState()

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
    const selectedReports = testReportSelect ? getSelectedValues(testReportSelect) : []
    if (selectedReports.length === 0) {
      latestDataset = []
      updateVisualization([])
      renderSelectedFiles([], { placeholder: 'Select test reports and apply the filters.' })
      setStatus('Select at least one test report.')
      return
    }
    await loadFiltersAndData({ refreshFilters: false, refreshData: true })
  }

  const handleFormReset = () => {
    window.setTimeout(() => {
      multiSelectControllers.forEach(controller => {
        controller.clear(true)
      })
      loadFiltersAndData({ refreshFilters: true, refreshData: false, initial: true })
    }, 0)
  }

  const handleCriteriaChange = () => {
    if (isSyncingFilters || isLoading) {
      return
    }
    loadFiltersAndData({ refreshFilters: true, refreshData: false })
  }

  const switchDataType = (value, { source = 'unknown' } = {}) => {
    if (!value || value === selectedDataType) {
      return
    }

    debug('datatype_switch', {
      from: selectedDataType,
      to: value,
      source,
      hrefBefore: window.location.href
    })

    selectedDataType = value
    syncSelectedDataTypeToUrl()
    syncSidebarDataTypeLinks()

    // Clear current UI state before restoring the per-datatype state.
    multiSelectControllers.forEach(controller => {
      controller.clear(true)
    })
    if (startDateInput) startDateInput.value = ''
    if (endDateInput) endDateInput.value = ''
    restoredFilterState = loadFilterState()

    if (dataTypeTabs) {
      dataTypeTabs.querySelectorAll('[data-performance-datatype]').forEach(inner => {
        const isActive = inner.dataset.performanceDatatype === selectedDataType
        inner.classList.toggle('active', isActive)
        inner.setAttribute('aria-selected', isActive ? 'true' : 'false')
      })
    }

    loadFiltersAndData({ refreshFilters: true, refreshData: true })
  }

  const init = () => {
    removeSummaryRowIfPresent()
    if (!form) {
      console.warn('Filter form not found. wifi-dashboard.js was not initialized.')
      return
    }

    selectedDataType = getSelectedDataTypeFromUrl() ?? getSelectedDataTypeFromSession() ?? selectedDataType
    sessionStorage.setItem(SIDEBAR_DATATYPE_KEY, selectedDataType)
    restoredFilterState = loadFilterState()
    debug('init:selectedDataType', {
      fromUrl: getSelectedDataTypeFromUrl(),
      fromSession: getSelectedDataTypeFromSession(),
      resolved: selectedDataType,
      href: window.location.href
    })
    syncSidebarDataTypeLinks()

    registerMultiSelect(productLineSelect, { placeholder: 'All Product Lines' })
    registerMultiSelect(projectSelect, { placeholder: 'All Projects' })
    if (testReportSelect) {
      registerMultiSelect(testReportSelect, { placeholder: 'Select test reports' })
    }
    registerMultiSelect(standardSelect, { placeholder: 'All Standards' })

    form.addEventListener('submit', handleFormSubmit)
    form.addEventListener('reset', handleFormReset)
    refreshButton.addEventListener('click', () => {
      const selectedReports = testReportSelect ? getSelectedValues(testReportSelect) : []
      if (selectedReports.length === 0) {
        setStatus('Select at least one test report.')
        return
      }
      loadFiltersAndData({ refreshFilters: false, refreshData: true })
    })
    exportExcelButton?.addEventListener('click', () => {
      try {
        exportToExcel()
      } catch (error) {
        console.error(error)
        window.alert(error?.message ?? 'Failed to export Excel.')
      }
    })
    exportPdfButton?.addEventListener('click', () => {
      try {
        exportToPdf()
      } catch (error) {
        console.error(error)
        window.alert(error?.message ?? 'Failed to export PDF.')
      }
    })
    productLineSelect.addEventListener('change', handleCriteriaChange)
    projectSelect.addEventListener('change', handleCriteriaChange)
    standardSelect.addEventListener('change', handleCriteriaChange)
    startDateInput?.addEventListener('change', () => {
      saveFilterState()
    })
    endDateInput?.addEventListener('change', () => {
      saveFilterState()
    })

    if (dataTypeTabs) {
      dataTypeTabs.querySelectorAll('[data-performance-datatype]').forEach(inner => {
        const isActive = inner.dataset.performanceDatatype === selectedDataType
        inner.classList.toggle('active', isActive)
        inner.setAttribute('aria-selected', isActive ? 'true' : 'false')
      })
      dataTypeTabs.querySelectorAll('[data-performance-datatype]').forEach(button => {
        button.addEventListener('click', () => {
          const value = button.dataset.performanceDatatype
          if (!value) return
          switchDataType(value, { source: 'tabs' })
        })
      })
    }

    const currentPath = (window.location.pathname || '').toLowerCase()
    const isDashboardPage = currentPath.endsWith('/wifi-dashboard.html') || currentPath.endsWith('\\wifi-dashboard.html') || currentPath.endsWith('wifi-dashboard.html')
    const sidebarRoot = document.getElementById('sidebar') ?? document.querySelector('.sidebar')
    if (sidebarRoot) {
      sidebarRoot.querySelectorAll('[data-wifi-dashboard-datatype]').forEach(button => {
        if (!(button instanceof HTMLElement)) return
        if (button.dataset.wifiDashboardBound === 'true') return
        button.dataset.wifiDashboardBound = 'true'
        button.addEventListener('click', () => {
          const value = (button.dataset.wifiDashboardDatatype ?? '').toUpperCase()
          if (!value || !DATA_TYPE_OPTIONS.some(option => option.value === value)) return
          if (!isDashboardPage) {
            window.location.href = `wifi-dashboard.html?datatype=${encodeURIComponent(value)}`
            return
          }
          switchDataType(value, { source: 'sidebar' })
        })
      })
    }

    loadWeeklyTests()
    const hasStoredReports = Boolean(restoredFilterState?.reportNames?.length)
    loadFiltersAndData({ refreshFilters: true, refreshData: hasStoredReports, initial: !hasStoredReports })
  }

  document.addEventListener('DOMContentLoaded', init)
})()
