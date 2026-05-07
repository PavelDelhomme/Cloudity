# Réglages sur la machine hôte (Linux) — dev Cloudity

Ces points concernent le **noyau Linux** de ta machine, pas le code du dépôt. Docker utilise le même noyau que l’hôte.

---

## Redis : `vm.overcommit_memory`

**Message** (logs `cloudity-redis`) :

> WARNING Memory overcommit must be enabled! … add `vm.overcommit_memory = 1` to `/etc/sysctl.conf` … or run `sysctl vm.overcommit_memory=1`

**Pourquoi** : Redis (RDB / AOF / réplication) peut demander plus de RAM virtuelle que la limite stricte ; sans **overcommit**, des sauvegardes en arrière-plan peuvent échouer même si la RAM « réelle » semble suffisante.

**Important** : ce paramètre est **global au noyau**. Docker **ne peut pas** l’activer de façon isolée dans un conteneur ; il faut le régler **sur l’hôte** (Arch, Debian, Fedora, etc.).

### Application immédiate (jusqu’au prochain reboot)

```bash
sudo sysctl vm.overcommit_memory=1
```

### Permanent

Ajoute dans **`/etc/sysctl.d/99-cloudity-redis.conf`** (ou **`/etc/sysctl.conf`**) :

```text
vm.overcommit_memory = 1
```

Puis :

```bash
sudo sysctl --system
```

Ou redémarre la machine.

### Vérifier la valeur actuelle

```bash
sysctl vm.overcommit_memory
```

`0` = désactivé (défaut souvent) → warning Redis possible.  
`1` = toujours overcommit (recommandé pour Redis en dev).  
`2` = mode strict (à éviter avec Redis si tu vois des erreurs de fork / save).

### Script du dépôt

```bash
./scripts/dev/redis-host-sysctl.sh              # affiche l’état + instructions
APPLY=1 ./scripts/dev/redis-host-sysctl.sh      # tente sudo sysctl vm.overcommit_memory=1
```

Voir **`make host-redis-sysctl`** (même script).

---

## npm dans l’image Docker `cloudity-web`

Les **Dockerfile** `frontend/apps/cloudity-web/Dockerfile.dev` et `Dockerfile` exécutent **`npm install -g npm@11.13.0`** après l’image **Node 20** (qui embarque npm 10.x par défaut), pour aligner la toolchain **npm 11** avec le lockfile et les bonnes pratiques workspaces.

Sur ta machine hôte, mets à jour npm seulement si tu veux la même version locale :

```bash
npm install -g npm@11.13.0
```
