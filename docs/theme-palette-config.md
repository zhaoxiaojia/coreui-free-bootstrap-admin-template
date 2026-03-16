# Theme Palette Config

## Purpose
This project now supports theme generation from Coolors palette URLs.
You only need to edit one config file:

- `src/js/theme-palette-config.js`

Each theme entry contains:
- `label`: menu label shown in the UI
- `description`: short helper text shown in the menu
- `paletteUrl`: a Coolors palette URL

## Example
```js
window.APP_THEME_CONFIG = {
  defaultTheme: 'daylight',
  themes: {
    daylight: {
      label: 'Day',
      description: 'Configured from Coolors URL',
      paletteUrl: 'https://coolors.co/palette/ccd5ae-e9edc9-fefae0-faedcd-d4a373'
    }
  }
}
```

## Supported URL formats
These all work:

- `https://coolors.co/palette/03045e-0077b6-00b4d8-90e0ef-caf0f8`
- `https://coolors.co/03045e-0077b6-00b4d8-90e0ef-caf0f8`

## Mapping Logic
The runtime parses the palette URL into a variable-length color list and maps it to UI tokens.
The mapper automatically handles different palette sizes.

Main UI areas mapped from the palette:
- Page background
- Surface / card background
- Secondary panel background
- Navbar
- Sidebar
- Primary action color
- Accent color
- Hero section
- Chips / badges
- Rank marker
- Chart colors
- Border / shadow / muted text

The mapping function lives in:
- `src/js/theme.js`

Key exported helpers:
- `APP_THEME.parseCoolorsPaletteUrl(url)`
- `APP_THEME.buildThemeTokens(colors)`
- `APP_THEME.getResolvedTheme(themeName)`
- `APP_THEME.applyTheme(themeName)`

## Workflow
1. Edit `src/js/theme-palette-config.js`
2. Replace `paletteUrl` with your Coolors URL
3. Run asset sync / JS compile if needed
4. Refresh the page and switch themes from the menu

## Notes
- Palette length can vary.
- The mapper decides whether the palette behaves like a light theme or dark theme based on luminance.
- If a palette is very low-contrast, the mapper still derives readable text and control colors automatically.
