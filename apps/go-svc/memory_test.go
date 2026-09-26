package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

const (
	testMemoryID     = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	testMemoryOrgID  = "22222222-2222-4222-8222-222222222222"
	testMemoryUserID = "33333333-3333-4333-8333-333333333333"
	testMemoryEntry  = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
	testMemoryBase   = "/v1/orgs/acme/translation-memories"
)

func memoryTestAPI(t *testing.T, role string) (*memoryAPI, *testenv.Scope) {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role})
	return &memoryAPI{
		pool:       scope.Pool,
		membership: scope.Membership(role),
	}, scope
}

func memoryRequest(api *memoryAPI, scope *testenv.Scope, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func memoryRequestForTest(api *memoryAPI, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func mustMemoryEntry(t *testing.T, scope *testenv.Scope, memoryID, sourceLocale, targetLocale, sourceText, targetText string) string {
	t.Helper()
	id := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into memory_entries (
            id, memory_id, source_locale, target_locale, source_text, normalized_source_text, target_text, match_score, provenance, created_by_user_id
        ) values ($1, $2, $3, $4, $5, $6, $7, 100, 'manual', $8)`,
		id, memoryID, sourceLocale, targetLocale, sourceText, normalizeMemorySourceText(sourceText), targetText, scope.UserID)
	require.NoError(t, err)
	return id
}

func mustAttachMemory(t *testing.T, scope *testenv.Scope, projectID, memoryID string) {
	t.Helper()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into project_memories (organization_id, project_id, memory_id, priority)
        values ($1, $2, $3, 0)`,
		scope.OrganizationID, projectID, memoryID)
	require.NoError(t, err)
}

func TestMemoryUnavailableWithoutPool(t *testing.T) {
	rec := memoryRequestForTest(&memoryAPI{}, http.MethodGet, testMemoryBase, "")
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Contains(t, rec.Body.String(), "memory_unavailable")
}

func TestMemoryCreateListEntryConflict(t *testing.T) {
	t.Run("create memory", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories"), `{"name":"Product TM"}`)
		require.Equal(t, 201, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"memory"`)
		require.Contains(t, rec.Body.String(), `"resourceKind":"native"`)
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	})
	t.Run("member cannot create", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "member")
		rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories"), `{"name":"Product TM"}`)
		require.Equal(t, 403, rec.Code)
	})
	t.Run("list memories", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		scope.MustMemory(t, "", "Product TM")
		rec := memoryRequest(api, scope, "GET", scope.OrgPath("/translation-memories"), "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"memories"`)
		require.Contains(t, rec.Body.String(), `"total":1`)
	})
	t.Run("entry version conflict", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		id := scope.MustMemory(t, "", "Product TM")
		entryID := mustMemoryEntry(t, scope, id, "en-US", "fr-FR", "Hello", "Bonjour")
		rec := memoryRequest(api, scope, "PATCH", scope.OrgPath("/translation-memories/"+id+"/entries/"+entryID), `{"targetText":"Salut","expectedVersion":2}`)
		require.Equal(t, 409, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "stale_memory_entry")
		require.Contains(t, rec.Body.String(), `"memoryEntry"`)
	})
	t.Run("entry patch rejects blank source text", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		id := scope.MustMemory(t, "", "Product TM")
		entryID := mustMemoryEntry(t, scope, id, "en-US", "fr-FR", "Hello", "Bonjour")
		rec := memoryRequest(api, scope, "PATCH", scope.OrgPath("/translation-memories/"+id+"/entries/"+entryID), `{"sourceText":"","expectedVersion":1}`)
		require.Equal(t, 400, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "invalid_memory_payload")
	})
	t.Run("detach requires native memory", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		id := scope.MustMemory(t, "", "Product TM")
		_, err := scope.Pool.Exec(t.Context(), `update memories set source='external_tms' where id=$1`, id)
		require.NoError(t, err)
		rec := memoryRequest(api, scope, "DELETE", scope.OrgPath("/translation-memories/"+id+"/projects/"+uuid.NewString()), "")
		require.Equal(t, 403, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "external_tms_memory_immutable")
	})
	t.Run("delete rejects archived memory", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		id := scope.MustMemory(t, "", "Product TM")
		_, err := scope.Pool.Exec(t.Context(), `update memories set status='archived' where id=$1`, id)
		require.NoError(t, err)
		rec := memoryRequest(api, scope, "DELETE", scope.OrgPath("/translation-memories/"+id), "")
		require.Equal(t, 403, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "memory_action_archived")
	})
	t.Run("import dry run", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		id := scope.MustMemory(t, "", "Product TM")
		body := `{"format":"csv","content":"source_locale,target_locale,source_text,target_text\nen-US,fr-FR,Hello,Bonjour","dryRun":true}`
		rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/import"), body)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"dryRun":true`)
		require.Contains(t, rec.Body.String(), `"preview"`)
	})
	t.Run("export tmx content type", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		id := scope.MustMemory(t, "", "Product TM")
		mustMemoryEntry(t, scope, id, "en-US", "fr-FR", "Hello", "Bonjour")
		rec := memoryRequest(api, scope, "GET", scope.OrgPath("/translation-memories/"+id+"/entries/export?format=tmx"), "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Header().Get("Content-Type"), "tmx")
		require.Contains(t, rec.Body.String(), "<tmx")
	})
	t.Run("promote from project", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		id := scope.MustMemory(t, "", "Product TM")
		projectID := scope.MustProject(t, scope.ProjectID, "Project")
		mustAttachMemory(t, scope, projectID, id)
		keyID := uuid.NewString()
		_, err := scope.Pool.Exec(t.Context(), `
            insert into project_translation_keys (
                id, organization_id, project_id, key, source_text, normalized_source_text
            ) values ($1, $2, $3, 'greeting', 'Hello', 'hello')`,
			keyID, scope.OrganizationID, projectID)
		require.NoError(t, err)
		_, err = scope.Pool.Exec(t.Context(), `
            insert into project_translations (
                organization_id, project_id, translation_key_id, target_locale, text, status
            ) values ($1, $2, $3, 'fr-FR', 'Bonjour', 'approved')`,
			scope.OrganizationID, projectID, keyID)
		require.NoError(t, err)
		body := `{"projectId":"` + projectID + `","sourceLocale":"en-US"}`
		rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/promote-from-project"), body)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"promoted":1`)
	})
	t.Run("list import attempts", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		id := scope.MustMemory(t, "", "Product TM")
		body := `{"format":"csv","content":"source_locale,target_locale,source_text,target_text\nen-US,fr-FR,Hello,Bonjour"}`
		importRec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/import"), body)
		require.Equal(t, 201, importRec.Code, importRec.Body.String())
		rec := memoryRequest(api, scope, "GET", scope.OrgPath("/translation-memories/"+id+"/import-attempts"), "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"memoryImportAttempts"`)
	})
	t.Run("create entry", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		id := scope.MustMemory(t, "", "Product TM")
		rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries"), `{"sourceLocale":"en-US","targetLocale":"fr-FR","sourceText":"Hello","targetText":"Bonjour"}`)
		require.Equal(t, 201, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"memoryEntry"`)
	})
}

func TestMemoryRequestLogPath(t *testing.T) {
	path := "/v1/orgs/acme/translation-memories/" + testMemoryID + "/entries"
	require.Equal(t, "/v1/orgs/{organizationSlug}/translation-memories/{resource}", requestLogPath(path))
}

func TestMemoryActorPermissions(t *testing.T) {
	require.True(t, memoryActor{role: "admin"}.canWriteMemories())
	require.True(t, memoryActor{role: "localization_manager"}.canWriteMemories())
	require.False(t, memoryActor{role: "reviewer"}.canWriteMemories())
	require.False(t, memoryActor{role: "translator"}.canWriteMemories())
	require.False(t, memoryActor{role: "member"}.canWriteMemories())

	require.True(t, memoryActor{role: "admin"}.canReviewMemories())
	require.True(t, memoryActor{role: "localization_manager"}.canReviewMemories())
	require.True(t, memoryActor{role: "reviewer"}.canReviewMemories())
	require.False(t, memoryActor{role: "translator"}.canReviewMemories())
	require.False(t, memoryActor{role: "member"}.canReviewMemories())

	require.True(t, memoryActor{role: "admin"}.orgWideAccess())
	require.False(t, memoryActor{role: "reviewer"}.orgWideAccess())
}

func TestNormalizeMemorySourceText(t *testing.T) {
	// Guard the Bolt ASCII / streaming rewrite against behavior drift vs the
	// historical NFKC + collapse-whitespace + lowercase contract used for TM lookups.
	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "empty", in: "", want: ""},
		{name: "whitespace only ascii", in: " \t\n\r\f\v ", want: ""},
		{name: "already normalized ascii", in: "hello world", want: "hello world"},
		{name: "trim and collapse ascii", in: "  Hello   WORLD  ", want: "hello world"},
		{name: "ascii control whitespace", in: "A\t\nB\r\fC\vD", want: "a b c d"},
		{name: "ascii double space mid", in: "foo  bar", want: "foo bar"},
		{name: "nbsp and unicode space", in: "\u00a0A\t  B\n", want: "a b"},
		{name: "precomposed accent", in: "CAFÉ", want: "café"},
		{name: "combining accent", in: "CAFE\u0301", want: "café"},
		{name: "fullwidth latin nfkc", in: "Ｈｅｌｌｏ", want: "hello"},
		{name: "fi ligature nfkc", in: "ﬁle", want: "file"},
		{name: "mixed ascii and accent trim", in: "  Brand\u00a0Name  ", want: "brand name"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, normalizeMemorySourceText(tc.in))
		})
	}
}

func TestNormalizeMemorySourceTextNormalizedASCIIZeroAllocs(t *testing.T) {
	in := "hello world"
	allocs := testing.AllocsPerRun(1000, func() {
		got := normalizeMemorySourceText(in)
		if got != in {
			t.Fatalf("unexpected normalize result %q", got)
		}
	})
	require.Zero(t, allocs)
}
