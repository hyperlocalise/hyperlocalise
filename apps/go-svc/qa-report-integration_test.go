package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

const (
	testQaReportBase      = "/v1/orgs/acme/qa-reports"
	testQaNativeProjectID = "project_native_qa"
	testQaProviderProject = "project_provider_qa"
)

func qaReportTestDatabaseURL() string {
	if url := os.Getenv("QA_REPORT_TEST_DATABASE_URL"); url != "" {
		return url
	}
	return os.Getenv("DICTIONARY_TEST_DATABASE_URL")
}

func qaReportPostgresAPI(t *testing.T) *qaReportAPI {
	t.Helper()
	databaseURL := qaReportTestDatabaseURL()
	if databaseURL == "" {
		t.Skip("set QA_REPORT_TEST_DATABASE_URL or DICTIONARY_TEST_DATABASE_URL to run PostgreSQL QA report integration tests")
	}
	ctx := t.Context()
	admin, err := pgxpool.New(ctx, databaseURL)
	require.NoError(t, err)
	schemaName := "qa_report_test_" + uuid.NewString()
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
        create table users(id uuid primary key, workos_user_id text not null);
        create table organizations(id uuid primary key, workos_organization_id text, slug text, lifecycle_status text);
        create table organization_memberships(user_id uuid, organization_id uuid, workos_membership_id text);
        create table projects(
            id text primary key,
            organization_id uuid not null references organizations(id),
            name text not null,
            source text not null default 'native',
            identifier text not null,
            issue_number_seq integer not null default 0,
            qa_scan_cadence text not null default 'off',
            qa_scan_last_run_at timestamptz
        );
        create table translation_qa_runs(
            id uuid primary key,
            organization_id uuid not null references organizations(id),
            project_id text not null references projects(id) on delete cascade,
            trigger text not null,
            status text not null,
            segment_count integer not null default 0,
            finding_count integer not null default 0,
            error_count integer not null default 0,
            warning_count integer not null default 0,
            summary jsonb not null default '{}'::jsonb,
            started_at timestamptz,
            completed_at timestamptz,
            created_at timestamptz not null default now()
        );
        create table translation_qa_findings(
            id uuid primary key,
            run_id uuid not null references translation_qa_runs(id) on delete cascade,
            organization_id uuid not null references organizations(id),
            project_id text not null references projects(id) on delete cascade,
            key text not null,
            target_locale text not null,
            check_type text not null,
            severity text not null,
            category text not null,
            message text not null,
            related_tokens jsonb not null default '[]'::jsonb,
            source_text text not null,
            target_text text not null,
            source_path text,
            created_at timestamptz not null default now()
        );
        create table issue_sheet_issues(
            id uuid primary key default gen_random_uuid(),
            organization_id uuid not null references organizations(id),
            project_id text not null references projects(id) on delete cascade,
            number integer not null,
            identifier text not null,
            title text not null,
            description text not null default '',
            issue_type text not null default 'general_question',
            status text not null default 'open',
            target_locale text,
            source_path text,
            segment_id text,
            translation_key_id uuid,
            link_kind text,
            link_url text,
            external_ref text,
            template_key text,
            metadata jsonb not null default '{}'::jsonb,
            reporter_user_id uuid references users(id),
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now(),
            unique(project_id, number),
            unique(project_id, identifier),
            unique(project_id, external_ref)
        );
        create table issue_sheet_columns(
            id uuid primary key default gen_random_uuid(),
            organization_id uuid not null references organizations(id),
            project_id text not null references projects(id) on delete cascade,
            key text not null,
            label text not null,
            layer text not null,
            type text not null,
            config jsonb not null default '{}'::jsonb,
            sort_order integer not null default 0,
            created_by_user_id uuid references users(id),
            unique(project_id, key)
        );
        create table issue_sheet_row_values(
            id uuid primary key default gen_random_uuid(),
            organization_id uuid not null references organizations(id),
            project_id text not null references projects(id) on delete cascade,
            issue_id uuid not null references issue_sheet_issues(id) on delete cascade,
            column_id uuid not null references issue_sheet_columns(id) on delete cascade,
            value jsonb,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now(),
            unique(issue_id, column_id)
        );
        create table issue_sheet_activities(
            id uuid primary key default gen_random_uuid(),
            organization_id uuid not null references organizations(id),
            project_id text not null references projects(id) on delete cascade,
            issue_id uuid not null references issue_sheet_issues(id) on delete cascade,
            actor_user_id uuid references users(id),
            type text not null,
            payload jsonb not null default '{}'::jsonb,
            created_at timestamptz not null default now()
        );
        create table issue_sheet_subscriptions(
            id uuid primary key default gen_random_uuid(),
            organization_id uuid not null references organizations(id),
            project_id text not null references projects(id) on delete cascade,
            issue_id uuid not null references issue_sheet_issues(id) on delete cascade,
            user_id uuid not null references users(id),
            unique(issue_id, user_id)
        );
    `)
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `insert into users values($1,'user_live')`, testDictionaryUserID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `insert into organizations values($1,'org_live','acme','active')`, testDictionaryOrgID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `insert into organization_memberships values($1,$2,'om_live')`, testDictionaryUserID, testDictionaryOrgID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `insert into projects(id,organization_id,name,source,identifier) values
        ($1,$2,'Native QA','native','HL'),
        ($3,$2,'Provider QA','external_tms','PR')`,
		testQaNativeProjectID, testDictionaryOrgID, testQaProviderProject)
	require.NoError(t, err)

	return &qaReportAPI{
		pool: pool,
		membership: func(context.Context, string) (*workos.UserOrganizationMembership, error) {
			return &workos.UserOrganizationMembership{
				ID: "om_live", UserID: "user_live", OrganizationID: "org_live", Status: "active",
				Role: &workos.SlimRole{Slug: "admin"},
			}, nil
		},
	}
}

func qaReportRequestForTest(api *qaReportAPI, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestQaReportPostgresWorkspaceLifecycle(t *testing.T) {
	api := qaReportPostgresAPI(t)
	ctx := t.Context()

	runID := uuid.New()
	findingID := uuid.New()
	_, err := api.pool.Exec(ctx, `
        insert into translation_qa_runs(
            id, organization_id, project_id, trigger, status, finding_count, error_count, warning_count, summary, completed_at
        ) values ($1,$2,$3,'manual','succeeded',1,1,0,'{"byCheckType":{"not_localized":1},"bySeverity":{"error":1},"byLocale":{"de-DE":1}}'::jsonb,now())`,
		runID, testDictionaryOrgID, testQaNativeProjectID)
	require.NoError(t, err)
	_, err = api.pool.Exec(ctx, `
        insert into translation_qa_findings(
            id, run_id, organization_id, project_id, key, target_locale, check_type, severity, category, message, source_text, target_text
        ) values ($1,$2,$3,$4,'promote-me','de-DE','not_localized','error','missing','Target is empty','Hello','')`,
		findingID, runID, testDictionaryOrgID, testQaNativeProjectID)
	require.NoError(t, err)

	list := qaReportRequestForTest(api, http.MethodGet, testQaReportBase, "")
	require.Equal(t, http.StatusOK, list.Code, list.Body.String())
	var listBody struct {
		Reports []struct {
			ProjectID string `json:"projectId"`
			Report    *struct {
				Status       string `json:"status"`
				FindingCount int    `json:"findingCount"`
			} `json:"report"`
		} `json:"reports"`
	}
	require.NoError(t, json.Unmarshal(list.Body.Bytes(), &listBody))
	require.Len(t, listBody.Reports, 1)
	require.Equal(t, testQaNativeProjectID, listBody.Reports[0].ProjectID)
	require.Equal(t, "succeeded", listBody.Reports[0].Report.Status)
	require.Equal(t, 1, listBody.Reports[0].Report.FindingCount)

	findings := qaReportRequestForTest(api, http.MethodGet, testQaReportBase+"/findings?projectId="+testQaNativeProjectID, "")
	require.Equal(t, http.StatusOK, findings.Code)
	var findingsBody struct {
		Findings []struct {
			ID          string `json:"id"`
			ProjectName string `json:"projectName"`
			EditorHref  string `json:"editorHref"`
		} `json:"findings"`
		Total int `json:"total"`
	}
	require.NoError(t, json.Unmarshal(findings.Body.Bytes(), &findingsBody))
	require.Equal(t, 1, findingsBody.Total)
	require.Equal(t, findingID.String(), findingsBody.Findings[0].ID)
	require.Equal(t, "Native QA", findingsBody.Findings[0].ProjectName)
	require.Contains(t, findingsBody.Findings[0].EditorHref, testQaNativeProjectID)

	promote := qaReportRequestForTest(api, http.MethodPost, testQaReportBase+"/findings/promote",
		`{"findingIds":["`+findingID.String()+`"]}`)
	require.Equal(t, http.StatusOK, promote.Code, promote.Body.String())
	var promoteBody struct {
		Results []struct {
			Created    bool   `json:"created"`
			Identifier string `json:"identifier"`
		} `json:"results"`
	}
	require.NoError(t, json.Unmarshal(promote.Body.Bytes(), &promoteBody))
	require.Len(t, promoteBody.Results, 1)
	require.True(t, promoteBody.Results[0].Created)
	firstIdentifier := promoteBody.Results[0].Identifier

	promoteAgain := qaReportRequestForTest(api, http.MethodPost, testQaReportBase+"/findings/promote",
		`{"findingIds":["`+findingID.String()+`"]}`)
	require.Equal(t, http.StatusOK, promoteAgain.Code)
	require.NoError(t, json.Unmarshal(promoteAgain.Body.Bytes(), &promoteBody))
	require.False(t, promoteBody.Results[0].Created)
	require.Equal(t, firstIdentifier, promoteBody.Results[0].Identifier)

	var issueCount int
	require.NoError(t, api.pool.QueryRow(ctx, `select count(*) from issue_sheet_issues where project_id=$1`, testQaNativeProjectID).Scan(&issueCount))
	require.Equal(t, 1, issueCount)
}

func TestQaReportPostgresStaleFindingPromote(t *testing.T) {
	api := qaReportPostgresAPI(t)
	ctx := t.Context()

	latestRun := uuid.New()
	staleRun := uuid.New()
	findingID := uuid.New()
	_, err := api.pool.Exec(ctx, `
        insert into translation_qa_runs(id, organization_id, project_id, trigger, status, summary, completed_at, created_at)
        values
            ($1,$2,$3,'manual','succeeded','{}'::jsonb,now() - interval '2 hours',now() - interval '2 hours'),
            ($4,$2,$3,'manual','succeeded','{}'::jsonb,now(),now())`,
		staleRun, testDictionaryOrgID, testQaNativeProjectID, latestRun)
	require.NoError(t, err)
	_, err = api.pool.Exec(ctx, `
        insert into translation_qa_findings(
            id, run_id, organization_id, project_id, key, target_locale, check_type, severity, category, message, source_text, target_text
        ) values ($1,$2,$3,$4,'stale','de-DE','not_localized','error','missing','','Hello','')`,
		findingID, staleRun, testDictionaryOrgID, testQaNativeProjectID)
	require.NoError(t, err)

	rec := qaReportRequestForTest(api, http.MethodPost, testQaReportBase+"/findings/promote",
		`{"findingIds":["`+findingID.String()+`"]}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "qa_finding_stale", body["error"])
}
