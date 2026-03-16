/**
 * --------------------------------------------------------------------------
 * CoreUI Boostrap Admin Template config.js
 * Licensed under MIT (https://github.com/coreui/coreui-free-bootstrap-admin-template/blob/main/LICENSE)
 * --------------------------------------------------------------------------
 */

(() => {
  const THEME_SKIN_KEY = 'coreui-free-bootstrap-admin-template-theme-skin'
  const urlParams = new URLSearchParams(window.location.href.split('?')[1])
  const SIDEBAR_MODE_KEY = 'coreui-free-bootstrap-admin-template-sidebar-mode'
  const API_BASE_KEY = 'coreui-free-bootstrap-admin-template-api-base'
  const DEFAULT_THEME_SKIN = 'daylight'
  const THEME_MODE_MAP = {
    daylight: 'light',
    nightfall: 'dark',
    cobalt: 'light'
  }
  const normalizeThemeSkin = value => (/^[a-z0-9-]+$/i.test(value || '') ? value : DEFAULT_THEME_SKIN)

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

    const portsWithApi = new Set(['3000', '5000'])
    if (portsWithApi.has(port)) return ''

    return `${window.location.protocol}//${hostname}:5000/api`
  }

  const storedApiBase = localStorage.getItem(API_BASE_KEY) ?? ''
  const inferredApiBase = inferLocalApiBase()
  const resolvedApiBase = apiBaseFromUrl || storedApiBase || inferredApiBase

  const themeSkinFromUrl = urlParams.get('theme_skin') ?? urlParams.get('themeSkin')
  const themeSkin = normalizeThemeSkin(themeSkinFromUrl || localStorage.getItem(THEME_SKIN_KEY) || DEFAULT_THEME_SKIN)

  document.documentElement.setAttribute('data-theme-skin', themeSkin)
  document.documentElement.setAttribute('data-app-mode', THEME_MODE_MAP[themeSkin] || 'light')
  localStorage.setItem(THEME_SKIN_KEY, themeSkin)

  if (!document.querySelector('link[href="assets/css/theme.css"]')) {
    const themeStylesheet = document.createElement('link')
    themeStylesheet.rel = 'stylesheet'
    themeStylesheet.href = 'assets/css/theme.css'
    document.head.append(themeStylesheet)
  }

  if (!document.querySelector('script[src="js/theme-palette-config.js"]')) {
    const themeConfigScript = document.createElement('script')
    themeConfigScript.src = 'js/theme-palette-config.js'
    themeConfigScript.async = false
    document.head.append(themeConfigScript)
  }

  if (!document.querySelector('script[src="js/theme.js"]')) {
    const themeScript = document.createElement('script')
    themeScript.src = 'js/theme.js'
    themeScript.async = false
    document.head.append(themeScript)
  }

  if (resolvedApiBase && !window.WIFI_DASHBOARD_API_BASE) {
    window.WIFI_DASHBOARD_API_BASE = resolvedApiBase
  }

  const getSidebarMode = () => {
    const modeFromUrl = urlParams.get('sidebar')
    if (modeFromUrl === 'full' || modeFromUrl === 'minimal') return modeFromUrl
    const stored = localStorage.getItem(SIDEBAR_MODE_KEY)
    if (stored === 'full' || stored === 'minimal') return stored
    return 'minimal'
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
    if (getSidebarMode() !== 'minimal') return

    const sidebarNav = document.querySelector('#sidebar ul.sidebar-nav')
    if (!sidebarNav) return

    const homeItem =
      sidebarNav.querySelector('a.nav-link[href="index.html"]')?.closest('li') ??
      ensureNavItem({
        href: 'index.html',
        icon: 'node_modules/@coreui/icons/sprites/free.svg#cil-home',
        label: 'Home'
      }, sidebarNav)

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
        item === homeItem ||
        (wifiDashboardGroup ? item === wifiDashboardGroup : false) ||
        (dashboardItem ? item === dashboardItem : false)

      item.style.display = shouldShow ? '' : 'none'
    })
  }

  document.addEventListener('DOMContentLoaded', applyMinimalSidebar)
})()
