package main

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
)

// AI usage for the Reports page, from billing's records (usage_events): calls, tokens, images
// and videos, and billing's charge for calls through our AI gateway, grouped by one detail and
// optionally a second, with the period before for the headline numbers and a chart over time.
// The charge is billing's actual charge, never an estimate; calls on the workspace's own
// provider key use no plan credit and are counted apart.

const (
	// Groups per page of the table.
	reportingAiPageSize = 50
	// The chart stacks this many of the largest groups, and the rest as one "Other".
	reportingAiChartGroups = 5
	// Rows under each group of the table, the rest shown as one "Other" row.
	reportingAiChildRows = 10
)

var (
	reportingAiOrigins    = []string{"translation", "review_and_qa", "images_and_video", "assistants_and_chat", "building_automations", "running_automations", "other"}
	reportingAiChannels   = []string{"app", "api", "slack", "email", "web_chat", "github", "gitlab", "contentful", "connected_tms", "automation"}
	reportingAiKeyTypes   = []string{"our_ai", "own_key", "not_recorded"}
	reportingAiDimensions = []string{"area", "feature", "model", "provider", "channel", "key", "project", "task", "automation"}
	reportingAiMeasures   = []string{"tokens", "calls", "charge"}
	// Sources of billing rows that each stand for one image or one video made.
	reportingAiImageSources = []string{"project_image_variant", "project_image_url_translation", "slack_image_localization", "email_image_localization", "contentful_image_localization"}
	reportingAiVideoSources = []string{"project_video_variant", "project_video_url_translation"}
	// The column of the usage rows holding each detail.
	reportingAiColumns = map[string]string{
		"area": "area", "feature": "feature", "model": "model", "provider": "provider", "channel": "channel",
		"key": "key_type", "project": "project", "task": "task", "automation": "automation",
	}
)

// reportingSourceRule places a billing source: the whole name, or a name's start. Rules are
// tried in order, the same rules as the web app's ai-usage-origins.ts.
type reportingSourceRule struct {
	exact, prefix, result string
}

// reportingAiOriginRules place a source other than a connected TMS's agent run, after the media
// sources: the web app's ORIGIN_BY_SOURCE in its order, then the automations prefix.
var reportingAiOriginRules = []reportingSourceRule{
	{exact: "translation_job_create", result: "translation"},
	{exact: "email_translation_job_create", result: "translation"},
	{exact: "contentful_agent", result: "translation"},
	{exact: "contentful_field_translation", result: "translation"},
	{exact: "content_editor_ai_suggestion", result: "translation"},
	{exact: "content_editor_document_regenerate", result: "translation"},
	{exact: "chat_agent_turn", result: "assistants_and_chat"},
	{exact: "chat_translate_string", result: "assistants_and_chat"},
	{exact: "web_chat_agent_turn", result: "assistants_and_chat"},
	{exact: "slack_agent_turn", result: "assistants_and_chat"},
	{exact: "project_file_string_context_lookup", result: "assistants_and_chat"},
	{exact: "repository_agent_workflow", result: "assistants_and_chat"},
	{exact: "automation_assistant_turn", result: "building_automations"},
	{exact: "visual_workflow_ai_step", result: "running_automations"},
	{exact: "github_repository_commit_review", result: "review_and_qa"},
	{exact: "github_pull_request_review", result: "review_and_qa"},
	{exact: "image_text_extraction", result: "images_and_video"},
	{prefix: "workspace_", result: "running_automations"},
}

// reportingAiAgentRunKinds are the origins of agent runs on tasks from a connected TMS.
var reportingAiAgentRunKinds = []reportingSourceRule{
	{exact: "translate", result: "translation"},
	{exact: "review", result: "review_and_qa"},
	{exact: "qa_fix", result: "review_and_qa"},
	{exact: "glossary_suggestion", result: "review_and_qa"},
	{exact: "comment_only", result: "review_and_qa"},
}

// reportingAiChannelRules say how a call reached us; a source no rule names came through the app
// or the API.
var reportingAiChannelRules = []reportingSourceRule{
	{prefix: "slack_", result: "slack"},
	{prefix: "email_", result: "email"},
	{prefix: "contentful_", result: "contentful"},
	{exact: "web_chat_agent_turn", result: "web_chat"},
	{exact: "agent_run_create", result: "connected_tms"},
	{prefix: "github_", result: "github"},
	{exact: "repository_agent_workflow", result: "github"},
	{prefix: "workspace_github_", result: "github"},
	{prefix: "workspace_gitlab_", result: "gitlab"},
	{prefix: "workspace_", result: "automation"},
	{exact: "visual_workflow_ai_step", result: "automation"},
}

func reportingSQLList(values []string) string {
	quoted := make([]string, len(values))
	for i, value := range values {
		quoted[i] = "'" + value + "'"
	}
	return strings.Join(quoted, ", ")
}

// reportingRuleBranches are the when branches of a SQL case for source rules, in the rules'
// order. Rules are constants of this file, never user text.
func reportingRuleBranches(rules []reportingSourceRule, column string) string {
	var branches []string
	for _, rule := range rules {
		if rule.exact != "" {
			branches = append(branches, fmt.Sprintf("when %s = '%s' then '%s'::text", column, rule.exact, rule.result))
		} else {
			branches = append(branches, fmt.Sprintf("when starts_with(%s, '%s') then '%s'::text", column, rule.prefix, rule.result))
		}
	}
	return strings.Join(branches, " ")
}

func reportingAiAreaSQL(source, agentRunKind string) string {
	media := append(append([]string{}, reportingAiImageSources...), reportingAiVideoSources...)
	return fmt.Sprintf(`case
        when %s in (%s) then 'images_and_video'
        when %s = 'agent_run_create' then case %s else 'other' end
        %s
        else 'other' end`, source, reportingSQLList(media), source, reportingRuleBranches(reportingAiAgentRunKinds, agentRunKind),
		reportingRuleBranches(reportingAiOriginRules, source))
}

func reportingAiChannelSQL(source, viaApiKey string) string {
	return fmt.Sprintf("case %s when %s then 'api' else 'app' end", reportingRuleBranches(reportingAiChannelRules, source), viaApiKey)
}

// reportingAiTokens is a token count from a usage row's dimensions; anything that is not a
// number counts as 0.
func reportingAiTokens(key string) string {
	value := "u.dimensions ->> '" + key + "'"
	return fmt.Sprintf("case when %s ~ '^[0-9]+([.][0-9]+)?$' then (%s)::numeric else 0 end", value, value)
}

type reportingAiQuery struct {
	scope               reportingScope
	period              reportingPeriod
	includeUnattributed bool
	filters             map[string]string
	groupBy, thenBy     string
	rankBy              string
	page                int
	all                 bool
}

// reportingAiUsageRowsSQL is the calls from a day to the end of the period that the viewer may
// see, each with every detail it can be grouped by, narrowed by the filters: the CTEs calls and
// filtered.
func reportingAiUsageRowsSQL(args *reportingArgs, q reportingAiQuery, from string) string {
	org := args.add(q.scope.organizationID)
	projectIDs := q.scope.scopedProjectIDs()
	attributed := "false"
	if len(projectIDs) > 0 {
		attributed = "project_id = any(" + args.add(projectIDs) + "::text[])"
	}
	projects := attributed
	if q.includeUnattributed && q.scope.projectID == "" {
		projects = "(" + attributed + " or project_id is null)"
	}
	media := reportingSQLList(append(append([]string{}, reportingAiImageSources...), reportingAiVideoSources...))
	var filters []string
	for _, dimension := range reportingAiDimensions {
		if value, ok := q.filters[dimension]; ok {
			filters = append(filters, reportingAiColumns[dimension]+" = "+args.add(value))
		}
	}
	where := ""
	if len(filters) > 0 {
		where = "where " + strings.Join(filters, " and ")
	}
	return fmt.Sprintf(`
        calls as (
            select
                %s as area,
                u.source as feature,
                u.model_id as model,
                case when strpos(u.model_id, '/') > 1 then split_part(u.model_id, '/', 1) end as provider,
                %s as channel,
                case u.credential_source when 'gateway' then 'our_ai' when 'byok' then 'own_key' else 'not_recorded' end as key_type,
                u.project_id as project, u.job_id as task, u.automation_id as automation,
                u.source, u.source in (%s) as media, u.credential_source, u.amount_usd, u.created_at,
                %s as input_tokens,
                %s as output_tokens,
                greatest(u.quantity - %s - %s, 0) as extra_tokens
            from (%s) u
            where %s
        ),
        filtered as (select * from calls %s)`,
		reportingAiAreaSQL("u.source", "u.agent_run_kind"), reportingAiChannelSQL("u.source", "u.via_api_key"), media,
		reportingAiTokens("input_tokens"), reportingAiTokens("output_tokens"), reportingAiTokens("input_tokens"), reportingAiTokens("output_tokens"),
		reportingAttributedUsageSQL(org, fmt.Sprintf("u.created_at >= %s and u.created_at < %s and u.status <> 'rejected' and u.feature_id = 'ai_tokens'",
			reportingDayStart(args.add(from)), reportingDayEnd(args.add(q.period.To)))),
		projects, where)
}

// reportingAiMeasuresSQL are the measures of a group of filtered rows. Billing writes one token
// row for each finished run, image or video (a failed one leaves only its reservation, which is
// not read), so a token row under an image or video counts as that image or video, never as a
// run. Its tokens count as they are. The charge counts our gateway, as Costs does.
func reportingAiMeasuresSQL() string {
	images := reportingSQLList(reportingAiImageSources)
	return fmt.Sprintf(`
        count(*) filter (where not media)::integer as calls,
        coalesce(sum(input_tokens), 0)::float8 as input_tokens,
        coalesce(sum(output_tokens), 0)::float8 as output_tokens,
        coalesce(sum(extra_tokens), 0)::float8 as cache_and_reasoning_tokens,
        count(*) filter (where media and source in (%s))::integer as images,
        count(*) filter (where media and source not in (%s))::integer as videos,
        round(coalesce(sum(amount_usd) filter (where credential_source = 'gateway'), 0), 8)::text as charge_usd,
        count(*) filter (where credential_source is distinct from 'byok'
            and (credential_source is distinct from 'gateway' or amount_usd is null))::integer as unrecorded_charges,
        count(*) filter (where credential_source = 'byok')::integer as own_key_calls`, images, images)
}

// Largest first: by tokens, then images and videos, then calls.
const reportingAiSortColumnsSQL = `
    coalesce(sum(input_tokens + output_tokens + extra_tokens), 0) as sort_tokens,
    count(*) filter (where media) as sort_media,
    count(*) filter (where not media) as sort_calls,
    coalesce(sum(amount_usd) filter (where credential_source = 'gateway'), 0) as sort_charge`

// reportingAiLargestFirst orders by the chosen measure, then by the others, so equal groups keep
// one order.
func reportingAiLargestFirst(rankBy string) string {
	order := map[string][]string{
		"tokens": {"sort_tokens", "sort_media", "sort_calls", "sort_charge"},
		"calls":  {"sort_calls", "sort_tokens", "sort_media", "sort_charge"},
		"charge": {"sort_charge", "sort_tokens", "sort_media", "sort_calls"},
	}[rankBy]
	return strings.Join(order, " desc, ") + " desc"
}

// reportingAiLabelSQL is the name of the project, task or automation a group's key stands for.
func reportingAiLabelSQL(dimension, key, organizationParam string) string {
	switch dimension {
	case "project":
		return fmt.Sprintf("(select lp.name from projects lp where lp.organization_id = %s and lp.id = %s)", organizationParam, key)
	case "task":
		return fmt.Sprintf("(select %s from jobs lj where lj.organization_id = %s and lj.id = %s)", reportingTaskTitleSQL("lj"), organizationParam, key)
	case "automation":
		return fmt.Sprintf("(select la.name from workspace_automations la where la.organization_id = %s and la.id::text = %s)", organizationParam, key)
	default:
		return "null::text"
	}
}

type reportingAiTotals struct {
	Calls        int     `json:"calls"`
	InputTokens  float64 `json:"inputTokens"`
	OutputTokens float64 `json:"outputTokens"`
	// Tokens billing counts beyond input and output: cached input read or written, and
	// reasoning. Billing keeps only their sum (the row's quantity less input and output).
	CacheAndReasoningTokens float64 `json:"cacheAndReasoningTokens"`
	Images                  int     `json:"images"`
	Videos                  int     `json:"videos"`
	// Billing's charge for calls through our AI gateway, as fixed-point USD.
	ChargeUSD string `json:"chargeUsd"`
	// Calls, images and videos whose charge billing has no record of: not received, failed, or
	// from before billing recorded the key.
	UnrecordedCharges int `json:"unrecordedCharges"`
	// Calls, images and videos on the workspace's own provider key, which use no plan credit.
	OwnKeyCalls int `json:"ownKeyCalls"`
}

func reportingNoAiTotals() reportingAiTotals {
	return reportingAiTotals{ChargeUSD: "0.00000000"}
}

func (t *reportingAiTotals) scanTargets() []any {
	return []any{&t.Calls, &t.InputTokens, &t.OutputTokens, &t.CacheAndReasoningTokens, &t.Images, &t.Videos, &t.ChargeUSD, &t.UnrecordedCharges, &t.OwnKeyCalls}
}

type reportingAiGroup struct {
	// An area, a model, a project's id and so on; null for none, such as a call with no task.
	Key *string `json:"key"`
	// The name of a project, task or automation; null for the other details.
	Label *string `json:"label"`
	// Every row under a group beyond the largest few, together; never a filter.
	Other bool `json:"other,omitempty"`
	reportingAiTotals
}

type reportingAiRow struct {
	reportingAiGroup
	Children []reportingAiGroup `json:"children"`
}

type reportingAiSeriesGroup struct {
	Key   *string `json:"key"`
	Label *string `json:"label"`
	Other bool    `json:"other"`
}

type reportingAiPoint struct {
	Start     string    `json:"start"`
	Calls     []float64 `json:"calls"`
	Tokens    []float64 `json:"tokens"`
	ChargeUSD []float64 `json:"chargeUsd"`
}

type reportingAiSeries struct {
	// The chart's groups, largest first, then "Other" when there are more.
	Groups []reportingAiSeriesGroup `json:"groups"`
	// One point per day or week; each list has a value per group, in the order of the groups.
	Points []reportingAiPoint `json:"points"`
}

type reportingAiUsage struct {
	Period   reportingPeriod   `json:"period"`
	GroupBy  string            `json:"groupBy"`
	ThenBy   *string           `json:"thenBy"`
	Rows     []reportingAiRow  `json:"rows"`
	Totals   reportingAiTotals `json:"totals"`
	Previous reportingAiTotals `json:"previous"`
	// Groups in the whole table, across pages.
	TotalGroups int               `json:"totalGroups"`
	Page        int               `json:"page"`
	PageSize    int               `json:"pageSize"`
	Series      reportingAiSeries `json:"series"`
	// The name of the automation the usage is narrowed to, if any.
	AutomationName *string `json:"automationName"`
}

// queryReportingAiTotals reads the headline totals for the period and the one before it.
func queryReportingAiTotals(ctx context.Context, db dictionaryDB, q reportingAiQuery) (totals, previous reportingAiTotals, err error) {
	totals, previous = reportingNoAiTotals(), reportingNoAiTotals()
	var args reportingArgs
	usage := reportingAiUsageRowsSQL(&args, q, q.period.PreviousFrom)
	rows, err := db.Query(ctx, fmt.Sprintf(`with %s select created_at >= %s as current, %s from filtered group by 1`,
		usage, reportingDayStart(args.add(q.period.From)), reportingAiMeasuresSQL()), args...)
	if err != nil {
		return totals, previous, fmt.Errorf("read AI totals: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var current bool
		var found reportingAiTotals
		if err := rows.Scan(append([]any{&current}, found.scanTargets()...)...); err != nil {
			return totals, previous, fmt.Errorf("scan AI totals: %w", err)
		}
		if current {
			totals = found
		} else {
			previous = found
		}
	}
	return totals, previous, rows.Err()
}

// reportingAiRemainder is a group's totals less those of the groups shown under it: what
// "Other" stands for. Credit is summed in the database instead, since each row's is rounded.
func reportingAiRemainder(group reportingAiTotals, shown []reportingAiGroup, chargeUSD string) reportingAiTotals {
	rest := group
	rest.ChargeUSD = chargeUSD
	for _, row := range shown {
		rest.Calls -= row.Calls
		rest.InputTokens -= row.InputTokens
		rest.OutputTokens -= row.OutputTokens
		rest.CacheAndReasoningTokens -= row.CacheAndReasoningTokens
		rest.Images -= row.Images
		rest.Videos -= row.Videos
		rest.UnrecordedCharges -= row.UnrecordedCharges
		rest.OwnKeyCalls -= row.OwnKeyCalls
	}
	return rest
}

// queryReportingAiTable reads a page of groups by the first detail, each with its largest groups
// by the second and the rest as one "Other" row; a download has every group and every row under
// it.
func queryReportingAiTable(ctx context.Context, db dictionaryDB, q reportingAiQuery) (rows []reportingAiRow, totalGroups int, err error) {
	rows = []reportingAiRow{}
	var args reportingArgs
	usage := reportingAiUsageRowsSQL(&args, q, q.period.From)
	// The usage rows put the workspace's id first.
	org := "$1"
	first := reportingAiColumns[q.groupBy]
	second, childFlag, groupBy, secondLabel := "null::text", "false", first, "null::text"
	if q.thenBy != "" {
		second = reportingAiColumns[q.thenBy]
		childFlag = "grouping(" + second + ") = 0"
		groupBy = fmt.Sprintf("grouping sets ((%s), (%s, %s))", first, first, second)
		secondLabel = reportingAiLabelSQL(q.thenBy, "p.g2", org)
	}
	offset := (q.page - 1) * reportingAiPageSize
	shown := "true"
	if !q.all {
		shown = fmt.Sprintf("p.place > %d and p.place <= %d and (not p.child or p.child_place <= %d)", offset, offset+reportingAiPageSize, reportingAiChildRows)
	}
	ranking := reportingAiLargestFirst(q.rankBy)
	result, err := db.Query(ctx, fmt.Sprintf(`
        with %s,
        grouped as (
            select %s as g1, %s as g2, %s as child, %s, %s
            from filtered
            group by %s
        ),
        ranked as (
            select *,
                case when not child then row_number() over (partition by child order by %s, g1 nulls last) end as own_place,
                row_number() over (partition by g1, child order by %s, g2 nulls last) as child_place,
                count(*) filter (where child) over (partition by g1) as children
            from grouped
        ),
        placed as (
            select *, max(own_place) over (partition by g1) as place,
                round(coalesce(sum(sort_charge) filter (where child and child_place > %d) over (partition by g1), 0), 8)::text as rest_charge_usd
            from ranked
        ),
        counted as (select count(*)::integer as total from grouped where not child)
        select c.total, p.g1, p.g2, p.child, p.children::integer,
            %s as label1, %s as label2,
            p.calls, p.input_tokens, p.output_tokens, p.cache_and_reasoning_tokens, p.images, p.videos, p.charge_usd,
            p.unrecorded_charges, p.own_key_calls, p.rest_charge_usd
        from counted c left join placed p on %s
        order by p.place, p.child, p.child_place`,
		usage, first, second, childFlag, reportingAiMeasuresSQL(), reportingAiSortColumnsSQL, groupBy,
		ranking, ranking, reportingAiChildRows,
		reportingAiLabelSQL(q.groupBy, "p.g1", org), secondLabel, shown), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("read AI table: %w", err)
	}
	defer result.Close()
	type parent struct {
		children      int
		restChargeUSD string
	}
	var parents []parent
	for result.Next() {
		var key1, key2, label1, label2 *string
		var child *bool
		var children *int
		var restChargeUSD *string
		var totals reportingAiTotals
		var calls, images, videos, unrecorded, ownKey *int
		var inputTokens, outputTokens, extraTokens *float64
		var chargeUSD *string
		if err := result.Scan(&totalGroups, &key1, &key2, &child, &children, &label1, &label2,
			&calls, &inputTokens, &outputTokens, &extraTokens, &images, &videos, &chargeUSD, &unrecorded, &ownKey, &restChargeUSD); err != nil {
			return nil, 0, fmt.Errorf("scan AI table: %w", err)
		}
		// The one row of a page past the end carries only the total.
		if child == nil {
			continue
		}
		totals = reportingAiTotals{
			Calls: *calls, InputTokens: *inputTokens, OutputTokens: *outputTokens, CacheAndReasoningTokens: *extraTokens,
			Images: *images, Videos: *videos, ChargeUSD: *chargeUSD, UnrecordedCharges: *unrecorded, OwnKeyCalls: *ownKey,
		}
		if !*child {
			rows = append(rows, reportingAiRow{reportingAiGroup: reportingAiGroup{Key: key1, Label: label1, reportingAiTotals: totals}, Children: []reportingAiGroup{}})
			parents = append(parents, parent{children: *children, restChargeUSD: *restChargeUSD})
			continue
		}
		if len(rows) > 0 {
			last := &rows[len(rows)-1]
			last.Children = append(last.Children, reportingAiGroup{Key: key2, Label: label2, reportingAiTotals: totals})
		}
	}
	if err := result.Err(); err != nil {
		return nil, 0, fmt.Errorf("read AI table: %w", err)
	}
	for i := range rows {
		if len(rows[i].Children) < parents[i].children {
			rows[i].Children = append(rows[i].Children, reportingAiGroup{Other: true, reportingAiTotals: reportingAiRemainder(rows[i].reportingAiTotals, rows[i].Children, parents[i].restChargeUSD)})
		}
	}
	return rows, totalGroups, nil
}

// reportingAiChartStarts is the first day of each point of the period's chart: each day, or
// each week from its Monday.
func reportingAiChartStarts(period reportingPeriod) []string {
	weekly := period.Interval == "week"
	day := period.From
	if weekly {
		weekday := (int(reportingDayTime(period.From).Weekday()) + 6) % 7
		day = reportingAddDays(period.From, -weekday)
	}
	var starts []string
	for ; day <= period.To; day = reportingAddDays(day, map[bool]int{true: 7, false: 1}[weekly]) {
		starts = append(starts, day)
	}
	return starts
}

// queryReportingAiSeries reads calls, tokens and charge per day or week, for the largest groups
// by the first detail.
func queryReportingAiSeries(ctx context.Context, db dictionaryDB, q reportingAiQuery) (reportingAiSeries, error) {
	series := reportingAiSeries{Groups: []reportingAiSeriesGroup{}, Points: []reportingAiPoint{}}
	var args reportingArgs
	usage := reportingAiUsageRowsSQL(&args, q, q.period.From)
	column := reportingAiColumns[q.groupBy]
	day := "(f.created_at at time zone 'UTC')::date"
	bucket := day
	if q.period.Interval == "week" {
		bucket = "date_trunc('week', " + day + ")::date"
	}
	type seriesRow struct {
		start     string
		slot      int
		key       *string
		label     *string
		calls     int
		tokens    float64
		chargeUSD float64
	}
	result, err := db.Query(ctx, fmt.Sprintf(`
        with %s,
        ranked as (
            select %s as g1, (row_number() over (order by %s, %s nulls last))::integer as slot
            from (select %s, %s from filtered group by 1) t
        ),
        top as (select * from ranked where slot <= %d)
        select %s::text as start, coalesce(t.slot, 0) as slot, t.g1 as key, %s as label,
            count(*) filter (where not f.media)::integer as calls,
            coalesce(sum(f.input_tokens + f.output_tokens + f.extra_tokens), 0)::float8 as tokens,
            coalesce(sum(f.amount_usd) filter (where f.credential_source = 'gateway'), 0)::float8 as charge_usd
        from filtered f left join top t on t.g1 is not distinct from f.%s
        group by 1, 2, 3`,
		usage, column, reportingAiLargestFirst(q.rankBy), column, column, reportingAiSortColumnsSQL, reportingAiChartGroups,
		bucket, reportingAiLabelSQL(q.groupBy, "t.g1", "$1"), column), args...)
	if err != nil {
		return series, fmt.Errorf("read AI series: %w", err)
	}
	defer result.Close()
	var found []seriesRow
	for result.Next() {
		var row seriesRow
		if err := result.Scan(&row.start, &row.slot, &row.key, &row.label, &row.calls, &row.tokens, &row.chargeUSD); err != nil {
			return series, fmt.Errorf("scan AI series: %w", err)
		}
		found = append(found, row)
	}
	if err := result.Err(); err != nil {
		return series, fmt.Errorf("read AI series: %w", err)
	}
	// The top groups in order, then "Other" (slot 0) when some groups did not make the top.
	var slots []int
	for _, row := range found {
		if !slices.Contains(slots, row.slot) {
			slots = append(slots, row.slot)
		}
	}
	slices.SortFunc(slots, func(a, b int) int {
		if a == 0 || b == 0 {
			return b - a
		}
		return a - b
	})
	position := map[int]int{}
	for i, slot := range slots {
		position[slot] = i
		if slot == 0 {
			series.Groups = append(series.Groups, reportingAiSeriesGroup{Other: true})
			continue
		}
		at := slices.IndexFunc(found, func(row seriesRow) bool { return row.slot == slot })
		series.Groups = append(series.Groups, reportingAiSeriesGroup{Key: found[at].key, Label: found[at].label})
	}
	index := map[string]int{}
	for _, start := range reportingAiChartStarts(q.period) {
		index[start] = len(series.Points)
		series.Points = append(series.Points, reportingAiPoint{Start: start, Calls: make([]float64, len(slots)), Tokens: make([]float64, len(slots)), ChargeUSD: make([]float64, len(slots))})
	}
	for _, row := range found {
		at, ok := index[row.start]
		if !ok {
			continue
		}
		point := &series.Points[at]
		point.Calls[position[row.slot]] = float64(row.calls)
		point.Tokens[position[row.slot]] = row.tokens
		point.ChargeUSD[position[row.slot]] = row.chargeUSD
	}
	return series, nil
}

// queryReportingAiUsage reads AI used in a period, placed in projects by the attribution rules:
// headline totals, a page of the table grouped by groupBy (then thenBy), and the chart. Calls
// tied to no project are counted only when includeUnattributed is set and no project is chosen.
func queryReportingAiUsage(ctx context.Context, db dictionaryDB, q reportingAiQuery) (reportingAiUsage, error) {
	if q.thenBy == q.groupBy {
		q.thenBy = ""
	}
	if q.rankBy == "" {
		q.rankBy = "tokens"
	}
	if q.page == 0 {
		q.page = 1
	}
	usage := reportingAiUsage{Period: q.period, GroupBy: q.groupBy, Page: q.page, PageSize: reportingAiPageSize}
	if q.thenBy != "" {
		usage.ThenBy = &q.thenBy
	}
	var err error
	if usage.Totals, usage.Previous, err = queryReportingAiTotals(ctx, db, q); err != nil {
		return usage, err
	}
	if usage.Rows, usage.TotalGroups, err = queryReportingAiTable(ctx, db, q); err != nil {
		return usage, err
	}
	if usage.Series, err = queryReportingAiSeries(ctx, db, q); err != nil {
		return usage, err
	}
	if automation, ok := q.filters["automation"]; ok {
		var name string
		err := db.QueryRow(ctx, `select name from workspace_automations where organization_id = $1 and id::text = $2`, q.scope.organizationID, automation).Scan(&name)
		if err != nil && !isNoRows(err) {
			return usage, fmt.Errorf("read automation name: %w", err)
		}
		if err == nil {
			usage.AutomationName = &name
		}
	}
	return usage, nil
}

type reportingAiRouteQuery struct {
	from, to, projectID string
	groupBy, thenBy     string
	rankBy              string
	filters             map[string]string
	page                int
	format              string
}

func parseReportingAiQuery(r *http.Request) (reportingAiRouteQuery, error) {
	q := readReportingQuery(r)
	var query reportingAiRouteQuery
	query.from, query.to = q.dates()
	query.projectID = q.id("projectId")
	query.groupBy = q.choice("groupBy", "area", reportingAiDimensions...)
	query.thenBy = q.choice("thenBy", "", reportingAiDimensions...)
	query.rankBy = q.choice("rankBy", "tokens", reportingAiMeasures...)
	query.filters = map[string]string{}
	for key, dimension := range map[string]string{"feature": "feature", "model": "model", "provider": "provider", "jobId": "task", "automationId": "automation"} {
		if _, given := q.raw(key); given {
			query.filters[dimension] = q.id(key)
		}
	}
	if _, given := q.raw("area"); given {
		query.filters["area"] = q.choice("area", "", reportingAiOrigins...)
	}
	if _, given := q.raw("channel"); given {
		query.filters["channel"] = q.choice("channel", "", reportingAiChannels...)
	}
	if _, given := q.raw("key"); given {
		query.filters["key"] = q.choice("key", "", reportingAiKeyTypes...)
	}
	query.page = q.page()
	query.format = q.format()
	// Group by two different details.
	if query.thenBy != "" && query.thenBy == query.groupBy {
		q.fail()
	}
	return query, q.err()
}

// aiUsage is the AI usage tab: calls, tokens, images, videos and billing's charge, grouped by
// one detail and optionally a second. AI used outside any project counts for the roles that see
// billing.
func (api *reportingAPI) aiUsage(r *http.Request, actor reportingActor) (any, int, error) {
	query, err := parseReportingAiQuery(r)
	if err != nil {
		return nil, 0, err
	}
	ctx := r.Context()
	var usage reportingAiUsage
	err = api.read(ctx, func(db dictionaryDB) error {
		view, err := api.context(ctx, db, actor)
		if err != nil {
			return err
		}
		usage, err = queryReportingAiUsage(ctx, db, reportingAiQuery{
			scope: view.scope(query.projectID, "", ""), period: view.period(query.from, query.to),
			includeUnattributed: view.financial, filters: query.filters, groupBy: query.groupBy, thenBy: query.thenBy,
			rankBy: query.rankBy, page: query.page, all: query.format == "csv",
		})
		return err
	})
	if err != nil {
		return nil, 0, err
	}
	if query.format == "csv" {
		return reportingAiUsageCSV(usage), http.StatusOK, nil
	}
	return map[string]any{"aiUsage": usage}, http.StatusOK, nil
}

// The CSV columns of a detail: its value, and the name of a project, task or automation.
var reportingAiDimensionColumns = map[string][]string{
	"area": {"area"}, "feature": {"feature"}, "model": {"model"}, "provider": {"provider"}, "channel": {"channel"},
	"key": {"keyType"}, "project": {"projectId", "projectName"}, "task": {"jobId", "jobTitle"}, "automation": {"automationId", "automationName"},
}

// reportingAiUsageCSV writes a line per group, or per group of the second detail when there is one.
func reportingAiUsageCSV(usage reportingAiUsage) reportingCSV {
	return reportingCSV{filename: "ai-usage.csv", write: func(w *reportingCSVWriter) error {
		measures := []string{"calls", "inputTokens", "outputTokens", "cacheAndReasoningTokens", "images", "videos", "chargeUsd", "unrecordedCharges", "ownKeyCalls"}
		header := append([]string{}, reportingAiDimensionColumns[usage.GroupBy]...)
		if usage.ThenBy != nil {
			header = append(header, reportingAiDimensionColumns[*usage.ThenBy]...)
		}
		if err := w.row(append(header, measures...)...); err != nil {
			return err
		}
		detail := func(dimension string, group reportingAiGroup) []string {
			if len(reportingAiDimensionColumns[dimension]) == 2 {
				return []string{reportingOptional(group.Key), reportingOptional(group.Label)}
			}
			return []string{reportingOptional(group.Key)}
		}
		values := func(t reportingAiTotals) []string {
			return []string{
				strconv.Itoa(t.Calls), reportingNumber(t.InputTokens), reportingNumber(t.OutputTokens), reportingNumber(t.CacheAndReasoningTokens),
				strconv.Itoa(t.Images), strconv.Itoa(t.Videos), t.ChargeUSD, strconv.Itoa(t.UnrecordedCharges), strconv.Itoa(t.OwnKeyCalls),
			}
		}
		for _, row := range usage.Rows {
			if usage.ThenBy == nil {
				if err := w.row(append(detail(usage.GroupBy, row.reportingAiGroup), values(row.reportingAiTotals)...)...); err != nil {
					return err
				}
				continue
			}
			for _, child := range row.Children {
				cells := append(detail(usage.GroupBy, row.reportingAiGroup), detail(*usage.ThenBy, child)...)
				if err := w.row(append(cells, values(child.reportingAiTotals)...)...); err != nil {
					return err
				}
			}
		}
		return nil
	}}
}
