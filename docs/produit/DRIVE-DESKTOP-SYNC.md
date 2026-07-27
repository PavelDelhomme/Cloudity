# Drive — client sync bureau (type Nextcloud)

**Statut** : **à faire** (pas encore de daemon / app de sync dossier).  
**Pilotage** : `DRIVE-DESKTOP-01` … `DRIVE-DESKTOP-05` · cycle *Desktop Drive sync*.  
**Liens** : [ROADMAP APP-02](ROADMAP.md) · [MULTI-PLATEFORME.md](MULTI-PLATEFORME.md) · [BACKLOG.md](../../BACKLOG.md).

---

## 1. Besoin

Sur **Linux (ex. Arch + GNOME)**, **Windows** et **macOS**, pouvoir :

1. Se connecter au compte Cloudity (gateway HTTPS).
2. Choisir **quels dossiers** Drive synchroniser (ou tout le Drive).
3. Avoir un **dossier local normal** (Nautilus, Explorer, Finder, `cd` / CLI) qui reste à jour **automatiquement**.
4. Créer / renommer / supprimer / éditer des fichiers **hors navigateur**, comme avec **Nextcloud Desktop**.

Ce n’est **pas** la même chose que :

| Existant | Limite |
|----------|--------|
| Web Drive (`/app/drive`) | Navigateur seulement |
| `mobile/drive` Flutter (Android / linux desktop) | App UI, **pas** un montage / sync dossier OS |
| Upload/download manuel | Pas de sync continue |

---

## 2. Cible produit (phases)

| ID | Phase | Livrable |
|----|--------|----------|
| **DRIVE-DESKTOP-01** | Spec + API | Contrat sync (delta / curseur, conflits, auth device) documenté ; endpoints manquants listés |
| **DRIVE-DESKTOP-02** | Daemon CLI | Agent headless (Go ou Rust) : login, selective sync, watch FS, reprise après coupure — **Linux d’abord** (Arch) |
| **DRIVE-DESKTOP-03** | UI bureau | Tray / préférences (dossiers sync, pause, statut) — GNOME + Windows + macOS |
| **DRIVE-DESKTOP-04** | Virtual files (opt.) | Fichiers « placeholder » / on-demand (style Nextcloud VFS / Windows CfAPI / macOS File Provider) |
| **DRIVE-DESKTOP-05** | Packaging | Paquets `.deb`/AUR/`flatpak`, MSI/winget, `.dmg` + auto-update |

Ordre recommandé : **01 → 02 (Linux CLI) → 03 → 05** ; **04** quand le sync full-mirror est stable.

---

## 3. Options techniques (à trancher en DRIVE-DESKTOP-01)

1. **Client maison** parlant à l’API `/drive/*` existante (+ endpoints delta si besoin).
2. **WebDAV** devant `drive-service` → réutiliser des clients Nextcloud/rclone (plus rapide à exposer, moins « Cloudity native »).
3. Hybride : WebDAV pour outils tiers + client officiel Cloudity pour UX.

Préférence produit : **client officiel Cloudity** (branding, selective sync, E2EE coffres plus tard) ; WebDAV optionnel en parallèle pour power-users (`rclone mount`).

---

## 4. Critères d’acceptation (MVP Linux)

- [ ] Installer l’agent sur Arch (paquet ou binaire).
- [ ] `cloudity-drive login` (ou UI) → dossier `~/Cloudity/Drive` (configurable).
- [ ] Selective sync : au moins un sous-dossier.
- [ ] Fichier créé dans Nautilus apparaît dans le Drive web après sync.
- [ ] Fichier uploadé via web apparaît localement sans F5 manuel.
- [ ] Fonctionne hors ligne (file d’attente) puis rattrapage.
- [ ] Conflits : stratégie documentée (suffixe conflit / last-write).

---

## 5. Hors scope MVP

- Remplacer entièrement Photos mobile WorkManager.
- Édition Office offline complète.
- Partage public type lien Nextcloud (autre chantier Drive share).
