package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"unicode"
)

type reportingSettingsProject struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	SourceLocale  *string         `json:"sourceLocale"`
	TargetLocales json.RawMessage `json:"targetLocales"`
}

// reportingSummaryFreshness says whether recent work is still being added to the summary.
type reportingSummaryFreshness struct {
	// Days of recent work the summary has not counted yet.
	PendingDays    int     `json:"pendingDays"`
	OldestMarkedAt *string `json:"oldestMarkedAt"`
}

type reportingSettings struct {
	Projects      []reportingSettingsProject `json:"projects"`
	StartedAt     *string                    `json:"startedAt"`
	StartedDay    *string                    `json:"startedDay"`
	Today         string                     `json:"today"`
	CanLogTime    bool                       `json:"canLogTime"`
	Summary       reportingSummaryFreshness  `json:"summary"`
	RateCardNames []string                   `json:"rateCardNames"`
	Financial     bool                       `json:"financial"`
	CanManage     bool                       `json:"canManage"`
}

// settings is what the Reports page needs before its first report: the viewer's projects, the
// dates Reports covers, what they may do, and the rate cards they may price with.
func (api *reportingAPI) settings(r *http.Request, actor reportingActor) (any, int, error) {
	ctx := r.Context()
	var settings reportingSettings
	err := api.read(ctx, func(db dictionaryDB) error {
		context, err := api.context(ctx, db, actor)
		if err != nil {
			return err
		}
		settings = reportingSettings{
			Projects:      []reportingSettingsProject{},
			Today:         context.today,
			CanLogTime:    actor.can("jobs:write"),
			RateCardNames: []string{},
		}
		if context.startedAt != nil {
			startedAt, startedDay := formatReportingTime(*context.startedAt), context.startedDay
			settings.StartedAt, settings.StartedDay = &startedAt, &startedDay
		}
		if len(context.projectIDs) > 0 {
			if settings.Projects, err = reportingSettingsProjects(ctx, db, context.projectIDs); err != nil {
				return err
			}
		}
		if settings.Summary, err = reportingSummaryFreshnessOf(ctx, db, actor.organizationID); err != nil {
			return err
		}
		if !context.financial {
			return nil
		}
		settings.Financial = true
		settings.CanManage = actor.can("billing:write")
		settings.RateCardNames, err = reportingRateCardNames(ctx, db, actor.organizationID)
		return err
	})
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"settings": settings}, http.StatusOK, nil
}

func reportingSettingsProjects(ctx context.Context, db dictionaryDB, projectIDs []string) ([]reportingSettingsProject, error) {
	rows, err := db.Query(ctx, `select id, name, source_locale, target_locales from projects where id = any($1::text[])`, projectIDs)
	if err != nil {
		return nil, fmt.Errorf("list reporting settings projects: %w", err)
	}
	defer rows.Close()
	projects := []reportingSettingsProject{}
	for rows.Next() {
		var project reportingSettingsProject
		if err := rows.Scan(&project.ID, &project.Name, &project.SourceLocale, &project.TargetLocales); err != nil {
			return nil, fmt.Errorf("scan reporting settings project: %w", err)
		}
		projects = append(projects, project)
	}
	return projects, rows.Err()
}

func reportingSummaryFreshnessOf(ctx context.Context, db dictionaryDB, organizationID string) (reportingSummaryFreshness, error) {
	var pending reportingSummaryFreshness
	err := db.QueryRow(ctx, `
        select count(*)::integer, min(marked_at)::text
        from reporting_summary_queue where organization_id = $1`, organizationID).
		Scan(&pending.PendingDays, &pending.OldestMarkedAt)
	if err != nil {
		return pending, fmt.Errorf("read reporting summary freshness: %w", err)
	}
	return pending, nil
}

// reportingRateCardNames lists every rate card: those with a record of their own, and those from
// before cards had one whose newest line of any language pair and step is not retired.
func reportingRateCardNames(ctx context.Context, db dictionaryDB, organizationID string) ([]string, error) {
	rows, err := db.Query(ctx, `
        select name from reporting_rate_cards where organization_id = $1
        union
        select name from (
            select distinct on (name, source_locale, target_locale, step) name, retired
            from reporting_rates where organization_id = $1
            order by name, source_locale, target_locale, step, created_at desc, id desc
        ) live where not retired`, organizationID)
	if err != nil {
		return nil, fmt.Errorf("list reporting rate cards: %w", err)
	}
	defer rows.Close()
	names := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scan reporting rate card: %w", err)
		}
		names = append(names, name)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list reporting rate cards: %w", err)
	}
	sort.SliceStable(names, func(i, j int) bool { return compareReportingNames(names[i], names[j]) < 0 })
	return names, nil
}

// compareReportingNames orders names as the browser's localeCompare does for plain text: by
// letters regardless of case, then lower case before upper case.
func compareReportingNames(a, b string) int {
	if folded := strings.Compare(strings.ToLower(a), strings.ToLower(b)); folded != 0 {
		return folded
	}
	ra, rb := []rune(a), []rune(b)
	for i := 0; i < len(ra) && i < len(rb); i++ {
		if ra[i] == rb[i] {
			continue
		}
		if unicode.IsLower(ra[i]) {
			return -1
		}
		return 1
	}
	return len(ra) - len(rb)
}
