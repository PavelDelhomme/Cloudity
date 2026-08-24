# @cloudity/web-drive — FE-SPLIT-02

## Modes

| Mode | Comportement |
|------|----------------|
| **DEV** (`make up` / Vite shell) | Drive monté **lazy** dans `@cloudity/web` sur `/app/drive` (même process) |
| **PROD** (Dockerfile nginx) | SPA autonome buildée ici → servie sous **`/app/drive/`** |

## Build

```bash
cd frontend && npm install
npm run build -w @cloudity/web-drive
# dist/ → copié dans l’image nginx sous /usr/share/nginx/html/app/drive
```

## Structure

- `src/drive/` — UI Drive
- `src/main.tsx` + `DriveShellLayout.tsx` — entry SPA
- Alias `@cloudity/web-shell/*` → sources `cloudity-web/src` (auth, upload, CSS)

Doc : `docs/architecture/MULTI-APPS-WEB-MOBILE.md` § 2.3 (même pattern que Mail)
