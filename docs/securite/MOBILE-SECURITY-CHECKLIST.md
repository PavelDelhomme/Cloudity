# Checklist sécurité mobile (H6c)

**Branche** : `feat/security-mobile-audit` · **Référence** : `docs/produit/MOBILES.md` § 4.1, `TODOS.md` H6b/H6c.

Audit récurrent avant release APK ou feature auth mobile.

## 1. Stockage des jetons

| # | Contrôle | Statut |
|---|----------|--------|
| 1.1 | Access + refresh **uniquement** `FlutterSecureStorage` (jamais `SharedPreferences`) | ☑ |
| 1.2 | Android : `encryptedSharedPreferences: true` | ☑ |
| 1.3 | iOS : Keychain Access Group (à faire — H6b) | ☐ |
| 1.4 | Aucune pref job/sync ne persiste JWT ou corps HTTP brut | ☑ |

## 2. Broker Android (`cloudity_auth_broker`)

| # | Contrôle | Statut |
|---|----------|--------|
| 2.1 | Permissions broker `signature` + `ContentProvider` protégé | ☑ |
| 2.2 | Stockage broker : `EncryptedSharedPreferences` | ☑ |
| 2.3 | **Logout** purge secure storage **et** `CloudityAuthBroker.clearAccount` | ☑ (2026-06-09) |
| 2.4 | Refresh met à jour broker + stockage local | ☑ |
| 2.5 | Pass : pas de broker (volontaire) | ☑ |

## 3. Builds debug vs release

| # | Contrôle | Statut |
|---|----------|--------|
| 3.1 | Préremplissage `admin@cloudity.local` / `Admin123!` derrière `kDebugMode` uniquement | ☑ |
| 3.2 | Pas de `LogInterceptor` body en release (`admin_app` : debug only) | ☑ |
| 3.3 | CI : pas de secrets dans artefacts release | 🟡 |

## 4. Réseau et TLS

| # | Contrôle | Statut |
|---|----------|--------|
| 4.1 | `INTERNET` dans manifest **release** (Drive, Pass, Photos, Mail) | ☑ Drive/Pass (2026-06-09) |
| 4.2 | Prod : gateway HTTPS ; `usesCleartextTraffic` limité au dev | 🟡 Photos |
| 4.3 | Pas de `badCertificateCallback` custom | ☑ |
| 4.4 | Pinning TLS prod (décision documentée) | ☐ |

## 5. Messages d’erreur et logs

| # | Contrôle | Statut |
|---|----------|--------|
| 5.1 | UI : pas de `res.body` brut ni `e.toString()` HTTP | 🟡 Mail |
| 5.2 | `friendlyNetworkMessage` pour erreurs réseau | ☑ |
| 5.3 | Grep périodique : `print|debugPrint|LogInterceptor` sans token | ☑ |

## 6. Tests récurrents

```bash
make test-mobile-suite          # flutter test hôte
# Manuel : logout → kill app → relancer → doit redemander connexion (broker inclus)
```

## Matrice apps

| App | Broker | Secure storage | Logout broker | Cleartext dev |
|-----|--------|----------------|---------------|---------------|
| Photos | Oui | Oui | Oui | `usesCleartextTraffic` |
| Drive | Oui | Oui | Oui | HTTP gateway défaut |
| Mail | Oui | Oui | Oui | HTTP gateway défaut |
| Pass | Non | Oui | N/A | HTTP gateway défaut |

## Priorités restantes

1. Sanitizer erreurs Mail (`res.body` → message générique).
2. `networkSecurityConfig` prod + retrait cleartext Photos en release.
3. iOS Keychain group (H6b).
