package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/workos/workos-go/v10"
)

const (
	workspaceDomainsFlag  = "workspace-domains"
	workspaceHyperlabFlag = "workspace-hyperlab"
	gscPipesSlug          = "google-search-console"
	workspaceBodyLimit    = 1 << 20
)

type workspaceAPI struct {
	pool       dictionaryPool
	membership organizationMembershipLookup
	flags      workspaceFlagChecker
	pipes      pipeTokenSource
}

type workspaceActor struct {
	userID               string
	organizationID       string
	role                 string
	workosUserID         string
	workosOrganizationID string
}

type workspaceFlagChecker interface {
	Enabled(ctx context.Context, workosOrganizationID, workosUserID, slug string) (bool, error)
}

type pipeTokenSource interface {
	AccessToken(ctx context.Context, provider, workosUserID, workosOrganizationID string) (string, error)
}

type workspaceError struct {
	status        int
	code, message string
}

func (e *workspaceError) Error() string { return e.code }

func workspaceFailure(status int, code, message string) error {
	return &workspaceError{status, code, message}
}

func (a workspaceActor) canReadProjects() bool {
	switch a.role {
	case "admin", "localization_manager", "developer", "reviewer", "translator", "member":
		return true
	default:
		return false
	}
}

func (a workspaceActor) canWriteProjects() bool {
	switch a.role {
	case "admin", "localization_manager", "developer":
		return true
	default:
		return false
	}
}

func (a workspaceActor) canReadExperiments() bool { return a.canReadProjects() }

func (a workspaceActor) canWriteExperiments() bool { return a.canWriteProjects() }

func (api *workspaceAPI) actor(ctx context.Context, claims AuthClaims, slug string) (workspaceActor, error) {
	resolved, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, slug)
	if err != nil {
		return workspaceActor{}, mapOrganizationAccessError(err, workspaceFailure)
	}
	var workosOrg string
	err = api.pool.QueryRow(ctx, `select workos_organization_id from organizations where id=$1`, resolved.organizationID).Scan(&workosOrg)
	if err != nil {
		return workspaceActor{}, err
	}
	return workspaceActor{
		userID:               resolved.userID,
		organizationID:       resolved.organizationID,
		role:                 resolved.role,
		workosUserID:         claims.UserID,
		workosOrganizationID: workosOrg,
	}, nil
}

func (api *workspaceAPI) requireFlag(ctx context.Context, actor workspaceActor, slug, message string) error {
	if api.flags == nil {
		return workspaceFailure(403, "feature_unavailable", message)
	}
	enabled, err := api.flags.Enabled(ctx, actor.workosOrganizationID, actor.workosUserID, slug)
	if err != nil || !enabled {
		return workspaceFailure(403, "feature_unavailable", message)
	}
	return nil
}

func (h *handler) workspaceHandle(
	flagSlug, flagMessage, deniedMessage string,
	allow func(workspaceActor) bool,
	fn func(*http.Request, workspaceActor) (any, int, error),
) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeWorkspaceError(w, r, workspaceFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
		if h.workspace == nil || h.workspace.pool == nil {
			writeWorkspaceError(w, r, workspaceFailure(503, "service_unavailable", "Workspace service unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeWorkspaceError(w, r, workspaceFailure(401, "unauthorized", "Authentication required"))
			return
		}
		actor, err := h.workspace.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeWorkspaceError(w, r, err)
			return
		}
		if err := h.workspace.requireFlag(ctx, actor, flagSlug, flagMessage); err != nil {
			writeWorkspaceError(w, r, err)
			return
		}
		if !allow(actor) {
			writeWorkspaceError(w, r, workspaceFailure(403, "forbidden", deniedMessage))
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, workspaceBodyLimit)
		value, status, err := fn(r, actor)
		if err != nil {
			writeWorkspaceError(w, r, err)
			return
		}
		if status == http.StatusNoContent {
			w.WriteHeader(status)
			return
		}
		writeJSON(w, status, value)
	})
}

func writeWorkspaceError(w http.ResponseWriter, r *http.Request, err error) {
	var failure *workspaceError
	if !errors.As(err, &failure) {
		logRequestFailure(r, "workspace_request_failed", "handle", err)
		failure = &workspaceError{500, "internal_error", "Internal server error"}
	} else {
		logRequestFailure(r, "workspace_request_failed", "handle", err, "status", failure.status, "code", failure.code)
	}
	writeJSON(w, failure.status, map[string]string{"error": failure.code, "message": failure.message})
}

func decodeWorkspaceBody(r *http.Request, dest any) error {
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(dest); err != nil {
		return workspaceFailure(400, "invalid_payload", "Request payload is invalid")
	}
	return nil
}

func readWorkspaceObject(r *http.Request) (map[string]json.RawMessage, error) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, workspaceFailure(400, "invalid_payload", "Request payload is invalid")
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		return map[string]json.RawMessage{}, nil
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		return nil, workspaceFailure(400, "invalid_payload", "Request payload is invalid")
	}
	return fields, nil
}

type workosWorkspaceFlags struct {
	client *workos.Client
}

func (f workosWorkspaceFlags) Enabled(ctx context.Context, workosOrganizationID, workosUserID, slug string) (bool, error) {
	if f.client == nil || strings.TrimSpace(slug) == "" {
		return false, nil
	}
	orgEnabled, err := flagSlugEnabled(f.client.FeatureFlags().ListOrganizationFeatureFlags(ctx, workosOrganizationID, &workos.FeatureFlagsListOrganizationFeatureFlagsParams{}), slug)
	if err != nil {
		return false, err
	}
	if orgEnabled {
		return true, nil
	}
	return flagSlugEnabled(f.client.FeatureFlags().ListUserFeatureFlags(ctx, workosUserID, &workos.FeatureFlagsListUserFeatureFlagsParams{}), slug)
}

func flagSlugEnabled(iter *workos.Iterator[workos.Flag], slug string) (bool, error) {
	for iter.Next() {
		flag := iter.Current()
		if flag != nil && flag.Slug == slug && flag.Enabled {
			return true, nil
		}
	}
	return false, iter.Err()
}

type workosPipeTokens struct {
	client *workos.Client
}

func (p workosPipeTokens) AccessToken(ctx context.Context, provider, workosUserID, workosOrganizationID string) (string, error) {
	if p.client == nil {
		return "", workspaceFailure(503, "gsc_pipes_unavailable", "WorkOS is not configured, so Search Console cannot connect through Pipes.")
	}
	orgID := workosOrganizationID
	result, err := p.client.Pipes().GetAccessToken(ctx, provider, &workos.PipesGetAccessTokenParams{
		UserID:         workosUserID,
		OrganizationID: &orgID,
	})
	if err != nil {
		var apiErr *workos.APIError
		if errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusNotFound {
			return "", workspaceFailure(404, "gsc_not_connected", "Connect Google Search Console in Integrations before using it.")
		}
		return "", workspaceFailure(503, "gsc_pipes_unavailable", "WorkOS is not configured, so Search Console cannot connect through Pipes.")
	}
	if result == nil || result.Active == nil || !*result.Active || result.AccessToken == nil || strings.TrimSpace(result.AccessToken.AccessToken) == "" {
		if result != nil && result.Error != nil && *result.Error == workos.DataIntegrationAccessTokenResponseErrorNeedsReauthorization {
			return "", workspaceFailure(401, "gsc_pipes_needs_reauthorization", "Reconnect Google Search Console in Integrations, then try again.")
		}
		return "", workspaceFailure(404, "gsc_not_connected", "Connect Google Search Console in Integrations before using it.")
	}
	return strings.TrimSpace(result.AccessToken.AccessToken), nil
}

func isNoRows(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}
