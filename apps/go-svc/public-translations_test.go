package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type publicTranslationsFixture struct {
	scope   *testenv.Scope
	key     string
	handler http.Handler
}

func newPublicTranslationsFixture(t *testing.T, role string, permissions []string) publicTranslationsFixture {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role, WithProject: true})
	key, _ := mustPublicAPIKey(t, scope, publicAPIKeyOptions{permissions: permissions})
	api := &publicTranslationsAPI{auth: publicAPIIntegrationAuth(scope, scope.Membership(role))}
	mux := http.NewServeMux()
	api.register(mux)
	return publicTranslationsFixture{scope: scope, key: key, handler: mux}
}

func publicTranslationsPath(projectID, sourcePath, locale string) string {
	query := url.Values{}
	query.Set("sourcePath", sourcePath)
	query.Set("locale", locale)
	return "/v1/projects/" + url.PathEscape(projectID) + "/translations/download?" + query.Encode()
}

func (f publicTranslationsFixture) get(t *testing.T, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("X-API-Key", f.key)
	rec := httptest.NewRecorder()
	f.handler.ServeHTTP(rec, req)
	return rec
}

func (f publicTranslationsFixture) download(t *testing.T, projectID, sourcePath, locale string) *httptest.ResponseRecorder {
	t.Helper()
	return f.get(t, publicTranslationsPath(projectID, sourcePath, locale))
}

func mustSourceFile(t *testing.T, scope *testenv.Scope, projectID, sourcePath string) string {
	t.Helper()
	var id string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        insert into repository_source_files (organization_id, project_id, source_path)
        values ($1, $2, $3) returning id`, scope.OrganizationID, projectID, sourcePath).Scan(&id))
	return id
}

func mustTranslationKey(t *testing.T, scope *testenv.Scope, projectID, sourceFileID, key, sourceText string, hidden bool) string {
	t.Helper()
	var id string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        insert into project_translation_keys (organization_id, project_id, repository_source_file_id, key, source_text, normalized_source_text, is_hidden)
        values ($1, $2, $3, $4, $5, lower($5), $6) returning id`,
		scope.OrganizationID, projectID, sourceFileID, key, sourceText, hidden).Scan(&id))
	return id
}

func mustTranslation(t *testing.T, scope *testenv.Scope, projectID, keyID, locale, text, status string) {
	t.Helper()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into project_translations (organization_id, project_id, translation_key_id, target_locale, text, status)
        values ($1, $2, $3, $4, $5, $6::project_translation_status)`,
		scope.OrganizationID, projectID, keyID, locale, text, status)
	require.NoError(t, err)
}

func requireDownload(t *testing.T, rec *httptest.ResponseRecorder, filename, body string) {
	t.Helper()
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "application/json; charset=utf-8", rec.Header().Get("Content-Type"))
	require.Equal(t, "attachment; filename*=UTF-8''"+filename, rec.Header().Get("Content-Disposition"))
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	require.Equal(t, body, rec.Body.String())
}

func TestPublicTranslationsDownload(t *testing.T) {
	t.Run("builds the file from project translations", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		fileID := mustSourceFile(t, f.scope, f.scope.ProjectID, "lang/en.json")
		greeting := mustTranslationKey(t, f.scope, f.scope.ProjectID, fileID, "greeting", "Hello", false)
		mustTranslation(t, f.scope, f.scope.ProjectID, greeting, "fr", "Bonjour", "approved")

		requireDownload(t, f.download(t, f.scope.ProjectID, "lang/en.json", "fr"),
			"en-fr.json", "{\n  \"greeting\": \"Bonjour\"\n}\n")
	})

	t.Run("applies inclusion rules in key order", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		p := f.scope.ProjectID
		fileID := mustSourceFile(t, f.scope, p, "lang/en.json")
		key := func(name, source string, hidden bool) string {
			return mustTranslationKey(t, f.scope, p, fileID, name, source, hidden)
		}
		mustTranslation(t, f.scope, p, key("a_approved", "Hello", false), "fr", "Bonjour <b>&</b>", "approved")
		mustTranslation(t, f.scope, p, key("b_rejected", "Rejected source", false), "fr", "Rejeté", "rejected")
		mustTranslation(t, f.scope, p, key("c_blank", "Blank source", false), "fr", "  ", "draft")
		key("d_missing", "Missing source", false)
		mustTranslation(t, f.scope, p, key("e_same_review", "Hello world", false), "fr", "Hello world", "needs_review")
		mustTranslation(t, f.scope, p, key("f_hidden_review", "Hello world", true), "fr", " Hello world ", "needs_review")
		key("g_hidden_missing", "Hidden source", true)
		mustTranslation(t, f.scope, p, key("h_other_locale", "Other source", false), "de", "Andere", "approved")
		mustTranslation(t, f.scope, p, key("10", "Ten", false), "fr", "Dix", "approved")
		key("2", "Two", false)

		requireDownload(t, f.download(t, p, "lang/en.json", "fr"), "en-fr.json", "{\n"+
			"  \"2\": \"Two\",\n"+
			"  \"10\": \"Dix\",\n"+
			"  \"a_approved\": \"Bonjour <b>&</b>\",\n"+
			"  \"b_rejected\": \"Rejected source\",\n"+
			"  \"c_blank\": \"Blank source\",\n"+
			"  \"d_missing\": \"Missing source\",\n"+
			"  \"e_same_review\": \"Hello world\",\n"+
			"  \"f_hidden_review\": \" Hello world \",\n"+
			"  \"g_hidden_missing\": \"Hidden source\",\n"+
			"  \"h_other_locale\": \"Other source\"\n"+
			"}\n")
	})

	t.Run("exports source fallbacks when nothing is translated", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		fileID := mustSourceFile(t, f.scope, f.scope.ProjectID, "lang/en.json")
		mustTranslationKey(t, f.scope, f.scope.ProjectID, fileID, "greeting", "Hello", false)

		requireDownload(t, f.download(t, f.scope.ProjectID, "lang/en.json", "fr"),
			"en-fr.json", "{\n  \"greeting\": \"Hello\"\n}\n")
	})

	t.Run("does not cap large source files", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		fileID := mustSourceFile(t, f.scope, f.scope.ProjectID, "lang/en-large.json")
		_, err := f.scope.Pool.Exec(t.Context(), `
            insert into project_translation_keys (organization_id, project_id, repository_source_file_id, key, source_text, normalized_source_text)
            select $1, $2, $3, 'entry_' || i, 'Hello ' || i, 'hello ' || i from generate_series(0, 5000) as i`,
			f.scope.OrganizationID, f.scope.ProjectID, fileID)
		require.NoError(t, err)

		rec := f.download(t, f.scope.ProjectID, "lang/en-large.json", "fr")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var parsed map[string]string
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &parsed))
		require.Len(t, parsed, 5001)
		require.Equal(t, "Hello 0", parsed["entry_0"])
		require.Equal(t, "Hello 5000", parsed["entry_5000"])
	})

	t.Run("names the file after the trimmed source path and locale", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		fileID := mustSourceFile(t, f.scope, f.scope.ProjectID, "config/café strings.yml")
		mustTranslationKey(t, f.scope, f.scope.ProjectID, fileID, "title", "Title", false)

		requireDownload(t, f.download(t, f.scope.ProjectID, "  config/café strings.yml\t", " pt-BR "),
			"caf%C3%A9%20strings-pt-BR.yml", "{\n  \"title\": \"Title\"\n}\n")
	})

	t.Run("serves materialized provider project rows", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		projectID := "ext:crowdin:" + f.scope.Slug
		_, err := f.scope.Pool.Exec(t.Context(), `
            insert into projects (id, organization_id, created_by_user_id, name, identifier, source, external_provider_kind, external_project_id)
            values ($1, $2, $3, 'Crowdin', 'CROWDIN', 'external_tms', 'crowdin', $4)`,
			projectID, f.scope.OrganizationID, f.scope.UserID, f.scope.Slug)
		require.NoError(t, err)
		fileID := mustSourceFile(t, f.scope, projectID, "lang/en.json")
		mustTranslationKey(t, f.scope, projectID, fileID, "greeting", "Hello", false)

		requireDownload(t, f.download(t, projectID, "lang/en.json", "fr"), "en-fr.json", "{\n  \"greeting\": \"Hello\"\n}\n")
	})

	t.Run("accepts an encoded project id", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		fileID := mustSourceFile(t, f.scope, f.scope.ProjectID, "lang/en.json")
		mustTranslationKey(t, f.scope, f.scope.ProjectID, fileID, "greeting", "Hello", false)

		path := publicTranslationsPath(url.PathEscape(f.scope.ProjectID+" "), "lang/en.json", "fr")
		require.Equal(t, http.StatusOK, f.get(t, path).Code)
	})
}

func TestPublicTranslationsDownloadAgent(t *testing.T) {
	f := newPublicTranslationsFixture(t, "developer", nil)
	fileID := mustSourceFile(t, f.scope, f.scope.ProjectID, "lang/en.json")
	mustTranslationKey(t, f.scope, f.scope.ProjectID, fileID, "greeting", "Hello", false)

	fixture := newAccessTokenFixture(t)
	auth := publicAPIIntegrationAuth(f.scope, f.scope.Membership("admin"))
	auth.agent = testAgentVerifier(t, fixture)
	mux := http.NewServeMux()
	(&publicTranslationsAPI{auth: auth}).register(mux)

	req := httptest.NewRequest(http.MethodGet, publicTranslationsPath(f.scope.ProjectID, "lang/en.json", "fr"), nil)
	req.Header.Set("Authorization", "Bearer "+fixture.sign(t, agentClaims(map[string]any{
		"org_id": f.scope.WorkOSOrganizationID,
		"act":    map[string]any{"sub": f.scope.WorkOSUserID},
	})))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	requireDownload(t, rec, "en-fr.json", "{\n  \"greeting\": \"Hello\"\n}\n")
}

func TestPublicTranslationsDownloadNotFound(t *testing.T) {
	t.Run("unknown source path", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		mustSourceFile(t, f.scope, f.scope.ProjectID, "lang/en.json")
		rec := f.download(t, f.scope.ProjectID, "lang/missing.json", "fr")
		requirePublicAPIError(t, rec, http.StatusNotFound, "source_file_not_found", "Source file not found")
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	})

	t.Run("source path is matched exactly", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		mustSourceFile(t, f.scope, f.scope.ProjectID, "lang/en.json")
		requirePublicAPIError(t, f.download(t, f.scope.ProjectID, "Lang/en.json", "fr"),
			http.StatusNotFound, "source_file_not_found", "Source file not found")
	})

	t.Run("source file without keys", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		mustSourceFile(t, f.scope, f.scope.ProjectID, "lang/en.json")
		requirePublicAPIError(t, f.download(t, f.scope.ProjectID, "lang/en.json", "fr"),
			http.StatusNotFound, "translations_not_found", "No translations are available for this source file and locale.")
	})

	t.Run("unknown project", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		requirePublicAPIError(t, f.download(t, "project_missing", "lang/en.json", "fr"), http.StatusNotFound, "project_not_found", "")
	})

	t.Run("project id longer than 128 characters", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		requirePublicAPIError(t, f.download(t, strings.Repeat("p", 129), "lang/en.json", "fr"), http.StatusNotFound, "project_not_found", "")
	})

	t.Run("project in another workspace", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		other := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
		fileID := mustSourceFile(t, other, other.ProjectID, "lang/en.json")
		mustTranslationKey(t, other, other.ProjectID, fileID, "greeting", "Hello", false)
		requirePublicAPIError(t, f.download(t, other.ProjectID, "lang/en.json", "fr"), http.StatusNotFound, "project_not_found", "")
	})
}

func TestPublicTranslationsDownloadTeamIsolation(t *testing.T) {
	seedProject := func(t *testing.T, f publicTranslationsFixture, projectID string, teamID *string) {
		t.Helper()
		f.scope.MustProject(t, projectID, projectID)
		_, err := f.scope.Pool.Exec(t.Context(), `update projects set team_id=$2 where id=$1`, projectID, teamID)
		require.NoError(t, err)
		fileID := mustSourceFile(t, f.scope, projectID, "lang/en.json")
		mustTranslationKey(t, f.scope, projectID, fileID, "greeting", "Hello", false)
	}

	t.Run("team-scoped roles see only their teams", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "translator", nil)
		mine := f.scope.MustTeam(t, "mine", "Mine", "member")
		theirs := f.scope.MustTeam(t, "theirs", "Theirs", "")
		seedProject(t, f, "project_mine_"+f.scope.Slug, &mine)
		seedProject(t, f, "project_theirs_"+f.scope.Slug, &theirs)

		require.Equal(t, http.StatusOK, f.download(t, "project_mine_"+f.scope.Slug, "lang/en.json", "fr").Code)
		requirePublicAPIError(t, f.download(t, "project_theirs_"+f.scope.Slug, "lang/en.json", "fr"), http.StatusNotFound, "project_not_found", "")
	})

	t.Run("projects without a team belong to the default team", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "member", nil)
		seedProject(t, f, "project_unassigned_"+f.scope.Slug, nil)
		requirePublicAPIError(t, f.download(t, "project_unassigned_"+f.scope.Slug, "lang/en.json", "fr"), http.StatusNotFound, "project_not_found", "")

		f.scope.MustTeam(t, "default", "Default", "member")
		require.Equal(t, http.StatusOK, f.download(t, "project_unassigned_"+f.scope.Slug, "lang/en.json", "fr").Code)
	})

	for _, role := range []string{"admin", "localization_manager"} {
		t.Run(role+" sees every team", func(t *testing.T) {
			f := newPublicTranslationsFixture(t, role, nil)
			theirs := f.scope.MustTeam(t, "theirs", "Theirs", "")
			seedProject(t, f, "project_theirs_"+f.scope.Slug, &theirs)
			require.Equal(t, http.StatusOK, f.download(t, "project_theirs_"+f.scope.Slug, "lang/en.json", "fr").Code)
		})
	}
}

func TestPublicTranslationsDownloadValidation(t *testing.T) {
	f := newPublicTranslationsFixture(t, "admin", nil)
	base := "/v1/projects/" + f.scope.ProjectID + "/translations/download?"

	for name, query := range map[string]string{
		"missing source path":   "locale=fr",
		"missing locale":        "sourcePath=lang%2Fen.json",
		"blank source path":     "sourcePath=%20%09&locale=fr",
		"blank locale":          "sourcePath=lang%2Fen.json&locale=%C2%A0",
		"source path too long":  "sourcePath=" + strings.Repeat("a", 2049) + "&locale=fr",
		"locale too long":       "sourcePath=lang%2Fen.json&locale=" + strings.Repeat("a", 33),
		"repeated source path":  "sourcePath=a.json&sourcePath=b.json&locale=fr",
		"repeated locale":       "sourcePath=lang%2Fen.json&locale=fr&locale=de",
		"wrong parameter names": "path=lang%2Fen.json&lang=fr",
	} {
		t.Run(name, func(t *testing.T) {
			requirePublicAPIError(t, f.get(t, base+query), http.StatusBadRequest, "invalid_translation_payload", "")
		})
	}

	t.Run("query is validated before project access", func(t *testing.T) {
		requirePublicAPIError(t, f.get(t, "/v1/projects/project_missing/translations/download?locale=fr"),
			http.StatusBadRequest, "invalid_translation_payload", "")
	})

	t.Run("permission is checked before parameters", func(t *testing.T) {
		g := newPublicTranslationsFixture(t, "admin", []string{"jobs:read"})
		requirePublicAPIError(t, g.get(t, "/v1/projects/"+strings.Repeat("p", 129)+"/translations/download"),
			http.StatusForbidden, "forbidden", "Missing required permission: files:read")
	})

	t.Run("authentication is required", func(t *testing.T) {
		rec := httptest.NewRecorder()
		f.handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, publicTranslationsPath(f.scope.ProjectID, "lang/en.json", "fr"), nil))
		requirePublicAPIError(t, rec, http.StatusUnauthorized, "unauthorized", "Authentication required")
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	})
}

func TestPublicTranslationsDownloadLottie(t *testing.T) {
	const notImplemented = "Lottie translation download is not available on the native Go service yet"

	t.Run("dotLottie source", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		fileID := mustSourceFile(t, f.scope, f.scope.ProjectID, "anim/intro.lottie")
		mustTranslationKey(t, f.scope, f.scope.ProjectID, fileID, "layers[0].t.d.k[0].s.t", "Hello", false)
		requirePublicAPIError(t, f.download(t, f.scope.ProjectID, "anim/intro.lottie", "fr"), http.StatusNotImplemented, "not_implemented", notImplemented)
	})

	t.Run("Lottie JSON source", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		fileID := mustSourceFile(t, f.scope, f.scope.ProjectID, "anim/intro.json")
		mustTranslationKey(t, f.scope, f.scope.ProjectID, fileID, "layers[0].t.d.k[0].s.t", "Hello", false)
		mustTranslationKey(t, f.scope, f.scope.ProjectID, fileID, "assets[1].layers[2].t.d.k[0].s.t", "World", false)
		requirePublicAPIError(t, f.download(t, f.scope.ProjectID, "anim/intro.json", "fr"), http.StatusNotImplemented, "not_implemented", notImplemented)
	})

	t.Run("JSON with ordinary keys is not Lottie", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		fileID := mustSourceFile(t, f.scope, f.scope.ProjectID, "anim/intro.json")
		mustTranslationKey(t, f.scope, f.scope.ProjectID, fileID, "layers[0].t.d.k[0].s.t", "Hello", false)
		mustTranslationKey(t, f.scope, f.scope.ProjectID, fileID, "title", "Title", false)
		require.Equal(t, http.StatusOK, f.download(t, f.scope.ProjectID, "anim/intro.json", "fr").Code)
	})

	t.Run("empty Lottie source is not found first", func(t *testing.T) {
		f := newPublicTranslationsFixture(t, "admin", nil)
		mustSourceFile(t, f.scope, f.scope.ProjectID, "anim/intro.lottie")
		requirePublicAPIError(t, f.download(t, f.scope.ProjectID, "anim/intro.lottie", "fr"),
			http.StatusNotFound, "translations_not_found", "No translations are available for this source file and locale.")
	})
}

func TestPublicTranslationsDownloadWithoutDatabase(t *testing.T) {
	mux := http.NewServeMux()
	(&publicTranslationsAPI{auth: &publicAPIAuth{}}).register(mux)
	req := httptest.NewRequest(http.MethodGet, publicTranslationsPath("project_1", "lang/en.json", "fr"), nil)
	req.Header.Set("X-API-Key", "hl_secret")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	requirePublicAPIError(t, rec, http.StatusServiceUnavailable, "public_api_unavailable", "Public API is unavailable")
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
}
