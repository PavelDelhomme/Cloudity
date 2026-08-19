# NPM — Proxy Hosts Cloudity (checklist)

HTTPS côté visiteur = **Let's Encrypt + Force SSL** dans NPM.  
Vers les conteneurs = **Scheme http** (pas https).

---

## Proxy 1 — WEB (tous les sous-domaines front)

| Champ | Valeur |
|-------|--------|
| Domain Names | `cloudity.delhomme.ovh` |
| | `admin.cloudity.delhomme.ovh` |
| | `mail.cloudity.delhomme.ovh` |
| | `drive.cloudity.delhomme.ovh` |
| | `pass.cloudity.delhomme.ovh` |
| | `calendar.cloudity.delhomme.ovh` |
| | `notes.cloudity.delhomme.ovh` |
| | `tasks.cloudity.delhomme.ovh` |
| | `contacts.cloudity.delhomme.ovh` |
| | `photos.cloudity.delhomme.ovh` |
| | `office.cloudity.delhomme.ovh` |
| | `mails.cloudity.delhomme.ovh` |
| Scheme | `http` |
| Forward hostname | **`cloudity-web`** |
| Forward port | **`80`** |
| Websockets | ON |
| SSL | Request SSL + **Force SSL** |
| Advanced | copier `deploy/portainer/npm-advanced-web.conf` |

---

## Proxy 2 — API (obligatoire, séparé)

| Champ | Valeur |
|-------|--------|
| Domain Names | `api.cloudity.delhomme.ovh` |
| Scheme | `http` |
| Forward hostname | **`cloudity-api-gateway`** |
| Forward port | **`8000`** |
| Websockets | ON |
| SSL | Force SSL |
| Advanced | `client_max_body_size 200m;` |

---

## À supprimer

- Proxy vers `95.111.227.204:80`
- Proxy `cloudity:80` (mauvais nom — remplacer par ci-dessus)

---

## 502 Bad Gateway ?

| Cause | Fix |
|-------|-----|
| Stack Portainer pas déployée | Deploy stack `cloudity` |
| Images GHCR pas pull | Attendre CI + redeploy |
| Mauvais forward | `cloudity-web:80` pas `cloudity:80` |
| NPM pas sur le réseau Docker | `NPM_NETWORK` dans stack env |
