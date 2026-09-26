package main

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

const testGlossaryConceptID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

type glossaryCacheHook struct {
	inner glossaryReadCache
	get   func(context.Context, string, glossaryReadCache) (string, error)
	set   func(context.Context, string, string, time.Duration, glossaryReadCache) error
	incr  func(context.Context, string, glossaryReadCache) (int64, error)
}

func (c glossaryCacheHook) Get(ctx context.Context, key string) (string, error) {
	if c.get != nil {
		return c.get(ctx, key, c.inner)
	}
	return c.inner.Get(ctx, key)
}

func (c glossaryCacheHook) Set(ctx context.Context, key, value string, ttl time.Duration) error {
	if c.set != nil {
		return c.set(ctx, key, value, ttl, c.inner)
	}
	return c.inner.Set(ctx, key, value, ttl)
}

func (c glossaryCacheHook) Incr(ctx context.Context, key string) (int64, error) {
	if c.incr != nil {
		return c.incr(ctx, key, c.inner)
	}
	return c.inner.Incr(ctx, key)
}

func (c glossaryCacheHook) Del(ctx context.Context, key string) error {
	return c.inner.Del(ctx, key)
}

func TestGlossaryTermCountCacheHit(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	id := scope.MustGlossary(t, "", "Product terms", "en-US")
	scope.MustProject(t, scope.ProjectID, "Project")
	mustAttachGlossary(t, scope, scope.ProjectID, id)
	ctx := t.Context()
	require.NoError(t, scope.Valkey.Set(ctx, glossaryRevisionKey(scope.OrganizationID, id), "1", time.Hour))
	require.NoError(t, scope.Valkey.Set(ctx, glossaryCacheKey(scope.OrganizationID, id, 1, "term-count"), "3", time.Hour))
	rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"termCount":3`)
	require.Contains(t, rec.Body.String(), `"projectCount":1`)
	require.Contains(t, rec.Body.String(), `"canContribute":true`)
}

func TestGlossaryTermCountCacheMissWrites(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	id := scope.MustGlossary(t, "", "Product terms", "en-US")
	scope.MustProject(t, scope.ProjectID, "Project")
	mustAttachGlossary(t, scope, scope.ProjectID, id)
	concept := mustGlossaryConcept(t, scope, id, "A", "", "")
	mustGlossaryTerm(t, scope, id, concept, "en-US", "One")
	mustGlossaryTerm(t, scope, id, concept, "fr-FR", "Deux")
	mustGlossaryTerm(t, scope, id, concept, "de-DE", "Drei")
	rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"termCount":3`)
	raw, err := scope.Valkey.Get(t.Context(), glossaryCacheKey(scope.OrganizationID, id, 1, "term-count"))
	require.NoError(t, err)
	require.Equal(t, "3", raw)
}

func TestGlossaryReadCacheHits(t *testing.T) {
	cases := []struct {
		name, path, body string
		keyParts         []string
	}{
		{name: "concepts", path: "/concepts", body: `{"concepts":[],"total":0}`, keyParts: []string{"concepts"}},
		{name: "concepts page", path: "/concepts/page", body: `{"concepts":[],"nextCursor":null,"total":0,"pagination":{"hasMore":false,"limit":50,"returned":0}}`, keyParts: []string{"concepts-page", glossaryQueryDigest("", "", "", "", "")}},
		{name: "authors", path: "/concepts/authors", body: `{"authors":[{"userId":"` + testGlossaryID + `","displayName":"Ada Lovelace"}]}`, keyParts: []string{"authors"}},
		{name: "concept", path: "/concepts/" + testGlossaryConceptID, body: `{"concept":{"id":"` + testGlossaryConceptID + `"}}`, keyParts: []string{"concept", testGlossaryConceptID}},
		{name: "terms", path: "/concepts/" + testGlossaryConceptID + "/terms", body: `{"terms":[],"total":0}`, keyParts: []string{"concept", testGlossaryConceptID, "terms"}},
		{name: "terms page", path: "/concepts/" + testGlossaryConceptID + "/terms/page?locale=fr-FR", body: `{"terms":[],"nextCursor":null,"total":1,"pagination":{"hasMore":false,"limit":50,"returned":0}}`, keyParts: []string{"concept", testGlossaryConceptID, "terms-page", glossaryQueryDigest("", "", "", "", "fr-FR")}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			api, scope := glossaryTestAPI(t, "admin")
			id := scope.MustGlossary(t, "", "Product terms", "en-US")
			ctx := t.Context()
			require.NoError(t, scope.Valkey.Set(ctx, glossaryRevisionKey(scope.OrganizationID, id), "4", time.Hour))
			require.NoError(t, scope.Valkey.Set(ctx, glossaryCacheKey(scope.OrganizationID, id, 4, tc.keyParts...), tc.body, time.Hour))
			rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id+tc.path), "")
			require.Equal(t, 200, rec.Code, rec.Body.String())
			require.JSONEq(t, tc.body, rec.Body.String())
		})
	}
}

func TestGlossaryCacheBumpOnTermDelete(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	id := scope.MustGlossary(t, "", "Product terms", "en-US")
	concept := mustGlossaryConcept(t, scope, id, "Checkout", "", "")
	termID := mustGlossaryTerm(t, scope, id, concept, "en-US", "Checkout")
	rec := glossaryRequest(api, scope, "DELETE", scope.OrgPath("/glossaries/"+id+"/concepts/"+concept+"/terms/"+termID), "")
	require.Equal(t, 204, rec.Code, rec.Body.String())
	raw, err := scope.Valkey.Get(t.Context(), glossaryRevisionKey(scope.OrganizationID, id))
	require.NoError(t, err)
	require.Equal(t, "1", raw)
}

func TestGlossaryCacheBumpFailureBypassesReads(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	id := scope.MustGlossary(t, "", "Product terms", "en-US")
	concept := mustGlossaryConcept(t, scope, id, "Checkout", "", "")
	termID := mustGlossaryTerm(t, scope, id, concept, "en-US", "Checkout")
	api.readCache = glossaryCacheHook{
		inner: scope.Valkey,
		incr:  func(context.Context, string, glossaryReadCache) (int64, error) { return 0, errors.New("offline") },
	}
	rec := glossaryRequest(api, scope, "DELETE", scope.OrgPath("/glossaries/"+id+"/concepts/"+concept+"/terms/"+termID), "")
	require.Equal(t, 204, rec.Code, rec.Body.String())
	bypass, err := scope.Valkey.Get(t.Context(), glossaryBypassKey(scope.OrganizationID, id))
	require.NoError(t, err)
	require.Equal(t, "1", bypass)

	scope.MustProject(t, scope.ProjectID, "Project")
	mustAttachGlossary(t, scope, scope.ProjectID, id)
	for i := 0; i < 9; i++ {
		c := mustGlossaryConcept(t, scope, id, "Term"+strings.Repeat("x", i+1), "", "")
		mustGlossaryTerm(t, scope, id, c, "en-US", "Word"+strings.Repeat("x", i+1))
	}
	wrote := false
	api.readCache = glossaryCacheHook{
		inner: scope.Valkey,
		get: func(_ context.Context, key string, inner glossaryReadCache) (string, error) {
			if strings.HasSuffix(key, ":bypass") {
				return inner.Get(t.Context(), key)
			}
			t.Fatalf("unexpected get %s", key)
			return "", errGlossaryCacheMiss
		},
		set: func(context.Context, string, string, time.Duration, glossaryReadCache) error {
			wrote = true
			return nil
		},
		incr: func(context.Context, string, glossaryReadCache) (int64, error) {
			t.Fatal("incr while bypassed")
			return 0, errors.New("unused")
		},
	}
	rec = glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"termCount":9`)
	require.False(t, wrote)
}

func TestGlossaryRevisionTimeoutSkipsGenerationZero(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	id := scope.MustGlossary(t, "", "Product terms", "en-US")
	scope.MustProject(t, scope.ProjectID, "Project")
	mustAttachGlossary(t, scope, scope.ProjectID, id)
	concept := mustGlossaryConcept(t, scope, id, "A", "", "")
	mustGlossaryTerm(t, scope, id, concept, "en-US", "One")
	mustGlossaryTerm(t, scope, id, concept, "fr-FR", "Deux")
	mustGlossaryTerm(t, scope, id, concept, "de-DE", "Drei")
	mustGlossaryTerm(t, scope, id, concept, "es-ES", "Uno")
	wrote := false
	api.readCache = glossaryCacheHook{
		inner: scope.Valkey,
		get: func(ctx context.Context, key string, inner glossaryReadCache) (string, error) {
			if strings.HasSuffix(key, ":rev") {
				<-ctx.Done()
				return "", ctx.Err()
			}
			return inner.Get(ctx, key)
		},
		set: func(_ context.Context, key, _ string, _ time.Duration, _ glossaryReadCache) error {
			wrote = true
			require.NotContains(t, key, ":0:")
			return nil
		},
		incr: func(context.Context, string, glossaryReadCache) (int64, error) {
			t.Fatal("timeout must not initialize revision 0")
			return 0, errors.New("unused")
		},
	}
	rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"termCount":4`)
	require.False(t, wrote)
}

func TestGlossaryCacheMalformedFallsBack(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	id := scope.MustGlossary(t, "", "Product terms", "en-US")
	scope.MustProject(t, scope.ProjectID, "Project")
	other := "project_" + strings.ReplaceAll(id[:8], "-", "")
	_, err := scope.Pool.Exec(t.Context(), `
        insert into projects (id, organization_id, created_by_user_id, name, identifier, source)
        values ($1, $2, $3, 'Other', $4, 'native')`,
		other, scope.OrganizationID, scope.UserID, "P"+strings.ToUpper(strings.ReplaceAll(id, "-", "")[:8]))
	require.NoError(t, err)
	mustAttachGlossary(t, scope, scope.ProjectID, id)
	mustAttachGlossary(t, scope, other, id)
	for i := 0; i < 8; i++ {
		c := mustGlossaryConcept(t, scope, id, "Term"+strings.Repeat("y", i+1), "", "")
		mustGlossaryTerm(t, scope, id, c, "en-US", "Word"+strings.Repeat("y", i+1))
	}
	ctx := t.Context()
	require.NoError(t, scope.Valkey.Set(ctx, glossaryRevisionKey(scope.OrganizationID, id), "1", time.Hour))
	require.NoError(t, scope.Valkey.Set(ctx, glossaryCacheKey(scope.OrganizationID, id, 1, "term-count"), `{"nope":true}`, time.Hour))
	rec := glossaryRequest(api, scope, "GET", scope.OrgPath("/glossaries/"+id), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"termCount":8`)
}

func TestGlossarySourceLocalePatchBumpsCache(t *testing.T) {
	api, scope := glossaryTestAPI(t, "admin")
	id := scope.MustGlossary(t, "", "Product terms", "en-US")
	require.NoError(t, scope.Valkey.Set(t.Context(), glossaryRevisionKey(scope.OrganizationID, id), "3", time.Hour))
	rec := glossaryRequest(api, scope, "PATCH", scope.OrgPath("/glossaries/"+id), `{"sourceLocale":"fr-FR"}`)
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"sourceLocale":"fr-FR"`)
	raw, err := scope.Valkey.Get(t.Context(), glossaryRevisionKey(scope.OrganizationID, id))
	require.NoError(t, err)
	require.Equal(t, "4", raw)
}

func TestGlossaryQueryDigestStable(t *testing.T) {
	require.Equal(t, glossaryQueryDigest("a", "b"), glossaryQueryDigest("a", "b"))
	require.NotEqual(t, glossaryQueryDigest("a", "b"), glossaryQueryDigest("a", "c"))
}

func TestGlossaryCacheMissSentinel(t *testing.T) {
	_, err := func() (string, error) { return "", errGlossaryCacheMiss }()
	require.ErrorIs(t, err, errGlossaryCacheMiss)
}
