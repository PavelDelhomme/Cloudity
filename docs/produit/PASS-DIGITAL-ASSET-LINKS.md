# Pass — Digital Asset Links (Android)

Cloudity Pass peut utiliser [Digital Asset Links (DAL)](https://developers.google.com/digital-asset-links/v1/getting-started)
pour lier **cryptographiquement** un domaine web et l’app Android `cloudity_pass`,
comme Proton Pass — autofill plus fiable sur les apps natives Android.

## Activation utilisateur

Préférence compte : `pass.digitalAssetLinksEnabled` (défaut `true`).

- Web : **Paramètres → Pass — comportement → Digital Asset Links (Android)**
- Mobile Pass : **Paramètres → Digital Asset Links**

Si désactivé, l’app n’enregistre pas les associations credential-sharing côté Android.

## Côté web (domaine Cloudity)

Héberger en HTTPS :

`https://<votre-domaine>/.well-known/assetlinks.json`

Modèle : [`infrastructure/nginx/assetlinks.json.example`](../../infrastructure/nginx/assetlinks.json.example)

Relations recommandées pour Pass :

- `delegate_permission/common.handle_all_urls` — App Links vérifiés
- `delegate_permission/common.get_login_creds` — partage credentials site ↔ app

Remplacer :

- `package_name` : `com.cloudity.pass` (ou celui du `applicationId` Gradle)
- `sha256_cert_fingerprints` : empreinte SHA-256 du certificat de signature release
  (`keytool -list -v -keystore release.jks`)

## Côté app Android

Fichier : `mobile/pass/android/app/src/main/AndroidManifest.xml`

Intent-filters `autoVerify="true"` pour les domaines Cloudity (prod + dev).

Variables d’environnement / build :

- `CLOUDITY_DAL_HOSTS` — liste de domaines (ex. `cloudity.example.com,localhost`)

## Vérification

```bash
# Statement du site
curl -sS https://<domaine>/.well-known/assetlinks.json | jq .

# Outil Google
# https://developers.google.com/digital-asset-links/tools/generator
adb shell pm get-app-links com.cloudity.pass
```

## Sécurité

DAL **ne remplace pas** le chiffrement E2E Pass. Il atteste seulement que le site
et l’app appartiennent au même éditeur — réduit les mauvais appariements autofill.

Voir aussi : [CLOUDITY-USER-PREFERENCES.md](CLOUDITY-USER-PREFERENCES.md), [MULTI-PLATEFORME.md](MULTI-PLATEFORME.md).
