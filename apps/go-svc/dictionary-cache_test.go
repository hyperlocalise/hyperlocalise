package main

import (
	"context"
	"strings"
	"testing"
	"time"

	gosvcvalkey "github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/valkey"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

func seedResolvedRoute(t *testing.T, withWord bool) (*dictionaryAPI, string, string) {
	t.Helper()
	api, scope := dictionaryTestAPI(t, "member")
	scope.MustTeam(t, "default", "Default", "member")
	projectID := scope.MustProject(t, scope.ProjectID, "Project")
	dictID := scope.MustDictionary(t, "", "Brands")
	if withWord {
		scope.MustDictionaryWord(t, dictID, "en-US", "AuthKit")
	}
	scope.MustAttachDictionary(t, projectID, dictID, 0)
	path := scope.OrgPath("/projects/" + projectID + "/dictionaries/resolved?locale=en_us")
	return api, path, dictID
}

func getResolved(t *testing.T, api *dictionaryAPI, path string) string {
	t.Helper()
	member, err := api.membership(t.Context(), "")
	require.NoError(t, err)
	rec := sessionRequest(api, member.UserID, "GET", path, "", "session", "", "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	return rec.Body.String()
}

func TestResolvedDictionaryCacheHit(t *testing.T) {
	for _, withWord := range []bool{true, false} {
		t.Run(map[bool]string{true: "words", false: "empty"}[withWord], func(t *testing.T) {
			api, path, dictID := seedResolvedRoute(t, withWord)
			miss := getResolved(t, api, path)
			if withWord {
				require.Contains(t, miss, `"words":["AuthKit"]`)
			} else {
				require.Contains(t, miss, `"words":[]`)
			}
			require.Contains(t, miss, dictID)
			hit := getResolved(t, api, path)
			require.JSONEq(t, miss, hit)
		})
	}
}

func TestResolvedDictionaryCacheFallback(t *testing.T) {
	api, path, _ := seedResolvedRoute(t, true)
	first := getResolved(t, api, path)
	require.Contains(t, first, `"words":["AuthKit"]`)
	client, ok := api.wordsCache.(*gosvcvalkey.Client)
	require.True(t, ok)
	entry, err := client.Inner().Do(t.Context(), client.Inner().B().Scan().Cursor(0).Match("go-svc:dictionary-words:v1:*").Count(100).Build()).AsScanEntry()
	require.NoError(t, err)
	require.NotEmpty(t, entry.Elements)
	require.NoError(t, client.Set(t.Context(), entry.Elements[0], `not json`, time.Minute))
	fallback := getResolved(t, api, path)
	require.Contains(t, fallback, `"words":["AuthKit"]`)
}

func TestResolvedDictionaryCacheUsesSnapshotVersion(t *testing.T) {
	api, path, dictID := seedResolvedRoute(t, true)
	first := getResolved(t, api, path)
	require.Contains(t, first, dictID+`:1,en-US`)
	member, err := api.membership(t.Context(), "")
	require.NoError(t, err)
	idx := strings.Index(path, "/projects/")
	require.GreaterOrEqual(t, idx, 0)
	wordPath := path[:idx] + "/dictionaries/" + dictID + "/words"
	rec := sessionRequest(api, member.UserID, "POST", wordPath, `{"locale":"en-US","word":"Hyperlocalise"}`, "session", "", "")
	require.Equal(t, 201, rec.Code, rec.Body.String())
	second := getResolved(t, api, path)
	require.Contains(t, second, dictID+`:2,en-US`)
	require.Contains(t, second, "Hyperlocalise")
}

func TestResolvedDictionaryCacheTimeout(t *testing.T) {
	api, path, _ := seedResolvedRoute(t, true)
	api.wordsCache = blockingDictionaryCache{}
	body := getResolved(t, api, path)
	require.Contains(t, body, `"words":["AuthKit"]`)
}

type blockingDictionaryCache struct{}

func (blockingDictionaryCache) Get(ctx context.Context, _ string) (string, error) {
	<-ctx.Done()
	return "", ctx.Err()
}

func (blockingDictionaryCache) Set(ctx context.Context, _, _ string, _ time.Duration) error {
	<-ctx.Done()
	return ctx.Err()
}

func TestResolvedDictionaryCacheRequiresLiveAccess(t *testing.T) {
	t.Run("revoked project access", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "member")
		rec := sessionRequest(api, scope.WorkOSUserID, "GET", scope.OrgPath("/projects/missing/dictionaries/resolved?locale=en-US"), "", "session", "", "")
		require.Equal(t, 404, rec.Code, rec.Body.String())
	})
	t.Run("revoked WorkOS membership", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "member")
		scope.MustProject(t, scope.ProjectID, "Project")
		api.membership = func(context.Context, string) (*workos.UserOrganizationMembership, error) { return nil, nil }
		rec := sessionRequest(api, scope.WorkOSUserID, "GET", scope.OrgPath("/projects/"+scope.ProjectID+"/dictionaries/resolved?locale=en-US"), "", "session", "", "")
		require.Equal(t, 403, rec.Code, rec.Body.String())
	})
}

func TestResolvedDictionaryCacheKeyIsolation(t *testing.T) {
	priority := 0
	base := []dictionaryRecord{{ID: "11111111-1111-4111-8111-111111111111", WordsVersion: 1, Priority: &priority}}
	key := resolvedDictionaryCacheKey("org", "project_1", "en-US", base)
	otherPriority := 5
	for _, tc := range []struct {
		name, org, project, locale string
		dictionaries               []dictionaryRecord
	}{
		{"tenant", "other-org", "project_1", "en-US", base},
		{"project", "org", "other-project", "en-US", base},
		{"locale", "org", "project_1", "fr", base},
		{"word mutation", "org", "project_1", "en-US", []dictionaryRecord{{ID: base[0].ID, WordsVersion: 2, Priority: &priority}}},
		{"detach archive or delete", "org", "project_1", "en-US", nil},
		{"attach", "org", "project_1", "en-US", append(base, dictionaryRecord{ID: "other", WordsVersion: 1})},
		{"priority", "org", "project_1", "en-US", []dictionaryRecord{{ID: base[0].ID, WordsVersion: 1, Priority: &otherPriority}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			require.NotEqual(t, key, resolvedDictionaryCacheKey(tc.org, tc.project, tc.locale, tc.dictionaries))
		})
	}
	a, b := base[0], dictionaryRecord{ID: "other", WordsVersion: 1, Priority: &priority}
	require.NotEqual(t,
		resolvedDictionaryCacheKey("org", "project_1", "en-US", []dictionaryRecord{a, b}),
		resolvedDictionaryCacheKey("org", "project_1", "en-US", []dictionaryRecord{b, a}))
}
