package main

import (
	"context"
	"encoding/json"
	"math"
	"sort"

	"github.com/google/uuid"
)

// qaQuality mirrors TranslationQaQuality in
// apps/hyperlocalise-web/src/lib/qa/qa-scoring.ts. The web app writes it when a scan
// finishes; go-svc rewrites it when a review ignores or reopens findings.
type qaQuality struct {
	Model              string                     `json:"model"`
	Version            int                        `json:"version"`
	Threshold          float64                    `json:"threshold"`
	Score              float64                    `json:"score"`
	Passed             bool                       `json:"passed"`
	WordCount          int                        `json:"wordCount"`
	PenaltyPoints      int                        `json:"penaltyPoints"`
	CriticalCount      int                        `json:"criticalCount"`
	ByLocale           map[string]qaLocaleQuality `json:"byLocale"`
	PenaltyByDimension map[string]int             `json:"penaltyByDimension"`
	Penalties          map[string]string          `json:"penalties,omitempty"`
}

type qaLocaleQuality struct {
	Score         float64 `json:"score"`
	Passed        bool    `json:"passed"`
	WordCount     int     `json:"wordCount"`
	PenaltyPoints int     `json:"penaltyPoints"`
	CriticalCount int     `json:"criticalCount"`
}

// qaFindingTally counts a run's findings that still cost points (not ignored).
type qaFindingTally struct {
	CheckType string
	Severity  string
	Locale    string
	Count     int
}

// qaMqmWeights are the MQM 2.0 severity multipliers (MQM_SEVERITY_WEIGHTS).
var qaMqmWeights = map[string]int{"minor": 1, "major": 5, "critical": 25}

// qaCheckDimensions mirrors QA_CHECK_DIMENSIONS.
var qaCheckDimensions = map[string]string{
	"not_localized": "accuracy", "whitespace_only": "accuracy", "same_as_source": "accuracy",
	"numbers_mismatch": "accuracy", "quality_estimate": "accuracy",
	"glossary_violation": "terminology",
	"spelling":           "linguistic_conventions", "punctuation_mismatch": "linguistic_conventions",
	"character_case_mismatch": "linguistic_conventions",
	"guideline":               "style",
	"unreachable_plural_case": "locale_conventions",
	"length":                  "design_and_markup", "placeholder_mismatch": "design_and_markup",
	"escaped_char_mismatch": "design_and_markup", "format": "design_and_markup",
}

// qaRoundScore matches Math.round(value * 100) / 100 for non-negative values.
func qaRoundScore(value float64) float64 {
	return math.Floor(value*100+0.5) / 100
}

// qaMqmScore mirrors mqmScore: 100 × (1 − penalty ÷ words), floored at 0.
func qaMqmScore(penaltyPoints, wordCount int) float64 {
	if wordCount <= 0 {
		if penaltyPoints > 0 {
			return 0
		}
		return 100
	}
	return qaRoundScore(math.Max(0, 100*(1-float64(penaltyPoints)/float64(wordCount))))
}

func qaFindingSeverity(tally qaFindingTally, penalties map[string]string) string {
	if severity, ok := penalties[tally.CheckType]; ok {
		if _, known := qaMqmWeights[severity]; known {
			return severity
		}
	}
	if tally.Severity == "error" {
		return "major"
	}
	return "minor"
}

// rescoreQaQuality recomputes a stored score from the run's remaining findings. Word counts
// and the threshold stay as the scan stored them. Penalties come from the scan's snapshot,
// or from the project's current policy for scans stored before snapshots existed.
func rescoreQaQuality(quality qaQuality, tallies []qaFindingTally, fallbackPenalties map[string]string) qaQuality {
	penalties := quality.Penalties
	if penalties == nil {
		penalties = fallbackPenalties
	}
	type localePenalty struct{ points, critical int }
	byLocale := map[string]*localePenalty{}
	byDimension := map[string]int{}
	for _, tally := range tallies {
		severity := qaFindingSeverity(tally, penalties)
		points := qaMqmWeights[severity] * tally.Count
		current := byLocale[tally.Locale]
		if current == nil {
			current = &localePenalty{}
			byLocale[tally.Locale] = current
		}
		current.points += points
		if severity == "critical" {
			current.critical += tally.Count
		}
		if dimension, ok := qaCheckDimensions[tally.CheckType]; ok {
			byDimension[dimension] += points
		}
	}

	locales := map[string]struct{}{}
	for locale := range quality.ByLocale {
		locales[locale] = struct{}{}
	}
	for locale := range byLocale {
		locales[locale] = struct{}{}
	}
	sorted := make([]string, 0, len(locales))
	for locale := range locales {
		sorted = append(sorted, locale)
	}
	sort.Strings(sorted)

	next := quality
	next.ByLocale = make(map[string]qaLocaleQuality, len(sorted))
	next.PenaltyByDimension = byDimension
	next.WordCount, next.PenaltyPoints, next.CriticalCount = 0, 0, 0
	next.Passed = true
	for _, locale := range sorted {
		words := quality.ByLocale[locale].WordCount
		penalty := localePenalty{}
		if current := byLocale[locale]; current != nil {
			penalty = *current
		}
		score := qaMqmScore(penalty.points, words)
		row := qaLocaleQuality{
			Score:         score,
			Passed:        score >= quality.Threshold && penalty.critical == 0,
			WordCount:     words,
			PenaltyPoints: penalty.points,
			CriticalCount: penalty.critical,
		}
		next.ByLocale[locale] = row
		next.WordCount += words
		next.PenaltyPoints += penalty.points
		next.CriticalCount += penalty.critical
		next.Passed = next.Passed && row.Passed
	}
	next.Score = qaMqmScore(next.PenaltyPoints, next.WordCount)
	return next
}

// rescoreQaRunsForFindings rewrites the stored score of every scored run holding one of the
// reviewed findings, so ignoring or reopening a finding updates the score at once.
func rescoreQaRunsForFindings(ctx context.Context, db dictionaryDB, organizationID string, findingIDs []uuid.UUID) error {
	rows, err := db.Query(ctx, `select r.id, r.summary->'quality', p.qa_scoring_policy
        from translation_qa_runs r
        join projects p on p.id = r.project_id and p.organization_id = r.organization_id
        where r.organization_id = $1 and r.summary ? 'quality'
        and r.id in (select f.run_id from translation_qa_findings f
            where f.organization_id = $1 and f.id = any($2::uuid[]))`, organizationID, findingIDs)
	if err != nil {
		return err
	}
	type scoredRun struct {
		id      uuid.UUID
		quality qaQuality
		policy  []byte
	}
	var runs []scoredRun
	for rows.Next() {
		var run scoredRun
		var raw []byte
		if err := rows.Scan(&run.id, &raw, &run.policy); err != nil {
			rows.Close()
			return err
		}
		if err := json.Unmarshal(raw, &run.quality); err != nil {
			continue
		}
		runs = append(runs, run)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, run := range runs {
		tallyRows, err := db.Query(ctx, `select check_type, severity, target_locale, count(*)::int
            from translation_qa_findings where run_id = $1 and status <> 'ignored'
            group by check_type, severity, target_locale`, run.id)
		if err != nil {
			return err
		}
		var tallies []qaFindingTally
		for tallyRows.Next() {
			var tally qaFindingTally
			if err := tallyRows.Scan(&tally.CheckType, &tally.Severity, &tally.Locale, &tally.Count); err != nil {
				tallyRows.Close()
				return err
			}
			tallies = append(tallies, tally)
		}
		tallyRows.Close()
		if err := tallyRows.Err(); err != nil {
			return err
		}
		next := rescoreQaQuality(run.quality, tallies, resolveQaScoringSetting(run.policy).Penalties)
		encoded, err := json.Marshal(next)
		if err != nil {
			return err
		}
		if _, err := db.Exec(ctx, `update translation_qa_runs
            set summary = jsonb_set(summary, '{quality}', $2::jsonb), updated_at = now()
            where id = $1`, run.id, encoded); err != nil {
			return err
		}
	}
	return nil
}
