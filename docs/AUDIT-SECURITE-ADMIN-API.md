# Audit sécurité — interface admin et API `/admin/*`

**Portée** : distinction entre **obfuscation UI** (`/4dm1n`) et **contrôles serveur** ; rôle de l’**api-gateway** et du **admin-service** ; pistes de durcissement.

**Références code** : `backend/api-gateway/main.go` (`adminAPIRequiresSession`, `authMiddleware`, `tokenHasAdminRole`), `frontend/apps/cloudity-web/src/AdminAccessGate.tsx`, paquet `frontend/packages/cloudity-shared` (`jwtRole.ts`).

---

## 1. Ce que l’URL `/4dm1n` apporte (et n’apporte pas)

- **Apporte** : réduction de l’énumération passive (un attaquant ne voit pas `/admin` dans le bundle utilisateur comme point d’entrée évident ; `/admin` est redirigé côté client vers `/4dm1n`).
- **N’apporte pas** : aucune authentification ni autorisation par elle-même. Qui connaît l’URL peut charger le **bundle admin** ; l’accès effectif repose sur la **session** (JWT stocké côté client) et sur les **réponses API**.

---

## 2. API Gateway — politique actuelle (source de vérité réseau)

Pour les requêtes dont le chemin est préfixé par `/admin` (hors exceptions ci-dessous) :

1. **OPTIONS** : pas d’exigence Bearer (préflight CORS).
2. **Exception métier** : `POST /admin/performance/pipeline-run` — la gateway **n’exige pas** le flux JWT admin (ingestion CI / en-tête dédié côté admin-service).
3. **Tout le reste sous `/admin`** :
   - **401** si pas de `Authorization: Bearer` ou token invalide / expiré (vérification **signature** avec la clé publique JWT).
   - **403** si le JWT est valide mais sans rôle **admin** (`role: admin` ou entrée équivalente dans `roles`).
   - En cas de succès, enrichissement des en-têtes `X-User-ID` / `X-Tenant-ID` pour le downstream.

**Routes mail « admin only »** (domaines, boîtes, alias) : même contrôle de rôle admin dans la gateway lorsque le client envoie un Bearer, même si le chemin n’est pas sous `/admin` — voir `isAdminOnlyMailRoute` dans `main.go`.

---

## 3. Admin-service (Python)

- Le service est derrière la gateway ; en **topologie Docker / réseau interne**, il n’est en principe **pas** exposé directement aux clients finaux.
- **Dette / défense en profondeur** : le code historique du admin-service peut **ne pas revérifier** le JWT sur chaque handler : la politique **autoritative** pour l’exposition Internet est donc celle de la **gateway**. Pour un niveau Zero Trust renforcé, il est recommandé d’**ajouter** au admin-service une validation JWT (ou mTLS inter-services) afin qu’un accès réseau interne compromis ne suffise pas.

---

## 4. Cohérence UI ↔ serveur

- **`AdminAccessGate`** : exige une session et un JWT dont le payload décodé contient le rôle admin (décodage **sans** vérifier la signature côté navigateur — usage **UX** seulement ; la sécurité réelle est la gateway).
- **`logout`** sur `/4dm1n` : redirection pleine page vers `/login` pour éviter un état React incohérent entre bundles.
- Les comptes de démo / production doivent émettre des JWT dont les **claims** alignent la gateway (`role` ou `roles` contenant `admin`).

---

## 5. Synthèse risques / recommandations

| Zone | État actuel | Recommandation |
|------|-------------|----------------|
| Appels `/admin/*` depuis Internet | JWT obligatoire + rôle admin (gateway) | Maintenir ; surveiller l’exception `pipeline-run`. |
| Admin-service interne | Confiance réseau + gateway | Valider JWT (ou mTLS) dans le service pour défense en profondeur. |
| UI `/4dm1n` | Obfuscation + garde client | Garder comme couche UX ; ne pas la confondre avec un contrôle d’accès. |
| Secrets / ingestion perf | Route dédiée | Documenter et restreindre les clés (`X-Cloudity-Perf-Ingest` ou équivalent) et l’exposition réseau. |

---

## 6. Vérifications manuelles rapides

- Sans header : `GET https://<gateway>/admin/tenants` → **401** JSON `authentication required for admin API`.
- Avec Bearer utilisateur non admin : **403** `admin role required`.
- Avec Bearer admin valide : proxy vers admin-service (codes métier habituels).

*Document aligné sur l’état du dépôt ; toute évolution de `authMiddleware` doit mettre à jour cette page.*
