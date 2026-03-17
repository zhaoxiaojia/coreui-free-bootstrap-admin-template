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

  const listEl = document.getElementById('homeProjectProgressList')
  const statusEl = document.getElementById('homeProjectProgressStatus')
  const lifecycleFiltersEl = document.getElementById('homeLifecycleFilters')
  const lifecycleHintEl = document.getElementById('homeLifecycleHint')
  const LIFECYCLE_PHASES = ['EVT', 'DVT', 'PVT', 'MP']
  let selectedPhase = 'MP'
  let allRows = []

  const fetchJson = async url => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Request failed (${response.status})`)
    return response.json()
  }

  const escapeHtml = value =>
    `${value ?? ''}`
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')

  const renderStepPills = items =>
    (items ?? [])
      .map(item => {
        const label = escapeHtml(item?.label ?? item?.key ?? '')
        const cls = item?.done
          ? 'app-control-chip is-active'
          : 'app-control-chip'
        const title = item?.done ? `${label}: done` : `${label}: missing`
        return `<span class="${cls}" title="${escapeHtml(title)}">${label}</span>`
      })
      .join(' ')

  const renderRow = row => {
    const doneCount = Number(row?.doneCount ?? 0)
    const totalCount = Number(row?.totalCount ?? 0) || 1
    const percent = Math.round((doneCount / totalCount) * 100)

    return `
      <a class="list-group-item list-group-item-action home-lifecycle-row" href="projects-progress.html">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div class="min-w-0">
            <div class="fw-semibold text-truncate">${escapeHtml(row?.project ?? '')}</div>
            <div class="small text-body-secondary">${doneCount}/${totalCount} types</div>
          </div>
          <div class="d-flex flex-wrap align-items-center gap-2">
            <div class="progress home-lifecycle-progress" style="width: 180px; height: 10px;" role="progressbar" aria-label="Progress" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
              <div class="progress-bar home-lifecycle-progress-fill" style="width: ${percent}%"></div>
            </div>
            <div class="d-flex flex-wrap gap-2">
              ${renderStepPills(row?.items ?? [])}
            </div>
          </div>
        </div>
      </a>
    `.trim()
  }

  const setStatus = text => {
    if (!statusEl) return
    statusEl.textContent = text
  }

  const normalizePhase = value => `${value ?? ''}`.trim().toUpperCase()

  const getRowPhase = row => {
    const raw =
      row?.phase ??
      row?.lifecyclePhase ??
      row?.lifecycle_phase ??
      row?.stage ??
      row?.currentPhase ??
      row?.current_phase ??
      ''
    const normalized = normalizePhase(raw)
    return LIFECYCLE_PHASES.includes(normalized) ? normalized : ''
  }

  const updateFilterButtons = () => {
    if (!lifecycleFiltersEl) return
    lifecycleFiltersEl.querySelectorAll('[data-lifecycle-phase]').forEach(button => {
      const isActive = normalizePhase(button.getAttribute('data-lifecycle-phase')) === selectedPhase
      button.classList.toggle('is-active', isActive)
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false')
    })
  }

  const renderFilteredRows = () => {
    if (!listEl) return
    const filteredRows = allRows.filter(row => getRowPhase(row) === selectedPhase)
    if (filteredRows.length === 0) {
      listEl.innerHTML = `<div class="text-body-secondary small">No ${selectedPhase} projects.</div>`
      setStatus(`Loaded 0 projects (${selectedPhase}).`)
    } else {
      listEl.innerHTML = filteredRows.map(renderRow).join('')
      setStatus(`Loaded ${filteredRows.length} projects (${selectedPhase}).`)
    }
    if (lifecycleHintEl) {
      lifecycleHintEl.textContent = `Current lifecycle phase is ${selectedPhase}. Tags below still show which report types already have data.`
    }
    updateFilterButtons()
  }

  const bindLifecycleFilters = () => {
    if (!lifecycleFiltersEl) return
    lifecycleFiltersEl.querySelectorAll('[data-lifecycle-phase]').forEach(button => {
      button.addEventListener('click', () => {
        const phase = normalizePhase(button.getAttribute('data-lifecycle-phase'))
        if (!LIFECYCLE_PHASES.includes(phase)) return
        selectedPhase = phase
        renderFilteredRows()
      })
    })
  }

  const load = async () => {
    if (!listEl) return
    setStatus('Loading...')
    listEl.innerHTML = ''

    try {
      const url = new URL(`${API_BASE}/projects/progress`, window.location.origin)
      url.searchParams.set('limit', '9')
      const payload = await fetchJson(url.toString())
      allRows = Array.isArray(payload?.rows) ? payload.rows : []
      const phaseFromApi = normalizePhase(payload?.currentPhase ?? payload?.phase ?? '')
      if (LIFECYCLE_PHASES.includes(phaseFromApi)) selectedPhase = phaseFromApi

      if (allRows.length === 0) {
        listEl.innerHTML = `<div class="text-body-secondary small">No data.</div>`
        setStatus('No data.')
        return
      }

      renderFilteredRows()
    } catch (error) {
      listEl.innerHTML = `<div class="text-danger small">Failed to load.</div>`
      setStatus(error?.message ?? 'Failed to load.')
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindLifecycleFilters()
    load()
  })
})()
