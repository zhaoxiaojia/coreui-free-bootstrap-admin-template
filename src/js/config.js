/**
 * --------------------------------------------------------------------------
 * CoreUI Boostrap Admin Template config.js
 * Licensed under MIT (https://github.com/coreui/coreui-free-bootstrap-admin-template/blob/main/LICENSE)
 * --------------------------------------------------------------------------
 */

(() => {
  const debug = (...args) => console.info('[wifi-config]', ...args)
  const warn = (...args) => console.warn('[wifi-config]', ...args)
  const SIDEBAR_DATATYPE_KEY = 'wifi-dashboard-last-datatype'
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
  const currentPathname = (() => {
    const path = window.location.pathname.split('/').pop() || 'index.html'
    return path.trim().toLowerCase()
  })()
  const isWifiPagePath = currentPathname === 'wifi-dashboard.html' || currentPathname === 'wifi-ota.html' || currentPathname === 'wifi-function.html' || currentPathname === 'wifi-compatibility.html' || currentPathname === 'wifi-home.html' || currentPathname === 'wifi-interference.html'
  const initialSidebarMode = (() => {
    const modeFromUrl = urlParams.get('sidebar')
    if (modeFromUrl === 'full' || modeFromUrl === 'minimal') return modeFromUrl
    const stored = localStorage.getItem(SIDEBAR_MODE_KEY)
    if (stored === 'full' || stored === 'minimal') return stored
    return isWifiPagePath ? 'full' : 'minimal'
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

  const collectSidebarSnapshot = (label, extra = {}) => {
    const html = document.documentElement
    const body = document.body
    const sidebar = document.getElementById('sidebar')
    const sidebarNav = sidebar?.querySelector?.('.sidebar-nav') ?? null
    const wrapper = document.querySelector('.wrapper')
    const sidebarStyle = sidebar ? window.getComputedStyle(sidebar) : null
    const navStyle = sidebarNav ? window.getComputedStyle(sidebarNav) : null
    const wrapperStyle = wrapper ? window.getComputedStyle(wrapper) : null
    const simplebarWrapper = sidebar?.querySelector?.('.simplebar-content-wrapper') ?? null
    const simplebarContent = sidebar?.querySelector?.('.simplebar-content') ?? null
    const simplebarWrapperStyle = simplebarWrapper ? window.getComputedStyle(simplebarWrapper) : null
    const simplebarContentStyle = simplebarContent ? window.getComputedStyle(simplebarContent) : null
    const wifiGroup = sidebarNav?.querySelector?.('li.nav-group.wifi-only') ?? null
    const wifiGroupStyle = wifiGroup ? window.getComputedStyle(wifiGroup) : null
    const wifiItems = Array.from(wifiGroup?.querySelectorAll?.(':scope > .nav-group-items > .nav-item, :scope > .nav-group-items > li.nav-item') ?? [])
    const wifiItemStates = wifiItems.map(item => {
      const style = window.getComputedStyle(item)
      const control = item.querySelector('.nav-link')
      const controlStyle = control ? window.getComputedStyle(control) : null
      const rect = control?.getBoundingClientRect?.()
      return {
        text: control?.textContent?.trim?.() ?? null,
        itemDisplay: style.display,
        itemVisibility: style.visibility,
        controlTag: control?.tagName ?? null,
        controlDisplay: controlStyle?.display ?? null,
        controlVisibility: controlStyle?.visibility ?? null,
        controlOpacity: controlStyle?.opacity ?? null,
        controlColor: controlStyle?.color ?? null,
        controlBackground: controlStyle?.backgroundColor ?? null,
        controlFontSize: controlStyle?.fontSize ?? null,
        controlLineHeight: controlStyle?.lineHeight ?? null,
        controlTextIndent: controlStyle?.textIndent ?? null,
        controlPaddingInlineStart: controlStyle?.paddingInlineStart ?? null,
        controlWidth: rect ? `${Math.round(rect.width)}px` : null,
        controlHeight: rect ? `${Math.round(rect.height)}px` : null,
        controlLeft: rect ? `${Math.round(rect.left)}px` : null
      }
    })

    const payload = {
      label,
      href: window.location.href,
      htmlSidebarMode: html.getAttribute('data-sidebar-mode'),
      htmlSidebarReady: html.getAttribute('data-sidebar-ready'),
      storedSidebarMode: localStorage.getItem(SIDEBAR_MODE_KEY),
      bodyClass: body?.className ?? null,
      sidebarClass: sidebar?.className ?? null,
      sidebarExists: Boolean(sidebar),
      navExists: Boolean(sidebarNav),
      navChildCount: sidebarNav?.children?.length ?? 0,
      sidebarDisplay: sidebarStyle?.display ?? null,
      sidebarVisibility: sidebarStyle?.visibility ?? null,
      sidebarOpacity: sidebarStyle?.opacity ?? null,
      sidebarWidth: sidebarStyle?.width ?? null,
      sidebarLeft: sidebarStyle?.left ?? null,
      sidebarPosition: sidebarStyle?.position ?? null,
      sidebarMarginInlineStart: sidebarStyle?.marginInlineStart ?? null,
      sidebarTransform: sidebarStyle?.transform ?? null,
      navDisplay: navStyle?.display ?? null,
      navVisibility: navStyle?.visibility ?? null,
      navOpacity: navStyle?.opacity ?? null,
      navHeight: navStyle?.height ?? null,
      wrapperPaddingInlineStart: wrapperStyle?.paddingInlineStart ?? null,
      wrapperPaddingInlineEnd: wrapperStyle?.paddingInlineEnd ?? null,
      wifiGroupClass: wifiGroup?.className ?? null,
      wifiGroupDisplay: wifiGroupStyle?.display ?? null,
      wifiGroupVisibility: wifiGroupStyle?.visibility ?? null,
      wifiGroupOpacity: wifiGroupStyle?.opacity ?? null,
      simplebarWrapperExists: Boolean(simplebarWrapper),
      simplebarWrapperScrollTop: simplebarWrapper?.scrollTop ?? null,
      simplebarWrapperDisplay: simplebarWrapperStyle?.display ?? null,
      simplebarWrapperVisibility: simplebarWrapperStyle?.visibility ?? null,
      simplebarWrapperHeight: simplebarWrapperStyle?.height ?? null,
      simplebarContentExists: Boolean(simplebarContent),
      simplebarContentDisplay: simplebarContentStyle?.display ?? null,
      simplebarContentVisibility: simplebarContentStyle?.visibility ?? null,
      simplebarContentTransform: simplebarContentStyle?.transform ?? null,
      wifiItemStates,
      ...extra
    }

    debug('sidebar_snapshot', payload)
    debug('sidebar_snapshot_flat', [
      `label=${label}`,
      `mode=${payload.htmlSidebarMode}`,
      `ready=${payload.htmlSidebarReady}`,
      `sidebarClass=${payload.sidebarClass}`,
      `sidebarDisplay=${payload.sidebarDisplay}`,
      `sidebarVisibility=${payload.sidebarVisibility}`,
      `sidebarWidth=${payload.sidebarWidth}`,
      `sidebarLeft=${payload.sidebarLeft}`,
      `sidebarTransform=${payload.sidebarTransform}`,
      `navDisplay=${payload.navDisplay}`,
      `navVisibility=${payload.navVisibility}`,
      `wifiGroupDisplay=${payload.wifiGroupDisplay}`,
      `wifiGroupVisibility=${payload.wifiGroupVisibility}`,
      `simplebarWrapper=${payload.simplebarWrapperExists}/${payload.simplebarWrapperDisplay}/${payload.simplebarWrapperVisibility}/${payload.simplebarWrapperHeight}/scrollTop:${payload.simplebarWrapperScrollTop}`,
      `simplebarContent=${payload.simplebarContentExists}/${payload.simplebarContentDisplay}/${payload.simplebarContentVisibility}/${payload.simplebarContentTransform}`,
      `wifiItems=${wifiItemStates.map(item => `${item.text}:${item.itemDisplay}/${item.itemVisibility}/${item.controlDisplay}/${item.controlVisibility}/${item.controlOpacity}`).join(', ')}`
    ].join(' | '))
  }

  const resetWifiSidebarViewport = source => {
    if (!document.body?.classList?.contains('wifi-only-nav')) return

    const sidebar = document.getElementById('sidebar')
    const sidebarNav = sidebar?.querySelector?.('.sidebar-nav') ?? null
    const simplebarWrapper = sidebar?.querySelector?.('.simplebar-content-wrapper') ?? null

    const before = {
      source,
      sidebarNavScrollTop: sidebarNav?.scrollTop ?? null,
      simplebarWrapperScrollTop: simplebarWrapper?.scrollTop ?? null
    }

    if (sidebarNav) {
      sidebarNav.scrollTop = 0
    }

    if (simplebarWrapper) {
      simplebarWrapper.scrollTop = 0
    }

    debug('resetWifiSidebarViewport', {
      ...before,
      sidebarNavScrollTopAfter: sidebarNav?.scrollTop ?? null,
      simplebarWrapperScrollTopAfter: simplebarWrapper?.scrollTop ?? null
    })
  }

  const installSidebarTracing = () => {
    const html = document.documentElement
    const sidebar = document.getElementById('sidebar')
    const sidebarNav = sidebar?.querySelector?.('.sidebar-nav') ?? null

    collectSidebarSnapshot('trace_install')

    if (html) {
      new MutationObserver(mutations => {
        collectSidebarSnapshot('html_mutation', {
          mutations: mutations.map(mutation => ({
            type: mutation.type,
            attributeName: mutation.attributeName,
            value: mutation.attributeName ? html.getAttribute(mutation.attributeName) : null
          }))
        })
      }).observe(html, {
        attributes: true,
        attributeFilter: ['class', 'data-sidebar-mode', 'data-sidebar-ready', 'style']
      })
    }

    if (sidebar) {
      new MutationObserver(mutations => {
        collectSidebarSnapshot('sidebar_mutation', {
          mutations: mutations.map(mutation => ({
            type: mutation.type,
            attributeName: mutation.attributeName,
            value: mutation.attributeName ? sidebar.getAttribute(mutation.attributeName) : null
          }))
        })
      }).observe(sidebar, {
        attributes: true,
        attributeFilter: ['class', 'style']
      })
    }

    if (sidebarNav) {
      new MutationObserver(mutations => {
        collectSidebarSnapshot('sidebar_nav_mutation', {
          mutations: mutations.map(mutation => ({
            type: mutation.type,
            attributeName: mutation.attributeName,
            targetTag: mutation.target instanceof Element ? mutation.target.tagName : null,
            targetClass: mutation.target instanceof Element ? mutation.target.className : null
          }))
        })
      }).observe(sidebarNav, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      })
    }

    window.addEventListener('load', () => {
      resetWifiSidebarViewport('window_load')
      collectSidebarSnapshot('window_load')
      window.setTimeout(() => {
        resetWifiSidebarViewport('window_load_t+100')
        collectSidebarSnapshot('window_load_t+100')
      }, 100)
      window.setTimeout(() => {
        resetWifiSidebarViewport('window_load_t+500')
        collectSidebarSnapshot('window_load_t+500')
      }, 500)
      window.setTimeout(() => {
        resetWifiSidebarViewport('window_load_t+1500')
        collectSidebarSnapshot('window_load_t+1500')
      }, 1500)
    }, { once: true })
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
    debug('applyMinimalSidebar:start', {
      sidebarMode: getSidebarMode(),
      path: window.location.pathname
    })
    if (getSidebarMode() !== 'minimal') {
      document.documentElement.setAttribute('data-sidebar-ready', 'true')
      debug('applyMinimalSidebar:skip_non_minimal')
      return
    }

    const sidebarNav = document.querySelector('#sidebar ul.sidebar-nav')
    if (!sidebarNav) {
      document.documentElement.setAttribute('data-sidebar-ready', 'true')
      warn('applyMinimalSidebar:no_sidebar_nav')
      return
    }

    const homeItem = sidebarNav.querySelector('a.nav-link[href="index.html"]')?.closest('li') ?? null

    const wifiDashboardGroup =
      Array.from(sidebarNav.querySelectorAll('li.nav-group')).find(item => {
        const directNavLabel = item.querySelector(':scope > a.nav-link, :scope > .wifi-db-label, :scope > .nav-link')
        if (!directNavLabel) return false

        const href = directNavLabel.getAttribute('href') ?? ''
        if (href === 'wifi-dashboard.html') return true

        const text = `${directNavLabel.textContent ?? ''}`.trim().toLowerCase()
        return (
          text === 'wi-fi dashboard' ||
          text === 'wifi dashboard' ||
          text === 'wi-fi database' ||
          text === 'wifi database'
        )
      }) ?? null

    const dashboardItem = sidebarNav.querySelector('a.nav-link[href="dashboard.html"]')?.closest('li') ?? null

    const items = Array.from(sidebarNav.children)
    if (!wifiDashboardGroup && document.body?.classList?.contains('wifi-only-nav')) {
      warn('applyMinimalSidebar:wifi_group_not_found', {
        labels: items.map(item => ({
          tag: item.tagName,
          className: item.className,
          directLabel: item.querySelector(':scope > a.nav-link, :scope > .wifi-db-label, :scope > .nav-link')?.textContent?.trim?.() ?? null
        }))
      })
    }
    items.forEach(item => {
      const shouldShow =
        (wifiDashboardGroup ? item === wifiDashboardGroup : false) ||
        (dashboardItem ? item === dashboardItem : false)

      item.style.display = shouldShow ? '' : 'none'
    })
    document.documentElement.setAttribute('data-sidebar-ready', 'true')
    debug('applyMinimalSidebar:done', {
      totalItems: items.length,
      wifiDashboardGroupFound: Boolean(wifiDashboardGroup),
      dashboardItemFound: Boolean(dashboardItem)
    })
  }

  const syncWifiSidebarState = () => {
    const sidebarNav = document.querySelector('#sidebar ul.sidebar-nav')
    if (!sidebarNav) {
      warn('syncWifiSidebarState:no_sidebar_nav')
      return
    }

    const currentUrl = new URL(window.location.href)
    const currentPath = currentUrl.pathname.split('/').pop() || 'index.html'
    const currentDatatype = (currentUrl.searchParams.get('datatype') || '').trim().toUpperCase()
    const wifiGroup = sidebarNav.querySelector('li.nav-group.wifi-only') ??
      Array.from(sidebarNav.querySelectorAll('li.nav-group')).find(item => {
        const label = item.querySelector(':scope > a.nav-link, :scope > .wifi-db-label, :scope > .nav-link')
        const text = (label?.textContent || '').trim().toLowerCase()
        return text === 'wi-fi database' || text === 'wifi database' || text === 'wi-fi dashboard' || text === 'wifi dashboard'
      }) ?? null
    const parentLabel = wifiGroup?.querySelector(':scope > a.nav-link, :scope > .wifi-db-label, :scope > .nav-link') ?? null
    const childControls = Array.from(wifiGroup?.querySelectorAll(':scope > .nav-group-items .nav-link, :scope > .nav-group-items button.nav-link, :scope > .nav-group-items a.nav-link') ?? [])

    childControls.forEach(control => {
      control.classList.remove('active')
      control.removeAttribute('aria-current')
    })

    if (parentLabel) {
      parentLabel.classList.remove('active', 'is-section-active')
      parentLabel.removeAttribute('aria-current')
    }

    const childMatches = childControls.map(control => ({
      tag: control.tagName,
      text: (control.textContent || '').trim(),
      href: (control.getAttribute('href') || '').trim(),
      datatype: (control.dataset?.wifiDashboardDatatype || '').trim().toUpperCase()
    }))

    const activeChild = childControls.find(control => {
      const datatype = (control.dataset?.wifiDashboardDatatype || '').trim().toUpperCase()
      const href = (control.getAttribute('href') || '').trim()

      if (datatype) {
        return currentPath === 'wifi-dashboard.html' && datatype === currentDatatype
      }

      if (!href) return false

      if (href.startsWith('wifi-dashboard.html?datatype=')) {
        if (currentPath !== 'wifi-dashboard.html' || !currentDatatype) return false
        const linkUrl = new URL(href, currentUrl.origin)
        return (linkUrl.searchParams.get('datatype') || '').trim().toUpperCase() === currentDatatype
      }

      return href === currentPath
    })

    if (activeChild) {
      activeChild.classList.add('active')
      activeChild.setAttribute('aria-current', 'page')
    }

    if (parentLabel && activeChild) {
      parentLabel.classList.add('active', 'is-section-active')
      parentLabel.setAttribute('aria-current', 'page')
    }

    debug('syncWifiSidebarState:resolved', {
      currentPath,
      currentDatatype,
      wifiGroupFound: Boolean(wifiGroup),
      parentLabelTag: parentLabel?.tagName ?? null,
      parentLabelText: parentLabel?.textContent?.trim?.() ?? null,
      activeChildTag: activeChild?.tagName ?? null,
      activeChildHref: activeChild?.getAttribute('href') ?? null,
      activeChildDatatype: activeChild?.dataset?.wifiDashboardDatatype ?? null,
      activeChildText: activeChild?.textContent?.trim?.() ?? null,
      childMatches,
      groupClass: wifiGroup?.className ?? null,
      groupItemsClass: wifiGroup?.querySelector(':scope > .nav-group-items')?.className ?? null,
      groupItemsInlineStyle: wifiGroup?.querySelector(':scope > .nav-group-items')?.getAttribute('style') ?? null
    })
  }

  const registerWifiSidebarLinkTracing = () => {
    const sidebarNav = document.querySelector('#sidebar ul.sidebar-nav')
    if (!sidebarNav) {
      warn('registerWifiSidebarLinkTracing:no_sidebar_nav')
      return
    }

    const selector = '.nav-group-items button.nav-link[data-wifi-dashboard-datatype], .nav-group-items a.nav-link[href*="wifi-dashboard.html?datatype="], .nav-group-items a.nav-link[href="wifi-ota.html"], .nav-group-items a.nav-link[href="wifi-function.html"], .nav-group-items a.nav-link[href="wifi-compatibility.html"], .nav-group-items a.nav-link[href="wifi-home.html"], .nav-group-items a.nav-link[href="wifi-interference.html"], .nav-group-items a.nav-link[href="projects-progress.html"]'
    const controls = Array.from(sidebarNav.querySelectorAll(selector))

    debug('registerWifiSidebarLinkTracing:bind', {
      count: controls.length,
      controls: controls.map(control => ({
        tag: control.tagName,
        text: (control.textContent || '').trim(),
        href: control.getAttribute('href') || null,
        datatype: control.dataset?.wifiDashboardDatatype || null,
        type: control.getAttribute('type') || null
      }))
    })

    controls.forEach(control => {
      control.addEventListener('click', event => {
        const href = control.getAttribute('href') || ''
        const datatypeFromDataset = (control.dataset?.wifiDashboardDatatype || '').trim().toUpperCase() || null
        let datatype = datatypeFromDataset
        if (!datatype && href.includes('wifi-dashboard.html?datatype=')) {
          try {
            datatype = (new URL(href, window.location.origin).searchParams.get('datatype') || '').toUpperCase() || null
          } catch {
            datatype = null
          }
        }

        if (datatype) {
          sessionStorage.setItem(SIDEBAR_DATATYPE_KEY, datatype)
        } else {
          sessionStorage.removeItem(SIDEBAR_DATATYPE_KEY)
        }

        debug('sidebar_link_click', {
          tag: control.tagName,
          text: (control.textContent || '').trim(),
          href,
          datatype,
          currentHref: window.location.href,
          defaultPrevented: event.defaultPrevented,
          type: control.getAttribute('type') || null
        })
      })
    })
  }

  const debugHeaderLayout = () => {
    const header = document.querySelector('body.dashboard-page .header')
    if (!header) {
      warn('debugHeaderLayout:no_header')
      return
    }

    const headerRows = Array.from(header.children).map((node, index) => ({
      index,
      tag: node.tagName,
      className: node.className,
      childCount: node.children.length,
      text: (node.textContent || '').trim().slice(0, 120)
    }))

    debug('debugHeaderLayout:rows', {
      count: header.children.length,
      rows: headerRows
    })

    const computed = window.getComputedStyle(header)
    debug('debugHeaderLayout:computed', {
      position: computed.position,
      top: computed.top,
      left: computed.left,
      right: computed.right,
      zIndex: computed.zIndex,
      width: computed.width,
      transform: computed.transform,
      rect: header.getBoundingClientRect().toJSON ? header.getBoundingClientRect().toJSON() : {
        top: header.getBoundingClientRect().top,
        left: header.getBoundingClientRect().left,
        width: header.getBoundingClientRect().width,
        height: header.getBoundingClientRect().height
      }
    })
  }

  document.addEventListener('DOMContentLoaded', () => {
    debug('DOMContentLoaded', {
      href: window.location.href,
      apiBase: window.WIFI_DASHBOARD_API_BASE ?? null
    })
    installSidebarTracing()
    collectSidebarSnapshot('before_applyMinimalSidebar')
    applyMinimalSidebar()
    resetWifiSidebarViewport('after_applyMinimalSidebar')
    collectSidebarSnapshot('after_applyMinimalSidebar')
    syncWifiSidebarState()
    resetWifiSidebarViewport('after_syncWifiSidebarState')
    collectSidebarSnapshot('after_syncWifiSidebarState')
    registerWifiSidebarLinkTracing()
    debugHeaderLayout()
    window.requestAnimationFrame(() => {
      resetWifiSidebarViewport('raf_1')
      window.requestAnimationFrame(() => {
        resetWifiSidebarViewport('raf_2')
      })
    })
  })
})()






