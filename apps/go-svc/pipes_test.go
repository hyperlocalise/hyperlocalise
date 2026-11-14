package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

type stubPipesAccounts struct {
	accounts     map[string]*workos.ConnectedAccount
	availability map[string]*workos.DataIntegration
	methods      map[string][]workos.ConnectedAccountAuthMethod
	authorizeURL string
	deleted      []string
	updated      []string
}

func (s *stubPipesAccounts) GetUserConnectedAccount(_ context.Context, _, slug string, _ *workos.PipesGetUserConnectedAccountParams) (*workos.ConnectedAccount, error) {
	account, ok := s.accounts[slug]
	if !ok {
		return nil, &workos.APIError{StatusCode: http.StatusNotFound, Code: "not_found"}
	}
	return account, nil
}

func (s *stubPipesAccounts) DeleteUserConnectedAccount(_ context.Context, _, slug string, _ *workos.PipesDeleteUserConnectedAccountParams) error {
	s.deleted = append(s.deleted, slug)
	delete(s.accounts, slug)
	return nil
}

func (s *stubPipesAccounts) AuthorizeDataIntegration(_ context.Context, _ string, _ *workos.PipesAuthorizeDataIntegrationParams) (*workos.DataIntegrationAuthorizeURLResponse, error) {
	return &workos.DataIntegrationAuthorizeURLResponse{URL: s.authorizeURL}, nil
}

func (s *stubPipesAccounts) GetDataIntegration(_ context.Context, slug string) (*workos.DataIntegration, error) {
	if integration, ok := s.availability[slug]; ok {
		return integration, nil
	}
	return nil, &workos.APIError{StatusCode: http.StatusNotFound, Code: "not_found"}
}

func (s *stubPipesAccounts) ListUserDataProviders(_ context.Context, _ string, _ *workos.PipesListUserDataProvidersParams) (*workos.DataIntegrationsListResponse, error) {
	data := make([]*workos.DataIntegrationsListResponseData, 0, len(s.methods))
	for slug, methods := range s.methods {
		data = append(data, &workos.DataIntegrationsListResponseData{Slug: slug, AuthMethods: methods})
	}
	return &workos.DataIntegrationsListResponse{Data: data}, nil
}

func (s *stubPipesAccounts) UpdateDataIntegrationAPIKey(_ context.Context, slug string, params *workos.PipesUpdateDataIntegrationAPIKeyParams) (*workos.ConnectedAccountWriteResponse, error) {
	s.updated = append(s.updated, slug)
	last4 := "4242"
	account := &workos.ConnectedAccount{State: workos.ConnectedAccountStateConnected, APIKeyLast4: &last4}
	s.accounts[slug] = account
	body, _ := json.Marshal(params.Body)
	_ = body
	return &workos.ConnectedAccountWriteResponse{State: workos.ConnectedAccountStateConnected, APIKeyLast4: &last4}, nil
}

func (s *stubPipesAccounts) GetAccessToken(_ context.Context, _ string, _ *workos.PipesGetAccessTokenParams) (*workos.DataIntegrationAccessTokenResponse, error) {
	active := true
	return &workos.DataIntegrationAccessTokenResponse{
		Active: &active,
		AccessToken: &workos.DataIntegrationAccessTokenResponseAccessToken{
			AccessToken: "drive-token",
		},
	}, nil
}

func pipesHandler(scope *testenv.Scope, role string, accounts pipesAccounts) *handler {
	h := newHandler()
	h.pipes = &pipesAPI{
		pool:       scope.Pool,
		membership: scope.Membership(role),
		accounts:   accounts,
	}
	return h
}

func pipesRequest(t *testing.T, h *handler, scope *testenv.Scope, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	registerRoutes(mux, h, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://127.0.0.1")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestPipesListAndStatus(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	last4 := "1234"
	accounts := &stubPipesAccounts{
		accounts: map[string]*workos.ConnectedAccount{
			"notion": {State: workos.ConnectedAccountStateConnected, APIKeyLast4: nil},
			"braze":  {State: workos.ConnectedAccountStateConnected, APIKeyLast4: &last4},
		},
		availability: map[string]*workos.DataIntegration{
			"notion": {Enabled: true},
		},
		methods: map[string][]workos.ConnectedAccountAuthMethod{
			"notion": {workos.ConnectedAccountAuthMethodOAuth},
		},
		authorizeURL: "https://workos.test/authorize",
	}
	h := pipesHandler(scope, "admin", accounts)

	rec := pipesRequest(t, h, scope, http.MethodGet, scope.OrgPath("/pipes"), "")
	require.Equal(t, http.StatusOK, rec.Code)
	var listed struct {
		CanManage bool `json:"canManage"`
		Pipes     []struct {
			Provider    string  `json:"provider"`
			Connected   bool    `json:"connected"`
			APIKeyLast4 *string `json:"apiKeyLast4"`
		} `json:"pipes"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &listed))
	require.True(t, listed.CanManage)
	require.Len(t, listed.Pipes, len(pipesProviderSlugs))
	byProvider := map[string]bool{}
	for _, pipe := range listed.Pipes {
		byProvider[pipe.Provider] = pipe.Connected
		if pipe.Provider == "braze" {
			require.Equal(t, "1234", *pipe.APIKeyLast4)
		}
	}
	require.True(t, byProvider["notion"])
	require.True(t, byProvider["braze"])
	require.False(t, byProvider["mailchimp"])

	rec = pipesRequest(t, h, scope, http.MethodGet, scope.OrgPath("/pipes/notion"), "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"connected":true`)

	rec = pipesRequest(t, h, scope, http.MethodGet, scope.OrgPath("/pipes/unknown"), "")
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestPipesAuthorizeAndDisconnect(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	accounts := &stubPipesAccounts{
		accounts: map[string]*workos.ConnectedAccount{
			"mailchimp": {State: workos.ConnectedAccountStateConnected},
		},
		availability: map[string]*workos.DataIntegration{"mailchimp": {Enabled: true}},
		methods: map[string][]workos.ConnectedAccountAuthMethod{
			"mailchimp": {workos.ConnectedAccountAuthMethodOAuth},
		},
		authorizeURL: "https://workos.test/authorize/mailchimp",
	}
	h := pipesHandler(scope, "admin", accounts)

	rec := pipesRequest(t, h, scope, http.MethodGet, scope.OrgPath("/pipes/mailchimp/authorize-url"), "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), "https://workos.test/authorize/mailchimp")

	rec = pipesRequest(t, h, scope, http.MethodDelete, scope.OrgPath("/pipes/mailchimp"), "")
	require.Equal(t, http.StatusNoContent, rec.Code)
	require.Equal(t, []string{"mailchimp"}, accounts.deleted)
}

func TestPipesWriteRequiresCapability(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "developer"})
	accounts := &stubPipesAccounts{
		accounts:     map[string]*workos.ConnectedAccount{},
		availability: map[string]*workos.DataIntegration{"resend": {Enabled: true}},
		methods: map[string][]workos.ConnectedAccountAuthMethod{
			"resend": {workos.ConnectedAccountAuthMethodAPIKey},
		},
		authorizeURL: "https://workos.test/authorize",
	}
	h := pipesHandler(scope, "developer", accounts)

	rec := pipesRequest(t, h, scope, http.MethodGet, scope.OrgPath("/pipes"), "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"canManage":false`)

	rec = pipesRequest(t, h, scope, http.MethodGet, scope.OrgPath("/pipes/resend/authorize-url"), "")
	require.Equal(t, http.StatusForbidden, rec.Code)

	rec = pipesRequest(t, h, scope, http.MethodPut, scope.OrgPath("/pipes/resend"), `{"secret":"re_123"}`)
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestPipesAPIKeyAndBrazeSettings(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	accounts := &stubPipesAccounts{
		accounts:     map[string]*workos.ConnectedAccount{},
		availability: map[string]*workos.DataIntegration{"braze": {Enabled: true}, "resend": {Enabled: true}},
		methods: map[string][]workos.ConnectedAccountAuthMethod{
			"braze":  {workos.ConnectedAccountAuthMethodAPIKey},
			"resend": {workos.ConnectedAccountAuthMethodAPIKey},
		},
	}
	h := pipesHandler(scope, "admin", accounts)

	rec := pipesRequest(t, h, scope, http.MethodPut, scope.OrgPath("/pipes/resend"), `{"secret":"re_live"}`)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"connected":true`)

	rec = pipesRequest(t, h, scope, http.MethodPut, scope.OrgPath("/pipes/braze/settings"), `{"secret":"braze-key","restEndpoint":"iad-03"}`)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"restEndpoint":"iad-03"`)

	rec = pipesRequest(t, h, scope, http.MethodGet, scope.OrgPath("/pipes/braze/settings"), "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"restEndpoint":"iad-03"`)

	rec = pipesRequest(t, h, scope, http.MethodPut, scope.OrgPath("/pipes/braze/settings"), `{"secret":"braze-key","restEndpoint":"not-a-cluster"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestPipesMemberCannotRead(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "member"})
	h := pipesHandler(scope, "member", &stubPipesAccounts{accounts: map[string]*workos.ConnectedAccount{}})
	rec := pipesRequest(t, h, scope, http.MethodGet, scope.OrgPath("/pipes"), "")
	require.Equal(t, http.StatusForbidden, rec.Code)
}
