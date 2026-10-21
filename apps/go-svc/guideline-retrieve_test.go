package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	guidelinepg "github.com/hyperlocalise/hyperlocalise/internal/guidelines/postgres"
	"github.com/stretchr/testify/require"
)

type fakeGuidelineRetriever struct {
	mu       sync.Mutex
	byLocale map[string]guidelines.Result
	scopes   []guidelines.Scope
	limits   []int
}

func (f *fakeGuidelineRetriever) Retrieve(_ context.Context, scope guidelines.Scope, _ string, limit int) (guidelines.Result, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.scopes = append(f.scopes, scope)
	f.limits = append(f.limits, limit)
	return f.byLocale[scope.Locale], nil
}

func serveGuidelineRetrieve(env *guidelineTestEnv, body string, authenticated bool) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/internal/guidelines/retrieve", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if authenticated {
		req.Header.Set(serverCallTokenHeader, serverCallToken())
	}
	rec := httptest.NewRecorder()
	mux := http.NewServeMux()
	registerRoutes(mux, env.handler, stubSessionVerifier{})
	mux.ServeHTTP(rec, req)
	return rec
}

func TestCollectUploadedInterleavesLocalesAndSkipsTypedGuidelines(t *testing.T) {
	typed := guidelines.Document{ID: "workspace:org", Content: "Typed", Mandatory: true}
	mandatory := guidelines.Document{ID: "doc:m", Content: "Whole", Mandatory: true}
	collected := collectUploaded([]guidelines.Result{
		{
			Mandatory:       []guidelines.Document{typed, mandatory},
			Passages:        []guidelines.Chunk{{ID: "t", DocumentID: typed.ID}, {ID: "m1", DocumentID: "doc:m"}, {ID: "a1", DocumentID: "doc:a"}, {ID: "a2", DocumentID: "doc:a"}},
			SearchAvailable: true,
		},
		{
			Mandatory:       []guidelines.Document{mandatory},
			Passages:        []guidelines.Chunk{{ID: "b1", DocumentID: "doc:b"}, {ID: "a1", DocumentID: "doc:a"}, {ID: "b2", DocumentID: "doc:b"}},
			SearchAvailable: true,
		},
	}, 3)
	require.True(t, collected.searchAvailable)
	require.Equal(t, map[string]string{"doc:m": "Whole"}, collected.mandatory)
	require.Equal(t, []string{"doc:m", "doc:b", "doc:a"}, collected.order)
	ids := make([]string, 0, len(collected.passages))
	for _, passage := range collected.passages {
		ids = append(ids, passage.ID)
	}
	require.Equal(t, []string{"b1", "a1", "b2"}, ids)

	partial := collectUploaded([]guidelines.Result{{SearchAvailable: true}, {SearchAvailable: false}}, 3)
	require.False(t, partial.searchAvailable)
}

func TestNormalizeRetrieveLocales(t *testing.T) {
	locales, err := normalizeRetrieveLocales([]string{"fr_fr", "FR-fr", "de"})
	require.NoError(t, err)
	require.Equal(t, []string{"fr-FR", "de"}, locales)

	none, err := normalizeRetrieveLocales(nil)
	require.NoError(t, err)
	require.Equal(t, []string{""}, none)

	_, err = normalizeRetrieveLocales([]string{""})
	require.Error(t, err)
	_, err = normalizeRetrieveLocales(make([]string, guidelineRetrieveMaxLocales+1))
	require.Error(t, err)
}

func TestGuidelineRetrieveReturnsUploadedDocumentsOnly(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	env := newGuidelineTestEnv(t, "admin")
	projectID := env.scope.MustProject(t, "", "Project")
	mandatoryID := guidelinepg.UploadedDocumentID(seedReadyGuideline(t, env, env.scope.OrgPath("/guidelines/documents"), "Never translate Acme."))
	searchedID := guidelinepg.UploadedDocumentID(seedReadyGuideline(t, env, env.scope.OrgPath("/guidelines/documents"), "Use vous.\n\nKeep sentences short."))

	typed := guidelines.Document{ID: "workspace:" + env.scope.OrganizationID, Content: "Typed note", Mandatory: true}
	mandatory := guidelines.Document{ID: mandatoryID, Content: "Never translate Acme.", Mandatory: true}
	retriever := &fakeGuidelineRetriever{byLocale: map[string]guidelines.Result{
		"fr-FR": {
			Mandatory:       []guidelines.Document{typed, mandatory},
			Passages:        []guidelines.Chunk{{ID: "typed", DocumentID: typed.ID, Text: "Typed note"}, {ID: "m1", DocumentID: mandatoryID, Text: "Never translate Acme."}, {ID: "p1", DocumentID: searchedID, Text: "Use vous."}},
			SearchAvailable: true,
		},
		"de-DE": {
			Mandatory:       []guidelines.Document{typed, mandatory},
			Passages:        []guidelines.Chunk{{ID: "p2", DocumentID: searchedID, Text: "Keep sentences short."}, {ID: "p1", DocumentID: searchedID, Text: "Use vous."}},
			SearchAvailable: true,
		},
	}}
	env.handler.guidelineRetrieve = &guidelineRetrieveAPI{retriever: retriever, pool: env.scope.Pool}

	body := `{"organizationId":"` + env.scope.OrganizationID + `","projectId":"` + projectID + `","locales":["fr_fr","de-DE","fr-FR"],"query":"Acme","limit":3}`
	require.Equal(t, http.StatusUnauthorized, serveGuidelineRetrieve(env, body, false).Code)

	rec := serveGuidelineRetrieve(env, body, true)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var result guidelineRetrieveResult
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &result))
	require.True(t, result.SearchAvailable)
	require.Len(t, result.Documents, 2)
	require.Equal(t, mandatoryID, result.Documents[0].ID)
	require.True(t, result.Documents[0].Mandatory)
	require.Equal(t, "Never translate Acme.", result.Documents[0].Content)
	require.NotEmpty(t, result.Documents[0].Title)
	require.Equal(t, searchedID, result.Documents[1].ID)
	require.False(t, result.Documents[1].Mandatory)
	require.Empty(t, result.Documents[1].Content)
	require.Equal(t, []retrievedGuidelinePassage{
		{ID: "p2", DocumentID: searchedID, Text: "Keep sentences short."},
		{ID: "p1", DocumentID: searchedID, Text: "Use vous."},
	}, result.Passages)

	require.Len(t, retriever.scopes, 2)
	for i, scope := range retriever.scopes {
		require.Equal(t, projectID, scope.ProjectID)
		require.Equal(t, 6, retriever.limits[i])
	}
}

func TestGuidelineRetrieveValidation(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	env := newGuidelineTestEnv(t, "admin")
	retriever := &fakeGuidelineRetriever{byLocale: map[string]guidelines.Result{}}
	env.handler.guidelineRetrieve = &guidelineRetrieveAPI{retriever: retriever, pool: env.scope.Pool}
	org := env.scope.OrganizationID

	for name, body := range map[string]string{
		"organization": `{"organizationId":"nope","query":"x"}`,
		"locale":       `{"organizationId":"` + org + `","locales":["not a locale!"],"query":"x"}`,
		"limit":        `{"organizationId":"` + org + `","query":"x","limit":99}`,
		"too many":     `{"organizationId":"` + org + `","locales":["a","b","c","d","e","f","g","h","i"],"query":"x"}`,
		"malformed":    `{"organizationId":`,
	} {
		rec := serveGuidelineRetrieve(env, body, true)
		require.Equal(t, http.StatusBadRequest, rec.Code, name+": "+rec.Body.String())
		require.Contains(t, rec.Body.String(), "invalid_guideline_retrieve", name)
	}

	other := newGuidelineTestEnv(t, "admin")
	foreignProject := other.scope.MustProject(t, "", "Other")
	foreign := serveGuidelineRetrieve(env, `{"organizationId":"`+org+`","projectId":"`+foreignProject+`","query":"x"}`, true)
	require.Equal(t, http.StatusNotFound, foreign.Code, foreign.Body.String())

	empty := serveGuidelineRetrieve(env, `{"organizationId":"`+org+`","query":"x"}`, true)
	require.Equal(t, http.StatusOK, empty.Code, empty.Body.String())
	require.JSONEq(t, `{"documents":[],"passages":[],"searchAvailable":false}`, empty.Body.String())
	require.Equal(t, []guidelines.Scope{{OrganizationID: org}}, retriever.scopes[len(retriever.scopes)-1:])
}
