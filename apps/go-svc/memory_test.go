package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

const (
	testMemoryID     = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	testMemoryOrgID  = "22222222-2222-4222-8222-222222222222"
	testMemoryUserID = "33333333-3333-4333-8333-333333333333"
	testMemoryEntry  = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
	testMemoryBase   = "/api/go-svc/v1/orgs/acme/translation-memories"
)

var testMemoryTime = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

func memoryRecordValues() []any {
	userID := testMemoryUserID
	coverage := []byte(`[]`)
	caps := []byte(`{}`)
	return []any{
		testMemoryID, testMemoryOrgID, &userID, "Product TM", "desc", "active", "native",
		nil, nil, nil, coverage, nil, nil, nil, caps, nil, nil, nil, nil,
		testMemoryTime, testMemoryTime,
	}
}

func memoryEntryValues() []any {
	userID := testMemoryUserID
	meta := []byte(`{}`)
	return []any{
		testMemoryEntry, testMemoryID, "en-US", "fr-FR", "Hello", "Bonjour", 100, "manual", "approved", 1,
		nil, &userID, nil, nil, nil, meta, testMemoryTime, testMemoryTime, nil,
	}
}

func memoryAuthStep() dictionaryDBStep {
	step := dictionaryRowStep("m.workos_membership_id not in ('', 'replacing')", testMemoryUserID, testMemoryOrgID, "om_live", "org_live")
	step.args = []any{"user_live", "acme"}
	return step
}

func memoryOwnedStep() dictionaryDBStep {
	step := dictionaryRowStep("m.id=$1 and", memoryRecordValues()...)
	step.args = []any{testMemoryID, testMemoryOrgID, testMemoryUserID, true}
	return step
}

func memoryTestAPI(t *testing.T, role string, steps ...dictionaryDBStep) (*memoryAPI, *dictionaryTestDB) {
	t.Helper()
	db := newDictionaryTestDB(t, append([]dictionaryDBStep{memoryAuthStep()}, steps...)...)
	api := &memoryAPI{pool: db, membership: func(_ context.Context, id string) (*workos.UserOrganizationMembership, error) {
		require.Equal(t, "om_live", id)
		return &workos.UserOrganizationMembership{ID: id, UserID: "user_live", OrganizationID: "org_live", Status: "active", Role: &workos.SlimRole{Slug: role}}, nil
	}}
	return api, db
}

func memoryRequestForTest(api *memoryAPI, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	withOptionalPrefix(publicPathPrefix, mux).ServeHTTP(rec, req)
	return rec
}

func TestMemoryCreateListEntryConflict(t *testing.T) {
	t.Run("create memory", func(t *testing.T) {
		step := dictionaryRowStep("insert into memories", memoryRecordValues()...)
		step.args = []any{testMemoryOrgID, testMemoryUserID, "Product TM", ""}
		api, _ := memoryTestAPI(t, "admin", step)
		rec := memoryRequestForTest(api, "POST", testMemoryBase, `{"name":"Product TM"}`)
		require.Equal(t, 201, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"memory"`)
		require.Contains(t, rec.Body.String(), `"resourceKind":"native"`)
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	})
	t.Run("member cannot create", func(t *testing.T) {
		api, _ := memoryTestAPI(t, "member")
		rec := memoryRequestForTest(api, "POST", testMemoryBase, `{"name":"Product TM"}`)
		require.Equal(t, 403, rec.Code)
	})
	t.Run("list memories", func(t *testing.T) {
		listStep := dictionaryDBStep{kind: "query", sql: "from memories m where", values: [][]any{memoryRecordValues()}}
		listStep.args = []any{testMemoryOrgID, testMemoryUserID, true, 50, 0}
		countStep := dictionaryRowStep("select count(*) from memories m where", 1)
		countStep.args = []any{testMemoryOrgID, testMemoryUserID, true}
		api, _ := memoryTestAPI(t, "admin", listStep, countStep)
		rec := memoryRequestForTest(api, "GET", testMemoryBase, "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"memories"`)
		require.Contains(t, rec.Body.String(), `"total":1`)
	})
	t.Run("entry version conflict", func(t *testing.T) {
		current := memoryEntryValues()
		currentStep := dictionaryRowStep("from memory_entries e where e.id=$1", current...)
		currentStep.args = []any{testMemoryEntry, testMemoryID}
		staleUpdate := dictionaryRowStep("update memory_entries")
		staleUpdate.err = pgx.ErrNoRows
		latest := dictionaryRowStep("from memory_entries e where e.id=$1", current...)
		latest.args = []any{testMemoryEntry, testMemoryID}
		api, _ := memoryTestAPI(t, "admin", memoryOwnedStep(), currentStep, staleUpdate, latest)
		rec := memoryRequestForTest(api, "PATCH", testMemoryBase+"/"+testMemoryID+"/entries/"+testMemoryEntry, `{"targetText":"Salut","expectedVersion":1}`)
		require.Equal(t, 409, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "stale_memory_entry")
		require.Contains(t, rec.Body.String(), `"memoryEntry"`)
	})
	t.Run("entry patch rejects blank source text", func(t *testing.T) {
		current := memoryEntryValues()
		currentStep := dictionaryRowStep("from memory_entries e where e.id=$1", current...)
		currentStep.args = []any{testMemoryEntry, testMemoryID}
		api, _ := memoryTestAPI(t, "admin", memoryOwnedStep(), currentStep)
		rec := memoryRequestForTest(api, "PATCH", testMemoryBase+"/"+testMemoryID+"/entries/"+testMemoryEntry, `{"sourceText":"","expectedVersion":1}`)
		require.Equal(t, 400, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "invalid_memory_payload")
	})
	t.Run("detach requires native memory", func(t *testing.T) {
		external := memoryRecordValues()
		external[6] = "external_tms"
		owned := dictionaryRowStep("m.id=$1 and", external...)
		owned.args = []any{testMemoryID, testMemoryOrgID, testMemoryUserID, true}
		api, _ := memoryTestAPI(t, "admin", owned)
		rec := memoryRequestForTest(api, "DELETE", testMemoryBase+"/"+testMemoryID+"/projects/99999999-9999-4999-8999-999999999999", "")
		require.Equal(t, 403, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "external_tms_memory_immutable")
	})
	t.Run("import dry run", func(t *testing.T) {
		dupCheck := dictionaryRowStep("select id from memory_entries where memory_id=$1")
		dupCheck.err = pgx.ErrNoRows
		dupCheck.args = []any{testMemoryID, "en-US", "fr-FR", "hello"}
		api, _ := memoryTestAPI(t, "admin", memoryOwnedStep(), dupCheck)
		body := `{"format":"csv","content":"source_locale,target_locale,source_text,target_text\nen-US,fr-FR,Hello,Bonjour","dryRun":true}`
		rec := memoryRequestForTest(api, "POST", testMemoryBase+"/"+testMemoryID+"/entries/import", body)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"dryRun":true`)
		require.Contains(t, rec.Body.String(), `"preview"`)
	})
	t.Run("export tmx content type", func(t *testing.T) {
		entries := dictionaryDBStep{kind: "query", sql: "from memory_entries where", values: [][]any{{
			"en-US", "fr-FR", "Hello", "Bonjour", 100, nil,
		}}}
		entries.args = []any{testMemoryID}
		api, _ := memoryTestAPI(t, "admin", memoryOwnedStep(), entries)
		rec := memoryRequestForTest(api, "GET", testMemoryBase+"/"+testMemoryID+"/entries/export?format=tmx", "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Header().Get("Content-Type"), "tmx")
		require.Contains(t, rec.Body.String(), "<tmx")
	})
	t.Run("promote from project", func(t *testing.T) {
		projectID := "99999999-9999-4999-8999-999999999999"
		ownedProject := dictionaryRowStep("from projects p where p.id=$1", projectID)
		ownedProject.args = []any{projectID, testMemoryOrgID, true, testMemoryUserID}
		attached := dictionaryRowStep("from project_memories where project_id=$1", testMemoryID)
		attached.args = []any{projectID, testMemoryID, testMemoryOrgID}
		translations := dictionaryDBStep{kind: "query", sql: "from project_translations t join project_translation_keys", values: [][]any{{
			"greeting", "Hello", "fr-FR", "Bonjour", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", nil,
		}}}
		translations.args = []any{testMemoryOrgID, projectID}
		upsert := dictionaryDBStep{kind: "exec", sql: "insert into memory_entries", affected: 1}
		api, _ := memoryTestAPI(t, "admin", memoryOwnedStep(), ownedProject, attached, translations, upsert)
		body := `{"projectId":"` + projectID + `","sourceLocale":"en-US"}`
		rec := memoryRequestForTest(api, "POST", testMemoryBase+"/"+testMemoryID+"/entries/promote-from-project", body)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"promoted":1`)
	})
	t.Run("list import attempts", func(t *testing.T) {
		attemptID := "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
		userID := testMemoryUserID
		completed := testMemoryTime
		list := dictionaryDBStep{kind: "query", sql: "from memory_import_attempts a", values: [][]any{{
			attemptID, testMemoryOrgID, testMemoryID, &userID, "completed", "csv",
			[]byte(`{}`), nil, nil, "abc", []byte(`{}`), nil, false, "available", nil, nil, testMemoryTime, &completed, strPtr("Ada"),
		}}}
		list.args = []any{testMemoryID, testMemoryOrgID, 51}
		total := dictionaryRowStep("select count(*) from memory_import_attempts a where", 1)
		total.args = []any{testMemoryID, testMemoryOrgID}
		api, _ := memoryTestAPI(t, "admin", memoryOwnedStep(), list, total)
		rec := memoryRequestForTest(api, "GET", testMemoryBase+"/"+testMemoryID+"/import-attempts", "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"memoryImportAttempts"`)
	})
	t.Run("create entry", func(t *testing.T) {
		dupCheck := dictionaryRowStep("select id from memory_entries where memory_id=$1")
		dupCheck.err = pgx.ErrNoRows
		dupCheck.args = []any{testMemoryID, "en-US", "fr-FR", "hello"}
		insert := dictionaryRowStep("insert into memory_entries", memoryEntryValues()...)
		insert.args = []any{testMemoryID, "en-US", "fr-FR", "Hello", "hello", "Bonjour", 100, testMemoryUserID}
		event := dictionaryDBStep{kind: "exec", sql: "insert into memory_entry_events", affected: 1}
		api, db := memoryTestAPI(t, "admin", memoryOwnedStep(),
			dictionaryDBStep{kind: "begin"},
			dupCheck,
			insert,
			event,
			dictionaryDBStep{kind: "commit"},
		)
		rec := memoryRequestForTest(api, "POST", testMemoryBase+"/"+testMemoryID+"/entries", `{"sourceLocale":"en-US","targetLocale":"fr-FR","sourceText":"Hello","targetText":"Bonjour"}`)
		require.Equal(t, 201, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"memoryEntry"`)
		require.True(t, db.committed)
	})
}

func TestMemoryRequestLogPath(t *testing.T) {
	path := publicPathPrefix + "/v1/orgs/acme/translation-memories/" + testMemoryID + "/entries"
	require.Equal(t, publicPathPrefix+"/v1/orgs/{organizationSlug}/translation-memories/{resource}", requestLogPath(path))
}
