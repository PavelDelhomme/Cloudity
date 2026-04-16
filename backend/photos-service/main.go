package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

const defaultPort = "8057"

// DriveNodeRef — même forme JSON que drive-service pour les fichiers image (timeline).
type DriveNodeRef struct {
	ID        int     `json:"id"`
	TenantID  int     `json:"tenant_id"`
	UserID    int     `json:"user_id"`
	ParentID  *int    `json:"parent_id"`
	Name      string  `json:"name"`
	IsFolder  bool    `json:"is_folder"`
	Size      int64   `json:"size"`
	MimeType  *string `json:"mime_type,omitempty"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

type timelinePage struct {
	Items   []DriveNodeRef `json:"items"`
	Limit   int            `json:"limit"`
	Offset  int            `json:"offset"`
	HasMore bool           `json:"has_more"`
}

func setupRouter(db *sql.DB) *gin.Engine {
	h := &Handler{db: db}
	r := gin.Default()
	r.SetTrustedProxies(nil)
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "photos"})
	})
	r.GET("/photos/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "photos"})
	})
	r.Use(h.requireUserID)
	r.GET("/photos/timeline", h.listTimeline)
	return r
}

func main() {
	_ = godotenv.Load()
	dbURL := os.Getenv("DATABASE_URL")
	var db *sql.DB
	if dbURL != "" {
		var err error
		db, err = sql.Open("postgres", dbURL)
		if err != nil {
			log.Fatal("db:", err)
		}
		defer db.Close()
		if err := db.Ping(); err != nil {
			log.Fatal("ping:", err)
		}
	}
	r := setupRouter(db)
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}
	log.Println("Photos service listening on", port)
	r.Run(":" + port)
}

type Handler struct {
	db *sql.DB
}

func (h *Handler) requireUserID(c *gin.Context) {
	if c.FullPath() == "/health" || c.FullPath() == "/photos/health" {
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
		_, err = h.db.Exec("SELECT set_config('app.current_user_id', $1, false)", uid)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to set user context"})
			return
		}
	}
	c.Next()
}

func (h *Handler) listTimeline(c *gin.Context) {
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
		c.JSON(http.StatusOK, timelinePage{Items: []DriveNodeRef{}, Limit: limit, Offset: offset, HasMore: false})
		return
	}
	fetch := limit + 1
	rows, err := h.db.Query(`
		SELECT id, tenant_id, user_id, parent_id, name, is_folder, size, mime_type, created_at::text, COALESCE(updated_at::text, '')
		FROM drive_nodes
		WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
		  AND deleted_at IS NULL
		  AND is_folder = false
		  AND (
			LOWER(COALESCE(mime_type, '')) LIKE 'image/%'
			OR LOWER(name) ~ '\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif|tiff|tif)$'
		  )
		ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST, id DESC
		LIMIT $1 OFFSET $2
	`, fetch, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var list []DriveNodeRef
	for rows.Next() {
		var n DriveNodeRef
		var pid sql.NullInt64
		var mime sql.NullString
		var uat string
		if err := rows.Scan(&n.ID, &n.TenantID, &n.UserID, &pid, &n.Name, &n.IsFolder, &n.Size, &mime, &n.CreatedAt, &uat); err != nil {
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
	hasMore := len(list) > limit
	if hasMore {
		list = list[:limit]
	}
	c.JSON(http.StatusOK, timelinePage{Items: list, Limit: limit, Offset: offset, HasMore: hasMore})
}
