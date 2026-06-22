# Profil AVD : `cloudity-avd-gphone64`

Copie **golden** de l’émulateur Android Studio utilisé pour les tests d’intégration Cloudity (même résolution que le Samsung de référence).

| Champ | Valeur |
|-------|--------|
| Modèle | Google **sdk_gphone64_x86_64** |
| Serial référence | `emulator-5554` (peut changer au redémarrage) |
| Écran | 1080×2340 @ 420 dpi |
| Android | 14 (émulateur x86_64) |
| Gateway E2E | `http://10.0.2.2:6002` (auto, pas de `adb reverse`) |

## Commandes

```bash
# Rafraîchir depuis l’émulateur déjà lancé
make mobile-device-snapshot-avd

# Suite E2E mobile (Photos → Drive → Mail) sur l’AVD uniquement
make test-mobile-avd

# Forcer un serial précis (si plusieurs émulateurs)
CLOUDITY_DEVICE_ID=emulator-5554 make test-mobile-avd
```

Quand **Samsung + émulateur** sont branchés, `make test-mobile-avd` cible l’émulateur grâce à `device_kind: emulator` dans `profile.json`.
