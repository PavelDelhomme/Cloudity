# hubera_ota_installer

Plugin Flutter Android : installe un APK depuis le cache de l’app (FileProvider `${applicationId}.hubera.ota`).

Le canal natif `cloudity_ota_installer` est encore écouté (apps Cloudity déjà compilées). Le code neuf utilise `HuberaOtaInstaller`.

```dart
await HuberaOtaInstaller.installApk(apkFile);
```
