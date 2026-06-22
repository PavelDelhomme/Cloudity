# Profils appareils ADB Cloudity

Empreintes **golden** d'appareils physiques et émulateurs, versionnées dans le dépôt pour automatiser les `integration_test` sans reconfigurer à chaque fois.

## Profil par défaut : `samsung-sm-g990b2`

| Champ | Valeur |
|-------|--------|
| Modèle | Samsung **SM-G990B2** (Galaxy S21 FE 5G) |
| Serial référence | `R5CT7263YJL` |
| Écran | 1080×2340 @ 480 dpi |
| Android | 16 (SDK 36) |
| ABI | arm64-v8a |

Fichiers :

- `profile.json` — métadonnées + empreinte `getprop` (pas de secrets)
- `getprop.snapshot` — dump complet `adb shell getprop` au moment de la capture

## Commandes

```bash
# Rafraîchir la copie depuis le Samsung branché
CLOUDITY_DEVICE_ID=R5CT7263YJL make mobile-device-snapshot

# Suite E2E mobile (Photos → Drive → Mail) sur le profil Samsung
make test-mobile-samsung

# Forcer un autre serial
CLOUDITY_DEVICE_ID=R5CT7263YJL make test-mobile-suite
```

Quand **Samsung + émulateur** sont tous les deux visibles sous `adb devices`, le résolveur préfère l'appareil qui correspond au profil actif (`device_kind` : `physical` vs `emulator`).

## Profil AVD Cloudity : `cloudity-avd-s21-fe`

AVD **dédié** (`Cloudity_S21_FE`, port **5556**), distinct de `JobbingTrack_S21_FE` (`emulator-5554`).

| Champ | Valeur |
|-------|--------|
| AVD | **Cloudity_S21_FE** (copie Samsung 1080×2340 @ 480 dpi) |
| Port ADB | `emulator-5556` |
| Gateway E2E | `http://10.0.2.2:6002` |

```bash
make mobile-emulator-cloudity-start   # démarrer l'AVD Cloudity en parallèle
make test-mobile-avd                  # suite Photos → Drive → Mail sur emulator-5556
make mobile-device-snapshot-avd       # rafraîchir l'empreinte golden
```

Le résolveur distingue les émulateurs via `ro.boot.qemu.avd_name` (ne cible jamais JobbingTrack par erreur).

## Gateway

Avec USB : `adb reverse tcp:6002 tcp:6002` puis `CLOUDITY_E2E_GATEWAY=http://127.0.0.1:6002` (série ports **PORT-ORG-01**).

Prérequis stack : `make up` · `make seed-admin`.

## Sécurité

- Aucun mot de passe, JWT ou donnée compte dans ces fichiers.
- Ne pas committer de captures d'écran personnelles (`runtime/` est gitignoré).
