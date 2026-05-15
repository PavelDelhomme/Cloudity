# Cloudity Pass (Flutter)

Client **lecture seule** (MVP) pour le coffre chiffré côté serveur (`passwords-service` via la gateway).

## Parcours (aligné hub web)

1. **Connexion Cloudity** (`PassLoginScreen`) — JWT stocké de façon sécurisée (`PassSessionStore`).
2. **Sonde `GET /pass/vaults`** sur `PassUnlockScreen` — liste vide → **initialisation** du mot de passe maître (confirmation) ; sinon **déverrouillage**.
3. **Coffres / items** — déchiffrement local (`pass_crypto`), voir `docs/securite/PASS-CRYPTO.md` § 1.2.

Profil Argon2id : en **première utilisation**, le profil **Desktop (compatible web)** est présélectionné pour rester aligné avec le hub web.

## Commandes utiles

```bash
dart analyze lib/
dart test   # nécessite un SDK Dart fonctionnel (hors sandbox Cursor)
flutter run
```
