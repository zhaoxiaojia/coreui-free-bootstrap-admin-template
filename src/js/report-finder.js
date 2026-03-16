(() => {
  const DEFAULT_API_BASE = new URL('/api', window.location.origin).toString()
  const inferLocalApiBase = () => {
    const hostname = window.location.hostname
    const port = window.location.port

    if (hostname !== 'localhost' && hostname !== '127.0.0.1') return ''
    if (!port) return ''

    const portsWithApi = new Set(['3000', '5000'])
    if (portsWithApi.has(port)) return ''

    return `${window.location.protocol}//${hostname}:5000/api`
  }

  const API_BASE = window.WIFI_DASHBOARD_API_BASE ?? inferLocalApiBase() ?? DEFAULT_API_BASE

  const form = document.getElementById('reportFinderForm')
  const input = document.getElementById('reportFinderQuery')
  const results = document.getElementById('reportFinderResults')
  const recentGrid = document.getElementById('reportFinderRecentGrid')
  const frequentGrid = document.getElementById('reportFinderFrequentGrid')
  const projectSelect = document.getElementById('reportFinderProject')
  const projectDropdownToggle = document.getElementById('reportFinderProjectToggle')
  const projectDropdownMenu = document.getElementById('reportFinderProjectMenu')
  const reportTypeSelect = document.getElementById('reportFinderReportType')
  const brandSelect = document.getElementById('reportFinderBrand')
  const productLineSelect = document.getElementById('reportFinderProductLine')
  const mainChipSelect = document.getElementById('reportFinderMainChip')
  const selectedFiltersEl = document.getElementById('reportFinderSelectedFilters')
  const resetButton = document.getElementById('reportFinderReset')

  let activeRequest = 0

  const escapeHtml = value => {
    const text = `${value ?? ''}`
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  const clampLabel = (value, maxLen) => {
    const text = `${value ?? ''}`.trim()
    if (!text) return ''
    if (text.length <= maxLen) return text
    return `${text.slice(0, Math.max(0, maxLen - 1))}…`
  }

  const hashToHue = value => {
    const text = `${value ?? ''}`
    let hash = 0
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0
    }
    return hash % 360
  }

  const pickIconLabel = ({ csvName, dataType }) => {
    const type = `${dataType ?? ''}`.trim()
    if (type) return clampLabel(type.toUpperCase(), 4)

    const name = `${csvName ?? ''}`.trim()
    const ext = name.includes('.') ? name.split('.').pop() : ''
    if (ext) return clampLabel(ext.toUpperCase(), 4)

    return 'RPT'
  }

  const fetchJson = async url => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`)
    }
    return response.json()
  }

  const formatProjectLabel = project => {
    const name = project?.projectName ?? ''
    const productLine = project?.productLine ?? ''
    const brand = project?.brand ?? ''
    const parts = [name, productLine, brand].filter(Boolean)
    return parts.join(' · ')
  }

  const pad2 = value => String(value).padStart(2, '0')

  const formatDateParts = raw => {
    if (!raw) return null
    const date = new Date(raw)
    if (!Number.isFinite(date.getTime())) return null
    const yyyy = String(date.getFullYear())
    const mm = pad2(date.getMonth() + 1)
    const dd = pad2(date.getDate())
    const HH = pad2(date.getHours())
    const MM = pad2(date.getMinutes())
    const SS = pad2(date.getSeconds())
    return { date: `${yyyy}${mm}${dd}`, time: `${HH}${MM}${SS}` }
  }

  const extractDateTimeFromName = value => {
    const text = `${value ?? ''}`
    const match = text.match(/(\d{8})_(\d{6})/)
    if (!match) return null
    return { date: match[1], time: match[2] }
  }

  const buildReportDisplayName = row => {
    const testType = `${row?.dataType ?? ''}`.trim()
    const projectName = `${row?.project?.projectName ?? ''}`.trim()
    const parts = extractDateTimeFromName(row?.reportName ?? row?.csvName ?? null)
      ?? formatDateParts(row?.lastUpdatedAt ?? row?.createdAt ?? null)
    const dateText = parts?.date ?? ''
    const timeText = parts?.time ?? ''

    const segments = [testType, projectName, dateText, timeText].filter(Boolean)
    if (segments.length > 0) return segments.join('_')
    return `${row?.reportName ?? row?.csvName ?? 'Report'}`
  }

  const buildResultItem = row => {
    const reportId = row?.reportId ?? null
    const csvName = row?.csvName ?? 'Report'
    const dataType = row?.dataType ?? 'Unknown'
    const createdAt = row?.lastUpdatedAt ?? ''
    const projectText = formatProjectLabel(row?.project)
    const metaParts = [projectText, dataType, createdAt].filter(Boolean)
    const meta = metaParts.join(' · ')

    return `
      <a class="list-group-item list-group-item-action d-flex justify-content-between align-items-center gap-3" href="report.html?report_id=${reportId}&data_type=${encodeURIComponent(dataType)}">
        <div class="min-w-0">
          <div class="fw-semibold text-truncate">${csvName}</div>
          <div class="small text-muted text-truncate">${meta}</div>
        </div>
        <span class="badge text-bg-light border">#${reportId}</span>
      </a>
    `.trim()
  }

  const buildCard = row => {
    const reportId = row?.reportId ?? null
    const dataType = row?.dataType ?? 'Unknown'
    const scoreText = window.WIFI_DASHBOARD_SCORING?.formatScoreByMetric
      ? window.WIFI_DASHBOARD_SCORING.formatScoreByMetric('composite_score', row?.score)
      : (Number.isFinite(Number(row?.score)) ? String(Number(row.score)) : '-')
    const createdAt = row?.lastUpdatedAt ?? ''
    const projectName = row?.project?.projectName ?? ''
    const displayName = buildReportDisplayName(row)
    const cardHue = hashToHue(`${reportId}|${dataType}|${projectName}`)
    const href = `report.html?report_id=${reportId}&data_type=${encodeURIComponent(dataType)}`
    const typeLabel = `${dataType ?? ''}`.trim() || 'Type'

    return `
      <div class="col-12 col-md-6 col-xl-4">
        <div class="card report-card h-100" style="--card-hue: ${cardHue};">
          <div class="card-body d-flex flex-column report-card__body">
            <a class="stretched-link" href="${href}" aria-label="Open report"></a>

            <div class="d-flex align-items-start justify-content-between gap-3">
              <div class="report-card__typeText">${escapeHtml(typeLabel)}</div>
            </div>

            <div class="report-card__scoreCenter">${escapeHtml(scoreText)}</div>

            <div class="mt-auto d-flex align-items-end justify-content-between gap-2 report-card__bottom">
              <div class="report-card__meta small text-muted">
                ${projectName ? `<div class="text-truncate">${escapeHtml(projectName)}</div>` : ''}
                ${createdAt ? `<div class="text-truncate">${escapeHtml(createdAt)}</div>` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    `.trim()
  }

  const dedupeRecentRows = (rows, maxRows) => {
    const seen = new Set()
    const out = []

    for (const row of rows ?? []) {
      const key = [
        row?.reportName ?? row?.csvName ?? '',
        row?.dataType ?? '',
        row?.project?.projectId ?? '',
        row?.lastUpdatedAt ?? row?.createdAt ?? ''
      ].join('|')
      if (seen.has(key)) continue
      seen.add(key)
      out.push(row)
      if (Number.isFinite(maxRows) && out.length >= maxRows) break
    }

    return out
  }

  const setResultsVisible = isVisible => {
    if (!results) return
    results.classList.toggle('d-none', !isVisible)
  }

  const renderSearchResults = payload => {
    if (!results) return
    const rows = payload?.rows ?? []
    if (rows.length === 0) {
      results.innerHTML = `
        <div class="list-group-item text-muted small">No matching reports.</div>
      `.trim()
      setResultsVisible(true)
      return
    }

    results.innerHTML = rows.map(buildResultItem).join('')
    setResultsVisible(true)
  }

  const renderGrid = (gridEl, rows) => {
    if (!gridEl) return
    if (rows.length === 0) {
      gridEl.innerHTML = `<div class="text-muted small">No reports.</div>`
      return
    }

    gridEl.innerHTML = `
      <div class="row g-3">
        ${rows.map(buildCard).join('')}
      </div>
    `.trim()
  }

  const getSearchParams = () => {
    const project = projectSelect?.value ? `${projectSelect.value}` : ''
    const dataType = reportTypeSelect?.value ? `${reportTypeSelect.value}` : ''
    const brand = brandSelect?.value ? `${brandSelect.value}` : ''
    const productLine = productLineSelect?.value ? `${productLineSelect.value}` : ''
    const mainChip = mainChipSelect?.value ? `${mainChipSelect.value}` : ''
    return { project, dataType, brand, productLine, mainChip }
  }

  const setProjectFilter = (value, label) => {
    if (projectSelect) projectSelect.value = `${value ?? ''}`
    if (projectDropdownToggle) projectDropdownToggle.textContent = `${label ?? 'Projects: All'}`
  }

  const search = query => {
    const requestId = (activeRequest += 1)
    const url = new URL(`${API_BASE}/reports`, window.location.origin)
    url.searchParams.set('q', query)
    url.searchParams.set('limit', '8')
    const { project, dataType, brand, productLine, mainChip } = getSearchParams()
    if (project) url.searchParams.set('project', project)
    if (dataType) url.searchParams.set('data_type', dataType)
    if (brand) url.searchParams.set('brand', brand)
    if (productLine) url.searchParams.set('product_line', productLine)
    if (mainChip) url.searchParams.set('main_chip', mainChip)

    fetchJson(url.toString())
      .then(payload => {
        if (requestId !== activeRequest) return
        renderSearchResults(payload)
      })
      .catch(() => {
        if (requestId !== activeRequest) return
        if (!results) return
        results.innerHTML = `<div class="list-group-item text-muted small">Search failed.</div>`
        setResultsVisible(true)
      })
  }

  const searchWithCurrentFilters = ({ query, limit = 20 } = {}) => {
    const requestId = (activeRequest += 1)
    const url = new URL(`${API_BASE}/reports`, window.location.origin)
    url.searchParams.set('limit', `${limit}`)
    const normalizedQuery = `${query ?? ''}`.trim()
    if (normalizedQuery) url.searchParams.set('q', normalizedQuery)

    const { project, dataType, brand, productLine, mainChip } = getSearchParams()
    if (project) url.searchParams.set('project', project)
    if (dataType) url.searchParams.set('data_type', dataType)
    if (brand) url.searchParams.set('brand', brand)
    if (productLine) url.searchParams.set('product_line', productLine)
    if (mainChip) url.searchParams.set('main_chip', mainChip)

    return fetchJson(url.toString())
      .then(payload => {
        if (requestId !== activeRequest) return null
        return payload
      })
  }

  const loadRecent = () => {
    if (!recentGrid) return
    fetchJson(`${API_BASE}/reports/recent?limit=9`)
      .then(payload => {
        const rows = dedupeRecentRows(payload?.rows ?? [], 9)
        renderGrid(recentGrid, rows)
      })
      .catch(() => {
        recentGrid.innerHTML = `<div class="text-muted small">Failed to load recent reports.</div>`
      })
  }

  const loadFrequent = () => {
    if (!frequentGrid) return
    const historyKey = 'wifi-dashboard-report-history'
    const stored = localStorage.getItem(historyKey)
    const parsed = stored ? JSON.parse(stored) : {}
    const items = Object.entries(parsed)
      .map(([key, entry]) => {
        const [rawId, rawType] = `${key}`.split('|')
        return {
          key: `${key}`,
          id: Number.parseInt(`${rawId ?? ''}`, 10),
          dataType: `${rawType ?? ''}`.trim(),
        count: Number(entry?.count ?? 0),
        lastVisitedAt: Number(entry?.lastVisitedAt ?? 0)
        }
      })
      .filter(item => Number.isFinite(item.id) && item.id > 0 && item.count > 0 && item.dataType.length > 0)
      .sort((a, b) => b.count - a.count || b.lastVisitedAt - a.lastVisitedAt)
      .slice(0, 9)
      .map(item => item)

    if (items.length === 0) {
      frequentGrid.innerHTML = `<div class="text-muted small">No frequently viewed reports yet.</div>`
      return
    }

    const ids = [...new Set(items.map(item => item.id))]
    fetchJson(`${API_BASE}/reports/batch/by-ids?ids=${ids.join(',')}`)
      .then(payload => {
        const rows = Array.isArray(payload?.rows) ? payload.rows : []
        const rowByKey = new Map(rows.map(row => [`${row.reportId}|${row.dataType}`, row]))
        const ordered = items
          .map(item => rowByKey.get(`${item.id}|${item.dataType}`))
          .filter(Boolean)
        renderGrid(frequentGrid, ordered)
      })
      .catch(() => {
        frequentGrid.innerHTML = `<div class="text-muted small">Failed to load frequently viewed reports.</div>`
      })
  }

  const navigateToReport = raw => {
    const trimmed = `${raw ?? ''}`.trim()
    if (!trimmed) return
    const numeric = /^\d+$/.test(trimmed) ? trimmed : null
    if (numeric) {
      const { dataType } = getSearchParams()
      const suffix = dataType ? `&data_type=${encodeURIComponent(dataType)}` : ''
      window.location.href = `report.html?report_id=${numeric}${suffix}`
      return
    }
    search(trimmed)
  }

  const renderSelectedFilters = () => {
    if (!selectedFiltersEl) return

    const { project, dataType, brand, productLine, mainChip } = getSearchParams()
    const selected = []

    const pushFilter = (key, label, value, text) => {
      if (!value) return
      selected.push({ key, label, value, text: text ?? value })
    }

    const projectLabelFromToggle = `${projectDropdownToggle?.textContent ?? ''}`.trim()
    const projectText = project ? projectLabelFromToggle || project : ''

    pushFilter('project', 'Project', project, projectText)
    pushFilter('brand', 'Brand', brand)
    pushFilter('product_line', 'Product Line', productLine)
    pushFilter('main_chip', 'Main Chip', mainChip)
    pushFilter('data_type', 'Type', dataType)

    if (selected.length === 0) {
      selectedFiltersEl.innerHTML = `<div class="small text-muted">No filters selected.</div>`
      return
    }

    selectedFiltersEl.innerHTML = `
      <div class="small text-muted mb-2">Selected filters</div>
      <div class="d-flex flex-wrap gap-2">
        ${selected
          .map(item => `
            <button type="button" class="btn btn-sm btn-outline-secondary" data-filter-key="${item.key}" aria-label="Remove ${item.label}">
              <span class="fw-semibold">${item.label}:</span> ${item.text} <span class="ms-1">&times;</span>
            </button>
          `.trim())
          .join('')}
      </div>
    `.trim()
  }

  const clearFilter = key => {
    if (key === 'project') setProjectFilter('', 'Projects: All')
    if (key === 'brand' && brandSelect) brandSelect.value = ''
    if (key === 'product_line' && productLineSelect) productLineSelect.value = ''
    if (key === 'main_chip' && mainChipSelect) mainChipSelect.value = ''
    if (key === 'data_type' && reportTypeSelect) reportTypeSelect.value = ''
    renderSelectedFilters()
  }

  const init = () => {
    loadRecent()
    loadFrequent()
    setResultsVisible(false)
    renderSelectedFilters()

    document.addEventListener('click', event => {
      if (!results) return
      if (!results.contains(event.target) && event.target !== input) {
        setResultsVisible(false)
      }
    })

    selectedFiltersEl?.addEventListener('click', event => {
      const button = event.target?.closest?.('[data-filter-key]')
      if (!button) return
      const key = button.dataset.filterKey
      if (!key) return
      clearFilter(key)
      const query = `${input?.value ?? ''}`.trim()
      if (query) search(query)
    })

    input?.addEventListener('input', () => {
      const query = `${input.value ?? ''}`.trim()
      if (!query) {
        activeRequest += 1
        setResultsVisible(false)
        return
      }
      search(query)
    })

    if (projectDropdownMenu) {
      projectDropdownMenu.addEventListener('click', event => {
        const button = event.target?.closest?.('[data-project-value]')
        if (!button) return
        const value = `${button.getAttribute('data-project-value') ?? ''}`
        const label = `${button.getAttribute('data-project-label') ?? 'Projects: All'}`
        setProjectFilter(value, label)
        renderSelectedFilters()
        const query = `${input?.value ?? ''}`.trim()
        if (query) search(query)
      })
    }

    reportTypeSelect?.addEventListener('change', () => {
      renderSelectedFilters()
      const query = `${input?.value ?? ''}`.trim()
      if (query) search(query)
    })

    brandSelect?.addEventListener('change', () => {
      renderSelectedFilters()
      const query = `${input?.value ?? ''}`.trim()
      if (query) search(query)
    })

    productLineSelect?.addEventListener('change', () => {
      renderSelectedFilters()
      const query = `${input?.value ?? ''}`.trim()
      if (query) search(query)
    })

    mainChipSelect?.addEventListener('change', () => {
      renderSelectedFilters()
      const query = `${input?.value ?? ''}`.trim()
      if (query) search(query)
    })

    resetButton?.addEventListener('click', () => {
      setProjectFilter('', 'Projects: All')
      if (reportTypeSelect) reportTypeSelect.value = ''
      if (brandSelect) brandSelect.value = ''
      if (productLineSelect) productLineSelect.value = ''
      if (mainChipSelect) mainChipSelect.value = ''
      if (input) input.value = ''
      activeRequest += 1
      setResultsVisible(false)
      renderSelectedFilters()
      loadRecent()
      loadFrequent()
    })

    fetchJson(`${API_BASE}/filters`)
      .then(payload => {
        const options = payload?.projectOptions ?? []
        if (projectDropdownMenu) {
          const itemEls = [
            `<li><button class="dropdown-item" type="button" data-project-value="" data-project-label="Projects: All">Projects: All</button></li>`,
            ...options.map(option => {
              const value = `${option?.value ?? ''}`
              const label = `${option?.label ?? value}`
              return `<li><button class="dropdown-item" type="button" data-project-value="${value}" data-project-label="${label}">${label}</button></li>`
            }),
          ]
          projectDropdownMenu.innerHTML = itemEls.join('')
          if (!projectSelect?.value) setProjectFilter('', 'Projects: All')
        }

        if (brandSelect) {
          const values = Array.isArray(payload?.brands) ? payload.brands : []
          const optionEls = [`<option value="">Brand: All</option>`, ...values.map(value => `<option value="${value}">${value}</option>`)]
          brandSelect.innerHTML = optionEls.join('')
        }

        if (productLineSelect) {
          const values = Array.isArray(payload?.productLines) ? payload.productLines : []
          const optionEls = [`<option value="">Product Line: All</option>`, ...values.map(value => `<option value="${value}">${value}</option>`)]
          productLineSelect.innerHTML = optionEls.join('')
        }

        if (mainChipSelect) {
          const values = Array.isArray(payload?.mainChips) ? payload.mainChips : []
          const optionEls = [`<option value="">Main Chip: All</option>`, ...values.map(value => `<option value="${value}">${value}</option>`)]
          mainChipSelect.innerHTML = optionEls.join('')
        }
      })
      .catch(() => {})

    fetchJson(`${API_BASE}/reports/types`)
      .then(payload => {
        if (!reportTypeSelect) return
        const types = Array.isArray(payload?.rows) ? payload.rows : []
        const known = types.map(row => row?.dataType).filter(Boolean)
        const optionEls = [`<option value="">Type: All</option>`, ...known.map(value => `<option value="${value}">${value}</option>`)]
        reportTypeSelect.innerHTML = optionEls.join('')
      })
      .catch(() => {})

    form?.addEventListener('submit', event => {
      event.preventDefault()
      const query = `${input?.value ?? ''}`.trim()
      const hasFilters = Object.values(getSearchParams()).some(value => Boolean(`${value ?? ''}`))

      if (!query && hasFilters) {
        searchWithCurrentFilters({ query: '', limit: 18 })
          .then(payload => {
            if (!payload) return
            renderGrid(recentGrid, payload?.rows ?? [])
          })
          .catch(() => {
            if (recentGrid) recentGrid.innerHTML = `<div class="text-muted small">Search failed.</div>`
          })
        return
      }

      if (!query && !hasFilters) {
        loadRecent()
        loadFrequent()
        return
      }

      navigateToReport(query)
    })
  }

  document.addEventListener('DOMContentLoaded', init)
})()
