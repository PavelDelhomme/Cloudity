package main

import (
	"context"
	"database/sql"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const photosRootFolderName = "photos"

// photosRootExcludeSQL masque le dossier système Photos à la racine du Drive visible.
const photosRootExcludeSQL = `
AND NOT (
  n.parent_id IS NULL
  AND n.is_folder = true
  AND LOWER(TRIM(n.name)) = 'photos'
)`

// photosTreeExcludeSQL exclut tout l’arbre Photos (racine + descendants).
const photosTreeExcludeSQL = `
AND n.id NOT IN (
  WITH RECURSIVE photos_tree AS (
    SELECT id
    FROM drive_nodes
    WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
      AND parent_id IS NULL
      AND deleted_at IS NULL
      AND is_folder = true
      AND LOWER(TRIM(name)) = 'photos'
    UNION ALL
    SELECT c.id
    FROM drive_nodes c
    INNER JOIN photos_tree pt ON c.parent_id = pt.id
    WHERE c.user_id = current_setting('app.current_user_id', true)::INTEGER
      AND c.deleted_at IS NULL
  )
  SELECT id FROM photos_tree
)`

func isPhotosRootFolderName(name string) bool {
	return strings.TrimSpace(strings.ToLower(name)) == photosRootFolderName
}

func (h *Handler) isPhotosRootFolder(ctx context.Context, id int) (bool, error) {
	var name string
	var parentID sql.NullInt64
	err := h.dbex(ctx).QueryRow(`
		SELECT name, parent_id
		FROM drive_nodes
		WHERE id = $1
		  AND user_id = current_setting('app.current_user_id', true)::INTEGER
		  AND deleted_at IS NULL
	`, id).Scan(&name, &parentID)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return !parentID.Valid && isPhotosRootFolderName(name), nil
}

func (h *Handler) rejectPhotosRootMutation(c *gin.Context, id int) bool {
	if h.db == nil {
		return false
	}
	isRoot, err := h.isPhotosRootFolder(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return true
	}
	if isRoot {
		c.JSON(http.StatusForbidden, gin.H{
			"error":   "photos_system_folder_protected",
			"message": "Le dossier système Photos est géré par l’application Photos.",
		})
		return true
	}
	return false
}

// getPhotosSystemFolder — dossier racine Photos (pour backup / apps Photos).
func (h *Handler) getPhotosSystemFolder(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	ctx := c.Request.Context()
	var id int
	var name string
	err := h.dbex(ctx).QueryRow(`
		SELECT id, name
		FROM drive_nodes
		WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
		  AND parent_id IS NULL
		  AND deleted_at IS NULL
		  AND is_folder = true
		  AND LOWER(TRIM(name)) = 'photos'
		LIMIT 1
	`).Scan(&id, &name)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "photos_folder_not_found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id, "name": name, "is_folder": true})
}
