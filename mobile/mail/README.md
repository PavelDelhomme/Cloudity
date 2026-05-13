# Cloudity Mail (Flutter)

Client mobile **MVP** pour la suite Cloudity : même **JWT** et **api-gateway** que le web.

## Fonctionnalités actuelles

- Connexion (email, mot de passe, tenant, URL gateway).
- **Plusieurs comptes** IMAP reliés au même utilisateur : sélecteur en barre d’app (si > 1 boîte).
- **Dossiers** : Réception, Envoyés, Brouillons, Spam, Corbeille, Archive + **dossiers IMAP** supplémentaires issus du résumé serveur (`folders/summary`).
- Liste des messages (non-lus en **gras**), icône **pièces jointes** si `attachment_count > 0`.
- **Détail** d’un message : sujet, expéditeur, corps texte, liste des PJ (noms / types — pas de téléchargement fichier dans cette version).
- **Lu** : ouverture du détail envoie **`PATCH …/messages/:id/read`** avec `{"read":true}` si le message était non lu ; retour sur la liste rafraîchit compteurs et le style **non lu** (gras).
- **Pièces jointes** : tap sur une ligne PJ → téléchargement via gateway → fichier temporaire → **feuille de partage** (enregistrer / ouvrir avec une autre app).
- **Nouveau message** : icône crayon dans la barre → **À / Objet / Corps** ; **`POST /mail/me/send`** (mot de passe SMTP **optionnel** si le secret n’est pas déjà stocké pour la boîte). Pas de brouillon **serveur** dans cette version.
- **Tests** : `flutter test` inclut **`test/mail_validation_test.dart`** (validation destinataire).

## Commandes

À la racine du monorepo :

```bash
make run-mobile APP=Mail
make test-mobile-mail
```

Tests hôte : `cd mobile/mail && flutter test`. E2E device : `integration_test/mail_flow_test.dart` (voir **`docs/operations/TESTS.md`** § 1b).

## Cibles plateformes

| Cible | Présent ? | Notes |
|---|---|---|
| `android/` | ✅ | cible primaire actuelle |
| `ios/` | 🟡 | scaffold Flutter présent, jamais testé sur device |
| `linux/` | ❌ **manquant** | à scaffolder par `flutter create --platforms=linux .` quand on démarre l'app desktop Linux Mail (cf. [`docs/produit/MULTI-PLATEFORME.md`](../../docs/produit/MULTI-PLATEFORME.md) MP-03) |
| `macos/` / `windows/` | ❌ | hors scope court terme |

## Sécurité — flow 2FA mobile

Depuis 2026-05-13 (J7 ter sprint Pass), `mobile/mail` supporte le
flow **2FA TOTP / recovery code** (parité avec le web) via
`Auth2FAClient` du package `cloudity_shared`. Quand le serveur répond
`requires_2fa: true` au login, l'écran bascule sur un formulaire dédié
qui accepte un code 6 chiffres (TOTP) ou 12 caractères (recovery).
Voir [`docs/securite/URL-CAPABILITIES.md`](../../docs/securite/URL-CAPABILITIES.md)
§ 7.
