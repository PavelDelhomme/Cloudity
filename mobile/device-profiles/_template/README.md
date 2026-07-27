# `_template/` — modèle pour ajouter un profil appareil

Copiez ce dossier sous `mobile/device-profiles/<votre-profil-id>/` puis :

1. Branchez l’appareil ou démarrez l’AVD cible.
2. Lancez `CLOUDITY_DEVICE_ID=<serial> make mobile-device-snapshot` (ou variante AVD).
3. Ajoutez une entrée dans `profiles.index.json`.
4. Committez `profile.json` + `getprop.snapshot` (pas de secrets).

Champs importants dans `profile.json` :

| Champ | Description |
|-------|-------------|
| `profile_id` | Identifiant stable (slug) |
| `device_kind` | `physical` ou `emulator` |
| `reference_serial` | Serial ADB de référence (physique) |
| `avd_name` | Nom AVD (`ro.boot.qemu.avd_name`) pour émulateurs |
| `cloudity_packages` | Packages Android installés (`fr.cloudity.*`) |

Le résolveur ADB (`scripts/mobile/mobile-device-resolve.sh`) lit `CLOUDITY_DEVICE_PROFILE` (défaut = entrée `default_profile` de l’index).
