package main

import "os"
import "strings"

// effectiveRole promeut le propriétaire listé dans la config déjà prévue
// (SEED_ADMIN_EMAIL, ADMIN_EMAILS, DEV_QUICK_LOGIN_ADMIN_EMAIL).
// Une autre adresse garde le rôle en base. Rien n’est écrit en dur.
func effectiveRole(email, dbRole string) string {
	role := strings.TrimSpace(dbRole)
	if role == "" {
		role = "user"
	}
	if _, ok := ownerAdminSet()[normalizeAuthEmail(email)]; ok {
		return "admin"
	}
	return role
}

func ownerAdminSet() map[string]struct{} {
	raw := strings.Join([]string{
		os.Getenv("SEED_ADMIN_EMAIL"),
		os.Getenv("ADMIN_EMAILS"),
		os.Getenv("DEV_QUICK_LOGIN_ADMIN_EMAIL"),
	}, ",")
	out := map[string]struct{}{}
	for _, part := range strings.Split(raw, ",") {
		e := normalizeAuthEmail(part)
		if e == "" || !strings.Contains(e, "@") {
			continue
		}
		out[e] = struct{}{}
	}
	return out
}
