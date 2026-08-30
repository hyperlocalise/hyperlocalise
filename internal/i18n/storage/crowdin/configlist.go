package crowdin

import (
	"cmp"
	"fmt"
	"slices"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

// ConfiguredSource is a local source path resolved from crowdin.yml.
type ConfiguredSource struct {
	Path string `json:"path"`
}

// ConfiguredTranslation is a local translation path resolved from crowdin.yml.
type ConfiguredTranslation struct {
	LanguageID string `json:"languageId"`
	Locale     string `json:"locale"`
	Path       string `json:"path"`
}

// ListConfiguredSources expands files[].source patterns against the local workspace.
func ListConfiguredSources(cfg storage.FileWorkflowConfig) ([]ConfiguredSource, error) {
	if strings.TrimSpace(cfg.BasePath) == "" {
		cfg.BasePath = "."
	}
	baseRoot, err := canonicalCrowdinBasePath(cfg.BasePath)
	if err != nil {
		return nil, err
	}
	paths := make([]string, 0)
	seen := make(map[string]struct{})
	for _, group := range cfg.Files {
		sourcePaths, err := resolveCrowdinSourcePaths(cfg.BasePath, group.Source)
		if err != nil {
			return nil, err
		}
		for _, sourcePath := range sourcePaths {
			if err := validateCrowdinContainedPath(baseRoot, sourcePath); err != nil {
				return nil, fmt.Errorf("source path %q: %w", sourcePath, err)
			}
			if _, ok := seen[sourcePath]; ok {
				continue
			}
			seen[sourcePath] = struct{}{}
			paths = append(paths, sourcePath)
		}
	}
	slices.Sort(paths)
	out := make([]ConfiguredSource, 0, len(paths))
	for _, path := range paths {
		out = append(out, ConfiguredSource{Path: path})
	}
	return out, nil
}

// ListConfiguredTranslationPaths expands files[].translation for the given locales.
func ListConfiguredTranslationPaths(cfg storage.FileWorkflowConfig, locales []ResolvedLocale) ([]ConfiguredTranslation, error) {
	if strings.TrimSpace(cfg.BasePath) == "" {
		cfg.BasePath = "."
	}
	baseRoot, err := canonicalCrowdinBasePath(cfg.BasePath)
	if err != nil {
		return nil, err
	}
	out := make([]ConfiguredTranslation, 0)
	seen := make(map[string]struct{})
	for _, group := range cfg.Files {
		sourcePaths, err := resolveCrowdinSourcePaths(cfg.BasePath, group.Source)
		if err != nil {
			return nil, err
		}
		excluded := makeStringSet(group.ExcludedTargetLanguages)
		for _, sourcePath := range sourcePaths {
			if err := validateCrowdinContainedPath(baseRoot, sourcePath); err != nil {
				return nil, fmt.Errorf("source path %q: %w", sourcePath, err)
			}
			for _, locale := range locales {
				if isExcludedTargetLanguage(excluded, locale) {
					continue
				}
				targetPath, err := renderCrowdinTranslationPath(cfg.BasePath, group.Translation, locale.Locale, sourcePath, group.LanguagesMapping)
				if err != nil {
					return nil, err
				}
				if err := validateCrowdinContainedPath(baseRoot, targetPath); err != nil {
					return nil, fmt.Errorf("translation path %q: %w", targetPath, err)
				}
				key := locale.LanguageID + "\x00" + targetPath
				if _, ok := seen[key]; ok {
					continue
				}
				seen[key] = struct{}{}
				out = append(out, ConfiguredTranslation{
					LanguageID: locale.LanguageID,
					Locale:     locale.Locale,
					Path:       targetPath,
				})
			}
		}
	}
	slices.SortStableFunc(out, func(left, right ConfiguredTranslation) int {
		if left.LanguageID != right.LanguageID {
			return cmp.Compare(left.LanguageID, right.LanguageID)
		}
		return cmp.Compare(left.Path, right.Path)
	})
	return out, nil
}
