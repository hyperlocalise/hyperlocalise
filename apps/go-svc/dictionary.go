package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/workos/workos-go/v10"
)

const (
	dictionaryBodyLimit      = 6 << 20 // A million UTF-16 characters may be JSON escaped.
	dictionaryRequestTimeout = 30 * time.Second
)

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
	membership func(context.Context, string) (*workos.UserOrganizationMembership, error)
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

func dictionaryJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Warn("dictionary_response_write_failed")
	}
}

func writeDictionaryError(w http.ResponseWriter, err error) {
	var failure *dictionaryError
	if !errors.As(err, &failure) {
		slog.Error("dictionary_request_failed")
		failure = &dictionaryError{500, "internal_error", "Internal server error"}
	}
	dictionaryJSON(w, failure.status, map[string]string{"error": failure.code, "message": failure.message})
}

func (api *dictionaryAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	for _, path := range []string{"/v1/orgs/{organizationSlug}/dictionaries", "/v1/orgs/{organizationSlug}/dictionaries/{rest...}", "/v1/orgs/{organizationSlug}/projects/{projectId}/dictionaries", "/v1/orgs/{organizationSlug}/projects/{projectId}/dictionaries/{rest...}"} {
		mux.Handle(path, authMiddleware(verifier)(http.HandlerFunc(api.serveHTTP)))
	}
}

func (api *dictionaryAPI) actor(ctx context.Context, claims AuthClaims, slug string) (dictionaryActor, error) {
	var actor dictionaryActor
	var membershipID, workosOrg string
	if strings.HasPrefix(claims.UserID, "invited_user_") {
		return actor, dictionaryFailure(403, "organization_access_denied", "Organization access denied")
	}
	err := api.pool.QueryRow(ctx, `select u.id, o.id, m.workos_membership_id, o.workos_organization_id
        from users u join organization_memberships m on m.user_id=u.id join organizations o on o.id=m.organization_id
        where u.workos_user_id=$1 and o.slug=$2 and o.lifecycle_status='active'
        and m.workos_membership_id is not null and m.workos_membership_id not in ('', 'replacing')`, claims.UserID, slug).Scan(&actor.userID, &actor.organizationID, &membershipID, &workosOrg)
	if errors.Is(err, pgx.ErrNoRows) {
		return actor, dictionaryFailure(403, "organization_access_denied", "Organization access denied")
	}
	if err != nil {
		return actor, err
	}
	// Read WorkOS on every request: cached local roles alone cannot grant access.
	if api.membership == nil {
		return actor, dictionaryFailure(503, "workos_membership_lookup_failed", "Organization membership could not be verified")
	}
	member, err := api.membership(ctx, membershipID)
	if err != nil {
		var apiErr *workos.APIError
		if errors.As(err, &apiErr) && apiErr.StatusCode == 404 {
			return actor, dictionaryFailure(403, "organization_access_denied", "Organization access denied")
		}
		return actor, dictionaryFailure(503, "workos_membership_lookup_failed", "Organization membership could not be verified")
	}
	if member == nil || member.ID != membershipID || member.UserID != claims.UserID || member.OrganizationID != workosOrg || member.Status != "active" || member.Role == nil {
		return actor, dictionaryFailure(403, "organization_access_denied", "Organization access denied")
	}
	switch member.Role.Slug {
	case "admin", "localization_manager", "member", "developer", "translator", "reviewer":
		actor.role = member.Role.Slug
	default:
		return actor, dictionaryFailure(403, "organization_access_denied", "Organization access denied")
	}
	return actor, nil
}

func (api *dictionaryAPI) serveHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		origin := r.Header.Get("Origin")
		if origin != "" {
			parsed, err := url.Parse(origin)
			if err != nil || parsed.Host != r.Host || (parsed.Scheme != "http" && parsed.Scheme != "https") {
				writeDictionaryError(w, dictionaryFailure(403, "forbidden", "Cross-origin request denied"))
				return
			}
		}
		if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
			writeDictionaryError(w, dictionaryFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
	}
	if api.pool == nil {
		writeDictionaryError(w, dictionaryFailure(503, "dictionary_unavailable", "Dictionary service unavailable"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), dictionaryRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
	if !ok {
		writeDictionaryError(w, dictionaryFailure(401, "unauthorized", "Authentication required"))
		return
	}
	actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
	if err != nil {
		writeDictionaryError(w, err)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead && !actor.canWrite() {
		writeDictionaryError(w, dictionaryFailure(403, "forbidden", "Insufficient permissions"))
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, dictionaryBodyLimit)
	var value any
	var status int
	if r.PathValue("projectId") != "" {
		value, status, err = api.projectRequest(r, actor)
	} else {
		value, status, err = api.dictionaryRequest(r, actor)
	}
	if err != nil {
		writeDictionaryError(w, err)
		return
	}
	if status == 204 {
		w.WriteHeader(status)
		return
	}
	if export, ok := value.(dictionaryExport); ok {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="`+export.locale+`.txt"`)
		w.WriteHeader(status)
		if _, err := io.WriteString(w, export.body); err != nil {
			slog.Warn("dictionary_export_write_failed")
		}
		return
	}
	dictionaryJSON(w, status, value)
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
	d, err := scanDictionary(db.QueryRow(ctx, `select `+dictionaryColumns+` from spellcheck_dictionaries d where d.id=$1 and d.organization_id=$2`, id, actor.organizationID))
	if errors.Is(err, pgx.ErrNoRows) {
		return d, missingDictionary()
	}
	return d, err
}

func dictionaryCount(ctx context.Context, db dictionaryDB, id string) (int, error) {
	var count int
	err := db.QueryRow(ctx, `select count(*) from spellcheck_dictionary_words where dictionary_id=$1`, id).Scan(&count)
	return count, err
}

func bumpDictionary(ctx context.Context, db dictionaryDB, id string) error {
	_, err := db.Exec(ctx, `update spellcheck_dictionaries set words_version=words_version+1, updated_at=now() where id=$1`, id)
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

func dictionaryMethodNotAllowed() (any, int, error) {
	return nil, 405, dictionaryFailure(405, "method_not_allowed", "Method not allowed")
}

func validDictionaryID(id string) bool {
	if len(id) != 36 {
		return false
	}
	_, err := uuid.Parse(id)
	return err == nil
}
