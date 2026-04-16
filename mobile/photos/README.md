# Cloudity Photos (Flutter)

Client **léger** pour la timeline `GET /photos/timeline` (même JWT que le web).

## Prérequis

- Stack Cloudity : `make up` (gateway sur le port **6080**).
- **JWT** : connecte-toi sur le dashboard web, récupère le token (ex. DevTools → Application → localStorage `cloudity_admin_auth` ou équivalent).

## Émulateur Android

- URL gateway par défaut dans l’app : `http://10.0.2.2:6080` (pont vers `localhost:6080` de la machine hôte).

## Téléphone USB (Samsung, etc.)

1. Active le **débogage USB** ; accepte la clé RSA si demandé.
2. Mets l’URL du PC sur le LAN : `http://192.168.x.x:6080` (même Wi‑Fi que le téléphone ; `CORS_ALLOW_LAN` côté gateway en dev).
3. Lance depuis la racine du repo :

```bash
make run-mobile APP=Photos
```

Le script choisit automatiquement le **premier appareil `adb` en état `device`**, ou tu forces avec :

```bash
export CLOUDITY_DEVICE_ID=<serial_adb>
make run-mobile APP=Photos
```

(`adb devices` pour voir le serial.)

## Débogage

- `flutter run` avec breakpoints dans VS Code / Android Studio en ouvrant le dossier `mobile/photos`.
