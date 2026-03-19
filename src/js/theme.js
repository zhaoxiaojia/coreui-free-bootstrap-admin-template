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
        mode: 'dark',
        paletteUrl: 'https://coolors.co/palette/03045e-023e8a-0077b6-0096c7-00b4d8-48cae4-90e0ef-ade8f4-caf0f8'
      },
      corporate: {
        label: 'Corporate',
        description: 'Corporate palette based on #0a3285',
        mode: 'light',
        paletteUrl: 'https://coolors.co/palette/041539-062055-092d77-0a3285-0c3da1-104ed1-3874f0-7aa2f5-d9e4fc'
      }
    }
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

  const hexToRgb = hex => {
    const normalized = `${hex}`.replace('#', '').trim()
    const value = normalized.length === 3
      ? normalized.split('').map(char => char + char).join('')
      : normalized

    const parsed = Number.parseInt(value, 16)
    return {
      r: (parsed >> 16) & 255,
      g: (parsed >> 8) & 255,
      b: parsed & 255,
      a: 1
    }
  }

  const parseColor = color => {
    if (!color) return { r: 0, g: 0, b: 0, a: 1 }

    const value = `${color}`.trim()
    if (value.startsWith('#')) {
      return hexToRgb(value)
    }

    const rgbaMatch = value.match(/^rgba?\(([^)]+)\)$/i)
    if (rgbaMatch) {
      const [r = 0, g = 0, b = 0, a = 1] = rgbaMatch[1]
        .split(',')
        .map(part => Number.parseFloat(part.trim()))
      return {
        r: clamp(Number.isFinite(r) ? r : 0, 0, 255),
        g: clamp(Number.isFinite(g) ? g : 0, 0, 255),
        b: clamp(Number.isFinite(b) ? b : 0, 0, 255),
        a: clamp(Number.isFinite(a) ? a : 1, 0, 1)
      }
    }

    return hexToRgb(value)
  }

  const compositeColor = (foreground, background) => {
    const fg = parseColor(foreground)
    const bg = parseColor(background)
    const alpha = fg.a ?? 1
    return {
      r: fg.r * alpha + bg.r * (1 - alpha),
      g: fg.g * alpha + bg.g * (1 - alpha),
      b: fg.b * alpha + bg.b * (1 - alpha),
      a: 1
    }
  }

  const rgbToHex = ({ r, g, b }) => {
    const toHex = channel => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }

  const mix = (colorA, colorB, ratio = 0.5) => {
    const weight = clamp(ratio, 0, 1)
    const left = parseColor(colorA)
    const right = parseColor(colorB)
    return rgbToHex({
      r: left.r + (right.r - left.r) * weight,
      g: left.g + (right.g - left.g) * weight,
      b: left.b + (right.b - left.b) * weight
    })
  }

  const toRgba = (hex, alpha) => {
    const { r, g, b } = parseColor(hex)
    return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`
  }

  const toRgbChannels = hex => {
    const { r, g, b } = parseColor(hex)
    return `${r}, ${g}, ${b}`
  }

  const luminance = color => {
    const { r, g, b } = parseColor(color)
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

  const contrastRatio = (colorA, colorB) => {
    const left = luminance(colorA)
    const right = luminance(colorB)
    const lighter = Math.max(left, right)
    const darker = Math.min(left, right)
    return (lighter + 0.05) / (darker + 0.05)
  }

  const resolveStateTextColor = (background, mode) => {
    const baseSurface = mode === 'dark' ? '#111b2e' : '#ffffff'
    const effectiveBackground = `${background}`.includes('rgba(')
      ? compositeColor(background, baseSurface)
      : parseColor(background)
    const normalizedBackground = rgbToHex(effectiveBackground)
    const darkInk = '#0f172a'
    const lightInk = '#ffffff'
    return contrastRatio(normalizedBackground, darkInk) >= contrastRatio(normalizedBackground, lightInk)
      ? darkInk
      : lightInk
  }

  const buildInteractiveStateTokens = ({ mode, bg, hoverBg, activeBg, border, activeBorder, ring, disabledBg }) => ({
    '--app-control-bg': bg,
    '--app-control-hover-bg': hoverBg,
    '--app-control-active-bg': activeBg,
    '--app-control-border': border,
    '--app-control-active-border': activeBorder,
    '--app-control-text': resolveStateTextColor(bg, mode),
    '--app-control-hover-text': resolveStateTextColor(hoverBg, mode),
    '--app-control-active-text': resolveStateTextColor(activeBg, mode),
    '--app-control-ring': ring,
    '--app-control-disabled-bg': disabledBg,
    '--app-control-disabled-text': resolveStateTextColor(disabledBg, mode),
    '--app-control-disabled-border': border
  })

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
  const extractPaletteColorsFromUrl = parseCoolorsPaletteUrl

  const buildContainerThemeTokens = ({ mode, darkest, dark, c0, c1, c2, c4 }) => {
    if (mode === 'dark') {
      const body = '#0b1220'
      const surface = '#111b2e'
      const panel = '#162338'
      const panelStrong = '#1d2d47'
      const nav = surface
      const sidebar = surface
      const sidebarSurface = panel
      return {
        '--app-body-bg': body,
        '--app-body-bg-rgb': toRgbChannels(body),
        '--app-surface': surface,
        '--app-surface-alt': mix(surface, panel, 0.42),
        '--app-surface-glass': toRgba(surface, 0.88),
        '--app-panel': panel,
        '--app-panel-strong': panelStrong,
        '--app-text': '#e5e7eb',
        '--app-mode-text': '#e5e7eb',
        '--app-text-muted': '#9ca3af',
        '--app-heading': '#f9fafb',
        '--app-border': toRgba('#dbe7ff', 0.14),
        '--app-border-strong': toRgba('#dbe7ff', 0.24),
        '--app-shadow': `0 24px 48px -28px ${toRgba(darkest, 0.82)}`,
        '--app-shadow-soft': `0 16px 32px -24px ${toRgba(darkest, 0.66)}`,
        '--app-nav-bg': nav,
        '--app-nav-text': '#e5e7eb',
        '--app-hero-start': mix(surface, c2, 0.14),
        '--app-hero-end': mix(surface, c4, 0.2),
        '--app-hero-text': '#f9fafb',
        '--app-hero-muted': '#9ca3af',
        '--app-sidebar-bg': sidebar,
        '--app-sidebar-surface': sidebarSurface,
        '--app-sidebar-text': '#e5e7eb',
        '--app-sidebar-muted': '#9ca3af'
      }
    }

    const body = '#f6f8fb'
    const surface = '#ffffff'
    const panel = '#f2f5fa'
    const panelStrong = '#e7edf6'
    const nav = surface
    const sidebar = surface
    const sidebarSurface = panel
    return {
      '--app-body-bg': body,
      '--app-body-bg-rgb': toRgbChannels(body),
      '--app-surface': surface,
      '--app-surface-alt': mix(surface, panel, 0.72),
      '--app-surface-glass': toRgba(surface, 0.9),
      '--app-panel': panel,
      '--app-panel-strong': panelStrong,
      '--app-text': '#111827',
      '--app-mode-text': '#0f172a',
      '--app-text-muted': '#475569',
      '--app-heading': '#0f172a',
      '--app-border': 'rgba(15, 23, 42, 0.10)',
      '--app-border-strong': 'rgba(15, 23, 42, 0.18)',
      '--app-shadow': `0 20px 45px -28px ${toRgba(dark, 0.3)}`,
      '--app-shadow-soft': `0 14px 32px -24px ${toRgba(dark, 0.2)}`,
      '--app-nav-bg': nav,
      '--app-nav-text': '#111827',
      '--app-hero-start': mix(panel, c1, 0.08),
      '--app-hero-end': mix(panel, c4, 0.12),
      '--app-hero-text': '#0f172a',
      '--app-hero-muted': '#475569',
      '--app-sidebar-bg': sidebar,
      '--app-sidebar-surface': sidebarSurface,
      '--app-sidebar-text': '#111827',
      '--app-sidebar-muted': '#475569'
    }
  }

  const buildPaletteControlTokens = ({ mode, darkest, colors, c1, c3, c4, c5, c6, c7, c8 }) => {
    if (mode === 'dark') {
      const controlIdleBg = toRgba(c3, 0.28)
      const controlHoverBg = toRgba(c4, 0.34)
      const controlActiveBg = c4
      return {
        ...buildInteractiveStateTokens({
          mode,
          bg: controlIdleBg,
          hoverBg: controlHoverBg,
          activeBg: controlActiveBg,
          border: toRgba(c5, 0.28),
          activeBorder: toRgba(c6, 0.42),
          ring: toRgba(c5, 0.22),
          disabledBg: toRgba(c5, 0.12)
        }),
        '--app-chip-bg': toRgba(c6, 0.18),
        '--app-chip-active-bg': c4,
        '--app-progress-track': toRgba(c5, 0.12),
        '--app-progress-fill': `linear-gradient(90deg, ${c3}, ${c4})`,
        '--app-motion-glow': `0 0 0 0.18rem ${toRgba(c5, 0.18)}`,
        '--app-brand': c4,
        '--app-brand-strong': contrastColor(c4, '#0f172a', '#ffffff'),
        '--app-on-brand': contrastColor(c4, '#0f172a', '#ffffff'),
        '--app-brand-soft': toRgba(c4, 0.22),
        '--app-accent': mix(c1, c5, 0.18),
        '--app-accent-soft': toRgba(mix(c1, c5, 0.18), 0.22),
        '--app-success': c6,
        '--app-warning': c8,
        '--app-danger': mix(c1, darkest, 0.42),
        '--app-info': c3,
        '--app-rank-bg': toRgba(c4, 0.16),
        '--app-chart-1': c1,
        '--app-chart-2': c3,
        '--app-chart-3': c5,
        '--app-chart-4': c7
      }
    }

    const controlActiveBg = c4
    return {
      ...buildInteractiveStateTokens({
        mode,
        bg: mix(c8, c6, 0.34),
        hoverBg: mix(c7, c5, 0.4),
        activeBg: controlActiveBg,
        border: toRgba(c5, 0.2),
        activeBorder: toRgba(c4, 0.34),
        ring: toRgba(c4, 0.18),
        disabledBg: mix(c8, c7, 0.3)
      }),
      '--app-chip-bg': mix(c8, c6, 0.26),
      '--app-chip-active-bg': c4,
      '--app-progress-track': toRgba(c5, 0.14),
      '--app-progress-fill': `linear-gradient(90deg, ${c3}, ${c4})`,
      '--app-motion-glow': `0 0 0 0.18rem ${toRgba(c4, 0.16)}`,
      '--app-brand': strengthen(c3, c1, 0.2),
      '--app-brand-strong': contrastColor(strengthen(c3, c1, 0.2), '#0f172a', '#ffffff'),
      '--app-on-brand': contrastColor(strengthen(c3, c1, 0.2), '#0f172a', '#ffffff'),
      '--app-brand-soft': toRgba(strengthen(c3, c1, 0.2), 0.18),
      '--app-accent': strengthen(c5, c1, 0.18),
      '--app-accent-soft': toRgba(strengthen(c5, c1, 0.18), 0.18),
      '--app-success': c6,
      '--app-warning': c8,
      '--app-danger': strengthen(c4, darkest, 0.18),
      '--app-info': strengthen(c5, c1, 0.18),
      '--app-rank-bg': toRgba(c4, 0.14),
      '--app-chart-1': colors[0] ?? c1,
      '--app-chart-2': colors[2] ?? c3,
      '--app-chart-3': colors[4] ?? c5,
      '--app-chart-4': colors[6] ?? c7
    }
  }

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
    return {
      '--app-theme-name': 'Dynamic Theme',
      ...buildContainerThemeTokens({ mode: 'dark', darkest, dark, c0, c1, c2, c4 }),
      '--app-muted-surface': toRgba(c5, 0.16),
      '--app-nav-hover': support,
      '--app-sidebar-muted': '#9ca3af',
      '--app-sidebar-hover': toRgba(support, 0.18),
      '--app-sidebar-active': `linear-gradient(135deg, ${brand}, ${support})`,
      ...buildPaletteControlTokens({ mode: 'dark', darkest, colors, c1, c3, c4, c5, c6, c7, c8 }),
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
    return {
      '--app-theme-name': 'Dynamic Theme',
      ...buildContainerThemeTokens({ mode: 'light', darkest, dark, c0, c1, c2, c4 }),
      '--app-muted-surface': toRgba(c6, 0.16),
      '--app-nav-hover': strengthen(c3, c1, 0.2),
      '--app-sidebar-muted': '#475569',
      '--app-sidebar-hover': toRgba(support, 0.2),
      '--app-sidebar-active': `linear-gradient(135deg, ${strengthen(c3, c1, 0.2)}, ${strengthen(c5, c2, 0.18)})`,
      ...buildPaletteControlTokens({ mode: 'light', darkest, colors, c1, c3, c4, c5, c6, c7, c8 }),
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

    const defaultThemeKey = getDefaultTheme()
    if (key === defaultThemeKey && mode === 'dark') {
      const base = '#0f3285'
      const container = base
      const surface = '#13264a'
      const surfaceAlt = '#172d56'
      const panel = '#1a3361'
      const panelStrong = '#213c6f'
      const accent = '#2dd4bf'
      const support = '#f59e0b'
      const ink = '#ffffff'
      const mutedInk = 'rgba(255, 255, 255, 0.76)'
      const border = 'rgba(255, 255, 255, 0.14)'
      const borderStrong = 'rgba(255, 255, 255, 0.24)'
      Object.assign(tokens, {
        '--app-theme-name': 'Default',
        '--app-body-bg': `radial-gradient(1100px circle at 20% 55%, ${toRgba('#ffffff', 0.1)} 0%, ${toRgba('#ffffff', 0)} 62%), radial-gradient(900px circle at 80% 65%, ${toRgba(accent, 0.18)} 0%, ${toRgba(accent, 0)} 60%), linear-gradient(180deg, ${container} 0%, ${container} 55%, ${mix(container, '#ffffff', 0.12)} 100%)`,
        '--app-body-bg-rgb': toRgbChannels(container),
        '--app-text': ink,
        '--app-mode-text': ink,
        '--app-text-muted': mutedInk,
        '--app-heading': ink,
        '--app-border': border,
        '--app-border-strong': borderStrong,
        '--app-shadow': `0 24px 48px -28px ${toRgba('#000000', 0.72)}`,
        '--app-shadow-soft': `0 16px 32px -24px ${toRgba('#000000', 0.56)}`,
        '--app-nav-bg': container,
        '--app-nav-text': ink,
        '--app-nav-hover': mix(container, '#ffffff', 0.64),
        '--app-hero-start': mix(container, '#000000', 0.1),
        '--app-hero-end': mix(container, '#000000', 0.22),
        '--app-hero-text': ink,
        '--app-hero-muted': 'rgba(255, 255, 255, 0.74)',
        '--app-sidebar-bg': container,
        '--app-sidebar-surface': container,
        '--app-sidebar-text': 'rgba(255, 255, 255, 0.92)',
        '--app-sidebar-muted': 'rgba(255, 255, 255, 0.72)',
        '--app-sidebar-hover': toRgba('#ffffff', 0.12),
        '--app-sidebar-active': `linear-gradient(135deg, ${mix(container, '#000000', 0.08)}, ${mix(container, '#ffffff', 0.08)})`,

        '--app-surface': surface,
        '--app-surface-alt': surfaceAlt,
        '--app-surface-glass': toRgba(surface, 0.9),
        '--app-panel': panel,
        '--app-panel-strong': panelStrong,
        '--app-muted-surface': toRgba('#ffffff', 0.08),

        '--app-control-bg': toRgba('#ffffff', 0.12),
        '--app-control-hover-bg': toRgba('#ffffff', 0.16),
        '--app-control-active-bg': toRgba('#ffffff', 0.22),
        '--app-control-border': toRgba('#ffffff', 0.22),
        '--app-control-active-border': toRgba('#ffffff', 0.32),
        '--app-control-text': ink,
        '--app-control-hover-text': ink,
        '--app-control-active-text': ink,
        '--app-control-ring': toRgba(accent, 0.22),
        '--app-control-disabled-bg': toRgba('#ffffff', 0.06),
        '--app-control-disabled-text': 'rgba(255, 255, 255, 0.56)',
        '--app-control-disabled-border': toRgba('#ffffff', 0.14),

        '--app-chip-bg': toRgba('#ffffff', 0.12),
        '--app-chip-active-bg': toRgba('#ffffff', 0.2),
        '--app-progress-track': toRgba('#ffffff', 0.12),
        '--app-progress-fill': accent,
        '--app-motion-glow': `0 0 0 0.18rem ${toRgba(accent, 0.18)}`,

        '--app-brand': container,
        '--app-brand-strong': ink,
        '--app-on-brand': ink,
        '--app-brand-soft': toRgba(container, 0.22),
        '--app-accent': accent,
        '--app-accent-soft': toRgba(accent, 0.2),
        '--app-success': '#34d399',
        '--app-warning': support,
        '--app-danger': '#fb7185',
        '--app-info': accent,
        '--app-rank-bg': toRgba(accent, 0.16),
        '--app-chart-1': accent,
        '--app-chart-2': support,
        '--app-chart-3': '#60a5fa',
        '--app-chart-4': '#34d399',

        '--cui-primary': accent,
        '--cui-primary-rgb': toRgbChannels(accent)
      })
    }
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
    extractPaletteColorsFromUrl,
    parseCoolorsPaletteUrl,
    buildContainerThemeTokens,
    buildPaletteControlTokens,
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
