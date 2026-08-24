/**
 * Catalogue des apps produit — source de vérité du hub (FE-HUB-01).
 *
 * `hosting`:
 * - `shell`     : reste dans cloudity-web (settings, hub)
 * - `embedded`  : encore monté dans le routeur du shell (lazy) — à extraire (FE-SPLIT-*)
 * - `external`  : app workspace séparée ; le hub navigue en full page (`<a href>`)
 *
 * Doc : docs/architecture/MULTI-APPS-WEB-MOBILE.md § 2.2bis
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

/** Apps affichées sur `/app` (grille launcher — liens only). */
export const HUB_LAUNCHER_APPS: HubAppDefinition[] = [
  {
    id: 'drive',
    name: 'Drive',
    href: '/app/drive/',
    category: 'Fichiers',
    /** FE-SPLIT-02 : SPA sous /app/drive/ (prod nginx) ; en DEV le shell lazy-load encore. */
    hosting: 'external',
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
    href: '/app/drive/?view=trash',
    category: 'Fichiers',
    hosting: 'external',
    workspaceApp: '@cloudity/web-drive',
    description: 'Éléments supprimés',
  },
  {
    id: 'mail',
    name: 'Mail',
    href: '/app/mail/',
    category: 'Communication',
    /** FE-SPLIT-01 : SPA sous /app/mail/ (prod nginx) ; en DEV le shell lazy-load encore. */
    hosting: 'external',
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
    description: 'Agenda',
  },
  {
    id: 'notes',
    name: 'Notes',
    href: '/app/notes',
    category: 'Productivité',
    hosting: 'embedded',
    workspaceApp: '@cloudity/web-notes',
    description: 'Bloc-notes',
  },
  {
    id: 'tasks',
    name: 'Tasks',
    href: '/app/tasks',
    category: 'Productivité',
    hosting: 'embedded',
    workspaceApp: '@cloudity/web-tasks',
    description: 'Tâches',
  },
  {
    id: 'contacts',
    name: 'Contacts',
    href: '/app/contacts',
    category: 'Personnes',
    hosting: 'embedded',
    workspaceApp: '@cloudity/web-contacts',
    description: 'Carnet d’adresses',
  },
  {
    id: 'photos',
    name: 'Photos',
    href: '/app/photos',
    category: 'Médias',
    hosting: 'embedded',
    workspaceApp: '@cloudity/web-photos',
    description: 'Galerie',
  },
  {
    id: 'settings',
    name: 'Paramètres',
    href: '/app/settings',
    category: 'Compte',
    hosting: 'shell',
    description: 'Compte et préférences',
  },
]

/** Liens hors grille produit (admin = full page). */
export const HUB_SHELL_LINKS: HubAppDefinition[] = [
  {
    id: 'admin',
    name: 'Administration',
    href: '/4dm1n',
    category: 'Compte',
    hosting: 'external',
    workspaceApp: '@cloudity/web-admin',
    description: 'Back-office',
  },
]

/** Inventaire routes hub (pour tests + doc FE-HUB-01). */
export const HUB_INVENTORY_ROUTES: { id: HubAppId; href: string; routePattern: string }[] = [
  { id: 'drive', href: '/app/drive/', routePattern: 'drive (SPA @cloudity/web-drive)' },
  { id: 'office', href: '/app/office', routePattern: 'office' },
  { id: 'corbeille', href: '/app/drive/?view=trash', routePattern: 'corbeille → drive?view=trash (SPA)' },
  { id: 'mail', href: '/app/mail/', routePattern: 'mail (SPA @cloudity/web-mail)' },
  { id: 'pass', href: '/app/pass', routePattern: 'pass' },
  { id: 'calendar', href: '/app/calendar', routePattern: 'calendar' },
  { id: 'notes', href: '/app/notes', routePattern: 'notes' },
  { id: 'tasks', href: '/app/tasks', routePattern: 'tasks' },
  { id: 'contacts', href: '/app/contacts', routePattern: 'contacts' },
  { id: 'photos', href: '/app/photos', routePattern: 'photos' },
  { id: 'settings', href: '/app/settings', routePattern: 'settings*' },
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
