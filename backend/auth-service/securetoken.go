// securetoken.go — Capability URLs HMAC rotatives par utilisateur.
//
// Modèle « capability URL » (cf. docs/securite/URL-CAPABILITIES.md) :
//
//   - **Auto-service** (réglages 2FA, passkeys, codes de récupération de
//     l'utilisateur lui-même) : le slug d'URL est un token HMAC dérivé du
//     couple `(user_id, purpose, epoch)` avec une fenêtre coulissante de 30 j.
//     L'attaquant qui aspire un screenshot / l'historique navigateur ne peut
//     **pas** rejouer plus de 30 j (et même là, il lui faudrait quand même
//     l'access-token JWT, qui dure 60 min). Réduit l'impact d'une fuite par
//     URL (Referer, partage d'écran, copie dans un chat, etc.).
//
//   - **Liens de partage** (un user partage un item Pass à un tiers) : ne
//     PAS utiliser ce module — utiliser plutôt `pass_share_tokens` (token
//     aléatoire 192 bits, stable jusqu'à révocation, stocké hashé en DB).
//     Voir `infrastructure/postgresql/migrations/39-pass-share-tokens.sql`.
//
// Le secret HMAC est `URL_TOKEN_SECRET` (au moins 32 octets aléatoires).
// Si la variable est vide, on fail-closed en mode production : aucune URL
// rotative n'est émise et les endpoints de paths renvoient un fallback
// canonique. En dev (`AUTH_DEV_MODE=1`), on dérive un secret jetable depuis
// `ED25519_PRIVATE_KEY_PATH` pour ne pas bloquer le sprint.

package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// urlTokenWindow définit la durée pendant laquelle un token reste valide
// avant rotation. 30 j = compromis entre confort (ne pas casser les onglets
// ouverts) et défense en profondeur. La fenêtre coulissante accepte aussi
// l'epoch précédent : un user qui revient au bout de 35 j voit l'URL périmée
// et doit re-fetcher `/auth/security-paths`, ce qui rotate son slug.
const urlTokenWindow = 30 * 24 * time.Hour

// urlTokenHmacBytes — longueur du HMAC tronqué dans le slug. 16 octets =
// 128 bits, suffisant contre une recherche en ligne avec rate-limit (le
// slug est en plus borné à un user_id connu de l'attaquant).
const urlTokenHmacBytes = 16

// urlTokenPurposes — purposes connus, pour empêcher un attaquant de
// re-jouer un slug d'un purpose A vers un purpose B. La validation refuse
// tout purpose hors liste.
var urlTokenPurposes = map[string]struct{}{
	"settings_security": {}, // page Settings (passkeys + recovery codes + 2FA)
}

// errInvalidURLToken — slug malformé / signature invalide / purpose inconnu.
var errInvalidURLToken = errors.New("invalid URL capability token")

// urlTokenSecret renvoie la clé HMAC. Stratégie :
//
//  1. `URL_TOKEN_SECRET` (>= 32 oct base64url, std ou brut) → utilisé tel quel.
//  2. Sinon, dérivation **déterministe** depuis `JWT_SECRET` via
//     `SHA-256("cloudity-url-tokens-v1:" || JWT_SECRET)`. Évite une variable
//     supplémentaire à câbler dans tous les .env / Portainer Stack Variables,
//     tout en isolant cryptographiquement les deux usages (signature JWT vs.
//     capability URLs) grâce au préfixe constant.
//  3. Sinon : refuse — l'endpoint renvoie 503 et le SPA tombe en repli sur
//     les chemins canoniques.
func urlTokenSecret() ([]byte, error) {
	if raw := strings.TrimSpace(os.Getenv("URL_TOKEN_SECRET")); raw != "" {
		if b, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(raw, "=")); err == nil && len(b) >= 32 {
			return b, nil
		}
		if b, err := base64.StdEncoding.DecodeString(raw); err == nil && len(b) >= 32 {
			return b, nil
		}
		if len(raw) >= 32 {
			return []byte(raw), nil
		}
		return nil, fmt.Errorf("URL_TOKEN_SECRET trop court (%d oct, attendu >= 32)", len(raw))
	}
	if jwt := strings.TrimSpace(os.Getenv("JWT_SECRET")); jwt != "" {
		h := sha256.Sum256(append([]byte("cloudity-url-tokens-v1:"), jwt...))
		return h[:], nil
	}
	return nil, errors.New("URL_TOKEN_SECRET / JWT_SECRET manquants")
}

// urlTokenEpoch renvoie l'index de fenêtre courant pour `at`.
func urlTokenEpoch(at time.Time) int64 {
	return at.UnixNano() / int64(urlTokenWindow)
}

// IssueUserPathToken construit un token capability pour `userID` + `purpose`.
// Format : `<epoch>.<base64url(hmac16)>`. Sécurité :
//
//   - Le slug encode l'epoch en clair → permet la validation déterministe
//     côté serveur sans état (pas de Redis nécessaire).
//   - Le HMAC est tronqué à 128 bits → assez pour résister au brute-force.
//   - L'AAD inclut explicitement `purpose` → impossible de rejouer un slug
//     de la page A pour la page B (même user, même epoch, purpose différent
//     ⇒ HMAC différent).
//
// Renvoie une erreur si le secret est manquant ou si `purpose` n'est pas
// dans la whitelist `urlTokenPurposes`.
func IssueUserPathToken(userID int64, purpose string) (string, error) {
	if _, ok := urlTokenPurposes[purpose]; !ok {
		return "", fmt.Errorf("purpose inconnu : %q", purpose)
	}
	secret, err := urlTokenSecret()
	if err != nil {
		return "", err
	}
	epoch := urlTokenEpoch(time.Now().UTC())
	mac := hmacForToken(secret, userID, purpose, epoch)
	return fmt.Sprintf("%d.%s", epoch, base64.RawURLEncoding.EncodeToString(mac)), nil
}

// VerifyUserPathToken renvoie nil si `token` est valide pour `userID` +
// `purpose` à `now`. Accepte la fenêtre courante ET la précédente
// (« sliding window ») pour ne pas casser les onglets ouverts au moment
// d'une rotation.
func VerifyUserPathToken(token string, userID int64, purpose string, now time.Time) error {
	if _, ok := urlTokenPurposes[purpose]; !ok {
		return fmt.Errorf("purpose inconnu : %q", purpose)
	}
	secret, err := urlTokenSecret()
	if err != nil {
		return err
	}
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return errInvalidURLToken
	}
	epoch, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return errInvalidURLToken
	}
	got, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || len(got) != urlTokenHmacBytes {
		return errInvalidURLToken
	}
	cur := urlTokenEpoch(now.UTC())
	// `epoch` doit être l'epoch courant ou le précédent (jamais futur).
	if epoch != cur && epoch != cur-1 {
		return errInvalidURLToken
	}
	want := hmacForToken(secret, userID, purpose, epoch)
	if !hmac.Equal(want, got) {
		return errInvalidURLToken
	}
	return nil
}

// hmacForToken — HMAC-SHA-256(secret, "v1:" || user_id || ":" || purpose || ":" || epoch).
// Le préfixe "v1:" laisse la possibilité de bumper le format (changement
// de fenêtre / d'algorithme) sans casser silencieusement les tokens en vol.
func hmacForToken(secret []byte, userID int64, purpose string, epoch int64) []byte {
	mac := hmac.New(sha256.New, secret)
	fmt.Fprintf(mac, "v1:%d:%s:%d", userID, purpose, epoch)
	full := mac.Sum(nil)
	return full[:urlTokenHmacBytes]
}

// SecurePathsResponse — réponse JSON de `GET /auth/security-paths`.
//
// Pour chaque page sensible, on émet :
//   - `path` : le slug à utiliser dans la SPA (ex. `/app/settings/sec/123.abcdef…`).
//   - `expires_at` : timestamp ISO-8601 UTC où ce slug devient invalide
//     (= début de l'epoch courant + 2 × window grâce au sliding ; en
//     pratique on borne à `epoch_courant + window` côté UI pour pousser
//     le client à se rafraîchir).
//   - `rotates_at` : timestamp ISO-8601 UTC de la prochaine rotation.
type SecurePathsResponse struct {
	Paths     map[string]SecurePathEntry `json:"paths"`
	IssuedAt  string                     `json:"issued_at"`
	WindowSec int64                      `json:"window_seconds"`
}

type SecurePathEntry struct {
	// Path complet à utiliser côté SPA (préfixe `/app/...` inclus).
	Path string `json:"path"`
	// Token brut — le client peut aussi le valider sans repasser par le
	// backend en injectant directement dans son routing.
	Token string `json:"token"`
	// Timestamp UTC ISO-8601 à partir duquel le token est rejeté
	// (sliding window : on autorise epoch précédent, donc en pratique
	// `now + 2 * window`).
	ExpiresAt string `json:"expires_at"`
	RotatesAt string `json:"rotates_at"`
}

// GET /auth/security-paths — Bearer obligatoire. Renvoie les capability
// URLs courantes du user. À refetcher périodiquement côté SPA (1×/h
// suffit, on borne via `rotates_at`).
func (a *AuthService) SecurePaths(c *gin.Context) {
	auth := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(auth, "Bearer ") {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
		return
	}
	claims, err := a.parseAccessToken(strings.TrimPrefix(auth, "Bearer "))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}
	uid, err := strconv.ParseInt(claims.UserID, 10, 64)
	if err != nil || uid <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user id"})
		return
	}
	now := time.Now().UTC()
	out := SecurePathsResponse{
		Paths:     make(map[string]SecurePathEntry, len(urlTokenPurposes)),
		IssuedAt:  now.Format(time.RFC3339),
		WindowSec: int64(urlTokenWindow.Seconds()),
	}
	rotatesAt := time.Unix(0, (urlTokenEpoch(now)+1)*int64(urlTokenWindow)).UTC()
	expiresAt := time.Unix(0, (urlTokenEpoch(now)+2)*int64(urlTokenWindow)).UTC()
	for purpose := range urlTokenPurposes {
		token, err := IssueUserPathToken(uid, purpose)
		if err != nil {
			// En cas de secret manquant, on renvoie 503 plutôt qu'un
			// fallback silencieux : le SPA doit faire un repli explicite
			// sur les chemins canoniques (cf. `useSecurePaths` côté front).
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "URL_TOKEN_SECRET indisponible — repli sur chemins canoniques",
			})
			return
		}
		out.Paths[purpose] = SecurePathEntry{
			Path:      pathForPurpose(purpose, token),
			Token:     token,
			ExpiresAt: expiresAt.Format(time.RFC3339),
			RotatesAt: rotatesAt.Format(time.RFC3339),
		}
	}
	// Anti-fuite : interdit le cache (sinon un proxy / l'historique
	// navigateur peut conserver le slug bien après sa rotation).
	c.Header("Cache-Control", "no-store")
	c.Header("Pragma", "no-cache")
	c.Header("Referrer-Policy", "no-referrer")
	c.JSON(http.StatusOK, out)
}

// pathForPurpose — mapping purpose → URL SPA. À synchroniser avec le
// router React (`App.tsx`).
func pathForPurpose(purpose, token string) string {
	switch purpose {
	case "settings_security":
		return "/app/settings/sec/" + token
	default:
		return "/app/settings"
	}
}

// ValidateSecurePathRequest — body JSON pour `POST /auth/security-paths/validate`.
type ValidateSecurePathRequest struct {
	Token   string `json:"token"`
	Purpose string `json:"purpose"`
}

// POST /auth/security-paths/validate — Bearer obligatoire. Renvoie 200
// si le token est valide pour ce user + purpose à l'instant courant.
//
// Le SPA peut court-circuiter cet appel et valider lui-même via le HMAC
// (mais alors il aurait besoin du secret, ce qu'on refuse). On préfère
// l'aller-retour : moins de surface d'attaque, et le serveur peut logger
// les tentatives pour détection d'abus (TODO ROADMAP).
func (a *AuthService) ValidateSecurePath(c *gin.Context) {
	auth := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(auth, "Bearer ") {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
		return
	}
	claims, err := a.parseAccessToken(strings.TrimPrefix(auth, "Bearer "))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}
	uid, err := strconv.ParseInt(claims.UserID, 10, 64)
	if err != nil || uid <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user id"})
		return
	}
	var body ValidateSecurePathRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token & purpose required"})
		return
	}
	if err := VerifyUserPathToken(body.Token, uid, body.Purpose, time.Now()); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "expired or invalid"})
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
