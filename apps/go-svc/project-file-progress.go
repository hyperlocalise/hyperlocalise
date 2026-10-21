package main

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
)

const maxFileProgressLocaleLength = 32

type fileProgressRow struct {
	SourcePath          string               `json:"sourcePath"`
	TranslationProgress int                  `json:"translationProgress"`
	ApprovalProgress    int                  `json:"approvalProgress"`
	Phrases             localeProgressCounts `json:"phrases"`
}

type fileProgressStats struct {
	words   localeProgressCounts
	phrases localeProgressCounts
}

func (api *projectAPI) fileProgressHandler(r *http.Request, actor projectActor) (any, int, error) {
	projectID, err := normalizedNativeProjectID(r.PathValue("projectId"))
	if err != nil {
		return nil, 0, err
	}
	locale := strings.TrimSpace(r.URL.Query().Get("locale"))
	if locale == "" || len(locale) > maxFileProgressLocaleLength {
		return nil, 0, invalidProjectPayload()
	}
	rows, err := api.fileProgress(r.Context(), actor, projectID, locale)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"files": rows}, http.StatusOK, nil
}

// fileProgress returns word-weighted translation and approval progress per
// source file for one locale. Hidden strings and callout fences are excluded,
// matching locale-progress.
func (api *projectAPI) fileProgress(ctx context.Context, actor projectActor, projectID, locale string) ([]fileProgressRow, error) {
	var exists bool
	if err := api.pool.QueryRow(ctx, `
		select exists(
			select 1 from projects p
			where p.id = $1 and p.organization_id = $2 and p.source = 'native'
				and `+formatQaProjectTeamAccessSQL(3, 4, 2)+`
		)`,
		projectID, actor.organizationID, actor.canReadAllTeams(), actor.userID,
	).Scan(&exists); err != nil {
		return nil, fmt.Errorf("get native project for file progress: %w", err)
	}
	if !exists {
		return nil, projectNotFound()
	}

	rows, err := api.pool.Query(ctx, `
		select f.source_path, k.source_text, coalesce(t.text, ''), coalesce(t.status, '')
		from project_translation_keys k
		join repository_source_files f on f.id = k.repository_source_file_id
			and f.organization_id = k.organization_id
			and f.project_id = k.project_id
		left join project_translations t on t.translation_key_id = k.id
			and t.organization_id = k.organization_id
			and t.project_id = k.project_id
			and t.target_locale = $3
		where k.organization_id = $1 and k.project_id = $2 and k.is_hidden = false
			and `+editorCatExcludeCalloutFenceSQL("k"),
		actor.organizationID, projectID, locale)
	if err != nil {
		return nil, fmt.Errorf("list native file progress: %w", err)
	}
	defer rows.Close()

	statsByPath := make(map[string]*fileProgressStats)
	for rows.Next() {
		var sourcePath, sourceText, text, status string
		if err := rows.Scan(&sourcePath, &sourceText, &text, &status); err != nil {
			return nil, fmt.Errorf("scan native file progress: %w", err)
		}
		stats := statsByPath[sourcePath]
		if stats == nil {
			stats = &fileProgressStats{}
			statsByPath[sourcePath] = stats
		}
		words := countNativeSourceWords(sourceText)
		stats.words.Total += words
		stats.phrases.Total++
		if strings.TrimSpace(text) != "" {
			stats.words.Translated += words
			stats.phrases.Translated++
		}
		if status == "approved" {
			stats.words.Approved += words
			stats.phrases.Approved++
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list native file progress: %w", err)
	}

	result := make([]fileProgressRow, 0, len(statsByPath))
	for sourcePath, stats := range statsByPath {
		// Strings with no countable words (numbers, placeholders) still count as work.
		basis := stats.words
		if basis.Total == 0 {
			basis = stats.phrases
		}
		result = append(result, fileProgressRow{
			SourcePath:          sourcePath,
			TranslationProgress: progressPercent(basis.Translated, basis.Total),
			ApprovalProgress:    progressPercent(basis.Approved, basis.Total),
			Phrases:             stats.phrases,
		})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].SourcePath < result[j].SourcePath })
	return result, nil
}
