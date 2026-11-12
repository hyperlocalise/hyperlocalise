package main

import (
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/keymeta"
)

var keyStoreErrorResponses = []storeErrorResponse{
	{errNoStringsMatched, http.StatusBadRequest, "no_strings_matched", "No strings match the selection"},
	{errTooManyStringsSelected, http.StatusBadRequest, "too_many_strings", "The selection matches more than 1,000 strings (a key name matches in every file); narrow it"},
	{errNotKeyJob, http.StatusConflict, "not_key_job", "Only key jobs have strings and languages to change"},
	{errKeyJobClosed, http.StatusConflict, "job_not_open", "The job is no longer open"},
	{errKeyJobTooManyStrings, http.StatusBadRequest, "too_many_strings", "A key job holds at most 5,000 strings"},
	{errKeyJobNeedsStrings, http.StatusConflict, "job_needs_strings", "A key job must keep at least one string"},
	{errKeyJobTooManyLocales, http.StatusBadRequest, "too_many_locales", "A key job holds at most 20 locales"},
	{errKeyJobNeedsLocale, http.StatusConflict, "job_needs_locale", "A key job must keep at least one locale"},
	{errKeyJobLocaleNotIncluded, http.StatusNotFound, "locale_not_in_job", "Locale is not a locale of the job"},
}

func writeKeyStoreError(w http.ResponseWriter, err error, operation string) {
	for _, response := range keyStoreErrorResponses {
		if errors.Is(err, response.err) {
			writeError(w, response.status, response.code, response.message)
			return
		}
	}
	writeJobStoreError(w, err, operation)
}

// selectorBody picks strings by id or key name, plus tags where a route allows them.
type selectorBody struct {
	StringIDs []string `json:"stringIds"`
	Keys      []string `json:"keys"`
	Tags      []string `json:"tags"`
}

// selector checks the body names strings one way: ids, keys, or (when allowed) tags.
func (b selectorBody) selector(allowTags bool) (stringSelector, bool) {
	ways := 0
	for _, list := range [][]string{b.StringIDs, b.Keys, b.Tags} {
		if len(list) > 0 {
			ways++
		}
	}
	if ways != 1 || (!allowTags && len(b.Tags) > 0) || len(b.StringIDs) > maxSelectedStrings ||
		!validKeyNames(b.Keys, maxSelectedStrings) || !keymeta.ValidTags(b.Tags, maxTagFilters) {
		return stringSelector{}, false
	}
	for _, id := range b.StringIDs {
		if _, err := uuid.Parse(id); err != nil {
			return stringSelector{}, false
		}
	}
	return stringSelector(b), true
}

// canEditKeyDetails follows the content editor: tags and the design link describe the string
// itself, so the roles that manage a project's strings change them and others only read them.
func canEditKeyDetails(role string) bool {
	switch role {
	case "admin", "localization_manager", "developer":
		return true
	default:
		return false
	}
}

const selectorMessage = "Pick strings with one of stringIds, keys, or tags (at most 1,000 ids or keys, 10 tags)"

func (s apiServer) projectStringsBulkUpdate(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodPost) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "strings:write")
	if !ok {
		return
	}
	if !canEditKeyDetails(p.Role) {
		writeError(w, http.StatusForbidden, "forbidden", "Only admins, localization managers and developers can change tags and design links")
		return
	}
	var body struct {
		selectorBody
		AddTags    []string       `json:"addTags"`
		RemoveTags []string       `json:"removeTags"`
		DesignURL  optionalString `json:"designUrl"`
	}
	if !decodeJSONBodyLimit(w, r, &body, maxStringBatchBodyBytes) {
		return
	}
	sel, valid := body.selector(true)
	if !valid {
		writeError(w, http.StatusBadRequest, "invalid_body", selectorMessage)
		return
	}
	if body.DesignURL.Value != nil {
		trimmed := strings.TrimSpace(*body.DesignURL.Value)
		body.DesignURL.Value = &trimmed
	}
	noChange := len(body.AddTags) == 0 && len(body.RemoveTags) == 0 && !body.DesignURL.Set
	if noChange || !keymeta.ValidTags(body.AddTags, keymeta.MaxTagsPerChange) || !keymeta.ValidTags(body.RemoveTags, keymeta.MaxTagsPerChange) ||
		(body.DesignURL.Value != nil && !keymeta.ValidDesignURL(*body.DesignURL.Value)) {
		writeError(w, http.StatusBadRequest, "invalid_body",
			"Send addTags, removeTags (at most 20 each; letters, digits, _ and -, up to 64 characters), or designUrl (an http or https address, or null)")
		return
	}
	updated, err := s.store.bulkUpdateStrings(r.Context(), p, projectID, stringBulkUpdate{
		Select: sel, AddTags: body.AddTags, RemoveTags: body.RemoveTags, DesignURL: body.DesignURL,
	})
	if err != nil {
		writeKeyStoreError(w, err, "bulk update strings")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Updated int `json:"updated"`
	}{updated})
}

func (s apiServer) projectTranslationsApprove(w http.ResponseWriter, r *http.Request) {
	s.reviewTranslations(w, r, reviewApprove)
}

func (s apiServer) projectTranslationsSendToReview(w http.ResponseWriter, r *http.Request) {
	s.reviewTranslations(w, r, reviewSendToReview)
}

func (s apiServer) reviewTranslations(w http.ResponseWriter, r *http.Request, change reviewChange) {
	if !allowMethods(w, r, http.MethodPost) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	// As in the app, approving is a review decision; sending back to review is an edit anyone
	// who edits translations may make.
	permission := "strings:write"
	if change == reviewApprove {
		permission = "translations:approve"
	}
	p, ok := s.authenticateWithStore(w, r, permission)
	if !ok {
		return
	}
	var body struct {
		selectorBody
		Locales []string `json:"locales"`
	}
	if !decodeJSONBodyLimit(w, r, &body, maxStringBatchBodyBytes) {
		return
	}
	sel, valid := body.selector(true)
	validLocales := len(body.Locales) <= 50
	for _, locale := range body.Locales {
		validLocales = validLocales && locale != "" && len(locale) <= maxLocaleLength
	}
	if !valid || !validLocales {
		writeError(w, http.StatusBadRequest, "invalid_body", selectorMessage+"; locales holds at most 50 locales")
		return
	}
	updated, err := s.store.reviewTranslations(r.Context(), p, projectID, sel, body.Locales, change)
	if err != nil {
		writeKeyStoreError(w, err, "review translations")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Updated int `json:"updated"`
	}{updated})
}

func (s apiServer) jobStrings(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodPost, http.MethodDelete) {
		return
	}
	jobID, ok := pathID(w, r, "jobId")
	if !ok {
		return
	}
	if r.Method == http.MethodGet {
		p, ok := s.authenticateWithStore(w, r, "jobs:read")
		if !ok {
			return
		}
		// The strings' text is string content, which a jobs-only key does not read.
		if !contains(p.Permissions, "strings:read") {
			writeError(w, http.StatusForbidden, "forbidden", "Missing required permission: strings:read")
			return
		}
		page, valid := parsePagination(w, r.URL.Query(), 50)
		if !valid {
			return
		}
		items, total, err := s.store.listJobStrings(r.Context(), p, jobID, page.Limit, page.Offset)
		if err != nil {
			writeKeyStoreError(w, err, "list job strings")
			return
		}
		page.Total = total
		writeJSON(w, http.StatusOK, struct {
			Strings    []translationString `json:"strings"`
			Pagination pagination          `json:"pagination"`
		}{items, page})
		return
	}
	p, ok := s.authenticateWithStore(w, r, "jobs:write")
	if !ok {
		return
	}
	var body selectorBody
	if !decodeJSONBodyLimit(w, r, &body, maxStringBatchBodyBytes) {
		return
	}
	sel, valid := body.selector(true)
	if !valid {
		writeError(w, http.StatusBadRequest, "invalid_body", selectorMessage)
		return
	}
	if r.Method == http.MethodPost {
		added, err := s.store.addJobStrings(r.Context(), p, jobID, sel)
		if err != nil {
			writeKeyStoreError(w, err, "add job strings")
			return
		}
		writeJSON(w, http.StatusOK, struct {
			Added int `json:"added"`
		}{added})
		return
	}
	removed, err := s.store.removeJobStrings(r.Context(), p, jobID, sel)
	if err != nil {
		writeKeyStoreError(w, err, "remove job strings")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Removed int `json:"removed"`
	}{removed})
}

type jobLocalesResponse struct {
	Locales []jobLocaleProgress `json:"locales"`
}

func (s apiServer) jobLocales(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodPost) {
		return
	}
	jobID, ok := pathID(w, r, "jobId")
	if !ok {
		return
	}
	if r.Method == http.MethodGet {
		p, ok := s.authenticateWithStore(w, r, "jobs:read")
		if !ok {
			return
		}
		locales, err := s.store.jobLocales(r.Context(), p, jobID)
		if err != nil {
			writeKeyStoreError(w, err, "list job locales")
			return
		}
		writeJSON(w, http.StatusOK, jobLocalesResponse{locales})
		return
	}
	p, ok := s.authenticateWithStore(w, r, "jobs:write")
	if !ok {
		return
	}
	var body struct {
		Locale string `json:"locale"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	locale := strings.TrimSpace(body.Locale)
	if locale == "" || len(locale) > maxLocaleLength {
		writeError(w, http.StatusBadRequest, "invalid_body", "locale is required")
		return
	}
	locales, err := s.store.addJobLocale(r.Context(), p, jobID, locale)
	if err != nil {
		writeKeyStoreError(w, err, "add job locale")
		return
	}
	writeJSON(w, http.StatusOK, jobLocalesResponse{locales})
}

func (s apiServer) jobLocale(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodDelete) {
		return
	}
	jobID, ok := pathID(w, r, "jobId")
	if !ok {
		return
	}
	locale := r.PathValue("locale")
	if locale == "" || len(locale) > maxLocaleLength {
		writeError(w, http.StatusNotFound, "not_found", "Route not found")
		return
	}
	p, ok := s.authenticateWithStore(w, r, "jobs:write")
	if !ok {
		return
	}
	locales, err := s.store.removeJobLocale(r.Context(), p, jobID, locale)
	if err != nil {
		writeKeyStoreError(w, err, "remove job locale")
		return
	}
	writeJSON(w, http.StatusOK, jobLocalesResponse{locales})
}
