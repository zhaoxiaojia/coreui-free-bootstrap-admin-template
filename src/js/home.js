(() => {
  const API_BASE = window.WIFI_API_BASE ?? window.WIFI_DASHBOARD_API_BASE ?? 'http://localhost:5000/api'

  const elements = {
    projectsGrid: document.getElementById('projectsGrid'),
    scenarioTabs: document.getElementById('leaderboardScenarioTabs'),
    scenarioHint: document.getElementById('leaderboardScenarioHint'),
    leaderboardTitle: document.getElementById('leaderboardTitle'),
    leaderboardSubtitle: document.getElementById('leaderboardSubtitle'),
    scoringHelp: document.getElementById('scoringHelp'),
    dataTypeTabs: document.getElementById('leaderboardDataTypeTabs'),
    moduleToggle: document.getElementById('moduleDropdownToggle'),
    moduleMenu: document.getElementById('moduleDropdownMenu'),
    interfaceToggle: document.getElementById('interfaceDropdownToggle'),
    interfaceMenu: document.getElementById('interfaceDropdownMenu')
  }

  const leaderboardTarget = document.getElementById('lb-scenario')

  const leaderboardScenarios = {
    performance: {
      label: 'Performance',
      hint: 'Composite score. One row per project.'
    },
    home: {
      label: 'Home Environment',
      hint: 'Composite score scoped to typical home distance.'
    },
    interference: {
      label: 'Interference',
      hint: 'Composite score scoped to challenging signal.'
    }
  }

  let selectedScenarioKey = 'performance'
  let selectedDataType = 'PEAK_THROUGHPUT'

  const projectImages = [
    'assets/project/ONN-Carema.png',
    'assets/project/ONN-Roku-TV.png',
    'assets/project/XIAOMI-TV.png'
  ]

  let filterOptions = null
  let scenarioRules = null
  let currentMetricLabel = 'unknown'

  const getSelectedScenario = () => {
    return leaderboardScenarios[selectedScenarioKey] ?? leaderboardScenarios.performance
  }

  const fetchJson = async url => {
    const response = await fetch(url)
    if (!response.ok) {
      let details = ''
      try {
        const contentType = response.headers.get('content-type') ?? ''
        if (contentType.includes('application/json')) {
          const payload = await response.json()
          details = payload?.message ?? payload?.error ?? ''
        } else {
          details = await response.text()
        }
      } catch {
        details = ''
      }
      const error = new Error(`Request failed (${response.status})`)
      error.details = details
      throw error
    }
    return response.json()
  }

  const buildQueryParams = extra => {
    const params = new URLSearchParams()

    const wifiModule = elements.moduleToggle?.dataset.value ?? ''
    const iface = elements.interfaceToggle?.dataset.value ?? ''

    if (wifiModule) params.set('wifi_module', wifiModule)
    if (iface) params.set('interface', iface)

    const scenarioKey = selectedScenarioKey
    if (scenarioKey) params.set('scenario', scenarioKey)
    params.set('aggregate', 'project')
    if (scenarioKey === 'performance' && selectedDataType) {
      params.set('data_type', selectedDataType)
    }

    for (const [key, value] of Object.entries(extra ?? {})) {
      if (value === undefined || value === null || value === '') continue
      if (Array.isArray(value)) {
        value.forEach(item => params.append(key, item))
      } else {
        params.set(key, value)
      }
    }

    return params
  }

  const setDropdownSelection = (toggle, label, value) => {
    if (!toggle) return
    toggle.textContent = label
    toggle.dataset.value = value ?? ''
  }

  const renderDropdownMenu = (menu, toggle, { title, values }) => {
    if (!menu || !toggle) return
    menu.innerHTML = ''

    const allItem = document.createElement('li')
    const allButton = document.createElement('button')
    allButton.type = 'button'
    allButton.className = 'dropdown-item'
    allButton.textContent = `All ${title}`
    allButton.addEventListener('click', () => {
      setDropdownSelection(toggle, title, '')
      refreshAll()
    })
    allItem.append(allButton)
    menu.append(allItem)

    if (!values || values.length === 0) {
      const emptyItem = document.createElement('li')
      emptyItem.innerHTML = '<span class="dropdown-item-text text-muted small">No options</span>'
      menu.append(emptyItem)
      return
    }

    const divider = document.createElement('li')
    divider.innerHTML = '<hr class="dropdown-divider">'
    menu.append(divider)

    values.forEach(value => {
      const item = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'dropdown-item'
      button.textContent = value
      button.addEventListener('click', () => {
        setDropdownSelection(toggle, `${title}: ${value}`, value)
        refreshAll()
      })
      item.append(button)
      menu.append(item)
    })
  }

  const formatScore = score => {
    if (score === null || score === undefined || Number.isNaN(Number(score))) return '-'
    if (currentMetricLabel === 'composite_score') {
      return Number(score).toFixed(0)
    }
    return Number(score).toFixed(2)
  }

  const safeNumber = value => {
    if (value === null || value === undefined) return null
    const num = Number(value)
    return Number.isFinite(num) ? num : null
  }

  const escapeHtml = value => {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  }

  const formatScoringHtml = scoring => {
    if (!scoring) {
      return '<div class="small text-muted">Scoring details are not available.</div>'
    }

    const title = scoring.title ? `<div class="fw-semibold mb-1">${escapeHtml(scoring.title)}</div>` : ''
    const notes = Array.isArray(scoring.notes) && scoring.notes.length
      ? `<ul class="small mb-2">${scoring.notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`
      : ''

    const components = Array.isArray(scoring.components) && scoring.components.length
      ? scoring.components.map(component => {
        const name = component?.name ? `<div class="fw-semibold small mt-2">${escapeHtml(component.name)}</div>` : ''
        const details = Array.isArray(component?.details) && component.details.length
          ? `<ul class="small mb-0">${component.details.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
          : ''
        return `${name}${details}`
      }).join('')
      : ''

    return `${title}${notes}${components}`.trim() || '<div class="small text-muted">Scoring details are not available.</div>'
  }

  let scoringPopover = null
  let scoringPopoverHideTimer = null

  const ensureScoringPopover = () => {
    if (scoringPopover) return scoringPopover

    const root = document.createElement('div')
    root.className = 'scoring-popover'
    root.hidden = true
    root.innerHTML = `
      <div class="scoring-popover__arrow" aria-hidden="true"></div>
      <div class="scoring-popover__title" id="scoringPopoverTitle"></div>
      <div class="scoring-popover__content" id="scoringPopoverContent"></div>
    `
    document.body.append(root)

    root.addEventListener('mouseenter', () => {
      if (scoringPopoverHideTimer) {
        clearTimeout(scoringPopoverHideTimer)
        scoringPopoverHideTimer = null
      }
    })
    root.addEventListener('mouseleave', () => {
      scheduleHideScoringPopover()
    })

    scoringPopover = root
    return scoringPopover
  }

  const positionScoringPopover = () => {
    if (!elements.scoringHelp || !scoringPopover || scoringPopover.hidden) return

    const rect = elements.scoringHelp.getBoundingClientRect()
    const pop = scoringPopover
    const arrow = pop.querySelector('.scoring-popover__arrow')

    // First show off-screen so we can measure.
    pop.style.left = '0px'
    pop.style.top = '0px'
    const popRect = pop.getBoundingClientRect()

    const margin = 10
    const maxLeft = window.innerWidth - popRect.width - margin
    const left = Math.max(margin, Math.min(maxLeft, rect.left + rect.width / 2 - popRect.width / 2))
    const top = rect.bottom + 10

    pop.style.left = `${Math.round(left)}px`
    pop.style.top = `${Math.round(top)}px`

    if (arrow) {
      const arrowLeft = Math.round(rect.left + rect.width / 2 - left - 5)
      arrow.style.left = `${Math.max(12, Math.min(popRect.width - 12, arrowLeft))}px`
      arrow.style.top = `-5px`
    }
  }

  const showScoringPopover = () => {
    if (!elements.scoringHelp) return
    const pop = ensureScoringPopover()
    pop.hidden = false
    positionScoringPopover()
  }

  const hideScoringPopover = () => {
    if (!scoringPopover) return
    scoringPopover.hidden = true
  }

  const scheduleHideScoringPopover = () => {
    if (scoringPopoverHideTimer) clearTimeout(scoringPopoverHideTimer)
    scoringPopoverHideTimer = setTimeout(() => {
      hideScoringPopover()
      scoringPopoverHideTimer = null
    }, 150)
  }

  const initScoringPopover = () => {
    if (!elements.scoringHelp) return

    elements.scoringHelp.addEventListener('mouseenter', () => {
      if (scoringPopoverHideTimer) {
        clearTimeout(scoringPopoverHideTimer)
        scoringPopoverHideTimer = null
      }
      showScoringPopover()
    })
    elements.scoringHelp.addEventListener('mouseleave', () => {
      scheduleHideScoringPopover()
    })
    elements.scoringHelp.addEventListener('focus', () => {
      showScoringPopover()
    })
    elements.scoringHelp.addEventListener('blur', () => {
      scheduleHideScoringPopover()
    })
    elements.scoringHelp.addEventListener('click', event => {
      event.preventDefault()
      if (!scoringPopover || scoringPopover.hidden) {
        showScoringPopover()
      } else {
        hideScoringPopover()
      }
    })

    window.addEventListener('scroll', positionScoringPopover, { passive: true })
    window.addEventListener('resize', positionScoringPopover, { passive: true })
  }

  const updateScoringPopover = ({ scoring, metricLabel }) => {
    if (!elements.scoringHelp) return

    const html = formatScoringHtml(scoring)
    const title = metricLabel ? `Scoring rules (${metricLabel})` : 'Scoring rules'

    elements.scoringHelp.setAttribute('title', title)
    ensureScoringPopover()
    const titleEl = scoringPopover?.querySelector('#scoringPopoverTitle')
    const contentEl = scoringPopover?.querySelector('#scoringPopoverContent')
    if (titleEl) titleEl.textContent = title
    if (contentEl) contentEl.innerHTML = html
  }

  const renderLeaderboard = (container, rows) => {
    if (!container) return

    if (!rows || rows.length === 0) {
      container.innerHTML = '<div class="text-muted small">No data</div>'
      return
    }

    const maxScore = rows
      .map(row => safeNumber(row.score))
      .filter(score => score !== null)
      .reduce((max, score) => Math.max(max, score), 0)
    const scaleMax = currentMetricLabel === 'composite_score' ? 1000 : maxScore

    const list = document.createElement('div')
    list.className = 'leaderboard-list'

    rows.forEach((row, index) => {
      const projectLabel = row.hardwareVersion
        ? `${row.projectName} (${row.hardwareVersion})`
        : `${row.projectName}`

      const metaBits = [
        row.brand ?? '',
        row.productLine ?? '',
        row.standard ? `Std ${row.standard}` : '',
        row.band ? `${row.band} GHz` : ''
      ].filter(Boolean)

      const scoreValue = safeNumber(row.score)
      const ratio = scaleMax > 0 && scoreValue !== null ? Math.max(0, Math.min(1, scoreValue / scaleMax)) : 0
      const percent = Math.round(ratio * 100)

      const item = document.createElement('div')
      item.className = `leaderboard-item${index === 0 ? ' is-top-1' : ''}`
      item.innerHTML = `
        <div class="leaderboard-rank">${index + 1}</div>
        <div class="leaderboard-main">
          <div class="leaderboard-name">${projectLabel}</div>
          <div class="leaderboard-meta">${metaBits.join(' · ')}</div>
          <div class="leaderboard-bar" aria-hidden="true"><div style="width: ${percent}%"></div></div>
        </div>
        <div class="leaderboard-score">
          <div class="leaderboard-score-value">${formatScore(row.score)}</div>
          <div class="leaderboard-score-label">Score</div>
        </div>
      `

      list.append(item)
    })

    container.innerHTML = ''
    container.append(list)
  }

  const refreshProjectsGrid = () => {
    if (!elements.projectsGrid || !filterOptions?.projectOptions) return

    const wifiModule = elements.moduleToggle?.dataset.value ?? ''
    const iface = elements.interfaceToggle?.dataset.value ?? ''

    const projects = filterOptions.projectOptions
      .filter(option => !wifiModule || option.wifiModule === wifiModule)
      .filter(option => !iface || option.interface === iface)
      .slice(0, 12)

    elements.projectsGrid.innerHTML = ''
    if (projects.length === 0) {
      elements.projectsGrid.innerHTML = '<div class="text-muted small">No projects</div>'
      return
    }

    projects.forEach((project, index) => {
      const col = document.createElement('div')
      col.className = 'col-12 col-sm-6 col-lg-4'
      const title = project.hardwareVersion
        ? `${project.projectName} (${project.hardwareVersion})`
        : project.projectName
      const imageSrc = projectImages[index % projectImages.length]

      col.innerHTML = `
        <div class="card h-100 shadow-sm">
          <img src="${imageSrc}" class="card-img-top" alt="${title}" loading="lazy">
          <div class="card-body">
            <h6 class="card-title mb-1">${title}</h6>
            <div class="small">
              <div><span class="text-muted">Brand:</span> ${project.brand ?? '-'}</div>
              <div><span class="text-muted">Module:</span> ${project.wifiModule ?? '-'}</div>
              <div><span class="text-muted">Interface:</span> ${project.interface ?? '-'}</div>
            </div>
          </div>
        </div>
      `
      elements.projectsGrid.append(col)
    })
  }

  const refreshLeaderboards = async () => {
    if (leaderboardTarget) {
      leaderboardTarget.innerHTML = `
        <div class="d-flex align-items-center gap-2 text-muted small">
          <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
          <span>Loading...</span>
        </div>
      `
    }
    const params = buildQueryParams({ limit: 20 })
    const payload = await fetchJson(`${API_BASE}/leaderboard?${params.toString()}`)

    const metricLabel = payload?.metric ? String(payload.metric) : 'unknown'
    currentMetricLabel = metricLabel
    if (elements.leaderboardSubtitle) {
      elements.leaderboardSubtitle.textContent = metricLabel === 'composite_score'
        ? 'Score: Composite (0-1000)'
        : `Metric: ${metricLabel}`
    }
    const scoring = payload?.scoring ?? scenarioRules?.[selectedScenarioKey]?.scoring ?? null
    updateScoringPopover({ scoring, metricLabel })
    renderLeaderboard(leaderboardTarget, payload.rows ?? [])
  }

  const setLeaderboardError = error => {
    if (!leaderboardTarget) return
    const details = error?.details ? String(error.details).trim() : ''
    const message = error?.message ? String(error.message) : 'Request failed'

    leaderboardTarget.innerHTML = `
      <div class="alert alert-warning mb-0" role="alert">
        <div class="fw-semibold mb-1">Unable to load leaderboard</div>
        <div class="small">${message}</div>
        ${details ? `<div class="small mt-1 text-muted">${details}</div>` : ''}
        <div class="small mt-2 text-muted">API base: <code>${API_BASE}</code></div>
      </div>
    `
  }

  const refreshAll = async () => {
    refreshProjectsGrid()
    try {
      await refreshLeaderboards()
    } catch (error) {
      console.error(error)
      setLeaderboardError(error)
    }
  }

  const setScenario = async scenarioKey => {
    if (!scenarioKey || !(scenarioKey in leaderboardScenarios)) return
    selectedScenarioKey = scenarioKey

    const scenario = getSelectedScenario()

    if (elements.scenarioHint) {
      elements.scenarioHint.textContent = scenario.hint ?? ''
    }

    if (elements.leaderboardTitle) {
      elements.leaderboardTitle.textContent = `${scenario.label} Leaderboard`
    }
    if (elements.leaderboardSubtitle) {
      elements.leaderboardSubtitle.textContent = 'Score: Composite (0-1000)'
    }
    updateScoringPopover({ scoring: null, metricLabel: 'loading' })

    if (elements.scenarioTabs) {
      elements.scenarioTabs.querySelectorAll('[data-leaderboard-scenario]').forEach(button => {
        const isActive = button.dataset.leaderboardScenario === selectedScenarioKey
        button.classList.toggle('active', isActive)
        button.setAttribute('aria-selected', isActive ? 'true' : 'false')
      })
    }

    if (elements.dataTypeTabs) {
      elements.dataTypeTabs.classList.toggle('d-none', selectedScenarioKey !== 'performance')
    }

    await refreshAll()
  }

  const setDataType = async dataType => {
    if (!dataType) return
    selectedDataType = dataType

    if (elements.dataTypeTabs) {
      elements.dataTypeTabs.querySelectorAll('[data-leaderboard-datatype]').forEach(button => {
        const isActive = button.dataset.leaderboardDatatype === selectedDataType
        button.classList.toggle('active', isActive)
        button.setAttribute('aria-selected', isActive ? 'true' : 'false')
      })
    }

    await refreshAll()
  }

  const initScenarioTabs = () => {
    if (!elements.scenarioTabs) return

    elements.scenarioTabs.querySelectorAll('[data-leaderboard-scenario]').forEach(button => {
      button.addEventListener('click', () => {
        setScenario(button.dataset.leaderboardScenario)
      })
    })

    const scenario = getSelectedScenario()
    if (elements.scenarioHint) elements.scenarioHint.textContent = scenario.hint ?? ''
    if (elements.leaderboardTitle) elements.leaderboardTitle.textContent = `${scenario.label} Leaderboard`
    if (elements.leaderboardSubtitle) elements.leaderboardSubtitle.textContent = 'Score: Composite (0-1000)'
    updateScoringPopover({ scoring: null, metricLabel: 'loading' })
    initScoringPopover()

    if (elements.dataTypeTabs) {
      elements.dataTypeTabs.querySelectorAll('[data-leaderboard-datatype]').forEach(button => {
        button.addEventListener('click', () => {
          setDataType(button.dataset.leaderboardDatatype)
        })
      })
      setDataType(selectedDataType)
      elements.dataTypeTabs.classList.toggle('d-none', selectedScenarioKey !== 'performance')
    }
  }

  const init = async () => {
    initScenarioTabs()
    setDropdownSelection(elements.moduleToggle, 'Module', '')
    setDropdownSelection(elements.interfaceToggle, 'Interface', '')

    try {
      const meta = await fetchJson(`${API_BASE}/leaderboard-scenarios`)
      const map = {}
      for (const scenario of (meta?.scenarios ?? [])) {
        if (!scenario?.key) continue
        map[scenario.key] = scenario
      }
      scenarioRules = map

      const scoring = scenarioRules?.[selectedScenarioKey]?.scoring ?? null
      if (scoring) updateScoringPopover({ scoring, metricLabel: 'composite_score' })
    } catch (error) {
      console.error(error)
    }

    try {
      filterOptions = await fetchJson(`${API_BASE}/filters`)

      renderDropdownMenu(elements.moduleMenu, elements.moduleToggle, {
        title: 'Module',
        values: (filterOptions.wifiModules ?? []).slice()
      })

      renderDropdownMenu(elements.interfaceMenu, elements.interfaceToggle, {
        title: 'Interface',
        values: (filterOptions.interfaces ?? []).slice()
      })
    } catch (error) {
      console.error(error)
    }

    await refreshAll()
  }

  document.addEventListener('DOMContentLoaded', init)
})()
