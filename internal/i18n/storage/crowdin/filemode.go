package crowdin

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

type FileClient interface {
	ResolveLocales(ctx context.Context, projectID string, requested []string) ([]string, error)
	EnsureDirectory(ctx context.Context, projectID, path string) (int, error)
	UpsertSourceFile(ctx context.Context, projectID string, directoryID int, name, localPath string, group storage.FileGroupSpec) (int, error)
	FindFile(ctx context.Context, projectID string, directoryID int, name string) (int, error)
	UploadTranslationFile(ctx context.Context, projectID, languageID string, fileID int, localPath string) error
	DownloadTranslationFile(ctx context.Context, projectID string, fileID int, languageID string, opts storage.FileExportOptions) ([]byte, error)
}

type FileAdapter struct {
	cfg    storage.FileWorkflowConfig
	client FileClient
}

func NewFileAdapter(cfg storage.FileWorkflowConfig) (*FileAdapter, error) {
	httpClient, err := NewHTTPClient(Config{
		ProjectID:  cfg.ProjectID,
		APIToken:   cfg.APIToken,
		APIBaseURL: cfg.APIBaseURL,
	})
	if err != nil {
		return nil, err
	}
	return NewFileAdapterWithClient(cfg, httpClient)
}

func NewFileAdapterWithClient(cfg storage.FileWorkflowConfig, client FileClient) (*FileAdapter, error) {
	if strings.TrimSpace(cfg.ProjectID) == "" {
		return nil, fmt.Errorf("crowdin file adapter: project id is required")
	}
	if strings.TrimSpace(cfg.APIToken) == "" {
		return nil, fmt.Errorf("crowdin file adapter: api token is required")
	}
	if strings.TrimSpace(cfg.BasePath) == "" {
		cfg.BasePath = "."
	}
	if client == nil {
		return nil, fmt.Errorf("crowdin file adapter: client must not be nil")
	}
	return &FileAdapter{cfg: cfg, client: client}, nil
}

func (a *FileAdapter) Name() string { return AdapterName }

func (a *FileAdapter) FileWorkflowCapabilities() storage.FileWorkflowCapabilities {
	return storage.FileWorkflowCapabilities{
		SupportsSourceUpload:      true,
		SupportsTranslationUpload: true,
		SupportsTranslationExport: true,
	}
}

func (a *FileAdapter) UploadSources(ctx context.Context, req storage.FileUploadSourcesRequest) (storage.FileOperationResult, error) {
	config := a.effectiveConfig(req.Config)
	processed := make([]string, 0)
	for _, group := range config.Files {
		sourcePaths, err := resolveCrowdinSourcePaths(config.BasePath, group.Source)
		if err != nil {
			return storage.FileOperationResult{Processed: processed}, err
		}
		for _, sourcePath := range sourcePaths {
			remotePath, err := sourceRemotePath(config, sourcePath)
			if err != nil {
				return storage.FileOperationResult{Processed: processed}, err
			}
			dirID, name, err := a.ensureRemoteLocation(ctx, config.ProjectID, remotePath)
			if err != nil {
				return storage.FileOperationResult{Processed: processed}, err
			}
			if _, err := a.client.UpsertSourceFile(ctx, config.ProjectID, dirID, name, sourcePath, group); err != nil {
				return storage.FileOperationResult{Processed: processed}, err
			}
			processed = append(processed, remotePath)
		}
	}
	slices.Sort(processed)
	return storage.FileOperationResult{Processed: processed}, nil
}

func (a *FileAdapter) UploadTranslations(ctx context.Context, req storage.FileUploadTranslationsRequest) (storage.FileOperationResult, error) {
	config := a.effectiveConfig(req.Config)
	locales, err := a.client.ResolveLocales(ctx, config.ProjectID, req.Languages)
	if err != nil {
		return storage.FileOperationResult{}, err
	}

	processed := make([]string, 0)
	skipped := make([]string, 0)

	for _, group := range config.Files {
		sourcePaths, err := resolveCrowdinSourcePaths(config.BasePath, group.Source)
		if err != nil {
			return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
		}
		excluded := makeStringSet(group.ExcludedTargetLanguages)
		for _, sourcePath := range sourcePaths {
			remotePath, err := sourceRemotePath(config, sourcePath)
			if err != nil {
				return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
			}
			dirID, name, err := a.ensureRemoteLocation(ctx, config.ProjectID, remotePath)
			if err != nil {
				return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
			}
			fileID, err := a.client.FindFile(ctx, config.ProjectID, dirID, name)
			if err != nil {
				return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
			}
			for _, locale := range locales {
				if _, isExcluded := excluded[locale]; isExcluded {
					skipped = append(skipped, remotePath+"@"+locale)
					continue
				}
				translationPath, err := renderCrowdinTranslationPath(config.BasePath, group.Translation, locale, sourcePath, group.LanguagesMapping)
				if err != nil {
					return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
				}
				if _, statErr := os.Stat(translationPath); statErr != nil {
					if os.IsNotExist(statErr) {
						skipped = append(skipped, translationPath)
						continue
					}
					return storage.FileOperationResult{Processed: processed, Skipped: skipped}, fmt.Errorf("stat translation file: %w", statErr)
				}
				if err := a.client.UploadTranslationFile(ctx, config.ProjectID, locale, fileID, translationPath); err != nil {
					return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
				}
				processed = append(processed, translationPath)
			}
		}
	}

	slices.Sort(processed)
	slices.Sort(skipped)
	return storage.FileOperationResult{Processed: processed, Skipped: skipped}, nil
}

func (a *FileAdapter) DownloadTranslations(ctx context.Context, req storage.FileDownloadTranslationsRequest) (storage.FileOperationResult, error) {
	config := a.effectiveConfig(req.Config)
	locales, err := a.client.ResolveLocales(ctx, config.ProjectID, req.Languages)
	if err != nil {
		return storage.FileOperationResult{}, err
	}

	processed := make([]string, 0)
	skipped := make([]string, 0)

	for _, group := range config.Files {
		sourcePaths, err := resolveCrowdinSourcePaths(config.BasePath, group.Source)
		if err != nil {
			return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
		}
		excluded := makeStringSet(group.ExcludedTargetLanguages)
		for _, sourcePath := range sourcePaths {
			remotePath, err := sourceRemotePath(config, sourcePath)
			if err != nil {
				return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
			}
			dirID, name, err := a.ensureRemoteLocation(ctx, config.ProjectID, remotePath)
			if err != nil {
				return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
			}
			fileID, err := a.client.FindFile(ctx, config.ProjectID, dirID, name)
			if err != nil {
				return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
			}
			for _, locale := range locales {
				if _, isExcluded := excluded[locale]; isExcluded {
					skipped = append(skipped, remotePath+"@"+locale)
					continue
				}
				payload, err := a.client.DownloadTranslationFile(ctx, config.ProjectID, fileID, locale, group.Export)
				if err != nil {
					return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
				}
				targetPath, err := renderCrowdinTranslationPath(config.BasePath, group.Translation, locale, sourcePath, group.LanguagesMapping)
				if err != nil {
					return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
				}
				if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
					return storage.FileOperationResult{Processed: processed, Skipped: skipped}, fmt.Errorf("mkdir translation output: %w", err)
				}
				if err := os.WriteFile(targetPath, payload, 0o644); err != nil {
					return storage.FileOperationResult{Processed: processed, Skipped: skipped}, fmt.Errorf("write translation output: %w", err)
				}
				processed = append(processed, targetPath)
			}
		}
	}

	slices.Sort(processed)
	slices.Sort(skipped)
	return storage.FileOperationResult{Processed: processed, Skipped: skipped}, nil
}

func (a *FileAdapter) effectiveConfig(cfg storage.FileWorkflowConfig) storage.FileWorkflowConfig {
	if len(cfg.Files) != 0 {
		return cfg
	}
	return a.cfg
}

func (a *FileAdapter) ensureRemoteLocation(ctx context.Context, projectID, remotePath string) (int, string, error) {
	dirPath := filepath.ToSlash(filepath.Dir(remotePath))
	if dirPath == "." {
		dirPath = ""
	}
	dirID, err := a.client.EnsureDirectory(ctx, projectID, dirPath)
	if err != nil {
		return 0, "", err
	}
	return dirID, filepath.Base(remotePath), nil
}

func sourceRemotePath(cfg storage.FileWorkflowConfig, sourcePath string) (string, error) {
	relative, err := filepath.Rel(cfg.BasePath, sourcePath)
	if err != nil {
		return "", fmt.Errorf("resolve source relative path: %w", err)
	}
	relative = filepath.ToSlash(relative)
	if relative == ".." || strings.HasPrefix(relative, "../") {
		return "", fmt.Errorf("source path %q escapes base path %q", sourcePath, cfg.BasePath)
	}
	if !cfg.PreserveHierarchy {
		return filepath.Base(relative), nil
	}
	return relative, nil
}

func renderCrowdinTranslationPath(basePath, pattern, locale, sourcePath string, mappings map[string]map[string]string) (string, error) {
	sourceRel, err := filepath.Rel(basePath, sourcePath)
	if err != nil {
		return "", fmt.Errorf("resolve source relative path: %w", err)
	}
	rendered := crowdinPlaceholderRE.ReplaceAllStringFunc(pattern, func(token string) string {
		match := crowdinPlaceholderRE.FindStringSubmatch(token)
		if len(match) != 2 {
			return token
		}
		if value, ok := supportedCrowdinPlaceholderValue(match[1], locale, filepath.ToSlash(sourceRel), mappings); ok {
			return value
		}
		return token
	})
	if crowdinPlaceholderRE.MatchString(rendered) {
		return "", fmt.Errorf("unsupported placeholder remains in translation path %q", rendered)
	}
	return crowdinLocalPath(basePath, rendered), nil
}

func crowdinLocalPath(basePath, pattern string) string {
	trimmed := strings.TrimPrefix(filepath.ToSlash(pattern), "/")
	return filepath.Clean(filepath.Join(basePath, filepath.FromSlash(trimmed)))
}

func resolveCrowdinSourcePaths(basePath, pattern string) ([]string, error) {
	localPattern := crowdinLocalPath(basePath, pattern)
	if !strings.ContainsAny(localPattern, "*?[") {
		return []string{localPattern}, nil
	}
	if !strings.Contains(localPattern, "**") {
		matches, err := filepath.Glob(localPattern)
		if err != nil {
			return nil, err
		}
		slices.Sort(matches)
		return matches, nil
	}
	re, err := globToRegex(filepath.ToSlash(localPattern))
	if err != nil {
		return nil, err
	}
	baseDir := baseDirForDoublestar(localPattern)
	matches := make([]string, 0)
	err = filepath.WalkDir(baseDir, func(candidate string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		if re.MatchString(filepath.ToSlash(candidate)) {
			matches = append(matches, candidate)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	slices.Sort(matches)
	return matches, nil
}

func baseDirForDoublestar(pattern string) string {
	normalized := filepath.ToSlash(pattern)
	idx := strings.Index(normalized, "**")
	if idx == -1 {
		return filepath.Dir(pattern)
	}
	prefix := strings.TrimSuffix(normalized[:idx], "/")
	if prefix == "" {
		return "."
	}
	return filepath.FromSlash(prefix)
}

func globToRegex(pattern string) (*regexp.Regexp, error) {
	var b strings.Builder
	b.WriteString("^")
	for i := 0; i < len(pattern); {
		switch pattern[i] {
		case '*':
			if i+1 < len(pattern) && pattern[i+1] == '*' {
				if i+2 < len(pattern) && pattern[i+2] == '/' {
					b.WriteString("(?:.*/)?")
					i += 3
					continue
				}
				b.WriteString(".*")
				i += 2
				continue
			}
			b.WriteString("[^/]*")
		case '?':
			b.WriteString("[^/]")
		default:
			b.WriteString(regexp.QuoteMeta(pattern[i : i+1]))
		}
		i++
	}
	b.WriteString("$")
	return regexp.Compile(b.String())
}

func makeStringSet(values []string) map[string]struct{} {
	if len(values) == 0 {
		return nil
	}
	out := make(map[string]struct{}, len(values))
	for _, value := range values {
		out[value] = struct{}{}
	}
	return out
}
