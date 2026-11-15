package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

type stubPipesAccounts struct {
	accounts       map[string]*workos.ConnectedAccount
	availability   map[string]*workos.DataIntegration
	methods        map[string][]workos.ConnectedAccountAuthMethod
	authorizeURL   string
	deleted        []string
	updated        []string
	updateState    workos.ConnectedAccountState
	accessToken    *workos.DataIntegrationAccessTokenResponse
	accessTokenErr error
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
	state := s.updateState
	if state == "" {
		state = workos.ConnectedAccountStateConnected
	}
	last4 := "4242"
	account := &workos.ConnectedAccount{State: workos.ConnectedAccountState(state), APIKeyLast4: &last4}
	if s.accounts == nil {
		s.accounts = map[string]*workos.ConnectedAccount{}
	}
	s.accounts[slug] = account
	body, _ := json.Marshal(params.Body)
	_ = body
	return &workos.ConnectedAccountWriteResponse{State: state, APIKeyLast4: &last4}, nil
}

func (s *stubPipesAccounts) GetAccessToken(_ context.Context, _ string, _ *workos.PipesGetAccessTokenParams) (*workos.DataIntegrationAccessTokenResponse, error) {
	if s.accessTokenErr != nil {
		return nil, s.accessTokenErr
	}
	if s.accessToken != nil {
		return s.accessToken, nil
	}
	active := true
	return &workos.DataIntegrationAccessTokenResponse{
		Active: &active,
		AccessToken: &workos.DataIntegrationAccessTokenResponseAccessToken{
			AccessToken: "drive-token",
		},
	}, nil
}

type stubDriveHTTP struct {
	status   int
	body     string
	err      error
	lastAuth string
}

func (s *stubDriveHTTP) Do(req *http.Request) (*http.Response, error) {
	s.lastAuth = req.Header.Get("Authorization")
	if s.err != nil {
		return nil, s.err
	}
	status := s.status
	if status == 0 {
		status = http.StatusOK
	}
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(strings.NewReader(s.body)),
		Header:     make(http.Header),
		Request:    req,
	}, nil
}

func pipesHandler(scope *testenv.Scope, role string, accounts pipesAccounts) *handler {
	return pipesHandlerWithDrive(scope, role, accounts, nil)
}

func pipesHandlerWithDrive(scope *testenv.Scope, role string, accounts pipesAccounts, drive googleDriveHTTP) *handler {
	h := newHandler()
	h.pipes = &pipesAPI{
		pool:       scope.Pool,
		membership: scope.Membership(role),
		accounts:   accounts,
		driveHTTP:  drive,
	}
	return h
}

func requirePipesError(t *testing.T, rec *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	require.Equal(t, status, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"error":"`+code+`"`)
}

func requirePipesFailure(t *testing.T, err error, status int, code string) {
	t.Helper()
	var failure *pipesError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, status, failure.status)
	require.Equal(t, code, failure.code)
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

func TestEscapeGoogleDriveQuery(t *testing.T) {
	require.Equal(t, `O\'Reilly`, escapeGoogleDriveQuery("O'Reilly"))
	require.Equal(t, `a\'b\'c`, escapeGoogleDriveQuery("a'b'c"))
	require.Equal(t, "root", escapeGoogleDriveQuery("root"))
}

func TestMapPipesWorkosError(t *testing.T) {
	requirePipesFailure(t, mapPipesWorkosError(&workos.APIError{StatusCode: http.StatusNotFound}, "pipes_unavailable", "fallback"), http.StatusNotFound, "pipes_not_connected")
	requirePipesFailure(t, mapPipesWorkosError(&workos.APIError{StatusCode: http.StatusBadGateway}, "pipes_unavailable", "fallback"), http.StatusServiceUnavailable, "pipes_unavailable")
	requirePipesFailure(t, mapPipesWorkosError(errors.New("network"), "pipes_unavailable", "fallback"), http.StatusServiceUnavailable, "pipes_unavailable")
}

func TestNormalizePipesAuthMethods(t *testing.T) {
	require.Equal(t, []string{"oauth", "api_key"}, normalizePipesAuthMethods([]workos.ConnectedAccountAuthMethod{}))
	require.Equal(t, []string{"oauth"}, normalizePipesAuthMethods([]workos.ConnectedAccountAuthMethod{
		workos.ConnectedAccountAuthMethodOAuth,
		workos.ConnectedAccountAuthMethod("client_credentials"),
		workos.ConnectedAccountAuthMethodOAuth,
	}))
	require.Equal(t, []string{"api_key"}, normalizePipesAuthMethods([]string{"api_key"}))
}

func TestReadPipesJSON(t *testing.T) {
	var body struct {
		Secret string `json:"secret"`
	}
	requirePipesFailure(t, readPipesJSON(httptest.NewRequest(http.MethodPut, "/", nil), &body), http.StatusBadRequest, "invalid_pipes_payload")
	requirePipesFailure(t, readPipesJSON(httptest.NewRequest(http.MethodPut, "/", strings.NewReader(`{"unknown":true}`)), &body), http.StatusBadRequest, "invalid_pipes_payload")
	require.NoError(t, readPipesJSON(httptest.NewRequest(http.MethodPut, "/", strings.NewReader(`{"secret":"k"}`)), &body))
	require.Equal(t, "k", body.Secret)
}

func TestPipeAccessTokenStates(t *testing.T) {
	actor := pipesActor{workosUserID: "user_1", workosOrganizationID: "org_1"}
	t.Run("unavailable without accounts", func(t *testing.T) {
		api := &pipesAPI{}
		_, err := api.pipeAccessToken(context.Background(), actor, "google-drive")
		requirePipesFailure(t, err, http.StatusServiceUnavailable, "pipes_unavailable")
	})
	t.Run("maps workos 404", func(t *testing.T) {
		api := &pipesAPI{accounts: &stubPipesAccounts{accessTokenErr: &workos.APIError{StatusCode: http.StatusNotFound}}}
		_, err := api.pipeAccessToken(context.Background(), actor, "google-drive")
		requirePipesFailure(t, err, http.StatusNotFound, "pipes_not_connected")
	})
	t.Run("needs reauthorization", func(t *testing.T) {
		inactive := false
		needsReauth := workos.DataIntegrationAccessTokenResponseErrorNeedsReauthorization
		api := &pipesAPI{accounts: &stubPipesAccounts{accessToken: &workos.DataIntegrationAccessTokenResponse{
			Active: &inactive,
			Error:  &needsReauth,
		}}}
		_, err := api.pipeAccessToken(context.Background(), actor, "google-drive")
		requirePipesFailure(t, err, http.StatusUnauthorized, "pipes_needs_reauthorization")
	})
	t.Run("blank token is not connected", func(t *testing.T) {
		active := true
		api := &pipesAPI{accounts: &stubPipesAccounts{accessToken: &workos.DataIntegrationAccessTokenResponse{
			Active:      &active,
			AccessToken: &workos.DataIntegrationAccessTokenResponseAccessToken{AccessToken: "  "},
		}}}
		_, err := api.pipeAccessToken(context.Background(), actor, "google-drive")
		requirePipesFailure(t, err, http.StatusNotFound, "pipes_not_connected")
	})
	t.Run("returns trimmed token", func(t *testing.T) {
		active := true
		api := &pipesAPI{accounts: &stubPipesAccounts{accessToken: &workos.DataIntegrationAccessTokenResponse{
			Active:      &active,
			AccessToken: &workos.DataIntegrationAccessTokenResponseAccessToken{AccessToken: "  ya29.token  "},
		}}}
		token, err := api.pipeAccessToken(context.Background(), actor, "google-drive")
		require.NoError(t, err)
		require.Equal(t, "ya29.token", token)
	})
}

func TestGoogleGETMapsStatus(t *testing.T) {
	t.Run("404", func(t *testing.T) {
		drive := &stubDriveHTTP{status: http.StatusNotFound, body: `{}`}
		_, err := (&pipesAPI{driveHTTP: drive}).googleGET(context.Background(), "tok", "/files/abc")
		requirePipesFailure(t, err, http.StatusNotFound, "google_drive_folder_not_found")
		require.Equal(t, "Bearer tok", drive.lastAuth)
	})
	t.Run("5xx", func(t *testing.T) {
		drive := &stubDriveHTTP{status: http.StatusInternalServerError, body: `oops`}
		_, err := (&pipesAPI{driveHTTP: drive}).googleGET(context.Background(), "tok", "/files/abc")
		requirePipesFailure(t, err, http.StatusServiceUnavailable, "google_drive_api_error")
	})
	t.Run("transport", func(t *testing.T) {
		drive := &stubDriveHTTP{err: errors.New("dial")}
		_, err := (&pipesAPI{driveHTTP: drive}).googleGET(context.Background(), "tok", "/files/abc")
		requirePipesFailure(t, err, http.StatusServiceUnavailable, "google_drive_api_error")
	})
}

func TestPipesConnectionNeedsReauthorization(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	accounts := &stubPipesAccounts{
		accounts: map[string]*workos.ConnectedAccount{
			"google-drive": {State: workos.ConnectedAccountStateNeedsReauthorization},
		},
	}
	h := pipesHandler(scope, "admin", accounts)
	rec := pipesRequest(t, h, scope, http.MethodGet, scope.OrgPath("/pipes/google-drive"), "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"needsReauthorization":true`)
	require.Contains(t, rec.Body.String(), `"connected":false`)
}

func TestPipesAPIKeyNeedsReauthorization(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	accounts := &stubPipesAccounts{
		accounts:     map[string]*workos.ConnectedAccount{},
		availability: map[string]*workos.DataIntegration{"resend": {Enabled: true}},
		methods:      map[string][]workos.ConnectedAccountAuthMethod{"resend": {workos.ConnectedAccountAuthMethodAPIKey}},
		updateState:  workos.ConnectedAccountStateNeedsReauthorization,
	}
	h := pipesHandler(scope, "admin", accounts)
	rec := pipesRequest(t, h, scope, http.MethodPut, scope.OrgPath("/pipes/resend"), `{"secret":"re_live"}`)
	requirePipesError(t, rec, http.StatusUnauthorized, "pipes_needs_reauthorization")
}

func TestPipesAPIKeyWhitespaceSecret(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	h := pipesHandler(scope, "admin", &stubPipesAccounts{accounts: map[string]*workos.ConnectedAccount{}})
	rec := pipesRequest(t, h, scope, http.MethodPut, scope.OrgPath("/pipes/resend"), `{"secret":"   "}`)
	requirePipesError(t, rec, http.StatusBadRequest, "pipes_not_connected")
}

func TestPipesOAuthUnavailableForAPIKeyOnly(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	accounts := &stubPipesAccounts{
		accounts:     map[string]*workos.ConnectedAccount{},
		availability: map[string]*workos.DataIntegration{"resend": {Enabled: true}},
		methods:      map[string][]workos.ConnectedAccountAuthMethod{"resend": {workos.ConnectedAccountAuthMethodAPIKey}},
		authorizeURL: "https://workos.test/authorize",
	}
	h := pipesHandler(scope, "admin", accounts)
	rec := pipesRequest(t, h, scope, http.MethodGet, scope.OrgPath("/pipes/resend/authorize-url"), "")
	requirePipesError(t, rec, http.StatusServiceUnavailable, "pipes_oauth_unavailable")
}

func TestPipesCustomerIoInvalidRegion(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	accounts := &stubPipesAccounts{
		accounts:     map[string]*workos.ConnectedAccount{},
		availability: map[string]*workos.DataIntegration{"customer-io": {Enabled: true}},
		methods:      map[string][]workos.ConnectedAccountAuthMethod{"customer-io": {workos.ConnectedAccountAuthMethodAPIKey}},
	}
	h := pipesHandler(scope, "admin", accounts)
	rec := pipesRequest(t, h, scope, http.MethodPut, scope.OrgPath("/pipes/customer-io/settings"), `{"secret":"cio-key","region":"ap"}`)
	requirePipesError(t, rec, http.StatusBadRequest, "invalid_pipes_region")
}

func TestPipesUnknownSettings(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	h := pipesHandler(scope, "admin", &stubPipesAccounts{accounts: map[string]*workos.ConnectedAccount{}})
	rec := pipesRequest(t, h, scope, http.MethodGet, scope.OrgPath("/pipes/resend/settings"), "")
	requirePipesError(t, rec, http.StatusNotFound, "unknown_pipes_settings")
}

func TestPipesDisconnectClearsBrazeSettings(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	accounts := &stubPipesAccounts{
		accounts:     map[string]*workos.ConnectedAccount{},
		availability: map[string]*workos.DataIntegration{"braze": {Enabled: true}},
		methods:      map[string][]workos.ConnectedAccountAuthMethod{"braze": {workos.ConnectedAccountAuthMethodAPIKey}},
	}
	h := pipesHandler(scope, "admin", accounts)
	rec := pipesRequest(t, h, scope, http.MethodPut, scope.OrgPath("/pipes/braze/settings"), `{"secret":"braze-key","restEndpoint":"iad-03"}`)
	require.Equal(t, http.StatusOK, rec.Code)

	rec = pipesRequest(t, h, scope, http.MethodDelete, scope.OrgPath("/pipes/braze"), "")
	require.Equal(t, http.StatusNoContent, rec.Code)

	var count int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        select count(*) from braze_connection_settings
        where organization_id=$1 and workos_user_id=$2`, scope.OrganizationID, scope.WorkOSUserID).Scan(&count))
	require.Zero(t, count)
}

func TestPipesGoogleDriveFolders(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	accounts := &stubPipesAccounts{accounts: map[string]*workos.ConnectedAccount{}}
	drive := &stubDriveHTTP{body: `{"id":"folder-1","name":"Campaigns","mimeType":"application/vnd.google-apps.folder","driveId":"drive-9"}`}
	h := pipesHandlerWithDrive(scope, "admin", accounts, drive)

	rec := pipesRequest(t, h, scope, http.MethodPost, scope.OrgPath("/pipes/google-drive/folders"), `{"folderId":""}`)
	requirePipesError(t, rec, http.StatusBadRequest, "invalid_payload")

	drive.body = `{"id":"file-1","name":"notes.txt","mimeType":"text/plain"}`
	rec = pipesRequest(t, h, scope, http.MethodPost, scope.OrgPath("/pipes/google-drive/folders"), `{"folderId":"file-1","pathLabel":"My Drive/notes.txt"}`)
	requirePipesError(t, rec, http.StatusBadRequest, "invalid_payload")

	drive.body = `{"id":"root","name":"My Drive","mimeType":"application/vnd.google-apps.folder"}`
	rec = pipesRequest(t, h, scope, http.MethodPost, scope.OrgPath("/pipes/google-drive/folders"), `{"folderId":"root","pathLabel":"My Drive"}`)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"alreadyExists":false`)

	drive.body = `{"id":"folder-1","name":"Campaigns","mimeType":"application/vnd.google-apps.folder","driveId":"drive-9"}`
	rec = pipesRequest(t, h, scope, http.MethodPost, scope.OrgPath("/pipes/google-drive/folders"), `{"folderId":"folder-1","pathLabel":"My Drive/Old"}`)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"pathLabel":"My Drive/Campaigns"`)

	rec = pipesRequest(t, h, scope, http.MethodPost, scope.OrgPath("/pipes/google-drive/folders"), `{"folderId":"folder-1","pathLabel":"My Drive/Old"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"alreadyExists":true`)

	rec = pipesRequest(t, h, scope, http.MethodGet, scope.OrgPath("/pipes/google-drive/folders"), "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"folder-1"`)

	rec = pipesRequest(t, h, scope, http.MethodDelete, scope.OrgPath("/pipes/google-drive/folders/not-a-uuid"), "")
	requirePipesError(t, rec, http.StatusBadRequest, "invalid_folder_id")

	rec = pipesRequest(t, h, scope, http.MethodGet, scope.OrgPath("/pipes/google-drive/children"), "")
	requirePipesError(t, rec, http.StatusBadRequest, "invalid_query")
}

func TestPipesGoogleDriveWriteRequiresCapability(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "developer"})
	h := pipesHandler(scope, "developer", &stubPipesAccounts{accounts: map[string]*workos.ConnectedAccount{}})
	rec := pipesRequest(t, h, scope, http.MethodPost, scope.OrgPath("/pipes/google-drive/folders"), `{"folderId":"root"}`)
	requirePipesError(t, rec, http.StatusForbidden, "forbidden")
}
