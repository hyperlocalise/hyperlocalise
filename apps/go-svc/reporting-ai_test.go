package main

import (
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// usage inserts a billing row; tokensOf a token row that points at a parent row.
func (f reportingMoneyFixture) usage(featureID, source, operationKey string, columns map[string]any) string {
	f.t.Helper()
	if operationKey == "" {
		operationKey = "test:" + uuid.NewString()
	}
	get := func(key string, fallback any) any {
		if value, ok := columns[key]; ok {
			return value
		}
		return fallback
	}
	f.exec(`insert into usage_events (organization_id, feature_id, status, operation_key, source, job_id, model_id, credential_source, amount_usd, quantity, dimensions, created_at)
        values ($1, $2::usage_feature_id, $3::usage_event_status, $4, $5, $6, $7, $8, $9::numeric, $10, $11::jsonb, $12::timestamptz)`,
		f.scope.OrganizationID, featureID, get("status", "tracking_succeeded"), operationKey, source, get("jobId", nil), get("modelId", nil),
		get("credentialSource", nil), get("amountUsd", nil), get("quantity", 1), get("dimensions", "{}"), get("createdAt", "2026-06-10T12:00:00Z"))
	return operationKey
}

func (f reportingMoneyFixture) tokensOf(parent string, input, output int, columns map[string]any) {
	f.t.Helper()
	merged := map[string]any{"modelId": "openai/gpt-6-luna", "credentialSource": "byok", "amountUsd": "0"}
	for key, value := range columns {
		merged[key] = value
	}
	merged["dimensions"] = fmt.Sprintf(`{"input_tokens": %d, "output_tokens": %d, "parent_operation_key": "%s"}`, input, output, parent)
	f.usage("ai_tokens", "agent_runtime_complete", "", merged)
}

func aiUsage(t *testing.T, f reportingMoneyFixture, query string) map[string]any {
	t.Helper()
	return reportingReadJSON(t, f.scope, "admin", "/reports/ai-usage?"+reportingTestWeek+"&"+query)["aiUsage"].(map[string]any)
}

func aiRows(usage map[string]any, keys ...string) [][]any {
	return rowValues(usage["rows"], keys...)
}

func TestReportingAiUsageCountsTokensImagesAndVideosAndGroupsThem(t *testing.T) {
	f := seedReportingMoney(t)
	hidden := mustReportingNamedProject(t, f.scope, "rp_hidden", "Hidden")
	job := f.job("job_ai", f.scope.ProjectID, "running", false, "Release")
	hiddenJob := f.job("job_hidden", hidden, "running", false, "")
	var automation string
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `insert into workspace_automations (organization_id, name, instructions, project_id) values ($1, 'Nightly', '', $2) returning id`, f.scope.OrganizationID, f.scope.ProjectID).Scan(&automation))
	translation := f.usage("translation_jobs", "translation_job_create", "", map[string]any{"jobId": job})
	hiddenTranslation := f.usage("translation_jobs", "translation_job_create", "", map[string]any{"jobId": hiddenJob})
	chat := f.usage("agent_runs", "chat_agent_turn", "", nil)
	nightly := f.usage("agent_runs", "workspace_orchestrator", "", map[string]any{"dimensions": fmt.Sprintf(`{"automation_id": "%s"}`, automation)})
	f.tokensOf(translation, 1000, 200, map[string]any{"jobId": job})
	f.tokensOf(translation, 500, 100, map[string]any{"jobId": job, "modelId": "anthropic/claude-haiku-4.5"})
	f.tokensOf(hiddenTranslation, 9999, 9999, map[string]any{"jobId": hiddenJob})
	f.tokensOf(chat, 300, 30, nil)
	f.tokensOf(nightly, 40, 4, nil)
	f.tokensOf(translation, 7, 7, map[string]any{"jobId": job, "status": "rejected"})
	f.tokensOf(translation, 7, 7, map[string]any{"jobId": job, "createdAt": "2026-05-01T00:00:00Z"})
	// The week before: the previous period.
	f.tokensOf(translation, 11, 1, map[string]any{"jobId": job, "createdAt": "2026-06-03T00:00:00Z"})
	// Images and videos: billing reserves a row for each, and writes its token row, with the
	// charge, once it is made. A failed one leaves only its reservation.
	project := fmt.Sprintf(`{"project_id": "%s"}`, f.scope.ProjectID)
	for _, source := range []string{"project_image_variant", "project_image_variant", "project_video_variant"} {
		made := f.usage("agent_runs", source, "", map[string]any{"dimensions": project})
		f.tokensOf(made, 0, 1, map[string]any{"modelId": "google/imagen-5", "credentialSource": "gateway", "amountUsd": "0.04"})
	}
	f.usage("agent_runs", "project_image_variant", "", map[string]any{"status": "reserved", "dimensions": project})
	// Hide the other project from the admin by taking it off every team the admin is on.
	f.exec(`update projects set team_id = (select id from teams where organization_id = $1 and slug = 'default') where id = $2`, f.scope.OrganizationID, f.scope.ProjectID)

	byArea := aiUsage(t, f, "groupBy=area&projectId="+f.scope.ProjectID)
	require.Equal(t, [][]any{
		{"translation", float64(2), float64(1500)},
		{"running_automations", float64(1), float64(40)},
		{"images_and_video", float64(0), float64(0)},
	}, aiRows(byArea, "key", "calls", "inputTokens"))
	require.Equal(t, []any{}, byArea["rows"].([]any)[0].(map[string]any)["children"])
	images := byArea["rows"].([]any)[2].(map[string]any)
	require.Equal(t, float64(2), images["images"])
	require.Equal(t, float64(1), images["videos"])
	totals := byArea["totals"].(map[string]any)
	require.Equal(t, float64(3), totals["calls"])
	require.Equal(t, float64(1540), totals["inputTokens"])
	// The images' and video's own tokens count too: one each when the model reports none.
	require.Equal(t, float64(307), totals["outputTokens"])
	require.Equal(t, float64(2), totals["images"])
	require.Equal(t, float64(1), totals["videos"])
	require.Equal(t, "0.12000000", totals["chargeUsd"])
	require.Equal(t, float64(3), totals["ownKeyCalls"])
	require.Equal(t, float64(1), byArea["previous"].(map[string]any)["calls"])
	require.Equal(t, float64(11), byArea["previous"].(map[string]any)["inputTokens"])
	require.Equal(t, float64(3), byArea["totalGroups"])

	// By model, then area; by task and automation, named.
	byModel := aiUsage(t, f, "groupBy=model&thenBy=area&projectId="+f.scope.ProjectID)
	var seen [][]any
	for _, row := range byModel["rows"].([]any) {
		r := row.(map[string]any)
		var children []any
		for _, child := range r["children"].([]any) {
			children = append(children, child.(map[string]any)["key"])
		}
		seen = append(seen, []any{r["key"], r["calls"], children})
	}
	require.Equal(t, [][]any{
		{"openai/gpt-6-luna", float64(2), []any{"translation", "running_automations"}},
		{"anthropic/claude-haiku-4.5", float64(1), []any{"translation"}},
		// An image's model and key are those of the call that made it.
		{"google/imagen-5", float64(0), []any{"images_and_video"}},
	}, seen)
	require.Equal(t, [][]any{{"openai"}, {"anthropic"}, {"google"}}, aiRows(aiUsage(t, f, "groupBy=provider&projectId="+f.scope.ProjectID), "key"))
	byTask := aiUsage(t, f, "groupBy=task&projectId="+f.scope.ProjectID)
	require.Equal(t, []any{job, "Release", float64(2)}, aiRows(byTask, "key", "label", "calls")[0])
	byAutomation := aiUsage(t, f, "groupBy=automation&projectId="+f.scope.ProjectID)
	require.Equal(t, [][]any{{nil, nil, float64(2)}, {automation, "Nightly", float64(1)}}, aiRows(byAutomation, "key", "label", "calls"))
	nightlyOnly := aiUsage(t, f, "groupBy=area&automationId="+automation+"&projectId="+f.scope.ProjectID)
	require.Equal(t, "Nightly", nightlyOnly["automationName"])
	require.Equal(t, float64(1), nightlyOnly["totals"].(map[string]any)["calls"])

	// AI used outside any project counts for a billing role, and never for one project; the
	// hidden project's calls count for an admin, who opens every project.
	workspaceWide := aiUsage(t, f, "groupBy=project")
	require.Equal(t, float64(5), workspaceWide["totals"].(map[string]any)["calls"])
	require.Equal(t, [][]any{{hidden, "Hidden"}, {f.scope.ProjectID, "Docs"}, {nil, nil}}, aiRows(workspaceWide, "key", "label"))
	require.Equal(t, float64(3), aiUsage(t, f, "groupBy=area&projectId="+f.scope.ProjectID)["totals"].(map[string]any)["calls"])
}

func TestReportingAiUsageNarrowsToADetailAndKeepsTheChargeApartFromOwnKeyCalls(t *testing.T) {
	f := seedReportingMoney(t)
	call := func(columns map[string]any) {
		merged := map[string]any{"modelId": "openai/gpt-6-luna", "dimensions": fmt.Sprintf(`{"project_id": "%s", "input_tokens": 100, "output_tokens": 10}`, f.scope.ProjectID)}
		for key, value := range columns {
			merged[key] = value
		}
		source := "chat_agent_turn"
		if s, ok := columns["source"]; ok {
			source = s.(string)
		}
		f.usage("ai_tokens", source, "", merged)
	}
	call(map[string]any{"credentialSource": "gateway", "amountUsd": "0.25"})
	call(map[string]any{"credentialSource": "gateway", "amountUsd": "0.5"})
	// Charge not received from billing yet.
	call(map[string]any{"credentialSource": "gateway", "status": "tracking_pending"})
	call(map[string]any{"credentialSource": "byok", "amountUsd": "0"})
	call(map[string]any{})
	call(map[string]any{"credentialSource": "gateway", "amountUsd": "9", "source": "content_editor_ai_suggestion"})

	byKey := aiUsage(t, f, "groupBy=key&area=assistants_and_chat")
	totals := byKey["totals"].(map[string]any)
	require.Equal(t, float64(5), totals["calls"])
	require.Equal(t, "0.75000000", totals["chargeUsd"])
	require.Equal(t, float64(2), totals["unrecordedCharges"])
	require.Equal(t, float64(1), totals["ownKeyCalls"])
	require.Equal(t, [][]any{
		{"our_ai", float64(3), "0.75000000", float64(1)},
		// Equal groups in the order of their keys.
		{"not_recorded", float64(1), "0.00000000", float64(1)},
		{"own_key", float64(1), "0.00000000", float64(0)},
	}, aiRows(byKey, "key", "calls", "chargeUsd", "unrecordedCharges"))
	ownKey := aiUsage(t, f, "groupBy=area&key=own_key")["totals"].(map[string]any)
	require.Equal(t, float64(1), ownKey["calls"])
	require.Equal(t, "0.00000000", ownKey["chargeUsd"])
	editor := aiUsage(t, f, "groupBy=feature&feature=content_editor_ai_suggestion&channel=app")
	require.Equal(t, [][]any{{"content_editor_ai_suggestion", "9.00000000"}}, aiRows(editor, "key", "chargeUsd"))
}

func TestReportingAiUsageCountsCacheTokensAndRanksByTheMeasureChosen(t *testing.T) {
	f := seedReportingMoney(t)
	project := func(input, output int) string {
		return fmt.Sprintf(`{"project_id": "%s", "input_tokens": %d, "output_tokens": %d}`, f.scope.ProjectID, input, output)
	}
	// Billing's quantity is every token; input and output leave out cache and reasoning.
	f.usage("ai_tokens", "chat_agent_turn", "", map[string]any{"modelId": "anthropic/claude-haiku-4.5", "credentialSource": "gateway", "amountUsd": "0.01", "quantity": 1600, "dimensions": project(400, 200)})
	// Fewer tokens, more credit.
	f.usage("ai_tokens", "chat_agent_turn", "", map[string]any{"modelId": "openai/gpt-6-luna", "credentialSource": "gateway", "amountUsd": "0.5", "quantity": 300, "dimensions": project(200, 100)})
	byTokens := aiUsage(t, f, "groupBy=model")
	totals := byTokens["totals"].(map[string]any)
	require.Equal(t, float64(600), totals["inputTokens"])
	require.Equal(t, float64(300), totals["outputTokens"])
	require.Equal(t, float64(1000), totals["cacheAndReasoningTokens"])
	require.Equal(t, [][]any{{"anthropic/claude-haiku-4.5"}, {"openai/gpt-6-luna"}}, aiRows(byTokens, "key"))
	require.Equal(t, units(1600, 300), byTokens["series"].(map[string]any)["points"].([]any)[2].(map[string]any)["tokens"])
	byCredit := aiUsage(t, f, "groupBy=model&rankBy=charge")
	require.Equal(t, [][]any{{"openai/gpt-6-luna"}, {"anthropic/claude-haiku-4.5"}}, aiRows(byCredit, "key"))
	require.Equal(t, []any{"openai/gpt-6-luna", "anthropic/claude-haiku-4.5"}, groupKeys(byCredit["series"].(map[string]any), "key"))
	// The rows under a group follow the same measure.
	underArea := aiUsage(t, f, "groupBy=area&thenBy=model&rankBy=charge")
	var children []any
	for _, child := range underArea["rows"].([]any)[0].(map[string]any)["children"].([]any) {
		children = append(children, child.(map[string]any)["key"])
	}
	require.Equal(t, []any{"openai/gpt-6-luna", "anthropic/claude-haiku-4.5"}, children)
	// Two small runs make a third model the largest by runs.
	for range 2 {
		f.usage("ai_tokens", "chat_agent_turn", "", map[string]any{"modelId": "google/gemini-3.5-flash", "dimensions": project(1, 0)})
	}
	byRuns := aiUsage(t, f, "groupBy=model&rankBy=calls")
	require.Equal(t, []any{"google/gemini-3.5-flash", float64(2)}, aiRows(byRuns, "key", "calls")[0])
}

func TestReportingAiUsageChartsTheLargestGroupsPerDayAndFoldsTheRestIntoOther(t *testing.T) {
	f := seedReportingMoney(t)
	for i, model := range []string{"a/one", "a/two", "a/three", "a/four", "a/five", "a/six", "a/seven"} {
		// Alternate days, June 8 and 9; "one" has the most tokens.
		f.usage("ai_tokens", "chat_agent_turn", "", map[string]any{
			"modelId": model, "credentialSource": "gateway", "amountUsd": "1", "createdAt": fmt.Sprintf("2026-06-0%dT09:00:00Z", 8+i%2),
			"dimensions": fmt.Sprintf(`{"project_id": "%s", "input_tokens": %d}`, f.scope.ProjectID, 100-i),
		})
	}
	series := aiUsage(t, f, "groupBy=model")["series"].(map[string]any)
	require.Equal(t, []any{"a/one", "a/two", "a/three", "a/four", "a/five", "Other"}, groupKeys(series, "key"))
	require.Equal(t, true, series["groups"].([]any)[5].(map[string]any)["other"])
	points := series["points"].([]any)
	require.Len(t, points, 7)
	require.Equal(t, "2026-06-08", points[0].(map[string]any)["start"])
	// June 8: one, three, five and seven (Other); June 9: two, four and six (Other).
	require.Equal(t, units(100, 0, 98, 0, 96, 94), points[0].(map[string]any)["tokens"])
	require.Equal(t, units(1, 0, 1, 0, 1, 1), points[0].(map[string]any)["calls"])
	require.Equal(t, units(1, 0, 1, 0, 1, 1), points[0].(map[string]any)["chargeUsd"])
	require.Equal(t, units(0, 99, 0, 97, 0, 95), points[1].(map[string]any)["tokens"])
	// A long period is charted by week, from each week's Monday.
	weekly := reportingReadJSON(t, f.scope, "admin", "/reports/ai-usage?from=2026-04-15&to=2026-06-14&groupBy=model")["aiUsage"].(map[string]any)["series"].(map[string]any)["points"].([]any)
	require.Equal(t, "2026-04-13", weekly[0].(map[string]any)["start"])
	require.Equal(t, units(1, 1, 1, 1, 1, 2), weekly[len(weekly)-1].(map[string]any)["calls"])
}

func TestReportingAiUsagePagesGroupsKeepingEachGroupsRowsWithIt(t *testing.T) {
	f := seedReportingMoney(t)
	var jobs []string
	for i := range reportingAiPageSize + 2 {
		job := f.job(fmt.Sprintf("job_%d", i), f.scope.ProjectID, "running", false, "")
		jobs = append(jobs, job)
		for _, model := range []string{"openai/gpt-6-luna", "anthropic/claude-haiku-4.5"} {
			f.usage("ai_tokens", "chat_agent_turn", "", map[string]any{"modelId": model, "jobId": job, "credentialSource": "gateway", "amountUsd": "0.000000005", "dimensions": fmt.Sprintf(`{"input_tokens": %d}`, 1000-i)})
		}
	}
	first := aiUsage(t, f, "groupBy=task&thenBy=model")
	require.Equal(t, float64(reportingAiPageSize+2), first["totalGroups"])
	require.Len(t, first["rows"], reportingAiPageSize)
	require.Equal(t, []any{jobs[0], float64(2)}, aiRows(first, "key", "calls")[0])
	require.Len(t, first["rows"].([]any)[0].(map[string]any)["children"], 2)
	second := aiUsage(t, f, "groupBy=task&thenBy=model&page=2")
	require.Equal(t, [][]any{{jobs[len(jobs)-2]}, {jobs[len(jobs)-1]}}, aiRows(second, "key"))
	for _, row := range second["rows"].([]any) {
		require.Len(t, row.(map[string]any)["children"], 2)
	}
	// A page past the end still says how many groups there are.
	past := aiUsage(t, f, "groupBy=task&thenBy=model&page=9")
	require.Equal(t, []any{}, past["rows"])
	require.Equal(t, float64(reportingAiPageSize+2), past["totalGroups"])
	// The largest rows under a group, and the rest as one "Other"; a download has every row.
	luna := aiUsage(t, f, "groupBy=model&thenBy=task")["rows"].([]any)[0].(map[string]any)
	children := luna["children"].([]any)
	require.Len(t, children, reportingAiChildRows+1)
	for i := range reportingAiChildRows {
		require.Equal(t, jobs[i], children[i].(map[string]any)["key"])
	}
	other := children[reportingAiChildRows].(map[string]any)
	require.Nil(t, other["key"])
	require.Equal(t, true, other["other"])
	require.Equal(t, float64(len(jobs)-reportingAiChildRows), other["calls"])
	// The 42 rows' own credit, 42 × 0.000000005, rounded once.
	require.Equal(t, "0.00000021", other["chargeUsd"])
	lines := reportingReadCSV(t, f.scope, "admin", "/reports/ai-usage?"+reportingTestWeek+"&groupBy=model&thenBy=task&format=csv")
	require.Equal(t, `"model","jobId","jobTitle","calls","inputTokens","outputTokens","cacheAndReasoningTokens","images","videos","chargeUsd","unrecordedCharges","ownKeyCalls"`, lines[0])
	require.Len(t, lines, 1+2*len(jobs))
}

func TestReportingAiUsagePlacesAnAutomationsToolStepsInTheAutomation(t *testing.T) {
	f := seedReportingMoney(t)
	var automation, run string
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `insert into workspace_automations (organization_id, name, instructions, project_id) values ($1, 'Repo sync', '', $2) returning id`, f.scope.OrganizationID, f.scope.ProjectID).Scan(&automation))
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `insert into workspace_automation_runs (organization_id, automation_id, trigger_source) values ($1, $2, 'manual') returning id`, f.scope.OrganizationID, automation).Scan(&run))
	// The main run records its automation; the GitHub step records only the run, in its key.
	main := f.usage("agent_runs", "workspace_orchestrator", "workspace-automation:"+run+":agent_runs", map[string]any{"dimensions": fmt.Sprintf(`{"automation_id": "%s"}`, automation)})
	github := f.usage("agent_runs", "workspace_github_repository_agent", "workspace-github-repo:"+run+":agent_runs", nil)
	f.tokensOf(main, 10, 1, nil)
	f.tokensOf(github, 500, 50, nil)
	byAutomation := aiUsage(t, f, "groupBy=automation&thenBy=feature")
	require.Equal(t, [][]any{{automation, float64(2), float64(510)}}, aiRows(byAutomation, "key", "calls", "inputTokens"))
	require.Equal(t, [][]any{{"workspace_github_repository_agent", float64(1)}, {"workspace_orchestrator", float64(1)}}, rowValues(byAutomation["rows"].([]any)[0].(map[string]any)["children"], "key", "calls"))
	narrowed := aiUsage(t, f, "groupBy=area&automationId="+automation)
	require.Equal(t, float64(2), narrowed["totals"].(map[string]any)["calls"])
	require.Equal(t, "Repo sync", narrowed["automationName"])
	require.Equal(t, float64(0), aiUsage(t, f, "groupBy=area&jobId=job_elsewhere")["totals"].(map[string]any)["calls"])
}

func TestReportingAiUsageCountsBillingRowsOnlyFromWhenReportsStarted(t *testing.T) {
	f := seedReportingMoney(t)
	f.exec(`delete from reporting_workspaces where organization_id = $1`, f.scope.OrganizationID)
	for _, at := range []string{"2026-06-10T11:59:00Z", "2026-06-10T12:00:00Z", "2026-06-10T12:01:00Z"} {
		f.usage("ai_tokens", "chat_agent_turn", "", map[string]any{"credentialSource": "gateway", "amountUsd": "1", "createdAt": at, "dimensions": fmt.Sprintf(`{"project_id": "%s", "input_tokens": 100}`, f.scope.ProjectID)})
	}
	// Before Reports has started, nothing, in Costs either.
	require.Equal(t, float64(0), aiUsage(t, f, "groupBy=area")["totals"].(map[string]any)["calls"])
	require.Equal(t, "0.00000000", reportingReadJSON(t, f.scope, "admin", "/reports/costs?"+reportingTestWeek)["costs"].(map[string]any)["totals"].(map[string]any)["aiUsd"])
	// From the moment it started, that moment included.
	f.exec(`insert into reporting_workspaces (organization_id, started_at) values ($1, '2026-06-10T12:00:00Z')`, f.scope.OrganizationID)
	started := aiUsage(t, f, "groupBy=area")["totals"].(map[string]any)
	require.Equal(t, float64(2), started["calls"])
	require.Equal(t, "2.00000000", started["chargeUsd"])
	require.Equal(t, "2.00000000", reportingReadJSON(t, f.scope, "admin", "/reports/costs?"+reportingTestWeek)["costs"].(map[string]any)["totals"].(map[string]any)["aiUsd"])

	// A fractional or unreadable token count is read without failing.
	f.usage("ai_tokens", "chat_agent_turn", "", map[string]any{"dimensions": fmt.Sprintf(`{"input_tokens": "12.5", "output_tokens": 3, "project_id": "%s"}`, f.scope.ProjectID)})
	f.usage("ai_tokens", "chat_agent_turn", "", map[string]any{"dimensions": fmt.Sprintf(`{"input_tokens": "many", "output_tokens": null, "project_id": "%s"}`, f.scope.ProjectID)})
	odd := aiUsage(t, f, "groupBy=area")["totals"].(map[string]any)
	require.Equal(t, float64(4), odd["calls"])
	require.Equal(t, float64(212.5), odd["inputTokens"])
	require.Equal(t, float64(3), odd["outputTokens"])
}

func TestReportingAiUsageRefusesMalformedQueries(t *testing.T) {
	f := seedReportingMoney(t)
	for _, query := range []string{"groupBy=model&thenBy=model", "area=everything", "rankBy=cost", "key=", "page=0"} {
		status, body := reportingSend(t, f.scope, "admin", "GET", "/reports/ai-usage?"+query, "")
		require.Equal(t, 400, status, query)
		require.Equal(t, "invalid_report_query", body["error"], query)
	}
	empty := reportingReadJSON(t, f.scope, "admin", "/reports/ai-usage?groupBy=model&thenBy=area")["aiUsage"].(map[string]any)
	require.Equal(t, []any{}, empty["rows"])
	require.Equal(t, "model", empty["groupBy"])
	require.Equal(t, "area", empty["thenBy"])
	require.Equal(t, float64(0), empty["totals"].(map[string]any)["calls"])
	require.Nil(t, empty["automationName"])
}
