/**
 * --------------------------------------------------------------------------
 * CoreUI Boostrap Admin Template config.js
 * Licensed under MIT (https://github.com/coreui/coreui-free-bootstrap-admin-template/blob/main/LICENSE)
 * --------------------------------------------------------------------------
 */

(() => {
  const THEME_SKIN_KEY = 'coreui-free-bootstrap-admin-template-theme-skin'
  const MODE_KEY = 'coreui-free-bootstrap-admin-template-app-mode'
  const urlParams = new URLSearchParams(window.location.href.split('?')[1])
  const SIDEBAR_MODE_KEY = 'coreui-free-bootstrap-admin-template-sidebar-mode'
  const API_BASE_KEY = 'coreui-free-bootstrap-admin-template-api-base'
  const DEFAULT_THEME_SKIN = 'daylight'
  const FALLBACK_THEME_MODES = {
    daylight: 'light',
    nightfall: 'dark',
    cobalt: 'dark',
    spring: 'light',
    rainbow: 'light',
    midnight: 'dark',
    sunshine: 'light',
    corporate: 'dark'
  }
  const normalizeThemeSkin = value => (/^[a-z0-9-]+$/i.test(value || '') ? value : DEFAULT_THEME_SKIN)
  const normalizeThemeMode = value => (value === 'dark' ? 'dark' : 'light')
  const getConfiguredThemeMode = themeSkin => {
    const configuredMode = window.APP_THEME_CONFIG?.themes?.[themeSkin]?.mode
    return normalizeThemeMode(configuredMode ?? FALLBACK_THEME_MODES[themeSkin] ?? localStorage.getItem(MODE_KEY) ?? 'light')
  }
  const ensureStylesheet = href => {
    if (document.querySelector(`link[href="${href}"]`)) return
    const stylesheet = document.createElement('link')
    stylesheet.rel = 'stylesheet'
    stylesheet.href = href
    document.head.append(stylesheet)
  }
  const ensureScript = (src, onload = null) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      if (onload) {
        if (existing.dataset.loaded === 'true') onload()
        else existing.addEventListener('load', onload, { once: true })
      }
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = false
    if (onload) {
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true'
        onload()
      }, { once: true })
    } else {
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true'
      }, { once: true })
    }
    document.head.append(script)
  }

  const apiBaseFromUrl = (() => {
    const raw = urlParams.get('api_base') ?? urlParams.get('apiBase') ?? urlParams.get('api')
    if (!raw) return ''
    try {
      return new URL(raw, window.location.origin).toString().replace(/\/$/, '')
    } catch {
      return ''
    }
  })()

  if (apiBaseFromUrl) {
    localStorage.setItem(API_BASE_KEY, apiBaseFromUrl)
  }

  const inferLocalApiBase = () => {
    const hostname = window.location.hostname
    const port = window.location.port

    if (hostname !== 'localhost' && hostname !== '127.0.0.1') return ''
    if (!port) return ''

    if (port === '5000') return ''

    if (port === '3000') {
      return `${window.location.protocol}//${hostname}:5000/api`
    }

    return `${window.location.protocol}//${hostname}:5000/api`
  }

  const storedApiBase = localStorage.getItem(API_BASE_KEY) ?? ''
  const inferredApiBase = inferLocalApiBase()
  const resolvedApiBase = apiBaseFromUrl || storedApiBase || inferredApiBase

  const themeSkinFromUrl = urlParams.get('theme_skin') ?? urlParams.get('themeSkin')
  const themeSkin = normalizeThemeSkin(themeSkinFromUrl || localStorage.getItem(THEME_SKIN_KEY) || DEFAULT_THEME_SKIN)
  const initialSidebarMode = (() => {
    const modeFromUrl = urlParams.get('sidebar')
    if (modeFromUrl === 'full' || modeFromUrl === 'minimal') return modeFromUrl
    const stored = localStorage.getItem(SIDEBAR_MODE_KEY)
    if (stored === 'full' || stored === 'minimal') return stored
    return 'minimal'
  })()

  document.documentElement.setAttribute('data-theme-skin', themeSkin)
  document.documentElement.setAttribute('data-sidebar-mode', initialSidebarMode)
  document.documentElement.setAttribute('data-sidebar-ready', initialSidebarMode === 'minimal' ? 'false' : 'true')
  localStorage.setItem(THEME_SKIN_KEY, themeSkin)
  const initialMode = 'light'
  localStorage.setItem(MODE_KEY, initialMode)
  document.documentElement.setAttribute('data-app-mode', initialMode)

  if (themeSkin === 'corporate' && initialMode === 'dark') {
    document.documentElement.style.setProperty('--app-body-bg', '#0f3285')
    document.documentElement.style.setProperty('--app-nav-bg', '#0f3285')
    document.documentElement.style.setProperty('--app-sidebar-bg', '#0f3285')
  }
  ensureStylesheet('assets/css/theme.css')
  ensureScript('js/theme-palette-config.js', () => {
    document.documentElement.setAttribute('data-app-mode', getConfiguredThemeMode(themeSkin))
    ensureScript('js/theme.js')
  })

  if (resolvedApiBase && !window.WIFI_DASHBOARD_API_BASE) {
    window.WIFI_DASHBOARD_API_BASE = resolvedApiBase
  }

  const getSidebarMode = () => {
    return initialSidebarMode
  }

  const ensureNavItem = ({ href, icon, label }, sidebarNav) => {
    const existing = sidebarNav.querySelector(`a.nav-link[href="${href}"]`)
    if (existing) return existing.closest('li')

    const item = document.createElement('li')
    item.className = 'nav-item'

    const link = document.createElement('a')
    link.className = 'nav-link'
    link.href = href
    link.innerHTML = `
      <svg class="nav-icon">
        <use xlink:href="${icon}"></use>
      </svg> ${label}
    `.trim()

    item.append(link)
    sidebarNav.append(item)
    return item
  }


  const applyMinimalSidebar = () => {
    if (getSidebarMode() !== 'minimal') {
      document.documentElement.setAttribute('data-sidebar-ready', 'true')
      return
    }

    const sidebarNav = document.querySelector('#sidebar ul.sidebar-nav')
    if (!sidebarNav) {
      document.documentElement.setAttribute('data-sidebar-ready', 'true')
      return
    }

    const homeItem = sidebarNav.querySelector('a.nav-link[href="index.html"]')?.closest('li') ?? null

    const wifiDashboardGroup =
      Array.from(sidebarNav.querySelectorAll('li.nav-group')).find(item => {
        const link = item.querySelector(':scope > a.nav-link')
        if (!link) return false

        const href = link.getAttribute('href') ?? ''
        if (href === 'wifi-dashboard.html') return true

        const text = `${link.textContent ?? ''}`.trim().toLowerCase()
        return (
          text === 'wi-fi dashboard' ||
          text === 'wifi dashboard' ||
          text === 'wi-fi database' ||
          text === 'wifi database'
        )
      }) ?? null

    const dashboardItem = sidebarNav.querySelector('a.nav-link[href="dashboard.html"]')?.closest('li') ?? null

    const items = Array.from(sidebarNav.children)
    items.forEach(item => {
      const shouldShow =
        (wifiDashboardGroup ? item === wifiDashboardGroup : false) ||
        (dashboardItem ? item === dashboardItem : false)

      item.style.display = shouldShow ? '' : 'none'
    })
    document.documentElement.setAttribute('data-sidebar-ready', 'true')
  }

  document.addEventListener('DOMContentLoaded', applyMinimalSidebar)
})()
