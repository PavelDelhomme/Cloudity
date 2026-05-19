# Distribution Linux & bureaux (plan)

**Rôle** : cadrer les canaux **hors Docker** pour installer Cloudity (Pass, Mail, Drive, etc.) sur postes utilisateurs — **sans promesse de date** sur chaque format.

Complète **[RELEASE-AND-DISTRIBUTION.md](RELEASE-AND-DISTRIBUTION.md)** (mobile + web) et **[DEPLOIEMENT-SUIVI.md](DEPLOIEMENT-SUIVI.md)** (VPS).

---

## Périmètre par plateforme

| Plateforme | Formats envisagés | Priorité suggérée |
|------------|-------------------|-------------------|
| **Android** | APK signé + `version.json` OTA | P0 (déjà amorcé) |
| **iOS** | TestFlight / MDM entreprise | P2 |
| **Windows** | MSIX ou installeur signé (WiX / Inno) | P2 |
| **macOS** | `.dmg` + notarisation Apple | P3 |
| **Linux** | voir § Linux ci-dessous | P1–P2 |

---

## Linux — canaux recommandés

| Canal | Intérêt | Effort | Notes |
|-------|---------|--------|-------|
| **`.deb`** (Debian/Ubuntu) | Très demandé, CI simple | Moyen | `dpkg` + dépôt APT privé ou Packagecloud |
| **Flatpak** | Sandboxing, Flathub possible | Élevé | Bon pour desktop « store-like » |
| **Snap** | Ubuntu / snap store | Élevé | Confinement strict, review store |
| **AUR** (`yay` / `paru`) | Arch / Manjaro | Moyen | Paquet maintenu par la communauté ou script `PKGBUILD` officiel |
| **RPM** | Fedora / RHEL | Moyen | `rpmbuild` + Copr |
| **AppImage** | Portable, une binary | Faible–moyen | Pas de mise à jour auto intégrée sans plugin |
| **Tarball + script** | Homelab / power users | Faible | `install.sh` qui pose binaire Flutter + deps |

**Recommandation Cloudity** : commencer par **`.deb` + AppImage`** pour Flutter desktop ; ajouter **Flatpak** si besoin sandbox ; **Snap** et **AUR** en parallèle communautaire ou phase 2.

---

## Contenu d’un paquet desktop Linux

- Binaire Flutter (Pass / hub à terme)
- Icône `.desktop` (`~/.local/share/applications`)
- Dépendances : `libsecret`, GTK, keyring (selon `flutter build linux`)
- Fichier **`version.json`** local ou URL HTTPS pour mise à jour (même principe que mobile)

---

## Mises à jour applicatives (hors stores)

| Composant | Mécanisme |
|-----------|-----------|
| **Web** | Nouvelle image `cloudity-web` (hash assets Vite) |
| **API / microservices** | GHCR + Portainer (§ registry) |
| **Android** | `version.json` + APK |
| **Linux desktop** | APT repo versionné, ou `flatpak update`, ou AppImage + script |

---

## Registry Docker → Portainer (rappel)

Voir **[DEPLOIEMENT-SUIVI.md](DEPLOIEMENT-SUIVI.md)** phase B :

1. GHA **`docker-publish.yml`** pousse vers **GHCR** (`ghcr.io/<owner>/cloudity-<service>:<tag>`).
2. Portainer : stack avec `image:` + variable `TAG`.
3. Mise à jour : **Webhook Portainer** (POST après push GHA) ou **Watchtower** (homelab) ou pull manuel.
4. Vérification : healthcheck gateway + smoke test Mail/Drive.

**Ne pas** mélanger stack **Maddy** (ports 25/993) avec stack **Cloudity** (web/API).

---

## Snap & Flatpak — faisable ?

| | Snap | Flatpak |
|---|------|---------|
| **Faisable** | Oui | Oui |
| **Flutter** | `snapcraft.yaml` + plugin flutter | Manifest + `flatpak-builder` |
| **Contraintes** | Interfaces snap (network, secret) | Portals desktop |
| **Publication** | Snap Store review | Flathub review |

À traiter **après** un `.deb` ou AppImage qui fonctionne en local.

---

## Liens

- **[MULTI-PLATEFORME.md](../produit/MULTI-PLATEFORME.md)**
- **[BACKLOG.md](../../BACKLOG.md)** — cases **MP-***, Q24 GHCR
- **`TODOS.md`** § déploiement & distribution
