(() => {
  const DEFAULT_API_BASE = new URL('/api', window.location.origin).toString()
  const API_BASE = window.WIFI_DASHBOARD_API_BASE ?? DEFAULT_API_BASE

  const form = document.getElementById('reportFinderForm')
  const input = document.getElementById('reportFinderQuery')
  const results = document.getElementById('reportFinderResults')
  const recentGrid = document.getElementById('reportFinderRecentGrid')
  const frequentGrid = document.getElementById('reportFinderFrequentGrid')
  const projectSelect = document.getElementById('reportFinderProject')
  const reportTypeSelect = document.getElementById('reportFinderReportType')
  const brandSelect = document.getElementById('reportFinderBrand')
  const productLineSelect = document.getElementById('reportFinderProductLine')
  const mainChipSelect = document.getElementById('reportFinderMainChip')
  const wifiModuleSelect = document.getElementById('reportFinderWifiModule')
  const interfaceSelect = document.getElementById('reportFinderInterface')
  const selectedFiltersEl = document.getElementById('reportFinderSelectedFilters')
  const resetButton = document.getElementById('reportFinderReset')

  let activeRequest = 0

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
    const csvName = row?.csvName ?? 'Report'
    const dataType = row?.dataType ?? 'Unknown'
    const createdAt = row?.lastUpdatedAt ?? ''
    const projectName = row?.project?.projectName ?? 'Unknown project'
    const wifiModule = row?.project?.wifiModule ?? ''
    const productLine = row?.project?.productLine ?? ''
    const chipLine = [wifiModule, productLine].filter(Boolean).join(' · ')

    return `
      <div class="col-12 col-md-6 col-xl-4">
        <a class="card h-100 text-decoration-none" href="report.html?report_id=${reportId}&data_type=${encodeURIComponent(dataType)}">
          <div class="card-body">
            <div class="d-flex align-items-start justify-content-between gap-2">
              <div class="min-w-0">
                <div class="fw-semibold text-truncate">${csvName}</div>
                <div class="small text-muted text-truncate">${projectName}</div>
              </div>
              <span class="badge text-bg-light border">#${reportId}</span>
            </div>
            <div class="mt-3 d-flex flex-wrap gap-2">
              <span class="badge text-bg-success">${dataType}</span>
              ${chipLine ? `<span class="badge text-bg-secondary">${chipLine}</span>` : ''}
            </div>
          </div>
          <div class="card-footer small text-muted d-flex justify-content-between">
            <span>${createdAt || ''}</span>
            <span class="text-decoration-none">Open</span>
          </div>
        </a>
      </div>
    `.trim()
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
    const projectId = projectSelect?.value ? `${projectSelect.value}` : ''
    const dataType = reportTypeSelect?.value ? `${reportTypeSelect.value}` : ''
    const brand = brandSelect?.value ? `${brandSelect.value}` : ''
    const productLine = productLineSelect?.value ? `${productLineSelect.value}` : ''
    const mainChip = mainChipSelect?.value ? `${mainChipSelect.value}` : ''
    const wifiModule = wifiModuleSelect?.value ? `${wifiModuleSelect.value}` : ''
    const iface = interfaceSelect?.value ? `${interfaceSelect.value}` : ''
    return { projectId, dataType, brand, productLine, mainChip, wifiModule, interface: iface }
  }

  const search = query => {
    const requestId = (activeRequest += 1)
    const url = new URL(`${API_BASE}/reports`, window.location.origin)
    url.searchParams.set('q', query)
    url.searchParams.set('limit', '8')
    const { projectId, dataType, brand, productLine, mainChip, wifiModule, interface: iface } = getSearchParams()
    if (projectId) url.searchParams.set('project_id', projectId)
    if (dataType) url.searchParams.set('data_type', dataType)
    if (brand) url.searchParams.set('brand', brand)
    if (productLine) url.searchParams.set('product_line', productLine)
    if (mainChip) url.searchParams.set('main_chip', mainChip)
    if (wifiModule) url.searchParams.set('wifi_module', wifiModule)
    if (iface) url.searchParams.set('interface', iface)

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

  const loadRecent = () => {
    if (!recentGrid) return
    fetchJson(`${API_BASE}/reports/recent?limit=9`)
      .then(payload => renderGrid(recentGrid, payload?.rows ?? []))
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

    const { projectId, dataType, brand, productLine, mainChip, wifiModule, interface: iface } = getSearchParams()
    const selected = []

    const pushFilter = (key, label, value, text) => {
      if (!value) return
      selected.push({ key, label, value, text: text ?? value })
    }

    const projectText = projectId
      ? projectSelect?.selectedOptions?.[0]?.textContent?.trim() ?? projectId
      : ''

    pushFilter('project_id', 'Project', projectId, projectText)
    pushFilter('brand', 'Brand', brand)
    pushFilter('product_line', 'Product Line', productLine)
    pushFilter('main_chip', 'Main Chip', mainChip)
    pushFilter('wifi_module', 'Wi-Fi Module', wifiModule)
    pushFilter('interface', 'Interface', iface)
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
    if (key === 'project_id' && projectSelect) projectSelect.value = ''
    if (key === 'brand' && brandSelect) brandSelect.value = ''
    if (key === 'product_line' && productLineSelect) productLineSelect.value = ''
    if (key === 'main_chip' && mainChipSelect) mainChipSelect.value = ''
    if (key === 'wifi_module' && wifiModuleSelect) wifiModuleSelect.value = ''
    if (key === 'interface' && interfaceSelect) interfaceSelect.value = ''
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

    projectSelect?.addEventListener('change', () => {
      renderSelectedFilters()
      const query = `${input?.value ?? ''}`.trim()
      if (query) search(query)
    })

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

    wifiModuleSelect?.addEventListener('change', () => {
      renderSelectedFilters()
      const query = `${input?.value ?? ''}`.trim()
      if (query) search(query)
    })

    interfaceSelect?.addEventListener('change', () => {
      renderSelectedFilters()
      const query = `${input?.value ?? ''}`.trim()
      if (query) search(query)
    })

    resetButton?.addEventListener('click', () => {
      if (projectSelect) projectSelect.value = ''
      if (reportTypeSelect) reportTypeSelect.value = ''
      if (brandSelect) brandSelect.value = ''
      if (productLineSelect) productLineSelect.value = ''
      if (mainChipSelect) mainChipSelect.value = ''
      if (wifiModuleSelect) wifiModuleSelect.value = ''
      if (interfaceSelect) interfaceSelect.value = ''
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
        if (projectSelect) {
          const optionEls = [
            `<option value="">Projects: All</option>`,
            ...options.map(option => `<option value="${option.value}">${option.label}</option>`)
          ]
          projectSelect.innerHTML = optionEls.join('')
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

        if (wifiModuleSelect) {
          const values = Array.isArray(payload?.wifiModules) ? payload.wifiModules : []
          const optionEls = [`<option value="">Wi-Fi Module: All</option>`, ...values.map(value => `<option value="${value}">${value}</option>`)]
          wifiModuleSelect.innerHTML = optionEls.join('')
        }

        if (interfaceSelect) {
          const values = Array.isArray(payload?.interfaces) ? payload.interfaces : []
          const optionEls = [`<option value="">Interface: All</option>`, ...values.map(value => `<option value="${value}">${value}</option>`)]
          interfaceSelect.innerHTML = optionEls.join('')
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
      navigateToReport(input?.value ?? '')
    })
  }

  document.addEventListener('DOMContentLoaded', init)
})()
