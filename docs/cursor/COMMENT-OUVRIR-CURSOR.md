# Comment ouvrir Cloudity + satellites dans Cursor

```text
Cloudity/
├── Cloudity.code-workspace
├── products/
│   ├── jobbing-track/     ← JobbingTrack
│   ├── GasoilTracking/    ← GasoilTracking (pas « fuel »)
│   ├── YTMusic/           ← PLM / YTMusic (pas « music »)
│   └── maps/              ← placeholder Cloudity Maps
├── platform/identity-sdk/ ← Cloudity ID (SSO opt-in)
└── …
```

```bash
cd /home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity
cursor Cloudity.code-workspace
```

4 racines : Cloudity · JobbingTrack · GasoilTracking · YTMusic / PLM.

```bash
cd products/GasoilTracking && cursor .
cd products/YTMusic && cursor .
cd products/jobbing-track && cursor .
```

Stacks Portainer **séparées** → volumes intacts (`gasoil_api_data`, `ytmusic_ytmusic_data`, …).

SSO / comptes PLM : [`docs/ecosystem/CLOUDITY-AUTH-PLM.md`](../ecosystem/CLOUDITY-AUTH-PLM.md)

## Après un commit satellite

```bash
cd products/GasoilTracking && git push origin dev
cd ../.. && git add products/GasoilTracking && git commit -m "chore: bump GasoilTracking submodule"
```
