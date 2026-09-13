package main

import (
	"context"
	"encoding/json"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

// Supply an explicit test database URL to exercise real PostgreSQL constraints,
// transactions, advisory locks, and SQL. Each test owns an isolated schema.
func dictionaryPostgresAPI(t *testing.T) *dictionaryAPI {
	t.Helper()
	databaseURL := os.Getenv("DICTIONARY_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set DICTIONARY_TEST_DATABASE_URL to run PostgreSQL dictionary integration tests")
	}
	ctx := t.Context()
	admin, err := pgxpool.New(ctx, databaseURL)
	require.NoError(t, err)
	schemaName := "dictionary_test_" + uuid.NewString()
	quoted := pgx.Identifier{schemaName}.Sanitize()
	_, err = admin.Exec(ctx, "create schema "+quoted)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, dropErr := admin.Exec(context.Background(), "drop schema "+quoted+" cascade")
		require.NoError(t, dropErr)
		admin.Close()
	})
	config, err := pgxpool.ParseConfig(databaseURL)
	require.NoError(t, err)
	config.ConnConfig.RuntimeParams["search_path"] = quoted
	pool, err := pgxpool.NewWithConfig(ctx, config)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	_, err = pool.Exec(ctx, `
        create type asset_status as enum ('draft','active','archived');
        create table users(id uuid primary key,workos_user_id text not null);
        create table organizations(id uuid primary key,workos_organization_id text,slug text,lifecycle_status text);
        create table organization_memberships(user_id uuid,organization_id uuid,workos_membership_id text);
        create table teams(id uuid primary key,organization_id uuid,slug text);
        create table team_memberships(team_id uuid,user_id uuid);
        create table projects(id text primary key,organization_id uuid,name text,team_id uuid);
        create table spellcheck_dictionaries(
            id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations(id),
            created_by_user_id uuid references users(id),name text not null,description text not null default '',
            status asset_status not null default 'active',words_version integer not null default 1,
            created_at timestamptz not null default now(),updated_at timestamptz not null default now());
        create table spellcheck_dictionary_words(
            id uuid primary key default gen_random_uuid(),dictionary_id uuid not null references spellcheck_dictionaries(id) on delete cascade,
            locale text not null,word text not null,word_normalized text not null,created_by_user_id uuid references users(id),
            created_at timestamptz not null default now(),unique(dictionary_id,locale,word_normalized));
        create table project_spellcheck_dictionaries(
            id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations(id),
            project_id text not null references projects(id) on delete cascade,dictionary_id uuid not null references spellcheck_dictionaries(id) on delete cascade,
            priority integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(project_id,dictionary_id));
    `)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `insert into users values($1,'user_live')`, testDictionaryUserID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `insert into organizations values($1,'org_live','acme','active')`, testDictionaryOrgID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `insert into organization_memberships values($1,$2,'om_live')`, testDictionaryUserID, testDictionaryOrgID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `insert into projects values('project_1',$1,'Project',null)`, testDictionaryOrgID)
	require.NoError(t, err)
	return &dictionaryAPI{pool: pool, membership: func(context.Context, string) (*workos.UserOrganizationMembership, error) {
		return &workos.UserOrganizationMembership{ID: "om_live", UserID: "user_live", OrganizationID: "org_live", Status: "active", Role: &workos.SlimRole{Slug: "admin"}}, nil
	}}
}

func TestDictionaryPostgresLifecycle(t *testing.T) {
	api := dictionaryPostgresAPI(t)
	created := dictionaryRequestForTest(api, "POST", testDictionaryBase, `{"name":"Brands"}`)
	require.Equal(t, 201, created.Code, created.Body.String())
	var body struct {
		Dictionary dictionaryRecord `json:"dictionary"`
	}
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &body))
	path := testDictionaryBase + "/" + body.Dictionary.ID
	for _, tc := range []struct {
		method, path, body string
		status             int
	}{
		{"PATCH", path, `{"name":"Brand names","status":"draft"}`, 200},
		{"PATCH", path, `{"status":"active"}`, 200},
		{"GET", testDictionaryBase + "?limit=1", "", 200},
		{"POST", path + "/words", `{"locale":"en_us","word":"AuthKit"}`, 201},
		{"POST", path + "/words", `{"locale":"en-US","word":"authkit"}`, 409},
		{"POST", path + "/words/import", `{"locale":"en-US","content":"AuthKit\nHyperlocalise\ninvalid phrase"}`, 200},
		{"GET", path + "/words?locale=en-US", "", 200},
		{"POST", path + "/projects", `{"projectId":"project_1"}`, 200},
		{"POST", "/v1/orgs/acme/projects/project_1/dictionaries", `{"dictionaryId":"` + body.Dictionary.ID + `"}`, 200},
		{"GET", "/v1/orgs/acme/projects/project_1/dictionaries/resolved?locale=en-US", "", 200},
		{"GET", "/v1/orgs/acme/projects/project_1/dictionaries", "", 200},
	} {
		rec := dictionaryRequestForTest(api, tc.method, tc.path, tc.body)
		require.Equal(t, tc.status, rec.Code, rec.Body.String())
	}
	export := dictionaryRequestForTest(api, "GET", path+"/words/export?locale=en-US", "")
	require.Equal(t, "AuthKit\nHyperlocalise\n", export.Body.String())
	detail := dictionaryRequestForTest(api, "GET", path, "")
	require.NoError(t, json.Unmarshal(detail.Body.Bytes(), &body))
	require.Equal(t, 2, body.Dictionary.WordCount)
	require.Equal(t, 3, body.Dictionary.WordsVersion)
	deleted := dictionaryRequestForTest(api, "DELETE", path, "")
	require.Equal(t, 204, deleted.Code)
	var words, attachments int
	require.NoError(t, api.pool.QueryRow(t.Context(), `select count(*) from spellcheck_dictionary_words`).Scan(&words))
	require.NoError(t, api.pool.QueryRow(t.Context(), `select count(*) from project_spellcheck_dictionaries`).Scan(&attachments))
	require.Zero(t, words)
	require.Zero(t, attachments)
}

func TestDictionaryPostgresConcurrentCapacity(t *testing.T) {
	api := dictionaryPostgresAPI(t)
	_, err := api.pool.Exec(t.Context(), `insert into spellcheck_dictionaries(id,organization_id,name) values($1,$2,'Capacity')`, testDictionaryID, testDictionaryOrgID)
	require.NoError(t, err)
	_, err = api.pool.Exec(t.Context(), `insert into spellcheck_dictionary_words(dictionary_id,locale,word,word_normalized) select $1,'en-US','Word'||n,'word'||n from generate_series(1,19999) n`, testDictionaryID)
	require.NoError(t, err)
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	for _, word := range []string{"First", "Second"} {
		wg.Go(func() {
			rec := dictionaryRequestForTest(api, "POST", testDictionaryBase+"/"+testDictionaryID+"/words", `{"locale":"en-US","word":"`+word+`"}`)
			codes <- rec.Code
		})
	}
	wg.Wait()
	close(codes)
	statuses := []int{}
	for code := range codes {
		statuses = append(statuses, code)
	}
	require.ElementsMatch(t, []int{201, 400}, statuses)
	count, err := dictionaryCount(t.Context(), api.pool, testDictionaryID)
	require.NoError(t, err)
	require.Equal(t, dictionaryMaxWords, count)
	var version int
	require.NoError(t, api.pool.QueryRow(t.Context(), `select words_version from spellcheck_dictionaries where id=$1`, testDictionaryID).Scan(&version))
	require.Equal(t, 2, version)
}
