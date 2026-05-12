module github.com/pavel/cloudity/pkg/dbpin

// dbpin — paquet Go partagé pour épingler une connexion PostgreSQL sur la
// durée d'une requête HTTP, afin que les variables de session (RLS,
// `app.current_user_id`, …) soient cohérentes entre middleware et handlers.
//
// Voir docs/architecture/BACKEND-LAYOUT.md (note dbpin) et
// docs/architecture/MULTI-REPO-LAYOUT.md § 4 (Phase 0) pour le contexte.

go 1.24
