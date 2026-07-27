# Cloudity Pass — sauvegarde, restauration et mode hors ligne

> **Objectif** : ne jamais bloquer l’accès au coffre pour la seule raison qu’il n’y a pas de réseau ou que le cloud est temporairement injoignable — contrairement à KeePassXC + sync cloud quand le fichier distant est corrompu ou absent.

## Modèle à trois niveaux

| Niveau | Rôle | Où | Contenu |
|--------|------|-----|---------|
| **1. Cloud (distant)** | Source de vérité multi-appareils | Postgres `pass_vaults` / `pass_items` | Blobs `ciphertext` uniquement (zero-access) |
| **2. Fichier exporté** | Backup portable / archivage | Web : `cloudity-pass-backup-*.json` | Même blobs chiffrés + métadonnées coffres |
| **3. Cache local appareil** | Lecture hors ligne | Mobile : `Documents/cloudity_pass_backup_<userId>.json` | Snapshot automatique après sync réussie |

Le **mot de passe maître** et la **biométrie** restent **locaux** : le serveur ne peut ni déchiffrer ni restaurer un maître oublié.

---

## Format `cloudity-pass-backup-v1`

Fichier JSON (extension `.json`) :

```json
{
  "schema": "cloudity-pass-backup-v1",
  "exported_at": "2026-07-07T12:00:00.000Z",
  "user_id": "50",
  "app": "cloudity-pass",
  "vaults": [
    {
      "id": 1,
      "name": "Perso",
      "items": [
        {
          "id": 42,
          "ciphertext": "<base64url EnvelopeV1>",
          "format_version": 1
        }
      ]
    }
  ]
}
```

- **Aucun secret en clair** : seuls des ciphertexts client-side.
- Validation : `@cloudity/pass-crypto` (`parsePassBackupJson`) et miroir Dart `PassLocalBackupStore`.
- Spec crypto des blobs : [PASS-CRYPTO.md](../securite/PASS-CRYPTO.md).

---

## Web (`/app/pass`)

Une fois le coffre **déverrouillé** :

- **Exporter sauvegarde** — télécharge un fichier JSON (backup local sur disque, clé USB, NAS, etc.).
- **Restaurer sauvegarde** — réimporte vers le cloud ; les entrées déjà présentes (même `ciphertext`) sont ignorées ; les coffres manquants sont recréés.

Fichiers : `passBackup.ts`, `PassBackupActions.tsx`.

---

## Mobile (`mobile/pass`)

### Cache local automatique

Après chaque chargement réussi des coffres + items via l’API, l’app écrit un snapshot `cloudity-pass-backup-v1` dans le répertoire documents de l’app (`PassLocalBackupStore`).

### Mode hors ligne

1. Si `GET /pass/vaults` échoue (pas de réseau, stack arrêtée), l’écran de déverrouillage bascule en **mode hors ligne** si une sauvegarde locale existe.
2. L’utilisateur saisit le **mot de passe maître** (comme d’habitude) — pas de dépendance réseau pour la dérivation Argon2id.
3. Les coffres et entrées sont lus depuis le cache ; bannière « Mode hors ligne ».

### Biométrie (empreinte / visage / code appareil)

- Après un déverrouillage réussi par mot de passe, proposition d’**activer la biométrie**.
- La master key est stockée dans le **secure enclave / Keystore** (`PassBiometricStore`), protégée par `local_auth`.
- Re-verrouillage auto (5 min inactivité ou app en arrière-plan) → bouton **Déverrouiller avec biométrie** sans retaper le maître.
- Désactivation : déconnexion compte (`PassSessionStore.clearAll`) ou désactivation future dans Paramètres (L2).

**Important** : la biométrie ne remplace pas le maître sur un **nouvel appareil** ; il faut toujours le mot de passe maître + sync cloud ou fichier exporté.

---

## Stratégie recommandée (utilisateur)

1. **Cloud** : utilisation normale Cloudity Pass (sync automatique tant que la stack est up).
2. **Export fichier** : mensuel ou avant migration — bouton web « Exporter sauvegarde » → stockage chiffré (le fichier reste illisible sans le maître).
3. **Mobile** : ouvrir Pass en ligne au moins une fois après des changements importants pour rafraîchir le cache local.
4. **Récupération** :
   - Cloud OK → reconnecter, déverrouiller.
   - Cloud KO, mobile avec cache → mode hors ligne + maître.
   - Tout perdu sauf fichier → « Restaurer sauvegarde » sur le web + maître.

---

## Différences vs KeePassXC

| Situation | KeePassXC (sync cloud) | Cloudity Pass |
|-----------|------------------------|---------------|
| Pas de réseau | Souvent bloqué si le fichier .kdbx distant est requis | Mobile : cache local + maître |
| Fichier distant corrompu | Ouverture impossible | Export indépendants ; cloud = blobs versionnés |
| Déverrouillage rapide | OS / keyfile | Biométrie après 1er unlock maître |
| Zero-access serveur | Fichier = secret si mal sync | Postgres ne voit que du ciphertext |

---

## Roadmap (L2)

- [ ] Export / import fichier depuis mobile (partage `cloudity-pass-backup-*.json`)
- [ ] File d’attente modifications offline → sync au retour réseau
- [ ] Import KeePass `.kdbx`
- [ ] Paramètres UI : désactiver biométrie, voir date dernière sauvegarde locale
- [ ] Backup chiffré additionnel avec mot de passe export (double enveloppe)

---

## Fichiers implémentation

| Zone | Fichiers |
|------|----------|
| Format | `frontend/packages/pass-crypto/src/backup.ts` |
| Web | `frontend/apps/cloudity-web/src/pages/app/pass/passBackup.ts`, `PassBackupActions.tsx` |
| Mobile cache | `mobile/pass/lib/features/pass_local_backup.dart` |
| Mobile biométrie | `mobile/pass/lib/features/pass_biometric_store.dart` |
| Mobile UI | `unlock_screen.dart`, `vaults_screen.dart`, `items_screen.dart` |
