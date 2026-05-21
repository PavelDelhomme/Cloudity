# Cloudity Pass — build Firefox (MP-08)

Dossier **léger** : pas de sources dupliquées. Le build :

1. compile `../cloudity-pass/` (esbuild, cible `firefox128` déjà dans le bundle) ;
2. copie `dist/` ici ;
3. fusionne `manifest.firefox.json` (`browser_specific_settings.gecko`).

## Build

```bash
cd extensions/cloudity-pass-firefox
npm run build
# ou depuis la racine :
make build-pass-extension-firefox
```

Sortie : `extensions/cloudity-pass-firefox/dist/`

## Test local

1. Firefox → `about:debugging` → **Ce Firefox** → **Charger un module complémentaire temporaire…**
2. Choisir `dist/manifest.json`
3. Même parcours que Chrome : Paramètres → gateway → connexion → déverrouillage → popup liste onglet actif.

## Identifiant Gecko

`pass@cloudity.local` — à remplacer par un ID signé AMO avant publication store.

## Safari

Reste hors scope MP-08 initial — wrapper Xcode / Web Extensions API (voir `MULTI-PLATEFORME.md`).
