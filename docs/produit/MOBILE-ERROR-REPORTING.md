# Remontée d'erreurs mobile — Cloudity

Pipeline inspiré de **JobbingTrack** (`mobile/lib/services/crash_reporter.dart`, backoffice `/backoffice/mobile/logs`).

## Objectif

- **Utilisateur** : messages clairs (`friendlyNetworkMessage`, bannières `CloudityErrorBanner`) + bouton « Signaler un problème ».
- **Ops / admin** : consulter les rapports dans **`/4dm1n/mobile-logs`** (web).
- **Gateway** : persistance JSON sous `storage/mobile-crashes/` (volume monté en prod).

## Flux

```
App Flutter (mail, drive, …)
  → CloudityCrashReporter (FlutterError + feedback manuel + réseau)
  → POST /mobile/crashes (public, JWT optionnel)
  → gateway : crash-YYYYMMDD-HHMMSS.json
  → Admin : GET /mobile/crashes + GET /mobile/crashes/detail?id=
```

## Dev local — prérequis

### Go (`go test`, IDE)

Le workspace `go.work` résout `internalsec` via :

```
replace github.com/pavel/cloudity/internalsec => ./backend/internalsec
```

(module hors bloc `use` pour éviter le conflit api-gateway / auth-service). Les builds Docker ignorent `go.work` et gardent `replace => ./internalsec` dans chaque `go.mod`.

### Flutter (sans toucher au SDK système / JobbingTrack)

Sur Arch, `/usr/bin/flutter` peut être cassé (snapshot). Cloudity utilise un SDK **dédié** :

```bash
make ensure-flutter-sdk          # ~/.local/share/cloudity-flutter
source scripts/mobile/mobile-flutter-env.sh && cloudity_prepare_flutter_env
./scripts/ci/test-mobile-error-reporting-battery.sh   # batterie complète (Go + Flutter + API + build + E2E admin)
```

`make run-mobile` source déjà cet environnement. **Ne pas** lancer `flutter run` sur l’appareil ADB si un autre projet (ex. JobbingTrack) l’utilise — préférer `dart analyze` / tests unitaires, ou `ADB_SERIAL=…` pour un second appareil.

## Côté mobile (`cloudity_shared`)

| Module | Rôle |
|--------|------|
| `cloudity_crash_reporter.dart` | Hooks globaux, file offline `cloudity_crash_pending.jsonl` |
| `cloudity_error_ui.dart` | Bannière + corps d'écran erreur + SnackBar |
| `suite_feedback_screen.dart` | Formulaire « Signaler un problème » (Paramètres) |
| `cloudity_suite_bootstrap.dart` | `cloudityRunSuiteApp()` = tokens + crash reporter + thème |
| `network_errors.dart` | Messages réseau FR (existant) |

Initialisation recommandée dans chaque `main.dart` :

```dart
await cloudityRunSuiteApp(
  product: ClouditySuiteApp.mail,
  title: 'Cloudity Mail',
  home: SuiteAppShell(...),
);
```

Après login, `SuiteAppShell` appelle automatiquement `CloudityCrashReporter.setSession` si `crashSession` est fourni :

```dart
crashSession: (s) => CloudityCrashSessionBinding(
  accessToken: s.accessToken,
  gatewayBase: s.api.baseUrl,
),
```

## Côté gateway

- `POST /mobile/crashes` — **sans auth** (crashes pré-login possibles)
- `GET /mobile/crashes` — **admin JWT**
- `GET /mobile/crashes/detail?id=` — **admin JWT**
- Variable : `MOBILE_CRASH_LOG_DIR` (défaut `storage/mobile-crashes`)

## Back-office web

Route : **`/4dm1n/mobile-logs`** — liste + détail JSON.

## RGPD / prod

- Ne jamais envoyer de mot de passe dans les rapports.
- Feedback manuel = opt-in explicite utilisateur.
- Phase 2 (backlog) : analytics consent-based comme JobbingTrack `MobileAnalyticsService`.

## Références JobbingTrack

- `docs/mobile/analytics/README.md`
- `docs/mobile/PROCESSUS_APPLICATION_MOBILE_ET_API.md` §14
- `frontend/src/components/analytics/MobileApplicationMonitoringPanel.tsx`
