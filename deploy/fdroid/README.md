# Métadonnées F-Droid — Cloudity Mail (stub)

Soumission : https://f-droid.org/docs/Submitting_to_F-Droid_Quick_Start_Guide/

## Build

```bash
cd mobile/mail
flutter build apk --release --dart-define=CLOUDITY_GATEWAY_URL=https://api.cloudity.example
```

## Repo

- Source : https://github.com/PavelDelhomme/Cloudity
- Sous-répertoire : `mobile/mail`
- License : (à confirmer — AGPL ou MIT selon choix projet)

## Anti-features

Aucune pub Google Play Services requise pour le MVP mail.

Voir aussi [DISTRIBUTION-CHANNELS.md](../../docs/operations/DISTRIBUTION-CHANNELS.md).
