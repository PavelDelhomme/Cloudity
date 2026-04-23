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

Tests hôte : `cd mobile/mail && flutter test`. E2E device : `integration_test/mail_flow_test.dart` (voir **`docs/TESTS.md`** § 1b).
