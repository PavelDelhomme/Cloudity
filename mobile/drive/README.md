# Cloudity Drive (Flutter)

Client **Drive** minimal : connexion (mêmes clés **`cloudity_suite_*`** que Photos) et liste **`GET /drive/nodes`** (racine puis navigation dossier).

## Lancer

À la racine du dépôt :

```bash
make run-mobile APP=Drive
```

Si le script refuse de démarrer avec un message sur le **SDK Flutter inscriptible**, voir **`scripts/check-flutter-sdk-writable.sh`** (souvent `sudo chown -R $(whoami) /usr/lib/flutter` sur Arch avec Flutter paquet).

## Prérequis

- Stack **`make up`**, compte **`make seed-admin`**.
- Téléphone : URL gateway = **IP LAN du PC** (`http://192.168.x.x:6080`).
