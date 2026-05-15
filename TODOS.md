# TODOS — suivi court

**Rôle** : liste **légère** de correctifs et suites immédiates. Le détail produit, jalons et dettes longues restent dans **[BACKLOG.md](./BACKLOG.md)** et **[STATUS.md](./STATUS.md)**.

---

## URL-CAPABILITIES — correctifs documentation & UX

> Référence : **[docs/securite/URL-CAPABILITIES.md](docs/securite/URL-CAPABILITIES.md)** (§ 2.2 fenêtre coulissante, § 2.4 frontend, threat model § 1).

- [x] § 2.2 **sliding window** : clarifier que la protection temporelle cible surtout les **fuites passives** long terme (historique, screenshot, bookmark archivé), **pas** un attaquant actif avec slug + JWT valide à J+0 ; un **slug seul** ne suffit jamais — défense active = **JWT Bearer** (durée courte) + **rate-limit** sur `/auth/security-paths/validate`.
- [ ] Implémenter **re-fetch proactif** `useSecurePaths` à **`rotates_at - 5 min`** (aujourd’hui on s’appuie surtout sur `staleTime` = 30 min — risque de **flash UX** bénin si l’utilisateur reste sur une URL slug obsolète).
- [ ] **Confirmer en test** que les opérations courantes (**upload/download** drive-service / photos-service, **mail** en rédaction via mail-directory / API, **notes**) n’utilisent **que** le **JWT Bearer** — **aucune** dépendance au slug Settings ; rotation du slug = **zéro impact** sur ces flux.
