package main

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
)

var projectAdminErrorResponses = []storeErrorResponse{
	{errInvalidTargetLocales, http.StatusBadRequest, "invalid_target_locales", "targetLocales must hold 1 to 50 valid locale tags"},
	{errSourceInTargets, http.StatusBadRequest, "source_in_targets", "targetLocales cannot include the project source locale"},
	{errStringSourceTextRequired, http.StatusBadRequest, "invalid_body", "sourceText is required to create a string"},
}

func writeProjectAdminStoreError(w http.ResponseWriter, err error, operation string) {
	var item errStringBatchItem
	if errors.As(err, &item) {
		w.Header().Set("X-Failed-Item", strconv.Itoa(item.index))
	}
	for _, response := range projectAdminErrorResponses {
		if errors.Is(err, response.err) {
			writeError(w, response.status, response.code, response.message)
			return
		}
	}
	writeStoreError(w, err, operation)
}

// projectDetail serves GET through project and PATCH through updateProject.
func (s apiServer) projectDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		s.project(w, r)
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "projects:write")
	if !ok {
		return
	}
	var body struct {
		Name               *string  `json:"name"`
		Description        *string  `json:"description"`
		TranslationContext *string  `json:"translationContext"`
		TargetLocales      []string `json:"targetLocales"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	if body.Name != nil {
		trimmed := strings.TrimSpace(*body.Name)
		body.Name = &trimmed
	}
	empty := body.Name == nil && body.Description == nil && body.TranslationContext == nil && body.TargetLocales == nil
	if empty || (body.Name != nil && (*body.Name == "" || len(*body.Name) > 200)) ||
		!validOptionalText(body.Description, 10_000) || !validOptionalText(body.TranslationContext, 20_000) ||
		len(body.TargetLocales) > 200 {
		writeError(w, http.StatusBadRequest, "invalid_body", "Provide name, description, translationContext, or targetLocales with valid values")
		return
	}
	item, err := s.store.updateProject(r.Context(), p, projectID, projectPatch(body))
	if err != nil {
		writeProjectAdminStoreError(w, err, "update project")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Project project `json:"project"`
	}{item})
}

type stringUpsertBody struct {
	Key        string         `json:"key"`
	FilePath   *string        `json:"filePath"`
	SourceText *string        `json:"sourceText"`
	Context    optionalString `json:"context"`
	Type       optionalString `json:"type"`
	MaxLength  optionalInt    `json:"maxLength"`
	Hidden     *bool          `json:"hidden"`
}

// projectStringsBatch creates or updates up to 500 strings, matched by key and file, in one
// transaction.
func (s apiServer) projectStringsBatch(w http.ResponseWriter, r *http.Request) {
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
	var body struct {
		Strings []stringUpsertBody `json:"strings"`
	}
	if !decodeJSONBodyLimit(w, r, &body, maxStringBatchBodyBytes) {
		return
	}
	if len(body.Strings) == 0 || len(body.Strings) > maxStringBatchSize {
		writeError(w, http.StatusBadRequest, "invalid_body", "strings must hold 1 to 500 items")
		return
	}
	items := make([]stringUpsert, len(body.Strings))
	for i, raw := range body.Strings {
		item := stringUpsert{
			Key:        strings.TrimSpace(raw.Key),
			FilePath:   trimmedOrNil(raw.FilePath),
			SourceText: raw.SourceText,
			Context:    optionalString{Set: raw.Context.Set, Value: trimmedOrNil(raw.Context.Value)},
			Type:       optionalString{Set: raw.Type.Set, Value: trimmedOrNil(raw.Type.Value)},
			MaxLength:  raw.MaxLength,
			Hidden:     raw.Hidden,
		}
		if item.SourceText != nil {
			trimmed := strings.TrimSpace(*item.SourceText)
			item.SourceText = &trimmed
		}
		if item.Key == "" || len(item.Key) > 1000 || (item.SourceText != nil && (*item.SourceText == "" || len(*item.SourceText) > maxSourceTextBytes)) ||
			!validOptionalText(item.Context.Value, 10_000) || !validOptionalText(item.Type.Value, 64) ||
			!validOptionalText(item.FilePath, maxFilePathLength) || !validMaxLength(item.MaxLength.Value) {
			w.Header().Set("X-Failed-Item", strconv.Itoa(i))
			writeError(w, http.StatusBadRequest, "invalid_body", "strings["+strconv.Itoa(i)+"] has an invalid key, sourceText, context, type, maxLength, or filePath")
			return
		}
		items[i] = item
	}
	result, err := s.store.upsertStrings(r.Context(), p, projectID, items)
	if err != nil {
		writeProjectAdminStoreError(w, err, "upsert strings")
		return
	}
	writeJSON(w, http.StatusOK, result)
}
