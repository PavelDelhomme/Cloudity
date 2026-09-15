# Comment ouvrir Cloudity + satellites dans Cursor

## Ce qui est déjà en place

```text
Cloudity/
├── Cloudity.code-workspace
├── products/
│   ├── jobbing-track/   ← submodule JobbingTrack
│   ├── fuel/            ← submodule GasoilTracking
│   └── music/           ← submodule YTMusic / PLM
├── platform/identity-sdk/
├── backend/ frontend/ mobile/
└── docs/cursor/
```

Chemins canoniques : `…/Cloudity/Cloudity/products/{jobbing-track,fuel,music}`  
(Les clones sous `/Perso/…` restent valides = même repo Git.)

```bash
cd /home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity
cursor Cloudity.code-workspace
```

4 racines : Cloudity · JobbingTrack · GasoilTracking · PLM / YTMusic.

Stacks Portainer **séparées** → zéro perte de volumes (`gasoil_api_data`, etc.).

## Après un commit satellite

```bash
cd products/fuel && git push origin dev
cd ../.. && git add products/fuel && git commit -m "chore: bump fuel submodule"
```
