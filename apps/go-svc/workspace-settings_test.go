package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

type workspaceNameSyncCall struct {
	workosOrganizationID, name string
}

type stubWorkspaceIdentityWorkos struct {
	mu    sync.Mutex
	calls []workspaceNameSyncCall
	err   error
	hook  func(context.Context) error
}

func (s *stubWorkspaceIdentityWorkos) UpdateOrganizationName(ctx context.Context, workosOrganizationID, name string) error {
	s.mu.Lock()
	s.calls = append(s.calls, workspaceNameSyncCall{workosOrganizationID, name})
	hook, err := s.hook, s.err
	s.mu.Unlock()
	if hook != nil {
		return hook(ctx)
	}
	return err
}

func (s *stubWorkspaceIdentityWorkos) recorded() []workspaceNameSyncCall {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]workspaceNameSyncCall(nil), s.calls...)
}

type commitFailingPool struct{ dictionaryPool }

func (p commitFailingPool) Begin(ctx context.Context) (pgx.Tx, error) {
	tx, err := p.dictionaryPool.Begin(ctx)
	return commitFailingTx{tx}, err
}

type commitFailingTx struct{ pgx.Tx }

func (tx commitFailingTx) Commit(ctx context.Context) error {
	_ = tx.Rollback(ctx)
	return errors.New("commit failed")
}

type workspaceSettingsFixture struct {
	api      *workspaceSettingsAPI
	scope    *testenv.Scope
	workos   *stubWorkspaceIdentityWorkos
	activity *recordingActivityLogPublisher
}

func newWorkspaceSettingsFixture(t *testing.T, role string) *workspaceSettingsFixture {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role})
	f := &workspaceSettingsFixture{scope: scope, workos: &stubWorkspaceIdentityWorkos{}, activity: &recordingActivityLogPublisher{}}
	f.api = &workspaceSettingsAPI{pool: scope.Pool, membership: scope.Membership(role), workos: f.workos, activityLog: f.activity}
	return f
}

type workspaceSettingsRequest struct {
	method, path, body, contentType string
	headers                         map[string]string
	ctx                             context.Context
}

func (f *workspaceSettingsFixture) do(req workspaceSettingsRequest) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	f.api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: f.scope.WorkOSUserID}})
	if req.path == "" {
		req.path = f.scope.OrgPath("/workspace")
	}
	httpReq := httptest.NewRequest(req.method, req.path, strings.NewReader(req.body))
	if req.ctx != nil {
		httpReq = httpReq.WithContext(req.ctx)
	}
	if req.contentType != "" {
		httpReq.Header.Set("Content-Type", req.contentType)
	}
	for key, value := range req.headers {
		httpReq.Header.Set(key, value)
	}
	httpReq.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httpReq)
	return rec
}

func (f *workspaceSettingsFixture) patch(body string) *httptest.ResponseRecorder {
	return f.do(workspaceSettingsRequest{method: http.MethodPatch, body: body, contentType: "application/json"})
}

type storedWorkspace struct {
	name, slug, lifecycleStatus string
	archivedAt                  *time.Time
	updatedAt                   time.Time
}

func (f *workspaceSettingsFixture) stored(t *testing.T) storedWorkspace {
	t.Helper()
	var row storedWorkspace
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(),
		`select name, slug, lifecycle_status::text, archived_at, updated_at from organizations where id=$1`,
		f.scope.OrganizationID).Scan(&row.name, &row.slug, &row.lifecycleStatus, &row.archivedAt, &row.updatedAt))
	return row
}

func requireWorkspaceError(t *testing.T, rec *httptest.ResponseRecorder, status int, code, message string) {
	t.Helper()
	require.Equal(t, status, rec.Code, rec.Body.String())
	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, code, body["error"])
	if message != "" {
		require.Equal(t, message, body["message"])
	}
}

func waitForBlockedOrganizationQuery(t *testing.T, f *workspaceSettingsFixture, fragment string) {
	t.Helper()
	require.Eventually(t, func() bool {
		var blocked int
		err := f.scope.Pool.QueryRow(context.Background(), `
            select count(*) from pg_stat_activity
            where datname=current_database() and cardinality(pg_blocking_pids(pid)) > 0 and query ilike $1`,
			"%"+fragment+"%").Scan(&blocked)
		return err == nil && blocked > 0
	}, 10*time.Second, 20*time.Millisecond)
}

func TestWorkspaceSettingsGetMatchesHonoShape(t *testing.T) {
	for _, role := range []string{"admin", "localization_manager", "developer", "reviewer", "translator", "member"} {
		t.Run(role, func(t *testing.T) {
			f := newWorkspaceSettingsFixture(t, role)
			rec := f.do(workspaceSettingsRequest{method: http.MethodGet})
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
			require.Equal(t, "application/json", rec.Header().Get("Content-Type"))
			want, err := json.Marshal(map[string]any{"workspace": map[string]any{
				"id": f.scope.OrganizationID, "workosOrganizationId": f.scope.WorkOSOrganizationID,
				"name": f.stored(t).name, "slug": f.scope.Slug, "lifecycleStatus": "active",
				"archivedAt": nil, "identityProvider": "workos",
			}})
			require.NoError(t, err)
			require.JSONEq(t, string(want), rec.Body.String())
			require.True(t, strings.HasPrefix(rec.Body.String(), `{"workspace":{"id":`))
			require.Contains(t, rec.Body.String(), `"lifecycleStatus":"active","archivedAt":null,"identityProvider":"workos"}}`)
		})
	}
}

func TestWorkspaceSettingsOrganizationScoping(t *testing.T) {
	f := newWorkspaceSettingsFixture(t, "admin")
	other := testenv.Seed(t, testenv.Options{Role: "admin"})
	for _, method := range []string{http.MethodGet, http.MethodPatch, http.MethodDelete} {
		rec := f.do(workspaceSettingsRequest{method: method, path: other.OrgPath("/workspace"), body: `{"name":"Hijack"}`, contentType: "application/json"})
		requireWorkspaceError(t, rec, http.StatusForbidden, "organization_access_denied", "Organization access denied")
	}
	var lifecycle string
	require.NoError(t, other.Pool.QueryRow(t.Context(), `select lifecycle_status::text from organizations where id=$1`, other.OrganizationID).Scan(&lifecycle))
	require.Equal(t, "active", lifecycle)
	require.Empty(t, f.workos.recorded())
}

func TestWorkspaceSettingsRequiresAuthentication(t *testing.T) {
	f := newWorkspaceSettingsFixture(t, "admin")
	mux := http.NewServeMux()
	f.api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: f.scope.WorkOSUserID}})
	for _, method := range []string{http.MethodGet, http.MethodPatch, http.MethodDelete} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(method, f.scope.OrgPath("/workspace"), nil))
		require.Equal(t, http.StatusUnauthorized, rec.Code, method)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, f.scope.OrgPath("/workspace"), nil)
	f.api.handle(f.api.getWorkspace).ServeHTTP(rec, req)
	requireWorkspaceError(t, rec, http.StatusUnauthorized, "unauthorized", "Authentication required")
}

func TestWorkspaceSettingsRoutes(t *testing.T) {
	f := newWorkspaceSettingsFixture(t, "admin")
	require.Equal(t, http.StatusNotFound, f.do(workspaceSettingsRequest{method: http.MethodGet, path: "/api/go-svc" + f.scope.OrgPath("/workspace")}).Code)
	require.Equal(t, http.StatusNotFound, f.do(workspaceSettingsRequest{method: http.MethodPatch, path: "/api/go-svc" + f.scope.OrgPath("/workspace"), body: `{"name":"X Co"}`}).Code)
	require.Equal(t, http.StatusMethodNotAllowed, f.do(workspaceSettingsRequest{method: http.MethodPost}).Code)
	require.Equal(t, "active", f.stored(t).lifecycleStatus)
}

func TestWorkspaceSettingsUnavailableWithoutDatabase(t *testing.T) {
	f := newWorkspaceSettingsFixture(t, "admin")
	f.api.pool = nil
	for _, method := range []string{http.MethodGet, http.MethodPatch, http.MethodDelete} {
		rec := f.do(workspaceSettingsRequest{method: method, body: `{"name":"Renamed Co"}`, contentType: "application/json"})
		requireWorkspaceError(t, rec, http.StatusServiceUnavailable, "workspace_unavailable", "Workspace settings are unavailable")
	}
}

func TestWorkspaceSettingsUpdateAuthorization(t *testing.T) {
	for role, allowed := range map[string]bool{
		"admin": true, "localization_manager": true,
		"developer": false, "reviewer": false, "translator": false, "member": false,
	} {
		t.Run(role, func(t *testing.T) {
			f := newWorkspaceSettingsFixture(t, role)
			before := f.stored(t)
			rec := f.patch(`{"name":"Renamed Co"}`)
			if allowed {
				require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
				return
			}
			requireWorkspaceError(t, rec, http.StatusForbidden, "forbidden", "Only workspace admins can update settings")
			require.Equal(t, before, f.stored(t))
			require.Empty(t, f.workos.recorded())
			require.Empty(t, f.activity.recorded())

			requireWorkspaceError(t, f.patch(`{}`), http.StatusBadRequest, "invalid_workspace_payload", "")
		})
	}
}

func TestWorkspaceSettingsRejectsCrossOriginMutations(t *testing.T) {
	f := newWorkspaceSettingsFixture(t, "admin")
	for _, method := range []string{http.MethodPatch, http.MethodDelete} {
		rec := f.do(workspaceSettingsRequest{method: method, body: `{"name":"Evil Co"}`, contentType: "application/json", headers: map[string]string{"Origin": "https://evil.example"}})
		requireWorkspaceError(t, rec, http.StatusForbidden, "forbidden", "")
	}
	require.Equal(t, "active", f.stored(t).lifecycleStatus)
}

func TestWorkspaceSettingsUpdateValidation(t *testing.T) {
	f := newWorkspaceSettingsFixture(t, "admin")
	before := f.stored(t)

	rec := f.patch(`{"name":"  ","slug":"A_b"}`)
	requireWorkspaceError(t, rec, http.StatusBadRequest, "invalid_workspace_payload", "Workspace payload is invalid")
	require.JSONEq(t, `{"error":"invalid_workspace_payload","message":"Workspace payload is invalid","details":{"issues":[
        {"path":["name"],"message":"Too small: expected string to have >=1 characters"},
        {"path":["slug"],"message":"Use lowercase letters, numbers, and single hyphens between words"}]}}`, rec.Body.String())

	for _, body := range []string{`{}`, `null`, `[]`, `{"name":"Acme Test"}`, `{"name":"Acme Test Workspace"}`, `{"slug":"a--b"}`, `{"name":"` + strings.Repeat("a", 121) + `"}`, `{"slug":"` + strings.Repeat("a", 81) + `"}`} {
		requireWorkspaceError(t, f.patch(body), http.StatusBadRequest, "invalid_workspace_payload", "Workspace payload is invalid")
	}
	require.Equal(t, before, f.stored(t))
	require.Empty(t, f.workos.recorded())
}

func TestWorkspaceSettingsUpdateBodyDecodingMatchesHono(t *testing.T) {
	f := newWorkspaceSettingsFixture(t, "admin")
	before := f.stored(t)

	for _, body := range []string{`{bad`, ``, `{} trailing`} {
		rec := f.do(workspaceSettingsRequest{method: http.MethodPatch, body: body, contentType: "application/json"})
		require.JSONEq(t, `{"error":"internal_error","message":"An unexpected error occurred"}`, rec.Body.String())
		require.Equal(t, http.StatusInternalServerError, rec.Code)
	}
	for _, contentType := range []string{"", "text/plain"} {
		rec := f.do(workspaceSettingsRequest{method: http.MethodPatch, body: `{"name":"Ignored Co"}`, contentType: contentType})
		require.JSONEq(t, `{"error":"invalid_workspace_payload","message":"Workspace payload is invalid","details":{"issues":[{"path":[],"message":"Provide a name or slug"}]}}`, rec.Body.String())
	}
	require.Equal(t, before, f.stored(t))

	rec := f.do(workspaceSettingsRequest{method: http.MethodPatch, body: "\xef\xbb\xbf{\"name\":\"Bom Co\"}", contentType: "application/merge-patch+json; charset=utf-8"})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "Bom Co", f.stored(t).name)

	big := `{"name":"` + strings.Repeat("a", workspaceBodyLimit) + `"}`
	requireWorkspaceError(t, f.patch(big), http.StatusRequestEntityTooLarge, "payload_too_large", "")
}

func TestWorkspaceSettingsUpdateSuccess(t *testing.T) {
	t.Run("name only", func(t *testing.T) {
		f := newWorkspaceSettingsFixture(t, "admin")
		before := f.stored(t)
		rec := f.patch(`{"name":"  Renamed <Co>  ","extra":true}`)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Empty(t, rec.Header().Values("Set-Cookie"))
		require.Contains(t, rec.Body.String(), `"name":"Renamed <Co>"`)
		var body struct {
			Workspace  workspaceSettingsRecord `json:"workspace"`
			RedirectTo string                  `json:"redirectTo"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Equal(t, "/org/"+f.scope.Slug+"/settings/account", body.RedirectTo)
		require.Equal(t, "Renamed <Co>", body.Workspace.Name)
		require.Equal(t, f.scope.Slug, *body.Workspace.Slug)

		after := f.stored(t)
		require.Equal(t, "Renamed <Co>", after.name)
		require.True(t, after.updatedAt.After(before.updatedAt))
		require.Equal(t, []workspaceNameSyncCall{{f.scope.WorkOSOrganizationID, "Renamed <Co>"}}, f.workos.recorded())
		require.Equal(t, []activityLogEventInput{{
			ActorKind: "user", ActorUserID: f.scope.UserID, EventType: "workspace_updated",
			OrganizationID: f.scope.OrganizationID, TargetID: f.scope.OrganizationID, TargetKind: "organization",
			Payload: map[string]any{"changedFields": []string{"name"}, "previousName": before.name, "nextName": "Renamed <Co>"},
		}}, f.activity.recorded())
	})

	t.Run("slug only", func(t *testing.T) {
		f := newWorkspaceSettingsFixture(t, "localization_manager")
		f.api.workos = nil
		slug := "renamed-" + strings.TrimPrefix(f.scope.Slug, "org-")
		rec := f.patch(`{"slug":" ` + strings.ToUpper(slug) + ` "}`)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"redirectTo":"/org/`+slug+`/settings/account"`)
		require.Equal(t, slug, f.stored(t).slug)
		require.Equal(t, []activityLogEventInput{{
			ActorKind: "user", ActorUserID: f.scope.UserID, EventType: "workspace_updated",
			OrganizationID: f.scope.OrganizationID, TargetID: f.scope.OrganizationID, TargetKind: "organization",
			Payload: map[string]any{"changedFields": []string{"slug"}},
		}}, f.activity.recorded())
	})

	t.Run("name and unchanged slug", func(t *testing.T) {
		f := newWorkspaceSettingsFixture(t, "admin")
		rec := f.patch(`{"name":"Both Co","slug":"` + f.scope.Slug + `"}`)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Len(t, f.workos.recorded(), 1)
		require.Equal(t, []string{"name", "slug"}, f.activity.recorded()[0].Payload["changedFields"])
	})
}

func TestWorkspaceSettingsActivityFailureDoesNotFailUpdate(t *testing.T) {
	for name, publisher := range map[string]activityLogPublisher{"publish error": failingActivityLogPublisher{}, "disabled": nil} {
		t.Run(name, func(t *testing.T) {
			f := newWorkspaceSettingsFixture(t, "admin")
			f.api.activityLog = publisher
			require.Equal(t, http.StatusOK, f.patch(`{"name":"Published Co"}`).Code)
			require.Equal(t, "Published Co", f.stored(t).name)
			require.Equal(t, http.StatusNoContent, f.do(workspaceSettingsRequest{method: http.MethodDelete}).Code)
		})
	}
}

func TestWorkspaceSettingsSlugConflicts(t *testing.T) {
	f := newWorkspaceSettingsFixture(t, "admin")
	other := testenv.Seed(t, testenv.Options{Role: "admin"})
	requireWorkspaceError(t, f.patch(`{"name":"Conflict Co","slug":"`+other.Slug+`"}`), http.StatusConflict, "workspace_slug_conflict", "Workspace slug already exists")

	_, err := other.Pool.Exec(t.Context(), `update organizations set lifecycle_status='archived', archived_at=now() where id=$1`, other.OrganizationID)
	require.NoError(t, err)
	requireWorkspaceError(t, f.patch(`{"slug":"`+other.Slug+`"}`), http.StatusConflict, "workspace_slug_conflict", "")
	require.Empty(t, f.workos.recorded())
	require.Empty(t, f.activity.recorded())
}

func TestWorkspaceSettingsSlugRaceReturnsConflict(t *testing.T) {
	first := newWorkspaceSettingsFixture(t, "admin")
	second := newWorkspaceSettingsFixture(t, "admin")
	slug := "race-" + strings.TrimPrefix(first.scope.Slug, "org-")

	entered, release := make(chan struct{}), make(chan struct{})
	first.workos.hook = func(context.Context) error {
		close(entered)
		<-release
		return nil
	}
	firstDone := make(chan *httptest.ResponseRecorder)
	go func() { firstDone <- first.patch(`{"name":"Race Co","slug":"` + slug + `"}`) }()
	<-entered

	secondDone := make(chan *httptest.ResponseRecorder)
	go func() { secondDone <- second.patch(`{"slug":"` + slug + `"}`) }()
	waitForBlockedOrganizationQuery(t, second, "update organizations")
	close(release)

	require.Equal(t, http.StatusOK, (<-firstDone).Code)
	requireWorkspaceError(t, <-secondDone, http.StatusConflict, "workspace_slug_conflict", "Workspace slug already exists")
	require.Equal(t, slug, first.stored(t).slug)
	require.Equal(t, second.scope.Slug, second.stored(t).slug)
}

func TestWorkspaceSettingsWorkosFailureRollsBack(t *testing.T) {
	t.Run("sync error", func(t *testing.T) {
		f := newWorkspaceSettingsFixture(t, "admin")
		f.workos.err = errors.New("workos down")
		before := f.stored(t)
		rec := f.patch(`{"name":"Rolled Back Co","slug":"rolled-` + strings.TrimPrefix(f.scope.Slug, "org-") + `"}`)
		requireWorkspaceError(t, rec, http.StatusInternalServerError, "workspace_identity_unavailable", "WorkOS organization identity is unavailable")
		require.Equal(t, before, f.stored(t))
		require.Len(t, f.workos.recorded(), 1)
		require.Empty(t, f.activity.recorded())
	})

	t.Run("not configured", func(t *testing.T) {
		f := newWorkspaceSettingsFixture(t, "admin")
		f.api.workos = nil
		before := f.stored(t)
		requireWorkspaceError(t, f.patch(`{"name":"Unsynced Co"}`), http.StatusInternalServerError, "workspace_identity_unavailable", "")
		require.Equal(t, before, f.stored(t))
	})

	t.Run("request cancelled during sync", func(t *testing.T) {
		f := newWorkspaceSettingsFixture(t, "admin")
		before := f.stored(t)
		ctx, cancel := context.WithCancel(context.Background())
		f.workos.hook = func(ctx context.Context) error {
			cancel()
			<-ctx.Done()
			return ctx.Err()
		}
		rec := f.do(workspaceSettingsRequest{method: http.MethodPatch, body: `{"name":"Cancelled Co"}`, contentType: "application/json", ctx: ctx})
		requireWorkspaceError(t, rec, http.StatusInternalServerError, "workspace_identity_unavailable", "")
		require.Equal(t, before, f.stored(t))

		f.workos.hook = nil
		require.Equal(t, http.StatusOK, f.patch(`{"name":"After Cancel Co"}`).Code, "row lock must be released")
	})

	t.Run("request cancelled after successful sync still commits", func(t *testing.T) {
		f := newWorkspaceSettingsFixture(t, "admin")
		ctx, cancel := context.WithCancel(context.Background())
		f.workos.hook = func(context.Context) error {
			cancel()
			return nil
		}
		rec := f.do(workspaceSettingsRequest{method: http.MethodPatch, body: `{"name":"Synced Co"}`, contentType: "application/json", ctx: ctx})
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Equal(t, "Synced Co", f.stored(t).name)
	})
}

func TestWorkspaceSettingsCommitFailureAfterWorkosSync(t *testing.T) {
	f := newWorkspaceSettingsFixture(t, "admin")
	f.api.pool = commitFailingPool{f.scope.Pool}
	before := f.stored(t)
	requireWorkspaceError(t, f.patch(`{"name":"Diverged Co"}`), http.StatusInternalServerError, "internal_error", "An unexpected error occurred")
	require.Equal(t, before, f.stored(t))
	require.Equal(t, []workspaceNameSyncCall{{f.scope.WorkOSOrganizationID, "Diverged Co"}}, f.workos.recorded(), "WorkOS keeps the new name; no cross-system atomicity")
	require.Empty(t, f.activity.recorded())
}

func TestWorkspaceSettingsConcurrentUpdatesSerialize(t *testing.T) {
	f := newWorkspaceSettingsFixture(t, "admin")
	original := f.stored(t).name

	entered, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	f.workos.hook = func(context.Context) error {
		first := false
		once.Do(func() { first = true })
		if first {
			close(entered)
			<-release
		}
		return nil
	}
	firstDone := make(chan *httptest.ResponseRecorder)
	go func() { firstDone <- f.patch(`{"name":"First Co"}`) }()
	<-entered

	secondDone := make(chan *httptest.ResponseRecorder)
	go func() { secondDone <- f.patch(`{"name":"Second Co"}`) }()
	waitForBlockedOrganizationQuery(t, f, "for update")
	require.Equal(t, original, f.stored(t).name, "uncommitted name is not visible")
	close(release)

	require.Equal(t, http.StatusOK, (<-firstDone).Code)
	require.Equal(t, http.StatusOK, (<-secondDone).Code)
	require.Equal(t, "Second Co", f.stored(t).name)
	events := f.activity.recorded()
	require.Len(t, events, 2)
	require.Equal(t, original, events[0].Payload["previousName"])
	require.Equal(t, "First Co", events[1].Payload["previousName"])
}

func TestWorkspaceSettingsArchive(t *testing.T) {
	for _, role := range []string{"admin", "localization_manager"} {
		t.Run(role, func(t *testing.T) {
			f := newWorkspaceSettingsFixture(t, role)
			rec := f.do(workspaceSettingsRequest{method: http.MethodDelete})
			require.Equal(t, http.StatusNoContent, rec.Code)
			require.Empty(t, rec.Body.Bytes())
			require.Empty(t, rec.Header().Get("Content-Type"))

			after := f.stored(t)
			require.Equal(t, "archived", after.lifecycleStatus)
			require.NotNil(t, after.archivedAt)
			require.True(t, after.archivedAt.Equal(after.updatedAt))
			require.Equal(t, f.scope.Slug, after.slug, "archive does not clear or hard-delete the row")
			require.Equal(t, []activityLogEventInput{{
				ActorKind: "user", ActorUserID: f.scope.UserID, EventType: "workspace_archived",
				OrganizationID: f.scope.OrganizationID, TargetID: f.scope.OrganizationID, TargetKind: "organization",
				Payload: map[string]any{"lifecycleStatus": "archived"},
			}}, f.activity.recorded())

			for _, method := range []string{http.MethodDelete, http.MethodGet, http.MethodPatch} {
				rec := f.do(workspaceSettingsRequest{method: method, body: `{"name":"Revived Co"}`, contentType: "application/json"})
				requireWorkspaceError(t, rec, http.StatusForbidden, "organization_access_denied", "Organization access denied")
			}
			require.Len(t, f.activity.recorded(), 1)
		})
	}

	f := newWorkspaceSettingsFixture(t, "developer")
	requireWorkspaceError(t, f.do(workspaceSettingsRequest{method: http.MethodDelete}), http.StatusForbidden, "forbidden", "Only workspace admins can archive workspaces")
	require.Equal(t, "active", f.stored(t).lifecycleStatus)
	require.Empty(t, f.activity.recorded())
}

func TestWorkspaceSettingsArchiveWaitsForInFlightUpdate(t *testing.T) {
	f := newWorkspaceSettingsFixture(t, "admin")
	entered, release := make(chan struct{}), make(chan struct{})
	f.workos.hook = func(context.Context) error {
		close(entered)
		<-release
		return nil
	}
	patchDone := make(chan *httptest.ResponseRecorder)
	go func() { patchDone <- f.patch(`{"name":"Before Archive Co"}`) }()
	<-entered

	deleteDone := make(chan *httptest.ResponseRecorder)
	go func() { deleteDone <- f.do(workspaceSettingsRequest{method: http.MethodDelete}) }()
	waitForBlockedOrganizationQuery(t, f, "lifecycle_status='archived'")
	close(release)

	require.Equal(t, http.StatusOK, (<-patchDone).Code)
	require.Equal(t, http.StatusNoContent, (<-deleteDone).Code)
	after := f.stored(t)
	require.Equal(t, "Before Archive Co", after.name)
	require.Equal(t, "archived", after.lifecycleStatus)
}

func TestLiveWorkosUpdateOrganizationName(t *testing.T) {
	var method, path, auth string
	var body map[string]string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method, path, auth = r.Method, r.URL.EscapedPath(), r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&body)
		_, _ = w.Write([]byte(`{"id":"org_1"}`))
	}))
	defer server.Close()

	client := newLiveMemberWorkos("sk_test", server.URL)
	require.NoError(t, client.UpdateOrganizationName(t.Context(), "org_1/x", "Acme Co"))
	require.Equal(t, http.MethodPut, method)
	require.Equal(t, "/organizations/org_1%2Fx", path)
	require.Equal(t, "Bearer sk_test", auth)
	require.Equal(t, map[string]string{"name": "Acme Co"}, body)

	failing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
	}))
	defer failing.Close()
	require.Error(t, newLiveMemberWorkos("sk_test", failing.URL).UpdateOrganizationName(t.Context(), "org_1", "Acme Co"))
}
