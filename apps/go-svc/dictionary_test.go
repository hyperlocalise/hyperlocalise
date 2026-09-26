package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

func TestDictionarySessionAndOrigin(t *testing.T) {
	for _, tc := range []struct {
		name, cookie, origin, site string
		status                     int
	}{
		{name: "missing cookie", status: 401},
		{name: "cross origin", cookie: "session", origin: "https://evil.example", status: 403},
		{name: "opaque origin", cookie: "session", origin: "null", status: 403},
		{name: "cross site", cookie: "session", site: "cross-site", status: 403},
		{name: "web origin", cookie: "session", origin: "https://hyperlocalise.com", status: 503},
		{name: "us spelling origin", cookie: "session", origin: "https://hyperlocalize.com", site: "cross-site", status: 503},
		{name: "unconfigured database", cookie: "session", status: 503},
	} {
		t.Run(tc.name, func(t *testing.T) {
			api := &dictionaryAPI{}
			rec := sessionRequest(api, "user_live", "POST", "/v1/orgs/acme/dictionaries", `{"name":"Brand"}`, tc.cookie, tc.origin, tc.site)
			require.Equal(t, tc.status, rec.Code)
		})
	}
}

func TestDictionaryMembershipFailsClosed(t *testing.T) {
	for _, tc := range []struct {
		name   string
		modify func(*workos.UserOrganizationMembership)
		err    error
		status int
	}{
		{name: "revoked", modify: func(m *workos.UserOrganizationMembership) { m.Status = "inactive" }, status: 403},
		{name: "pending", modify: func(m *workos.UserOrganizationMembership) { m.Status = "pending" }, status: 403},
		{name: "wrong user", modify: func(m *workos.UserOrganizationMembership) { m.UserID = "other" }, status: 403},
		{name: "wrong org", modify: func(m *workos.UserOrganizationMembership) { m.OrganizationID = "other" }, status: 403},
		{name: "wrong membership", modify: func(m *workos.UserOrganizationMembership) { m.ID = "other" }, status: 403},
		{name: "missing role", modify: func(m *workos.UserOrganizationMembership) { m.Role = nil }, status: 403},
		{name: "unknown role", modify: func(m *workos.UserOrganizationMembership) { m.Role.Slug = "owner" }, status: 403},
		{name: "lookup unavailable", err: errors.New("unavailable"), status: 503},
		{name: "removed membership", err: &workos.APIError{StatusCode: 404}, status: 403},
	} {
		t.Run(tc.name, func(t *testing.T) {
			api, scope := dictionaryTestAPI(t, "admin")
			api.membership = func(context.Context, string) (*workos.UserOrganizationMembership, error) {
				m := &workos.UserOrganizationMembership{
					ID:             scope.WorkOSMembershipID,
					UserID:         scope.WorkOSUserID,
					OrganizationID: scope.WorkOSOrganizationID,
					Status:         "active",
					Role:           &workos.SlimRole{Slug: "admin"},
				}
				if tc.modify != nil {
					tc.modify(m)
				}
				return m, tc.err
			}
			rec := dictionaryRequest(api, scope, "POST", scope.OrgPath("/dictionaries"), `{"name":"Brand"}`)
			require.Equal(t, tc.status, rec.Code, rec.Body.String())
		})
	}
	t.Run("local membership absent", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "admin")
		rec := dictionaryRequest(api, scope, "GET", "/v1/orgs/missing-slug/dictionaries", "")
		require.Equal(t, 403, rec.Code)
	})
	t.Run("placeholder never queries database", func(t *testing.T) {
		api := &dictionaryAPI{}
		_, err := api.actor(t.Context(), AuthClaims{UserID: "invited_user_123"}, "acme")
		require.EqualError(t, err, "organization_access_denied")
	})
}

func TestDictionaryWriteRoles(t *testing.T) {
	for _, role := range []string{"member", "developer", "translator", "reviewer"} {
		t.Run(role+"/POST", func(t *testing.T) {
			api, scope := dictionaryTestAPI(t, role)
			rec := dictionaryRequest(api, scope, "POST", scope.OrgPath("/dictionaries"), `{"name":"Brand"}`)
			require.Equal(t, 403, rec.Code)
		})
	}
	t.Run("collection PATCH DELETE method not allowed", func(t *testing.T) {
		api := &dictionaryAPI{}
		for _, method := range []string{"PATCH", "DELETE"} {
			rec := dictionaryRequestForTest(api, method, testDictionaryBase, `{"name":"Brand"}`)
			require.Equal(t, http.StatusMethodNotAllowed, rec.Code, method)
		}
	})
	for _, role := range []string{"admin", "localization_manager"} {
		t.Run(role, func(t *testing.T) {
			api, scope := dictionaryTestAPI(t, role)
			rec := dictionaryRequest(api, scope, "POST", scope.OrgPath("/dictionaries"), `{"name":"  Brand  "}`)
			require.Equal(t, 201, rec.Code, rec.Body.String())
			require.Contains(t, rec.Body.String(), `"dictionary"`)
			require.Contains(t, rec.Body.String(), `"name":"Brand"`)
			require.Contains(t, rec.Body.String(), `"createdAt":`)
			require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		})
	}
}

func TestDictionaryReadUpdateDelete(t *testing.T) {
	t.Run("read includes word count", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "member")
		id := scope.MustDictionary(t, "", "Brand names")
		for i := 0; i < 3; i++ {
			scope.MustDictionaryWord(t, id, "en-US", "Word"+strings.Repeat("x", i+1))
		}
		rec := dictionaryRequest(api, scope, "GET", scope.OrgPath("/dictionaries/"+id), "")
		require.Equal(t, 200, rec.Code)
		require.Contains(t, rec.Body.String(), `"wordCount":3`)
	})
	t.Run("update preserves omitted fields", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "admin")
		id := scope.MustDictionary(t, "", "Brand names")
		rec := dictionaryRequest(api, scope, "PATCH", scope.OrgPath("/dictionaries/"+id), `{"name":"Renamed"}`)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"name":"Renamed"`)
		require.Contains(t, rec.Body.String(), `"status":"active"`)
	})
	t.Run("delete returns no body", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "admin")
		id := scope.MustDictionary(t, "", "Brand names")
		rec := dictionaryRequest(api, scope, "DELETE", scope.OrgPath("/dictionaries/"+id), "")
		require.Equal(t, 204, rec.Code)
		require.Empty(t, rec.Body.String())
		var n int
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from spellcheck_word_libraries where id=$1`, id).Scan(&n))
		require.Zero(t, n)
	})
	t.Run("other tenant is not found", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "member")
		other := testenv.Seed(t, testenv.Options{Role: "admin"})
		id := other.MustDictionary(t, "", "Other")
		rec := dictionaryRequest(api, scope, "GET", scope.OrgPath("/dictionaries/"+id), "")
		require.Equal(t, 404, rec.Code)
		require.Contains(t, rec.Body.String(), "dictionary_not_found")
	})
	t.Run("malformed identifier never reaches SQL", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "member")
		rec := dictionaryRequest(api, scope, "GET", scope.OrgPath("/dictionaries/not-a-uuid"), "")
		require.Equal(t, 404, rec.Code)
	})
	t.Run("database errors hide details", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "member")
		id := scope.MustDictionary(t, "", "Brand names")
		closed, err := pgxpool.New(t.Context(), os.Getenv(testenv.EnvDatabaseURL))
		require.NoError(t, err)
		closed.Close()
		api.pool = closed
		rec := dictionaryRequest(api, scope, "GET", scope.OrgPath("/dictionaries/"+id), "")
		require.Equal(t, 500, rec.Code)
		require.NotContains(t, rec.Body.String(), "connection")
	})
}

func TestDictionaryListPagination(t *testing.T) {
	api, scope := dictionaryTestAPI(t, "member")
	scope.MustTeam(t, "default", "Default", "member")
	first := scope.MustDictionary(t, "", "Alpha")
	second := scope.MustDictionary(t, "", "Beta")
	scope.MustDictionaryWord(t, first, "en-US", "AuthKit")
	scope.MustProject(t, scope.ProjectID, "Project")
	scope.MustAttachDictionary(t, scope.ProjectID, first, 0)

	list := dictionaryRequest(api, scope, "GET", scope.OrgPath("/dictionaries"), "")
	require.Equal(t, 200, list.Code, list.Body.String())
	require.Contains(t, list.Body.String(), `"total":2`)
	require.Contains(t, list.Body.String(), first)
	require.Contains(t, list.Body.String(), second)

	paged := dictionaryRequest(api, scope, "GET", scope.OrgPath("/dictionaries?limit=1&offset=0"), "")
	require.Equal(t, 200, paged.Code, paged.Body.String())
	require.Contains(t, paged.Body.String(), `"total":2`)

	filtered := dictionaryRequest(api, scope, "GET", scope.OrgPath("/dictionaries?projectId="+scope.ProjectID), "")
	require.Equal(t, 200, filtered.Code, filtered.Body.String())
	require.Contains(t, filtered.Body.String(), first)
	require.NotContains(t, filtered.Body.String(), second)

	invalid := dictionaryRequest(api, scope, "GET", scope.OrgPath("/dictionaries?limit=999&offset=20&projectId="+scope.ProjectID), "")
	require.Equal(t, 200, invalid.Code, invalid.Body.String())
	require.Contains(t, invalid.Body.String(), `"total":2`)
}

func TestDictionaryPayloadValidation(t *testing.T) {
	api, scope := dictionaryTestAPI(t, "admin")
	for _, body := range []string{`null`, `[]`, `{`, `{} {}`, `{"Name":"Wrong case"}`, `{"name":null}`, `{"name":123}`, `{"name":" "}`, `{"name":"` + strings.Repeat("x", 201) + `"}`, `{"name":"ok","description":null}`} {
		t.Run(body[:min(len(body), 35)], func(t *testing.T) {
			rec := dictionaryRequest(api, scope, "POST", scope.OrgPath("/dictionaries"), body)
			require.Equal(t, 400, rec.Code, rec.Body.String())
		})
	}
	id := scope.MustDictionary(t, "", "Brand names")
	for _, body := range []string{`{}`, `{"unknown":true}`, `{"status":"deleted"}`, `{"description":null}`} {
		t.Run("patch/"+body, func(t *testing.T) {
			rec := dictionaryRequest(api, scope, "PATCH", scope.OrgPath("/dictionaries/"+id), body)
			require.Equal(t, 400, rec.Code)
		})
	}
}

func TestDictionaryNormalizeWords(t *testing.T) {
	for _, tc := range []struct {
		input, word, folded string
		valid               bool
	}{
		{" Hyperlocalise ", "Hyperlocalise", "hyperlocalise", true},
		{"\ufeffBrand", "Brand", "brand", true},
		{"\u0085Brand", "", "", false},
		{"Cafe\u0301", "Café", "café", true},
		{"ΟΣ", "ΟΣ", "ος", true},
		{"İ", "İ", "i\u0307", true},
		{"l’esprit", "l’esprit", "l’esprit", true},
		{"品牌١", "品牌١", "品牌١", true},
		{"two words", "", "", false},
		{"#comment", "", "", false},
		{"emoji😀", "", "", false},
		{strings.Repeat("x", 65), "", "", false},
		{"", "", "", false},
	} {
		t.Run(tc.input, func(t *testing.T) {
			word, ok := normalizeDictionaryWord(tc.input)
			require.Equal(t, tc.valid, ok)
			require.Equal(t, tc.word, word.word)
			require.Equal(t, tc.folded, word.folded)
		})
	}
	words := parseDictionaryWords("# ignore\r\nAuthKit\r\nauthkit\n\nCafe\u0301\nCafé\ninvalid phrase\nHyperlocalise")
	require.Equal(t, []normalizedDictionaryWord{{"AuthKit", "authkit"}, {"Café", "café"}, {"Hyperlocalise", "hyperlocalise"}}, words)
}

func TestDictionaryTrimAndParseEdges(t *testing.T) {
	for _, tc := range []struct {
		name, input, want string
	}{
		{name: "ascii unchanged", input: "AuthKit", want: "AuthKit"},
		{name: "ascii padded", input: "\t AuthKit \r\n", want: "AuthKit"},
		{name: "bom only", input: "\ufeff", want: ""},
		{name: "nbsp padded", input: "\u00a0Brand\u00a0", want: "Brand"},
		{name: "ideographic space", input: "\u3000Café\u3000", want: "Café"},
	} {
		t.Run("trim/"+tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, trimDictionaryInput(tc.input))
		})
	}

	t.Run("parse streams without trailing newline and skips blank comment lines", func(t *testing.T) {
		words := parseDictionaryWords("# leading\n\n\u00a0\nAuthKit\n# mid\nauthkit\nHyperlocalise")
		require.Equal(t, []normalizedDictionaryWord{
			{"AuthKit", "authkit"},
			{"Hyperlocalise", "hyperlocalise"},
		}, words)
	})

	t.Run("ascii normalize bypasses nfc without changing letters", func(t *testing.T) {
		word, ok := normalizeDictionaryWord("  Product-1  ")
		require.True(t, ok)
		require.Equal(t, normalizedDictionaryWord{"Product-1", "product-1"}, word)
	})
}

func TestDictionaryLocaleAndPageValidation(t *testing.T) {
	for input, want := range map[string]string{" en_us ": "en-US", "EN-gb": "en-GB", "zh_hant_tw": "zh-Hant-TW", "fr": "fr"} {
		t.Run(input, func(t *testing.T) {
			got, err := dictionaryLocale(input)
			require.NoError(t, err)
			require.Equal(t, want, got)
		})
	}
	for _, input := range []string{"", "not a locale", "../../file", "en-"} {
		_, err := dictionaryLocale(input)
		require.Error(t, err, input)
	}
	for _, query := range []string{"?limit=0", "?limit=501", "?offset=-1", "?offset=1.5", "?limit=NaN", "?offset=Infinity"} {
		_, _, err := dictionaryPage(httptest.NewRequest("GET", "/"+query, nil), 100, 500)
		require.Error(t, err, query)
	}
}

func TestDictionaryResolvedWordPriorityAndCaps(t *testing.T) {
	rows := []dictionaryResolvedWord{
		{word: "authkit", folded: "authkit", dictionaryID: "b", priority: 10, createdAt: testDictionaryTime},
		{word: "AuthKit", folded: "authkit", dictionaryID: "a", priority: 0, createdAt: testDictionaryTime},
		{word: "HYPERLOCALISE", folded: "hyperlocalise", dictionaryID: "b", priority: 0, createdAt: testDictionaryTime.Add(time.Second)},
		{word: "Hyperlocalise", folded: "hyperlocalise", dictionaryID: "a", priority: 0, createdAt: testDictionaryTime},
		{word: "ZED", folded: "zed", dictionaryID: "b", priority: 0, createdAt: testDictionaryTime},
		{word: "Zed", folded: "zed", dictionaryID: "a", priority: 0, createdAt: testDictionaryTime},
	}
	require.Equal(t, []string{"AuthKit", "Hyperlocalise", "Zed"}, mergeDictionaryWords(rows))
	require.Empty(t, mergeDictionaryWords(nil))

	priority0 := 0
	priority10 := 10
	attached := []dictionaryRecord{
		{ID: "a", WordsVersion: 1, Priority: &priority0},
		{ID: "b", WordsVersion: 1, Priority: &priority10},
		{ID: "empty", WordsVersion: 1},
	}
	selected, resolved := selectResolvedDictionaries(attached, rows[:2])
	require.Equal(t, []string{"AuthKit"}, resolved)
	require.Equal(t, []string{"a", "empty"}, dictionaryIDsForTest(selected))
	words := make([]string, 6000)
	for i := range words {
		words[i] = "word"
	}
	require.Len(t, capDictionaryWords(words), 5000)
	for i := range words {
		words[i] = strings.Repeat("界", 64)
	}
	capped := capDictionaryWords(words)
	require.Less(t, len(capped), 5000)
	encoded, err := json.Marshal(capped)
	require.NoError(t, err)
	require.LessOrEqual(t, len(encoded), dictionaryMaxResolvedBytes)
	next, err := json.Marshal(append(capped, words[0]))
	require.NoError(t, err)
	require.Greater(t, len(next), dictionaryMaxResolvedBytes)
}

func dictionaryIDsForTest(dictionaries []dictionaryRecord) []string {
	ids := make([]string, len(dictionaries))
	for i, d := range dictionaries {
		ids[i] = d.ID
	}
	return ids
}

func TestDictionaryLogPathsHideCustomerIdentifiers(t *testing.T) {
	for _, path := range []string{
		"/v1/orgs/customer-name/dictionaries/111/words/222",
		"/v1/orgs/customer-name/projects/private-project/dictionaries/resolved",
	} {
		safe := requestLogPath(path)
		require.NotContains(t, safe, "customer-name")
		require.NotContains(t, safe, "private-project")
		require.NotContains(t, safe, "111")
	}
}

func TestDictionaryPostgresLifecycle(t *testing.T) {
	api, scope := dictionaryTestAPI(t, "admin")
	scope.MustProject(t, scope.ProjectID, "Project")
	created := dictionaryRequest(api, scope, "POST", scope.OrgPath("/dictionaries"), `{"name":"Brands"}`)
	require.Equal(t, 201, created.Code, created.Body.String())
	var body struct {
		Dictionary dictionaryRecord `json:"dictionary"`
	}
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &body))
	path := scope.OrgPath("/dictionaries/" + body.Dictionary.ID)
	for _, tc := range []struct {
		method, path, payload string
		status                int
	}{
		{"PATCH", path, `{"name":"Brand names","status":"draft"}`, 200},
		{"PATCH", path, `{"status":"active"}`, 200},
		{"GET", scope.OrgPath("/dictionaries?limit=1"), "", 200},
		{"POST", path + "/words", `{"locale":"en_us","word":"AuthKit"}`, 201},
		{"POST", path + "/words", `{"locale":"en-US","word":"authkit"}`, 409},
		{"POST", path + "/words/import", `{"locale":"en-US","content":"AuthKit\nHyperlocalise\ninvalid phrase"}`, 200},
		{"GET", path + "/words?locale=en-US", "", 200},
		{"POST", path + "/projects", `{"projectId":"` + scope.ProjectID + `"}`, 200},
		{"POST", scope.OrgPath("/projects/" + scope.ProjectID + "/dictionaries"), `{"dictionaryId":"` + body.Dictionary.ID + `"}`, 200},
		{"GET", scope.OrgPath("/projects/" + scope.ProjectID + "/dictionaries/resolved?locale=en-US"), "", 200},
		{"GET", scope.OrgPath("/projects/" + scope.ProjectID + "/dictionaries"), "", 200},
	} {
		rec := dictionaryRequest(api, scope, tc.method, tc.path, tc.payload)
		require.Equal(t, tc.status, rec.Code, rec.Body.String())
	}
	export := dictionaryRequest(api, scope, "GET", path+"/words/export?locale=en-US", "")
	require.Equal(t, "AuthKit\nHyperlocalise\n", export.Body.String())
	detail := dictionaryRequest(api, scope, "GET", path, "")
	require.NoError(t, json.Unmarshal(detail.Body.Bytes(), &body))
	require.Equal(t, 2, body.Dictionary.WordCount)
	require.Equal(t, 3, body.Dictionary.WordsVersion)
	deleted := dictionaryRequest(api, scope, "DELETE", path, "")
	require.Equal(t, 204, deleted.Code)
	var words, attachments int
	require.NoError(t, api.pool.QueryRow(t.Context(), `select count(*) from spellcheck_word_library_words where library_id=$1`, body.Dictionary.ID).Scan(&words))
	require.NoError(t, api.pool.QueryRow(t.Context(), `select count(*) from project_spellcheck_word_libraries where library_id=$1`, body.Dictionary.ID).Scan(&attachments))
	require.Zero(t, words)
	require.Zero(t, attachments)
}
