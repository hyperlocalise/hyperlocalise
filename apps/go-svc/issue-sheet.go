package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
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

var errIssueSheetUnmatched = errors.New("issue_sheet_unmatched")

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
	s := orgRoutePrefix + "/projects/{projectId}/issue-sheet"
	route := func(pattern string, fn func(*http.Request, issueSheetActor, issueSheetProject) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+s, api.listIssuesHandler)
	route("POST "+s, api.createIssueHandler)
	route("GET "+s+"/assignable-members", api.listAssignableMembersHandler)
	route("GET "+s+"/columns", api.listColumnsHandler)
	route("POST "+s+"/columns", api.createColumnHandler)
	route("PUT "+s+"/columns/order", api.reorderColumnsHandler)
	route("GET "+s+"/template-config", api.getTemplateConfigHandler)
	route("PUT "+s+"/template-config", api.putTemplateConfigHandler)
	route("GET "+s+"/{issueId}", api.getIssueHandler)
	route("PATCH "+s+"/{issueId}", api.updateIssueHandler)
	route("DELETE "+s+"/{issueId}", api.deleteIssueHandler)
	route("GET "+s+"/{issueId}/feed", api.listFeedHandler)
	route("GET "+s+"/{issueId}/subscriptions", api.listSubscriptionsHandler)
	route("POST "+s+"/{issueId}/subscription", api.watchIssueHandler)
	route("POST "+s+"/{issueId}/comments", api.createCommentHandler)
	// PATCH/DELETE two-segment patterns overlap (columns/{columnId} vs {issueId}/values
	// and {issueId}/subscription), so ServeMux cannot register both.
	route("PATCH "+s+"/{first}/{second}", api.patchTwoSegmentHandler)
	route("DELETE "+s+"/{first}/{second}", api.deleteTwoSegmentHandler)
	route("PATCH "+s+"/{issueId}/comments/{commentId}", api.updateCommentHandler)
	route("DELETE "+s+"/{issueId}/comments/{commentId}", api.deleteCommentHandler)
	route("GET "+s+"/{issueId}/relationships", api.listRelationshipsHandler)
	route("POST "+s+"/{issueId}/relationships", api.createRelationshipHandler)
	route("DELETE "+s+"/{issueId}/relationships/{relationshipId}", api.deleteRelationshipHandler)
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

func (api *issueSheetAPI) handle(fn func(*http.Request, issueSheetActor, issueSheetProject) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeIssueSheetError(w, r, "origin_guard", issueSheetFailure(403, "forbidden", "Cross-origin request denied"))
			return
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

		project, err := api.ownedProject(ctx, actor, strings.TrimSpace(r.PathValue("projectId")))
		if err != nil {
			writeIssueSheetError(w, r, "resolve_project", err)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, issueSheetBodyLimit)
		value, status, err := fn(r, actor, project)
		if errors.Is(err, errIssueSheetUnmatched) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			writeIssueSheetError(w, r, "handle", err)
			return
		}
		if status == http.StatusNoContent {
			w.WriteHeader(status)
			return
		}
		issueSheetJSON(r.Context(), w, status, value)
	})
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
