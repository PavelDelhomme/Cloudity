# UI cross-plateforme Cloudity

Cloudity vise **une base commune** avec une **adaptation par appareil** (web large, web mobile, Android, plus tard Linux/Windows). Ce document décrit l’état cible et les conventions partagées.

## Principes

1. **Tokens** — couleurs, espacements, rayons : source unique `mobile/cloudity_shared/assets/cloudity_tokens.json` (à consommer côté Tailwind web et Flutter mobile).
2. **Domaine partagé** — dossiers mail, clés de préférences, libellés (« Programmée », « Dossiers standard », etc.) dans `cloudity_shared`.
3. **Patterns UI** — même structure fonctionnelle : drawer/sidebar (comptes + dossiers), liste → détail, paramètres au même endroit, bannière sync identique.
4. **UI native** — React + `@cloudity/ui` sur web, Material 3 sur mobile ; même vocabulaire, pas copie pixel-par-pixel.

## Mail — clés de préférences

| Clé | Format | Contenu |
|-----|--------|---------|
| Vue boîte/dossier | `cloudity.mail.view.v1:{tenantId}:{email}` | `{ accountId, folder }` |

Web : `mailViewPreferences.ts`. Mobile : `cloudity_shared/mail_view_preferences.dart`.

## Mail — dossiers standard

Définis dans `cloudity_shared/mail_constants.dart` : `inbox`, `sent`, `drafts`, `scheduled`, `archive`, `spam`, `trash`, etc.

## Dates et fuseaux

- L’API renvoie les timestamps en **RFC3339 UTC**.
- Les chaînes PostgreSQL sans fuseau sont interprétées comme UTC (backend `normalizeTimestampString`, frontend `parseCloudityDateTime`).
- Les `<input type="datetime-local">` sont convertis via `datetimeLocalInputToUtcIso` (composants locaux → ISO UTC).
- Affichage : toujours en **fuseau local** de l’appareil (`toLocaleString` / `parseCloudityDateTime().toLocal()`).

## Roadmap

| Phase | Contenu |
|-------|---------|
| **A** | `cloudity_shared` mail + tokens + doc (ce fichier) |
| **B** | Mail mobile : drawer type Photos, paramètres, dossier Programmée |
| **B′** | Calendar, Contacts, Notes, Tasks : MVP liste API + auth suite (`SuiteProductHomeScreen`) |
| **B″** | Drive : écran Paramètres (drawer) |
| **C** | Web Mail → `@cloudity/ui` ; package Flutter `cloudity_widgets` optionnel |

## Références

- Web design system : [CLOUDITY-UI-DESIGN-SYSTEM.md](./CLOUDITY-UI-DESIGN-SYSTEM.md)
- Frontends : [ARCHITECTURE-FRONTENDS.md](./ARCHITECTURE-FRONTENDS.md)
