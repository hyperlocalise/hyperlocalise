package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"
)

type localeProgressCounts struct {
	Total      int `json:"total"`
	Translated int `json:"translated"`
	Approved   int `json:"approved"`
}

type localeProgressRow struct {
	Locale              string               `json:"locale"`
	TranslationProgress int                  `json:"translationProgress"`
	ApprovalProgress    int                  `json:"approvalProgress"`
	Words               localeProgressCounts `json:"words"`
	Phrases             localeProgressCounts `json:"phrases"`
	LastActivityAt      *string              `json:"lastActivityAt"`
}

type localeProgressStats struct {
	translatedPhrases int
	approvedPhrases   int
	translatedWords   int
	approvedWords     int
	lastActivityAt    *time.Time
}

func (api *projectAPI) localeProgressHandler(r *http.Request, actor projectActor) (any, int, error) {
	projectID, err := normalizedNativeProjectID(r.PathValue("projectId"))
	if err != nil {
		return nil, 0, err
	}
	rows, err := api.localeProgress(r.Context(), actor, projectID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"locales": rows}, http.StatusOK, nil
}

func (api *projectAPI) localeProgress(ctx context.Context, actor projectActor, projectID string) ([]localeProgressRow, error) {
	var exists bool
	var targetLocalesRaw json.RawMessage
	if err := api.pool.QueryRow(ctx, `
		with project as (
			select p.id, p.target_locales
			from projects p
			where p.id = $1 and p.organization_id = $2 and p.source = 'native'
				and `+formatQaProjectTeamAccessSQL(3, 4, 2)+`
		)
		select exists(select 1 from project), coalesce((select target_locales from project), '[]'::jsonb)
		`,
		projectID,
		actor.organizationID,
		actor.canReadAllTeams(),
		actor.userID,
	).Scan(&exists, &targetLocalesRaw); err != nil {
		return nil, fmt.Errorf("get native project for locale progress: %w", err)
	}
	if !exists {
		return nil, projectNotFound()
	}
	var targetLocales []string
	if err := json.Unmarshal(targetLocalesRaw, &targetLocales); err != nil {
		return nil, fmt.Errorf("decode native project target locales: %w", err)
	}

	wordCountByKey, phraseTotal, wordTotal, err := api.nativeProjectSourceWordCounts(ctx, actor.organizationID, projectID)
	if err != nil {
		return nil, err
	}
	statsByLocale, err := api.nativeProjectLocaleStats(ctx, actor.organizationID, projectID, wordCountByKey)
	if err != nil {
		return nil, err
	}

	rows := make([]localeProgressRow, 0, len(targetLocales))
	seen := make(map[string]bool, len(targetLocales))
	for _, locale := range targetLocales {
		seen[locale] = true
		rows = append(rows, buildLocaleProgressRow(locale, statsByLocale[locale], wordTotal, phraseTotal))
	}
	extraLocales := make([]string, 0, len(statsByLocale))
	for locale := range statsByLocale {
		if !seen[locale] {
			extraLocales = append(extraLocales, locale)
		}
	}
	sort.Strings(extraLocales)
	for _, locale := range extraLocales {
		rows = append(rows, buildLocaleProgressRow(locale, statsByLocale[locale], wordTotal, phraseTotal))
	}
	return rows, nil
}

func (api *projectAPI) nativeProjectSourceWordCounts(
	ctx context.Context,
	organizationID, projectID string,
) (map[string]int, int, int, error) {
	rows, err := api.pool.Query(ctx, `
		select k.id, k.source_text
		from project_translation_keys k
		where k.organization_id = $1 and k.project_id = $2 and k.is_hidden = false
		  and trim(k.source_text) <> ':::' and trim(k.source_text) not like ':::callout%'
		`, organizationID, projectID)
	if err != nil {
		return nil, 0, 0, fmt.Errorf("list native project translation keys: %w", err)
	}
	defer rows.Close()

	wordCountByKey := make(map[string]int)
	phraseTotal := 0
	wordTotal := 0
	for rows.Next() {
		var keyID, sourceText string
		if err := rows.Scan(&keyID, &sourceText); err != nil {
			return nil, 0, 0, fmt.Errorf("scan native project translation key: %w", err)
		}
		count := countNativeSourceWords(sourceText)
		wordCountByKey[keyID] = count
		phraseTotal++
		wordTotal += count
	}
	if err := rows.Err(); err != nil {
		return nil, 0, 0, fmt.Errorf("list native project translation keys: %w", err)
	}
	return wordCountByKey, phraseTotal, wordTotal, nil
}

func (api *projectAPI) nativeProjectLocaleStats(
	ctx context.Context,
	organizationID, projectID string,
	wordCountByKey map[string]int,
) (map[string]*localeProgressStats, error) {
	rows, err := api.pool.Query(ctx, `
		select t.translation_key_id, t.target_locale, t.text, t.status, t.updated_at
		from project_translations t
		join project_translation_keys k on k.id = t.translation_key_id
		where t.organization_id = $1 and t.project_id = $2 and k.is_hidden = false
		  and trim(k.source_text) <> ':::' and trim(k.source_text) not like ':::callout%'
		`, organizationID, projectID)
	if err != nil {
		return nil, fmt.Errorf("list native project translations: %w", err)
	}
	defer rows.Close()

	statsByLocale := make(map[string]*localeProgressStats)
	for rows.Next() {
		var keyID, locale, text, status string
		var updatedAt time.Time
		if err := rows.Scan(&keyID, &locale, &text, &status, &updatedAt); err != nil {
			return nil, fmt.Errorf("scan native project translation: %w", err)
		}
		stats := statsByLocale[locale]
		if stats == nil {
			stats = &localeProgressStats{}
			statsByLocale[locale] = stats
		}
		wordCount := wordCountByKey[keyID]
		if strings.TrimSpace(text) != "" {
			stats.translatedPhrases++
			stats.translatedWords += wordCount
		}
		if status == "approved" {
			stats.approvedPhrases++
			stats.approvedWords += wordCount
		}
		if stats.lastActivityAt == nil || updatedAt.After(*stats.lastActivityAt) {
			t := updatedAt
			stats.lastActivityAt = &t
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list native project translations: %w", err)
	}
	return statsByLocale, nil
}

func buildLocaleProgressRow(locale string, stats *localeProgressStats, wordTotal, phraseTotal int) localeProgressRow {
	row := localeProgressRow{
		Locale:  locale,
		Words:   localeProgressCounts{Total: wordTotal},
		Phrases: localeProgressCounts{Total: phraseTotal},
	}
	if stats != nil {
		row.Words.Translated = stats.translatedWords
		row.Words.Approved = stats.approvedWords
		row.Phrases.Translated = stats.translatedPhrases
		row.Phrases.Approved = stats.approvedPhrases
		if stats.lastActivityAt != nil {
			formatted := stats.lastActivityAt.UTC().Format("2006-01-02T15:04:05.000Z")
			row.LastActivityAt = &formatted
		}
	}
	row.TranslationProgress = progressPercent(row.Words.Translated, wordTotal)
	row.ApprovalProgress = progressPercent(row.Words.Approved, wordTotal)
	return row
}

func progressPercent(completed, total int) int {
	if total <= 0 {
		return 0
	}
	percent := (completed*100 + total/2) / total
	if percent < 0 {
		return 0
	}
	if percent > 100 {
		return 100
	}
	return percent
}
