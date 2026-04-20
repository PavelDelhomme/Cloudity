# Cloudity Photos (Flutter)

Client **Photos** pour la timeline **`GET /photos/timeline`** derrière l’**api-gateway** (même compte que le web : login **e-mail / mot de passe / tenant**, jetons en **stockage sécurisé** + préférences pour l’URL gateway).

## Prérequis

- Stack Cloudity sur la machine : **`make up`** (gateway **6080**). Compte démo : **`make seed-admin`** → `admin@cloudity.local` / `Admin123!` (tenant **1**).
- **Flutter** installé ([guide officiel](https://docs.flutter.dev/get-started/install)).

## Lancer l’app

À la racine du dépôt :

```bash
make run-mobile APP=Photos
```

- **Émulateur Android** : URL gateway par défaut **`http://10.0.2.2:6080`** (pont vers `localhost:6080` du PC).
- **Téléphone USB** : mets l’**IP LAN du PC** dans le champ gateway, ex. `http://192.168.1.42:6080` (même Wi‑Fi ; `CORS_ALLOW_LAN` côté gateway en dev).

**ADB** : le script utilise le **premier** appareil en état `device`, ou :

```bash
export CLOUDITY_DEVICE_ID=<serial_adb>
make run-mobile APP=Photos
```

(`adb devices` pour le serial.)

## Tests (comme Playwright, côté mobile)

| Commande | Rôle |
|----------|------|
| **`flutter test`** (dans ce dossier) | Tests **widget** / unitaires sur la machine hôte. |
| **`make test-mobile-photos`** (racine repo) | `flutter pub get` + **`flutter test`** + si **adb** a un appareil **`device`**, **`flutter test integration_test/photos_flow_test.dart -d <serial>`** (build, install APK de test, scénarios sur l’appareil). **Plusieurs** appareils + terminal interactif → **menu de sélection**. |
| **`make tests`** | Inclut la même étape en **phase 5** (avec rapport dans `reports/`). |

Parcours **login + timeline** sur l’appareil (API réelle) : exporter les variables **`CLOUDITY_E2E_*`** avant `make test-mobile-photos` — détail **[../../docs/TESTS.md](../../docs/TESTS.md)** § **1b**.

Si le build Android (**Gradle**) échoue sur ta machine (JDK / AGP), tu peux **désactiver** uniquement l’étape appareil tout en gardant les tests hôte : **`CLOUDITY_SKIP_DEVICE_INTEGRATION=1 make test-mobile-photos`** (idem pour **`make tests`**).

Si tu vois **`NoSuchFileException` … `.kotlin/sessions/*.salive`** : le SDK Flutter (ex. **`/usr/lib/flutter`**) n’est pas inscriptible — **`make run-mobile`** et **`make test-mobile-photos`** appellent **`scripts/check-flutter-sdk-writable.sh`** avec la marche à suivre (souvent **`sudo chown -R $(whoami) /usr/lib/flutter`** sur Arch).

## Débogage

- Ouvre le dossier **`mobile/photos`** dans VS Code / Android Studio et lance avec breakpoints (`flutter run` ou via **`make run-mobile`**).

## Suite Cloudity (mobile)

Les clés de stockage **`cloudity_suite_*`** (`lib/storage_keys.dart`) sont prévues pour **partager** gateway et jetons avec les futures apps **Drive**, **Mail**, etc. La **détection** des autres apps installées reste à implémenter (voir **`docs/MOBILES.md`**).
