package crowdin

import (
	"context"
	"fmt"
	"strings"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// PreTranslationInput starts a Crowdin TM pre-translation job.
type PreTranslationInput struct {
	ProjectID                     string
	Languages                     []string
	FilePath                      string
	Branch                        string
	DirectoryID                   int
	AutoApproveOption             string
	DuplicateTranslations         *bool
	SkipApprovedTranslations      *bool
	TranslateUntranslatedOnly     *bool
	TranslateWithPerfectMatchOnly *bool
}

// PreTranslationResult summarizes a finished pre-translation job.
type PreTranslationResult struct {
	Identifier string `json:"identifier"`
	Status     string `json:"status"`
	Progress   int    `json:"progress"`
}

// ApplyPreTranslationAndWait starts TM pre-translation and polls until it finishes.
func (c *HTTPClient) ApplyPreTranslationAndWait(ctx context.Context, in PreTranslationInput) (PreTranslationResult, error) {
	if c == nil || c.client == nil {
		return PreTranslationResult{}, fmt.Errorf("crowdin auto-translate: client is nil")
	}
	projectID, err := parseProjectID(in.ProjectID)
	if err != nil {
		return PreTranslationResult{}, fmt.Errorf("crowdin auto-translate: %w", err)
	}
	languages := make([]string, 0, len(in.Languages))
	seen := make(map[string]struct{}, len(in.Languages))
	for _, language := range in.Languages {
		trimmed := strings.TrimSpace(language)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		languages = append(languages, trimmed)
	}
	if len(languages) == 0 {
		return PreTranslationResult{}, fmt.Errorf("crowdin auto-translate: at least one language is required")
	}

	locales, err := c.ResolveLocales(ctx, in.ProjectID, languages)
	if err != nil {
		return PreTranslationResult{}, err
	}
	languageIDs := make([]string, 0, len(locales))
	for _, locale := range locales {
		if id := strings.TrimSpace(locale.LanguageID); id != "" {
			languageIDs = append(languageIDs, id)
		}
	}
	if len(languageIDs) == 0 {
		return PreTranslationResult{}, fmt.Errorf("crowdin auto-translate: at least one language is required")
	}

	req := &model.PreTranslationRequest{
		LanguageIDs:                   languageIDs,
		Method:                        "tm",
		AutoApproveOption:             strings.TrimSpace(in.AutoApproveOption),
		DuplicateTranslations:         in.DuplicateTranslations,
		SkipApprovedTranslations:      in.SkipApprovedTranslations,
		TranslateUntranslatedOnly:     in.TranslateUntranslatedOnly,
		TranslateWithPerfectMatchOnly: in.TranslateWithPerfectMatchOnly,
	}

	filePath := strings.TrimSpace(in.FilePath)
	branch := strings.TrimSpace(in.Branch)
	scopeCount := 0
	if filePath != "" {
		scopeCount++
	}
	if in.DirectoryID > 0 {
		scopeCount++
	}
	if branch != "" && filePath == "" {
		scopeCount++
	}
	if scopeCount != 1 {
		return PreTranslationResult{}, fmt.Errorf("crowdin auto-translate: exactly one of --file, --branch, or --directory-id is required")
	}

	switch {
	case filePath != "":
		file, err := c.ResolveProjectFile(ctx, in.ProjectID, branch, filePath)
		if err != nil {
			return PreTranslationResult{}, err
		}
		req.FileIDs = []int{file.ID}
	case in.DirectoryID > 0:
		req.DirectoryIDs = []int{in.DirectoryID}
	case branch != "":
		branchID, err := c.ResolveBranch(ctx, in.ProjectID, branch)
		if err != nil {
			return PreTranslationResult{}, err
		}
		req.BranchIDs = []int{branchID}
	default:
		return PreTranslationResult{}, fmt.Errorf("crowdin auto-translate: exactly one of --file, --branch, or --directory-id is required")
	}

	started, _, err := c.client.Translations.ApplyPreTranslation(ctx, projectID, req)
	if err != nil {
		return PreTranslationResult{}, fmt.Errorf("apply pre-translation: %w", err)
	}
	if started == nil || strings.TrimSpace(started.Identifier) == "" {
		return PreTranslationResult{}, fmt.Errorf("apply pre-translation: empty identifier")
	}
	result, err := c.pollAsyncStatus(ctx, started.Identifier, started.Status, started.Progress, importPollTimeout, "pre-translation", func(ctx context.Context) (string, string, int, error) {
		status, _, err := c.client.Translations.PreTranslationStatus(ctx, projectID, started.Identifier)
		if err != nil {
			return "", "", 0, err
		}
		if status == nil {
			return "", "", 0, fmt.Errorf("empty pre-translation status")
		}
		return status.Identifier, status.Status, status.Progress, nil
	})
	if err != nil {
		return PreTranslationResult{}, err
	}
	return PreTranslationResult(result), nil
}
