package main

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

const (
	testGlossaryConceptID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
	testGlossaryTermID    = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
)

type testGlossaryCache struct {
	get  func(context.Context, string) (string, error)
	set  func(context.Context, string, string, time.Duration) error
	incr func(context.Context, string) (int64, error)
}

func (c testGlossaryCache) Get(ctx context.Context, key string) (string, error) {
	return c.get(ctx, key)
}

func (c testGlossaryCache) Set(ctx context.Context, key, value string, ttl time.Duration) error {
	return c.set(ctx, key, value, ttl)
}

func (c testGlossaryCache) Incr(ctx context.Context, key string) (int64, error) {
	return c.incr(ctx, key)
}

func TestGlossaryTermCountCacheHit(t *testing.T) {
	projectCount := dictionaryRowStep("from project_glossaries a join projects", 1)
	projectCount.args = []any{testGlossaryID, testGlossaryOrgID, true, testGlossaryUserID}
	api, _ := glossaryTestAPI(t, "admin", glossaryOwnedStep(), projectCount)
	api.readCache = testGlossaryCache{get: func(ctx context.Context, key string) (string, error) {
		deadline, ok := ctx.Deadline()
		require.True(t, ok)
		require.LessOrEqual(t, time.Until(deadline), GLOSSARY_READ_CACHE_TIMEOUT)
		if strings.HasSuffix(key, ":rev") {
			require.Equal(t, glossaryRevisionKey(testGlossaryOrgID, testGlossaryID), key)
			return "", errors.New("missing")
		}
		require.Equal(t, glossaryCacheKey(testGlossaryOrgID, testGlossaryID, 0, "term-count"), key)
		return "3", nil
	}}
	rec := glossaryRequestForTest(api, "GET", testGlossaryBase+"/"+testGlossaryID, "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"termCount":3`)
	require.Contains(t, rec.Body.String(), `"projectCount":1`)
	require.Contains(t, rec.Body.String(), `"canContribute":true`)
}

func TestGlossaryTermCountCacheMissWrites(t *testing.T) {
	projectCount := dictionaryRowStep("from project_glossaries a join projects", 1)
	projectCount.args = []any{testGlossaryID, testGlossaryOrgID, true, testGlossaryUserID}
	termCount := dictionaryRowStep("from glossary_terms where glossary_id=$1", 3)
	termCount.args = []any{testGlossaryID}
	api, _ := glossaryTestAPI(t, "admin", glossaryOwnedStep(), projectCount, termCount)
	var wroteKey, wroteValue string
	var wroteTTL time.Duration
	api.readCache = testGlossaryCache{
		get: func(context.Context, string) (string, error) { return "", errors.New("missing") },
		set: func(_ context.Context, key, value string, ttl time.Duration) error {
			wroteKey, wroteValue, wroteTTL = key, value, ttl
			return nil
		},
	}
	rec := glossaryRequestForTest(api, "GET", testGlossaryBase+"/"+testGlossaryID, "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Equal(t, glossaryCacheKey(testGlossaryOrgID, testGlossaryID, 0, "term-count"), wroteKey)
	require.Equal(t, "3", wroteValue)
	require.Equal(t, GLOSSARY_TERM_COUNT_CACHE_TTL, wroteTTL)
}

func TestGlossaryReadCacheHits(t *testing.T) {
	cases := []struct {
		name, path, keyPart, body string
	}{
		{name: "concepts", path: "/concepts", keyPart: "concepts", body: `{"concepts":[],"total":0}`},
		{name: "concepts page", path: "/concepts/page", keyPart: "concepts-page", body: `{"concepts":[],"nextCursor":null,"total":0,"pagination":{"hasMore":false,"limit":50,"returned":0}}`},
		{name: "authors", path: "/concepts/authors", keyPart: "authors", body: `{"authors":[{"userId":"` + testGlossaryUserID + `","displayName":"Ada Lovelace"}]}`},
		{name: "concept", path: "/concepts/" + testGlossaryConceptID, keyPart: "concept", body: `{"concept":{"id":"` + testGlossaryConceptID + `"}}`},
		{name: "terms", path: "/concepts/" + testGlossaryConceptID + "/terms", keyPart: "terms", body: `{"terms":[],"total":0}`},
		{name: "terms page", path: "/concepts/" + testGlossaryConceptID + "/terms/page?locale=fr-FR", keyPart: "terms-page", body: `{"terms":[],"nextCursor":null,"total":1,"pagination":{"hasMore":false,"limit":50,"returned":0}}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			api, _ := glossaryTestAPI(t, "admin", glossaryOwnedStep())
			api.readCache = testGlossaryCache{get: func(_ context.Context, key string) (string, error) {
				if strings.HasSuffix(key, ":rev") {
					return "4", nil
				}
				require.Contains(t, key, glossaryCacheKey(testGlossaryOrgID, testGlossaryID, 4))
				require.Contains(t, key, tc.keyPart)
				return tc.body, nil
			}}
			rec := glossaryRequestForTest(api, "GET", testGlossaryBase+"/"+testGlossaryID+tc.path, "")
			require.Equal(t, 200, rec.Code, rec.Body.String())
			require.JSONEq(t, tc.body, rec.Body.String())
		})
	}
}

func TestGlossaryCacheBumpOnTermDelete(t *testing.T) {
	del := dictionaryDBStep{kind: "exec", sql: "delete from glossary_terms", args: []any{testGlossaryTermID, testGlossaryConceptID, testGlossaryID}, affected: 1}
	api, _ := glossaryTestAPI(t, "admin", glossaryOwnedStep(), del)
	var bumped string
	api.readCache = testGlossaryCache{incr: func(_ context.Context, key string) (int64, error) {
		bumped = key
		return 1, nil
	}}
	rec := glossaryRequestForTest(api, "DELETE", testGlossaryBase+"/"+testGlossaryID+"/concepts/"+testGlossaryConceptID+"/terms/"+testGlossaryTermID, "")
	require.Equal(t, 204, rec.Code, rec.Body.String())
	require.Equal(t, glossaryRevisionKey(testGlossaryOrgID, testGlossaryID), bumped)
}

func TestGlossaryCacheMalformedFallsBack(t *testing.T) {
	projectCount := dictionaryRowStep("from project_glossaries a join projects", 2)
	projectCount.args = []any{testGlossaryID, testGlossaryOrgID, true, testGlossaryUserID}
	termCount := dictionaryRowStep("from glossary_terms where glossary_id=$1", 8)
	termCount.args = []any{testGlossaryID}
	api, _ := glossaryTestAPI(t, "admin", glossaryOwnedStep(), projectCount, termCount)
	api.readCache = testGlossaryCache{
		get: func(_ context.Context, key string) (string, error) {
			if strings.Contains(key, "term-count") {
				return `{"nope":true}`, nil
			}
			return "", errors.New("missing")
		},
		set: func(context.Context, string, string, time.Duration) error { return nil },
	}
	rec := glossaryRequestForTest(api, "GET", testGlossaryBase+"/"+testGlossaryID, "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"termCount":8`)
}

func TestGlossaryQueryDigestStable(t *testing.T) {
	require.Equal(t, glossaryQueryDigest("a", "b"), glossaryQueryDigest("a", "b"))
	require.NotEqual(t, glossaryQueryDigest("a", "b"), glossaryQueryDigest("a", "c"))
}
