package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/workos/workos-go/v10"
	"golang.org/x/text/unicode/norm"
)

const (
	memoryBodyLimit      = 6 << 20
	memoryRequestTimeout = 30 * time.Second
)

type memoryAPI struct {
	pool       dictionaryPool
	membership func(context.Context, string) (*workos.UserOrganizationMembership, error)
}

type memoryActor struct{ userID, organizationID, role string }

func (a memoryActor) canWriteMemories() bool {
	return a.role == "admin" || a.role == "localization_manager"
}

func (a memoryActor) canReviewMemories() bool {
	return a.canWriteMemories() || a.role == "reviewer"
}

func (a memoryActor) orgWideAccess() bool {
	return a.canWriteMemories()
}

type memoryError struct {
	status        int
	code, message string
	details       any
}

func (e *memoryError) Error() string { return e.code }

func memoryFailure(status int, code, message string) error {
	return &memoryError{status: status, code: code, message: message}
}

func memoryFailureDetails(status int, code, message string, details any) error {
	return &memoryError{status: status, code: code, message: message, details: details}
}

func invalidMemory() error {
	return memoryFailure(400, "invalid_memory_payload", "Invalid translation memory payload")
}

func missingMemory() error {
	return memoryFailure(404, "memory_not_found", "Translation memory not found")
}

func missingMemoryProject() error {
	return memoryFailure(404, "project_not_found", "Project not found")
}

func memoryJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Warn("memory_response_write_failed")
	}
}

func writeMemoryError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *memoryError
	if !errors.As(err, &failure) {
		slog.Error("memory_request_failed", "phase", phase, "path", requestLogPath(r.URL.Path), "error", err.Error())
		failure = &memoryError{status: 500, code: "internal_error", message: "Internal server error"}
	} else if failure.status >= 500 {
		slog.Error("memory_request_failed", "phase", phase, "path", requestLogPath(r.URL.Path), "code", failure.code)
	}
	payload := map[string]any{"error": failure.code, "message": failure.message}
	if failure.details != nil {
		payload["details"] = failure.details
	}
	memoryJSON(w, failure.status, payload)
}

func formatMemoryTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

func formatMemoryTimePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := formatMemoryTime(*t)
	return &s
}

func (api *memoryAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	for _, path := range []string{
		"/v1/orgs/{organizationSlug}/translation-memories",
		"/v1/orgs/{organizationSlug}/translation-memories/{rest...}",
	} {
		mux.Handle(path, authMiddleware(verifier)(http.HandlerFunc(api.serveHTTP)))
	}
}

func (api *memoryAPI) actor(ctx context.Context, claims AuthClaims, slug string) (memoryActor, error) {
	var actor memoryActor
	var membershipID, workosOrg string
	if strings.HasPrefix(claims.UserID, "invited_user_") {
		return actor, memoryFailure(403, "organization_access_denied", "Organization access denied")
	}
	err := api.pool.QueryRow(ctx, `select u.id, o.id, m.workos_membership_id, o.workos_organization_id
        from users u join organization_memberships m on m.user_id=u.id join organizations o on o.id=m.organization_id
        where u.workos_user_id=$1 and o.slug=$2 and o.lifecycle_status='active'
        and m.workos_membership_id is not null and m.workos_membership_id not in ('', 'replacing')`, claims.UserID, slug).Scan(&actor.userID, &actor.organizationID, &membershipID, &workosOrg)
	if errors.Is(err, pgx.ErrNoRows) {
		return actor, memoryFailure(403, "organization_access_denied", "Organization access denied")
	}
	if err != nil {
		return actor, err
	}
	if api.membership == nil {
		return actor, memoryFailure(503, "workos_membership_lookup_failed", "Organization membership could not be verified")
	}
	member, err := api.membership(ctx, membershipID)
	if err != nil {
		var apiErr *workos.APIError
		if errors.As(err, &apiErr) && apiErr.StatusCode == 404 {
			return actor, memoryFailure(403, "organization_access_denied", "Organization access denied")
		}
		return actor, memoryFailure(503, "workos_membership_lookup_failed", "Organization membership could not be verified")
	}
	if member == nil || member.ID != membershipID || member.UserID != claims.UserID || member.OrganizationID != workosOrg || member.Status != "active" || member.Role == nil {
		return actor, memoryFailure(403, "organization_access_denied", "Organization access denied")
	}
	switch member.Role.Slug {
	case "admin", "localization_manager", "member", "developer", "translator", "reviewer":
		actor.role = member.Role.Slug
	default:
		return actor, memoryFailure(403, "organization_access_denied", "Organization access denied")
	}
	return actor, nil
}

func (api *memoryAPI) serveHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		origin := r.Header.Get("Origin")
		if origin != "" {
			parsed, err := url.Parse(origin)
			if err != nil || parsed.Host != r.Host || (parsed.Scheme != "http" && parsed.Scheme != "https") {
				writeMemoryError(w, r, "origin_guard", memoryFailure(403, "forbidden", "Cross-origin request denied"))
				return
			}
		}
		if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
			writeMemoryError(w, r, "origin_guard", memoryFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
	}
	if api.pool == nil {
		writeMemoryError(w, r, "availability", memoryFailure(503, "memory_unavailable", "Translation memory unavailable"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), memoryRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
	if !ok {
		writeMemoryError(w, r, "auth", memoryFailure(401, "unauthorized", "Authentication required"))
		return
	}
	actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
	if err != nil {
		writeMemoryError(w, r, "resolve_actor", err)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, memoryBodyLimit)
	value, status, err := api.memoryRequest(r, actor)
	if err != nil {
		writeMemoryError(w, r, "handle", err)
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
	memoryJSON(w, status, value)
}

type memoryCapabilityDecision struct {
	Allowed bool    `json:"allowed"`
	Reason  *string `json:"reason"`
}

type memoryCapabilities map[string]memoryCapabilityDecision

func decision(allowed bool, reason string) memoryCapabilityDecision {
	if reason == "" {
		return memoryCapabilityDecision{Allowed: allowed}
	}
	return memoryCapabilityDecision{Allowed: allowed, Reason: &reason}
}

func nativeMemoryCapabilities(actor memoryActor, status string) memoryCapabilities {
	archived := status == "archived"
	canWrite := actor.canWriteMemories()
	canReview := actor.canReviewMemories()
	denyArchived := func(allowed bool) memoryCapabilityDecision {
		if archived {
			return decision(false, "archived")
		}
		if !allowed {
			return decision(false, "unauthorized")
		}
		return decision(true, "")
	}
	return memoryCapabilities{
		"read":          decision(true, ""),
		"search":        denyArchived(true),
		"edit":          denyArchived(canWrite),
		"review":        denyArchived(canReview),
		"import":        denyArchived(canWrite),
		"export":        decision(true, ""),
		"bulk_mutation": denyArchived(canWrite),
		"archive":       denyArchived(canWrite),
		"restore": func() memoryCapabilityDecision {
			if !archived {
				return decision(false, "unsupported")
			}
			if !canWrite {
				return decision(false, "unauthorized")
			}
			return decision(true, "")
		}(),
		"delete": denyArchived(canWrite),
	}
}

type memoryRecord struct {
	ID                   string             `json:"id"`
	OrganizationID       string             `json:"organizationId"`
	CreatedByUserID      *string            `json:"createdByUserId"`
	Name                 string             `json:"name"`
	Description          string             `json:"description"`
	Status               string             `json:"status"`
	Source               string             `json:"source"`
	ExternalProviderKind *string            `json:"externalProviderKind"`
	ExternalProjectID    *string            `json:"externalProjectId"`
	ExternalMemoryID     *string            `json:"externalMemoryId"`
	LocaleCoverage       []string           `json:"localeCoverage"`
	SegmentCount         *int               `json:"segmentCount"`
	SyncState            *string            `json:"syncState"`
	CapabilityMode       *string            `json:"capabilityMode"`
	SegmentCapabilities  json.RawMessage    `json:"segmentCapabilities"`
	ExternalURL          *string            `json:"externalUrl"`
	LastSyncedAt         *string            `json:"lastSyncedAt"`
	LastSyncErrorAt      *string            `json:"lastSyncErrorAt"`
	LastSyncErrorMessage *string            `json:"lastSyncErrorMessage"`
	CreatedAt            string             `json:"createdAt"`
	UpdatedAt            string             `json:"updatedAt"`
	ResourceKind         string             `json:"resourceKind"`
	Capabilities         memoryCapabilities `json:"capabilities"`
}

const memoryColumns = `m.id, m.organization_id, m.created_by_user_id, m.name, m.description, m.status, m.source, m.external_provider_kind, m.external_project_id, m.external_memory_id, m.locale_coverage, m.segment_count, m.sync_state, m.capability_mode, m.segment_capabilities, m.external_url, m.last_synced_at, m.last_sync_error_at, m.last_sync_error_message, m.created_at, m.updated_at`

func scanMemory(row pgx.Row, actor memoryActor) (memoryRecord, error) {
	var m memoryRecord
	var created, updated time.Time
	var coverage, caps []byte
	var lastSynced, lastSyncErr *time.Time
	err := row.Scan(
		&m.ID, &m.OrganizationID, &m.CreatedByUserID, &m.Name, &m.Description, &m.Status, &m.Source,
		&m.ExternalProviderKind, &m.ExternalProjectID, &m.ExternalMemoryID, &coverage, &m.SegmentCount,
		&m.SyncState, &m.CapabilityMode, &caps, &m.ExternalURL, &lastSynced, &lastSyncErr,
		&m.LastSyncErrorMessage, &created, &updated,
	)
	if err != nil {
		return m, err
	}
	m.LocaleCoverage = []string{}
	if len(coverage) > 0 {
		_ = json.Unmarshal(coverage, &m.LocaleCoverage)
	}
	if len(caps) == 0 {
		m.SegmentCapabilities = json.RawMessage(`{}`)
	} else {
		m.SegmentCapabilities = json.RawMessage(caps)
	}
	m.LastSyncedAt = formatMemoryTimePtr(lastSynced)
	m.LastSyncErrorAt = formatMemoryTimePtr(lastSyncErr)
	m.CreatedAt = formatMemoryTime(created)
	m.UpdatedAt = formatMemoryTime(updated)
	if m.Source == "native" {
		m.ResourceKind = "native"
		m.Capabilities = nativeMemoryCapabilities(actor, m.Status)
	} else if m.CapabilityMode != nil && *m.CapabilityMode == "reference_only" {
		m.ResourceKind = "reference_only"
		m.Capabilities = nativeMemoryCapabilities(actor, m.Status)
		for key := range m.Capabilities {
			if key == "read" || key == "export" {
				continue
			}
			if key == "search" {
				m.Capabilities[key] = decision(false, "unsupported")
				continue
			}
			m.Capabilities[key] = decision(false, "read_only")
		}
	} else {
		m.ResourceKind = "synced"
		m.Capabilities = nativeMemoryCapabilities(actor, m.Status)
		for _, key := range []string{"edit", "review", "import", "bulk_mutation", "archive", "restore", "delete"} {
			m.Capabilities[key] = decision(false, "read_only")
		}
	}
	return m, nil
}

func memoryAccessPredicate(alias string, org, user, manager int) string {
	o, u, m := strconv.Itoa(org), strconv.Itoa(user), strconv.Itoa(manager)
	return alias + `.organization_id=$` + o + ` and ($` + m + ` or exists(select 1 from project_memories pm join projects p on p.id=pm.project_id where pm.memory_id=` + alias + `.id and pm.organization_id=$` + o + ` and p.organization_id=$` + o + ` and exists(select 1 from team_memberships tm join teams t on t.id=tm.team_id where tm.user_id=$` + u + ` and t.organization_id=$` + o + ` and (t.id=p.team_id or (p.team_id is null and t.slug='default')))))`
}

func ownedMemory(ctx context.Context, db dictionaryDB, actor memoryActor, id string) (memoryRecord, error) {
	if !validMemoryID(id) {
		return memoryRecord{}, missingMemory()
	}
	m, err := scanMemory(db.QueryRow(ctx, `select `+memoryColumns+` from memories m where m.id=$1 and `+memoryAccessPredicate("m", 2, 3, 4), id, actor.organizationID, actor.userID, actor.orgWideAccess()), actor)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, missingMemory()
	}
	return m, err
}

func requireNativeMemory(m memoryRecord) error {
	if m.Source != "native" {
		return memoryFailure(403, "external_tms_memory_immutable", "This translation memory is managed by an external TMS and cannot be edited directly")
	}
	return nil
}

func readMemoryBody(r *http.Request, allowed []string, target any) error {
	decoder := json.NewDecoder(r.Body)
	var fields map[string]json.RawMessage
	if err := decoder.Decode(&fields); err != nil || fields == nil {
		return invalidMemory()
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return invalidMemory()
	}
	selected := map[string]json.RawMessage{}
	for _, key := range allowed {
		if value, ok := fields[key]; ok {
			if string(value) == "null" && key != "description" && key != "metadata" {
				return invalidMemory()
			}
			selected[key] = value
		}
	}
	body, err := json.Marshal(selected)
	if err != nil {
		return invalidMemory()
	}
	if err := json.Unmarshal(body, target); err != nil {
		return invalidMemory()
	}
	return nil
}

func memoryMethodNotAllowed() (any, int, error) {
	return nil, 405, memoryFailure(405, "method_not_allowed", "Method not allowed")
}

func validMemoryID(id string) bool {
	if len(id) != 36 {
		return false
	}
	_, err := uuid.Parse(id)
	return err == nil
}

func trimMemoryInput(value string) string {
	return trimDictionaryInput(value)
}

var memoryWhitespace = regexp.MustCompile(`\s+`)

func normalizeMemorySourceText(sourceText string) string {
	normalized := norm.NFKC.String(sourceText)
	normalized = strings.TrimSpace(normalized)
	normalized = memoryWhitespace.ReplaceAllString(normalized, " ")
	var b strings.Builder
	b.Grow(len(normalized))
	for _, r := range normalized {
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String()
}
