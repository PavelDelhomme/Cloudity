package main

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

type storageServiceUsage struct {
	Label     string `json:"label"`
	Bytes     int64  `json:"bytes"`
	FileCount int64  `json:"file_count"`
}

type storageSummaryResponse struct {
	Photos storageServiceUsage `json:"photos"`
	Drive  storageServiceUsage `json:"drive"`
	Mail   *storageServiceUsage `json:"mail,omitempty"`
	Note   string              `json:"note,omitempty"`
}

func (h *Handler) getStorageSummary(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, storageSummaryResponse{
			Photos: storageServiceUsage{Label: "Photos", Bytes: 0, FileCount: 0},
			Drive:  storageServiceUsage{Label: "Drive (hors dossier Photos)", Bytes: 0, FileCount: 0},
			Note:   "Base de données indisponible — totaux à zéro.",
		})
		return
	}

	ctx := c.Request.Context()
	var photosBytes, photosCount, driveBytes, driveCount int64

	err := h.db.QueryRowContext(ctx, `
WITH RECURSIVE photos_tree AS (
  SELECT id
  FROM drive_nodes
  WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
    AND parent_id IS NULL
    AND deleted_at IS NULL
    AND is_folder = true
    AND LOWER(TRIM(name)) = 'photos'
  UNION ALL
  SELECT n.id
  FROM drive_nodes n
  INNER JOIN photos_tree pt ON n.parent_id = pt.id
  WHERE n.user_id = current_setting('app.current_user_id', true)::INTEGER
    AND n.deleted_at IS NULL
)
SELECT
  COALESCE((
    SELECT SUM(f.size)
    FROM drive_nodes f
    WHERE f.user_id = current_setting('app.current_user_id', true)::INTEGER
      AND f.deleted_at IS NULL
      AND f.is_folder = false
      AND f.parent_id IN (SELECT id FROM photos_tree)
  ), 0),
  COALESCE((
    SELECT COUNT(*)
    FROM drive_nodes f
    WHERE f.user_id = current_setting('app.current_user_id', true)::INTEGER
      AND f.deleted_at IS NULL
      AND f.is_folder = false
      AND f.parent_id IN (SELECT id FROM photos_tree)
  ), 0),
  COALESCE((
    SELECT SUM(f.size)
    FROM drive_nodes f
    WHERE f.user_id = current_setting('app.current_user_id', true)::INTEGER
      AND f.deleted_at IS NULL
      AND f.is_folder = false
      AND (
        NOT EXISTS (SELECT 1 FROM photos_tree)
        OR f.parent_id IS NULL
        OR f.parent_id NOT IN (SELECT id FROM photos_tree)
      )
  ), 0),
  COALESCE((
    SELECT COUNT(*)
    FROM drive_nodes f
    WHERE f.user_id = current_setting('app.current_user_id', true)::INTEGER
      AND f.deleted_at IS NULL
      AND f.is_folder = false
      AND (
        NOT EXISTS (SELECT 1 FROM photos_tree)
        OR f.parent_id IS NULL
        OR f.parent_id NOT IN (SELECT id FROM photos_tree)
      )
  ), 0)
`).Scan(&photosBytes, &photosCount, &driveBytes, &driveCount)
	if err != nil && err != sql.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	resp := storageSummaryResponse{
		Photos: storageServiceUsage{
			Label:     "Photos",
			Bytes:     photosBytes,
			FileCount: photosCount,
		},
		Drive: storageServiceUsage{
			Label:     "Drive (hors dossier Photos)",
			Bytes:     driveBytes,
			FileCount: driveCount,
		},
	}
	if mailUsage, mailErr := h.queryMailStorageUsage(ctx); mailErr == nil {
		resp.Mail = &mailUsage
	} else {
		resp.Note = "Quota Mail indisponible pour ce compte."
	}
	c.JSON(http.StatusOK, resp)
}
