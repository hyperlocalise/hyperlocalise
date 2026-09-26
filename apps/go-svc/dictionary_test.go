package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
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
			mux := http.NewServeMux()
			api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
			req := httptest.NewRequest("POST", "/v1/orgs/acme/dictionaries", strings.NewReader(`{"name":"Brand"}`))
			if tc.cookie != "" {
				req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: tc.cookie})
			}
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("Sec-Fetch-Site", tc.site)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)
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
			api, _ := dictionaryTestAPI(t, "admin")
			api.membership = func(context.Context, string) (*workos.UserOrganizationMembership, error) {
				m := &workos.UserOrganizationMembership{ID: "om_live", UserID: "user_live", OrganizationID: "org_live", Status: "active", Role: &workos.SlimRole{Slug: "admin"}}
				if tc.modify != nil {
					tc.modify(m)
				}
				return m, tc.err
			}
			rec := dictionaryRequestForTest(api, "POST", testDictionaryBase, `{"name":"Brand"}`)
			require.Equal(t, tc.status, rec.Code, rec.Body.String())
		})
	}
	t.Run("local membership absent", func(t *testing.T) {
		step := dictionaryAuthStep()
		step.err = pgx.ErrNoRows
		api := &dictionaryAPI{pool: newDictionaryTestDB(t, step)}
		rec := dictionaryRequestForTest(api, "GET", testDictionaryBase, "")
		require.Equal(t, 403, rec.Code)
	})
	t.Run("placeholder never queries database", func(t *testing.T) {
		api := &dictionaryAPI{pool: newDictionaryTestDB(t)}
		_, err := api.actor(t.Context(), AuthClaims{UserID: "invited_user_123"}, "acme")
		require.EqualError(t, err, "organization_access_denied")
	})
}

func TestDictionaryWriteRoles(t *testing.T) {
	for _, role := range []string{"member", "developer", "translator", "reviewer"} {
		t.Run(role+"/POST", func(t *testing.T) {
			api, _ := dictionaryTestAPI(t, role)
			rec := dictionaryRequestForTest(api, "POST", testDictionaryBase, `{"name":"Brand"}`)
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
			step := dictionaryRowStep("insert into spellcheck_word_libraries", dictionaryRecordValues()...)
			step.args = []any{testDictionaryOrgID, testDictionaryUserID, "Brand", ""}
			api, _ := dictionaryTestAPI(t, role, step)
			rec := dictionaryRequestForTest(api, "POST", testDictionaryBase, `{"name":"  Brand  "}`)
			require.Equal(t, 201, rec.Code, rec.Body.String())
			require.Contains(t, rec.Body.String(), `"dictionary"`)
			require.Contains(t, rec.Body.String(), `"createdAt":"2026-01-01T00:00:00.000Z"`)
			require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		})
	}
}

func TestDictionaryReadUpdateDelete(t *testing.T) {
	t.Run("read includes word count", func(t *testing.T) {
		api, _ := dictionaryTestAPI(t, "member", dictionaryOwnedStep(), dictionaryRowStep("count(*)", 12))
		rec := dictionaryRequestForTest(api, "GET", testDictionaryBase+"/"+testDictionaryID, "")
		require.Equal(t, 200, rec.Code)
		require.Contains(t, rec.Body.String(), `"wordCount":12`)
	})
	t.Run("update preserves omitted fields", func(t *testing.T) {
		values := dictionaryRecordValues()
		values[3] = "Renamed"
		api, _ := dictionaryTestAPI(t, "admin", dictionaryOwnedStep(), dictionaryRowStep("status=coalesce($5::asset_status,status)", values...), dictionaryRowStep("count(*)", 2))
		rec := dictionaryRequestForTest(api, "PATCH", testDictionaryBase+"/"+testDictionaryID, `{"name":"Renamed"}`)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"name":"Renamed"`)
	})
	t.Run("delete returns no body", func(t *testing.T) {
		api, _ := dictionaryTestAPI(t, "admin", dictionaryOwnedStep(), dictionaryDBStep{kind: "exec", sql: "delete from spellcheck_word_libraries where id=$1 and organization_id=$2", args: []any{testDictionaryID, testDictionaryOrgID}, affected: 1})
		rec := dictionaryRequestForTest(api, "DELETE", testDictionaryBase+"/"+testDictionaryID, "")
		require.Equal(t, 204, rec.Code)
		require.Empty(t, rec.Body.String())
	})
	t.Run("other tenant is not found", func(t *testing.T) {
		step := dictionaryOwnedStep()
		step.err = pgx.ErrNoRows
		api, _ := dictionaryTestAPI(t, "member", step)
		rec := dictionaryRequestForTest(api, "GET", testDictionaryBase+"/"+testDictionaryID, "")
		require.Equal(t, 404, rec.Code)
		require.Contains(t, rec.Body.String(), "dictionary_not_found")
	})
	t.Run("malformed identifier never reaches SQL", func(t *testing.T) {
		api, _ := dictionaryTestAPI(t, "member")
		rec := dictionaryRequestForTest(api, "GET", testDictionaryBase+"/not-a-uuid", "")
		require.Equal(t, 404, rec.Code)
	})
	t.Run("database errors hide details", func(t *testing.T) {
		step := dictionaryOwnedStep()
		step.err = errors.New("sensitive connection details")
		api, _ := dictionaryTestAPI(t, "member", step)
		rec := dictionaryRequestForTest(api, "GET", testDictionaryBase+"/"+testDictionaryID, "")
		require.Equal(t, 500, rec.Code)
		require.NotContains(t, rec.Body.String(), "sensitive")
	})
}

func TestDictionaryListPagination(t *testing.T) {
	for _, tc := range []struct {
		name, query   string
		limit, offset int
		projectID     string
	}{
		{"defaults", "", 50, 0, ""},
		{"filter", "?limit=10&offset=20&projectId=project_1", 10, 20, "project_1"},
		{"invalid resets entire query", "?limit=999&offset=20&projectId=project_1", 50, 0, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			steps := []dictionaryDBStep{}
			if tc.projectID != "" {
				steps = append(steps, dictionaryRowStep("from projects p", "project_1"))
			}
			steps = append(steps,
				dictionaryDBStep{kind: "query", sql: "order by d.created_at desc limit $3 offset $4", args: []any{testDictionaryOrgID, tc.projectID, tc.limit, tc.offset}, values: [][]any{dictionaryRecordValues()}},
				dictionaryDBStep{kind: "query", sql: "group by library_id", values: [][]any{{testDictionaryID, 7}}},
				dictionaryRowStep("select count(*)", 23),
			)
			api, _ := dictionaryTestAPI(t, "member", steps...)
			rec := dictionaryRequestForTest(api, "GET", testDictionaryBase+tc.query, "")
			require.Equal(t, 200, rec.Code, rec.Body.String())
			require.Contains(t, rec.Body.String(), `"total":23`)
			require.Contains(t, rec.Body.String(), `"wordCount":7`)
		})
	}
}

func TestDictionaryPayloadValidation(t *testing.T) {
	for _, body := range []string{`null`, `[]`, `{`, `{} {}`, `{"Name":"Wrong case"}`, `{"name":null}`, `{"name":123}`, `{"name":" "}`, `{"name":"` + strings.Repeat("x", 201) + `"}`, `{"name":"ok","description":null}`} {
		t.Run(body[:min(len(body), 35)], func(t *testing.T) {
			api, _ := dictionaryTestAPI(t, "admin")
			rec := dictionaryRequestForTest(api, "POST", testDictionaryBase, body)
			require.Equal(t, 400, rec.Code, rec.Body.String())
		})
	}
	for _, body := range []string{`{}`, `{"unknown":true}`, `{"status":"deleted"}`, `{"description":null}`} {
		t.Run("patch/"+body, func(t *testing.T) {
			api, _ := dictionaryTestAPI(t, "admin", dictionaryOwnedStep())
			rec := dictionaryRequestForTest(api, "PATCH", testDictionaryBase+"/"+testDictionaryID, body)
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
