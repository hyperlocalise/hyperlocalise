package main

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"time"
)

// A job's match-band analysis for API clients: units by target language, step and translation
// memory match band, read from the same Reports rows as the task's Report tab. Money stays in the
// session-authenticated Reports routes.

type publicJobAnalysisStep struct {
	Step   string `json:"step"`
	Status string `json:"status"`
	// Some strings have no match band (the memory could not be read), so counts are not exact.
	Incomplete bool   `json:"incomplete"`
	UpdatedAt  string `json:"updatedAt"`
}

type publicJobAnalysisLocale struct {
	TargetLocale string             `json:"targetLocale"`
	Step         string             `json:"step"`
	Bands        map[string]float64 `json:"bands"`
	Total        float64            `json:"total"`
}

type publicJobAnalysisEnvelope struct {
	JobID   string                    `json:"jobId"`
	Unit    string                    `json:"unit"`
	Bands   []string                  `json:"bands"`
	Steps   []publicJobAnalysisStep   `json:"steps"`
	Locales []publicJobAnalysisLocale `json:"locales"`
}

func publicJobAnalysisInvalidQuery() error {
	return publicAPIFailure(http.StatusBadRequest, "invalid_analysis_query", "Analysis query is invalid")
}

// parsePublicJobAnalysisUnit reads an optional single unit, words by default.
func parsePublicJobAnalysisUnit(r *http.Request) (string, bool) {
	values, given := r.URL.Query()["unit"]
	if !given {
		return "words", true
	}
	if len(values) != 1 || !slices.Contains(reportingUnitOptions, values[0]) {
		return "", false
	}
	return values[0], true
}

func (api *publicJobsAPI) analysis(w http.ResponseWriter, r *http.Request) {
	unit, ok := parsePublicJobAnalysisUnit(r)
	if !ok {
		api.auth.writeError(w, r, "query", publicJobAnalysisInvalidQuery())
		return
	}
	job, ok := api.loadByPath(w, r)
	if !ok {
		return
	}
	principal, _ := publicAPIPrincipalFrom(r.Context())
	analysis, err := api.loadAnalysis(r.Context(), principal.organizationID, job.id, unit)
	if err != nil {
		api.auth.writeError(w, r, "analysis", err)
		return
	}
	writePublicJobJSON(w, r, map[string]publicJobAnalysisEnvelope{"analysis": analysis})
}

func (api *publicJobsAPI) loadAnalysis(ctx context.Context, organizationID, jobID, unit string) (publicJobAnalysisEnvelope, error) {
	analysis := publicJobAnalysisEnvelope{
		JobID:   jobID,
		Unit:    unit,
		Bands:   slices.Clone(reportingMatchBucket),
		Steps:   []publicJobAnalysisStep{},
		Locales: []publicJobAnalysisLocale{},
	}
	pool := api.auth.pool
	if pool == nil {
		return analysis, publicJobsUnavailable()
	}

	rows, err := pool.Query(ctx, `select step, status, incomplete, updated_at
        from reporting_task_analyses where organization_id = $1 and job_id = $2`, organizationID, jobID)
	if err != nil {
		return analysis, publicAPIInternalFailure(fmt.Errorf("read job analysis: %w", err))
	}
	defer rows.Close()
	now := time.Now()
	for rows.Next() {
		var step publicJobAnalysisStep
		var updatedAt time.Time
		if err := rows.Scan(&step.Step, &step.Status, &step.Incomplete, &updatedAt); err != nil {
			return analysis, publicAPIInternalFailure(fmt.Errorf("scan job analysis: %w", err))
		}
		// Same rule as the Report tab: a pending analysis that has gone quiet has stopped.
		if step.Status == "pending" && now.Sub(updatedAt) > reportingTaskAnalysisStale {
			step.Status = "failed"
		}
		step.UpdatedAt = formatPublicJobTime(updatedAt)
		analysis.Steps = append(analysis.Steps, step)
	}
	if err := rows.Err(); err != nil {
		return analysis, publicAPIInternalFailure(fmt.Errorf("read job analysis: %w", err))
	}
	slices.SortFunc(analysis.Steps, func(a, b publicJobAnalysisStep) int {
		return slices.Index(reportingStepOptions, a.Step) - slices.Index(reportingStepOptions, b.Step)
	})

	words, err := queryReportingTaskWords(ctx, pool, organizationID, jobID, unit)
	if err != nil {
		return analysis, publicAPIInternalFailure(err)
	}
	for _, row := range words.Rows {
		// Every band is present, so clients can read a band without checking for it.
		bands := make(map[string]float64, len(reportingMatchBucket))
		for _, band := range reportingMatchBucket {
			bands[band] = row.Bands[band]
		}
		analysis.Locales = append(analysis.Locales, publicJobAnalysisLocale{
			TargetLocale: row.TargetLocale,
			Step:         row.Step,
			Bands:        bands,
			Total:        row.Total,
		})
	}
	return analysis, nil
}
