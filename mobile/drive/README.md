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
- Téléphone en dev local : URL gateway = **IP LAN du PC** (`http://192.168.x.x:6080`) ou USB `adb reverse tcp:6080 tcp:6080` + `http://127.0.0.1:6080`.
- Préprod/prod ou hors réseau local : URL gateway = **HTTPS public** (`https://api.cloudity.<domaine>`). Ne pas utiliser `https://192.168.x.x:6080` sauf si un TLS réel écoute sur cette IP et que le téléphone fait confiance au certificat.
