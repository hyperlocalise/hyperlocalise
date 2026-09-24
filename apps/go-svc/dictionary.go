package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	dictionaryBodyLimit      = 6 << 20 // A million UTF-16 characters may be JSON escaped.
	dictionaryRequestTimeout = 30 * time.Second
)

// Spellcheck custom dictionaries use spellcheck_word_libraries,
// spellcheck_word_library_words, and project_spellcheck_word_libraries.
//
// Migration 0124_premium_cerise introduced spellcheck_dictionaries,
// spellcheck_dictionary_words, and project_spellcheck_dictionaries, but those
// relations were often never created in production. drizzle-kit migrate only
// runs a journal entry when its `when` timestamp exceeds the latest
// drizzle.__drizzle_migrations.created_at; 0124's `when` was lower than 0123's
// while 0125 still applied afterward. See spellcheck-dictionaries.ts and
// scripts/check-drizzle-journal-monotonic.ts.

type dictionaryDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

type dictionaryPool interface {
	dictionaryDB
	Begin(context.Context) (pgx.Tx, error)
}

type dictionaryAPI struct {
	pool       dictionaryPool
	membership organizationMembershipLookup
	wordsCache dictionaryWordsCache
}

type dictionaryActor struct{ userID, organizationID, role string }

func (a dictionaryActor) canWrite() bool {
	return a.role == "admin" || a.role == "localization_manager"
}

type dictionaryError struct {
	status        int
	code, message string
}

func (e *dictionaryError) Error() string { return e.code }
func dictionaryFailure(status int, code, message string) error {
	return &dictionaryError{status, code, message}
}

func invalidDictionary() error {
	return dictionaryFailure(400, "invalid_dictionary_payload", "Invalid spellcheck dictionary payload")
}

func missingDictionary() error {
	return dictionaryFailure(404, "dictionary_not_found", "Spellcheck dictionary not found")
}

func missingDictionaryProject() error {
	return dictionaryFailure(404, "project_not_found", "Project not found")
}

func dictionaryJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "dictionary_response_write_failed")
	}
}

func dictionaryLogAttrs(r *http.Request, phase string) []any {
	attrs := []any{
		"phase", phase,
		"path", requestLogPath(r.URL.Path),
	}
	if id := requestID(r); id != "" {
		attrs = append(attrs, "request_id", id)
	}
	if claims, ok := r.Context().Value(authContextKey{}).(AuthClaims); ok && claims.UserID != "" {
		attrs = append(attrs, "user_id", claims.UserID)
	}
	return attrs
}

func appendDictionaryErrorDetail(attrs []any, err error) []any {
	if err == nil {
		return attrs
	}
	attrs = append(attrs, "error", err.Error())
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		attrs = append(attrs, "pg_code", pgErr.Code)
	}
	return attrs
}

// recordDictionaryFailure logs enough context to debug 5xx responses in production.
func recordDictionaryFailure(r *http.Request, phase string, err error) {
	var failure *dictionaryError
	if errors.As(err, &failure) {
		attrs := dictionaryLogAttrs(r, phase)
		attrs = append(attrs, "status", failure.status, "code", failure.code)
		if failure.status >= 500 {
			slog.ErrorContext(r.Context(), "dictionary_request_failed", attrs...)
		}
		return
	}
	attrs := appendDictionaryErrorDetail(dictionaryLogAttrs(r, phase), err)
	slog.ErrorContext(r.Context(), "dictionary_request_failed", attrs...)
}

func writeDictionaryError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *dictionaryError
	if !errors.As(err, &failure) {
		recordDictionaryFailure(r, phase, err)
		failure = &dictionaryError{500, "internal_error", "Internal server error"}
	} else if failure.status >= 500 {
		recordDictionaryFailure(r, phase, failure)
	}
	dictionaryJSON(r.Context(), w, failure.status, map[string]string{"error": failure.code, "message": failure.message})
}

func (api *dictionaryAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	type action func(*http.Request, dictionaryActor) (any, int, error)
	route := func(pattern string, fn action) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	d := orgRoutePrefix + "/dictionaries"
	p := orgRoutePrefix + "/projects/{projectId}/dictionaries"
	route("GET "+d, bindActor(api, (*dictionaryAPI).listDictionaries))
	route("POST "+d, bindActor(api, (*dictionaryAPI).createDictionary))
	route("GET "+d+"/{dictionaryId}", api.withOwnedDictionary((*dictionaryAPI).getDictionary))
	route("PATCH "+d+"/{dictionaryId}", api.withOwnedDictionary((*dictionaryAPI).patchDictionary))
	route("DELETE "+d+"/{dictionaryId}", api.withOwnedDictionary((*dictionaryAPI).deleteDictionary))
	route("GET "+d+"/{dictionaryId}/words", api.withOwnedDictionary((*dictionaryAPI).listDictionaryWords))
	route("POST "+d+"/{dictionaryId}/words", api.withOwnedDictionary((*dictionaryAPI).createDictionaryWord))
	route("DELETE "+d+"/{dictionaryId}/words/{wordId}", api.withOwnedDictionary((*dictionaryAPI).deleteDictionaryWord))
	route("POST "+d+"/{dictionaryId}/words/import", api.withOwnedDictionary((*dictionaryAPI).importDictionaryWords))
	route("GET "+d+"/{dictionaryId}/words/export", api.withOwnedDictionary((*dictionaryAPI).exportDictionaryWords))
	route("GET "+d+"/{dictionaryId}/projects", api.withOwnedDictionary((*dictionaryAPI).listDictionaryProjects))
	route("POST "+d+"/{dictionaryId}/projects", api.withOwnedDictionary((*dictionaryAPI).attachDictionaryProject))
	route("DELETE "+d+"/{dictionaryId}/projects/{projectId}", api.withOwnedDictionary((*dictionaryAPI).detachDictionaryProject))
	route("GET "+p, bindActor(api, (*dictionaryAPI).listProjectDictionaries))
	route("POST "+p, bindActor(api, (*dictionaryAPI).attachProjectDictionary))
	route("DELETE "+p+"/{dictionaryId}", bindActor(api, (*dictionaryAPI).detachProjectDictionary))
	route("GET "+p+"/resolved", bindActor(api, (*dictionaryAPI).listResolvedProjectWords))
}

func (api *dictionaryAPI) withOwnedDictionary(fn func(*dictionaryAPI, *http.Request, dictionaryActor, dictionaryRecord) (any, int, error)) func(*http.Request, dictionaryActor) (any, int, error) {
	return func(r *http.Request, actor dictionaryActor) (any, int, error) {
		d, err := ownedDictionary(r.Context(), api.pool, actor, r.PathValue("dictionaryId"))
		if err != nil {
			return nil, 0, err
		}
		return fn(api, r, actor, d)
	}
}

func (api *dictionaryAPI) actor(ctx context.Context, claims AuthClaims, slug string) (dictionaryActor, error) {
	resolved, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, slug)
	if err != nil {
		return dictionaryActor{}, mapOrganizationAccessError(err, dictionaryFailure)
	}
	return dictionaryActor(resolved), nil
}

func (api *dictionaryAPI) handle(fn func(*http.Request, dictionaryActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeDictionaryError(w, r, "origin_guard", dictionaryFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
		if api.pool == nil {
			writeDictionaryError(w, r, "availability", dictionaryFailure(503, "dictionary_unavailable", "Dictionary service unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), dictionaryRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeDictionaryError(w, r, "auth", dictionaryFailure(401, "unauthorized", "Authentication required"))
			return
		}
		actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeDictionaryError(w, r, "resolve_actor", err)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead && !actor.canWrite() {
			writeDictionaryError(w, r, "authorize", dictionaryFailure(403, "forbidden", "Insufficient permissions"))
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, dictionaryBodyLimit)
		value, status, err := fn(r, actor)
		if err != nil {
			writeDictionaryError(w, r, "handle", err)
			return
		}
		if status == 204 {
			w.WriteHeader(status)
			return
		}
		if export, ok := value.(dictionaryExport); ok {
			writeDictionaryExport(r.Context(), w, status, export)
			return
		}
		dictionaryJSON(r.Context(), w, status, value)
	})
}

func writeDictionaryExport(ctx context.Context, w http.ResponseWriter, status int, export dictionaryExport) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+export.locale+`.txt"`)
	w.WriteHeader(status)
	if _, err := io.WriteString(w, export.body); err != nil {
		slog.WarnContext(ctx, "dictionary_export_write_failed")
	}
}

type (
	dictionaryExport struct{ locale, body string }
	dictionaryRecord struct {
		ID              string  `json:"id"`
		OrganizationID  string  `json:"organizationId"`
		CreatedByUserID *string `json:"createdByUserId"`
		Name            string  `json:"name"`
		Description     string  `json:"description"`
		Status          string  `json:"status"`
		WordsVersion    int     `json:"wordsVersion"`
		WordCount       int     `json:"wordCount"`
		CreatedAt       string  `json:"createdAt"`
		UpdatedAt       string  `json:"updatedAt"`
		Priority        *int    `json:"priority,omitempty"`
	}
)

const dictionaryColumns = `d.id, d.organization_id, d.created_by_user_id, d.name, d.description, d.status, d.words_version, d.created_at, d.updated_at`

func scanDictionary(row pgx.Row, extra ...any) (dictionaryRecord, error) {
	var d dictionaryRecord
	var created, updated time.Time
	targets := []any{&d.ID, &d.OrganizationID, &d.CreatedByUserID, &d.Name, &d.Description, &d.Status, &d.WordsVersion, &created, &updated}
	err := row.Scan(append(targets, extra...)...)
	d.CreatedAt = created.UTC().Format("2006-01-02T15:04:05.000Z")
	d.UpdatedAt = updated.UTC().Format("2006-01-02T15:04:05.000Z")
	return d, err
}

func ownedDictionary(ctx context.Context, db dictionaryDB, actor dictionaryActor, id string) (dictionaryRecord, error) {
	if !validDictionaryID(id) {
		return dictionaryRecord{}, missingDictionary()
	}
	d, err := scanDictionary(db.QueryRow(ctx, `select `+dictionaryColumns+` from spellcheck_word_libraries d where d.id=$1 and d.organization_id=$2`, id, actor.organizationID))
	if errors.Is(err, pgx.ErrNoRows) {
		return d, missingDictionary()
	}
	return d, err
}

func dictionaryCount(ctx context.Context, db dictionaryDB, id string) (int, error) {
	var count int
	err := db.QueryRow(ctx, `select count(*) from spellcheck_word_library_words where library_id=$1`, id).Scan(&count)
	return count, err
}

func bumpDictionary(ctx context.Context, db dictionaryDB, id string) error {
	_, err := db.Exec(ctx, `update spellcheck_word_libraries set words_version=words_version+1, updated_at=now() where id=$1`, id)
	return err
}

func readDictionaryBody(r *http.Request, target any) error {
	decoder := json.NewDecoder(r.Body)
	var fields map[string]json.RawMessage
	if err := decoder.Decode(&fields); err != nil || fields == nil {
		return invalidDictionary()
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return invalidDictionary()
	}
	var allowed []string
	switch target.(type) {
	case *dictionaryPayload:
		allowed = []string{"name", "description", "status"}
	case *dictionaryWordPayload:
		allowed = []string{"locale", "word", "content"}
	case *dictionaryAttachmentPayload:
		allowed = []string{"projectId", "dictionaryId", "priority"}
	}
	selected := map[string]json.RawMessage{}
	for _, key := range allowed {
		if value, ok := fields[key]; ok {
			if string(value) == "null" {
				return invalidDictionary()
			}
			selected[key] = value
		}
	}
	body, err := json.Marshal(selected)
	if err != nil {
		return invalidDictionary()
	}
	if err := json.Unmarshal(body, target); err != nil {
		return invalidDictionary()
	}
	return nil
}

func validDictionaryID(id string) bool {
	if len(id) != 36 {
		return false
	}
	_, err := uuid.Parse(id)
	return err == nil
}
