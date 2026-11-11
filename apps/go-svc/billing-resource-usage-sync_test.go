package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

const testAutumnSecretKey = "am_sk_test_billing"

type fakeAutumnTrackCall struct {
	featureID string
	header    http.Header
	body      map[string]any
}

type fakeAutumnTrack struct {
	mu      sync.Mutex
	calls   []fakeAutumnTrackCall
	respond func(featureID string) (*http.Response, error)
}

func (f *fakeAutumnTrack) Do(req *http.Request) (*http.Response, error) {
	raw, err := io.ReadAll(req.Body)
	if err != nil {
		return nil, err
	}
	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil {
		return nil, err
	}
	featureID, _ := body["feature_id"].(string)
	f.mu.Lock()
	f.calls = append(f.calls, fakeAutumnTrackCall{featureID: featureID, header: req.Header.Clone(), body: body})
	f.mu.Unlock()
	if f.respond == nil {
		return autumnResponse(http.StatusOK, `{}`), nil
	}
	return f.respond(featureID)
}

func (f *fakeAutumnTrack) snapshot() []fakeAutumnTrackCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]fakeAutumnTrackCall(nil), f.calls...)
}

func (f *fakeAutumnTrack) callFor(t *testing.T, featureID string) fakeAutumnTrackCall {
	t.Helper()
	for _, call := range f.snapshot() {
		if call.featureID == featureID {
			return call
		}
	}
	t.Fatalf("no Autumn track call for %s", featureID)
	return fakeAutumnTrackCall{}
}

func autumnResponse(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{}}
}

func billingSyncTestAPI(t *testing.T, role string, fake *fakeAutumnTrack) (*billingAPI, *testenv.Scope) {
	t.Helper()
	api, scope := billingTestAPI(t, role)
	if fake != nil {
		client, err := autumn.NewClient(autumn.Config{SecretKey: testAutumnSecretKey, HTTPClient: fake})
		require.NoError(t, err)
		api.autumn = client
	}
	return api, scope
}

func billingSyncRequest(api *billingAPI, scope *testenv.Scope) *httptest.ResponseRecorder {
	return billingRequest(api, scope.WorkOSUserID, http.MethodPost, scope.OrgPath("/billing/resource-usage/sync"))
}

func decodeSyncResult(t *testing.T, rec *httptest.ResponseRecorder) workspaceResourceSyncResult {
	t.Helper()
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		SyncResult workspaceResourceSyncResult `json:"syncResult"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	return body.SyncResult
}

func decodePartialFailure(t *testing.T, rec *httptest.ResponseRecorder) workspaceResourceSyncResult {
	t.Helper()
	require.Equal(t, http.StatusBadGateway, rec.Code, rec.Body.String())
	var body struct {
		Error   string `json:"error"`
		Message string `json:"message"`
		Details struct {
			SyncResult workspaceResourceSyncResult `json:"syncResult"`
		} `json:"details"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "billing_resource_usage_sync_partial_failed", body.Error)
	require.Equal(t, "One or more billing resource usage features failed to sync", body.Message)
	require.Equal(t, workspaceResourceSyncPartialFailed, body.Details.SyncResult.Status)
	return body.Details.SyncResult
}

type workspaceResourceSyncStateRow struct {
	syncedUsage, syncSequence int
	status                    string
	lastSyncError             *string
	lastSyncedAt              *time.Time
}

func syncStateRow(t *testing.T, scope *testenv.Scope, featureID string) workspaceResourceSyncStateRow {
	t.Helper()
	var row workspaceResourceSyncStateRow
	err := scope.Pool.QueryRow(t.Context(), `select synced_usage, sync_sequence, status, last_sync_error, last_synced_at
        from workspace_resource_usage_sync_states where organization_id=$1 and feature_id=$2`,
		scope.OrganizationID, featureID).Scan(&row.syncedUsage, &row.syncSequence, &row.status, &row.lastSyncError, &row.lastSyncedAt)
	require.NoError(t, err)
	return row
}

func operationKeyFor(scope *testenv.Scope, featureID, sequence string) string {
	return "workspace_resource_usage_sync:" + scope.OrganizationID + ":" + featureID + ":" + sequence
}

func TestBillingResourceUsageSyncRejectsCrossOrigin(t *testing.T) {
	mux := http.NewServeMux()
	(&billingAPI{}).register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(http.MethodPost, "/v1/orgs/acme/billing/resource-usage/sync", nil)
	req.Header.Set("Origin", "https://evil.example")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), `"forbidden"`)
}

func TestBillingResourceUsageSyncSkippedWithoutAutumn(t *testing.T) {
	api, scope := billingSyncTestAPI(t, "admin", nil)
	rec := billingSyncRequest(api, scope)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	require.JSONEq(t, `{"syncResult":{
        "status":"skipped",
        "resourceUsage":{"seats":1,"projects":0,"automations":0,"integrations":0},
        "results":[
            {"featureId":"seats","localUsage":1,"previousSyncedUsage":0,"delta":0,"status":"skipped","operationKey":null,"error":"autumn_not_configured"},
            {"featureId":"projects","localUsage":0,"previousSyncedUsage":0,"delta":0,"status":"skipped","operationKey":null,"error":"autumn_not_configured"},
            {"featureId":"automations","localUsage":0,"previousSyncedUsage":0,"delta":0,"status":"skipped","operationKey":null,"error":"autumn_not_configured"},
            {"featureId":"integrations","localUsage":0,"previousSyncedUsage":0,"delta":0,"status":"skipped","operationKey":null,"error":"autumn_not_configured"}
        ]}}`, rec.Body.String())

	var rows int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from workspace_resource_usage_sync_states where organization_id=$1`, scope.OrganizationID).Scan(&rows))
	require.Zero(t, rows)
}

func TestBillingResourceUsageSyncForbiddenRoles(t *testing.T) {
	for _, role := range []string{"localization_manager", "developer", "reviewer", "translator", "member"} {
		t.Run(role, func(t *testing.T) {
			fake := &fakeAutumnTrack{}
			api, scope := billingSyncTestAPI(t, role, fake)
			rec := billingSyncRequest(api, scope)
			require.Equal(t, http.StatusForbidden, rec.Code)
			require.JSONEq(t, `{"error":"billing_write_forbidden","message":"Only workspace admins can sync billing usage"}`, rec.Body.String())
			require.Empty(t, fake.snapshot())
		})
	}
}

func TestBillingResourceUsageSyncCrossOrganizationDenied(t *testing.T) {
	fake := &fakeAutumnTrack{}
	api, scope := billingSyncTestAPI(t, "admin", fake)
	other := testenv.Seed(t, testenv.Options{Role: "admin"})
	rec := billingRequest(api, scope.WorkOSUserID, http.MethodPost, other.OrgPath("/billing/resource-usage/sync"))
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), `"organization_access_denied"`)
	require.Empty(t, fake.snapshot())
}

func TestBillingResourceUsageSyncSuccess(t *testing.T) {
	fake := &fakeAutumnTrack{}
	api, scope := billingSyncTestAPI(t, "admin", fake)
	seedCountedResources(t, scope)

	result := decodeSyncResult(t, billingSyncRequest(api, scope))
	require.Equal(t, workspaceResourceSyncSynced, result.Status)
	require.Equal(t, workspaceResourceUsage{Seats: 2, Projects: 1, Automations: 2, Integrations: 4}, result.ResourceUsage)
	expected := map[string]int{"seats": 2, "projects": 1, "automations": 2, "integrations": 4}
	require.Len(t, result.Results, 4)
	for i, featureID := range workspaceResourceFeatureOrder {
		got := result.Results[i]
		key := operationKeyFor(scope, featureID, "1")
		require.Equal(t, workspaceResourceSyncFeatureResult{
			FeatureID: featureID, LocalUsage: expected[featureID], PreviousSyncedUsage: 0,
			Delta: expected[featureID], Status: workspaceResourceSyncSynced, OperationKey: &key,
		}, got)

		call := fake.callFor(t, featureID)
		require.Equal(t, "Bearer "+testAutumnSecretKey, call.header.Get("Authorization"))
		require.Equal(t, "2.2.0", call.header.Get("x-api-version"))
		require.Equal(t, map[string]any{
			"customer_id":     scope.OrganizationID,
			"feature_id":      featureID,
			"value":           float64(expected[featureID]),
			"idempotency_key": key,
			"properties":      map[string]any{"source": "workspace_resource_usage_sync", "feature_id": featureID},
		}, call.body)

		row := syncStateRow(t, scope, featureID)
		require.Equal(t, expected[featureID], row.syncedUsage)
		require.Equal(t, 1, row.syncSequence)
		require.Equal(t, "synced", row.status)
		require.Nil(t, row.lastSyncError)
		require.NotNil(t, row.lastSyncedAt)
	}
	require.Len(t, fake.snapshot(), 4)
}

func TestBillingResourceUsageSyncUpToDate(t *testing.T) {
	fake := &fakeAutumnTrack{}
	api, scope := billingSyncTestAPI(t, "admin", fake)
	decodeSyncResult(t, billingSyncRequest(api, scope))
	require.Len(t, fake.snapshot(), 1)

	result := decodeSyncResult(t, billingSyncRequest(api, scope))
	require.Equal(t, workspaceResourceSyncSynced, result.Status)
	require.Len(t, fake.snapshot(), 1)
	for _, got := range result.Results {
		require.Equal(t, workspaceResourceSyncUpToDate, got.Status, got.FeatureID)
		require.Zero(t, got.Delta)
		require.Nil(t, got.OperationKey)
		require.Nil(t, got.Error)
	}
	row := syncStateRow(t, scope, "seats")
	require.Equal(t, 1, row.syncSequence)
	require.Equal(t, "up_to_date", row.status)
}

func TestBillingResourceUsageSyncTreats409AsSynced(t *testing.T) {
	fake := &fakeAutumnTrack{respond: func(string) (*http.Response, error) {
		return autumnResponse(http.StatusConflict, `{"code":"duplicate_idempotency_key"}`), nil
	}}
	api, scope := billingSyncTestAPI(t, "admin", fake)
	result := decodeSyncResult(t, billingSyncRequest(api, scope))
	require.Equal(t, workspaceResourceSyncSynced, result.Status)
	require.Equal(t, workspaceResourceSyncSynced, result.Results[0].Status)
	row := syncStateRow(t, scope, "seats")
	require.Equal(t, 1, row.syncedUsage)
	require.Equal(t, 1, row.syncSequence)
}

func TestBillingResourceUsageSyncPartialFailure(t *testing.T) {
	failSeats := true
	fake := &fakeAutumnTrack{respond: func(featureID string) (*http.Response, error) {
		if featureID == "seats" && failSeats {
			return autumnResponse(http.StatusInternalServerError, `{"message":"upstream secret detail"}`), nil
		}
		return autumnResponse(http.StatusOK, `{}`), nil
	}}
	api, scope := billingSyncTestAPI(t, "admin", fake)
	seedCountedResources(t, scope)

	rec := billingSyncRequest(api, scope)
	require.NotContains(t, rec.Body.String(), "upstream secret detail")
	result := decodePartialFailure(t, rec)
	seatsKey := operationKeyFor(scope, "seats", "1")
	message := "Autumn resource usage sync failed with HTTP 500"
	require.Equal(t, workspaceResourceSyncFeatureResult{
		FeatureID: "seats", LocalUsage: 2, PreviousSyncedUsage: 0, Delta: 2,
		Status: workspaceResourceSyncFailed, OperationKey: &seatsKey, Error: &message,
	}, result.Results[0])
	for _, got := range result.Results[1:] {
		require.Equal(t, workspaceResourceSyncSynced, got.Status, got.FeatureID)
	}

	row := syncStateRow(t, scope, "seats")
	require.Equal(t, "failed", row.status)
	require.Equal(t, 0, row.syncedUsage)
	require.Equal(t, 0, row.syncSequence)
	require.Equal(t, &message, row.lastSyncError)
	require.Nil(t, row.lastSyncedAt)

	failSeats = false
	retry := decodeSyncResult(t, billingSyncRequest(api, scope))
	require.Equal(t, workspaceResourceSyncSynced, retry.Results[0].Status)
	require.Equal(t, &seatsKey, retry.Results[0].OperationKey)
	require.Equal(t, seatsKey, fake.snapshot()[len(fake.snapshot())-1].body["idempotency_key"])
}

func TestBillingResourceUsageSyncAllFailedIsPartialFailure(t *testing.T) {
	fake := &fakeAutumnTrack{respond: func(string) (*http.Response, error) {
		return autumnResponse(http.StatusServiceUnavailable, ``), nil
	}}
	api, scope := billingSyncTestAPI(t, "admin", fake)
	seedCountedResources(t, scope)
	result := decodePartialFailure(t, billingSyncRequest(api, scope))
	for _, got := range result.Results {
		require.Equal(t, workspaceResourceSyncFailed, got.Status, got.FeatureID)
	}
}

func TestBillingResourceUsageSyncNegativeDelta(t *testing.T) {
	fake := &fakeAutumnTrack{}
	api, scope := billingSyncTestAPI(t, "admin", fake)
	mustBillingExec(t, scope, `insert into workspace_resource_usage_sync_states (organization_id, feature_id, synced_usage, sync_sequence, status)
        values ($1, 'projects', 3, 2, 'synced')`, scope.OrganizationID)

	result := decodeSyncResult(t, billingSyncRequest(api, scope))
	projects := result.Results[1]
	require.Equal(t, 3, projects.PreviousSyncedUsage)
	require.Equal(t, -3, projects.Delta)
	require.Equal(t, operationKeyFor(scope, "projects", "3"), *projects.OperationKey)
	require.InDelta(t, -3, fake.callFor(t, "projects").body["value"], 0)
	row := syncStateRow(t, scope, "projects")
	require.Equal(t, 0, row.syncedUsage)
	require.Equal(t, 3, row.syncSequence)
}

func TestBillingResourceUsageSyncRunsFeaturesConcurrently(t *testing.T) {
	release := make(chan struct{})
	var started sync.WaitGroup
	started.Add(4)
	fake := &fakeAutumnTrack{respond: func(string) (*http.Response, error) {
		started.Done()
		<-release
		return autumnResponse(http.StatusOK, `{}`), nil
	}}
	api, scope := billingSyncTestAPI(t, "admin", fake)
	mustAutomation(t, scope, "active")
	mustConnector(t, scope, "slack", true)
	scope.MustProject(t, "", "")

	done := make(chan *httptest.ResponseRecorder, 1)
	go func() { done <- billingSyncRequest(api, scope) }()
	allStarted := make(chan struct{})
	go func() { started.Wait(); close(allStarted) }()
	select {
	case <-allStarted:
	case <-time.After(5 * time.Second):
		close(release)
		t.Fatal("feature syncs did not run concurrently")
	}
	close(release)
	result := decodeSyncResult(t, <-done)
	require.Equal(t, workspaceResourceSyncSynced, result.Status)
}

func TestBillingResourceUsageSyncSanitizesTransportErrors(t *testing.T) {
	var logs bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&lockedWriter{w: &logs}, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	fake := &fakeAutumnTrack{respond: func(string) (*http.Response, error) {
		return nil, &url.Error{
			Op:  "Post",
			URL: "https://user:pass@internal.autumn.local/v1/balances.track?token=sk_live_SECRET&x=1",
			Err: errors.New("dial tcp 10.0.0.5:443: sk_live_SECRET"),
		}
	}}
	api, scope := billingSyncTestAPI(t, "admin", fake)
	rec := billingSyncRequest(api, scope)
	result := decodePartialFailure(t, rec)
	require.Equal(t, autumnTransportErrorPrefix, *result.Results[0].Error)
	row := syncStateRow(t, scope, "seats")

	for _, leaked := range []string{"sk_live", "token=", "user:pass", "internal.autumn.local", "10.0.0.5", "balances.track", testAutumnSecretKey} {
		require.NotContains(t, rec.Body.String(), leaked)
		require.NotContains(t, *row.lastSyncError, leaked)
		require.NotContains(t, logs.String(), leaked)
	}
}

type timeoutNetError struct{}

func (timeoutNetError) Error() string   { return "i/o timeout reading 10.0.0.5:443" }
func (timeoutNetError) Timeout() bool   { return true }
func (timeoutNetError) Temporary() bool { return true }

func TestWorkspaceResourceSyncErrorMessage(t *testing.T) {
	sensitiveURL := "https://user:pass@internal.autumn.local/v1/balances.track?token=sk_live_SECRET"
	wrap := func(err error) error { return &url.Error{Op: "Post", URL: sensitiveURL, Err: err} }
	refused := &net.OpError{
		Op: "dial", Net: "tcp", Addr: &net.TCPAddr{IP: net.ParseIP("10.0.0.5"), Port: 443},
		Err: &os.SyscallError{Syscall: "connect", Err: syscall.ECONNREFUSED},
	}
	reset := &net.OpError{Op: "read", Net: "tcp", Err: &os.SyscallError{Syscall: "read", Err: syscall.ECONNRESET}}

	for name, tc := range map[string]struct {
		err  error
		want string
	}{
		"http status":        {fakeAutumnStatusError(t, 503), "Autumn resource usage sync failed with HTTP 503"},
		"deadline":           {wrap(context.DeadlineExceeded), autumnTransportErrorPrefix + ": timeout"},
		"net timeout":        {wrap(timeoutNetError{}), autumnTransportErrorPrefix + ": timeout"},
		"canceled":           {wrap(context.Canceled), autumnTransportErrorPrefix + ": canceled"},
		"dns":                {wrap(&net.DNSError{Err: "no such host", Name: "internal.autumn.local"}), autumnTransportErrorPrefix + ": dns lookup failed"},
		"connection refused": {wrap(refused), autumnTransportErrorPrefix + ": connection refused"},
		"connection reset":   {wrap(reset), autumnTransportErrorPrefix + ": connection reset"},
		"tls":                {wrap(&tls.CertificateVerificationError{Err: x509.UnknownAuthorityError{}}), autumnTransportErrorPrefix + ": tls handshake failed"},
		"unknown":            {errors.New("boom https://user:pass@host/?token=sk_live_SECRET"), autumnTransportErrorPrefix},
	} {
		t.Run(name, func(t *testing.T) {
			got := workspaceResourceSyncErrorMessage(tc.err)
			require.Equal(t, tc.want, got)
			require.LessOrEqual(t, len(got), maxWorkspaceResourceSyncError)
			for _, leaked := range []string{"sk_live", "token=", "user:pass", "internal.autumn.local", "10.0.0.5", "?"} {
				require.NotContains(t, got, leaked)
			}
		})
	}
}

func fakeAutumnStatusError(t *testing.T, status int) error {
	t.Helper()
	client, err := autumn.NewClient(autumn.Config{SecretKey: testAutumnSecretKey, HTTPClient: &fakeAutumnTrack{
		respond: func(string) (*http.Response, error) { return autumnResponse(status, `{"message":"detail"}`), nil },
	}})
	require.NoError(t, err)
	trackErr := client.Track(t.Context(), autumn.TrackRequest{CustomerID: "org", FeatureID: "seats", Value: 1})
	require.Error(t, trackErr)
	return trackErr
}
