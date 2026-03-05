# Connexion Gmail « comme BlueMail » — guide admin (reproductible)

Pour que les utilisateurs puissent **connecter leur Gmail en un clic** (« Se connecter avec Google »), sans mot de passe d’application, l’administrateur qui héberge Cloudity doit configurer l’OAuth Google **une seule fois**. Ensuite, le flux est identique à BlueMail : l’utilisateur clique, se connecte avec son compte Google, et la boîte est reliée.

---

## Ce que vous allez faire

1. Créer un projet (ou utiliser un existant) dans la **Google Cloud Console**.
2. Activer l’API Gmail et créer des **identifiants OAuth 2.0** (type « Application Web »).
3. Renseigner l’**URL de redirection** exacte de votre instance Cloudity.
4. Copier **Client ID** et **Client secret** dans les variables d’environnement du service Mail.
5. Redémarrer le service Mail.

Après ça, le bouton « Se connecter avec Google » dans la page Mail fonctionnera pour tous les utilisateurs de votre instance.

---

## Étapes détaillées (à suivre dans l’ordre)

### 1. Ouvrir la Google Cloud Console

- Allez sur : **https://console.cloud.google.com/**
- Connectez-vous avec le compte Google qui gérera le projet (un compte admin ou dédié).

### 2. Créer un projet (ou en choisir un)

- En haut à gauche : **Sélectionner un projet** → **Nouveau projet**.
- Nom du projet : par exemple **Cloudity** (ou le nom de votre instance).
- Validez **Créer**.

### 3. Activer l’API Gmail

- Menu ☰ → **APIs et services** → **Bibliothèque**.
- Recherchez **Gmail API**.
- Cliquez sur **Gmail API** → **Activer**.

### 4. Créer les identifiants OAuth 2.0

- Menu ☰ → **APIs et services** → **Identifiants**.
- **+ Créer des identifiants** → **ID client OAuth**.
- Si demandé, configurez l’**écran de consentement OAuth** :
  - Type d’application : **Externe** (sauf si vous avez un workspace Google).
  - Renseignez au minimum : **Nom de l’application** (ex. « Cloudity »), **E-mail d’assistance**, **Domaine** (optionnel).
  - Enregistrez et continuez.
- Type d’application : **Application Web**.
- **Nom** : par exemple « Cloudity Mail ».
- **URI de redirection autorisés** : ajoutez **exactement** l’URL de callback de votre instance, au format :
  - **En local** : `http://localhost:6080/mail/me/oauth/google/callback`
  - **En production** : `https://VOTRE-DOMAINE-API/mail/me/oauth/google/callback`  
    (remplacez `VOTRE-DOMAINE-API` par l’URL de votre API Cloudity, sans slash final.)
- Cliquez sur **Créer**.
- Une fenêtre s’ouvre avec **ID client** et **Secret client** : gardez cette fenêtre ouverte (ou notez-les).

### 5. Récupérer Client ID et Secret client

- Sur la page **Identifiants**, cliquez sur le nom de l’ID client que vous venez de créer.
- Vous voyez :
  - **ID client** : une longue chaîne du type `xxxxx.apps.googleusercontent.com`
  - **Secret client** : cliquez sur **Afficher** pour le révéler et le copier.

### 6. Configurer le service Mail Cloudity

Le service Mail (mail-directory-service) doit recevoir trois variables d’environnement. Selon votre déploiement :

**Docker / docker-compose**

Dans le fichier où vous définissez le service mail (par ex. `docker-compose.yml` ou `.env`) :

```env
GOOGLE_OAUTH_CLIENT_ID=votre-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=votre-secret-client
GOOGLE_OAUTH_REDIRECT_URI=https://VOTRE-DOMAINE-API/mail/me/oauth/google/callback
```

- **En local** pour les tests, utilisez :  
  `GOOGLE_OAUTH_REDIRECT_URI=http://localhost:6080/mail/me/oauth/google/callback`
- **En production**, utilisez la même URL que celle que vous avez mise dans « URI de redirection autorisés » à l’étape 4 (sans slash final).

**Important** : `GOOGLE_OAUTH_REDIRECT_URI` doit être **exactement** la même que l’URI enregistrée dans la Google Cloud Console (schéma, domaine, chemin, pas de slash final).

### 7. Redémarrer le service Mail

- Exemple en local : `make rebuild-mail` ou redémarrage du conteneur du service Mail.
- En production : redémarrez le conteneur ou le processus du service Mail pour qu’il relise les variables d’environnement.

### 8. Vérifier

- Ouvrez la page **Mail** de Cloudity (en étant connecté).
- Cliquez sur **« Se connecter avec Google »**.
- Vous devez être redirigé vers la page de connexion Google, puis après autorisation revenir sur Cloudity avec la boîte Gmail connectée.

Si vous voyez un message du type « La connexion Google n’est pas encore activée sur ce serveur », vérifiez que les trois variables sont bien définies et que le service Mail a été redémarré.

---

## Résumé des variables (pour copier-coller)

| Variable | Exemple | Obligatoire |
|----------|---------|-------------|
| `GOOGLE_OAUTH_CLIENT_ID` | `123456789-xxx.apps.googleusercontent.com` | Oui |
| `GOOGLE_OAUTH_CLIENT_SECRET` | `GOCSPX-xxxxxx` | Oui |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://api.mondomaine.com/mail/me/oauth/google/callback` | Oui |

Une seule configuration par instance : une fois en place, tous les utilisateurs peuvent utiliser « Se connecter avec Google » sans rien configurer de leur côté.

---

## Alternative : mot de passe d’application (sans OAuth)

Si vous ne souhaitez pas configurer OAuth, les utilisateurs peuvent toujours ajouter leur Gmail via **« + Ajouter une boîte »** en utilisant un **mot de passe d’application** Google (comme pour Thunderbird ou BlueMail en mode « compte existant ») :

1. [Mots de passe des applications Google](https://myaccount.google.com/apppasswords)
2. Créer un mot de passe pour « Mail », le copier.
3. Dans Cloudity : Ajouter une boîte → adresse Gmail + ce mot de passe.

Aucune configuration côté serveur dans ce cas.
