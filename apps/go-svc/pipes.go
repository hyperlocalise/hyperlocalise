package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/workos/workos-go/v10"
	"golang.org/x/sync/errgroup"
)

const (
	pipesBodyLimit      = 64 << 10
	pipesRequestTimeout = 30 * time.Second
)

var pipesProviderSlugs = []string{
	"ahrefs",
	"atlassian",
	"braze",
	"customer-io",
	"gitlab",
	"google-drive",
	"google-search-console",
	"hubspot",
	"intercom",
	"iterable",
	"loops",
	"mailchimp",
	"notion",
	"resend",
	"sanity",
	"sendgrid",
	"similarweb",
	"webflow",
}

var pipesProviderSet = func() map[string]struct{} {
	set := make(map[string]struct{}, len(pipesProviderSlugs))
	for _, slug := range pipesProviderSlugs {
		set[slug] = struct{}{}
	}
	return set
}()

type pipesAPI struct {
	pool       dictionaryPool
	membership organizationMembershipLookup
	accounts   pipesAccounts
	driveHTTP  googleDriveHTTP
}

type pipesActor struct {
	userID, organizationID, workosOrganizationID, role, workosUserID string
}

func (a pipesActor) canRead() bool {
	return hasOrganizationCapability(a.role, "integrations:read") || hasOrganizationCapability(a.role, "integrations:write")
}

func (a pipesActor) canWrite() bool {
	return hasOrganizationCapability(a.role, "integrations:write")
}

type pipesError struct {
	status        int
	code, message string
}

func (e *pipesError) Error() string { return e.code }

func pipesFailure(status int, code, message string) error {
	return &pipesError{status: status, code: code, message: message}
}

type pipesAccounts interface {
	GetUserConnectedAccount(ctx context.Context, userID, slug string, params *workos.PipesGetUserConnectedAccountParams) (*workos.ConnectedAccount, error)
	DeleteUserConnectedAccount(ctx context.Context, userID, slug string, params *workos.PipesDeleteUserConnectedAccountParams) error
	AuthorizeDataIntegration(ctx context.Context, slug string, params *workos.PipesAuthorizeDataIntegrationParams) (*workos.DataIntegrationAuthorizeURLResponse, error)
	GetDataIntegration(ctx context.Context, slug string) (*workos.DataIntegration, error)
	ListUserDataProviders(ctx context.Context, userID string, params *workos.PipesListUserDataProvidersParams) (*workos.DataIntegrationsListResponse, error)
	UpdateDataIntegrationAPIKey(ctx context.Context, slug string, params *workos.PipesUpdateDataIntegrationAPIKeyParams) (*workos.ConnectedAccountWriteResponse, error)
	GetAccessToken(ctx context.Context, provider string, params *workos.PipesGetAccessTokenParams) (*workos.DataIntegrationAccessTokenResponse, error)
}

type livePipesAccounts struct {
	client *workos.Client
}

func (a livePipesAccounts) GetUserConnectedAccount(ctx context.Context, userID, slug string, params *workos.PipesGetUserConnectedAccountParams) (*workos.ConnectedAccount, error) {
	return a.client.Pipes().GetUserConnectedAccount(ctx, userID, slug, params)
}

func (a livePipesAccounts) DeleteUserConnectedAccount(ctx context.Context, userID, slug string, params *workos.PipesDeleteUserConnectedAccountParams) error {
	return a.client.Pipes().DeleteUserConnectedAccount(ctx, userID, slug, params)
}

func (a livePipesAccounts) AuthorizeDataIntegration(ctx context.Context, slug string, params *workos.PipesAuthorizeDataIntegrationParams) (*workos.DataIntegrationAuthorizeURLResponse, error) {
	return a.client.Pipes().AuthorizeDataIntegration(ctx, slug, params)
}

func (a livePipesAccounts) GetDataIntegration(ctx context.Context, slug string) (*workos.DataIntegration, error) {
	return a.client.Pipes().GetDataIntegration(ctx, slug)
}

func (a livePipesAccounts) ListUserDataProviders(ctx context.Context, userID string, params *workos.PipesListUserDataProvidersParams) (*workos.DataIntegrationsListResponse, error) {
	return a.client.Pipes().ListUserDataProviders(ctx, userID, params)
}

func (a livePipesAccounts) UpdateDataIntegrationAPIKey(ctx context.Context, slug string, params *workos.PipesUpdateDataIntegrationAPIKeyParams) (*workos.ConnectedAccountWriteResponse, error) {
	return a.client.Pipes().UpdateDataIntegrationAPIKey(ctx, slug, params)
}

func (a livePipesAccounts) GetAccessToken(ctx context.Context, provider string, params *workos.PipesGetAccessTokenParams) (*workos.DataIntegrationAccessTokenResponse, error) {
	return a.client.Pipes().GetAccessToken(ctx, provider, params)
}

type pipesStatus struct {
	Provider             string  `json:"provider"`
	Connected            bool    `json:"connected"`
	NeedsReauthorization bool    `json:"needsReauthorization"`
	APIKeyLast4          *string `json:"apiKeyLast4"`
}

type pipesAvailability struct {
	WorkosConfigured     bool     `json:"workosConfigured"`
	ProviderConfigured   bool     `json:"providerConfigured"`
	ProviderEnabled      bool     `json:"providerEnabled"`
	SupportedAuthMethods []string `json:"supportedAuthMethods"`
}

type pipesAuthorizeBody struct {
	UserID         string `json:"user_id"`
	OrganizationID string `json:"organization_id"`
	ReturnTo       string `json:"return_to,omitempty"`
}

type pipesAPIKeyBody struct {
	UserID         string `json:"user_id"`
	OrganizationID string `json:"organization_id"`
	Secret         string `json:"secret"`
}

func pipesJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if value == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "pipes_response_write_failed")
	}
}

func writePipesError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *pipesError
	if !errors.As(err, &failure) {
		logRequestFailure(r, "pipes_request_failed", phase, err)
		failure = &pipesError{status: http.StatusInternalServerError, code: "internal_error", message: "Internal server error"}
	} else {
		logRequestFailure(r, "pipes_request_failed", phase, err, "status", failure.status, "code", failure.code)
	}
	pipesJSON(r.Context(), w, failure.status, map[string]any{"error": failure.code, "message": failure.message})
}

func isPipesProviderSlug(value string) bool {
	_, ok := pipesProviderSet[value]
	return ok
}

func (api *pipesAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	base := orgRoutePrefix + "/pipes"
	route := func(pattern string, fn func(*http.Request, pipesActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+base, api.listPipes)
	route("GET "+base+"/{provider}", api.getPipe)
	route("GET "+base+"/{provider}/availability", api.getAvailability)
	route("GET "+base+"/{provider}/authorize-url", api.getAuthorizeURL)
	route("PUT "+base+"/{provider}", api.putAPIKey)
	route("DELETE "+base+"/{provider}", api.deletePipe)
	route("GET "+base+"/{provider}/settings", api.getSettings)
	route("PUT "+base+"/{provider}/settings", api.putSettings)
	api.registerGoogleDrive(mux, verifier)
}

func (api *pipesAPI) handle(fn func(*http.Request, pipesActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writePipesError(w, r, "origin_guard", pipesFailure(http.StatusForbidden, "forbidden", "Cross-origin request denied"))
			return
		}
		if api.pool == nil {
			writePipesError(w, r, "availability", pipesFailure(http.StatusServiceUnavailable, "pipes_unavailable", "Pipes service unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), pipesRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writePipesError(w, r, "auth", pipesFailure(http.StatusUnauthorized, "unauthorized", "Authentication required"))
			return
		}
		actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writePipesError(w, r, "resolve_actor", err)
			return
		}
		if r.Method == http.MethodPut || r.Method == http.MethodPost || r.Method == http.MethodDelete {
			if !actor.canWrite() {
				writePipesError(w, r, "authorize", pipesFailure(http.StatusForbidden, "forbidden", "Insufficient permissions"))
				return
			}
		} else if !actor.canRead() {
			writePipesError(w, r, "authorize", pipesFailure(http.StatusForbidden, "forbidden", "Insufficient permissions"))
			return
		}
		if r.Method == http.MethodPut || r.Method == http.MethodPost {
			r.Body = http.MaxBytesReader(w, r.Body, pipesBodyLimit)
		}
		value, status, err := fn(r, actor)
		if err != nil {
			writePipesError(w, r, "handle", err)
			return
		}
		if status == http.StatusNoContent {
			w.WriteHeader(status)
			return
		}
		pipesJSON(ctx, w, status, value)
	})
}

func (api *pipesAPI) actor(ctx context.Context, claims AuthClaims, slug string) (pipesActor, error) {
	resolved, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, slug)
	if err != nil {
		return pipesActor{}, mapOrganizationAccessError(err, pipesFailure)
	}
	var workosOrg string
	err = api.pool.QueryRow(ctx, `select workos_organization_id from organizations where id=$1`, resolved.organizationID).Scan(&workosOrg)
	if err != nil {
		return pipesActor{}, err
	}
	return pipesActor{
		userID:               resolved.userID,
		organizationID:       resolved.organizationID,
		workosOrganizationID: workosOrg,
		role:                 resolved.role,
		workosUserID:         claims.UserID,
	}, nil
}

func (api *pipesAPI) listPipes(r *http.Request, actor pipesActor) (any, int, error) {
	statuses := make([]pipesStatus, len(pipesProviderSlugs))
	group, ctx := errgroup.WithContext(r.Context())
	var mu sync.Mutex
	for i, slug := range pipesProviderSlugs {
		i, slug := i, slug
		group.Go(func() error {
			status, err := api.connectionStatus(ctx, actor, slug)
			if err != nil {
				return err
			}
			mu.Lock()
			statuses[i] = status
			mu.Unlock()
			return nil
		})
	}
	if err := group.Wait(); err != nil {
		return nil, 0, err
	}
	return map[string]any{
		"pipes":     statuses,
		"canManage": actor.canWrite(),
	}, http.StatusOK, nil
}

func (api *pipesAPI) getPipe(r *http.Request, actor pipesActor) (any, int, error) {
	provider := r.PathValue("provider")
	if !isPipesProviderSlug(provider) {
		return nil, 0, pipesFailure(http.StatusNotFound, "unknown_pipes_provider", "Unknown Pipes provider")
	}
	status, err := api.connectionStatus(r.Context(), actor, provider)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"pipe": status}, http.StatusOK, nil
}

func (api *pipesAPI) getAvailability(r *http.Request, actor pipesActor) (any, int, error) {
	provider := r.PathValue("provider")
	if !isPipesProviderSlug(provider) {
		return nil, 0, pipesFailure(http.StatusNotFound, "unknown_pipes_provider", "Unknown Pipes provider")
	}
	availability, err := api.providerAvailability(r.Context(), actor, provider)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"availability": availability}, http.StatusOK, nil
}

func (api *pipesAPI) getAuthorizeURL(r *http.Request, actor pipesActor) (any, int, error) {
	if !actor.canWrite() {
		return nil, 0, pipesFailure(http.StatusForbidden, "forbidden", "Insufficient permissions")
	}
	provider := r.PathValue("provider")
	if !isPipesProviderSlug(provider) {
		return nil, 0, pipesFailure(http.StatusNotFound, "unknown_pipes_provider", "Unknown Pipes provider")
	}
	availability, err := api.providerAvailability(r.Context(), actor, provider)
	if err != nil {
		return nil, 0, err
	}
	if !pipesSupportsOAuth(availability) {
		return nil, 0, pipesFailure(http.StatusServiceUnavailable, "pipes_oauth_unavailable", "This integration only supports API key authentication in WorkOS Pipes.")
	}
	if api.accounts == nil {
		return nil, 0, pipesFailure(http.StatusServiceUnavailable, "pipes_unavailable", "WorkOS is not configured, so this provider cannot connect through Pipes.")
	}
	orgID := actor.workosOrganizationID
	body := pipesAuthorizeBody{
		UserID:         actor.workosUserID,
		OrganizationID: orgID,
		ReturnTo:       pipesReturnTo(r, actor, provider),
	}
	result, err := api.accounts.AuthorizeDataIntegration(r.Context(), provider, &workos.PipesAuthorizeDataIntegrationParams{Body: body})
	if err != nil {
		return nil, 0, mapPipesWorkosError(err, "pipes_unavailable", "WorkOS is not configured, so this provider cannot connect through Pipes.")
	}
	url := ""
	if result != nil {
		url = strings.TrimSpace(result.URL)
	}
	if url == "" {
		return nil, 0, pipesFailure(http.StatusServiceUnavailable, "pipes_unavailable", "WorkOS is not configured, so this provider cannot connect through Pipes.")
	}
	return map[string]any{"url": url}, http.StatusOK, nil
}

func (api *pipesAPI) putAPIKey(r *http.Request, actor pipesActor) (any, int, error) {
	provider := r.PathValue("provider")
	if !isPipesProviderSlug(provider) {
		return nil, 0, pipesFailure(http.StatusNotFound, "unknown_pipes_provider", "Unknown Pipes provider")
	}
	var body struct {
		Secret string `json:"secret"`
	}
	if err := readPipesJSON(r, &body); err != nil {
		return nil, 0, err
	}
	status, err := api.upsertAPIKey(r.Context(), actor, provider, body.Secret)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"pipe": status}, http.StatusOK, nil
}

func (api *pipesAPI) deletePipe(r *http.Request, actor pipesActor) (any, int, error) {
	provider := r.PathValue("provider")
	if !isPipesProviderSlug(provider) {
		return nil, 0, pipesFailure(http.StatusNotFound, "unknown_pipes_provider", "Unknown Pipes provider")
	}
	if api.accounts == nil {
		return nil, 0, pipesFailure(http.StatusServiceUnavailable, "pipes_unavailable", "WorkOS is not configured, so this provider cannot connect through Pipes.")
	}
	orgID := actor.workosOrganizationID
	err := api.accounts.DeleteUserConnectedAccount(r.Context(), actor.workosUserID, provider, &workos.PipesDeleteUserConnectedAccountParams{
		OrganizationID: &orgID,
	})
	if err != nil {
		return nil, 0, mapPipesWorkosError(err, "pipes_unavailable", "WorkOS is not configured, so this provider cannot connect through Pipes.")
	}
	if err := api.clearProviderSettings(r.Context(), actor, provider); err != nil {
		return nil, 0, err
	}
	return nil, http.StatusNoContent, nil
}

func (api *pipesAPI) connectionStatus(ctx context.Context, actor pipesActor, provider string) (pipesStatus, error) {
	status := pipesStatus{Provider: provider, APIKeyLast4: nil}
	if api.accounts == nil {
		return status, pipesFailure(http.StatusServiceUnavailable, "pipes_unavailable", "WorkOS is not configured, so this provider cannot connect through Pipes.")
	}
	orgID := actor.workosOrganizationID
	account, err := api.accounts.GetUserConnectedAccount(ctx, actor.workosUserID, provider, &workos.PipesGetUserConnectedAccountParams{
		OrganizationID: &orgID,
	})
	if err != nil {
		var apiErr *workos.APIError
		if errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusNotFound {
			return status, nil
		}
		return status, pipesFailure(http.StatusServiceUnavailable, "pipes_unavailable", "WorkOS is not configured, so this provider cannot connect through Pipes.")
	}
	if account == nil {
		return status, nil
	}
	if account.APIKeyLast4 != nil && strings.TrimSpace(*account.APIKeyLast4) != "" {
		last4 := strings.TrimSpace(*account.APIKeyLast4)
		status.APIKeyLast4 = &last4
	}
	switch account.State {
	case workos.ConnectedAccountStateNeedsReauthorization:
		status.NeedsReauthorization = true
	case workos.ConnectedAccountStateConnected:
		status.Connected = true
	}
	return status, nil
}

func (api *pipesAPI) providerAvailability(ctx context.Context, actor pipesActor, provider string) (pipesAvailability, error) {
	unavailable := pipesAvailability{SupportedAuthMethods: []string{}}
	if api.accounts == nil {
		return unavailable, nil
	}
	methods := []string{"oauth", "api_key"}
	orgID := actor.workosOrganizationID
	list, err := api.accounts.ListUserDataProviders(ctx, actor.workosUserID, &workos.PipesListUserDataProvidersParams{
		OrganizationID: &orgID,
	})
	if err == nil && list != nil {
		for _, entry := range list.Data {
			if entry == nil || entry.Slug != provider {
				continue
			}
			methods = normalizePipesAuthMethods(entry.AuthMethods)
			break
		}
	}
	integration, err := api.accounts.GetDataIntegration(ctx, provider)
	if err != nil {
		return pipesAvailability{
			WorkosConfigured:     true,
			SupportedAuthMethods: methods,
		}, nil
	}
	enabled := false
	if integration != nil {
		enabled = integration.Enabled
	}
	return pipesAvailability{
		WorkosConfigured:     true,
		ProviderConfigured:   integration != nil,
		ProviderEnabled:      enabled,
		SupportedAuthMethods: methods,
	}, nil
}

func (api *pipesAPI) upsertAPIKey(ctx context.Context, actor pipesActor, provider, secret string) (pipesStatus, error) {
	secret = strings.TrimSpace(secret)
	if secret == "" {
		return pipesStatus{}, pipesFailure(http.StatusBadRequest, "pipes_not_connected", "Paste an API key to connect.")
	}
	if api.accounts == nil {
		return pipesStatus{}, pipesFailure(http.StatusServiceUnavailable, "pipes_unavailable", "WorkOS is not configured, so this provider cannot connect through Pipes.")
	}
	orgID := actor.workosOrganizationID
	account, err := api.accounts.UpdateDataIntegrationAPIKey(ctx, provider, &workos.PipesUpdateDataIntegrationAPIKeyParams{
		Body: pipesAPIKeyBody{
			UserID:         actor.workosUserID,
			OrganizationID: orgID,
			Secret:         secret,
		},
	})
	if err != nil {
		return pipesStatus{}, mapPipesWorkosError(err, "pipes_unavailable", "WorkOS is not configured, so this provider cannot connect through Pipes.")
	}
	status := pipesStatus{Provider: provider}
	if account != nil {
		if account.APIKeyLast4 != nil && strings.TrimSpace(*account.APIKeyLast4) != "" {
			last4 := strings.TrimSpace(*account.APIKeyLast4)
			status.APIKeyLast4 = &last4
		}
		switch account.State {
		case workos.ConnectedAccountStateNeedsReauthorization:
			return status, pipesFailure(http.StatusUnauthorized, "pipes_needs_reauthorization", "Reconnect this provider in Integrations, then try again.")
		case workos.ConnectedAccountStateConnected:
			status.Connected = true
		default:
			return status, pipesFailure(http.StatusNotFound, "pipes_not_connected", "Connect this provider in Integrations before using it.")
		}
	}
	if !status.Connected {
		return status, pipesFailure(http.StatusNotFound, "pipes_not_connected", "Connect this provider in Integrations before using it.")
	}
	return status, nil
}

func (api *pipesAPI) pipeAccessToken(ctx context.Context, actor pipesActor, provider string) (string, error) {
	if api.accounts == nil {
		return "", pipesFailure(http.StatusServiceUnavailable, "pipes_unavailable", "WorkOS is not configured, so this provider cannot connect through Pipes.")
	}
	orgID := actor.workosOrganizationID
	result, err := api.accounts.GetAccessToken(ctx, provider, &workos.PipesGetAccessTokenParams{
		UserID:         actor.workosUserID,
		OrganizationID: &orgID,
	})
	if err != nil {
		return "", mapPipesWorkosError(err, "pipes_unavailable", "WorkOS is not configured, so this provider cannot connect through Pipes.")
	}
	if result == nil || result.Active == nil || !*result.Active || result.AccessToken == nil || strings.TrimSpace(result.AccessToken.AccessToken) == "" {
		if result != nil && result.Error != nil && *result.Error == workos.DataIntegrationAccessTokenResponseErrorNeedsReauthorization {
			return "", pipesFailure(http.StatusUnauthorized, "pipes_needs_reauthorization", "Reconnect this provider in Integrations, then try again.")
		}
		return "", pipesFailure(http.StatusNotFound, "pipes_not_connected", "Connect this provider in Integrations before using it.")
	}
	return strings.TrimSpace(result.AccessToken.AccessToken), nil
}

func normalizePipesAuthMethods[T ~string](methods []T) []string {
	out := make([]string, 0, len(methods))
	seen := map[string]struct{}{}
	for _, method := range methods {
		value := string(method)
		if value != "oauth" && value != "api_key" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	if len(out) == 0 {
		return []string{"oauth", "api_key"}
	}
	return out
}

func pipesSupportsOAuth(availability pipesAvailability) bool {
	for _, method := range availability.SupportedAuthMethods {
		if method == "oauth" {
			return true
		}
	}
	return false
}

func pipesReturnTo(r *http.Request, actor pipesActor, provider string) string {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("HYPERLOCALISE_PUBLIC_APP_URL")), "/")
	if base == "" {
		return ""
	}
	slug := r.PathValue("organizationSlug")
	if slug == "" {
		return ""
	}
	_ = actor
	return base + "/org/" + slug + "/integrations?pipesCallback=" + provider
}

func mapPipesWorkosError(err error, fallbackCode, fallbackMessage string) error {
	var apiErr *workos.APIError
	if errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusNotFound {
		return pipesFailure(http.StatusNotFound, "pipes_not_connected", "Connect this provider in Integrations before using it.")
	}
	return pipesFailure(http.StatusServiceUnavailable, fallbackCode, fallbackMessage)
}

func readPipesJSON(r *http.Request, dest any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dest); err != nil {
		if errors.Is(err, io.EOF) {
			return pipesFailure(http.StatusBadRequest, "invalid_pipes_payload", "Request body is required")
		}
		return pipesFailure(http.StatusBadRequest, "invalid_pipes_payload", "Request body is invalid")
	}
	return nil
}
