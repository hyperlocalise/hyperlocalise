package main

import (
	"context"
	"errors"
	"strings"
	"sync"
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
	del  func(context.Context, string) error
}

func (c testGlossaryCache) Get(ctx context.Context, key string) (string, error) {
	return c.get(ctx, key)
}

func (c testGlossaryCache) Set(ctx context.Context, key, value string, ttl time.Duration) error {
	if c.set == nil {
		return nil
	}
	return c.set(ctx, key, value, ttl)
}

func (c testGlossaryCache) Incr(ctx context.Context, key string) (int64, error) {
	return c.incr(ctx, key)
}

func (c testGlossaryCache) Del(ctx context.Context, key string) error {
	if c.del == nil {
		return nil
	}
	return c.del(ctx, key)
}

func glossaryCacheMiss(_ context.Context, key string) (string, error) {
	return "", errGlossaryCacheMiss
}

func TestGlossaryTermCountCacheHit(t *testing.T) {
	projectCount := dictionaryRowStep("from project_glossaries a join projects", 1)
	projectCount.args = []any{testGlossaryID, testGlossaryOrgID, true, testGlossaryUserID}
	api, _ := glossaryTestAPI(t, "admin", glossaryOwnedStep(), projectCount)
	api.readCache = testGlossaryCache{get: func(ctx context.Context, key string) (string, error) {
		deadline, ok := ctx.Deadline()
		require.True(t, ok)
		require.LessOrEqual(t, time.Until(deadline), GLOSSARY_CACHE_MUTATE_TIMEOUT)
		if strings.HasSuffix(key, ":bypass") {
			return "", errGlossaryCacheMiss
		}
		if strings.HasSuffix(key, ":rev") {
			require.Equal(t, glossaryRevisionKey(testGlossaryOrgID, testGlossaryID), key)
			return "1", nil
		}
		require.Equal(t, glossaryCacheKey(testGlossaryOrgID, testGlossaryID, 1, "term-count"), key)
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
		get: func(_ context.Context, key string) (string, error) {
			if strings.HasSuffix(key, ":rev") {
				return "1", nil
			}
			return "", errGlossaryCacheMiss
		},
		set: func(_ context.Context, key, value string, ttl time.Duration) error {
			wroteKey, wroteValue, wroteTTL = key, value, ttl
			return nil
		},
	}
	rec := glossaryRequestForTest(api, "GET", testGlossaryBase+"/"+testGlossaryID, "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Equal(t, glossaryCacheKey(testGlossaryOrgID, testGlossaryID, 1, "term-count"), wroteKey)
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
				if strings.HasSuffix(key, ":bypass") {
					return "", errGlossaryCacheMiss
				}
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

func TestGlossaryCacheBumpFailureBypassesReads(t *testing.T) {
	del := dictionaryDBStep{kind: "exec", sql: "delete from glossary_terms", args: []any{testGlossaryTermID, testGlossaryConceptID, testGlossaryID}, affected: 1}
	api, _ := glossaryTestAPI(t, "admin", glossaryOwnedStep(), del)
	var bypassKey string
	var bypassTTL time.Duration
	api.readCache = testGlossaryCache{
		incr: func(context.Context, string) (int64, error) { return 0, errors.New("offline") },
		set: func(_ context.Context, key, value string, ttl time.Duration) error {
			bypassKey, bypassTTL = key, ttl
			require.Equal(t, "1", value)
			return nil
		},
	}
	rec := glossaryRequestForTest(api, "DELETE", testGlossaryBase+"/"+testGlossaryID+"/concepts/"+testGlossaryConceptID+"/terms/"+testGlossaryTermID, "")
	require.Equal(t, 204, rec.Code, rec.Body.String())
	require.Equal(t, glossaryBypassKey(testGlossaryOrgID, testGlossaryID), bypassKey)
	require.Equal(t, GLOSSARY_CACHE_BYPASS_TTL, bypassTTL)

	projectCount := dictionaryRowStep("from project_glossaries a join projects", 1)
	projectCount.args = []any{testGlossaryID, testGlossaryOrgID, true, testGlossaryUserID}
	termCount := dictionaryRowStep("from glossary_terms where glossary_id=$1", 9)
	termCount.args = []any{testGlossaryID}
	api, _ = glossaryTestAPI(t, "admin", glossaryOwnedStep(), projectCount, termCount)
	wrote := false
	api.readCache = testGlossaryCache{
		get: func(_ context.Context, key string) (string, error) {
			if strings.HasSuffix(key, ":bypass") {
				return "1", nil
			}
			t.Fatalf("unexpected get %s", key)
			return "", errGlossaryCacheMiss
		},
		set: func(context.Context, string, string, time.Duration) error {
			wrote = true
			return nil
		},
		incr: func(context.Context, string) (int64, error) {
			t.Fatal("incr while bypassed")
			return 0, errors.New("unused")
		},
	}
	rec = glossaryRequestForTest(api, "GET", testGlossaryBase+"/"+testGlossaryID, "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"termCount":9`)
	require.False(t, wrote)
}

func TestGlossaryRevisionTimeoutSkipsGenerationZero(t *testing.T) {
	projectCount := dictionaryRowStep("from project_glossaries a join projects", 1)
	projectCount.args = []any{testGlossaryID, testGlossaryOrgID, true, testGlossaryUserID}
	termCount := dictionaryRowStep("from glossary_terms where glossary_id=$1", 4)
	termCount.args = []any{testGlossaryID}
	api, _ := glossaryTestAPI(t, "admin", glossaryOwnedStep(), projectCount, termCount)
	wrote := false
	api.readCache = testGlossaryCache{
		get: func(_ context.Context, key string) (string, error) {
			if strings.HasSuffix(key, ":bypass") {
				return "", errGlossaryCacheMiss
			}
			if strings.HasSuffix(key, ":rev") {
				return "", errors.New("offline")
			}
			t.Fatalf("unexpected get %s", key)
			return "", errGlossaryCacheMiss
		},
		set: func(_ context.Context, key, _ string, _ time.Duration) error {
			wrote = true
			require.NotContains(t, key, ":0:")
			return nil
		},
		incr: func(context.Context, string) (int64, error) {
			t.Fatal("timeout must not initialize revision 0")
			return 0, errors.New("unused")
		},
	}
	rec := glossaryRequestForTest(api, "GET", testGlossaryBase+"/"+testGlossaryID, "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"termCount":4`)
	require.False(t, wrote)
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
			if strings.HasSuffix(key, ":rev") {
				return "1", nil
			}
			return "", errGlossaryCacheMiss
		},
		set: func(context.Context, string, string, time.Duration) error { return nil },
	}
	rec := glossaryRequestForTest(api, "GET", testGlossaryBase+"/"+testGlossaryID, "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"termCount":8`)
}

func TestGlossarySourceLocalePatchBumpsCache(t *testing.T) {
	mismatch := dictionaryRowStep("from project_glossaries a join projects", 0)
	mismatch.args = []any{testGlossaryID, testGlossaryOrgID, "fr-FR"}
	sourceTerms := dictionaryRowStep("from glossary_terms where glossary_id=$1 and locale=$2", 0)
	sourceTerms.args = []any{testGlossaryID, "en-US"}
	locale := "fr-FR"
	updated := glossaryRecordValues()
	updated[5] = locale
	update := dictionaryRowStep("update glossaries as g set", updated...)
	update.args = []any{testGlossaryID, testGlossaryOrgID, (*string)(nil), (*string)(nil), &locale}
	projectCount := dictionaryRowStep("from project_glossaries a join projects", 0)
	projectCount.args = []any{testGlossaryID, testGlossaryOrgID, true, testGlossaryUserID}
	termCount := dictionaryRowStep("from glossary_terms where glossary_id=$1", 0)
	termCount.args = []any{testGlossaryID}
	api, _ := glossaryTestAPI(t, "admin", glossaryOwnedStep(), mismatch, sourceTerms, update, projectCount, termCount)
	var (
		mu     sync.Mutex
		rev    = int64(3)
		bumped bool
	)
	api.readCache = testGlossaryCache{
		get: func(_ context.Context, key string) (string, error) {
			mu.Lock()
			defer mu.Unlock()
			if strings.HasSuffix(key, ":bypass") {
				return "", errGlossaryCacheMiss
			}
			if strings.HasSuffix(key, ":rev") {
				return "3", nil
			}
			return "", errGlossaryCacheMiss
		},
		incr: func(_ context.Context, key string) (int64, error) {
			mu.Lock()
			defer mu.Unlock()
			require.Equal(t, glossaryRevisionKey(testGlossaryOrgID, testGlossaryID), key)
			rev++
			bumped = true
			return rev, nil
		},
		set: func(context.Context, string, string, time.Duration) error { return nil },
	}
	rec := glossaryRequestForTest(api, "PATCH", testGlossaryBase+"/"+testGlossaryID, `{"sourceLocale":"fr-FR"}`)
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"sourceLocale":"fr-FR"`)
	require.True(t, bumped)
}

func TestGlossaryQueryDigestStable(t *testing.T) {
	require.Equal(t, glossaryQueryDigest("a", "b"), glossaryQueryDigest("a", "b"))
	require.NotEqual(t, glossaryQueryDigest("a", "b"), glossaryQueryDigest("a", "c"))
}

func TestGlossaryCacheMissSentinel(t *testing.T) {
	_, err := glossaryCacheMiss(t.Context(), "k")
	require.ErrorIs(t, err, errGlossaryCacheMiss)
}
