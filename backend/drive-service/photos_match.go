package main

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type photoFingerprint struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Size        int64  `json:"size"`
	ContentHash string `json:"content_hash,omitempty"`
	TakenAt     string `json:"taken_at,omitempty"`
}

type photoMatchCandidate struct {
	Name        string `json:"name"`
	Size        int64  `json:"size"`
	ContentHash string `json:"content_hash,omitempty"`
}

type photoMatchResult struct {
	Index     int    `json:"index"`
	NodeID    int    `json:"node_id"`
	MatchedBy string `json:"matched_by"`
}

type photoMatchResponse struct {
	Matches       []photoMatchResult `json:"matches"`
	CloudOnlyIDs  []int              `json:"cloud_only_ids,omitempty"`
	IndexTotal    int                `json:"index_total"`
}

const photosTreeCTE = `
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
)`

func normalizePhotoFileName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

// GET /drive/photos/fingerprints — index cloud pour matching local.
func (h *Handler) listPhotosFingerprints(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, []photoFingerprint{})
		return
	}
	ctx := c.Request.Context()
	rows, err := h.dbex(ctx).Query(photosTreeCTE + `
SELECT f.id, f.name, f.size, COALESCE(f.content_hash, ''), COALESCE(f.taken_at::text, '')
FROM drive_nodes f
WHERE f.user_id = current_setting('app.current_user_id', true)::INTEGER
  AND f.deleted_at IS NULL
  AND f.is_folder = false
  AND f.parent_id IN (SELECT id FROM photos_tree)
ORDER BY f.id
`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	list := make([]photoFingerprint, 0)
	for rows.Next() {
		var fp photoFingerprint
		if err := rows.Scan(&fp.ID, &fp.Name, &fp.Size, &fp.ContentHash, &fp.TakenAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		list = append(list, fp)
	}
	if list == nil {
		list = []photoFingerprint{}
	}
	c.JSON(http.StatusOK, list)
}

// POST /drive/photos/match — rapproche des empreintes locales avec le cloud.
func (h *Handler) matchPhotos(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, photoMatchResponse{Matches: []photoMatchResult{}, IndexTotal: 0})
		return
	}
	var body struct {
		Items []photoMatchCandidate `json:"items"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "items required"})
		return
	}
	if len(body.Items) > 500 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "max 500 items per request"})
		return
	}

	ctx := c.Request.Context()
	rows, err := h.dbex(ctx).Query(photosTreeCTE + `
SELECT f.id, f.name, f.size, COALESCE(f.content_hash, '')
FROM drive_nodes f
WHERE f.user_id = current_setting('app.current_user_id', true)::INTEGER
  AND f.deleted_at IS NULL
  AND f.is_folder = false
  AND f.parent_id IN (SELECT id FROM photos_tree)
`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type cloudEntry = photoCloudEntry
	byHash := map[string][]cloudEntry{}
	byNameSize := map[string][]cloudEntry{}
	var cloudIDs []int
	for rows.Next() {
		var e cloudEntry
		if err := rows.Scan(&e.id, &e.name, &e.size, &e.contentHash); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		cloudIDs = append(cloudIDs, e.id)
		if e.contentHash != "" {
			byHash[e.contentHash] = append(byHash[e.contentHash], e)
		}
		key := normalizePhotoFileName(e.name) + "|" + itoa64(e.size)
		byNameSize[key] = append(byNameSize[key], e)
	}

	used := map[int]bool{}
	matches := make([]photoMatchResult, 0)
	for i, item := range body.Items {
		if picked := pickPhotoMatch(item, byHash, byNameSize, used); picked != nil {
			matches = append(matches, photoMatchResult{
				Index:     i,
				NodeID:    picked.id,
				MatchedBy: picked.matchedBy,
			})
			used[picked.id] = true
		}
	}

	localMatched := used
	cloudOnly := make([]int, 0)
	for _, id := range cloudIDs {
		if !localMatched[id] {
			cloudOnly = append(cloudOnly, id)
		}
	}

	c.JSON(http.StatusOK, photoMatchResponse{
		Matches:      matches,
		CloudOnlyIDs: cloudOnly,
		IndexTotal:   len(cloudIDs),
	})
}

type pickedMatch struct {
	id        int
	matchedBy string
}

type photoCloudEntry struct {
	id          int
	name        string
	size        int64
	contentHash string
}

func pickPhotoMatch(
	item photoMatchCandidate,
	byHash map[string][]photoCloudEntry,
	byNameSize map[string][]photoCloudEntry,
	used map[int]bool,
) *pickedMatch {
	hash := strings.ToLower(strings.TrimSpace(item.ContentHash))
	if hash != "" {
		for _, e := range byHash[hash] {
			if used[e.id] {
				continue
			}
			return &pickedMatch{id: e.id, matchedBy: "content_hash"}
		}
	}
	key := normalizePhotoFileName(item.Name) + "|" + itoa64(item.Size)
	for _, e := range byNameSize[key] {
		if used[e.id] {
			continue
		}
		return &pickedMatch{id: e.id, matchedBy: "name_size"}
	}
	return nil
}

func itoa64(v int64) string {
	return strconv.FormatInt(v, 10)
}
