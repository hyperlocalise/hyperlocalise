package main

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

type testDictionaryCache struct {
	get func(context.Context, string) (string, error)
	set func(context.Context, string, string, time.Duration) error
}

func (c testDictionaryCache) Get(ctx context.Context, key string) (string, error) {
	return c.get(ctx, key)
}

func (c testDictionaryCache) Set(ctx context.Context, key, value string, ttl time.Duration) error {
	return c.set(ctx, key, value, ttl)
}

const testResolvedWordsPath = "/v1/orgs/acme/projects/project_1/dictionaries/resolved?locale=en_us"

func cachedDictionaryMetadataStep(version int) dictionaryDBStep {
	values := dictionaryRecordValues()
	values[6] = version
	return dictionaryDBStep{kind: "query", sql: "order by a.priority,a.created_at,a.library_id", values: [][]any{append(values, 0)}}
}

func cachedDictionaryRecords(version int) []dictionaryRecord {
	priority := 0
	return []dictionaryRecord{{ID: testDictionaryID, WordsVersion: version, Priority: &priority}}
}

func dictionaryCacheMissSteps(version int) []dictionaryDBStep {
	return []dictionaryDBStep{
		{kind: "begin"},
		{kind: "exec", sql: "set transaction isolation level repeatable read read only"},
		cachedDictionaryMetadataStep(version),
		{kind: "query", sql: "d.organization_id=$2 and d.status='active' and w.locale=$3", args: []any{"project_1", testDictionaryOrgID, "en-US"}, values: [][]any{{"AuthKit", "authkit", 0, testDictionaryTime, testDictionaryID}}},
		{kind: "commit"},
	}
}

func TestResolvedDictionaryCacheHit(t *testing.T) {
	for _, words := range []string{`["AuthKit"]`, `[]`} {
		t.Run(words, func(t *testing.T) {
			api, _ := dictionaryTestAPI(t, "member", dictionaryRowStep("from projects p", "project_1"), cachedDictionaryMetadataStep(1))
			api.wordsCache = testDictionaryCache{get: func(ctx context.Context, key string) (string, error) {
				require.Equal(t, resolvedDictionaryCacheKey(testDictionaryOrgID, "project_1", "en-US", cachedDictionaryRecords(1)), key)
				deadline, ok := ctx.Deadline()
				require.True(t, ok)
				require.LessOrEqual(t, time.Until(deadline), dictionaryWordsCacheTimeout)
				return words, nil
			}}
			rec := dictionaryRequestForTest(api, "GET", testResolvedWordsPath, "")
			require.Equal(t, 200, rec.Code, rec.Body.String())
			require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
			require.JSONEq(t, `{"locale":"en-US","words":`+words+`,"dictionaryIds":["`+testDictionaryID+`"],"wordsVersion":"`+testDictionaryID+`:1,en-US"}`, rec.Body.String())
		})
	}
}

func TestResolvedDictionaryCacheFallback(t *testing.T) {
	for _, tc := range []struct {
		name, value    string
		getErr, setErr error
	}{
		{name: "missing", getErr: errors.New("missing")},
		{name: "unavailable", getErr: errors.New("offline"), setErr: errors.New("offline")},
		{name: "malformed", value: `not json`},
		{name: "null", value: `null`},
		{name: "wrong shape", value: `{}`},
		{name: "oversized", value: strings.Repeat("x", dictionaryWordsCacheMaxBytes+1)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			steps := []dictionaryDBStep{dictionaryRowStep("from projects p", "project_1"), cachedDictionaryMetadataStep(1)}
			api, db := dictionaryTestAPI(t, "member", append(steps, dictionaryCacheMissSteps(1)...)...)
			writes := 0
			api.wordsCache = testDictionaryCache{
				get: func(context.Context, string) (string, error) { return tc.value, tc.getErr },
				set: func(ctx context.Context, key, value string, ttl time.Duration) error {
					writes++
					require.True(t, db.committed)
					require.JSONEq(t, `["AuthKit"]`, value)
					require.Equal(t, dictionaryWordsCacheTTL, ttl)
					deadline, ok := ctx.Deadline()
					require.True(t, ok)
					require.LessOrEqual(t, time.Until(deadline), dictionaryWordsCacheTimeout)
					return tc.setErr
				},
			}
			rec := dictionaryRequestForTest(api, "GET", testResolvedWordsPath, "")
			require.Equal(t, 200, rec.Code, rec.Body.String())
			require.Contains(t, rec.Body.String(), `"words":["AuthKit"]`)
			require.Equal(t, 1, writes)
		})
	}
}

func TestResolvedDictionaryCacheUsesSnapshotVersion(t *testing.T) {
	steps := []dictionaryDBStep{dictionaryRowStep("from projects p", "project_1"), cachedDictionaryMetadataStep(1)}
	api, _ := dictionaryTestAPI(t, "member", append(steps, dictionaryCacheMissSteps(2)...)...)
	var readKey, writtenKey string
	api.wordsCache = testDictionaryCache{
		get: func(_ context.Context, key string) (string, error) {
			readKey = key
			return "", errors.New("missing")
		},
		set: func(_ context.Context, key, _ string, _ time.Duration) error {
			writtenKey = key
			return nil
		},
	}
	rec := dictionaryRequestForTest(api, "GET", testResolvedWordsPath, "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), testDictionaryID+`:2,en-US`)
	require.NotEqual(t, readKey, writtenKey)
	require.Equal(t, resolvedDictionaryCacheKey(testDictionaryOrgID, "project_1", "en-US", cachedDictionaryRecords(2)), writtenKey)
}

func TestResolvedDictionaryCacheTimeout(t *testing.T) {
	steps := []dictionaryDBStep{dictionaryRowStep("from projects p", "project_1"), cachedDictionaryMetadataStep(1)}
	api, _ := dictionaryTestAPI(t, "member", append(steps, dictionaryCacheMissSteps(1)...)...)
	api.wordsCache = testDictionaryCache{
		get: func(ctx context.Context, _ string) (string, error) {
			<-ctx.Done()
			return "", ctx.Err()
		},
		set: func(ctx context.Context, _, _ string, _ time.Duration) error {
			<-ctx.Done()
			return ctx.Err()
		},
	}
	rec := dictionaryRequestForTest(api, "GET", testResolvedWordsPath, "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
}

func TestResolvedDictionaryCacheRequiresLiveAccess(t *testing.T) {
	t.Run("revoked project access", func(t *testing.T) {
		step := dictionaryRowStep("from projects p")
		step.err = pgx.ErrNoRows
		api, _ := dictionaryTestAPI(t, "member", step)
		api.wordsCache = testDictionaryCache{} // Any cache access fails the test.
		rec := dictionaryRequestForTest(api, "GET", testResolvedWordsPath, "")
		require.Equal(t, 404, rec.Code, rec.Body.String())
	})
	t.Run("revoked WorkOS membership", func(t *testing.T) {
		api, _ := dictionaryTestAPI(t, "member")
		api.membership = func(context.Context, string) (*workos.UserOrganizationMembership, error) { return nil, nil }
		api.wordsCache = testDictionaryCache{}
		rec := dictionaryRequestForTest(api, "GET", testResolvedWordsPath, "")
		require.Equal(t, 403, rec.Code, rec.Body.String())
	})
}

func TestResolvedDictionaryCacheKeyIsolation(t *testing.T) {
	base := cachedDictionaryRecords(1)
	key := resolvedDictionaryCacheKey(testDictionaryOrgID, "project_1", "en-US", base)
	for _, tc := range []struct {
		name, org, project, locale string
		dictionaries               []dictionaryRecord
	}{
		{"tenant", "other-org", "project_1", "en-US", base},
		{"project", testDictionaryOrgID, "other-project", "en-US", base},
		{"locale", testDictionaryOrgID, "project_1", "fr", base},
		{"word mutation", testDictionaryOrgID, "project_1", "en-US", cachedDictionaryRecords(2)},
		{"detach archive or delete", testDictionaryOrgID, "project_1", "en-US", nil},
		{"attach", testDictionaryOrgID, "project_1", "en-US", append(cachedDictionaryRecords(1), dictionaryRecord{ID: "other", WordsVersion: 1})},
	} {
		t.Run(tc.name, func(t *testing.T) {
			require.NotEqual(t, key, resolvedDictionaryCacheKey(tc.org, tc.project, tc.locale, tc.dictionaries))
		})
	}
	priority := 5
	changed := cachedDictionaryRecords(1)
	changed[0].Priority = &priority
	require.NotEqual(t, key, resolvedDictionaryCacheKey(testDictionaryOrgID, "project_1", "en-US", changed))
	a, b := base[0], dictionaryRecord{ID: "other", WordsVersion: 1, Priority: base[0].Priority}
	require.NotEqual(t,
		resolvedDictionaryCacheKey(testDictionaryOrgID, "project_1", "en-US", []dictionaryRecord{a, b}),
		resolvedDictionaryCacheKey(testDictionaryOrgID, "project_1", "en-US", []dictionaryRecord{b, a}))
}

func TestResolvedDictionaryCacheDoesNotStoreFailedLoads(t *testing.T) {
	for _, failure := range []string{"begin", "exec", "metadata", "words", "commit"} {
		t.Run(failure, func(t *testing.T) {
			loadSteps := dictionaryCacheMissSteps(1)
			index := map[string]int{"begin": 0, "exec": 1, "metadata": 2, "words": 3, "commit": 4}[failure]
			loadSteps[index].err = errors.New("database failure")
			steps := []dictionaryDBStep{dictionaryRowStep("from projects p", "project_1"), cachedDictionaryMetadataStep(1)}
			api, _ := dictionaryTestAPI(t, "member", append(steps, loadSteps[:index+1]...)...)
			api.wordsCache = testDictionaryCache{get: func(context.Context, string) (string, error) { return "", errors.New("missing") }}
			rec := dictionaryRequestForTest(api, "GET", testResolvedWordsPath, "")
			require.Equal(t, 500, rec.Code, rec.Body.String())
		})
	}
}
