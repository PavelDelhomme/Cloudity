// webauthn.go — Phase W2 : enregistrement et authentification passkeys (FIDO2).
//
// Périmètre Phase W2 (sprint Pass 2026-05, J5) :
//   - Enrôlement OUVERT à tout user authentifié (admin et user).
//   - **Quota 5 passkeys par user** (cf. `webauthnPerUserQuota`).
//   - **`residentKey: required` + `userVerification: preferred`** pour que les
//     password managers tiers (Proton Pass, Bitwarden, 1Password, iCloud
//     Keychain) acceptent d'enregistrer la passkey comme **discoverable
//     credential** (W3C `client-side discoverable`).
//   - Endpoint **`POST /auth/webauthn/login/begin-discoverable`** (sans email
//     préalable) — exploite `BeginDiscoverableLogin` de go-webauthn.
//     Compatible avec le **Conditional UI** côté front
//     (`autocomplete="username webauthn"`).
//
// Stockage :
//   - Credentials persistés dans `webauthn_credentials` (migration 37).
//   - Sessions/challenges WebAuthn stockés dans Redis avec TTL 5 min,
//     clé `webauthn:session:<sub>:<id>`. Challenge CSPRNG 32 octets,
//     usage unique (suppression à la lecture).
//
// Découpage des fichiers (≤ ~250 lignes chacun) :
//   - `webauthn.go`               : config + service + routes (ce fichier).
//   - `webauthn_user.go`          : `webauthnUser`, handle ↔ user_id, loadUser.
//   - `webauthn_session.go`       : sessions Redis (challenge + TTL).
//   - `webauthn_register.go`      : RegisterBegin / RegisterFinish + options.
//   - `webauthn_login.go`         : LoginBegin / Finish (regular + discoverable).
//   - `webauthn_credentials.go`   : ListCredentials / DeleteCredential / persist / bumpSignCount.
//   - `webauthn_auth.go`          : `requireAuthUser` (parse JWT Bearer).
package main

import (
	"database/sql"
	"log"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/redis/go-redis/v9"
)

// --- Configuration -----------------------------------------------------

// WebAuthnConfig regroupe les paramètres du Relying Party.
//
// RP ID = domaine (sans schéma, sans port) — les passkeys sont liées au RP ID.
// Origins = liste autorisée de schémas+host+port qui peuvent invoquer la
// cérémonie côté navigateur. En dev : http://localhost:6001, https://app.cloudity.local.
type WebAuthnConfig struct {
	RPDisplayName string
	RPID          string
	Origins       []string
}

// loadWebAuthnConfig lit la conf depuis l'environnement, avec des défauts dev.
//
//	WEBAUTHN_RP_ID         (def. "localhost")
//	WEBAUTHN_RP_NAME       (def. "Cloudity Admin")
//	WEBAUTHN_ORIGINS       (def. "http://localhost:6001,http://localhost:5173")
func loadWebAuthnConfig() WebAuthnConfig {
	cfg := WebAuthnConfig{
		RPDisplayName: getEnv("WEBAUTHN_RP_NAME", "Cloudity Admin"),
		RPID:          getEnv("WEBAUTHN_RP_ID", "localhost"),
	}
	origins := strings.TrimSpace(os.Getenv("WEBAUTHN_ORIGINS"))
	if origins == "" {
		origins = "http://localhost:6001,http://localhost:5173"
	}
	for _, o := range strings.Split(origins, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			cfg.Origins = append(cfg.Origins, o)
		}
	}
	return cfg
}

func getEnv(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

// --- WebAuthnService ---------------------------------------------------

type WebAuthnService struct {
	wa      *webauthn.WebAuthn
	db      *sql.DB
	rdb     *redis.Client
	authSvc *AuthService // pour réémission JWT après login passkey
}

// NewWebAuthnService construit un service prêt à câbler dans Gin.
// Retourne `nil` (avec un warn loggué) si la conf est invalide ; le router
// principal saute alors l'enregistrement des routes.
func NewWebAuthnService(cfg WebAuthnConfig, db *sql.DB, rdb *redis.Client, authSvc *AuthService) *WebAuthnService {
	wcfg := &webauthn.Config{
		RPDisplayName: cfg.RPDisplayName,
		RPID:          cfg.RPID,
		RPOrigins:     cfg.Origins,
	}
	wa, err := webauthn.New(wcfg)
	if err != nil {
		log.Printf("[auth-service] WebAuthn désactivé : %v", err)
		return nil
	}
	return &WebAuthnService{wa: wa, db: db, rdb: rdb, authSvc: authSvc}
}

// webauthnPerUserQuota borne le nombre de passkeys enregistrées par user.
// 5 = compromis pratique (téléphone + ordi perso + ordi pro + clé matérielle
// principale + clé matérielle de secours). Au-delà, l'utilisateur supprime
// d'abord depuis Settings.
const webauthnPerUserQuota = 5

// RegisterRoutes branche les endpoints de l'API WebAuthn sous /auth/webauthn.
//
// **Chemins user (Phase W2)** : `register/*` exige un Bearer valide (admin
// OU user). `login/begin` reste ouvert (pas de Bearer — c'est l'étape 1).
// `login/begin-discoverable` est ouvert également (Conditional UI au focus
// du champ email).
func (s *WebAuthnService) RegisterRoutes(r *gin.Engine) {
	if s == nil {
		return
	}
	r.POST("/auth/webauthn/register/begin", s.RegisterBegin)
	r.POST("/auth/webauthn/register/finish", s.RegisterFinish)
	r.POST("/auth/webauthn/login/begin", s.LoginBegin)
	r.POST("/auth/webauthn/login/finish", s.LoginFinish)
	// W2 : Conditional UI / discoverable credentials.
	r.POST("/auth/webauthn/login/begin-discoverable", s.LoginBeginDiscoverable)
	r.POST("/auth/webauthn/login/finish-discoverable", s.LoginFinishDiscoverable)
	r.GET("/auth/webauthn/credentials", s.ListCredentials)
	r.DELETE("/auth/webauthn/credentials/:id", s.DeleteCredential)
}
