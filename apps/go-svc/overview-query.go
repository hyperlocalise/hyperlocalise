package main

import (
	"context"
	"encoding/json"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

type overviewMetricSeries struct {
	Count  int   `json:"count"`
	Series []int `json:"series"`
}

type overviewResolvedTitle struct {
	Kind          string  `json:"kind"`
	Text          string  `json:"text,omitempty"`
	Criteria      string  `json:"criteria,omitempty"`
	Direction     *string `json:"direction,omitempty"`
	ConnectorKind string  `json:"connectorKind,omitempty"`
	ID            string  `json:"id,omitempty"`
}

func (title overviewResolvedTitle) MarshalJSON() ([]byte, error) {
	if title.Kind != "sync" {
		type wire overviewResolvedTitle
		return json.Marshal(wire(title))
	}
	return json.Marshal(struct {
		Kind          string  `json:"kind"`
		Direction     *string `json:"direction"`
		ConnectorKind string  `json:"connectorKind"`
	}{
		Kind:          title.Kind,
		Direction:     title.Direction,
		ConnectorKind: title.ConnectorKind,
	})
}

type overviewActivityItem struct {
	ID          string                `json:"id"`
	Kind        string                `json:"kind"`
	Title       overviewResolvedTitle `json:"title"`
	ProjectName *string               `json:"projectName"`
	JobKind     *string               `json:"jobKind"`
	JobType     *string               `json:"jobType"`
	Status      string                `json:"status"`
	Href        *string               `json:"href"`
	UpdatedAt   string                `json:"updatedAt"`
	Attention   bool                  `json:"attention"`
}

type overviewProjectItem struct {
	ID             string                 `json:"id"`
	Name           string                 `json:"name"`
	Source         string                 `json:"source"`
	ProviderKind   *string                `json:"providerKind"`
	Domain         *string                `json:"domain"`
	LocaleRoute    string                 `json:"localeRoute"`
	LatestJobTitle *overviewResolvedTitle `json:"latestJobTitle"`
	LatestJobAt    *string                `json:"latestJobAt"`
	OpenCount      int                    `json:"openCount"`
	FailedCount    int                    `json:"failedCount"`
	Href           string                 `json:"href"`
}

type overviewBoardItem struct {
	ID          string  `json:"id"`
	Identifier  string  `json:"identifier"`
	Title       string  `json:"title"`
	ProjectName string  `json:"projectName"`
	Locale      *string `json:"locale"`
	Priority    *string `json:"priority"`
	UpdatedAt   string  `json:"updatedAt"`
	Href        string  `json:"href"`
}

type overviewAutomationItem struct {
	ID            string `json:"id"`
	AutomationID  string `json:"automationId"`
	Name          string `json:"name"`
	TriggerSource string `json:"triggerSource"`
	Status        string `json:"status"`
	UpdatedAt     string `json:"updatedAt"`
	Href          string `json:"href"`
}

type overviewDayCount struct {
	Day   string
	Count int
}

type overviewJobTitleInput struct {
	ID                string
	Kind              string
	InputPayload      []byte
	ExternalTitle     *string
	ReviewCriteria    *string
	SyncConnectorKind *string
	SyncDirection     *string
	SourceFilename    *string
	SourcePath        *string
}

func overviewUTCDayKey(date time.Time) string {
	return date.UTC().Format("2006-01-02")
}

func fillOverviewDailySeries(rows []overviewDayCount, now time.Time) []int {
	counts := make(map[string]int, len(rows))
	for _, row := range rows {
		counts[row.Day] = row.Count
	}
	series := make([]int, overviewLookbackDays)
	start := time.Date(now.UTC().Year(), now.UTC().Month(), now.UTC().Day(), 0, 0, 0, 0, time.UTC)
	for i := 0; i < overviewLookbackDays; i++ {
		day := start.AddDate(0, 0, i-(overviewLookbackDays-1))
		series[i] = counts[overviewUTCDayKey(day)]
	}
	return series
}

func sumOverviewSeries(series []int) int {
	total := 0
	for _, value := range series {
		total += value
	}
	return total
}

func overviewJobKindValue(kind, jobType string) (jobKind *string, resolvedType *string) {
	switch kind {
	case "translation", "research", "review", "proofread", "sync", "asset_management":
		value := kind
		jobKind = &value
	default:
		return nil, nil
	}
	if kind == "translation" && strings.TrimSpace(jobType) != "" {
		trimmed := strings.TrimSpace(jobType)
		resolvedType = &trimmed
	}
	return jobKind, resolvedType
}

func formatOverviewLocaleRoute(sourceLocale *string, targetLocales []string) string {
	source := "—"
	if sourceLocale != nil {
		if trimmed := strings.TrimSpace(*sourceLocale); trimmed != "" {
			source = trimmed
		}
	}
	targets := make([]string, 0, len(targetLocales))
	for _, locale := range targetLocales {
		if trimmed := strings.TrimSpace(locale); trimmed != "" {
			targets = append(targets, trimmed)
		}
	}
	if len(targets) == 0 {
		return source
	}
	preview := strings.Join(targets[:min(2, len(targets))], ", ")
	suffix := ""
	if len(targets) > 2 {
		suffix = " +" + strconv.Itoa(len(targets)-2)
	}
	return source + " → " + preview + suffix
}

func resolveOverviewJobTitle(job overviewJobTitleInput) overviewResolvedTitle {
	if job.ExternalTitle != nil {
		if trimmed := strings.TrimSpace(*job.ExternalTitle); trimmed != "" {
			return overviewResolvedTitle{Kind: "text", Text: trimmed}
		}
	}

	payload := decodeOverviewPayload(job.InputPayload)
	if metadata, ok := payload["metadata"].(map[string]any); ok {
		if title, ok := metadata["title"].(string); ok {
			if trimmed := strings.TrimSpace(title); trimmed != "" {
				return overviewResolvedTitle{Kind: "text", Text: trimmed}
			}
		}
	}
	if job.Kind == "review" && job.ReviewCriteria != nil {
		if trimmed := strings.TrimSpace(*job.ReviewCriteria); trimmed != "" {
			return overviewResolvedTitle{Kind: "review", Criteria: trimmed}
		}
	}
	if job.Kind == "sync" && job.SyncConnectorKind != nil && strings.TrimSpace(*job.SyncConnectorKind) != "" {
		var direction *string
		if job.SyncDirection != nil {
			trimmed := strings.TrimSpace(*job.SyncDirection)
			if trimmed != "" {
				direction = &trimmed
			}
		}
		return overviewResolvedTitle{
			Kind:          "sync",
			Direction:     direction,
			ConnectorKind: strings.TrimSpace(*job.SyncConnectorKind),
		}
	}
	if sourceText, ok := payload["sourceText"].(string); ok {
		if trimmed := strings.TrimSpace(sourceText); trimmed != "" {
			return overviewResolvedTitle{Kind: "text", Text: truncateRunes(trimmed, 80)}
		}
	}
	if label := overviewNativeSourceFileLabel(job, payload); label != "" {
		return overviewResolvedTitle{Kind: "text", Text: label}
	}
	return overviewResolvedTitle{Kind: "id", ID: job.ID}
}

func overviewNativeSourceFileLabel(job overviewJobTitleInput, payload map[string]any) string {
	metadata, _ := payload["metadata"].(map[string]any)
	sourcePath := overviewFirstDisplayLabel(
		overviewOptionalString(job.SourcePath),
		overviewStringField(metadata, "sourcePath"),
	)
	sourceFilename := overviewFirstDisplayLabel(
		overviewOptionalString(job.SourceFilename),
		overviewStringField(metadata, "sourceFilename"),
	)
	sourceFileID := overviewStringField(payload, "sourceFileId")
	if sourcePath != "" {
		return sourcePath
	}
	if sourceFilename != "" {
		return sourceFilename
	}
	if sourceFileID != "" && !overviewLooksInternalStorage(sourceFileID) {
		return sourceFileID
	}
	return ""
}

func overviewFirstDisplayLabel(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" && !overviewLooksInternalStorage(trimmed) {
			return trimmed
		}
	}
	return ""
}

func overviewOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func decodeOverviewPayload(raw []byte) map[string]any {
	payload := map[string]any{}
	if len(raw) == 0 {
		return payload
	}
	_ = json.Unmarshal(raw, &payload)
	return payload
}

func overviewStoredFileLookupID(job overviewJobTitleInput) string {
	payload := decodeOverviewPayload(job.InputPayload)
	if overviewNativeSourceFileLabel(job, payload) != "" {
		return ""
	}
	sourceFileID := overviewStringField(payload, "sourceFileId")
	if sourceFileID == "" || !overviewLooksInternalStorage(sourceFileID) {
		return ""
	}
	return sourceFileID
}

type overviewStoredFileDisplay struct {
	filename   string
	sourcePath string
}

func (api *overviewAPI) enrichOverviewJobTitleInputs(ctx context.Context, organizationID string, inputs []overviewJobTitleInput) error {
	fileIDs := make([]string, 0, len(inputs))
	seen := make(map[string]struct{}, len(inputs))
	for _, input := range inputs {
		fileID := overviewStoredFileLookupID(input)
		if fileID == "" {
			continue
		}
		if _, ok := seen[fileID]; ok {
			continue
		}
		seen[fileID] = struct{}{}
		fileIDs = append(fileIDs, fileID)
	}
	if len(fileIDs) == 0 {
		return nil
	}

	displays, err := api.lookupStoredFileDisplays(ctx, organizationID, fileIDs)
	if err != nil {
		return err
	}
	for i := range inputs {
		fileID := overviewStoredFileLookupID(inputs[i])
		display, ok := displays[fileID]
		if !ok {
			continue
		}
		filename := display.filename
		sourcePath := display.sourcePath
		inputs[i].SourceFilename = &filename
		inputs[i].SourcePath = &sourcePath
	}
	return nil
}

func (api *overviewAPI) enrichOverviewLatestJobTitles(ctx context.Context, organizationID string, latestByProject map[string]overviewLatestProjectJob) error {
	if len(latestByProject) == 0 {
		return nil
	}
	projectIDs := make([]string, 0, len(latestByProject))
	inputs := make([]overviewJobTitleInput, 0, len(latestByProject))
	for projectID, latest := range latestByProject {
		projectIDs = append(projectIDs, projectID)
		inputs = append(inputs, latest.title)
	}
	if err := api.enrichOverviewJobTitleInputs(ctx, organizationID, inputs); err != nil {
		return err
	}
	for i, projectID := range projectIDs {
		latest := latestByProject[projectID]
		latest.title = inputs[i]
		latestByProject[projectID] = latest
	}
	return nil
}

func (api *overviewAPI) lookupStoredFileDisplays(ctx context.Context, organizationID string, fileIDs []string) (map[string]overviewStoredFileDisplay, error) {
	displays := make(map[string]overviewStoredFileDisplay, len(fileIDs))
	if len(fileIDs) == 0 {
		return displays, nil
	}

	rows, err := api.pool.Query(ctx, `
        select distinct on (f.id)
            f.id, f.filename, coalesce(nullif(v.source_path, ''), f.metadata->>'sourcePath')
        from stored_files f
        left join repository_source_file_versions v
            on v.stored_file_id = f.id
           and v.organization_id = f.organization_id
        where f.organization_id = $1
          and f.id = any($2)
        order by f.id, v.created_at desc nulls last`,
		organizationID, fileIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var fileID, filename string
		var sourcePath *string
		if err := rows.Scan(&fileID, &filename, &sourcePath); err != nil {
			return nil, err
		}
		displayFilename := overviewDisplayFilename(filename)
		resolvedPath := overviewFirstDisplayLabel(overviewOptionalString(sourcePath), displayFilename)
		if displayFilename == "" && resolvedPath == "" {
			continue
		}
		displays[fileID] = overviewStoredFileDisplay{
			filename:   displayFilename,
			sourcePath: resolvedPath,
		}
	}
	return displays, rows.Err()
}

func overviewDisplayFilename(filename string) string {
	trimmed := strings.TrimSpace(filename)
	if trimmed == "" {
		return ""
	}
	if overviewLooksInternalFileID(trimmed) {
		return ""
	}
	normalized := strings.ReplaceAll(trimmed, "\\", "/")
	if overviewLooksInternalStorage(normalized) {
		parts := strings.Split(normalized, "/")
		for i := len(parts) - 1; i >= 0; i-- {
			part := strings.TrimSpace(parts[i])
			if part != "" && !overviewLooksInternalFileID(part) {
				return part
			}
		}
		return ""
	}
	return trimmed
}

func overviewLooksInternalFileID(value string) bool {
	trimmed := strings.TrimSpace(value)
	return strings.HasPrefix(strings.ToLower(trimmed), "file_") && len(trimmed) == 41
}

func overviewStringField(object map[string]any, key string) string {
	if object == nil {
		return ""
	}
	value, ok := object[key].(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func overviewLooksInternalStorage(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}
	if overviewLooksInternalFileID(trimmed) {
		return true
	}
	lower := strings.ToLower(trimmed)
	if strings.Contains(lower, ".blob.vercel-storage.com/") {
		return true
	}
	return strings.Contains(trimmed, "/files/") || strings.HasPrefix(trimmed, "organizations/")
}

func truncateRunes(value string, limit int) string {
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	runes := []rune(value)
	return string(runes[:limit])
}

func rankOverviewActivity(items []overviewActivityItem) []overviewActivityItem {
	ranked := append([]overviewActivityItem(nil), items...)
	sort.SliceStable(ranked, func(i, j int) bool {
		leftFailed := 1
		rightFailed := 1
		if ranked[i].Status == "failed" {
			leftFailed = 0
		}
		if ranked[j].Status == "failed" {
			rightFailed = 0
		}
		if leftFailed != rightFailed {
			return leftFailed < rightFailed
		}
		leftTime, _ := time.Parse(time.RFC3339Nano, ranked[i].UpdatedAt)
		rightTime, _ := time.Parse(time.RFC3339Nano, ranked[j].UpdatedAt)
		return leftTime.After(rightTime)
	})
	if len(ranked) > overviewActivityLimit {
		return ranked[:overviewActivityLimit]
	}
	return ranked
}

func countOverviewAutomationStatuses(rows []struct {
	Status string
	Count  int
},
) (total int, paused int) {
	for _, row := range rows {
		if row.Status != "active" && row.Status != "paused" {
			continue
		}
		total += row.Count
		if row.Status == "paused" {
			paused += row.Count
		}
	}
	return total, paused
}

func overviewISO(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func overviewOptionalISO(value *time.Time) *string {
	if value == nil {
		return nil
	}
	formatted := overviewISO(*value)
	return &formatted
}

func overviewJobHref(organizationSlug string, projectID *string, jobID string) *string {
	resolved := ""
	if projectID != nil {
		resolved = strings.TrimSpace(*projectID)
	}
	if resolved == "" {
		if parsed := parseOverviewEncodedJobProjectID(jobID); parsed != "" {
			resolved = parsed
		}
	}
	if resolved == "" {
		return nil
	}
	href := "/org/" + organizationSlug + "/projects/" + overviewPathEscape(resolved) + "/jobs/" + overviewPathEscape(jobID)
	return &href
}

func parseOverviewEncodedJobProjectID(jobID string) string {
	if !strings.HasPrefix(jobID, "ext:") {
		return ""
	}
	parts := strings.Split(jobID, ":")
	if len(parts) < 4 {
		return ""
	}
	return strings.Join(parts[:len(parts)-1], ":")
}

func overviewIssueHref(organizationSlug, identifier string) string {
	return "/org/" + overviewPathEscape(organizationSlug) + "/issues/" + overviewPathEscape(identifier)
}

func overviewAutomationHref(organizationSlug, automationID string) string {
	return "/org/" + organizationSlug + "/automations/" + overviewPathEscape(automationID)
}

func overviewProjectHref(organizationSlug, projectID string) string {
	return "/org/" + organizationSlug + "/projects/" + overviewPathEscape(projectID)
}

func decodeOverviewStringSlice(raw []byte) []string {
	if len(raw) == 0 {
		return nil
	}
	var values []string
	if err := json.Unmarshal(raw, &values); err != nil {
		return nil
	}
	return values
}
