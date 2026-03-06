/**
 * --------------------------------------------------------------------------
 * CoreUI Boostrap Admin Template config.js
 * Licensed under MIT (https://github.com/coreui/coreui-free-bootstrap-admin-template/blob/main/LICENSE)
 * --------------------------------------------------------------------------
 */

(() => {
  const THEME = 'coreui-free-bootstrap-admin-template-theme'
  const urlParams = new URLSearchParams(window.location.href.split('?')[1])
  const SIDEBAR_MODE_KEY = 'coreui-free-bootstrap-admin-template-sidebar-mode'

  if (urlParams.get('theme') && ['auto', 'dark', 'light'].includes(urlParams.get('theme'))) {
    localStorage.setItem(THEME, urlParams.get('theme'))
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

    const homeItem = ensureNavItem({
      href: 'index.html',
      icon: 'node_modules/@coreui/icons/sprites/free.svg#cil-home',
      label: 'Home'
    }, sidebarNav)

    const dashboardItem = ensureNavItem({
      href: 'dashboard.html',
      icon: 'node_modules/@coreui/icons/sprites/free.svg#cil-speedometer',
      label: 'Dashboard'
    }, sidebarNav)

    const items = Array.from(sidebarNav.children)
    items.forEach(item => {
      item.style.display = item === homeItem || item === dashboardItem ? '' : 'none'
    })
  }

  document.addEventListener('DOMContentLoaded', applyMinimalSidebar)
})()
