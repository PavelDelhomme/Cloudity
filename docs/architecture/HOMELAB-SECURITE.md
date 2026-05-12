# Cloudity — Homelab & sécurité résidentielle (cadre)

**Rôle** : décrire le **cadre matériel + réseau + sécurité côté domicile** qui héberge la **machine de backup offsite** Cloudity (cf. **[BACKUP-OFFSITE.md](BACKUP-OFFSITE.md)**), permet l'**accès distant chiffré** (web admin + app mobile admin) au LAN, et, à terme, sert de **routeur de sécurité** filtrant le trafic du foyer (hors flux explicitement écartés type Netflix / PC fixe perso).

> Statut : **plan à mettre en œuvre AVANT la mise en production** Cloudity (déploiement VPS public). Aucune action urgente tant que le service tourne en local.

> Voir aussi : **[../decisions/multi-repo/REPONSES.md](../decisions/multi-repo/REPONSES.md)** Q11–Q15 (à remplir).

---

## 0. Vision

> Une **Raspberry Pi à la maison** qui sert simultanément :
> 1. de **runner backup offsite** pour Cloudity (cf. BACKUP-OFFSITE.md) ;
> 2. de **routeur / pare-feu / VPN** pour le LAN — filtre tout sauf des exceptions (Netflix, PC fixe perso) ;
> 3. de **point d'accès distant** (web + mobile admin) pour piloter Cloudity depuis l'extérieur ;
> 4. de **brique de monitoring** remontée vers le panel admin Cloudity (`/4dm1n`).
>
> Tout doit être **fait main**, sans dépendance à un service tiers cloud (Cloudflare Tunnel, Tailscale managé, etc.) ; les seuls services « externes » seront le VPS public Cloudity de production et un éventuel relais STUN/TURN minimal.

---

## 1. Inventaire matériel

### 1.1 Existant (à confirmer / corriger)

| Élément | État | Rôle envisagé |
|---------|------|---------------|
| **Raspberry Pi** (modèle ?) | présente, hors LAN actuellement | Backup runner + routeur/VPN |
| **Disque USB 1 To** | contient des données à conserver | Après nettoyage : **stockage backup principal** |
| **Disque USB 500 Go** | contient des données à conserver | Après nettoyage : **archive froide** ou **redondance** |
| **PC fixe perso** | machine de travail | Reste hors filtrage (exception) |
| **Box FAI** | modem/routeur Internet | Restera en place ; la RPi vient s'intercaler |
| **Smartphone admin** (Flutter `mobile/admin` à venir) | hors LAN actuellement | Accès distant à `/4dm1n` via VPN |
| **Arduino** (potentiel, dédié projet « gamelle connectée chat ») | hors scope direct | Mention pour mémoire — voir § 8.4 |

### 1.2 À acheter selon le scénario réseau choisi (cf. Q11)

| Composant | Pourquoi | Coût indicatif |
|-----------|----------|----------------|
| **Hub USB 3.0 alimenté** (4 ports, 5V/4A) | Brancher les 2 disques USB 3.5" sur la RPi sans sous-alimenter (la RPi seule ne fournit que ~1.2 A/USB en pic) | 20–30 € |
| **Adaptateur USB-Ethernet Gigabit** (ex. TP-Link UE300, Realtek RTL8153) | Donner une **2ᵉ NIC** filaire à la RPi → routage IN/OUT séparé (WAN ↔ LAN) | 10–20 € |
| **Mini-PC routeur** (option médiane, en remplacement RPi-router) | Si la RPi reste dédiée backup et qu'on veut un routeur dédié robuste (Lenovo M93p Tiny d'occasion, Topton 2-NIC neuf) | 80–250 € |
| **Switch managé Gigabit** 5 ou 8 ports (TP-Link TL-SG108E ou MikroTik CRS305) | Indispensable si VLAN / segmentation DMZ | 25–80 € |
| **Onduleur (UPS) 600 VA** | Coupures secteur → backup intègre + RPi qui n'écrit pas pendant chute de tension | 60–100 € |
| **Boîtier RPi avec dissipation passive** + carte SD A2 64Go ou SSD M.2 USB | Stabilité long terme (carte SD basique meurt en quelques mois sous écriture intensive) | 30–80 € |

→ Estimations **minimales** : ~50 € (hub + NIC USB).
→ Estimations **médianes** (RPi-router OK + UPS) : ~150 €.
→ Estimations **cibles** (mini-PC routeur + switch managé + UPS + SSD RPi) : ~400 €.

---

## 2. Procédure de **nettoyage et compression des 2 disques** (avant migration)

> Objectif : les 2 disques contiennent aujourd'hui des données utilisateur. **Avant** de les dédier à la machine de backup Cloudity, on les **nettoie**, on **dédoublonne**, on **compresse en archives froides** ce qui doit rester, puis on **formate** les partitions destinées à Cloudity.

### 2.1 Pré-requis

- Les disques sont branchés **sur le PC fixe**, pas sur la RPi (plus de RAM + outils plus rapides).
- Espace de travail temporaire ≥ 200 Go sur le PC fixe (pour compresser pendant que les données sources existent encore).

### 2.2 Étape A — Inventaire interactif

```bash
sudo apt install ncdu rmlint zstd
sudo mount /dev/sdX1 /mnt/disk1            # adapter sdX1
ncdu /mnt/disk1                             # explorer interactif (touches d/q/?)
```

`ncdu` permet de naviguer, voir les tailles, **supprimer** sur place ce qui est obsolète. C'est **manuel par design** : pas de suppression automatique d'éléments potentiellement précieux.

### 2.3 Étape B — Détection des doublons inter-fichiers

```bash
rmlint --types=duplicates --hidden /mnt/disk1
# → produit /mnt/disk1/rmlint.sh à inspecter AVANT exécution
less /mnt/disk1/rmlint.sh
# si OK :
bash /mnt/disk1/rmlint.sh
```

`rmlint` détecte aussi les **fichiers vides**, **liens cassés**, **fichiers trop similaires**. Il **ne supprime rien sans confirmation** : il génère un script bash qu'on revoit à la main.

### 2.4 Étape C — Compression « archive froide »

Pour les répertoires qu'on souhaite **garder mais sans accès régulier**, on les transforme en archives compressées maximum.

Choix de format :

| Format | Vitesse de compression | Ratio | Vitesse de décompression | Recommandation |
|--------|------------------------|-------|--------------------------|----------------|
| **`tar.zst` (zstd niveau 19, `--long=27`)** | rapide | excellent (proche LZMA) | très rapide | **Recommandé** : meilleur compromis |
| `tar.xz` (xz -9e) | lent | excellent | lent | OK pour dépôt long terme rarement lu |
| `7z` (LZMA2 max) | très lent | excellent | moyen | OK pour archive avec mot de passe |

Commande type :

```bash
# Pour un dossier "Photos_2018-2020" qu'on veut compresser :
tar --use-compress-program='zstd -19 --long=27 --threads=0' \
    -cf /tmp/Photos_2018-2020.tar.zst -C /mnt/disk1 Photos_2018-2020

# Vérifier l'archive (intégrité + listing) :
zstd -t /tmp/Photos_2018-2020.tar.zst
tar -tf /tmp/Photos_2018-2020.tar.zst | head

# Empreinte intégrité (à conserver à part) :
sha256sum /tmp/Photos_2018-2020.tar.zst > /tmp/Photos_2018-2020.tar.zst.sha256
b3sum     /tmp/Photos_2018-2020.tar.zst > /tmp/Photos_2018-2020.tar.zst.blake3
```

Pour les **dossiers déjà compressés** (jpg, mp4, mp3, zip, etc.), zstd n'apportera quasiment rien. On les laisse **tels quels** dans une archive `tar` simple sans compression :

```bash
tar -cf /tmp/Photos_compressees_originales.tar -C /mnt/disk1 Photos_compressees_originales
```

→ Heuristique simple : zstd si `du -b` ÷ `du -b après préfix .jpg/.mp4` > 30 % de fichiers texte/raw. Sinon `tar` brut.

### 2.5 Étape D — Bascule vers le disque cible

Plan de migration **séquentiel** (pas de copie destructive sans avoir vérifié) :

1. Disque **1 To** → reste à plat dans `/mnt/disk1` pour le moment.
2. Compresser tout ce qui doit être conservé du disque **500 Go** dans `/tmp/` (ou plus large) du PC fixe.
3. **Vérifier les hashes** des archives.
4. **Formater** le disque 500 Go en **ext4** (ou LUKS+ext4 si chiffrement souhaité — recommandé) :
   ```bash
   sudo cryptsetup luksFormat /dev/sdX
   sudo cryptsetup open /dev/sdX disk500
   sudo mkfs.ext4 -L cloudity-cold /dev/mapper/disk500
   ```
5. Y placer les archives froides précédentes (`/srv/cold-archive/`) **+** un dossier vide `/srv/cloudity-backup/` réservé.
6. Répéter pour le disque **1 To** (qui devient le **principal** pour Restic du runner).

### 2.6 Étape E — Sur la Raspberry Pi

Une fois les 2 disques préparés et branchés via **hub USB alimenté** :

- déchiffrer LUKS au boot via clé sur SD card (compromis ergonomie/sécurité — alternative : passphrase saisie à chaque boot via SSH au déverrouillage à distance avec `dropbear-initramfs`) ;
- monter dans `/mnt/cloudity-1tb/` et `/mnt/cloudity-500gb/` via `/etc/fstab` (`nofail` pour ne pas bloquer le boot si un disque est débranché) ;
- créer **un seul Restic repo** sur le 1 To, **réplication** quotidienne vers le 500 Go via `rsync` ou `restic copy` (redondance locale gratuite).

---

## 3. Topologie réseau cible

Trois scénarios selon Q11 (à choisir) :

### 3.1 Scénario A — **Minimal** (le plus rapide à mettre en place)

```
Internet ── Box FAI (modem/routeur ── pas modifiée)
                  │
                  ├── PC fixe (DHCP box, hors filtrage)
                  ├── Smartphone (DHCP box, hors filtrage)
                  └── Raspberry Pi (eth0 : DHCP box ; eth1/USB : non utilisé)
                          │
                          └── 2 disques USB (via hub alimenté)
```

- La RPi reste un **pur serveur backup** sur le LAN, comme n'importe quel équipement.
- **Pas de filtrage** : la box FAI fait son boulot.
- VPN WireGuard : la RPi écoute sur l'IP publique de la box FAI (port-forward UDP 51820 → RPi). Mobile + PC fixe se connectent dessus quand ils sont à l'extérieur.
- DMZ : N/A (rien d'exposé, hormis le port WireGuard).

✅ **Pour** : mise en place en 1 weekend, peu d'achat (juste hub + NIC USB optionnel).
❌ **Contre** : pas de contrôle granulaire du trafic du foyer (tu ne peux pas « bloquer YouTube partout sauf le PC fixe »).

### 3.2 Scénario B — **Médian** (RPi-router)

```
Internet ── Box FAI (passée en mode "bridge" si possible) ── (eth0 RPi WAN)
                                                              │
                                          [Raspberry Pi : nftables + WireGuard + dnsmasq + Pi-hole/AdGuard]
                                                              │
                                                              (eth1 RPi LAN, via USB-Ethernet)
                                                              │
                                                              switch
                                                              │
                          ┌────────────────┬─────────────────┴──────────────────────────┐
                          │                │                                            │
                       PC fixe    autre équipement domestique                 RPi backup runner ← (option : rester sur la même RPi si CPU OK)
```

- La box FAI est passée **en bridge** (DMZ totale vers la RPi) **ou** la RPi devient un routeur **derrière** la box (NAT en cascade — moins propre mais possible).
- **nftables** sur la RPi pour filtrer : par défaut bloquer YouTube ads, certains domaines pubs, certains équipements (caméras IoT) ; **whitelist** : Netflix / IP du PC fixe peuvent sortir librement.
- **WireGuard** server pour accès distant (mobile / PC en mobilité).
- **Pi-hole** ou **AdGuard Home** pour DNS sinkhole côté LAN.
- DMZ logique : la RPi est SEULE exposée à Internet (port 51820 UDP WireGuard) ; tout le LAN derrière.

⚠ **Attention CPU/RAM** : une RPi 4B avec 4-8 Go fait routeur + Pi-hole + WireGuard sans souci en pratique pour ~5 utilisateurs. Au-delà ou avec backup Restic concurrent, prévoir une **RPi dédiée au routage** + une **RPi backup** séparée (ou un **mini-PC**).

✅ **Pour** : contrôle réel du trafic, segmentation, vie privée du LAN.
❌ **Contre** : SPOF — si la RPi tombe, plus d'Internet ; demande compétence nftables. Investissement temps initial.

### 3.3 Scénario C — **Cible** (mini-PC routeur + RPi backup dédiée)

```
Internet ── Box FAI (bridge) ── Mini-PC OPNsense/pfSense (2 NIC) ── switch managé VLAN
                                                                          │
                                                                ┌─────────┼──────────────────────┐
                                                          VLAN 10        VLAN 20            VLAN 30
                                                          (LAN trust)    (DMZ services)     (IoT)
                                                          │              │                  │
                                                          PC fixe       RPi backup runner   capteurs / arduino / chat
                                                          smartphone     (interface          (gamelle connectée)
                                                          (LAN)          web exposée
                                                                         en interne uniquement)
```

- Routeur dédié (OPNsense ou nftables hand-rolled).
- 3 VLAN minimum : trust / DMZ / IoT.
- WireGuard sur le routeur, pas sur la RPi.
- La RPi se concentre sur backup + monitoring.
- La gamelle Arduino vit en VLAN IoT, isolée du reste (cf. § 8.4).

✅ **Pour** : architecture pro, scalable, audit-friendly.
❌ **Contre** : demande matériel + 1-2 weekends de mise en place.

---

## 4. VPN — connexion ultra-chiffrée vers le foyer

### 4.1 Choix techno : **WireGuard** (recommandation forte)

- Implémenté dans le kernel Linux mainline (vitesse maximale, surface d'attaque minimale).
- Crypto **moderne et figée** : Curve25519 (ECDH), ChaCha20-Poly1305 (AEAD), BLAKE2s (hashing), HKDF.
- Pas de négociation algo (donc pas de downgrade attack).
- Configuration courte (~10 lignes par peer), gestion des clés simple.
- Clients officiels : Linux, Android, iOS, macOS, Windows.

### 4.2 Topologie WireGuard recommandée

- **Server** : la RPi (scénario A/B) ou le mini-PC routeur (scénario C). Port UDP 51820, port-forward depuis la box FAI.
- **Peers clients** :
  - PC fixe perso (en mobilité) ;
  - Smartphone admin (toujours, pour /4dm1n quand dehors) ;
  - Plus tard, le **VPS Cloudity** (peer site-to-site pour piloter le runner sans exposition Internet directe).

### 4.3 Sécurité au-delà du chiffrement de base

- **Clés pré-partagées (PSK)** en plus des clés Curve25519 : `wg genpsk`. Ajoute une couche post-quantum résistante (essentiel si on craint « stocker maintenant, déchiffrer plus tard »).
- **Rotation des clés** : tous les 6 mois (script semi-automatique).
- **Authentification 2FA** côté admin Cloudity même via VPN : le VPN ne dispense pas de l'auth applicative.
- **No-fallback** : pas de port 51820 répondant si la PSK est invalide (drop silencieux côté nftables).
- **Géoblocage du port WireGuard** au niveau du routeur (n'accepte que les IP des pays / FAI utilisés par les peers connus). Évite ~99 % du scan de fond.

### 4.4 Tailscale / Headscale ?

Tu as précisé **« plutôt maison »**. Deux niveaux possibles :

- **Pure WireGuard manuel** : configs `.conf` éditées à la main, gestion des paires de clés via un dossier git chiffré. **Recommandé** pour ~5 peers.
- **Headscale** (serveur Tailscale open-source self-hosted) : si le maillage devient grand (>10 peers), simplifie la gestion ; tourne en conteneur sur le routeur ou le VPS.

**Pas Tailscale managé** (service tiers cloud) : disqualifié par ta contrainte « plutôt maison ».

---

## 5. DMZ et segmentation

### 5.1 Au minimum

- **Pas d'expostion** des services Cloudity vers Internet **autrement** que via le VPS public (qui héberge la prod) ou via WireGuard (admin distant).
- La RPi backup **n'écoute** que sur :
  - port 22 SSH (interface VPN uniquement, pas WAN) ;
  - port 7080 HTTP panel local (interface LAN ou VPN uniquement) ;
  - port d'écoute du canal long-lived vers admin-service VPS (uniquement initié sortant).

### 5.2 En scénario C (VLANs)

- **VLAN trust** : équipements personnels (PC fixe, smartphone, console). Sortent vers Internet, peuvent accéder DMZ.
- **VLAN DMZ** : services exposés en interne (RPi backup web panel, futurs services). Pas d'accès direct à VLAN trust ; ré-entrée filtrée.
- **VLAN IoT** : capteurs, gamelle chat, caméras éventuelles. **Bloque tout** vers VLAN trust ; sortie Internet limitée à des destinations whitelistées.

---

## 6. Monitoring depuis l'admin Cloudity

Objectif : voir l'état de la RPi homelab depuis `/4dm1n` (web) et `mobile/admin` (Flutter).

### 6.1 Métriques minimales à remonter

- Santé matérielle : température CPU, charge, RAM, espace disque (par disque), température disques (smartctl).
- Santé services : `cloudity-backup-runner`, WireGuard handshakes, nftables drops récents.
- Santé réseau : ping FAI, pertes paquets, débit montant/descendant.
- Santé alimentation : sous-tension RPi (`vcgencmd get_throttled`), état UPS si présent.

### 6.2 Stack proposée (minimale)

- **Agent local sur RPi** : `node_exporter` + un petit collecteur custom Go (~200 lignes) qui pousse les métriques au runner.
- **Runner** expose un endpoint `/metrics` (mTLS interne).
- **admin-service** (côté VPS prod) interroge ce endpoint via le canal long-lived → stocke en TSDB (Postgres pour démarrer, Prometheus plus tard si besoin).
- **`/4dm1n/homelab`** (à créer côté frontend) : page Status RPi temps réel + historique 30 jours.

### 6.3 Alertes

- Notification push mobile (via `mobile/admin`) si :
  - aucun handshake WireGuard depuis 24 h ;
  - aucun backup réussi depuis 48 h ;
  - température RPi > 80 °C ;
  - disque > 90 % rempli.

---

## 7. App mobile admin — accès distant ultra-sécurisé

### 7.1 Flux normal (par défaut)

```
Mobile admin (Flutter)
     │ HTTPS + mTLS client cert
     ▼
api-gateway VPS Cloudity (production)
     │ mTLS internal
     ▼
admin-service
     │ canal long-lived (gRPC streaming)
     ▼
RPi backup runner (chez moi)
```

→ Pas besoin que le mobile établisse un VPN. La RPi fait le pull, le VPS fait pivot. Le mobile parle HTTPS classique vers le VPS (avec **certificat client** WebAuthn-bound ou step-ca-issued).

### 7.2 Flux secours (VPS down)

```
Mobile admin (Flutter)
     │ WireGuard (PSK + Curve25519)
     ▼
RPi (port WireGuard)
     │ HTTP local (panel 7080)
     ▼
panel runner (UI dégradée, pas de cross-data avec /4dm1n VPS)
```

→ Activé manuellement depuis l'app mobile (« mode secours »). Permet au moins de voir l'état des backups quand le VPS est inaccessible.

### 7.3 Authentification

- **Pas** de mot de passe seul, **jamais**.
- Mobile : WebAuthn (passkey local, stocké dans le keychain du téléphone) **+** code PIN à 6 chiffres pour déverrouiller l'app.
- Web `/4dm1n` : WebAuthn **+** JWT court (15 min) **+** refresh + 2FA TOTP en plus.

---

## 8. Roadmap

> **Ordre de priorité** : tout cela arrive **avant** la mise en production Cloudity. Aujourd'hui (2026-05-12) la stack tourne en local : pas d'urgence opérationnelle, mais il faut commencer **maintenant** la conception (commande matériel = délai, choix VPN = délai, nettoyage disques = soir/weekend).

### Phase H0 — Préparer (2-4 weekends)

1. **Inventaire matériel précis** (modèle exact RPi, capacité réelle des disques, état de la box FAI, possibilité bridge mode).
2. **Choisir scénario** A / B / C (cf. Q11) → liste de courses si nécessaire.
3. **Nettoyer les 2 disques** (cf. § 2 — étapes A→D, sur PC fixe).

### Phase H1 — RPi backup minimale (1 weekend)

1. RPi avec OS Bookworm (Raspberry Pi OS Lite 64-bit), SSD M.2 USB recommandé pour la robustesse.
2. Disques branchés, LUKS + ext4 + montage automatique.
3. Installation **`cloudity-backup-runner`** (binaire Go, à coder une fois Phase 0 Cloudity terminée).
4. WireGuard server (scénario A) → tester accès depuis smartphone et PC fixe en mobilité.

### Phase H2 — Sécurité réseau (selon Q11)

- Si scénario A retenu : on s'arrête là pour le réseau, on revient plus tard.
- Si B/C retenu : passage en bridge box FAI, montée nftables, Pi-hole, switch managé, VLANs.

### Phase H3 — Monitoring + intégration Cloudity admin

1. Agent métriques sur RPi.
2. `/4dm1n/homelab` côté front + endpoint admin-service.
3. Alertes push mobile.

### Phase H4 — Mise en production Cloudity (déclencheur)

À partir d'ici, le Cloudity prod (VPS) commence à pousser ses backups vers la RPi homelab. Avant cette phase, **rien** de critique ne quitte le local.

### Hors scope court terme — Arduino / gamelle chat

Idée à archiver pour plus tard : la gamelle connectée chat (Arduino + capteur poids/RFID) en VLAN IoT, exposée à un mini-service Cloudity côté famille (notifications « le chat a mangé », poids hebdo). À traiter quand Phase H1-H3 livrées et Cloudity stabilisé en prod. Voir **[../../BACKLOG.md](../../BACKLOG.md)**.

---

## 9. Checklist d'achat (à valider selon Q11)

Cocher selon scénario retenu :

- [ ] Hub USB 3.0 alimenté 4 ports (~25 €) — **scénarios A/B/C**
- [ ] Adaptateur USB-Ethernet Gigabit (TP-Link UE300, ~15 €) — **scénarios B/C**
- [ ] Mini-PC routeur 2 NIC (Lenovo M93p Tiny d'occasion, ~80–120 €) — **scénario C**
- [ ] Switch managé Gigabit 5/8 ports (TL-SG108E, ~25 €) — **scénario C**
- [ ] UPS 600 VA (~70 €) — **scénarios B/C** fortement recommandé
- [ ] Boîtier RPi avec dissipation passive (Argon ONE M.2, ~50 €) — **tous scénarios** si écriture intensive
- [ ] SSD M.2 USB 256 Go (~40 €) — **tous scénarios** (remplace SD card pour la durée de vie)
- [ ] Boîtier disque 3.5" externe avec alim si les disques actuels sont nus — **selon état actuel disques**

---

## 10. Suite

> Une fois Q11–Q15 répondues dans **[../decisions/multi-repo/REPONSES.md](../decisions/multi-repo/REPONSES.md)**, ce document devient un plan d'action concret : on écrira les scripts, configs WireGuard / nftables, Dockerfile du runner, et la todo détaillée dans **[../../BACKLOG.md](../../BACKLOG.md)** § « Homelab / Sécurité résidentielle ».
