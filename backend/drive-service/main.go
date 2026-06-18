package main

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"errors"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"log"
	"net/http"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/lib/pq"
)

const defaultPort = "8055"

var photoNameDateRe = regexp.MustCompile(`(?i)(?:IMG|VID|PXL|Screenshot)?[_ -]*([12][0-9]{3})[-_]?([01][0-9])[-_]?([0-3][0-9])[_ -]?([0-2][0-9])([0-5][0-9])([0-5][0-9])`)

// mimeFromFileName complète le Content-Type quand la colonne mime_type est vide (uploads anciens ou clients sans MIME).
func mimeFromFileName(name string) string {
	switch strings.ToLower(path.Ext(name)) {
	case ".pdf":
		return "application/pdf"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".heic":
		return "image/heic"
	case ".heif":
		return "image/heif"
	case ".avif":
		return "image/avif"
	case ".svg":
		return "image/svg+xml"
	case ".bmp":
		return "image/bmp"
	case ".txt", ".log":
		return "text/plain; charset=utf-8"
	case ".md":
		return "text/markdown; charset=utf-8"
	case ".csv":
		return "text/csv; charset=utf-8"
	case ".html", ".htm":
		return "text/html; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".js", ".mjs", ".cjs":
		return "text/javascript; charset=utf-8"
	case ".json":
		return "application/json; charset=utf-8"
	case ".xml":
		return "application/xml; charset=utf-8"
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".ogv":
		return "video/ogg"
	case ".mp3":
		return "audio/mpeg"
	case ".wav":
		return "audio/wav"
	case ".ogg":
		return "audio/ogg"
	case ".m4a":
		return "audio/mp4"
	case ".mov":
		return "video/quicktime"
	case ".opus":
		return "audio/opus"
	case ".flac":
		return "audio/flac"
	case ".aac":
		return "audio/aac"
	case ".zip":
		return "application/zip"
	default:
		return ""
	}
}

func isNonPhotoThumbnail(name, contentType string) bool {
	lower := strings.ToLower(name)
	if strings.HasSuffix(lower, ".pdf") {
		return true
	}
	base := strings.ToLower(strings.TrimSpace(contentType))
	if i := strings.Index(base, ";"); i > 0 {
		base = strings.TrimSpace(base[:i])
	}
	return base == "application/pdf"
}

func photoTakenAtFromFileName(name string) (time.Time, bool) {
	m := photoNameDateRe.FindStringSubmatch(name)
	if len(m) != 7 {
		return time.Time{}, false
	}
	parsed, err := time.Parse("20060102150405", strings.Join(m[1:], ""))
	if err != nil {
		return time.Time{}, false
	}
	return parsed.UTC(), true
}

func dispositionFilename(name string) string {
	s := strings.ReplaceAll(name, `"`, "'")
	s = strings.ReplaceAll(s, "\r", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	if s == "" {
		return "file"
	}
	return s
}

func setupRouter(db *sql.DB) *gin.Engine {
	h := &Handler{db: db}
	r := gin.Default()
	r.SetTrustedProxies(nil)
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "drive"})
	})
	r.GET("/drive/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "drive"})
	})
	r.Use(h.requireUserID)
	drive := r.Group("/drive")
	{
		drive.GET("/nodes", h.listNodes)
		drive.GET("/nodes/search", h.searchNodes)
		drive.GET("/photos/timeline", h.listPhotosTimeline)
		drive.GET("/photos/system-folder", h.getPhotosSystemFolder)
		drive.GET("/photos/fingerprints", h.listPhotosFingerprints)
		drive.POST("/photos/match", h.matchPhotos)
		drive.GET("/photos/archive", h.listPhotosArchive)
		drive.GET("/photos/locked", h.listPhotosLocked)
		drive.POST("/photos/archive", h.archivePhotos)
		drive.POST("/photos/unarchive", h.unarchivePhotos)
		drive.POST("/photos/lock", h.lockPhotos)
		drive.POST("/photos/unlock", h.unlockPhotos)
		drive.GET("/nodes/recent", h.listRecentNodes)
		drive.GET("/storage/summary", h.getStorageSummary)
		drive.GET("/nodes/trash", h.listTrash)
		drive.POST("/nodes", h.createNode)
		drive.PUT("/nodes/:id", h.updateNode)
		drive.POST("/nodes/:id/restore", h.restoreNode)
		drive.DELETE("/nodes/trash/:id", h.purgeNode)
		drive.DELETE("/nodes/:id", h.deleteNode)
		drive.GET("/nodes/:id/thumbnail", h.getNodeThumbnail)
		drive.GET("/nodes/:id/content", h.getNodeContent)
		drive.GET("/nodes/:id/archive/entries", h.getZipEntries)
		drive.GET("/nodes/:id/zip", h.downloadFolderZip)
		drive.PUT("/nodes/:id/content", h.putNodeContent)
		drive.POST("/nodes/upload", h.uploadFile)
		drive.POST("/nodes/archive", h.downloadArchiveZip)
	}
	r.GET("/drive/files", func(c *gin.Context) {
		if h.db == nil {
			c.JSON(http.StatusOK, []interface{}{})
			return
		}
		c.Request.URL.RawQuery = ""
		c.Request.URL.Path = "/drive/nodes"
		r.HandleContext(c)
	})
	return r
}

func main() {
	_ = godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Println("DATABASE_URL not set; drive API will return empty list")
	}

	var db *sql.DB
	if dbURL != "" {
		var err error
		db, err = sql.Open("postgres", dbURL)
		if err != nil {
			log.Fatal("Failed to connect to database:", err)
		}
		defer db.Close()
		if err := db.Ping(); err != nil {
			log.Fatal("Failed to ping database:", err)
		}
	}

	r := setupRouter(db)
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}
	log.Println("Drive service listening on", port)
	r.Run(":" + port)
}

type Handler struct {
	db *sql.DB
}

func (h *Handler) requireUserID(c *gin.Context) {
	if c.FullPath() == "/health" || c.FullPath() == "/drive/health" {
		c.Next()
		return
	}
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "X-User-ID required"})
		return
	}
	uid, err := strconv.Atoi(userID)
	if err != nil || uid <= 0 {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid X-User-ID"})
		return
	}
	if h.db != nil {
		ctx := c.Request.Context()
		conn, err := h.db.Conn(ctx)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to acquire DB connection"})
			return
		}
		defer conn.Close()
		if _, err := conn.ExecContext(ctx, "SELECT set_config('app.current_user_id', $1, false)", uid); err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to set user context"})
			return
		}
		pin := &pinnedConn{conn: conn, ctx: ctx}
		c.Request = c.Request.WithContext(withPinnedConn(ctx, pin))
	}
	c.Next()
}

type Node struct {
	ID           int     `json:"id"`
	TenantID     int     `json:"tenant_id"`
	UserID       int     `json:"user_id"`
	ParentID     *int    `json:"parent_id"`
	Name         string  `json:"name"`
	IsFolder     bool    `json:"is_folder"`
	Size         int64   `json:"size"`
	MimeType     *string `json:"mime_type,omitempty"`
	TakenAt      string  `json:"taken_at,omitempty"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
	ChildCount   int     `json:"child_count,omitempty"`
	ChildFolders int     `json:"child_folders,omitempty"`
	ChildFiles   int     `json:"child_files,omitempty"`
	DeletedAt        string `json:"deleted_at,omitempty"` // pour la corbeille
	PhotoArchivedAt  string `json:"photo_archived_at,omitempty"`
	PhotoLockedAt    string `json:"photo_locked_at,omitempty"`
	VaultEncrypted   bool   `json:"vault_encrypted,omitempty"`
	IsVaultFolder    bool   `json:"is_vault_folder,omitempty"`
	// Renseigné par GET /drive/nodes/search (dossier parent pour navigation).
	ParentFolderName string `json:"parent_folder_name,omitempty"`
}

const appVaultMime = "application/vnd.cloudity.vault+json;v=1"

func (h *Handler) listNodes(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, []Node{})
		return
	}
	ctx := c.Request.Context()
	parentIDStr := c.Query("parent_id")
	var rows *sql.Rows
	var err error
	if parentIDStr == "" || parentIDStr == "null" {
		rows, err = h.dbex(ctx).Query(`
			SELECT n.id, n.tenant_id, n.user_id, n.parent_id, n.name, n.is_folder, n.size, n.mime_type, n.created_at::text, COALESCE(n.updated_at::text, ''),
				n.vault_encrypted, n.is_vault_folder,
				(SELECT COUNT(*) FROM drive_nodes c WHERE c.parent_id = n.id AND c.deleted_at IS NULL),
				(SELECT COUNT(*) FROM drive_nodes c WHERE c.parent_id = n.id AND c.is_folder = true AND c.deleted_at IS NULL),
				(SELECT COUNT(*) FROM drive_nodes c WHERE c.parent_id = n.id AND c.is_folder = false AND c.deleted_at IS NULL)
			FROM drive_nodes n WHERE n.user_id = current_setting('app.current_user_id', true)::INTEGER AND n.parent_id IS NULL AND n.deleted_at IS NULL ` + photosRootExcludeSQL + ` ORDER BY n.is_folder DESC, n.name
		`)
	} else {
		parentID, perr := strconv.Atoi(parentIDStr)
		if perr != nil || parentID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid parent_id"})
			return
		}
		rows, err = h.dbex(ctx).Query(`
			SELECT n.id, n.tenant_id, n.user_id, n.parent_id, n.name, n.is_folder, n.size, n.mime_type, n.created_at::text, COALESCE(n.updated_at::text, ''),
				n.vault_encrypted, n.is_vault_folder,
				(SELECT COUNT(*) FROM drive_nodes c WHERE c.parent_id = n.id AND c.deleted_at IS NULL),
				(SELECT COUNT(*) FROM drive_nodes c WHERE c.parent_id = n.id AND c.is_folder = true AND c.deleted_at IS NULL),
				(SELECT COUNT(*) FROM drive_nodes c WHERE c.parent_id = n.id AND c.is_folder = false AND c.deleted_at IS NULL)
			FROM drive_nodes n WHERE n.user_id = current_setting('app.current_user_id', true)::INTEGER AND n.parent_id = $1 AND n.deleted_at IS NULL ORDER BY n.is_folder DESC, n.name
		`, parentID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	list := make([]Node, 0)
	for rows.Next() {
		var n Node
		var pid sql.NullInt64
		var mime sql.NullString
		var uat string
		if err := rows.Scan(&n.ID, &n.TenantID, &n.UserID, &pid, &n.Name, &n.IsFolder, &n.Size, &mime, &n.CreatedAt, &uat, &n.VaultEncrypted, &n.IsVaultFolder, &n.ChildCount, &n.ChildFolders, &n.ChildFiles); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if pid.Valid {
			p := int(pid.Int64)
			n.ParentID = &p
		}
		if mime.Valid {
			n.MimeType = &mime.String
		}
		n.UpdatedAt = uat
		list = append(list, n)
	}
	c.JSON(http.StatusOK, list)
}

// searchNodes — recherche par nom sur tout le Drive de l’utilisateur (ou sous-arbre si parent_id).
// GET /drive/nodes/search?q=...&limit=50&parent_id= optionnel
func (h *Handler) searchNodes(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "q is required"})
		return
	}
	if h.db == nil {
		c.JSON(http.StatusOK, []Node{})
		return
	}
	ctx := c.Request.Context()
	limit := 50
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	const selectSearch = `
			SELECT n.id, n.tenant_id, n.user_id, n.parent_id, n.name, n.is_folder, n.size, n.mime_type, n.created_at::text, COALESCE(n.updated_at::text, ''),
				(SELECT COUNT(*) FROM drive_nodes c WHERE c.parent_id = n.id AND c.deleted_at IS NULL),
				(SELECT COUNT(*) FROM drive_nodes c WHERE c.parent_id = n.id AND c.is_folder = true AND c.deleted_at IS NULL),
				(SELECT COUNT(*) FROM drive_nodes c WHERE c.parent_id = n.id AND c.is_folder = false AND c.deleted_at IS NULL),
				COALESCE(p.name, '')
			FROM drive_nodes n
			LEFT JOIN drive_nodes p ON p.id = n.parent_id AND p.user_id = n.user_id AND p.deleted_at IS NULL
			WHERE n.user_id = current_setting('app.current_user_id', true)::INTEGER
			AND n.deleted_at IS NULL
			AND POSITION(LOWER($1) IN LOWER(n.name)) > 0` + photosTreeExcludeSQL
	parentStr := strings.TrimSpace(c.Query("parent_id"))
	var rows *sql.Rows
	var err error
	if parentStr == "" || parentStr == "null" {
		rows, err = h.dbex(ctx).Query(selectSearch+` ORDER BY n.is_folder DESC, n.name ASC LIMIT $2`, q, limit)
	} else {
		parentID, perr := strconv.Atoi(parentStr)
		if perr != nil || parentID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid parent_id"})
			return
		}
		qTree := `
			WITH RECURSIVE descendants AS (
				SELECT id FROM drive_nodes
				WHERE id = $3 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND deleted_at IS NULL
				UNION ALL
				SELECT c.id FROM drive_nodes c
				INNER JOIN descendants d ON c.parent_id = d.id
				WHERE c.deleted_at IS NULL AND c.user_id = current_setting('app.current_user_id', true)::INTEGER
			)` + selectSearch + ` AND n.id IN (SELECT id FROM descendants)
			ORDER BY n.is_folder DESC, n.name ASC LIMIT $2`
		rows, err = h.dbex(ctx).Query(qTree, q, limit, parentID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	list := make([]Node, 0)
	for rows.Next() {
		var n Node
		var pid sql.NullInt64
		var mime sql.NullString
		var uat string
		var parentFolder string
		if err := rows.Scan(&n.ID, &n.TenantID, &n.UserID, &pid, &n.Name, &n.IsFolder, &n.Size, &mime, &n.CreatedAt, &uat, &n.ChildCount, &n.ChildFolders, &n.ChildFiles, &parentFolder); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if pid.Valid {
			p := int(pid.Int64)
			n.ParentID = &p
		}
		if mime.Valid {
			n.MimeType = &mime.String
		}
		n.UpdatedAt = uat
		n.ParentFolderName = parentFolder
		list = append(list, n)
	}
	if list == nil {
		list = []Node{}
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) listRecentNodes(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, []Node{})
		return
	}
	ctx := c.Request.Context()
	limitStr := c.DefaultQuery("limit", "20")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 || limit > 500 {
		limit = 20
	}
	rows, err := h.dbex(ctx).Query(`
		SELECT id, tenant_id, user_id, parent_id, name, is_folder, size, mime_type,
		       COALESCE(taken_at::text, ''), COALESCE(taken_at, created_at)::text, COALESCE(updated_at::text, '')
		FROM drive_nodes n
		WHERE user_id = current_setting('app.current_user_id', true)::INTEGER AND deleted_at IS NULL
		` + photosTreeExcludeSQL + `
		ORDER BY updated_at DESC NULLS LAST, id DESC
		LIMIT $1
	`, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	list := make([]Node, 0)
	for rows.Next() {
		var n Node
		var pid sql.NullInt64
		var mime sql.NullString
		var uat string
		if err := rows.Scan(&n.ID, &n.TenantID, &n.UserID, &pid, &n.Name, &n.IsFolder, &n.Size, &mime, &n.TakenAt, &n.CreatedAt, &uat); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if pid.Valid {
			p := int(pid.Int64)
			n.ParentID = &p
		}
		if mime.Valid {
			n.MimeType = &mime.String
		}
		n.UpdatedAt = uat
		list = append(list, n)
	}
	c.JSON(http.StatusOK, list)
}

// photosTimelinePage — images du Drive (tous dossiers), tri chronologique inverse, pagination offset.
type photosTimelinePage struct {
	Items   []Node `json:"items"`
	Limit   int    `json:"limit"`
	Offset  int    `json:"offset"`
	HasMore bool   `json:"has_more"`
}

// photoImageFilterSQL — fichiers image (hors PDF), dossiers exclus.
const photoImageFilterSQL = `
  AND is_folder = false
  AND LOWER(name) !~ '\.pdf$'
  AND LOWER(COALESCE(mime_type, '')) NOT LIKE 'application/pdf%'
  AND (
    (LOWER(COALESCE(mime_type, '')) LIKE 'image/%' AND LOWER(COALESCE(mime_type, '')) NOT LIKE 'image/pdf%')
    OR LOWER(name) ~ '\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif|tiff|tif)$'
  )`

const photoNodeSelectSQL = `
  id, tenant_id, user_id, parent_id, name, is_folder, size, mime_type,
  COALESCE(taken_at::text, ''),
  COALESCE(taken_at, created_at)::text,
  COALESCE(updated_at::text, ''),
  COALESCE(photo_archived_at::text, ''),
  COALESCE(photo_locked_at::text, ''),
  vault_encrypted, is_vault_folder`

func scanPhotoNodeRow(rows *sql.Rows) (Node, error) {
	var n Node
	var pid sql.NullInt64
	var mime sql.NullString
	var takenAt, uat, archivedAt, lockedAt string
	if err := rows.Scan(&n.ID, &n.TenantID, &n.UserID, &pid, &n.Name, &n.IsFolder, &n.Size, &mime, &takenAt, &n.CreatedAt, &uat, &archivedAt, &lockedAt, &n.VaultEncrypted, &n.IsVaultFolder); err != nil {
		return n, err
	}
	if pid.Valid {
		p := int(pid.Int64)
		n.ParentID = &p
	}
	if mime.Valid {
		n.MimeType = &mime.String
	}
	n.TakenAt = takenAt
	n.UpdatedAt = uat
	n.PhotoArchivedAt = archivedAt
	n.PhotoLockedAt = lockedAt
	return n, nil
}

type photoIDsBody struct {
	IDs []int `json:"ids"`
}

func (h *Handler) listPhotosTimeline(c *gin.Context) {
	limitStr := c.DefaultQuery("limit", "48")
	offsetStr := c.DefaultQuery("offset", "0")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 {
		limit = 48
	}
	if limit > 200 {
		limit = 200
	}
	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		offset = 0
	}
	if h.db == nil {
		c.JSON(http.StatusOK, photosTimelinePage{Items: []Node{}, Limit: limit, Offset: offset, HasMore: false})
		return
	}
	ctx := c.Request.Context()
	// Demander une ligne de plus pour savoir s'il reste des pages (évite COUNT(*)).
	fetch := limit + 1
	rows, err := h.dbex(ctx).Query(`
		SELECT `+photoNodeSelectSQL+`
		FROM drive_nodes
		WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
		  AND deleted_at IS NULL
		  AND photo_archived_at IS NULL
		  AND photo_locked_at IS NULL
		`+photoImageFilterSQL+`
		ORDER BY COALESCE(taken_at, created_at) DESC NULLS LAST, id DESC
		LIMIT $1 OFFSET $2
	`, fetch, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	list := make([]Node, 0)
	for rows.Next() {
		n, err := scanPhotoNodeRow(rows)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		list = append(list, n)
	}
	hasMore := len(list) > limit
	if hasMore {
		list = list[:limit]
	}
	c.JSON(http.StatusOK, photosTimelinePage{Items: list, Limit: limit, Offset: offset, HasMore: hasMore})
}

func (h *Handler) listPhotosArchive(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, []Node{})
		return
	}
	ctx := c.Request.Context()
	rows, err := h.dbex(ctx).Query(`
		SELECT `+photoNodeSelectSQL+`
		FROM drive_nodes
		WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
		  AND deleted_at IS NULL
		  AND photo_archived_at IS NOT NULL
		  AND photo_locked_at IS NULL
		`+photoImageFilterSQL+`
		ORDER BY photo_archived_at DESC NULLS LAST, id DESC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	list := make([]Node, 0)
	for rows.Next() {
		n, err := scanPhotoNodeRow(rows)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		list = append(list, n)
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) listPhotosLocked(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, []Node{})
		return
	}
	ctx := c.Request.Context()
	rows, err := h.dbex(ctx).Query(`
		SELECT `+photoNodeSelectSQL+`
		FROM drive_nodes
		WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
		  AND deleted_at IS NULL
		  AND photo_locked_at IS NOT NULL
		`+photoImageFilterSQL+`
		ORDER BY photo_locked_at DESC NULLS LAST, id DESC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	list := make([]Node, 0)
	for rows.Next() {
		n, err := scanPhotoNodeRow(rows)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		list = append(list, n)
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) archivePhotos(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var body photoIDsBody
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids required"})
		return
	}
	ctx := c.Request.Context()
	res, err := h.dbex(ctx).Exec(`
		UPDATE drive_nodes
		SET photo_archived_at = NOW(), updated_at = NOW()
		WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
		  AND deleted_at IS NULL
		  AND photo_locked_at IS NULL
		  AND photo_archived_at IS NULL
		  AND id = ANY($1::int[])
		`+photoImageFilterSQL, pq.Array(body.IDs))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	c.JSON(http.StatusOK, gin.H{"updated": n})
}

func (h *Handler) unarchivePhotos(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var body photoIDsBody
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids required"})
		return
	}
	ctx := c.Request.Context()
	res, err := h.dbex(ctx).Exec(`
		UPDATE drive_nodes
		SET photo_archived_at = NULL, updated_at = NOW()
		WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
		  AND deleted_at IS NULL
		  AND photo_locked_at IS NULL
		  AND photo_archived_at IS NOT NULL
		  AND id = ANY($1::int[])
		`+photoImageFilterSQL, pq.Array(body.IDs))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	c.JSON(http.StatusOK, gin.H{"updated": n})
}

func (h *Handler) lockPhotos(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var body photoIDsBody
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids required"})
		return
	}
	ctx := c.Request.Context()
	res, err := h.dbex(ctx).Exec(`
		UPDATE drive_nodes
		SET photo_locked_at = NOW(), photo_archived_at = NULL, updated_at = NOW()
		WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
		  AND deleted_at IS NULL
		  AND photo_locked_at IS NULL
		  AND id = ANY($1::int[])
		`+photoImageFilterSQL, pq.Array(body.IDs))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	c.JSON(http.StatusOK, gin.H{"updated": n})
}

func (h *Handler) unlockPhotos(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var body photoIDsBody
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids required"})
		return
	}
	ctx := c.Request.Context()
	res, err := h.dbex(ctx).Exec(`
		UPDATE drive_nodes
		SET photo_locked_at = NULL, updated_at = NOW()
		WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
		  AND deleted_at IS NULL
		  AND photo_locked_at IS NOT NULL
		  AND id = ANY($1::int[])
		`+photoImageFilterSQL, pq.Array(body.IDs))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	c.JSON(http.StatusOK, gin.H{"updated": n})
}

func (h *Handler) createNode(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var body struct {
		ParentID      *int   `json:"parent_id"`
		Name          string `json:"name"`
		IsFolder      bool   `json:"is_folder"`
		IsVaultFolder bool   `json:"is_vault_folder"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}
	userID := c.GetHeader("X-User-ID")
	tenantID := c.GetHeader("X-Tenant-ID")
	uid, _ := strconv.Atoi(userID)
	tid := 1
	if tenantID != "" {
		if t, err := strconv.Atoi(tenantID); err == nil && t > 0 {
			tid = t
		}
	}
	ctx := c.Request.Context()
	var id int
	if body.ParentID == nil || *body.ParentID == 0 {
		err := h.dbex(ctx).QueryRow(`
			INSERT INTO drive_nodes (tenant_id, user_id, parent_id, name, is_folder, size, is_vault_folder) VALUES ($1, $2, NULL, $3, $4, 0, $5)
			RETURNING id
		`, tid, uid, body.Name, body.IsFolder, body.IsVaultFolder).Scan(&id)
		if err != nil {
			var perr *pq.Error
			if errors.As(err, &perr) && perr.Code == "23505" {
				var existingID int
				if selErr := h.dbex(ctx).QueryRow(`
					SELECT id FROM drive_nodes WHERE tenant_id = $1 AND user_id = $2 AND parent_id IS NULL AND name = $3 AND is_folder = $4 LIMIT 1
				`, tid, uid, body.Name, body.IsFolder).Scan(&existingID); selErr == nil {
					c.JSON(http.StatusConflict, gin.H{"error": "file_exists", "code": "FILE_EXISTS", "id": existingID, "name": body.Name, "is_folder": body.IsFolder, "message": "Un fichier ou dossier avec ce nom existe déjà"})
					return
				}
				c.JSON(http.StatusConflict, gin.H{"error": "file_exists", "code": "FILE_EXISTS", "message": "Un fichier ou dossier avec ce nom existe déjà"})
				return
			}
			if errors.As(err, &perr) && perr.Code == "23503" {
				log.Printf("[drive] createNode FK violation: %v", err)
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_tenant_or_user", "message": "Tenant ou utilisateur invalide. Reconnectez-vous."})
				return
			}
			log.Printf("[drive] createNode root err: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "message": "Erreur lors de la création du fichier"})
			return
		}
	} else {
		err := h.dbex(ctx).QueryRow(`
			INSERT INTO drive_nodes (tenant_id, user_id, parent_id, name, is_folder, size, is_vault_folder) VALUES ($1, $2, $3, $4, $5, 0, $6)
			RETURNING id
		`, tid, uid, *body.ParentID, body.Name, body.IsFolder, body.IsVaultFolder).Scan(&id)
		if err != nil {
			var perr *pq.Error
			if errors.As(err, &perr) && perr.Code == "23505" {
				var existingID int
				if selErr := h.dbex(ctx).QueryRow(`
					SELECT id FROM drive_nodes WHERE tenant_id = $1 AND user_id = $2 AND parent_id = $3 AND name = $4 AND is_folder = $5 LIMIT 1
				`, tid, uid, *body.ParentID, body.Name, body.IsFolder).Scan(&existingID); selErr == nil {
					c.JSON(http.StatusConflict, gin.H{"error": "file_exists", "code": "FILE_EXISTS", "id": existingID, "name": body.Name, "is_folder": body.IsFolder, "message": "Un fichier ou dossier avec ce nom existe déjà"})
					return
				}
				c.JSON(http.StatusConflict, gin.H{"error": "file_exists", "code": "FILE_EXISTS", "message": "Un fichier ou dossier avec ce nom existe déjà"})
				return
			}
			if errors.As(err, &perr) && perr.Code == "23503" {
				log.Printf("[drive] createNode FK violation: %v", err)
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_tenant_or_user", "message": "Tenant ou utilisateur invalide. Reconnectez-vous."})
				return
			}
			log.Printf("[drive] createNode child err: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "message": "Erreur lors de la création du fichier"})
			return
		}
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "name": body.Name, "is_folder": body.IsFolder})
}

func (h *Handler) updateNode(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if h.rejectPhotosRootMutation(c, id) {
		return
	}
	var body struct {
		Name     string `json:"name"`
		ParentID *int   `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Name == "" && body.ParentID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name or parent_id required"})
		return
	}
	ctx := c.Request.Context()
	// Mise à jour name et/ou parent_id
	if body.Name != "" && body.ParentID == nil {
		res, err := h.dbex(ctx).Exec(`
			UPDATE drive_nodes SET name = $1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND deleted_at IS NULL
		`, body.Name, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		aff, _ := res.RowsAffected()
		if aff == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"id": id, "name": body.Name})
		return
	}
	if body.ParentID != nil {
		// Déplacer le nœud (éviter de déplacer dans un de ses descendants)
		var currentParent *int
		var isFolder bool
		if err := h.dbex(ctx).QueryRow(`SELECT parent_id, is_folder FROM drive_nodes WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND deleted_at IS NULL`, id).Scan(&currentParent, &isFolder); err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		} else if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		newParentVal := *body.ParentID
		// 0 ou valeur négative = déplacer à la racine (NULL)
		var newParentNullable *int
		if newParentVal > 0 {
			newParentNullable = &newParentVal
		}
		if newParentNullable != nil && *newParentNullable == id {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot move into itself"})
			return
		}
		// Vérifier que la cible n'est pas un descendant de id (éviter cycle)
		if newParentNullable != nil {
			check := *newParentNullable
			for check > 0 {
				var pid *int
				if err := h.dbex(ctx).QueryRow(`SELECT parent_id FROM drive_nodes WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER`, check).Scan(&pid); err != nil || pid == nil {
					break
				}
				if *pid == id {
					c.JSON(http.StatusBadRequest, gin.H{"error": "cannot move into a descendant folder"})
					return
				}
				check = *pid
			}
		}
		res, err := h.dbex(ctx).Exec(`
			UPDATE drive_nodes SET parent_id = $1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND deleted_at IS NULL
		`, newParentNullable, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		aff, _ := res.RowsAffected()
		if aff == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		name := body.Name
		if name == "" {
			h.dbex(ctx).QueryRow(`SELECT name FROM drive_nodes WHERE id = $1`, id).Scan(&name)
		}
		out := gin.H{"id": id, "name": name}
		if newParentNullable != nil {
			out["parent_id"] = *newParentNullable
		} else {
			out["parent_id"] = nil
		}
		c.JSON(http.StatusOK, out)
		return
	}
	c.JSON(http.StatusBadRequest, gin.H{"error": "name or parent_id required"})
}

func (h *Handler) deleteNode(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if h.rejectPhotosRootMutation(c, id) {
		return
	}
	ctx := c.Request.Context()
	res, err := h.dbex(ctx).Exec(`
		UPDATE drive_nodes SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND deleted_at IS NULL
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
	c.Status(http.StatusNoContent)
}

func (h *Handler) listTrash(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, []Node{})
		return
	}
	ctx := c.Request.Context()
	rows, err := h.dbex(ctx).Query(`
		SELECT id, tenant_id, user_id, parent_id, name, is_folder, size, mime_type, created_at::text, COALESCE(updated_at::text, ''), deleted_at::text
		FROM drive_nodes
		WHERE user_id = current_setting('app.current_user_id', true)::INTEGER AND deleted_at IS NOT NULL
		ORDER BY deleted_at DESC NULLS LAST, id DESC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	list := make([]Node, 0)
	for rows.Next() {
		var n Node
		var pid sql.NullInt64
		var mime sql.NullString
		var uat, deletedAt string
		if err := rows.Scan(&n.ID, &n.TenantID, &n.UserID, &pid, &n.Name, &n.IsFolder, &n.Size, &mime, &n.CreatedAt, &uat, &deletedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if pid.Valid {
			p := int(pid.Int64)
			n.ParentID = &p
		}
		if mime.Valid {
			n.MimeType = &mime.String
		}
		n.UpdatedAt = uat
		n.DeletedAt = deletedAt
		list = append(list, n)
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) restoreNode(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	ctx := c.Request.Context()
	res, err := h.dbex(ctx).Exec(`
		UPDATE drive_nodes SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND deleted_at IS NOT NULL
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
	c.Status(http.StatusNoContent)
}

func (h *Handler) purgeNode(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	ctx := c.Request.Context()
	res, err := h.dbex(ctx).Exec(`
		DELETE FROM drive_nodes WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND deleted_at IS NOT NULL
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
	c.Status(http.StatusNoContent)
}

func (h *Handler) getNodeContent(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	ctx := c.Request.Context()
	var name string
	var content []byte
	var mime sql.NullString
	var vaultEncrypted bool
	err = h.dbex(ctx).QueryRow(`
		SELECT name, COALESCE(content, ''::bytea), mime_type, vault_encrypted FROM drive_nodes
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND is_folder = false AND deleted_at IS NULL
	`, id).Scan(&name, &content, &mime, &vaultEncrypted)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if vaultEncrypted {
		c.Header("X-Cloudity-Vault-Encrypted", "1")
	}
	// Fichier sans contenu (ex. nouveau document) : retourner 200 avec corps vide
	if len(content) == 0 {
		c.Header("Content-Type", "text/plain")
		c.Data(http.StatusOK, "text/plain", []byte{})
		return
	}
	ct := "application/octet-stream"
	if mime.Valid && strings.TrimSpace(mime.String) != "" {
		ct = strings.TrimSpace(mime.String)
	}
	if ct == "application/octet-stream" || ct == "" {
		if inf := mimeFromFileName(name); inf != "" {
			ct = inf
		}
	}
	if len(content) >= 4 && string(content[0:4]) == "%PDF" {
		ct = "application/pdf"
	}
	inlineParam := strings.ToLower(strings.TrimSpace(c.Query("inline")))
	wantInline := inlineParam == "1" || inlineParam == "true" || inlineParam == "yes"
	baseCT := ct
	if i := strings.Index(baseCT, ";"); i > 0 {
		baseCT = strings.TrimSpace(baseCT[:i])
	}
	previewable := strings.HasPrefix(baseCT, "text/") ||
		strings.HasPrefix(baseCT, "video/") || strings.HasPrefix(baseCT, "audio/") ||
		baseCT == "application/pdf" || baseCT == "application/json" || baseCT == "application/xml"
	// image/* : inline seulement sur demande (?inline=1) pour éviter d’afficher des binaires lourds par erreur.
	imagePreviewable := strings.HasPrefix(baseCT, "image/")
	disp := "attachment"
	if wantInline && (previewable || imagePreviewable) {
		disp = "inline"
	} else if baseCT == "application/pdf" {
		// PDF : toujours proposer l’affichage inline (aperçu SPA, iframe blob). Le bouton Télécharger utilise fetch + a.download.
		disp = "inline"
	}
	c.Header("Content-Disposition", disp+`; filename="`+dispositionFilename(name)+`"`)
	c.Data(http.StatusOK, ct, content)
}

func (h *Handler) getNodeThumbnail(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	size := 360
	if s, err := strconv.Atoi(c.DefaultQuery("size", "360")); err == nil && s >= 96 && s <= 1024 {
		size = s
	}
	ctx := c.Request.Context()
	var name string
	var content []byte
	var mime sql.NullString
	var vaultEncrypted bool
	err = h.dbex(ctx).QueryRow(`
		SELECT name, COALESCE(content, ''::bytea), mime_type, vault_encrypted FROM drive_nodes
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND is_folder = false AND deleted_at IS NULL
	`, id).Scan(&name, &content, &mime, &vaultEncrypted)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if vaultEncrypted {
		c.Header("X-Cloudity-Vault-Encrypted", "1")
		c.JSON(http.StatusNotFound, gin.H{"error": "vault_encrypted", "code": "VAULT_ENCRYPTED"})
		return
	}
	ct := "application/octet-stream"
	if mime.Valid && strings.TrimSpace(mime.String) != "" {
		ct = strings.TrimSpace(mime.String)
	}
	if ct == "application/octet-stream" || ct == "" {
		if inf := mimeFromFileName(name); inf != "" {
			ct = inf
		}
	}
	c.Header("Cache-Control", "private, max-age=3600")
	if isNonPhotoThumbnail(name, ct) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_an_image"})
		return
	}
	if len(content) == 0 {
		c.Data(http.StatusOK, "image/jpeg", []byte{})
		return
	}
	img, err := decodeThumbnailImage(name, ct, content)
	if err != nil {
		if isNonPhotoThumbnail(name, ct) || (len(content) >= 4 && string(content[0:4]) == "%PDF") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not_an_image"})
			return
		}
		c.Header("Content-Disposition", `inline; filename="`+dispositionFilename(name)+`"`)
		c.Data(http.StatusOK, ct, content)
		return
	}
	thumb := resizeNearest(img, size)
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, thumb, &jpeg.Options{Quality: 78}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "thumbnail encode failed"})
		return
	}
	c.Header("Content-Disposition", `inline; filename="thumbnail.jpg"`)
	c.Data(http.StatusOK, "image/jpeg", buf.Bytes())
}

func resizeNearest(src image.Image, maxSide int) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 || (w <= maxSide && h <= maxSide) {
		return src
	}
	newW, newH := maxSide, maxSide
	if w >= h {
		newH = max(1, h*maxSide/w)
	} else {
		newW = max(1, w*maxSide/h)
	}
	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	for y := 0; y < newH; y++ {
		sy := b.Min.Y + y*h/newH
		for x := 0; x < newW; x++ {
			sx := b.Min.X + x*w/newW
			dst.Set(x, y, src.At(sx, sy))
		}
	}
	return dst
}

// getZipEntries retourne la liste des entrées d'un fichier ZIP (nœud fichier) sans extraire. GET /drive/nodes/:id/archive/entries
func (h *Handler) getZipEntries(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	ctx := c.Request.Context()
	var content []byte
	err = h.dbex(ctx).QueryRow(`
		SELECT COALESCE(content, ''::bytea) FROM drive_nodes
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND is_folder = false AND deleted_at IS NULL
	`, id).Scan(&content)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(content) == 0 {
		c.JSON(http.StatusOK, gin.H{"entries": []interface{}{}})
		return
	}
	zr, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid zip", "detail": err.Error()})
		return
	}
	type entry struct {
		Path  string `json:"path"`
		Name  string `json:"name"`
		Size  int64  `json:"size"`
		IsDir bool   `json:"is_dir"`
	}
	var entries []entry
	for _, f := range zr.File {
		path := f.Name
		isDir := strings.HasSuffix(path, "/")
		name := path
		if isDir && len(name) > 0 {
			name = strings.TrimSuffix(name, "/")
		}
		if idx := strings.LastIndex(name, "/"); idx >= 0 {
			name = name[idx+1:]
		}
		if f.UncompressedSize64 > uint64(^uint64(0)>>1) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "zip entry too large"})
			return
		}
		entries = append(entries, entry{
			Path:  path,
			Name:  name,
			Size:  int64(f.UncompressedSize64),
			IsDir: isDir,
		})
	}
	c.JSON(http.StatusOK, gin.H{"entries": entries})
}

// downloadFolderZip retourne un ZIP du dossier (récursif). Uniquement pour les dossiers.
func (h *Handler) downloadFolderZip(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	ctx := c.Request.Context()
	var name string
	var isFolder bool
	err = h.dbex(ctx).QueryRow(`
		SELECT name, is_folder FROM drive_nodes
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND deleted_at IS NULL
	`, id).Scan(&name, &isFolder)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !isFolder {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a folder"})
		return
	}
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	if err := h.addFolderToZip(ctx, w, id, name+"/"); err != nil {
		w.Close()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := w.Close(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	zipName := name + ".zip"
	if !strings.HasSuffix(strings.ToLower(zipName), ".zip") {
		zipName = name + ".zip"
	}
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", "attachment; filename=\""+zipName+"\"")
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}

// addFolderToZip ajoute récursivement le contenu du dossier dans le zip (prefix = chemin dans l'archive).
func (h *Handler) addFolderToZip(ctx context.Context, w *zip.Writer, folderID int, prefix string) error {
	rows, err := h.dbex(ctx).Query(`
		SELECT id, name, is_folder, content, COALESCE(mime_type, '')
		FROM drive_nodes
		WHERE parent_id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND deleted_at IS NULL
	`, folderID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var nodeID int
		var nodeName string
		var isFolder bool
		var content []byte
		var mime string
		if err := rows.Scan(&nodeID, &nodeName, &isFolder, &content, &mime); err != nil {
			return err
		}
		safeName := path.Base(nodeName)
		if safeName == "" || safeName == "." {
			safeName = "file"
		}
		entryPath := prefix + safeName
		if isFolder {
			if err := h.addFolderToZip(ctx, w, nodeID, entryPath+"/"); err != nil {
				return err
			}
		} else {
			fh := &zip.FileHeader{Name: entryPath, Method: zip.Deflate}
			fw, err := w.CreateHeader(fh)
			if err != nil {
				return err
			}
			if _, err := fw.Write(content); err != nil {
				return err
			}
		}
	}
	return rows.Err()
}

// downloadArchiveZip reçoit {"node_ids": [1,2,3]} et retourne un ZIP contenant ces nœuds (dossiers récursifs, fichiers directs).
func (h *Handler) downloadArchiveZip(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var body struct {
		NodeIDs []int `json:"node_ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.NodeIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "node_ids array required"})
		return
	}
	if len(body.NodeIDs) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "max 100 nodes"})
		return
	}
	ctx := c.Request.Context()
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	seen := make(map[int]bool)
	for _, nodeID := range body.NodeIDs {
		if seen[nodeID] {
			continue
		}
		seen[nodeID] = true
		var name string
		var isFolder bool
		err := h.dbex(ctx).QueryRow(`
			SELECT name, is_folder FROM drive_nodes
			WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND deleted_at IS NULL
		`, nodeID).Scan(&name, &isFolder)
		if err == sql.ErrNoRows {
			continue
		}
		if err != nil {
			w.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		safeName := path.Base(name)
		if safeName == "" || safeName == "." {
			safeName = "file"
		}
		if isFolder {
			if err := h.addFolderToZip(ctx, w, nodeID, safeName+"/"); err != nil {
				w.Close()
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		} else {
			var content []byte
			if err := h.dbex(ctx).QueryRow(`
				SELECT COALESCE(content, ''::bytea) FROM drive_nodes WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND deleted_at IS NULL
			`, nodeID).Scan(&content); err != nil {
				w.Close()
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			fh := &zip.FileHeader{Name: safeName, Method: zip.Deflate}
			fw, err := w.CreateHeader(fh)
			if err != nil {
				w.Close()
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			fw.Write(content)
		}
	}
	if err := w.Close(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", "attachment; filename=\"archive.zip\"")
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}

func (h *Handler) putNodeContent(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read body"})
		return
	}
	mimeType := c.GetHeader("Content-Type")
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	// Limiter la taille du Content-Type (éviter en-tête malveillant)
	if len(mimeType) > 255 {
		mimeType = "application/octet-stream"
	}
	vaultEncrypted := strings.HasPrefix(strings.ToLower(strings.TrimSpace(mimeType)), strings.ToLower(appVaultMime)) ||
		strings.EqualFold(strings.TrimSpace(c.GetHeader("X-Cloudity-Vault-Encrypted")), "1")
	size := int64(len(body))
	contentHash := sha256HexContent(body)
	ctx := c.Request.Context()
	res, err := h.dbex(ctx).Exec(`
		UPDATE drive_nodes SET content = $1, size = $2, mime_type = $3, vault_encrypted = $4, content_hash = $5, updated_at = CURRENT_TIMESTAMP
		WHERE id = $6 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND is_folder = false AND deleted_at IS NULL
	`, body, size, mimeType, vaultEncrypted, contentHashParam(contentHash), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	aff, _ := res.RowsAffected()
	if aff == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id, "size": size})
}

func (h *Handler) uploadFile(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "multipart required"})
		return
	}
	parentIDStr := c.PostForm("parent_id")
	name := c.PostForm("name")
	overwrite := c.PostForm("overwrite") == "true" || c.PostForm("overwrite") == "1"
	file, _, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}
	defer file.Close()
	content, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "read file failed"})
		return
	}
	if name == "" {
		fh := form.File["file"]
		if len(fh) > 0 {
			name = fh[0].Filename
		}
	}
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name or file required"})
		return
	}
	userID := c.GetHeader("X-User-ID")
	tenantID := c.GetHeader("X-Tenant-ID")
	uid, _ := strconv.Atoi(userID)
	tid := 1
	if tenantID != "" {
		if t, e := strconv.Atoi(tenantID); e == nil && t > 0 {
			tid = t
		}
	}
	mimeType := "application/octet-stream"
	if ct := c.PostForm("mime_type"); ct != "" {
		mimeType = ct
	}
	var takenAt sql.NullTime
	if rawTakenAt := strings.TrimSpace(c.PostForm("taken_at")); rawTakenAt != "" {
		if parsed, err := time.Parse(time.RFC3339, rawTakenAt); err == nil {
			takenAt = sql.NullTime{Time: parsed, Valid: true}
		}
	}
	if !takenAt.Valid {
		if parsed, ok := photoTakenAtFromExif(name, mimeType, content); ok {
			takenAt = sql.NullTime{Time: parsed, Valid: true}
		}
	}
	if !takenAt.Valid {
		if parsed, ok := photoTakenAtFromFileName(name); ok {
			takenAt = sql.NullTime{Time: parsed, Valid: true}
		}
	}
	size := int64(len(content))
	contentHash := sha256HexContent(content)
	ctx := c.Request.Context()

	if overwrite {
		var existingID int
		if parentIDStr == "" || parentIDStr == "null" {
			err = h.dbex(ctx).QueryRow(`
				SELECT id FROM drive_nodes
				WHERE user_id = current_setting('app.current_user_id', true)::INTEGER AND parent_id IS NULL AND name = $1 AND is_folder = false
			`, name).Scan(&existingID)
		} else {
			parentID, perr := strconv.Atoi(parentIDStr)
			if perr != nil || parentID <= 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid parent_id"})
				return
			}
			err = h.dbex(ctx).QueryRow(`
				SELECT id FROM drive_nodes
				WHERE user_id = current_setting('app.current_user_id', true)::INTEGER AND parent_id = $1 AND name = $2 AND is_folder = false
			`, parentID, name).Scan(&existingID)
		}
		if err == nil {
			_, err = h.dbex(ctx).Exec(`
				UPDATE drive_nodes SET content = $1, size = $2, mime_type = $3, taken_at = COALESCE($4, taken_at), content_hash = $5, updated_at = CURRENT_TIMESTAMP
				WHERE id = $6 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND is_folder = false
			`, content, size, mimeType, takenAt, contentHashParam(contentHash), existingID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"id": existingID, "name": name, "size": size})
			return
		}
		if err != sql.ErrNoRows {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	var id int
	if parentIDStr == "" || parentIDStr == "null" {
		err = h.dbex(ctx).QueryRow(`
			INSERT INTO drive_nodes (tenant_id, user_id, parent_id, name, is_folder, size, mime_type, content, taken_at, content_hash)
			VALUES ($1, $2, NULL, $3, false, $4, $5, $6, $7, $8) RETURNING id
		`, tid, uid, name, size, mimeType, content, takenAt, contentHashParam(contentHash)).Scan(&id)
	} else {
		parentID, perr := strconv.Atoi(parentIDStr)
		if perr != nil || parentID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid parent_id"})
			return
		}
		err = h.dbex(ctx).QueryRow(`
			INSERT INTO drive_nodes (tenant_id, user_id, parent_id, name, is_folder, size, mime_type, content, taken_at, content_hash)
			VALUES ($1, $2, $3, $4, false, $5, $6, $7, $8, $9) RETURNING id
		`, tid, uid, parentID, name, size, mimeType, content, takenAt, contentHashParam(contentHash)).Scan(&id)
	}
	if err != nil {
		var perr *pq.Error
		if errors.As(err, &perr) && perr.Code == "23505" {
			c.JSON(http.StatusConflict, gin.H{"error": "file_exists", "code": "FILE_EXISTS", "message": "Un fichier avec ce nom existe déjà"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "name": name, "size": size})
}
