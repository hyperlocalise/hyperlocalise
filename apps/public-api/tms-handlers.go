package main

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"strings"
)

const maxRequestBodyBytes = 256 * 1024

var translationStatuses = []string{"draft", "needs_review", "approved", "rejected"}

type storeErrorResponse struct {
	err     error
	status  int
	code    string
	message string
}

var storeErrorResponses = []storeErrorResponse{
	{errProjectNotFound, http.StatusNotFound, "project_not_found", "Project not found"},
	{errStringNotFound, http.StatusNotFound, "string_not_found", "String not found"},
	{errTranslationNotFound, http.StatusNotFound, "translation_not_found", "Translation not found"},
	{errGlossaryNotFound, http.StatusNotFound, "glossary_not_found", "Glossary not found"},
	{errMemoryNotFound, http.StatusNotFound, "translation_memory_not_found", "Translation memory not found"},
	{errSourceFileNotFound, http.StatusBadRequest, "invalid_file_path", "filePath does not match a project source file"},
	{errProjectNotNative, http.StatusConflict, "project_not_native", "Strings of external TMS projects are managed in the provider"},
	{errStringKeyConflict, http.StatusConflict, "string_key_conflict", "A string with this key already exists"},
	{errLocaleNotInProject, http.StatusBadRequest, "invalid_locale", "Locale is not a target locale of the project"},
	{errSegmentLocked, http.StatusConflict, "segment_locked", "Segment is locked"},
	{errTranslationTooLong, http.StatusUnprocessableEntity, "translation_too_long", "Translation exceeds the string max length"},
}

func writeStoreError(w http.ResponseWriter, err error, operation string) {
	for _, response := range storeErrorResponses {
		if errors.Is(err, response.err) {
			writeError(w, response.status, response.code, response.message)
			return
		}
	}
	slog.Error(operation+" failed", "error", err)
	writeError(w, http.StatusServiceUnavailable, "service_unavailable", "Resource storage is temporarily unavailable")
}

func (s apiServer) projectLocales(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "strings:read")
	if !ok {
		return
	}
	locales, err := s.store.getProjectLocales(r.Context(), p, projectID)
	if err != nil {
		writeStoreError(w, err, "get project locales")
		return
	}
	writeJSON(w, http.StatusOK, locales)
}

func (s apiServer) projectStrings(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodPost) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	if r.Method == http.MethodPost {
		s.createString(w, r, projectID)
		return
	}
	p, ok := s.authenticateWithStore(w, r, "strings:read")
	if !ok {
		return
	}
	values := r.URL.Query()
	page, valid := parsePagination(w, values, 50)
	if !valid {
		return
	}
	filters := stringFilters{
		Search:   strings.TrimSpace(values.Get("search")),
		FilePath: strings.TrimSpace(values.Get("filePath")),
		Limit:    page.Limit,
		Offset:   page.Offset,
	}
	includeHidden := values.Get("includeHidden")
	filters.IncludeHidden = includeHidden == "true"
	if !member(includeHidden, "", "true", "false") || len(filters.Search) > 200 || len(filters.FilePath) > 2048 {
		writeError(w, http.StatusBadRequest, "invalid_query", "One or more query filters are invalid")
		return
	}
	items, total, err := s.store.listStrings(r.Context(), p, projectID, filters)
	if err != nil {
		writeStoreError(w, err, "list strings")
		return
	}
	page.Total = total
	writeJSON(w, http.StatusOK, struct {
		Strings    []translationString `json:"strings"`
		Pagination pagination          `json:"pagination"`
	}{items, page})
}

type stringCreateBody struct {
	Key        string  `json:"key"`
	SourceText string  `json:"sourceText"`
	Context    *string `json:"context"`
	Type       *string `json:"type"`
	MaxLength  *int    `json:"maxLength"`
	Hidden     bool    `json:"hidden"`
	FilePath   *string `json:"filePath"`
}

func (s apiServer) createString(w http.ResponseWriter, r *http.Request, projectID string) {
	p, ok := s.authenticateWithStore(w, r, "strings:write")
	if !ok {
		return
	}
	var body stringCreateBody
	if !decodeJSONBody(w, r, &body) {
		return
	}
	input := stringCreate{
		Key:        strings.TrimSpace(body.Key),
		SourceText: body.SourceText,
		Context:    trimmedOrNil(body.Context),
		Type:       trimmedOrNil(body.Type),
		MaxLength:  body.MaxLength,
		Hidden:     body.Hidden,
		FilePath:   trimmedOrNil(body.FilePath),
	}
	if input.Key == "" || len(input.Key) > 1000 || strings.TrimSpace(input.SourceText) == "" ||
		!validOptionalText(input.Context, 10_000) || !validOptionalText(input.Type, 64) ||
		!validOptionalText(input.FilePath, 2048) || !validMaxLength(input.MaxLength) {
		writeError(w, http.StatusBadRequest, "invalid_body", "key and sourceText are required; context, type, maxLength, or filePath is invalid")
		return
	}
	item, err := s.store.createString(r.Context(), p, projectID, input)
	if err != nil {
		writeStoreError(w, err, "create string")
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		String translationString `json:"string"`
	}{item})
}

func (s apiServer) projectString(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodPatch, http.MethodDelete) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	stringID, ok := pathID(w, r, "stringId")
	if !ok {
		return
	}
	permission := "strings:read"
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		permission = "strings:write"
	}
	p, ok := s.authenticateWithStore(w, r, permission)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodDelete:
		if err := s.store.deleteString(r.Context(), p, projectID, stringID); err != nil {
			writeStoreError(w, err, "delete string")
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	case http.MethodPatch:
		var body struct {
			SourceText *string        `json:"sourceText"`
			Context    optionalString `json:"context"`
			MaxLength  optionalInt    `json:"maxLength"`
			Hidden     *bool          `json:"hidden"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		body.Context.Value = trimmedOrNil(body.Context.Value)
		empty := body.SourceText == nil && !body.Context.Set && !body.MaxLength.Set && body.Hidden == nil
		if empty || (body.SourceText != nil && strings.TrimSpace(*body.SourceText) == "") ||
			!validOptionalText(body.Context.Value, 10_000) || !validMaxLength(body.MaxLength.Value) {
			writeError(w, http.StatusBadRequest, "invalid_body", "Provide sourceText, context, maxLength, or hidden with valid values")
			return
		}
		item, err := s.store.updateString(r.Context(), p, projectID, stringID, stringPatch(body))
		if err != nil {
			writeStoreError(w, err, "update string")
			return
		}
		writeJSON(w, http.StatusOK, struct {
			String translationString `json:"string"`
		}{item})
	default:
		item, err := s.store.getString(r.Context(), p, projectID, stringID)
		if err != nil {
			writeStoreError(w, err, "get string")
			return
		}
		writeJSON(w, http.StatusOK, struct {
			String translationString `json:"string"`
		}{item})
	}
}

func (s apiServer) stringTranslations(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	stringID, ok := pathID(w, r, "stringId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "strings:read")
	if !ok {
		return
	}
	items, err := s.store.listStringTranslations(r.Context(), p, projectID, stringID)
	if err != nil {
		writeStoreError(w, err, "list string translations")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Translations []translationRecord `json:"translations"`
	}{items})
}

func (s apiServer) stringTranslation(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodPut) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	stringID, ok := pathID(w, r, "stringId")
	if !ok {
		return
	}
	locale, ok := pathID(w, r, "locale")
	if !ok {
		return
	}
	if r.Method != http.MethodPut {
		p, ok := s.authenticateWithStore(w, r, "strings:read")
		if !ok {
			return
		}
		items, err := s.store.listStringTranslations(r.Context(), p, projectID, stringID)
		if err != nil {
			writeStoreError(w, err, "get translation")
			return
		}
		for _, item := range items {
			if item.Locale == locale {
				writeJSON(w, http.StatusOK, struct {
					Translation translationRecord `json:"translation"`
				}{item})
				return
			}
		}
		writeStoreError(w, errTranslationNotFound, "get translation")
		return
	}
	p, ok := s.authenticateWithStore(w, r, "strings:write")
	if !ok {
		return
	}
	var body struct {
		Text   *string `json:"text"`
		Status string  `json:"status"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	if body.Status == "" {
		body.Status = "draft"
	}
	if body.Text == nil || !member(body.Status, translationStatuses...) {
		writeError(w, http.StatusBadRequest, "invalid_body", "text is required and status must be draft, needs_review, approved, or rejected")
		return
	}
	item, err := s.store.putTranslation(r.Context(), p, projectID, stringID, locale, translationWrite{Text: *body.Text, Status: body.Status})
	if err != nil {
		writeStoreError(w, err, "save translation")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Translation translationRecord `json:"translation"`
	}{item})
}

func (s apiServer) projectTranslations(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "strings:read")
	if !ok {
		return
	}
	values := r.URL.Query()
	page, valid := parsePagination(w, values, 50)
	if !valid {
		return
	}
	filters := translationFilters{
		Locale: strings.TrimSpace(values.Get("locale")),
		Status: values.Get("status"),
		Limit:  page.Limit,
		Offset: page.Offset,
	}
	if len(filters.Locale) > 64 || (filters.Status != "" && !member(filters.Status, translationStatuses...)) {
		writeError(w, http.StatusBadRequest, "invalid_query", "One or more query filters are invalid")
		return
	}
	items, total, err := s.store.listTranslations(r.Context(), p, projectID, filters)
	if err != nil {
		writeStoreError(w, err, "list translations")
		return
	}
	page.Total = total
	writeJSON(w, http.StatusOK, struct {
		Translations []translationRecord `json:"translations"`
		Pagination   pagination          `json:"pagination"`
	}{items, page})
}

func (s apiServer) glossaries(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "glossaries:read")
	if !ok {
		return
	}
	page, valid := parsePagination(w, r.URL.Query(), 25)
	if !valid {
		return
	}
	items, total, err := s.store.listGlossaries(r.Context(), p, page.Limit, page.Offset)
	if err != nil {
		writeStoreError(w, err, "list glossaries")
		return
	}
	page.Total = total
	writeJSON(w, http.StatusOK, struct {
		Glossaries []glossary `json:"glossaries"`
		Pagination pagination `json:"pagination"`
	}{items, page})
}

func (s apiServer) glossary(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	glossaryID, ok := pathID(w, r, "glossaryId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "glossaries:read")
	if !ok {
		return
	}
	item, err := s.store.getGlossary(r.Context(), p, glossaryID)
	if err != nil {
		writeStoreError(w, err, "get glossary")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Glossary glossary `json:"glossary"`
	}{item})
}

func (s apiServer) glossaryTerms(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	glossaryID, ok := pathID(w, r, "glossaryId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "glossaries:read")
	if !ok {
		return
	}
	values := r.URL.Query()
	page, valid := parsePagination(w, values, 50)
	if !valid {
		return
	}
	filters := glossaryTermFilters{
		Locale: strings.TrimSpace(values.Get("locale")),
		Search: strings.TrimSpace(values.Get("search")),
		Limit:  page.Limit,
		Offset: page.Offset,
	}
	if len(filters.Locale) > 64 || len(filters.Search) > 200 {
		writeError(w, http.StatusBadRequest, "invalid_query", "One or more query filters are invalid")
		return
	}
	items, total, err := s.store.listGlossaryTerms(r.Context(), p, glossaryID, filters)
	if err != nil {
		writeStoreError(w, err, "list glossary terms")
		return
	}
	page.Total = total
	writeJSON(w, http.StatusOK, struct {
		Terms      []glossaryTerm `json:"terms"`
		Pagination pagination     `json:"pagination"`
	}{items, page})
}

func (s apiServer) memories(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "translation-memories:read")
	if !ok {
		return
	}
	page, valid := parsePagination(w, r.URL.Query(), 25)
	if !valid {
		return
	}
	items, total, err := s.store.listMemories(r.Context(), p, page.Limit, page.Offset)
	if err != nil {
		writeStoreError(w, err, "list translation memories")
		return
	}
	page.Total = total
	writeJSON(w, http.StatusOK, struct {
		TranslationMemories []translationMemory `json:"translationMemories"`
		Pagination          pagination          `json:"pagination"`
	}{items, page})
}

func (s apiServer) memory(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	memoryID, ok := pathID(w, r, "memoryId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "translation-memories:read")
	if !ok {
		return
	}
	item, err := s.store.getMemory(r.Context(), p, memoryID)
	if err != nil {
		writeStoreError(w, err, "get translation memory")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		TranslationMemory translationMemory `json:"translationMemory"`
	}{item})
}

func (s apiServer) memoryEntries(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	memoryID, ok := pathID(w, r, "memoryId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "translation-memories:read")
	if !ok {
		return
	}
	values := r.URL.Query()
	page, valid := parsePagination(w, values, 50)
	if !valid {
		return
	}
	filters := memoryEntryFilters{
		SourceLocale: strings.TrimSpace(values.Get("sourceLocale")),
		TargetLocale: strings.TrimSpace(values.Get("targetLocale")),
		Search:       strings.TrimSpace(values.Get("search")),
		Limit:        page.Limit,
		Offset:       page.Offset,
	}
	if len(filters.SourceLocale) > 64 || len(filters.TargetLocale) > 64 || len(filters.Search) > 200 {
		writeError(w, http.StatusBadRequest, "invalid_query", "One or more query filters are invalid")
		return
	}
	items, total, err := s.store.listMemoryEntries(r.Context(), p, memoryID, filters)
	if err != nil {
		writeStoreError(w, err, "list translation memory entries")
		return
	}
	page.Total = total
	writeJSON(w, http.StatusOK, struct {
		Entries    []memoryEntry `json:"entries"`
		Pagination pagination    `json:"pagination"`
	}{items, page})
}

func (s apiServer) authenticateWithStore(w http.ResponseWriter, r *http.Request, permission string) (principal, bool) {
	p, ok := s.authenticate(w, r, permission)
	if !ok {
		return principal{}, false
	}
	if s.store == nil {
		writeError(w, http.StatusServiceUnavailable, "service_unavailable", "Resource storage is unavailable")
		return principal{}, false
	}
	return p, true
}

// allowMethods accepts the listed methods, and HEAD wherever GET is allowed.
func allowMethods(w http.ResponseWriter, r *http.Request, methods ...string) bool {
	allowed := make([]string, 0, len(methods)+1)
	for _, method := range methods {
		allowed = append(allowed, method)
		if method == http.MethodGet {
			allowed = append(allowed, http.MethodHead)
		}
	}
	if contains(allowed, r.Method) {
		return true
	}
	allow := strings.Join(allowed, ", ")
	w.Header().Set("Allow", allow)
	writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Use "+allow)
	return false
}

func pathID(w http.ResponseWriter, r *http.Request, name string) (string, bool) {
	value := r.PathValue(name)
	if value == "" || len(value) > 128 {
		writeError(w, http.StatusNotFound, "not_found", "Route not found")
		return "", false
	}
	return value, true
}

func decodeJSONBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Use Content-Type: application/json")
		return false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBodyBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge, "body_too_large", "Request body is too large")
			return false
		}
		writeError(w, http.StatusBadRequest, "invalid_body", "Request body must be a valid JSON object")
		return false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid_body", "Request body must contain a single JSON object")
		return false
	}
	return true
}

// optionalString tells an omitted field from an explicit null.
type optionalString struct {
	Set   bool
	Value *string
}

func (o *optionalString) UnmarshalJSON(data []byte) error {
	o.Set = true
	return json.Unmarshal(data, &o.Value)
}

// optionalInt tells an omitted field from an explicit null.
type optionalInt struct {
	Set   bool
	Value *int
}

func (o *optionalInt) UnmarshalJSON(data []byte) error {
	o.Set = true
	return json.Unmarshal(data, &o.Value)
}

func trimmedOrNil(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func validOptionalText(value *string, maxLength int) bool {
	return value == nil || len(*value) <= maxLength
}

func validMaxLength(value *int) bool {
	return value == nil || (*value >= 1 && *value <= 100_000)
}
