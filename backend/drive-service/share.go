package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
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
	c.Header("Content-Disposition", `attachment; filename="`+dispositionFilename(name)+`"`)
	c.Data(http.StatusOK, ct, content)
}
