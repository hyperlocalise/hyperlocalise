package crowdin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

type FileClient interface {
	ResolveLocales(ctx context.Context, projectID string, requested []string) ([]ResolvedLocale, error)
	ResolveBranch(ctx context.Context, projectID, branch string) (int, error)
	EnsureDirectory(ctx context.Context, projectID string, branchID int, path string) (int, error)
	FindDirectory(ctx context.Context, projectID string, branchID int, path string) (int, error)
	UpsertSourceFile(ctx context.Context, projectID string, branchID, directoryID int, name, localPath string, group storage.FileGroupSpec) (int, error)
	FindFile(ctx context.Context, projectID string, branchID, directoryID int, name string) (int, error)
	UploadTranslationFile(ctx context.Context, projectID, languageID string, fileID int, localPath string) error
	DownloadSourceFile(ctx context.Context, projectID string, fileID int) ([]byte, error)
	DownloadTranslationFile(ctx context.Context, projectID string, fileID int, languageID string, opts storage.FileExportOptions) ([]byte, error)
}

type ResolvedLocale struct {
	LanguageID string
	Locale     string
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
		SupportsSourceDownload:    true,
		SupportsTranslationUpload: true,
		SupportsTranslationExport: true,
	}
}

func (a *FileAdapter) UploadSources(ctx context.Context, req storage.FileUploadSourcesRequest) (storage.FileOperationResult, error) {
	config := a.effectiveConfig(req.Config)
	branchID, err := a.resolveBranchID(ctx, config)
	if err != nil {
		return storage.FileOperationResult{}, err
	}
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
			dirID, name, err := a.ensureRemoteLocation(ctx, config.ProjectID, branchID, remotePath)
			if err != nil {
				return storage.FileOperationResult{Processed: processed}, err
			}
			if _, err := a.client.UpsertSourceFile(ctx, config.ProjectID, branchID, dirID, name, sourcePath, group); err != nil {
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
	branchID, err := a.resolveBranchID(ctx, config)
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
			dirID, name, err := a.findRemoteLocation(ctx, config.ProjectID, branchID, remotePath)
			if err != nil {
				return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
			}
			fileID, err := a.client.FindFile(ctx, config.ProjectID, branchID, dirID, name)
			if err != nil {
				return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
			}
			for _, locale := range locales {
				if _, isExcluded := excluded[locale.Locale]; isExcluded {
					skipped = append(skipped, remotePath+"@"+locale.Locale)
					continue
				}
				translationPath, err := renderCrowdinTranslationPath(config.BasePath, group.Translation, locale.Locale, sourcePath, group.LanguagesMapping)
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
				if err := a.client.UploadTranslationFile(ctx, config.ProjectID, locale.LanguageID, fileID, translationPath); err != nil {
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
	branchID, err := a.resolveBranchID(ctx, config)
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
			dirID, name, err := a.findRemoteLocation(ctx, config.ProjectID, branchID, remotePath)
			if err != nil {
				return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
			}
			fileID, err := a.client.FindFile(ctx, config.ProjectID, branchID, dirID, name)
			if err != nil {
				return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
			}
			if req.IncludeSources {
				payload, err := a.client.DownloadSourceFile(ctx, config.ProjectID, fileID)
				if err != nil {
					return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
				}
				if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
					return storage.FileOperationResult{Processed: processed, Skipped: skipped}, fmt.Errorf("mkdir source output: %w", err)
				}
				if err := os.WriteFile(sourcePath, payload, 0o644); err != nil {
					return storage.FileOperationResult{Processed: processed, Skipped: skipped}, fmt.Errorf("write source output: %w", err)
				}
				processed = append(processed, sourcePath)
			}
			for _, locale := range locales {
				if _, isExcluded := excluded[locale.Locale]; isExcluded {
					skipped = append(skipped, remotePath+"@"+locale.Locale)
					continue
				}
				exportOptions := effectiveFileExportOptions(group.Export, req.ExportOverrides)
				if req.MergeApproved {
					exportOnlyApproved := true
					skipUntranslatedStrings := true
					exportOptions.ExportOnlyApproved = &exportOnlyApproved
					exportOptions.SkipUntranslatedStrings = &skipUntranslatedStrings
				}
				payload, err := a.client.DownloadTranslationFile(ctx, config.ProjectID, fileID, locale.LanguageID, exportOptions)
				if err != nil {
					return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
				}
				targetPath, err := renderCrowdinTranslationPath(config.BasePath, group.Translation, locale.Locale, sourcePath, group.LanguagesMapping)
				if err != nil {
					return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
				}
				if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
					return storage.FileOperationResult{Processed: processed, Skipped: skipped}, fmt.Errorf("mkdir translation output: %w", err)
				}
				if req.MergeApproved {
					payload, err = mergeApprovedJSONFile(targetPath, payload)
					if err != nil {
						return storage.FileOperationResult{Processed: processed, Skipped: skipped}, err
					}
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

func effectiveFileExportOptions(base storage.FileExportOptions, overrides *storage.FileExportOptions) storage.FileExportOptions {
	if overrides == nil {
		return base
	}
	if overrides.SkipUntranslatedStrings != nil {
		base.SkipUntranslatedStrings = overrides.SkipUntranslatedStrings
	}
	if overrides.SkipUntranslatedFiles != nil {
		base.SkipUntranslatedFiles = overrides.SkipUntranslatedFiles
	}
	if overrides.ExportOnlyApproved != nil {
		base.ExportOnlyApproved = overrides.ExportOnlyApproved
	}
	return base
}

func mergeApprovedJSONFile(targetPath string, approvedPayload []byte) ([]byte, error) {
	approved, err := decodeOrderedJSONObject(approvedPayload)
	if err != nil {
		return nil, fmt.Errorf("merge approved translations: downloaded payload for %s must be a JSON object: %w", targetPath, err)
	}
	if len(approved) == 0 {
		if existing, err := os.ReadFile(targetPath); err == nil {
			return existing, nil
		} else if !os.IsNotExist(err) {
			return nil, fmt.Errorf("merge approved translations: read existing translation file: %w", err)
		}
	}

	var merged orderedJSONObject
	if existing, err := os.ReadFile(targetPath); err == nil {
		merged, err = decodeOrderedJSONObject(existing)
		if err != nil {
			return nil, fmt.Errorf("merge approved translations: existing file %s must be a JSON object: %w", targetPath, err)
		}
	} else if !os.IsNotExist(err) {
		return nil, fmt.Errorf("merge approved translations: read existing translation file: %w", err)
	}

	merged, err = mergeOrderedJSONObjects(merged, approved)
	if err != nil {
		return nil, fmt.Errorf("merge approved translations: merge nested JSON objects: %w", err)
	}
	payload := formatOrderedJSONObject(merged, 0)
	return append(payload, '\n'), nil
}

type orderedJSONMember struct {
	key   string
	value json.RawMessage
}

type orderedJSONObject []orderedJSONMember

func decodeOrderedJSONObject(payload []byte) (orderedJSONObject, error) {
	dec := json.NewDecoder(bytes.NewReader(payload))

	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	delim, ok := tok.(json.Delim)
	if !ok || delim != '{' {
		return nil, fmt.Errorf("root value is %T, not object", tok)
	}

	var obj orderedJSONObject
	for dec.More() {
		tok, err := dec.Token()
		if err != nil {
			return nil, err
		}
		key, ok := tok.(string)
		if !ok {
			return nil, fmt.Errorf("object key is %T, not string", tok)
		}
		var value json.RawMessage
		if err := dec.Decode(&value); err != nil {
			return nil, err
		}
		obj = append(obj, orderedJSONMember{key: key, value: value})
	}

	tok, err = dec.Token()
	if err != nil {
		return nil, err
	}
	delim, ok = tok.(json.Delim)
	if !ok || delim != '}' {
		return nil, fmt.Errorf("object is not closed")
	}
	if _, err := dec.Token(); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("payload contains trailing JSON tokens")
		}
		return nil, err
	}
	return obj, nil
}

func mergeOrderedJSONObjects(existing, approved orderedJSONObject) (orderedJSONObject, error) {
	merged := append(orderedJSONObject(nil), existing...)
	for _, approvedMember := range approved {
		existingIndex := orderedJSONObjectIndex(merged, approvedMember.key)
		if existingIndex == -1 {
			merged = append(merged, orderedJSONMember{key: approvedMember.key, value: append(json.RawMessage(nil), approvedMember.value...)})
			continue
		}
		existingMember := merged[existingIndex]
		if !isJSONObject(existingMember.value) || !isJSONObject(approvedMember.value) {
			merged[existingIndex].value = append(json.RawMessage(nil), approvedMember.value...)
			continue
		}
		existingObject, err := decodeOrderedJSONObject(existingMember.value)
		if err != nil {
			return nil, err
		}
		approvedObject, err := decodeOrderedJSONObject(approvedMember.value)
		if err != nil {
			return nil, err
		}
		nested, err := mergeOrderedJSONObjects(existingObject, approvedObject)
		if err != nil {
			return nil, err
		}
		merged[existingIndex].value = formatOrderedJSONObject(nested, 0)
	}
	return merged, nil
}

func orderedJSONObjectIndex(obj orderedJSONObject, key string) int {
	for i, member := range obj {
		if member.key == key {
			return i
		}
	}
	return -1
}

func isJSONObject(payload []byte) bool {
	trimmed := bytes.TrimSpace(payload)
	return len(trimmed) > 0 && trimmed[0] == '{'
}

func formatOrderedJSONObject(obj orderedJSONObject, level int) []byte {
	if len(obj) == 0 {
		return []byte("{}")
	}

	indent := strings.Repeat("  ", level)
	childIndent := strings.Repeat("  ", level+1)
	var buf bytes.Buffer
	buf.WriteString("{\n")
	for i, member := range obj {
		if i > 0 {
			buf.WriteString(",\n")
		}
		buf.WriteString(childIndent)
		buf.WriteString(strconv.Quote(member.key))
		buf.WriteString(": ")
		buf.Write(formatOrderedJSONValue(member.value, level+1))
	}
	buf.WriteByte('\n')
	buf.WriteString(indent)
	buf.WriteByte('}')
	return buf.Bytes()
}

func formatOrderedJSONValue(payload []byte, level int) []byte {
	if isJSONObject(payload) {
		obj, err := decodeOrderedJSONObject(payload)
		if err == nil {
			return formatOrderedJSONObject(obj, level)
		}
	}

	var buf bytes.Buffer
	indent := strings.Repeat("  ", level)
	if err := json.Indent(&buf, payload, indent, "  "); err == nil {
		return buf.Bytes()
	}
	return bytes.TrimSpace(payload)
}

func (a *FileAdapter) effectiveConfig(cfg storage.FileWorkflowConfig) storage.FileWorkflowConfig {
	if len(cfg.Files) != 0 {
		return cfg
	}
	return a.cfg
}

func (a *FileAdapter) resolveBranchID(ctx context.Context, cfg storage.FileWorkflowConfig) (int, error) {
	branch := strings.TrimSpace(cfg.Branch)
	if branch == "" {
		return 0, nil
	}
	return a.client.ResolveBranch(ctx, cfg.ProjectID, branch)
}

func (a *FileAdapter) ensureRemoteLocation(ctx context.Context, projectID string, branchID int, remotePath string) (int, string, error) {
	dirPath := filepath.ToSlash(filepath.Dir(remotePath))
	if dirPath == "." {
		dirPath = ""
	}
	dirID, err := a.client.EnsureDirectory(ctx, projectID, branchID, dirPath)
	if err != nil {
		return 0, "", err
	}
	return dirID, filepath.Base(remotePath), nil
}

func (a *FileAdapter) findRemoteLocation(ctx context.Context, projectID string, branchID int, remotePath string) (int, string, error) {
	dirPath := filepath.ToSlash(filepath.Dir(remotePath))
	if dirPath == "." {
		dirPath = ""
	}
	dirID, err := a.client.FindDirectory(ctx, projectID, branchID, dirPath)
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
	targetPath := crowdinLocalPath(basePath, rendered)
	relative, err := filepath.Rel(basePath, targetPath)
	if err != nil {
		return "", fmt.Errorf("resolve translation relative path: %w", err)
	}
	relative = filepath.ToSlash(relative)
	if relative == ".." || strings.HasPrefix(relative, "../") {
		return "", fmt.Errorf("translation path %q escapes base path %q", targetPath, basePath)
	}
	return targetPath, nil
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
		case '[':
			charClass, width := parseGlobCharClass(pattern[i:])
			b.WriteString(charClass)
			i += width
			continue
		default:
			b.WriteString(regexp.QuoteMeta(pattern[i : i+1]))
		}
		i++
	}
	b.WriteString("$")
	return regexp.Compile(b.String())
}

func parseGlobCharClass(pattern string) (string, int) {
	if len(pattern) < 2 {
		return `\[`, 1
	}

	var b strings.Builder
	b.WriteByte('[')
	i := 1

	switch pattern[i] {
	case '!', '^':
		b.WriteByte('^')
		i++
	}

	if i < len(pattern) && pattern[i] == ']' {
		b.WriteString(`\]`)
		i++
	}

	for ; i < len(pattern); i++ {
		ch := pattern[i]
		if ch == '/' {
			return `\[`, 1
		}
		if ch == ']' {
			b.WriteByte(']')
			return b.String(), i + 1
		}
		if ch == '\\' {
			b.WriteString(`\\`)
			continue
		}
		b.WriteByte(ch)
	}

	return `\[`, 1
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
