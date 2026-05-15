# TODOS — suivi court

**Rôle** : liste **légère** de correctifs et suites immédiates. Le détail produit, jalons et dettes longues restent dans **[BACKLOG.md](./BACKLOG.md)** et **[STATUS.md](./STATUS.md)** (section *À faire maintenant* ; historique détaillé : **[docs/operations/STATUS-JOURNAL-ARCHIVE.md](docs/operations/STATUS-JOURNAL-ARCHIVE.md)**).

## Avant chaque session

Ordre recommandé : **[docs/operations/DEV-VERIFICATION.md](docs/operations/DEV-VERIFICATION.md) § 0** — en résumé : `docker info` → **`make test`** → (optionnel) E2E, `flutter test` sous `mobile/pass`, validation `compose` si YAML touché.

---

## URL-CAPABILITIES — correctifs documentation & UX

> Référence : **[docs/securite/URL-CAPABILITIES.md](docs/securite/URL-CAPABILITIES.md)** (§ 2.2 fenêtre coulissante, § 2.4 frontend, threat model § 1).

- [x] § 2.2 **sliding window** : clarifier que la protection temporelle cible surtout les **fuites passives** long terme (historique, screenshot, bookmark archivé), **pas** un attaquant actif avec slug + JWT valide à J+0 ; un **slug seul** ne suffit jamais — défense active = **JWT Bearer** (durée courte) + **rate-limit** sur `/auth/security-paths/validate`.
- [x] Implémenter **re-fetch proactif** `useSecurePaths` à **`rotates_at - 5 min`** (`invalidateQueries` + `useEffect`, 2026-05-16).
- [x] **Confirmer en test** : garde-fou Vitest **`src/security/ucQa01SlugIsolation.test.ts`** (pas de `/app/settings/sec/` ni `useSecurePaths` dans **`api.ts`**) — compléter par **E2E / manuel** si besoin (parcours mail + drive avec slug rotatif actif).
