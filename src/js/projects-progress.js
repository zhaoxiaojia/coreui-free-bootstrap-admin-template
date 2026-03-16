(() => {
  const DEFAULT_API_BASE = new URL('/api', window.location.origin).toString()
  const API_BASE = window.WIFI_DASHBOARD_API_BASE ?? DEFAULT_API_BASE

  const tableBody = document.getElementById('projectProgressTableBody')
  const statusEl = document.getElementById('projectProgressStatus')
  const refreshButton = document.getElementById('projectProgressRefresh')

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
          ? 'bg-success text-white'
          : 'bg-light text-muted'
        const title = item?.done ? `${label}: done` : `${label}: missing`
        return `<span class="badge rounded-pill ${cls} px-2 py-1" title="${escapeHtml(title)}" data-coreui-toggle="tooltip">${label}</span>`
      })
      .join(' ')

  const renderRow = row => {
    const doneCount = Number(row?.doneCount ?? 0)
    const totalCount = Number(row?.totalCount ?? 0) || 1
    const percent = Math.round((doneCount / totalCount) * 100)

    return `
      <tr>
        <td class="fw-semibold">${escapeHtml(row?.project ?? '')}</td>
        <td style="min-width: 220px;">
          <div class="progress" role="progressbar" aria-label="Progress" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-bar bg-success" style="width: ${percent}%"></div>
          </div>
          <div class="small text-body-secondary mt-1">${doneCount}/${totalCount}</div>
        </td>
        <td>
          <div>
            <div class="d-flex flex-wrap gap-2">
              ${renderStepPills(row?.items ?? [])}
            </div>
          </div>
        </td>
      </tr>
    `.trim()
  }

  const setStatus = text => {
    if (!statusEl) return
    statusEl.textContent = text
  }

  const load = async () => {
    if (!tableBody) return
    setStatus('Loading...')
    tableBody.innerHTML = `<tr><td colspan="3" class="text-body-secondary">Loading...</td></tr>`
    try {
      const url = new URL(`${API_BASE}/projects/progress`, window.location.origin)
      url.searchParams.set('limit', '200')
      const payload = await fetchJson(url.toString())
      const rows = Array.isArray(payload?.rows) ? payload.rows : []
      if (rows.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" class="text-body-secondary">No data.</td></tr>`
        setStatus('No data.')
        return
      }
      tableBody.innerHTML = rows.map(renderRow).join('')
      setStatus(`Loaded ${rows.length} projects.`)

      if (window.coreui?.Tooltip) {
        document.querySelectorAll('[data-coreui-toggle="tooltip"]').forEach(el => {
          window.coreui.Tooltip.getOrCreateInstance(el)
        })
      }
    } catch (error) {
      tableBody.innerHTML = `<tr><td colspan="3" class="text-danger">Failed to load.</td></tr>`
      setStatus(error?.message ?? 'Failed to load.')
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    refreshButton?.addEventListener('click', load)
    load()
  })
})()
