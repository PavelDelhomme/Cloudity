# Comment ouvrir Cloudity + JobbingTrack dans Cursor

## Ce qui est déjà en place (normal)

```text
Cloudity/
├── Cloudity.code-workspace     ← ouverture « suite »
├── products/
│   ├── jobbing-track/          ← submodule Git = repo JobbingTrack (complet)
│   ├── fuel/                   ← placeholder (Gasoil plus tard)
│   └── music/                  ← placeholder (PLM plus tard)
├── platform/identity-sdk/      ← SDK SSO (squelette)
├── backend/ frontend/ mobile/  ← Cloudity « cœur » (inchangé)
└── docs/cursor/BRIEF-….md      ← brief à donner aux chats Cursor
```

**Oui, `products/` ne contient que JobbingTrack pour l’instant** : c’est volontaire.  
Gasoil et PLM s’ajoutent **un submodule à la fois** (même procédure), sans toucher aux volumes Docker.

Le dossier historique `/Perso/JobbingTrack` peut encore exister : c’est le **même repo Git**.  
Le chemin canonique dans la suite est désormais :

`/Perso/Cloudity/Cloudity/products/jobbing-track`

---

## Deux façons d’ouvrir (pas besoin des deux)

### A — Vue suite (recommandé si tu bosses Cloudity + JT)

```bash
cd /home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity
cursor Cloudity.code-workspace
```

Dans Cursor tu auras **2 racines** dans l’explorateur :
1. **Cloudity (suite)** — monorepo
2. **JobbingTrack** — `products/jobbing-track`

Tu **n’as pas** besoin d’ouvrir un second Cursor ni de faire `cd … && cursor .` dans un autre terminal :  
tu changes juste de dossier dans le même workspace (Source Control = bon repo).

### B — JobbingTrack seul (quotidien JT)

```bash
cd /home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity/products/jobbing-track
cursor .
```

Ou l’ancien chemin si tu préfères encore :

```bash
cd /home/pactivisme/Documents/Dev/Perso/JobbingTrack
cursor .
```

---

## Orchestrateur : quoi démarre quoi ?

| Besoin | Que lancer |
|--------|------------|
| Développer **seulement** JobbingTrack | Stack JT seule (`make` / compose JT) — **Cloudity n’est pas obligatoire** |
| Développer **seulement** Cloudity Mail/Drive/… | Stack Cloudity seule |
| Tester **SSO / hub** plus tard | Cloudity + JT (quand OIDC sera branché) |
| Prod VPS aujourd’hui | Stacks Docker **séparées** (déjà le cas) |

Cloudity n’est **pas encore** un orchestrateur runtime unique.  
C’est un **cadre de développement + docs + submodule**. Les stacks Portainer restent indépendantes → **zéro perte** de données.

---

## Après un commit dans JobbingTrack

```bash
cd products/jobbing-track
git push origin dev

cd ../..   # racine Cloudity
git add products/jobbing-track
git commit -m "chore: bump jobbing-track submodule"
git push
```

---

## Brief pour un chat Cursor

Fichier à `@` : [`docs/cursor/BRIEF-INTEGRATION-SUITE.md`](../cursor/BRIEF-INTEGRATION-SUITE.md)
