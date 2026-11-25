package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/authz"
	"github.com/jackc/pgx/v5"
)

const workspaceIntegrationsRequestTimeout = 30 * time.Second

type workspaceIntegrationsAPI struct {
	pool       dictionaryPool
	membership organizationMembershipLookup
}

type workspaceIntegrationsActor struct {
	userID, organizationID, role string
}

func (a workspaceIntegrationsActor) canRead() bool {
	return authz.HasCapability(a.role, "integrations:read") || authz.HasCapability(a.role, "integrations:write")
}

type workspaceIntegrationsError struct {
	status        int
	code, message string
}

func (e *workspaceIntegrationsError) Error() string { return e.code }

func workspaceIntegrationsFailure(status int, code, message string) error {
	return &workspaceIntegrationsError{status: status, code: code, message: message}
}

func workspaceIntegrationsJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "workspace_integrations_response_write_failed")
	}
}

func writeWorkspaceIntegrationsError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *workspaceIntegrationsError
	if !errors.As(err, &failure) {
		logRequestFailure(r, "workspace_integrations_request_failed", phase, err)
		failure = &workspaceIntegrationsError{status: 500, code: "internal_error", message: "Internal server error"}
	} else {
		logRequestFailure(r, "workspace_integrations_request_failed", phase, err, "status", failure.status, "code", failure.code)
	}
	workspaceIntegrationsJSON(r.Context(), w, failure.status, map[string]string{
		"error":   failure.code,
		"message": failure.message,
	})
}

func (api *workspaceIntegrationsAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	route := func(pattern string, fn func(*http.Request, workspaceIntegrationsActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+orgRoutePrefix+"/github-installation", bindActor(api, (*workspaceIntegrationsAPI).getGithubInstallation))
	route("GET "+orgRoutePrefix+"/github-installation/repositories", bindActor(api, (*workspaceIntegrationsAPI).listGithubRepositories))
	route("GET "+orgRoutePrefix+"/agent-slack", bindActor(api, (*workspaceIntegrationsAPI).getSlackAgent))
}

func (api *workspaceIntegrationsAPI) handle(fn func(*http.Request, workspaceIntegrationsActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeWorkspaceIntegrationsError(w, r, "origin_guard", workspaceIntegrationsFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
		if api.pool == nil {
			writeWorkspaceIntegrationsError(w, r, "availability", workspaceIntegrationsFailure(503, "integrations_unavailable", "Integrations service unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), workspaceIntegrationsRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeWorkspaceIntegrationsError(w, r, "auth", workspaceIntegrationsFailure(401, "unauthorized", "Authentication required"))
			return
		}
		actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeWorkspaceIntegrationsError(w, r, "resolve_actor", err)
			return
		}
		if !actor.canRead() {
			writeWorkspaceIntegrationsError(w, r, "authorize", workspaceIntegrationsFailure(403, "forbidden", "Insufficient permissions"))
			return
		}
		value, status, err := fn(r, actor)
		if err != nil {
			writeWorkspaceIntegrationsError(w, r, "handle", err)
			return
		}
		workspaceIntegrationsJSON(ctx, w, status, value)
	})
}

func (api *workspaceIntegrationsAPI) actor(ctx context.Context, claims AuthClaims, slug string) (workspaceIntegrationsActor, error) {
	resolved, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, slug)
	if err != nil {
		return workspaceIntegrationsActor{}, mapOrganizationAccessError(err, workspaceIntegrationsFailure)
	}
	return workspaceIntegrationsActor(resolved), nil
}

type githubInstallationRecord struct {
	GithubInstallationID   string `json:"githubInstallationId"`
	AccountLogin           string `json:"accountLogin,omitempty"`
	RepositoryCount        int    `json:"repositoryCount"`
	EnabledRepositoryCount int    `json:"enabledRepositoryCount"`
}

type githubRepositoryRecord struct {
	ID            string  `json:"id"`
	FullName      string  `json:"fullName"`
	Owner         string  `json:"owner"`
	Name          string  `json:"name"`
	Enabled       bool    `json:"enabled"`
	Archived      bool    `json:"archived"`
	DefaultBranch *string `json:"defaultBranch"`
}

func (api *workspaceIntegrationsAPI) getGithubInstallation(r *http.Request, actor workspaceIntegrationsActor) (any, int, error) {
	var installation githubInstallationRecord
	err := api.pool.QueryRow(r.Context(), `
        select github_installation_id,
               coalesce(account_login, ''),
               (select count(*)::int from github_installation_repositories r
                 where r.organization_id=$1
                   and r.github_installation_id=i.github_installation_id),
               (select count(*)::int from github_installation_repositories r
                 where r.organization_id=$1
                   and r.github_installation_id=i.github_installation_id
                   and r.enabled)
          from github_installations i
         where i.organization_id=$1
         limit 1`, actor.organizationID).
		Scan(
			&installation.GithubInstallationID,
			&installation.AccountLogin,
			&installation.RepositoryCount,
			&installation.EnabledRepositoryCount,
		)
	if errors.Is(err, pgx.ErrNoRows) {
		return map[string]any{"installation": nil}, http.StatusOK, nil
	}
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"installation": installation}, http.StatusOK, nil
}

func (api *workspaceIntegrationsAPI) listGithubRepositories(r *http.Request, actor workspaceIntegrationsActor) (any, int, error) {
	rows, err := api.pool.Query(r.Context(), `
        select id::text, full_name, owner, name, enabled, archived, default_branch
          from github_installation_repositories
         where organization_id=$1
         order by full_name`, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	repositories := make([]githubRepositoryRecord, 0)
	for rows.Next() {
		var repository githubRepositoryRecord
		if err := rows.Scan(
			&repository.ID,
			&repository.FullName,
			&repository.Owner,
			&repository.Name,
			&repository.Enabled,
			&repository.Archived,
			&repository.DefaultBranch,
		); err != nil {
			return nil, 0, err
		}
		repositories = append(repositories, repository)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"repositories": repositories}, http.StatusOK, nil
}

type slackAgentRecord struct {
	Enabled  bool    `json:"enabled"`
	TeamID   *string `json:"teamId"`
	TeamName *string `json:"teamName"`
}

func (api *workspaceIntegrationsAPI) getSlackAgent(r *http.Request, actor workspaceIntegrationsActor) (any, int, error) {
	var enabled bool
	var config []byte
	err := api.pool.QueryRow(r.Context(), `
        select enabled, coalesce(config, '{}'::jsonb)
          from connectors
         where organization_id=$1 and kind='slack'
         limit 1`, actor.organizationID).Scan(&enabled, &config)
	if errors.Is(err, pgx.ErrNoRows) {
		return map[string]any{"slackAgent": slackAgentRecord{Enabled: false}}, http.StatusOK, nil
	}
	if err != nil {
		return nil, 0, err
	}
	var parsed struct {
		TeamID   string `json:"teamId"`
		TeamName string `json:"teamName"`
	}
	if len(config) > 0 {
		_ = json.Unmarshal(config, &parsed)
	}
	record := slackAgentRecord{Enabled: enabled}
	if parsed.TeamID != "" {
		record.TeamID = &parsed.TeamID
	}
	if parsed.TeamName != "" {
		record.TeamName = &parsed.TeamName
	}
	return map[string]any{"slackAgent": record}, http.StatusOK, nil
}
