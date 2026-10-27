package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	guidelinepg "github.com/hyperlocalise/hyperlocalise/internal/guidelines/postgres"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/sync/errgroup"
)

const (
	guidelineRetrieveBodyLimit   = 64 << 10
	guidelineRetrieveTimeout     = 15 * time.Second
	guidelineRetrieveMaxLocales  = 8
	guidelineRetrieveMaxLimit    = 16
	guidelineRetrieveDefault     = 8
	guidelineRetrieveConcurrency = 4
	guidelineRetrieveMaxQuery    = 16000
)

type guidelineRetriever interface {
	Retrieve(ctx context.Context, scope guidelines.Scope, text string, limit int) (guidelines.Result, error)
}

// guidelineRetrieveAPI returns uploaded guideline documents for translation
// prompts. Typed workspace and project guidelines are excluded because the web
// app already selects them.
type guidelineRetrieveAPI struct {
	retriever guidelineRetriever
	pool      *pgxpool.Pool
}

type guidelineRetrievePayload struct {
	OrganizationID string   `json:"organizationId"`
	ProjectID      *string  `json:"projectId"`
	Locales        []string `json:"locales"`
	Query          string   `json:"query"`
	Limit          int      `json:"limit"`
}

type retrievedGuidelineDocument struct {
	ID         string `json:"id"`
	RevisionID string `json:"revisionId"`
	Version    int    `json:"version"`
	Title      string `json:"title"`
	Locale     string `json:"locale,omitempty"`
	Mandatory  bool   `json:"mandatory"`
	Content    string `json:"content,omitempty"`
}

type retrievedGuidelinePassage struct {
	ID         string `json:"id"`
	DocumentID string `json:"documentId"`
	Text       string `json:"text"`
}

type guidelineRetrieveResult struct {
	Documents       []retrievedGuidelineDocument `json:"documents"`
	Passages        []retrievedGuidelinePassage  `json:"passages"`
	SearchAvailable bool                         `json:"searchAvailable"`
}

func invalidGuidelineRetrieve(field string) error {
	return knowledgeMemoryFailureDetails(400, "invalid_guideline_retrieve", "Guideline retrieval request is invalid", map[string]any{"field": field})
}

// internalRetrieve serves trusted server callers, which authorize the
// organization and project before calling.
func (api *guidelineRetrieveAPI) internalRetrieve(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	ctx, cancel := context.WithTimeout(r.Context(), guidelineRetrieveTimeout)
	defer cancel()
	r.Body = http.MaxBytesReader(w, r.Body, guidelineRetrieveBodyLimit)
	var payload guidelineRetrievePayload
	if err := decodeSingleJSON(r.Body, &payload); err != nil {
		writeKnowledgeMemoryError(w, r, invalidGuidelineRetrieve("body"))
		return
	}
	result, err := api.retrieve(ctx, payload)
	if err != nil {
		writeKnowledgeMemoryError(w, r, err)
		return
	}
	writeKnowledgeMemoryJSON(w, http.StatusOK, result)
}

func (api *guidelineRetrieveAPI) retrieve(ctx context.Context, payload guidelineRetrievePayload) (guidelineRetrieveResult, error) {
	organizationID := strings.TrimSpace(payload.OrganizationID)
	if _, err := uuid.Parse(organizationID); err != nil {
		return guidelineRetrieveResult{}, invalidGuidelineRetrieve("organizationId")
	}
	query := strings.TrimSpace(payload.Query)
	if len(query) > guidelineRetrieveMaxQuery {
		return guidelineRetrieveResult{}, invalidGuidelineRetrieve("query")
	}
	limit := payload.Limit
	if limit == 0 {
		limit = guidelineRetrieveDefault
	}
	if limit < 1 || limit > guidelineRetrieveMaxLimit {
		return guidelineRetrieveResult{}, invalidGuidelineRetrieve("limit")
	}
	locales, err := normalizeRetrieveLocales(payload.Locales)
	if err != nil {
		return guidelineRetrieveResult{}, err
	}
	scope := guidelines.Scope{OrganizationID: organizationID}
	if payload.ProjectID != nil {
		projectID := strings.TrimSpace(*payload.ProjectID)
		var exists bool
		if err := api.pool.QueryRow(ctx, `select exists (select 1 from projects where id = $1 and organization_id = $2)`, projectID, organizationID).Scan(&exists); err != nil {
			return guidelineRetrieveResult{}, err
		}
		if !exists {
			return guidelineRetrieveResult{}, knowledgeMemoryFailure(404, "project_not_found", "Project not found")
		}
		scope.ProjectID = projectID
	}

	// Typed guidelines share the ranking, so over-fetch before filtering them out.
	searchLimit := min(2*limit, 32)
	results := make([]guidelines.Result, len(locales))
	group, groupCtx := errgroup.WithContext(ctx)
	group.SetLimit(guidelineRetrieveConcurrency)
	for i, locale := range locales {
		localeScope := scope
		localeScope.Locale = locale
		group.Go(func() error {
			result, err := api.retriever.Retrieve(groupCtx, localeScope, query, searchLimit)
			results[i] = result
			return err
		})
	}
	if err := group.Wait(); err != nil {
		if errors.Is(err, guidelines.ErrInvalidInput) {
			return guidelineRetrieveResult{}, invalidGuidelineRetrieve("query")
		}
		slog.WarnContext(ctx, "guideline_retrieve_failed", "organization_id", organizationID, "project_id", scope.ProjectID, "locales", len(locales), "error", err)
		return guidelineRetrieveResult{}, knowledgeMemoryFailure(503, "guideline_retrieve_failed", "Guideline retrieval failed")
	}
	return api.merge(ctx, scope, locales, results, limit)
}

func normalizeRetrieveLocales(raw []string) ([]string, error) {
	if len(raw) > guidelineRetrieveMaxLocales {
		return nil, invalidGuidelineRetrieve("locales")
	}
	locales := make([]string, 0, len(raw))
	seen := make(map[string]bool, len(raw))
	for _, value := range raw {
		locale, err := guidelines.NormalizeLocale(value)
		if err != nil || locale == "" {
			return nil, invalidGuidelineRetrieve("locales")
		}
		if !seen[locale] {
			seen[locale] = true
			locales = append(locales, locale)
		}
	}
	if len(locales) == 0 {
		locales = append(locales, "")
	}
	return locales, nil
}

type collectedGuidelines struct {
	mandatory map[string]string
	// revisions holds the revision each document was retrieved at, or "" when
	// per-locale retrievals saw different revisions.
	revisions       map[string]string
	order           []string
	passages        []retrievedGuidelinePassage
	searchAvailable bool
}

func (c *collectedGuidelines) noteRevision(documentID, revisionID string) {
	if previous, seen := c.revisions[documentID]; seen && previous != revisionID {
		c.revisions[documentID] = ""
		return
	}
	c.revisions[documentID] = revisionID
}

// collectUploaded keeps uploaded documents only. Mandatory documents are
// returned whole, so their passages are dropped; other passages interleave
// the per-locale rankings.
func collectUploaded(results []guidelines.Result, limit int) collectedGuidelines {
	collected := collectedGuidelines{mandatory: map[string]string{}, revisions: map[string]string{}, order: []string{}, passages: []retrievedGuidelinePassage{}, searchAvailable: len(results) > 0}
	for _, result := range results {
		collected.searchAvailable = collected.searchAvailable && result.SearchAvailable
		for _, doc := range result.Mandatory {
			if _, ok := uploadedRowID(doc.ID); !ok {
				continue
			}
			if _, seen := collected.mandatory[doc.ID]; !seen {
				collected.order = append(collected.order, doc.ID)
			}
			collected.mandatory[doc.ID] = doc.Content
			collected.noteRevision(doc.ID, doc.RevisionID)
		}
	}
	seenPassages := make(map[string]bool)
	referenced := make(map[string]bool)
	for rank := 0; len(collected.passages) < limit; rank++ {
		progressed := false
		for _, result := range results {
			if rank >= len(result.Passages) || len(collected.passages) == limit {
				continue
			}
			progressed = true
			passage := result.Passages[rank]
			if _, ok := uploadedRowID(passage.DocumentID); !ok || seenPassages[passage.ID] {
				continue
			}
			if _, whole := collected.mandatory[passage.DocumentID]; whole {
				continue
			}
			seenPassages[passage.ID] = true
			collected.noteRevision(passage.DocumentID, passage.RevisionID)
			if !referenced[passage.DocumentID] {
				referenced[passage.DocumentID] = true
				collected.order = append(collected.order, passage.DocumentID)
			}
			collected.passages = append(collected.passages, retrievedGuidelinePassage{ID: passage.ID, DocumentID: passage.DocumentID, Text: passage.Text})
		}
		if !progressed {
			break
		}
	}
	return collected
}

// mergeQuery reloads metadata only for rows that are still ready and in the
// requested project and locale scope. An empty locale matches unscoped rows only.
const mergeQuery = `
        select id::text, revision_id::text, version, title, coalesce(locale, '')
        from guideline_documents
        where organization_id::text = $1 and id::text = any($2) and status = 'ready'
          and (project_id is null or project_id = $3)
          and (locale is null or locale = any($4))`

// merge adds titles and locales, dropping documents that were deleted, left
// ready status or scope, or got a new revision since retrieval.
func (api *guidelineRetrieveAPI) merge(ctx context.Context, scope guidelines.Scope, locales []string, results []guidelines.Result, limit int) (guidelineRetrieveResult, error) {
	collected := collectUploaded(results, limit)
	merged := guidelineRetrieveResult{Documents: []retrievedGuidelineDocument{}, Passages: []retrievedGuidelinePassage{}, SearchAvailable: collected.searchAvailable}
	order, mandatory := collected.order, collected.mandatory
	if len(order) == 0 {
		return merged, nil
	}
	rowIDs := make([]string, 0, len(order))
	for _, id := range order {
		rowID, _ := uploadedRowID(id)
		rowIDs = append(rowIDs, rowID)
	}
	rows, err := api.pool.Query(ctx, mergeQuery, scope.OrganizationID, rowIDs, scope.ProjectID, locales)
	if err != nil {
		return guidelineRetrieveResult{}, err
	}
	defer rows.Close()
	type metadata struct {
		revisionID, title, locale string
		version                   int
	}
	byID := make(map[string]metadata, len(rowIDs))
	for rows.Next() {
		var rowID string
		var meta metadata
		if err := rows.Scan(&rowID, &meta.revisionID, &meta.version, &meta.title, &meta.locale); err != nil {
			return guidelineRetrieveResult{}, err
		}
		id := guidelinepg.UploadedDocumentID(rowID)
		if retrieved := collected.revisions[id]; retrieved == "" || retrieved != meta.revisionID {
			continue
		}
		byID[id] = meta
	}
	if err := rows.Err(); err != nil {
		return guidelineRetrieveResult{}, err
	}
	for _, id := range order {
		meta, ok := byID[id]
		if !ok {
			continue
		}
		content, isMandatory := mandatory[id]
		merged.Documents = append(merged.Documents, retrievedGuidelineDocument{
			ID: id, RevisionID: meta.revisionID, Version: meta.version, Title: meta.title, Locale: meta.locale,
			Mandatory: isMandatory, Content: content,
		})
	}
	for _, passage := range collected.passages {
		if _, ok := byID[passage.DocumentID]; ok {
			merged.Passages = append(merged.Passages, passage)
		}
	}
	return merged, nil
}

func uploadedRowID(documentID string) (string, bool) {
	rowID, ok := strings.CutPrefix(documentID, guidelinepg.UploadedDocumentID(""))
	return rowID, ok && rowID != ""
}
