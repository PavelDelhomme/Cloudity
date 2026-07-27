# Mobile Cloudity — structure et conventions

> Remontée d'erreurs / crashes : **`docs/produit/MOBILE-ERROR-REPORTING.md`**

## Interface suite (schéma Google Workspace)

Chaque app garde **sa logique métier** (`features/`) mais partage la même coque :

| Composant | Package | Rôle |
|-----------|---------|------|
| `CloudityThemedApp.forSuite` | `cloudity_shared` | Couleur produit depuis `cloudity_tokens.json` |
| `SuiteAppShell` | idem | Login → home, session |
| `SuiteDrawerScaffold` | idem | Drawer unifié : compte, nav produit, **grille apps Cloudity**, paramètres |
| `SuiteAppSwitcher` | idem | Switcher type Google Photos / Drive / Keep |
| `SuiteSettingsPanel` | idem | Paramètres + thème clair/sombre |

Apps **MVP** (Calendar, Contacts, Notes, Tasks) utilisent déjà `SuiteDrawerScaffold`.  
Mail / Drive / Photos : même thème + tokens ; migration drawer progressive (H21).

```dart
Future<void> main() async {
  await cloudityRunSuiteApp(
    product: ClouditySuiteApp.mail,
    title: 'Cloudity Mail',
    home: SuiteAppShell<UserSession>(
      crashSession: (s) => CloudityCrashSessionBinding(
        accessToken: s.accessToken,
        gatewayBase: s.api.baseUrl,
      ),
      // restoreSession, clearSession, loginBuilder, homeBuilder…
    ),
  );
}
```

## Layout standard (`lib/`)

Chaque app Flutter suit la même arborescence :

```
lib/
  main.dart              # point d’entrée Flutter (reste à la racine)
  auth/                  # session, login, clés SSO inter-apps
    login_screen.dart
    session_store.dart
    user_session.dart
  api/                   # clients HTTP vers l’api-gateway
    auth_api.dart
    …                    # drive_api.dart, admin_api.dart, etc.
  features/              # écrans et logique métier
    …
```

**Packages partagés** :

| Package | Rôle |
|---------|------|
| `cloudity_shared` | Thème, `SuiteAppShell`, gateway, prefs mail, API produits MVP |
| `cloudity_auth_broker` | SSO Android (AccountManager) |

## Créer une nouvelle app suite

```bash
cp -r mobile/mail mobile/mon_app
./scripts/mobile/customize-suite-app.sh mon_app cloudity_mon_app "Cloudity Mon App" calendar
# product = calendar|contacts|notes|tasks (API MVP existante)
flutter pub get -C mobile/mon_app
make run-mobile APP=Mon_app   # si ajouté au Makefile
```

Pour une app **riche** (comme Mail/Drive/Photos) : garder le layout ci-dessus et remplacer `SuiteProductHomeScreen` par vos écrans dans `features/`.

## Gateway (local · LAN · prod)

- Injecté au run : `--dart-define=CLOUDITY_GATEWAY_URL=…` via `scripts/mobile/run-mobile.sh`
- Source : `.env` → `CLOUDITY_MOBILE_GATEWAY_URL` ou `VITE_API_URL`
- Fallback dev : `http://127.0.0.1:6002` (USB + `adb reverse`)
- Prod : URL HTTPS publique (ex. `https://api.example.com`)

## Profils appareils (`device-profiles/`)

Index central : **`profiles.index.json`** — liste tous les profils ADB versionnés.

| Profil | Usage |
|--------|--------|
| `samsung-sm-g990b2` | Téléphone physique par défaut |
| `cloudity-avd-s21-fe` | Émulateur dédié Cloudity |

Ajouter un appareil : copier `_template/`, snapshot, entrée dans l’index.

```bash
CLOUDITY_DEVICE_PROFILE=samsung-sm-g990b2 make test-mobile-suite
make mobile-device-snapshot    # rafraîchir empreinte golden
```

## Admin mobile (`admin_app/`)

Aligné sur la suite : auth réelle via gateway `:6002`, vérification rôle **admin**, écrans Tenants via `/admin/*`.

```bash
make run-mobile APP=Admin
```

## Scripts utiles

| Script | Rôle |
|--------|------|
| `copy-suite-auth-base.sh` | Copie auth/ + api/auth_api minimal |
| `customize-suite-app.sh` | Mail → nouvelle app MVP |
| `reorganize-suite-lib.py` | Migration layout auth/api/features |
| `run-mobile.sh` | Gateway + ADB + flutter run |
| `mobile-device-resolve.sh` | Choix serial ADB via profil |

Voir aussi **`docs/produit/MOBILES.md`** et **`docs/architecture/UI-CROSS-PLATFORM.md`**.
