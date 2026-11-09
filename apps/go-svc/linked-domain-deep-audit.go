package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/tmsauth"
)

const (
	deepAuditPageLimit         = 100
	deepAuditListLimit         = 20
	deepAuditFindingsLimit     = 50
	deepAuditFindingsMaxLimit  = 200
	deepAuditPagesLimit        = 500
	deepAuditStartTimeout      = 15 * time.Second
	deepAuditStartPathTemplate = "/api/internal/deep-audits/%s/start"
)

// deepAuditStarter asks the web app to start the deep audit workflow for a
// queued run. The workflow runtime lives in the web app.
type deepAuditStarter interface {
	StartDeepAudit(ctx context.Context, runID string) error
}

type webDeepAuditStarter struct {
	client *http.Client
}

func (s webDeepAuditStarter) StartDeepAudit(ctx context.Context, runID string) error {
	baseURL := strings.TrimRight(tmsauth.BaseURLFromEnv(), "/")
	if baseURL == "" {
		return fmt.Errorf("deep audit: missing web base URL")
	}
	ctx, cancel := context.WithTimeout(ctx, deepAuditStartTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+fmt.Sprintf(deepAuditStartPathTemplate, runID), nil)
	if err != nil {
		return err
	}
	req.Header.Set(serverCallTokenHeader, serverCallToken())
	client := s.client
	if client == nil {
		client = &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<16))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("deep audit: start returned HTTP %d", resp.StatusCode)
	}
	return nil
}

func (api *linkedDomainAPI) registerDeepAudits(route func(string, func(workspaceActor) bool, func(*http.Request, workspaceActor) (any, int, error)), read, write func(workspaceActor) bool) {
	base := linkedDomainBase + "/{linkedDomainId}/deep-audits"
	route("GET "+base, read, api.listDeepAudits)
	route("POST "+base, write, api.startDeepAudit)
	route("GET "+base+"/{runId}", read, api.getDeepAudit)
	route("GET "+base+"/{runId}/pages", read, api.listDeepAuditPages)
	route("DELETE "+base+"/{runId}", write, api.cancelDeepAudit)
}

const deepAuditRunColumns = `id,linked_domain_id,status,trigger,page_limit,pages_discovered,pages_rendered,score,dimension_scores,summary,previous_run_id,error_code,error_message,started_at,completed_at,created_at`

type deepAuditRun struct {
	ID              string
	LinkedDomainID  string
	Status          string
	Trigger         string
	PageLimit       int
	PagesDiscovered int
	PagesRendered   int
	Score           *int
	DimensionScores []byte
	Summary         []byte
	PreviousRunID   *string
	ErrorCode       *string
	ErrorMessage    *string
	StartedAt       *time.Time
	CompletedAt     *time.Time
	CreatedAt       time.Time
}

func scanDeepAuditRun(row rowScanner) (deepAuditRun, error) {
	var run deepAuditRun
	err := row.Scan(&run.ID, &run.LinkedDomainID, &run.Status, &run.Trigger, &run.PageLimit, &run.PagesDiscovered, &run.PagesRendered, &run.Score, &run.DimensionScores, &run.Summary, &run.PreviousRunID, &run.ErrorCode, &run.ErrorMessage, &run.StartedAt, &run.CompletedAt, &run.CreatedAt)
	return run, err
}

func rawJSON(value []byte) any {
	if len(value) == 0 {
		return nil
	}
	return json.RawMessage(value)
}

func (run deepAuditRun) public(includeSummary bool) map[string]any {
	out := map[string]any{
		"id": run.ID, "linkedDomainId": run.LinkedDomainID, "status": run.Status, "trigger": run.Trigger,
		"pageLimit": run.PageLimit, "pagesDiscovered": run.PagesDiscovered, "pagesRendered": run.PagesRendered,
		"score": run.Score, "dimensionScores": rawJSON(run.DimensionScores), "summary": nil,
		"previousRunId": run.PreviousRunID, "errorCode": run.ErrorCode, "errorMessage": run.ErrorMessage,
		"startedAt": isoTime(run.StartedAt), "completedAt": isoTime(run.CompletedAt), "createdAt": isoTime(&run.CreatedAt),
	}
	if includeSummary {
		out["summary"] = rawJSON(run.Summary)
	}
	return out
}

func (api *linkedDomainAPI) starter() deepAuditStarter {
	if api.deepAudits != nil {
		return api.deepAudits
	}
	return webDeepAuditStarter{}
}

func (api *linkedDomainAPI) startDeepAudit(r *http.Request, a workspaceActor) (any, int, error) {
	d, err := api.load(r.Context(), a, r.PathValue("linkedDomainId"))
	if err != nil {
		return nil, 0, err
	}
	if d.Status != "verified" {
		return nil, 0, workspaceFailure(409, "linked_domain_not_verified", "Verify the domain before running a deep audit.")
	}
	run, err := scanDeepAuditRun(api.workspace.pool.QueryRow(r.Context(), `insert into localisation_deep_audits(organization_id,linked_domain_id,requested_by_user_id,page_limit) values($1,$2,$3,$4) returning `+deepAuditRunColumns, a.organizationID, d.ID, a.userID, deepAuditPageLimit))
	if isUniqueViolation(err) {
		return nil, 0, workspaceFailure(409, "deep_audit_in_progress", "A deep audit is already running for this domain.")
	}
	if err != nil {
		return nil, 0, err
	}
	if err := api.starter().StartDeepAudit(r.Context(), run.ID); err != nil {
		// Use a fresh context: the request context may be the one that expired.
		ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
		defer cancel()
		_, _ = api.workspace.pool.Exec(ctx, `update localisation_deep_audits set status='failed',error_code='deep_audit_start_failed',error_message='The deep audit could not be started. Try again.',completed_at=now(),updated_at=now() where id=$1 and status='queued'`, run.ID)
		return nil, 0, workspaceFailure(503, "deep_audit_start_failed", "The deep audit could not be started. Try again.")
	}
	return map[string]any{"deepAudit": run.public(false)}, http.StatusAccepted, nil
}

func (api *linkedDomainAPI) listDeepAudits(r *http.Request, a workspaceActor) (any, int, error) {
	d, err := api.load(r.Context(), a, r.PathValue("linkedDomainId"))
	if err != nil {
		return nil, 0, err
	}
	rows, err := api.workspace.pool.Query(r.Context(), `select `+deepAuditRunColumns+` from localisation_deep_audits where linked_domain_id=$1 and organization_id=$2 order by created_at desc limit $3`, d.ID, a.organizationID, deepAuditListLimit)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	result := []map[string]any{}
	for rows.Next() {
		run, err := scanDeepAuditRun(rows)
		if err != nil {
			return nil, 0, err
		}
		item := run.public(false)
		item["diff"] = deepAuditSummaryField(run.Summary, "diff")
		item["findingsCount"] = deepAuditSummaryField(run.Summary, "findingsCount")
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"deepAudits": result}, 200, nil
}

func deepAuditSummaryField(summary []byte, field string) any {
	if len(summary) == 0 {
		return nil
	}
	var parsed map[string]json.RawMessage
	if err := json.Unmarshal(summary, &parsed); err != nil {
		return nil
	}
	if value, ok := parsed[field]; ok {
		return value
	}
	return nil
}

func (api *linkedDomainAPI) loadDeepAudit(r *http.Request, a workspaceActor) (deepAuditRun, error) {
	d, err := api.load(r.Context(), a, r.PathValue("linkedDomainId"))
	if err != nil {
		return deepAuditRun{}, err
	}
	runID := r.PathValue("runId")
	if _, err := uuid.Parse(runID); err != nil {
		return deepAuditRun{}, workspaceFailure(404, "deep_audit_not_found", "Deep audit was not found.")
	}
	run, err := scanDeepAuditRun(api.workspace.pool.QueryRow(r.Context(), `select `+deepAuditRunColumns+` from localisation_deep_audits where id=$1 and linked_domain_id=$2 and organization_id=$3`, runID, d.ID, a.organizationID))
	if isNoRows(err) {
		return run, workspaceFailure(404, "deep_audit_not_found", "Deep audit was not found.")
	}
	return run, err
}

type deepAuditFindingFilter struct {
	creditID    string
	severity    string
	templateKey string
	locale      string
	diff        string
	limit       int
	offset      int
}

func parseDeepAuditFindingFilter(r *http.Request) (deepAuditFindingFilter, error) {
	q := r.URL.Query()
	filter := deepAuditFindingFilter{
		creditID:    strings.TrimSpace(q.Get("creditId")),
		severity:    strings.TrimSpace(q.Get("severity")),
		templateKey: strings.TrimSpace(q.Get("templateKey")),
		locale:      strings.TrimSpace(q.Get("locale")),
		diff:        strings.TrimSpace(q.Get("diff")),
		limit:       deepAuditFindingsLimit,
	}
	switch filter.diff {
	case "", "new", "unchanged", "fixed":
	default:
		return filter, workspaceFailure(400, "invalid_diff_filter", "diff must be new, unchanged or fixed.")
	}
	if raw := strings.TrimSpace(q.Get("limit")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > deepAuditFindingsMaxLimit {
			return filter, workspaceFailure(400, "invalid_limit", fmt.Sprintf("limit must be between 1 and %d.", deepAuditFindingsMaxLimit))
		}
		filter.limit = value
	}
	if raw := strings.TrimSpace(q.Get("offset")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 0 {
			return filter, workspaceFailure(400, "invalid_offset", "offset must be zero or more.")
		}
		filter.offset = value
	}
	return filter, nil
}

const deepAuditFindingColumns = `id,credit_id,dimension,severity,title,summary,url,template_key,locale,location,evidence,advice,confidence`

// deepAuditFindingsQuery selects findings for a run. Fixed findings are the
// previous run's findings whose fingerprint is absent from this run.
func deepAuditFindingsQuery(run deepAuditRun, filter deepAuditFindingFilter) (string, []any) {
	args := []any{}
	arg := func(value any) string {
		args = append(args, value)
		return "$" + strconv.Itoa(len(args))
	}
	var where []string
	diffExpr := "f.diff_state"
	if filter.diff == "fixed" {
		previous := ""
		if run.PreviousRunID != nil {
			previous = *run.PreviousRunID
		}
		where = append(where, "f.run_id="+arg(previous), "not exists(select 1 from localisation_deep_audit_findings c where c.run_id="+arg(run.ID)+" and c.fingerprint=f.fingerprint)")
		diffExpr = "'fixed'"
	} else {
		where = append(where, "f.run_id="+arg(run.ID))
		if filter.diff != "" {
			where = append(where, "f.diff_state="+arg(filter.diff))
		}
	}
	if filter.creditID != "" {
		where = append(where, "f.credit_id="+arg(filter.creditID))
	}
	if filter.severity != "" {
		where = append(where, "f.severity="+arg(filter.severity))
	}
	if filter.templateKey != "" {
		where = append(where, "f.template_key="+arg(filter.templateKey))
	}
	if filter.locale != "" {
		where = append(where, "f.locale="+arg(filter.locale))
	}
	columns := "f." + strings.ReplaceAll(deepAuditFindingColumns, ",", ",f.")
	query := `select ` + columns + `,` + diffExpr + `,count(*) over() from localisation_deep_audit_findings f where ` + strings.Join(where, " and ") +
		` order by case f.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, f.credit_id, f.url nulls last, f.id limit ` + arg(filter.limit) + ` offset ` + arg(filter.offset)
	return query, args
}

func (api *linkedDomainAPI) getDeepAudit(r *http.Request, a workspaceActor) (any, int, error) {
	run, err := api.loadDeepAudit(r, a)
	if err != nil {
		return nil, 0, err
	}
	filter, err := parseDeepAuditFindingFilter(r)
	if err != nil {
		return nil, 0, err
	}
	findings := []map[string]any{}
	total := 0
	if filter.diff != "fixed" || run.PreviousRunID != nil {
		query, args := deepAuditFindingsQuery(run, filter)
		rows, err := api.workspace.pool.Query(r.Context(), query, args...)
		if err != nil {
			return nil, 0, err
		}
		defer rows.Close()
		for rows.Next() {
			var id, creditID, dimension, severity, title, summary, diffState string
			var url, templateKey, locale, location, evidence, advice *string
			var confidence *int
			if err := rows.Scan(&id, &creditID, &dimension, &severity, &title, &summary, &url, &templateKey, &locale, &location, &evidence, &advice, &confidence, &diffState, &total); err != nil {
				return nil, 0, err
			}
			findings = append(findings, map[string]any{
				"id": id, "creditId": creditID, "dimension": dimension, "severity": severity, "title": title, "summary": summary,
				"url": url, "templateKey": templateKey, "locale": locale, "location": location, "evidence": evidence, "advice": advice,
				"confidence": confidence, "diffState": diffState,
			})
		}
		if err := rows.Err(); err != nil {
			return nil, 0, err
		}
	}
	return map[string]any{
		"deepAudit":     run.public(true),
		"findings":      findings,
		"findingsTotal": total,
		"limit":         filter.limit,
		"offset":        filter.offset,
	}, 200, nil
}

func (api *linkedDomainAPI) listDeepAuditPages(r *http.Request, a workspaceActor) (any, int, error) {
	run, err := api.loadDeepAudit(r, a)
	if err != nil {
		return nil, 0, err
	}
	rows, err := api.workspace.pool.Query(r.Context(), `select id,url,final_url,http_status,locale,template_key from localisation_deep_audit_pages where run_id=$1 order by template_key, url limit $2`, run.ID, deepAuditPagesLimit)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	pages := []map[string]any{}
	for rows.Next() {
		var id, url, finalURL, templateKey string
		var status int
		var locale *string
		if err := rows.Scan(&id, &url, &finalURL, &status, &locale, &templateKey); err != nil {
			return nil, 0, err
		}
		pages = append(pages, map[string]any{"id": id, "url": url, "finalUrl": finalURL, "httpStatus": status, "locale": locale, "templateKey": templateKey})
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"pages": pages}, 200, nil
}

func (api *linkedDomainAPI) cancelDeepAudit(r *http.Request, a workspaceActor) (any, int, error) {
	run, err := api.loadDeepAudit(r, a)
	if err != nil {
		return nil, 0, err
	}
	updated, err := scanDeepAuditRun(api.workspace.pool.QueryRow(r.Context(), `update localisation_deep_audits set status='cancelled',completed_at=now(),updated_at=now() where id=$1 and status in ('queued','crawling','scoring') returning `+deepAuditRunColumns, run.ID))
	if isNoRows(err) {
		return nil, 0, workspaceFailure(409, "deep_audit_not_running", "This deep audit has already finished.")
	}
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"deepAudit": updated.public(false)}, 200, nil
}
