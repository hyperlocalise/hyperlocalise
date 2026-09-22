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
)

const (
	glossaryBodyLimit      = 6 << 20
	glossaryRequestTimeout = 30 * time.Second
)

type glossaryAPI struct {
	pool       dictionaryPool
	membership organizationMembershipLookup
}

type glossaryActor struct{ userID, organizationID, role string }

func (a glossaryActor) canManageGlossaries() bool {
	return a.role == "admin" || a.role == "localization_manager"
}

func (a glossaryActor) orgWideAccess() bool {
	return a.canManageGlossaries()
}

func (a glossaryActor) canContribute(g glossaryRecord) bool {
	if a.canManageGlossaries() {
		return true
	}
	return a.role == "translator" && g.ControlLevel == "team" && g.Source == "native" && g.TeamID != nil
}

type glossaryError struct {
	status        int
	code, message string
}

func (e *glossaryError) Error() string { return e.code }

func glossaryFailure(status int, code, message string) error {
	return &glossaryError{status, code, message}
}

func invalidGlossary() error {
	return glossaryFailure(400, "invalid_glossary_payload", "Invalid glossary payload")
}

func missingGlossary() error {
	return glossaryFailure(404, "glossary_not_found", "Glossary not found")
}

func missingGlossaryProject() error {
	return glossaryFailure(404, "project_not_found", "Project not found")
}

func glossaryJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Warn("glossary_response_write_failed")
	}
}

func writeGlossaryError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *glossaryError
	if !errors.As(err, &failure) {
		slog.Error("glossary_request_failed", "phase", phase, "path", requestLogPath(r.URL.Path), "error", err.Error())
		failure = &glossaryError{500, "internal_error", "Internal server error"}
	} else if failure.status >= 500 {
		slog.Error("glossary_request_failed", "phase", phase, "path", requestLogPath(r.URL.Path), "code", failure.code)
	}
	glossaryJSON(w, failure.status, map[string]string{"error": failure.code, "message": failure.message})
}

func formatGlossaryTime(t time.Time) string {
	// Microsecond precision matches PostgreSQL timestamptz so page cursors
	// built from these strings do not skip same-millisecond rows.
	return t.UTC().Format("2006-01-02T15:04:05.000000Z")
}

func formatGlossaryTimePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := formatGlossaryTime(*t)
	return &s
}

func (api *glossaryAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	g := orgRoutePrefix + "/glossaries"
	route := func(pattern string, fn func(*http.Request, glossaryActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	owned := func(fn func(*glossaryAPI, *http.Request, glossaryActor, glossaryRecord) (any, int, error)) func(*http.Request, glossaryActor) (any, int, error) {
		return api.withOwnedGlossary(fn)
	}
	route("GET "+g, bindActor(api, (*glossaryAPI).listGlossaries))
	route("POST "+g, bindActor(api, (*glossaryAPI).createGlossary))
	route("GET "+g+"/{glossaryId}", owned((*glossaryAPI).getGlossaryHandler))
	route("PATCH "+g+"/{glossaryId}", owned((*glossaryAPI).patchGlossaryHandler))
	route("DELETE "+g+"/{glossaryId}", owned((*glossaryAPI).deleteGlossaryHandler))
	route("GET "+g+"/{glossaryId}/projects", owned((*glossaryAPI).listGlossaryProjects))
	route("POST "+g+"/{glossaryId}/projects", owned((*glossaryAPI).attachGlossaryProject))
	route("DELETE "+g+"/{glossaryId}/projects/{projectId}", owned((*glossaryAPI).detachGlossaryProject))
	route("GET "+g+"/{glossaryId}/export", owned((*glossaryAPI).exportGlossaryHandler))
	route("GET "+g+"/{glossaryId}/import-reports/{reportId}", owned((*glossaryAPI).getGlossaryImportReportHandler))
	route("GET "+g+"/{glossaryId}/import-reports/{reportId}/backup", owned((*glossaryAPI).getGlossaryImportBackupHandler))
	route("GET "+g+"/{glossaryId}/concepts", owned((*glossaryAPI).listConceptsHandler))
	route("POST "+g+"/{glossaryId}/concepts", owned((*glossaryAPI).createConceptHandler))
	route("GET "+g+"/{glossaryId}/concepts/page", owned((*glossaryAPI).pageGlossaryConceptsHandler))
	route("GET "+g+"/{glossaryId}/concepts/authors", owned((*glossaryAPI).listGlossaryConceptAuthorsHandler))
	route("GET "+g+"/{glossaryId}/concepts/history", owned((*glossaryAPI).pageGlossaryHistoryHandler))
	route("POST "+g+"/{glossaryId}/concepts/import", owned((*glossaryAPI).importGlossaryConceptsHandler))
	route("GET "+g+"/{glossaryId}/concepts/{conceptId}", owned((*glossaryAPI).getConceptHandler))
	route("PATCH "+g+"/{glossaryId}/concepts/{conceptId}", owned((*glossaryAPI).patchConceptHandler))
	route("DELETE "+g+"/{glossaryId}/concepts/{conceptId}", owned((*glossaryAPI).deleteConceptHandler))
	route("GET "+g+"/{glossaryId}/concepts/{conceptId}/terms", owned((*glossaryAPI).listConceptTermsHandler))
	route("POST "+g+"/{glossaryId}/concepts/{conceptId}/terms", owned((*glossaryAPI).createConceptTermHandler))
	route("GET "+g+"/{glossaryId}/concepts/{conceptId}/terms/page", owned((*glossaryAPI).pageConceptTermsHandler))
	route("PATCH "+g+"/{glossaryId}/concepts/{conceptId}/terms/{termId}", owned((*glossaryAPI).patchTermHandler))
	route("DELETE "+g+"/{glossaryId}/concepts/{conceptId}/terms/{termId}", owned((*glossaryAPI).deleteTermHandler))
}

func (api *glossaryAPI) withOwnedGlossary(fn func(*glossaryAPI, *http.Request, glossaryActor, glossaryRecord) (any, int, error)) func(*http.Request, glossaryActor) (any, int, error) {
	return func(r *http.Request, actor glossaryActor) (any, int, error) {
		g, err := ownedGlossary(r.Context(), api.pool, actor, r.PathValue("glossaryId"))
		if err != nil {
			return nil, 0, err
		}
		return fn(api, r, actor, g)
	}
}

func (api *glossaryAPI) actor(ctx context.Context, claims AuthClaims, slug string) (glossaryActor, error) {
	resolved, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, slug)
	if err != nil {
		return glossaryActor{}, mapOrganizationAccessError(err, glossaryFailure)
	}
	return glossaryActor(resolved), nil
}

func (api *glossaryAPI) handle(fn func(*http.Request, glossaryActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeGlossaryError(w, r, "origin_guard", glossaryFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
		if api.pool == nil {
			writeGlossaryError(w, r, "availability", glossaryFailure(503, "glossary_unavailable", "Glossary service unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), glossaryRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeGlossaryError(w, r, "auth", glossaryFailure(401, "unauthorized", "Authentication required"))
			return
		}
		actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeGlossaryError(w, r, "resolve_actor", err)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, glossaryBodyLimit)
		value, status, err := fn(r, actor)
		if err != nil {
			writeGlossaryError(w, r, "handle", err)
			return
		}
		if status == 204 {
			w.WriteHeader(status)
			return
		}
		if download, ok := value.(interchangeDownload); ok {
			writeInterchangeDownload(w, status, download)
			return
		}
		glossaryJSON(w, status, value)
	})
}

type glossaryLanguage struct {
	Locale   string `json:"locale"`
	Name     string `json:"name"`
	IsSource bool   `json:"isSource"`
}

type glossaryRecord struct {
	ID                   string             `json:"id"`
	OrganizationID       string             `json:"organizationId"`
	CreatedByUserID      *string            `json:"createdByUserId"`
	Name                 string             `json:"name"`
	Description          string             `json:"description"`
	SourceLocale         string             `json:"sourceLocale"`
	TargetLocale         *string            `json:"targetLocale"`
	Languages            []glossaryLanguage `json:"languages"`
	Status               string             `json:"status"`
	Source               string             `json:"source"`
	ControlLevel         string             `json:"controlLevel"`
	TeamID               *string            `json:"teamId"`
	TeamName             *string            `json:"teamName,omitempty"`
	ExternalProviderKind *string            `json:"externalProviderKind"`
	ExternalProjectID    *string            `json:"externalProjectId"`
	ExternalResourceType *string            `json:"externalResourceType"`
	ExternalGlossaryID   *string            `json:"externalGlossaryId"`
	LocaleCoverage       []string           `json:"localeCoverage"`
	TermCount            *int               `json:"termCount"`
	ProjectCount         int                `json:"projectCount"`
	SyncState            *string            `json:"syncState"`
	TermCapabilities     json.RawMessage    `json:"termCapabilities"`
	ExternalURL          *string            `json:"externalUrl"`
	LastSyncedAt         *string            `json:"lastSyncedAt"`
	LastSyncErrorAt      *string            `json:"lastSyncErrorAt"`
	LastSyncErrorMessage *string            `json:"lastSyncErrorMessage"`
	CreatedAt            string             `json:"createdAt"`
	UpdatedAt            string             `json:"updatedAt"`
}

const glossaryColumns = `g.id, g.organization_id, g.created_by_user_id, g.name, g.description, g.source_locale, g.target_locale, g.status, g.source, g.control_level, g.team_id, g.external_provider_kind, g.external_project_id, g.external_resource_type, g.external_glossary_id, g.locale_coverage, g.term_count, g.sync_state, g.term_capabilities, g.external_url, g.last_synced_at, g.last_sync_error_at, g.last_sync_error_message, g.created_at, g.updated_at`

func scanGlossary(row pgx.Row) (glossaryRecord, error) {
	var g glossaryRecord
	var created, updated time.Time
	var coverage []byte
	var caps []byte
	var lastSynced, lastSyncErr *time.Time
	err := row.Scan(
		&g.ID, &g.OrganizationID, &g.CreatedByUserID, &g.Name, &g.Description, &g.SourceLocale, &g.TargetLocale,
		&g.Status, &g.Source, &g.ControlLevel, &g.TeamID, &g.ExternalProviderKind, &g.ExternalProjectID,
		&g.ExternalResourceType, &g.ExternalGlossaryID, &coverage, &g.TermCount, &g.SyncState, &caps,
		&g.ExternalURL, &lastSynced, &lastSyncErr, &g.LastSyncErrorMessage, &created, &updated,
	)
	if err != nil {
		return g, err
	}
	g.LocaleCoverage = []string{}
	if len(coverage) > 0 {
		_ = json.Unmarshal(coverage, &g.LocaleCoverage)
	}
	if len(caps) == 0 {
		g.TermCapabilities = json.RawMessage(`{}`)
	} else {
		g.TermCapabilities = json.RawMessage(caps)
	}
	g.LastSyncedAt = formatGlossaryTimePtr(lastSynced)
	g.LastSyncErrorAt = formatGlossaryTimePtr(lastSyncErr)
	g.CreatedAt = formatGlossaryTime(created)
	g.UpdatedAt = formatGlossaryTime(updated)
	g.Languages = glossaryLanguages(g)
	return g, nil
}

func glossaryLanguages(g glossaryRecord) []glossaryLanguage {
	seen := map[string]bool{}
	locales := []string{g.SourceLocale}
	locales = append(locales, g.LocaleCoverage...)
	out := []glossaryLanguage{}
	for _, locale := range locales {
		if locale == "" || seen[locale] {
			continue
		}
		seen[locale] = true
		out = append(out, glossaryLanguage{Locale: locale, Name: locale, IsSource: locale == g.SourceLocale})
	}
	return out
}

// glossaryAccessPredicate expects $org and $user as the organization and user bind
// positions (1-based). Managers ignore the user predicate via $manager.
func glossaryAccessPredicate(alias string, org, user, manager int) string {
	return alias + `.organization_id=$` + itoa(org) + ` and ($` + itoa(manager) + ` or ` + alias + `.created_by_user_id=$` + itoa(user) + ` or ` + alias + `.control_level='org' or exists(select 1 from project_glossaries pg join projects p on p.id=pg.project_id where pg.glossary_id=` + alias + `.id and pg.organization_id=$` + itoa(org) + ` and p.organization_id=$` + itoa(org) + ` and exists(select 1 from team_memberships m join teams t on t.id=m.team_id where m.user_id=$` + itoa(user) + ` and t.organization_id=$` + itoa(org) + ` and (t.id=p.team_id or (p.team_id is null and t.slug='default')))))`
}

func itoa(n int) string {
	const digits = "0123456789"
	if n < 10 {
		return digits[n : n+1]
	}
	return itoa(n/10) + digits[n%10:n%10+1]
}

func ownedGlossary(ctx context.Context, db dictionaryDB, actor glossaryActor, id string) (glossaryRecord, error) {
	if !validGlossaryID(id) {
		return glossaryRecord{}, missingGlossary()
	}
	g, err := scanGlossary(db.QueryRow(ctx, `select `+glossaryColumns+` from glossaries g where g.id=$1 and `+glossaryAccessPredicate("g", 2, 3, 4), id, actor.organizationID, actor.userID, actor.orgWideAccess()))
	if errors.Is(err, pgx.ErrNoRows) {
		return g, missingGlossary()
	}
	return g, err
}

func requireNativeGlossary(g glossaryRecord) error {
	if g.Source != "native" {
		return glossaryFailure(403, "external_tms_glossary_immutable", "This glossary is managed by an external TMS and cannot be edited directly")
	}
	return nil
}

func readGlossaryBody(r *http.Request, allowed []string, target any) error {
	decoder := json.NewDecoder(r.Body)
	var fields map[string]json.RawMessage
	if err := decoder.Decode(&fields); err != nil || fields == nil {
		return invalidGlossary()
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return invalidGlossary()
	}
	selected := map[string]json.RawMessage{}
	for _, key := range allowed {
		if value, ok := fields[key]; ok {
			if string(value) == "null" && key != "teamId" && key != "description" && key != "gender" && key != "termType" && key != "url" && key != "lemma" && key != "figure" {
				return invalidGlossary()
			}
			selected[key] = value
		}
	}
	body, err := json.Marshal(selected)
	if err != nil {
		return invalidGlossary()
	}
	if err := json.Unmarshal(body, target); err != nil {
		return invalidGlossary()
	}
	return nil
}

func validGlossaryID(id string) bool {
	if len(id) != 36 {
		return false
	}
	_, err := uuid.Parse(id)
	return err == nil
}

func glossaryNotImplemented() (any, int, error) {
	return nil, 0, glossaryFailure(501, "not_implemented", "This glossary operation is not available on the native Go service yet")
}

func trimGlossaryInput(value string) string {
	return trimDictionaryInput(value)
}

func isGlossaryTeamMember(ctx context.Context, db dictionaryDB, actor glossaryActor, teamID string) (bool, error) {
	var found string
	err := db.QueryRow(ctx, `select t.id from teams t join team_memberships m on m.team_id=t.id where t.id=$1 and t.organization_id=$2 and m.user_id=$3`, teamID, actor.organizationID, actor.userID).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

func (api *glossaryAPI) canContributeGlossary(ctx context.Context, actor glossaryActor, g glossaryRecord) (bool, error) {
	if !actor.canContribute(g) {
		return false, nil
	}
	if actor.canManageGlossaries() {
		return true, nil
	}
	if g.TeamID == nil {
		return false, nil
	}
	return isGlossaryTeamMember(ctx, api.pool, actor, *g.TeamID)
}
