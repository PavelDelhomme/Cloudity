# Préférences utilisateur Cloudity (sync compte)

Les préférences **non secrètes** (thème, comportement Pass, notifications…) sont
stockées par utilisateur et synchronisées entre **web**, **mobile Flutter** et
**extension Pass**.

## API

| Méthode | Route | Auth |
|---------|-------|------|
| `GET` | `/auth/me/preferences` | Bearer |
| `PUT` | `/auth/me/preferences` | Bearer (merge JSON) |

Table PostgreSQL : `user_preferences` (migration `47-user-preferences.sql`).

### Schéma JSON (v1)

```json
{
  "theme": {
    "default": "system",
    "apps": {
      "pass": "dark",
      "mail": "light",
      "drive": "system"
    }
  },
  "pass": {
    "clipboardEnabled": true,
    "clipboardClearMs": 30000,
    "totpAutoCopy": false,
    "digitalAssetLinksEnabled": true,
    "autoLockMs": 300000
  }
}
```

- **`theme.default`** : `system` | `light` | `dark` — valeur par défaut pour toutes les apps.
- **`theme.apps.<id>`** : surcharge par app (`pass`, `mail`, `drive`, `photos`, `calendar`, `contacts`, `notes`, `tasks`, `hub`).
- **`pass.clipboardEnabled`** : autorise la copie presse-papier (identifiants, TOTP).
- **`pass.clipboardClearMs`** : délai avant effacement auto (0 = jamais).
- **`pass.totpAutoCopy`** : copie automatique du TOTP à chaque rotation (sous-option clipboard).
- **`pass.digitalAssetLinksEnabled`** : préférence Android DAL (cf. [PASS-DIGITAL-ASSET-LINKS.md](PASS-DIGITAL-ASSET-LINKS.md)).
- **`pass.autoLockMs`** : verrouillage auto du coffre Pass (0 = jamais).

Le `PUT` **fusionne** récursivement les objets (patch partiel accepté).

## Implémentation

| Surface | Fichiers |
|---------|----------|
| Backend | `backend/auth-service/user_preferences.go` |
| Web | `frontend/.../theme/themeContext.tsx`, `lib/userPreferencesStore.ts` |
| Mobile | `mobile/cloudity_shared/lib/user_preferences.dart`, `app_theme.dart` |
| Cache local | `localStorage` clé `cloudity.userPreferences.v1` ; mobile `SharedPreferences` |

## Paramètres UI

- **Web** : `/app/settings` → sections *Apparence* et *Pass — comportement*.
- **Mobile** : écran Paramètres de chaque app (tuile thème + Pass).
- **Extension Pass** : page Options (gateway + sync prefs à venir).

Les **secrets** (master key Pass, TOTP seed, mots de passe) ne transitent **jamais**
par cette API — uniquement le chiffrement E2E existant (`docs/securite/PASS-CRYPTO.md`).
