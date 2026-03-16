(() => {
  const STORAGE_KEY = 'coreui-free-bootstrap-admin-template-theme-skin'
  const MODE_KEY = 'coreui-free-bootstrap-admin-template-app-mode'
  const FALLBACK_THEME = 'daylight'
  const DARK_LOGO_SRC = 'assets/brand/amlogic_dark.jpg'
  const LIGHT_LOGO_SRC = 'assets/brand/amlogic_light.png'
  const FALLBACK_CONFIG = {
    defaultTheme: FALLBACK_THEME,
    themes: {
      daylight: {
        label: 'Day',
        description: 'Warm daylight palette',
        mode: 'light',
        paletteUrl: 'https://coolors.co/palette/ccd5ae-e9edc9-fefae0-faedcd-d4a373'
      },
      nightfall: {
        label: 'Night',
        description: 'Deep night palette',
        mode: 'dark',
        paletteUrl: 'https://coolors.co/palette/134074-13315c-0b2545-8da9c4-eef4ed'
      },
      cobalt: {
        label: 'Blue',
        description: 'Blue data-center palette',
        mode: 'light',
        paletteUrl: 'https://coolors.co/palette/03045e-023e8a-0077b6-0096c7-00b4d8-48cae4-90e0ef-ade8f4-caf0f8'
      }
    }
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

  const hexToRgb = hex => {
    const normalized = hex.replace('#', '').trim()
    const value = normalized.length === 3
      ? normalized.split('').map(char => char + char).join('')
      : normalized

    const parsed = Number.parseInt(value, 16)
    return {
      r: (parsed >> 16) & 255,
      g: (parsed >> 8) & 255,
      b: parsed & 255
    }
  }

  const rgbToHex = ({ r, g, b }) => {
    const toHex = channel => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }

  const mix = (colorA, colorB, ratio = 0.5) => {
    const weight = clamp(ratio, 0, 1)
    const left = hexToRgb(colorA)
    const right = hexToRgb(colorB)
    return rgbToHex({
      r: left.r + (right.r - left.r) * weight,
      g: left.g + (right.g - left.g) * weight,
      b: left.b + (right.b - left.b) * weight
    })
  }

  const toRgba = (hex, alpha) => {
    const { r, g, b } = hexToRgb(hex)
    return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`
  }

  const toRgbChannels = hex => {
    const { r, g, b } = hexToRgb(hex)
    return `${r}, ${g}, ${b}`
  }

  const luminance = hex => {
    const { r, g, b } = hexToRgb(hex)
    const channels = [r, g, b].map(value => {
      const normalized = value / 255
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  }

  const contrastColor = (background, dark = '#0f172a', light = '#ffffff') => {
    return luminance(background) > 0.45 ? dark : light
  }

  const normalizeHex = value => {
    const hex = `${value}`.trim().replace('#', '')
    return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toLowerCase()}` : null
  }

  const parseCoolorsPaletteUrl = paletteUrl => {
    if (!paletteUrl) return []

    const decoded = decodeURIComponent(`${paletteUrl}`.trim())
    const match = decoded.match(/coolors\.co\/(?:palette\/)?([0-9a-fA-F-]{6,})/)
    if (!match) return []

    return [...new Set(match[1].split('-').map(normalizeHex).filter(Boolean))]
  }

  const normalizeThemeMode = mode => (mode === 'dark' ? 'dark' : mode === 'light' ? 'light' : null)

  const setDocumentColorMode = mode => {
    const normalizedMode = normalizeThemeMode(mode) || 'light'
    document.documentElement.setAttribute('data-app-mode', normalizedMode)
    document.body?.setAttribute('data-app-mode', normalizedMode)
    localStorage.setItem(MODE_KEY, normalizedMode)
    return normalizedMode
  }

  const getCurrentColorMode = () => {
    const attr = document.documentElement.getAttribute('data-app-mode')
    if (attr === 'dark' || attr === 'light') return attr

    const stored = localStorage.getItem(MODE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
    return 'light'
  }

  const sortByLuminance = colors => [...colors].sort((left, right) => luminance(left) - luminance(right))
  const pick = (colors, index) => colors[clamp(index, 0, colors.length - 1)]
  const strengthen = (color, against, amount = 0.22) => mix(color, against, amount)
  const paletteAt = (colors, index) => colors[clamp(index, 0, colors.length - 1)]

  const buildDarkTokens = ({ darkest, dark, mid, light, lightest, brand, accent, support, colors }) => {
    const c0 = paletteAt(colors, 0)
    const c1 = paletteAt(colors, 1)
    const c2 = paletteAt(colors, 2)
    const c3 = paletteAt(colors, 3)
    const c4 = paletteAt(colors, 4)
    const c5 = paletteAt(colors, 5)
    const c6 = paletteAt(colors, 6)
    const c7 = paletteAt(colors, 7)
    const c8 = paletteAt(colors, colors.length - 1)
    const body = '#0b1220'
    const surface = '#111b2e'
    const panel = '#162338'
    const panelStrong = '#1d2d47'
    const heroStart = mix(surface, c2, 0.14)
    const heroEnd = mix(surface, c4, 0.2)
    const text = '#e5e7eb'
    const heading = '#f9fafb'
    const brandSolid = c4
    const accentSolid = mix(c2, c5, 0.18)
    const onBrand = contrastColor(brandSolid, '#0f172a', '#ffffff')

    return {
      '--app-theme-name': 'Dynamic Theme',
      '--app-body-bg': body,
      '--app-body-bg-rgb': toRgbChannels(body),
      '--app-surface': surface,
      '--app-surface-alt': mix(surface, panel, 0.42),
      '--app-surface-glass': toRgba(surface, 0.88),
      '--app-panel': panel,
      '--app-panel-strong': panelStrong,
      '--app-muted-surface': toRgba(c5, 0.16),
      '--app-text': text,
      '--app-mode-text': '#e5e7eb',
      '--app-text-muted': '#9ca3af',
      '--app-heading': heading,
      '--app-border': toRgba('#dbe7ff', 0.14),
      '--app-border-strong': toRgba('#dbe7ff', 0.24),
      '--app-shadow': `0 24px 48px -28px ${toRgba(darkest, 0.82)}`,
      '--app-shadow-soft': `0 16px 32px -24px ${toRgba(darkest, 0.66)}`,
      '--app-brand': brandSolid,
      '--app-brand-strong': onBrand,
      '--app-on-brand': onBrand,
      '--app-brand-soft': toRgba(brandSolid, 0.22),
      '--app-accent': accentSolid,
      '--app-accent-soft': toRgba(accentSolid, 0.22),
      '--app-success': support,
      '--app-warning': light,
      '--app-danger': mix(brand, darkest, 0.42),
      '--app-info': accent,
      '--app-nav-bg': toRgba('#132034', 0.95),
      '--app-nav-text': text,
      '--app-nav-hover': support,
      '--app-sidebar-bg': darkest,
      '--app-sidebar-surface': dark,
      '--app-sidebar-text': text,
      '--app-sidebar-muted': '#9ca3af',
      '--app-sidebar-hover': toRgba(support, 0.18),
      '--app-sidebar-active': `linear-gradient(135deg, ${brand}, ${support})`,
      '--app-hero-start': heroStart,
      '--app-hero-end': heroEnd,
      '--app-hero-text': heading,
      '--app-hero-muted': '#9ca3af',
      '--app-chip-bg': toRgba(c6, 0.22),
      '--app-chip-active-bg': brandSolid,
      '--app-rank-bg': toRgba(brandSolid, 0.16),
      '--app-chart-1': c1,
      '--app-chart-2': c3,
      '--app-chart-3': c5,
      '--app-chart-4': c7,
      '--app-palette-1': c0,
      '--app-palette-2': c1,
      '--app-palette-3': c2,
      '--app-palette-4': c3,
      '--app-palette-5': c4,
      '--app-palette-6': c5,
      '--app-palette-7': c6,
      '--app-palette-8': c7,
      '--app-palette-9': c8
    }
  }

  const buildLightTokens = ({ darkest, dark, mid, light, lightest, brand, accent, support, colors }) => {
    const c0 = paletteAt(colors, 0)
    const c1 = paletteAt(colors, 1)
    const c2 = paletteAt(colors, 2)
    const c3 = paletteAt(colors, 3)
    const c4 = paletteAt(colors, 4)
    const c5 = paletteAt(colors, 5)
    const c6 = paletteAt(colors, 6)
    const c7 = paletteAt(colors, 7)
    const c8 = paletteAt(colors, colors.length - 1)
    const body = '#f6f8fb'
    const surface = '#ffffff'
    const panel = '#f2f5fa'
    const panelStrong = '#e7edf6'
    const heroStart = mix(panel, c2, 0.08)
    const heroEnd = mix(panel, c4, 0.12)
    const text = '#111827'
    const heading = '#0f172a'
    const brandSolid = strengthen(c3, c1, 0.2)
    const accentSolid = strengthen(c5, c2, 0.18)
    const sidebarBase = strengthen(c1, c0, 0.2)
    const onBrand = contrastColor(brandSolid, '#0f172a', '#ffffff')

    return {
      '--app-theme-name': 'Dynamic Theme',
      '--app-body-bg': body,
      '--app-body-bg-rgb': toRgbChannels(body),
      '--app-surface': surface,
      '--app-surface-alt': mix(surface, panel, 0.72),
      '--app-surface-glass': toRgba(surface, 0.9),
      '--app-panel': panel,
      '--app-panel-strong': panelStrong,
      '--app-muted-surface': toRgba(c6, 0.16),
      '--app-text': text,
      '--app-mode-text': '#0f172a',
      '--app-text-muted': '#475569',
      '--app-heading': heading,
      '--app-border': 'rgba(15, 23, 42, 0.10)',
      '--app-border-strong': 'rgba(15, 23, 42, 0.18)',
      '--app-shadow': `0 20px 45px -28px ${toRgba(dark, 0.3)}`,
      '--app-shadow-soft': `0 14px 32px -24px ${toRgba(dark, 0.2)}`,
      '--app-brand': brandSolid,
      '--app-brand-strong': onBrand,
      '--app-on-brand': onBrand,
      '--app-brand-soft': toRgba(brandSolid, 0.18),
      '--app-accent': accentSolid,
      '--app-accent-soft': toRgba(accentSolid, 0.18),
      '--app-success': support,
      '--app-warning': light,
      '--app-danger': strengthen(brandSolid, darkest, 0.18),
      '--app-info': accentSolid,
      '--app-nav-bg': 'rgba(255, 255, 255, 0.92)',
      '--app-nav-text': text,
      '--app-nav-hover': brandSolid,
      '--app-sidebar-bg': sidebarBase,
      '--app-sidebar-surface': brandSolid,
      '--app-sidebar-text': text,
      '--app-sidebar-muted': '#475569',
      '--app-sidebar-hover': toRgba(support, 0.2),
      '--app-sidebar-active': `linear-gradient(135deg, ${brandSolid}, ${accentSolid})`,
      '--app-hero-start': heroStart,
      '--app-hero-end': heroEnd,
      '--app-hero-text': heading,
      '--app-hero-muted': '#475569',
      '--app-chip-bg': mix(c8, c6, 0.3),
      '--app-chip-active-bg': brandSolid,
      '--app-rank-bg': toRgba(brandSolid, 0.14),
      '--app-chart-1': c0,
      '--app-chart-2': c2,
      '--app-chart-3': c4,
      '--app-chart-4': c6,
      '--app-palette-1': c0,
      '--app-palette-2': c1,
      '--app-palette-3': c2,
      '--app-palette-4': c3,
      '--app-palette-5': c4,
      '--app-palette-6': c5,
      '--app-palette-7': c6,
      '--app-palette-8': c7,
      '--app-palette-9': c8
    }
  }

  const buildThemeTokens = (colors, mode) => {
    const safeColors = colors.length > 0 ? colors : ['#0f172a', '#1d4ed8', '#60a5fa', '#dbeafe', '#f8fafc']
    const sorted = sortByLuminance(safeColors)
    const darkest = pick(sorted, 0)
    const dark = pick(sorted, 1)
    const mid = pick(sorted, Math.floor((sorted.length - 1) / 2))
    const light = pick(sorted, sorted.length - 2)
    const lightest = pick(sorted, sorted.length - 1)
    const brand = safeColors[Math.min(1, safeColors.length - 1)] ?? dark
    const accent = safeColors[Math.min(2, safeColors.length - 1)] ?? mid
    const support = safeColors[Math.min(3, safeColors.length - 1)] ?? light
    const normalizedMode = normalizeThemeMode(mode)
    const isDark = normalizedMode === 'dark' || (normalizedMode == null && luminance(lightest) < 0.5)

    const tokens = isDark
      ? buildDarkTokens({ darkest, dark, mid, light, lightest, brand, accent, support, colors: safeColors })
      : buildLightTokens({ darkest, dark, mid, light, lightest, brand, accent, support, colors: safeColors })

    return tokens
  }

  const getThemeConfig = () => {
    const external = window.APP_THEME_CONFIG
    if (!external || typeof external !== 'object' || !external.themes) return FALLBACK_CONFIG
    return {
      defaultTheme: external.defaultTheme || FALLBACK_CONFIG.defaultTheme,
      themes: external.themes
    }
  }

  const getThemes = () => getThemeConfig().themes
  const getDefaultTheme = () => getThemeConfig().defaultTheme || FALLBACK_THEME

  const normalizeTheme = value => {
    const themes = getThemes()
    return Object.hasOwn(themes, value) ? value : getDefaultTheme()
  }

  const getResolvedTheme = (themeName, forcedMode = null) => {
    const key = normalizeTheme(themeName)
    const theme = getThemes()[key]
    const colors = parseCoolorsPaletteUrl(theme.paletteUrl)
    const mode = normalizeThemeMode(forcedMode) || normalizeThemeMode(theme.mode) || getCurrentColorMode()
    const tokens = buildThemeTokens(colors, mode)
    const swatch = colors.length > 1
      ? `linear-gradient(135deg, ${colors[0]}, ${colors[colors.length - 1]})`
      : colors[0] || '#0f172a'
    return {
      key,
      label: theme.label || key,
      description: theme.description || `${colors.length} colors from Coolors`,
      mode: mode || (luminance(tokens['--app-body-bg']) < 0.4 ? 'dark' : 'light'),
      colors,
      swatch,
      tokens
    }
  }

  const applyThemeTokens = tokens => {
    for (const [name, value] of Object.entries(tokens)) {
      document.documentElement.style.setProperty(name, value)
    }
  }

  const syncBrandLogo = mode => {
    const nextSrc = mode === 'light' ? LIGHT_LOGO_SRC : DARK_LOGO_SRC
    document.querySelectorAll('.sidebar-brand img[alt="Amlogic Logo"]').forEach(img => {
      if (img.getAttribute('src') !== nextSrc) {
        img.setAttribute('src', nextSrc)
      }
    })
  }

  const applyTheme = themeName => {
    const themeKey = normalizeTheme(themeName)
    const themeConfig = getThemes()[themeKey]
    const resolvedMode = normalizeThemeMode(themeConfig?.mode) || getCurrentColorMode()
    const activeMode = setDocumentColorMode(resolvedMode)
    const theme = getResolvedTheme(themeKey, activeMode)

    document.documentElement.setAttribute('data-theme-skin', theme.key)
    document.body?.setAttribute('data-theme-skin', theme.key)
    applyThemeTokens(theme.tokens)
    syncBrandLogo(activeMode)
    localStorage.setItem(STORAGE_KEY, theme.key)

    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme.tokens['--app-sidebar-bg'])

    document.querySelectorAll('[data-theme-select]').forEach(item => {
      const isActive = item.getAttribute('data-theme-select') === theme.key
      item.classList.toggle('active', isActive)
      item.setAttribute('aria-pressed', isActive ? 'true' : 'false')
    })

    document.querySelectorAll('[data-theme-current-label]').forEach(el => {
      el.textContent = 'Theme'
    })

    document.dispatchEvent(new CustomEvent('app:themechange', { detail: theme }))
    return theme.key
  }

  const initializeTheme = () => {
    const fromDataset = document.documentElement.getAttribute('data-theme-skin')
    const fromStorage = localStorage.getItem(STORAGE_KEY)
    return applyTheme(fromDataset || fromStorage || getDefaultTheme())
  }

  const renderThemeMenus = () => {
    const menus = document.querySelectorAll('[data-theme-menu]')
    if (menus.length === 0) return

    const items = Object.keys(getThemes()).map(key => {
      const theme = getThemes()[key]
      return getResolvedTheme(key, normalizeThemeMode(theme?.mode))
    })
    for (const menu of menus) {
      if (menu.dataset.themeMenuReady === 'true') continue
      menu.dataset.themeMenuReady = 'true'
      menu.classList.add('theme-menu')
      menu.innerHTML = items.map(theme => `
        <li>
          <button class="dropdown-item" type="button" data-theme-select="${theme.key}" aria-pressed="false">
            <span class="theme-swatch" style="background:${theme.swatch}"></span>
            <span class="theme-label">
              <span>${theme.label}</span>
            </span>
          </button>
        </li>
      `).join('')
    }

    document.querySelectorAll('[data-theme-select]').forEach(item => {
      if (item.dataset.themeBound === 'true') return
      item.dataset.themeBound = 'true'
      item.addEventListener('click', () => {
        applyTheme(item.getAttribute('data-theme-select'))
      })
    })
  }

  const boot = () => {
    renderThemeMenus()
    initializeTheme()
  }

  window.APP_THEME = {
    applyTheme,
    initializeTheme,
    parseCoolorsPaletteUrl,
    buildThemeTokens,
    getResolvedTheme,
    get themes() {
      return getThemes()
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true })
  } else {
    boot()
  }
})()
