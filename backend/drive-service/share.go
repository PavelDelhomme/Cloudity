package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"html"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func ensureDriveShareSchema(db *sql.DB) {
	if db == nil {
		return
	}
	stmts := []string{
		`ALTER TABLE drive_nodes ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE drive_nodes ADD COLUMN IF NOT EXISTS share_token TEXT`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_nodes_share_token ON drive_nodes (share_token) WHERE share_token IS NOT NULL AND share_token <> ''`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			log.Printf("drive share schema: %v", err)
		}
	}
}

func newShareToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func (h *Handler) listStarredNodes(c *gin.Context) {
	h.listNodesByFilter(c, `n.starred = true AND n.deleted_at IS NULL`)
}

func (h *Handler) listSharedNodes(c *gin.Context) {
	h.listNodesByFilter(c, `n.share_token IS NOT NULL AND n.share_token <> '' AND n.deleted_at IS NULL`)
}

func (h *Handler) listNodesByFilter(c *gin.Context, where string) {
	if h.db == nil {
		c.JSON(http.StatusOK, []Node{})
		return
	}
	ctx := c.Request.Context()
	rows, err := h.dbex(ctx).Query(`
		SELECT n.id, n.tenant_id, n.user_id, n.parent_id, n.name, n.is_folder, n.size, n.mime_type, n.created_at::text, COALESCE(n.updated_at::text, ''),
			n.vault_encrypted, n.is_vault_folder,
			(SELECT COUNT(*) FROM drive_nodes c WHERE c.parent_id = n.id AND c.deleted_at IS NULL),
			(SELECT COUNT(*) FROM drive_nodes c WHERE c.parent_id = n.id AND c.is_folder = true AND c.deleted_at IS NULL),
			(SELECT COUNT(*) FROM drive_nodes c WHERE c.parent_id = n.id AND c.is_folder = false AND c.deleted_at IS NULL),
			n.starred, COALESCE(n.share_token, '')
		FROM drive_nodes n
		WHERE n.user_id = current_setting('app.current_user_id', true)::INTEGER AND ` + where + `
		ORDER BY n.is_folder DESC, n.updated_at DESC, n.name
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	list := scanShareAwareNodes(rows)
	c.JSON(http.StatusOK, list)
}

func scanShareAwareNodes(rows *sql.Rows) []Node {
	list := make([]Node, 0)
	for rows.Next() {
		var n Node
		var parent sql.NullInt64
		var mime sql.NullString
		var token string
		if err := rows.Scan(&n.ID, &n.TenantID, &n.UserID, &parent, &n.Name, &n.IsFolder, &n.Size, &mime, &n.CreatedAt, &n.UpdatedAt,
			&n.VaultEncrypted, &n.IsVaultFolder, &n.ChildCount, &n.ChildFolders, &n.ChildFiles, &n.Starred, &token); err != nil {
			continue
		}
		if parent.Valid {
			v := int(parent.Int64)
			n.ParentID = &v
		}
		if mime.Valid {
			s := mime.String
			n.MimeType = &s
		}
		if token != "" {
			n.ShareToken = token
		}
		list = append(list, n)
	}
	return list
}

func (h *Handler) starNode(c *gin.Context) {
	h.setNodeStarred(c, true)
}

func (h *Handler) unstarNode(c *gin.Context) {
	h.setNodeStarred(c, false)
}

func (h *Handler) setNodeStarred(c *gin.Context, starred bool) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	ctx := c.Request.Context()
	res, err := h.dbex(ctx).Exec(`
		UPDATE drive_nodes SET starred = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND deleted_at IS NULL
	`, starred, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	aff, _ := res.RowsAffected()
	if aff == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id, "starred": starred})
}

func (h *Handler) createShare(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	ctx := c.Request.Context()
	var existing sql.NullString
	err := h.dbex(ctx).QueryRow(`
		SELECT share_token FROM drive_nodes
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND deleted_at IS NULL
	`, id).Scan(&existing)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	token := strings.TrimSpace(existing.String)
	if token == "" {
		token, err = newShareToken()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "token"})
			return
		}
		if _, err := h.dbex(ctx).Exec(`
			UPDATE drive_nodes SET share_token = $1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2 AND user_id = current_setting('app.current_user_id', true)::INTEGER
		`, token, id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"id":          id,
		"token":       token,
		"share_token": token,
		"url":         "/drive/share/" + token,
	})
}

func (h *Handler) revokeShare(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	ctx := c.Request.Context()
	res, err := h.dbex(ctx).Exec(`
		UPDATE drive_nodes SET share_token = NULL, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND deleted_at IS NULL
	`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	aff, _ := res.RowsAffected()
	if aff == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id, "share_token": ""})
}

func wantsPublicShareHTML(c *gin.Context) bool {
	if strings.EqualFold(strings.TrimSpace(c.Query("format")), "json") {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(c.Query("preview")), "1") {
		return true
	}
	accept := strings.ToLower(c.GetHeader("Accept"))
	if strings.Contains(accept, "text/html") && !strings.Contains(accept, "application/json") {
		return true
	}
	return false
}

func publicSharePreviewKind(name string, mime *string) string {
	ct := ""
	if mime != nil {
		ct = strings.ToLower(strings.TrimSpace(*mime))
		if i := strings.Index(ct, ";"); i > 0 {
			ct = strings.TrimSpace(ct[:i])
		}
	}
	if inf := mimeFromFileName(name); (ct == "" || ct == "application/octet-stream") && inf != "" {
		ct = inf
	}
	if strings.HasPrefix(ct, "image/") {
		return "image"
	}
	if ct == "application/pdf" || strings.HasSuffix(strings.ToLower(name), ".pdf") {
		return "pdf"
	}
	if strings.HasPrefix(ct, "text/") || ct == "application/json" || ct == "application/xml" {
		return "text"
	}
	if strings.HasPrefix(ct, "audio/") {
		return "audio"
	}
	if strings.HasPrefix(ct, "video/") {
		return "video"
	}
	return "file"
}

func writePublicShareHTML(c *gin.Context, n Node, children []Node) {
	kind := "folder"
	if !n.IsFolder {
		kind = publicSharePreviewKind(n.Name, n.MimeType)
	}
	esc := html.EscapeString
	name := esc(n.Name)
	token := esc(n.ShareToken)
	contentURL := "/drive/share/" + token + "/content?inline=1"
	downloadURL := "/drive/share/" + token + "/content?download=1"
	sizeLabel := ""
	if n.Size > 0 {
		sizeLabel = fmt.Sprintf(" · %d Ko", (n.Size+1023)/1024)
		if n.Size >= 1024*1024 {
			sizeLabel = fmt.Sprintf(" · %.1f Mo", float64(n.Size)/(1024*1024))
		}
	}
	var preview strings.Builder
	switch kind {
	case "image":
		preview.WriteString(`<img class="preview" src="` + contentURL + `" alt="` + name + `" />`)
	case "pdf":
		preview.WriteString(`<iframe class="preview" title="` + name + `" src="` + contentURL + `"></iframe>`)
	case "audio":
		preview.WriteString(`<audio class="media" controls src="` + contentURL + `"></audio>`)
	case "video":
		preview.WriteString(`<video class="media" controls src="` + contentURL + `"></video>`)
	case "text":
		preview.WriteString(`<iframe class="preview text" title="` + name + `" src="` + contentURL + `"></iframe>`)
	case "folder":
		if len(children) == 0 {
			preview.WriteString(`<p class="muted">Dossier vide.</p>`)
		} else {
			preview.WriteString(`<ul class="folder">`)
			for _, ch := range children {
				label := "fichier"
				if ch.IsFolder {
					label = "dossier"
				}
				preview.WriteString(`<li><span>` + esc(ch.Name) + `</span><small>` + label + `</small></li>`)
			}
			preview.WriteString(`</ul><p class="muted">Pour ouvrir un fichier, créez un lien de partage sur ce fichier.</p>`)
		}
	default:
		preview.WriteString(`<p class="muted">Aperçu non disponible pour ce format. Téléchargez le fichier.</p>`)
	}
	dl := ""
	if !n.IsFolder {
		dl = `<a class="btn" href="` + downloadURL + `">Télécharger</a>`
	}
	page := `<!doctype html>
<html lang="fr">
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>` + name + ` — Hubera Drive</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; font-family: system-ui, sans-serif; background:#0f172a; color:#e2e8f0; }
  header { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1rem 1.25rem; border-bottom:1px solid #1e293b; }
  h1 { font-size:1.05rem; margin:0; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .meta { color:#94a3b8; font-size:.85rem; }
  .btn { background:#2563eb; color:#fff; text-decoration:none; padding:.55rem .9rem; border-radius:.6rem; font-weight:600; font-size:.9rem; }
  main { padding:1.25rem; max-width:72rem; margin:0 auto; }
  .preview { width:100%; min-height:70vh; border:0; border-radius:.75rem; background:#020617; object-fit:contain; }
  .preview.text { background:#fff; }
  .media { width:100%; max-height:70vh; }
  .folder { list-style:none; padding:0; margin:0; }
  .folder li { display:flex; justify-content:space-between; gap:1rem; padding:.7rem .85rem; border-bottom:1px solid #1e293b; }
  .muted { color:#94a3b8; }
</style>
<header>
  <div>
    <div class="meta">Hubera Drive · lien partagé</div>
    <h1>` + name + `</h1>
    <div class="meta">` + esc(kind) + sizeLabel + `</div>
  </div>
  ` + dl + `
</header>
<main>` + preview.String() + `</main>
</html>`
	c.Header("Cache-Control", "no-store")
	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(page))
}

func (h *Handler) getPublicShare(c *gin.Context) {
	token := strings.TrimSpace(c.Param("token"))
	if len(token) < 16 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var n Node
	var mime sql.NullString
	err := h.db.QueryRow(`
		SELECT id, name, is_folder, size, mime_type
		FROM drive_nodes
		WHERE share_token = $1 AND deleted_at IS NULL
	`, token).Scan(&n.ID, &n.Name, &n.IsFolder, &n.Size, &mime)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if mime.Valid {
		s := mime.String
		n.MimeType = &s
	}
	n.ShareToken = token
	var children []Node
	if n.IsFolder && wantsPublicShareHTML(c) {
		rows, qerr := h.db.Query(`
			SELECT name, is_folder, size FROM drive_nodes
			WHERE parent_id = $1 AND deleted_at IS NULL
			ORDER BY is_folder DESC, name ASC LIMIT 200
		`, n.ID)
		if qerr == nil {
			defer rows.Close()
			for rows.Next() {
				var ch Node
				if rows.Scan(&ch.Name, &ch.IsFolder, &ch.Size) == nil {
					children = append(children, ch)
				}
			}
		}
	}
	if wantsPublicShareHTML(c) {
		writePublicShareHTML(c, n, children)
		return
	}
	c.JSON(http.StatusOK, n)
}

func (h *Handler) getPublicShareContent(c *gin.Context) {
	token := strings.TrimSpace(c.Param("token"))
	if len(token) < 16 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var name string
	var content []byte
	var mime sql.NullString
	var vaultEncrypted bool
	err := h.db.QueryRow(`
		SELECT name, COALESCE(content, ''::bytea), mime_type, vault_encrypted
		FROM drive_nodes
		WHERE share_token = $1 AND is_folder = false AND deleted_at IS NULL
	`, token).Scan(&name, &content, &mime, &vaultEncrypted)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if vaultEncrypted {
		c.JSON(http.StatusForbidden, gin.H{"error": "fichier coffre — lien public indisponible"})
		return
	}
	ct := "application/octet-stream"
	if mime.Valid && strings.TrimSpace(mime.String) != "" {
		ct = strings.TrimSpace(mime.String)
	}
	if inf := mimeFromFileName(name); (ct == "application/octet-stream" || ct == "") && inf != "" {
		ct = inf
	}
	wantDownload := strings.EqualFold(strings.TrimSpace(c.Query("download")), "1")
	c.Header("Content-Disposition", publicShareDisposition(name, ct, wantDownload)+`; filename="`+dispositionFilename(name)+`"`)
	c.Data(http.StatusOK, ct, content)
}

func publicShareDisposition(name, contentType string, forceDownload bool) string {
	if forceDownload {
		return "attachment"
	}
	baseCT := strings.ToLower(strings.TrimSpace(contentType))
	if i := strings.Index(baseCT, ";"); i > 0 {
		baseCT = strings.TrimSpace(baseCT[:i])
	}
	if inf := mimeFromFileName(name); (baseCT == "" || baseCT == "application/octet-stream") && inf != "" {
		baseCT = inf
	}
	if strings.HasPrefix(baseCT, "image/") || strings.HasPrefix(baseCT, "text/") ||
		strings.HasPrefix(baseCT, "audio/") || strings.HasPrefix(baseCT, "video/") ||
		baseCT == "application/pdf" || baseCT == "application/json" || baseCT == "application/xml" ||
		strings.HasSuffix(strings.ToLower(name), ".pdf") {
		return "inline"
	}
	return "attachment"
}

func (h *Handler) headPublicShare(c *gin.Context) {
	token := strings.TrimSpace(c.Param("token"))
	if len(token) < 16 {
		c.Status(http.StatusNotFound)
		return
	}
	if h.db == nil {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	var id int
	err := h.db.QueryRow(`
		SELECT id FROM drive_nodes
		WHERE share_token = $1 AND deleted_at IS NULL
	`, token).Scan(&id)
	if err == sql.ErrNoRows {
		c.Status(http.StatusNotFound)
		return
	}
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	c.Status(http.StatusOK)
}

func (h *Handler) headPublicShareContent(c *gin.Context) {
	token := strings.TrimSpace(c.Param("token"))
	if len(token) < 16 {
		c.Status(http.StatusNotFound)
		return
	}
	if h.db == nil {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	var name string
	var size int64
	var mime sql.NullString
	var vaultEncrypted bool
	err := h.db.QueryRow(`
		SELECT name, COALESCE(octet_length(content), 0), mime_type, vault_encrypted
		FROM drive_nodes
		WHERE share_token = $1 AND is_folder = false AND deleted_at IS NULL
	`, token).Scan(&name, &size, &mime, &vaultEncrypted)
	if err == sql.ErrNoRows {
		c.Status(http.StatusNotFound)
		return
	}
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	if vaultEncrypted {
		c.Status(http.StatusForbidden)
		return
	}
	ct := "application/octet-stream"
	if mime.Valid && strings.TrimSpace(mime.String) != "" {
		ct = strings.TrimSpace(mime.String)
	}
	if inf := mimeFromFileName(name); (ct == "application/octet-stream" || ct == "") && inf != "" {
		ct = inf
	}
	c.Header("Content-Disposition", `attachment; filename="`+dispositionFilename(name)+`"`)
	c.Header("Content-Type", ct)
	c.Header("Content-Length", strconv.FormatInt(size, 10))
	c.Status(http.StatusOK)
}
