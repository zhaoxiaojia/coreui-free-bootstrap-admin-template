(() => {
  const DEFAULT_API_BASE = new URL('/api', window.location.origin).toString()
  const API_BASE = window.WIFI_DASHBOARD_API_BASE ?? DEFAULT_API_BASE

  const titleEl = document.getElementById('reportTitle')
  const subtitleEl = document.getElementById('reportSubtitle')
  const metaListEl = document.getElementById('reportMetaList')
  const rawJsonEl = document.getElementById('reportRawJson')
  const statusEl = document.getElementById('reportStatus')

  const setStatus = (message, variant = 'info') => {
    if (!statusEl) return
    statusEl.className = `alert alert-${variant} mb-0`
    statusEl.textContent = message
  }

  const fetchJson = async url => {
    const response = await fetch(url)
    if (!response.ok) {
      const error = new Error(`Request failed (${response.status})`)
      error.status = response.status
      throw error
    }
    return response.json()
  }

  const getReportIdFromUrl = () => {
    const params = new URLSearchParams(window.location.search)
    const raw = params.get('report_id') ?? params.get('reportId') ?? params.get('id')
    if (!raw) return null
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed)) return null
    return parsed
  }

  const getDataTypeFromUrl = () => {
    const params = new URLSearchParams(window.location.search)
    const raw = params.get('data_type') ?? params.get('dataType') ?? ''
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    return trimmed || null
  }

  const toMetaItem = (label, value) => {
    const escaped = value === null || value === undefined || value === '' ? 'N/A' : `${value}`
    return `
      <li class="list-group-item d-flex justify-content-between align-items-start gap-3">
        <div class="fw-semibold">${label}</div>
        <div class="text-muted text-end text-break">${escaped}</div>
      </li>
    `.trim()
  }

  const renderReport = payload => {
    const reportId = payload?.reportId ?? null
    const dataType = payload?.dataType ?? null
    const csvName = payload?.csvName ?? null

    if (titleEl) titleEl.textContent = csvName ? `${csvName}` : `Report #${reportId ?? ''}`
    if (subtitleEl) subtitleEl.textContent = dataType ? `${dataType}` : 'Unknown report type'

    if (metaListEl) {
      metaListEl.innerHTML = [
        toMetaItem('Report ID', reportId),
        toMetaItem('Data Type', dataType),
        toMetaItem('Report Name', payload?.reportName ?? null),
        toMetaItem('Project', payload?.project?.projectName ?? null),
        toMetaItem('Main Chip', payload?.project?.mainChip ?? payload?.dut?.mainChip ?? null),
        toMetaItem('Wi-Fi Module', payload?.project?.wifiModule ?? payload?.dut?.wifiModule ?? null),
        toMetaItem('Interface', payload?.project?.interface ?? payload?.dut?.interface ?? null),
        toMetaItem('DUT ID', payload?.dut?.dutId ?? null),
        toMetaItem('DUT Connect Type', payload?.dut?.connectType ?? null),
        toMetaItem('DUT Software Version', payload?.dut?.softwareVersion ?? null),
        toMetaItem('Case Path', payload?.casePath ?? null),
        toMetaItem('Last Updated At', payload?.lastUpdatedAt ?? null)
      ].join('')
    }

    if (rawJsonEl) {
      rawJsonEl.textContent = JSON.stringify(payload, null, 2)
    }
  }

  const init = () => {
    const reportId = getReportIdFromUrl()
    if (!reportId) {
      setStatus('Missing report_id in URL. Use report.html?report_id=123', 'warning')
      return
    }

    const historyKey = 'wifi-dashboard-report-history'
    const recordVisit = () => {
      const stored = localStorage.getItem(historyKey)
      const parsed = stored ? JSON.parse(stored) : {}
      const now = Date.now()
      const dataType = getDataTypeFromUrl() ?? 'unknown'
      const key = `${reportId}|${dataType}`
      const entry = parsed[key] ?? {}
      parsed[key] = {
        count: Number(entry.count ?? 0) + 1,
        lastVisitedAt: now
      }
      localStorage.setItem(historyKey, JSON.stringify(parsed))
    }

    recordVisit()

    setStatus(`Loading report #${reportId}...`, 'info')

    const dataType = getDataTypeFromUrl()
    const url = dataType ? `${API_BASE}/reports/${reportId}?data_type=${encodeURIComponent(dataType)}` : `${API_BASE}/reports/${reportId}`

    fetchJson(url)
      .then(payload => {
        renderReport(payload)
        setStatus('Report loaded. Detailed rendering is not implemented yet.', 'secondary')
      })
      .catch(error => {
        if (error?.status === 404) {
          setStatus(`Report #${reportId} was not found.`, 'warning')
          return
        }
        setStatus('Failed to load report.', 'danger')
      })
  }

  document.addEventListener('DOMContentLoaded', init)
})()
