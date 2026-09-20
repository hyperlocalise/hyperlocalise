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

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/jackc/pgx/v5"
	"github.com/workos/workos-go/v10"
)

const (
	issueSheetBodyLimit      = 6 << 20
	issueSheetRequestTimeout = 30 * time.Second
)

// autumnChecker is the entitlement gate used by issue-sheet routes.
type autumnChecker interface {
	BooleanFeatureEnabled(ctx context.Context, organizationID, featureID string) bool
}

type autumnClientChecker struct {
	client *autumn.Client
}

func (c autumnClientChecker) BooleanFeatureEnabled(ctx context.Context, organizationID, featureID string) bool {
	return autumn.IsBooleanFeatureEnabled(ctx, c.client, organizationID, featureID)
}

type issueSheetAPI struct {
	pool       dictionaryPool
	membership func(context.Context, string) (*workos.UserOrganizationMembership, error)
	autumn     autumnChecker
}

type issueSheetActor struct {
	userID, organizationID, organizationSlug, role string
}

func (a issueSheetActor) canRead() bool {
	switch a.role {
	case "admin", "localization_manager", "member", "developer", "translator", "reviewer":
		return true
	default:
		return false
	}
}

func (a issueSheetActor) canMutateIssues() bool {
	switch a.role {
	case "admin", "localization_manager", "developer", "translator", "reviewer":
		return true
	default:
		return false
	}
}

func (a issueSheetActor) canManageColumns() bool {
	switch a.role {
	case "admin", "localization_manager", "developer":
		return true
	default:
		return false
	}
}

func (a issueSheetActor) canWriteProjectTeam() bool {
	switch a.role {
	case "admin", "localization_manager":
		return true
	default:
		return false
	}
}

type issueSheetError struct {
	status        int
	code, message string
}

func (e *issueSheetError) Error() string { return e.code }

func issueSheetFailure(status int, code, message string) error {
	return &issueSheetError{status: status, code: code, message: message}
}

func missingIssueSheetProject() error {
	return issueSheetFailure(404, "project_not_found", "Project not found")
}

func missingIssueSheetIssue() error {
	return issueSheetFailure(404, "issue_not_found", "Issue not found")
}

func issueSheetJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "issue_sheet_json_encode_failed")
	}
}

func writeIssueSheetError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *issueSheetError
	if !errors.As(err, &failure) {
		slog.ErrorContext(r.Context(), "issue_sheet_request_failed", "phase", phase, "path", requestLogPath(r.URL.Path), "error", err.Error())
		failure = &issueSheetError{500, "internal_error", "Internal server error"}
	} else if failure.status >= 500 {
		slog.ErrorContext(r.Context(), "issue_sheet_request_failed", "phase", phase, "path", requestLogPath(r.URL.Path), "code", failure.code)
	}
	issueSheetJSON(r.Context(), w, failure.status, map[string]string{"error": failure.code, "message": failure.message})
}

func formatIssueSheetTime(t time.Time) string {
	return formatGlossaryTime(t)
}

func formatIssueSheetTimePtr(t *time.Time) *string {
	return formatGlossaryTimePtr(t)
}

func (api *issueSheetAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	for _, path := range []string{
		"/v1/orgs/{organizationSlug}/projects/{projectId}/issue-sheet",
		"/v1/orgs/{organizationSlug}/projects/{projectId}/issue-sheet/{rest...}",
	} {
		mux.Handle(path, authMiddleware(verifier)(http.HandlerFunc(api.serveHTTP)))
	}
}

func (api *issueSheetAPI) actor(ctx context.Context, claims AuthClaims, slug string) (issueSheetActor, error) {
	var actor issueSheetActor
	var membershipID, workosOrg string
	if strings.HasPrefix(claims.UserID, "invited_user_") {
		return actor, issueSheetFailure(403, "organization_access_denied", "Organization access denied")
	}
	err := api.pool.QueryRow(ctx, `select u.id, o.id, o.slug, m.workos_membership_id, o.workos_organization_id
        from users u join organization_memberships m on m.user_id=u.id join organizations o on o.id=m.organization_id
        where u.workos_user_id=$1 and o.slug=$2 and o.lifecycle_status='active'
        and m.workos_membership_id is not null and m.workos_membership_id not in ('', 'replacing')`,
		claims.UserID, slug).Scan(&actor.userID, &actor.organizationID, &actor.organizationSlug, &membershipID, &workosOrg)
	if errors.Is(err, pgx.ErrNoRows) {
		return actor, issueSheetFailure(403, "organization_access_denied", "Organization access denied")
	}
	if err != nil {
		return actor, err
	}
	if api.membership == nil {
		return actor, issueSheetFailure(503, "workos_membership_lookup_failed", "Organization membership could not be verified")
	}
	member, err := api.membership(ctx, membershipID)
	if err != nil {
		var apiErr *workos.APIError
		if errors.As(err, &apiErr) && apiErr.StatusCode == 404 {
			return actor, issueSheetFailure(403, "organization_access_denied", "Organization access denied")
		}
		return actor, issueSheetFailure(503, "workos_membership_lookup_failed", "Organization membership could not be verified")
	}
	if member == nil || member.ID != membershipID || member.UserID != claims.UserID || member.OrganizationID != workosOrg || member.Status != "active" || member.Role == nil {
		return actor, issueSheetFailure(403, "organization_access_denied", "Organization access denied")
	}
	switch member.Role.Slug {
	case "admin", "localization_manager", "member", "developer", "translator", "reviewer":
		actor.role = member.Role.Slug
	default:
		return actor, issueSheetFailure(403, "organization_access_denied", "Organization access denied")
	}
	return actor, nil
}

func (api *issueSheetAPI) queriesBoardEnabled(ctx context.Context, organizationID string) bool {
	if api.autumn == nil {
		return false
	}
	return api.autumn.BooleanFeatureEnabled(ctx, organizationID, autumn.QueriesBoard)
}

func (api *issueSheetAPI) serveHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		origin := r.Header.Get("Origin")
		if origin != "" {
			parsed, err := url.Parse(origin)
			if err != nil || parsed.Host != r.Host || (parsed.Scheme != "http" && parsed.Scheme != "https") {
				writeIssueSheetError(w, r, "origin_guard", issueSheetFailure(403, "forbidden", "Cross-origin request denied"))
				return
			}
		}
		if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
			writeIssueSheetError(w, r, "origin_guard", issueSheetFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
	}
	if api.pool == nil {
		writeIssueSheetError(w, r, "availability", issueSheetFailure(503, "issue_sheet_unavailable", "Issue sheet service unavailable"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), issueSheetRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
	if !ok {
		writeIssueSheetError(w, r, "auth", issueSheetFailure(401, "unauthorized", "Authentication required"))
		return
	}
	actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
	if err != nil {
		writeIssueSheetError(w, r, "resolve_actor", err)
		return
	}
	if !actor.canRead() {
		writeIssueSheetError(w, r, "authorize", issueSheetFailure(403, "forbidden", "Forbidden"))
		return
	}
	if !api.queriesBoardEnabled(ctx, actor.organizationID) {
		writeIssueSheetError(w, r, "autumn", issueSheetFailure(403, "feature_unavailable", "Queries is not included in your current plan."))
		return
	}

	projectID := strings.TrimSpace(r.PathValue("projectId"))
	project, err := api.ownedProject(ctx, actor, projectID)
	if err != nil {
		writeIssueSheetError(w, r, "resolve_project", err)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, issueSheetBodyLimit)
	value, status, err := api.dispatch(r, actor, project)
	if err != nil {
		writeIssueSheetError(w, r, "handle", err)
		return
	}
	if status == http.StatusNoContent {
		w.WriteHeader(status)
		return
	}
	issueSheetJSON(r.Context(), w, status, value)
}

func readIssueSheetBody(r *http.Request, dest any) error {
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(dest); err != nil {
		return issueSheetFailure(400, "invalid_issue_sheet_payload", "Invalid issue sheet payload")
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return issueSheetFailure(400, "invalid_issue_sheet_payload", "Invalid issue sheet payload")
	}
	return nil
}

// Matches TS isLegacyIssueUuid (UUID versions 1–8, RFC variant).
var legacyIssueUUIDPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func isLegacyIssueUUID(issueID string) bool {
	return legacyIssueUUIDPattern.MatchString(issueID)
}

func issueIDMatchSQL(issueID string, argIndex int) (string, any) {
	if isLegacyIssueUUID(issueID) {
		return "id = $" + strconv.Itoa(argIndex), issueID
	}
	return "identifier = $" + strconv.Itoa(argIndex), issueID
}
