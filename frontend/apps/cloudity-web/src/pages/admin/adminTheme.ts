export type AdminThemeChoice = 'system' | 'light' | 'dark'

export function readAdminTheme(): AdminThemeChoice {
  try {
    const t = localStorage.getItem('hubera-admin-theme')
    if (t === 'light' || t === 'dark' || t === 'system') return t
  } catch {
    /* stockage indisponible */
  }
  return 'system'
}

export function adminThemeIsDark(choice: AdminThemeChoice = readAdminTheme()): boolean {
  if (choice === 'dark') return true
  if (choice === 'light') return false
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyAdminTheme(choice: AdminThemeChoice) {
  try {
    localStorage.setItem('hubera-admin-theme', choice)
  } catch {
    /* ignore */
  }
  const dark = adminThemeIsDark(choice)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f172a' : '#f8fafc')
}
