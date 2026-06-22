# Profil AVD Cloudity : `cloudity-avd-s21-fe`

AVD **dédié aux tests Cloudity**, distinct de `JobbingTrack_S21_FE` (`emulator-5554`).

| Champ | Valeur |
|-------|--------|
| AVD Android Studio | **Cloudity_S21_FE** (clone Samsung S21 FE) |
| Port ADB | **5556** → `emulator-5556` |
| Écran | 1080×2340 @ **480 dpi** (aligné Samsung physique) |
| Android | 14 (x86_64, Google APIs) |
| Gateway E2E | `http://10.0.2.2:6002` |

## Commandes

```bash
# Démarrer l'AVD Cloudity (en parallèle de JobbingTrack sur 5554)
make mobile-emulator-cloudity-start

# Suite E2E Photos → Drive → Mail sur l'AVD Cloudity uniquement
make test-mobile-avd

# Rafraîchir l'empreinte golden depuis emulator-5556
make mobile-device-snapshot-avd
```

Le résolveur ADB utilise `ro.boot.qemu.avd_name=Cloudity_S21_FE` pour ne jamais cibler `JobbingTrack_S21_FE`.
