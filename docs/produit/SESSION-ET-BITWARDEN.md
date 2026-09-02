# Sessions longues & Bitwarden / passkeys (modèle « Google »)

> Comment rester **sécurisé** sans retaper email/mot de passe à chaque ouverture d’app.  
> Lié à **[TROIS-ETAPES.md](TROIS-ETAPES.md)** Étape 1 · **[SECURITE.md](../securite/SECURITE.md)**.

## 1. Ce que fait Google (et ce qu’on aligne)

| Couche | Google | Cloudity (cible / livré) |
|--------|--------|---------------------------|
| **Login une fois** | Compte sur l’appareil | Refresh token **30 j** en Secure Storage + broker Android inter-apps |
| **Accès court** | Access token renouvelé en silence | JWT d’accès **12 h** par défaut (`ACCESS_TOKEN_DURATION_MINUTES=720`) + refresh **avant** expiration (~10 min) |
| **Multi-apps** | Même compte | Broker + soft-rotate refresh **5 min** (évite 401 en chaîne) |
| **Coffre sensible** | PIN / biométrie pour Pass / Photos verrouillées | PIN/biométrie **locale** (Pass, Notes/Contacts vault, Photos verrouillé) — **pas** le login Cloudity |
| **Gestionnaire de mots de passe** | Google Password Manager / Bitwarden | Autofill + **passkeys** via Bitwarden / gestionnaire système |

**Règle produit** : ouvrir Photos / Mail / Agenda **ne doit pas** redemander le mot de passe Cloudity si le refresh est encore valide. Seuls le **coffre Pass** et les onglets **verrouillés** demandent PIN/biométrie.

## 2. Pourquoi tu re-saisissais trop souvent (avant)

1. Access token **60 min** + refresh seulement **après** expiration → 401 au retour d’arrière-plan.
2. Soft-rotate refresh trop court (2 min) entre apps → une app invalidait le token des autres.
3. Échec de restore qui **effaçait le broker global** (corrigé : `clearLocalTokens` seulement).

## 3. Réglages prod (Portainer / `stack.env`)

```bash
ACCESS_TOKEN_DURATION_MINUTES=720   # 12 h
REFRESH_TOKEN_DURATION_DAYS=30      # optionnel, défaut 30
```

Redéployer **`auth-service`** après changement. Les clients mobiles déjà installés profitent du refresh proactif dès la prochaine build.

## 4. Bitwarden comme « clé » (recommandé)

Tu peux **garder Bitwarden** comme coffre principal et Cloudity comme suite :

1. **Login Cloudity** (web + Android) : enregistrer `paul@…` + MDP dans **Bitwarden** → Autofill remplit le formulaire ; une fois connecté, la session Cloudity reste (refresh).
2. **Passkeys** : enregistrer une passkey Cloudity dans Bitwarden / Google Password Manager / gestionnaire Android (`WEBAUTHN_RP_ID=cloudity.delhomme.ovh`). Login sans MDP sur les apps qui supportent Conditional UI / `passkey_login`.
3. **Cloudity Pass** : optionnel (migration Proton, alias mail). Pas obligatoire si Bitwarden couvre déjà les sites tiers.
4. **Photos / Drive / Mail** : **pas** de second MDP — JWT + broker. Le PIN Photos « Verrouillé » protège seulement l’album sensible.

## 5. Ce qui reste à faire

- [ ] Autofill Android service pour **Cloudity Pass** (`PASS-AUTOFILL-ANDROID`) — utile si tu migres hors Bitwarden.
- [ ] Biométrie pour **rouvrir** l’app suite sans refresh réseau (device lock) — confort, pas un remplacement du refresh.
- [ ] Documenter dans l’UI login : « Utilise Bitwarden / ton gestionnaire pour le MDP et les passkeys ».

*2026-09-02.*
