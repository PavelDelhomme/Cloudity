/**
 * Catalogue des apps produit — source de vérité du hub (FE-HUB-01).
 *
 * `hosting`:
 * - `shell`     : reste dans cloudity-web (settings, hub)
 * - `embedded`  : encore monté dans le routeur du shell (lazy) — à extraire (FE-SPLIT-*)
 * - `external`  : app workspace séparée ; le hub navigue en full page (`<a href>`)
 *
 * Doc : docs/architecture/MULTI-APPS-WEB-MOBILE.md
 */

export type HubAppHosting = 'shell' | 'embedded' | 'external'

export type HubAppId =
  | 'drive'
  | 'office'
  | 'corbeille'
  | 'mail'
  | 'pass'
  | 'calendar'
  | 'notes'
  | 'tasks'
  | 'contacts'
  | 'photos'
  | 'settings'
  | 'admin'
  | 'profile'

export type HubAppDefinition = {
  id: HubAppId
  name: string
  /** Chemin UI (SPA shell ou app externe). */
  href: string
  category: string
  hosting: HubAppHosting
  /** Package npm cible une fois extrait. */
  workspaceApp?: string
  description?: string
}

export const HUB_APP_CATEGORIES = [
  'Fichiers',
  'Communication',
  'Sécurité',
  'Productivité',
  'Personnes',
  'Médias',
  'Compte',
] as const

export type HubAppCategory = (typeof HUB_APP_CATEGORIES)[number]

/** Apps affichées sur `/app` (grille launcher). */
export const HUB_LAUNCHER_APPS: HubAppDefinition[] = [
  {
    id: 'drive',
    name: 'Drive',
    href: '/app/drive',
    category: 'Fichiers',
    hosting: 'embedded',
    workspaceApp: '@cloudity/web-drive',
    description: 'Fichiers et dossiers',
  },
  {
    id: 'office',
    name: 'Office',
    href: '/app/office',
    category: 'Fichiers',
    hosting: 'embedded',
    workspaceApp: '@cloudity/web-office',
    description: 'Documents',
  },
  {
    id: 'corbeille',
    name: 'Corbeille',
    href: '/app/corbeille',
    category: 'Fichiers',
    hosting: 'embedded',
    workspaceApp: '@cloudity/web-drive',
    description: 'Éléments supprimés (Drive)',
  },
  {
    id: 'mail',
    name: 'Mail',
    href: '/app/mail',
    category: 'Communication',
    /** FE-SPLIT-01 : code dans apps/web-mail ; encore monté lazy dans le shell. */
    hosting: 'embedded',
    workspaceApp: '@cloudity/web-mail',
    description: 'Messagerie',
  },
  {
    id: 'pass',
    name: 'Pass',
    href: '/app/pass',
    category: 'Sécurité',
    hosting: 'embedded',
    workspaceApp: '@cloudity/web-pass',
    description: 'Mots de passe',
  },
  {
    id: 'calendar',
    name: 'Calendar',
    href: '/app/calendar',
    category: 'Productivité',
    hosting: 'embedded',
    workspaceApp: '@cloudity/web-calendar',
  },
  {
    id: 'notes',
    name: 'Notes',
    href: '/app/notes',
    category: 'Productivité',
    hosting: 'embedded',
    workspaceApp: '@cloudity/web-notes',
  },
  {
    id: 'tasks',
    name: 'Tasks',
    href: '/app/tasks',
    category: 'Productivité',
    hosting: 'embedded',
    workspaceApp: '@cloudity/web-tasks',
  },
  {
    id: 'contacts',
    name: 'Contacts',
    href: '/app/contacts',
    category: 'Personnes',
    hosting: 'embedded',
    workspaceApp: '@cloudity/web-contacts',
  },
  {
    id: 'photos',
    name: 'Photos',
    href: '/app/photos',
    category: 'Médias',
    hosting: 'embedded',
    workspaceApp: '@cloudity/web-photos',
  },
]

/** Entrées hors grille (shell). */
export const HUB_SHELL_LINKS: HubAppDefinition[] = [
  {
    id: 'settings',
    name: 'Paramètres',
    href: '/app/settings',
    category: 'Compte',
    hosting: 'shell',
    description: 'Profil / compte (reste dans le hub pour l’instant)',
  },
  {
    id: 'admin',
    name: 'Administration',
    href: '/4dm1n',
    category: 'Compte',
    hosting: 'external',
    workspaceApp: '@cloudity/web-admin',
    description: 'Back-office (bundle admin.html)',
  },
]

export function hubAppsByCategory(): { category: string; apps: HubAppDefinition[] }[] {
  const map = new Map<string, HubAppDefinition[]>()
  for (const app of HUB_LAUNCHER_APPS) {
    const list = map.get(app.category) ?? []
    list.push(app)
    map.set(app.category, list)
  }
  return HUB_APP_CATEGORIES.filter((c) => map.has(c)).map((category) => ({
    category,
    apps: map.get(category)!,
  }))
}

/** Navigation hub → app : full page si `external`, sinon React Router. */
export function hubAppUsesFullPageNav(app: HubAppDefinition): boolean {
  return app.hosting === 'external'
}
