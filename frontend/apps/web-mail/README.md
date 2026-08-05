# @cloudity/web-mail — FE-SPLIT-01

## Modes

| Mode | Comportement |
|------|----------------|
| **DEV** (`make up` / Vite shell) | Mail monté **lazy** dans `@cloudity/web` sur `/app/mail` (même process) |
| **PROD** (Dockerfile nginx) | SPA autonome buildée ici → servie sous **`/app/mail/`** |

## Build

```bash
cd frontend && npm install
npm run build -w @cloudity/web-mail
# dist/ → copié dans l’image nginx sous /usr/share/nginx/html/app/mail
```

## Structure

- `src/mail/` — UI Mail
- `src/main.tsx` + `MailShellLayout.tsx` — entry SPA
- Alias `@cloudity/web-shell/*` → sources `cloudity-web/src` (auth, CSS)

Doc : `docs/architecture/MULTI-APPS-WEB-MOBILE.md` § 2.3
