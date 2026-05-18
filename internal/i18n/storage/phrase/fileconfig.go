package phrase

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	defaultPhraseConfigPath      = ".phrase.yml"
	defaultPhraseAppConfigEnvVar = "PHRASEAPP_CONFIG"
	defaultPhraseAccessTokenEnv  = "PHRASE_ACCESS_TOKEN"
)

var phrasePlaceholderRE = regexp.MustCompile(`<([A-Za-z0-9_]+)>`)

// CLIConfig is the normalized subset of Phrase's .phrase.yml used by the CLI.
type CLIConfig struct {
	ProjectID     string
	APIToken      string
	APIBaseURL    string
	FileFormat    string
	BasePath      string
	LocaleMapping map[string]string
	PushSources   []CLIPushSource
	PullTargets   []CLIPullTarget
}

// CLIPushSource describes one phrase.push.sources[] entry.
type CLIPushSource struct {
	File                  string
	ProjectID             string
	FileFormat            string
	LocaleID              string
	Branch                string
	Tags                  []string
	UpdateTranslations    *bool
	UpdateTranslationKeys *bool
	UpdateDescriptions    *bool
	SkipUploadTags        *bool
	SkipUnverification    *bool
	FileEncoding          string
	LocaleMapping         map[string]any
	FormatOptions         map[string]any
	Autotranslate         *bool
	MarkReviewed          *bool
}

// CLIPullTarget describes one phrase.pull.targets[] entry.
type CLIPullTarget struct {
	File                          string
	ProjectID                     string
	FileFormat                    string
	LocaleID                      string
	Branch                        string
	Tags                          []string
	IncludeEmptyTranslations      *bool
	ExcludeEmptyZeroForms         *bool
	IncludeTranslatedKeys         *bool
	KeepNotranslateTags           *bool
	Encoding                      string
	IncludeUnverifiedTranslations *bool
	UseLastReviewedVersion        *bool
	FallbackLocaleID              string
	FormatOptions                 map[string]any
	SourceLocaleID                string
	TranslationKeyPrefix          string
	FilterByPrefix                *bool
	UseLocaleFallback             *bool
	SkipUnverifiedTranslations    *bool
}

type cliConfigFileYAML struct {
	Phrase cliConfigYAML `yaml:"phrase"`
}

type cliConfigYAML struct {
	AccessToken   string         `yaml:"access_token"`
	ProjectID     any            `yaml:"project_id"`
	FileFormat    string         `yaml:"file_format"`
	Host          string         `yaml:"host"`
	LocaleMapping map[string]any `yaml:"locale_mapping"`
	Push          cliPushYAML    `yaml:"push"`
	Pull          cliPullYAML    `yaml:"pull"`
}

type cliPushYAML struct {
	Sources []cliPushSourceYAML `yaml:"sources"`
}

type cliPullYAML struct {
	Targets []cliPullTargetYAML `yaml:"targets"`
}

type cliPushSourceYAML struct {
	File      string         `yaml:"file"`
	ProjectID any            `yaml:"project_id"`
	Params    map[string]any `yaml:"params"`
}

type cliPullTargetYAML struct {
	File      string         `yaml:"file"`
	ProjectID any            `yaml:"project_id"`
	Params    map[string]any `yaml:"params"`
}

// ResolveCLIConfigPath resolves a Phrase CLI config using the documented lookup points.
func ResolveCLIConfigPath(path string) (string, error) {
	if strings.TrimSpace(path) != "" {
		return path, nil
	}
	if envPath := strings.TrimSpace(os.Getenv(defaultPhraseAppConfigEnvVar)); envPath != "" {
		return envPath, nil
	}
	if _, err := os.Stat(defaultPhraseConfigPath); err == nil {
		return defaultPhraseConfigPath, nil
	} else if err != nil && !os.IsNotExist(err) {
		return "", fmt.Errorf("open phrase config: %w", err)
	}
	home, err := os.UserHomeDir()
	if err == nil {
		homeConfig := filepath.Join(home, defaultPhraseConfigPath)
		if _, statErr := os.Stat(homeConfig); statErr == nil {
			return homeConfig, nil
		} else if statErr != nil && !os.IsNotExist(statErr) {
			return "", fmt.Errorf("open phrase config: %w", statErr)
		}
	}
	return "", fmt.Errorf("open phrase config: no --config, %s, %s, or $HOME/%s found", defaultPhraseAppConfigEnvVar, defaultPhraseConfigPath, defaultPhraseConfigPath)
}

// LoadCLIConfig loads and normalizes Phrase's .phrase.yml config.
func LoadCLIConfig(path string) (CLIConfig, string, error) {
	resolvedPath, err := ResolveCLIConfigPath(path)
	if err != nil {
		return CLIConfig{}, "", err
	}
	raw, err := decodeCLIConfigFile(resolvedPath)
	if err != nil {
		return CLIConfig{}, "", err
	}
	cfg, err := normalizeCLIConfig(raw.Phrase, filepath.Dir(resolvedPath))
	if err != nil {
		return CLIConfig{}, "", err
	}
	return cfg, resolvedPath, nil
}

// RequireAPIToken returns a usable access token or a command-specific error.
func (c CLIConfig) RequireAPIToken(action string) (string, error) {
	if token := strings.TrimSpace(c.APIToken); token != "" {
		return token, nil
	}
	return "", fmt.Errorf("%s: API token is required (phrase.access_token, %s, or %s)", action, defaultPhraseAccessTokenEnv, defaultTokenEnvName)
}

// HasLocalePlaceholder reports whether a Phrase config path contains a locale placeholder.
func HasLocalePlaceholder(pattern string) bool {
	for _, match := range phrasePlaceholderRE.FindAllStringSubmatch(pattern, -1) {
		switch match[1] {
		case "locale_name", "locale_code":
			return true
		}
	}
	return false
}

// HasTagPlaceholder reports whether a Phrase config path contains a tag placeholder.
func HasTagPlaceholder(pattern string) bool {
	for _, match := range phrasePlaceholderRE.FindAllStringSubmatch(pattern, -1) {
		switch match[1] {
		case "tag", "tags":
			return true
		}
	}
	return false
}

// ExpandCLIFilePath expands Phrase CLI placeholders in a configured path.
func ExpandCLIFilePath(pattern, locale, tag string, localeMapping map[string]string) (string, error) {
	var expandErr error
	expanded := phrasePlaceholderRE.ReplaceAllStringFunc(pattern, func(value string) string {
		if expandErr != nil {
			return value
		}
		match := phrasePlaceholderRE.FindStringSubmatch(value)
		if len(match) != 2 {
			return value
		}
		switch match[1] {
		case "locale_name":
			if strings.TrimSpace(locale) == "" {
				expandErr = fmt.Errorf("placeholder %q requires a locale", value)
				return value
			}
			return LocaleNameForPath(locale, localeMapping)
		case "locale_code":
			if strings.TrimSpace(locale) == "" {
				expandErr = fmt.Errorf("placeholder %q requires a locale", value)
				return value
			}
			return strings.TrimSpace(locale)
		case "tag", "tags":
			if strings.TrimSpace(tag) == "" {
				expandErr = fmt.Errorf("placeholder %q requires a tag", value)
				return value
			}
			return strings.TrimSpace(tag)
		default:
			expandErr = fmt.Errorf("unsupported placeholder %q in phrase config path", value)
			return value
		}
	})
	if expandErr != nil {
		return "", expandErr
	}
	return expanded, nil
}

// LocaleNameForPath returns the configured path value for a Phrase locale.
func LocaleNameForPath(locale string, localeMapping map[string]string) string {
	trimmed := strings.TrimSpace(locale)
	if mapped := strings.TrimSpace(localeMapping[trimmed]); mapped != "" {
		return mapped
	}
	return trimmed
}

// ResolveCLIFilePath resolves a config-relative file path.
func ResolveCLIFilePath(basePath, path string) string {
	path = strings.TrimSpace(path)
	if filepath.IsAbs(path) {
		return filepath.Clean(path)
	}
	basePath = strings.TrimSpace(basePath)
	if basePath == "" {
		basePath = "."
	}
	return filepath.Clean(filepath.Join(basePath, path))
}

// SplitCLITags normalizes Phrase tag params.
func SplitCLITags(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(values))
	tags := make([]string, 0, len(values))
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			tag := strings.TrimSpace(part)
			if tag == "" {
				continue
			}
			if _, exists := seen[tag]; exists {
				continue
			}
			seen[tag] = struct{}{}
			tags = append(tags, tag)
		}
	}
	return tags
}

func decodeCLIConfigFile(path string) (cliConfigFileYAML, error) {
	var out cliConfigFileYAML
	content, err := os.ReadFile(path)
	if err != nil {
		return out, fmt.Errorf("open phrase config: %w", err)
	}
	dec := yaml.NewDecoder(bytes.NewReader(content))
	if err := dec.Decode(&out); err != nil {
		return out, fmt.Errorf("decode phrase config: %w", err)
	}
	if normalizeScalar(out.Phrase.ProjectID) == "" && strings.TrimSpace(out.Phrase.AccessToken) == "" && strings.TrimSpace(out.Phrase.FileFormat) == "" && len(out.Phrase.Push.Sources) == 0 && len(out.Phrase.Pull.Targets) == 0 {
		return out, fmt.Errorf("phrase config: phrase section is required")
	}
	return out, nil
}

func normalizeCLIConfig(raw cliConfigYAML, cfgDir string) (CLIConfig, error) {
	projectID := normalizeScalar(raw.ProjectID)
	fileFormat := strings.TrimSpace(raw.FileFormat)
	basePath := filepath.Clean(cfgDir)
	localeMapping := normalizeStringMap(raw.LocaleMapping)
	cfg := CLIConfig{
		ProjectID:     projectID,
		APIToken:      resolvePhraseAccessToken(raw.AccessToken),
		APIBaseURL:    strings.TrimSpace(raw.Host),
		FileFormat:    fileFormat,
		BasePath:      basePath,
		LocaleMapping: localeMapping,
	}

	for idx, source := range raw.Push.Sources {
		normalized, err := normalizeCLIPushSource(source, cfg)
		if err != nil {
			return CLIConfig{}, fmt.Errorf("phrase config: push.sources[%d]: %w", idx, err)
		}
		cfg.PushSources = append(cfg.PushSources, normalized)
	}
	for idx, target := range raw.Pull.Targets {
		normalized, err := normalizeCLIPullTarget(target, cfg)
		if err != nil {
			return CLIConfig{}, fmt.Errorf("phrase config: pull.targets[%d]: %w", idx, err)
		}
		cfg.PullTargets = append(cfg.PullTargets, normalized)
	}
	return cfg, nil
}

func normalizeCLIPushSource(raw cliPushSourceYAML, cfg CLIConfig) (CLIPushSource, error) {
	file := strings.TrimSpace(raw.File)
	if file == "" {
		return CLIPushSource{}, fmt.Errorf("file is required")
	}
	if err := validatePhraseConfigPath(file); err != nil {
		return CLIPushSource{}, err
	}
	projectID := firstNonEmpty(normalizeScalar(raw.ProjectID), cfg.ProjectID)
	if projectID == "" {
		return CLIPushSource{}, fmt.Errorf("project_id is required")
	}
	fileFormat := firstNonEmpty(stringParam(raw.Params, "file_format"), cfg.FileFormat)
	if fileFormat == "" {
		return CLIPushSource{}, fmt.Errorf("file_format is required")
	}
	return CLIPushSource{
		File:                  file,
		ProjectID:             projectID,
		FileFormat:            fileFormat,
		LocaleID:              stringParam(raw.Params, "locale_id"),
		Branch:                stringParam(raw.Params, "branch"),
		Tags:                  tagsParam(raw.Params, "tags"),
		UpdateTranslations:    boolParam(raw.Params, "update_translations"),
		UpdateTranslationKeys: boolParam(raw.Params, "update_translation_keys"),
		UpdateDescriptions:    boolParam(raw.Params, "update_descriptions"),
		SkipUploadTags:        boolParam(raw.Params, "skip_upload_tags"),
		SkipUnverification:    boolParam(raw.Params, "skip_unverification"),
		FileEncoding:          stringParam(raw.Params, "file_encoding"),
		LocaleMapping:         mapParam(raw.Params, "locale_mapping"),
		FormatOptions:         mapParam(raw.Params, "format_options"),
		Autotranslate:         boolParam(raw.Params, "autotranslate"),
		MarkReviewed:          boolParam(raw.Params, "mark_reviewed"),
	}, nil
}

func normalizeCLIPullTarget(raw cliPullTargetYAML, cfg CLIConfig) (CLIPullTarget, error) {
	file := strings.TrimSpace(raw.File)
	if file == "" {
		return CLIPullTarget{}, fmt.Errorf("file is required")
	}
	if err := validatePhraseConfigPath(file); err != nil {
		return CLIPullTarget{}, err
	}
	projectID := firstNonEmpty(normalizeScalar(raw.ProjectID), cfg.ProjectID)
	if projectID == "" {
		return CLIPullTarget{}, fmt.Errorf("project_id is required")
	}
	fileFormat := firstNonEmpty(stringParam(raw.Params, "file_format"), cfg.FileFormat)
	if fileFormat == "" {
		return CLIPullTarget{}, fmt.Errorf("file_format is required")
	}
	return CLIPullTarget{
		File:                          file,
		ProjectID:                     projectID,
		FileFormat:                    fileFormat,
		LocaleID:                      stringParam(raw.Params, "locale_id"),
		Branch:                        stringParam(raw.Params, "branch"),
		Tags:                          tagsParam(raw.Params, "tags"),
		IncludeEmptyTranslations:      boolParam(raw.Params, "include_empty_translations"),
		ExcludeEmptyZeroForms:         boolParam(raw.Params, "exclude_empty_zero_forms"),
		IncludeTranslatedKeys:         boolParam(raw.Params, "include_translated_keys"),
		KeepNotranslateTags:           boolParam(raw.Params, "keep_notranslate_tags"),
		Encoding:                      stringParam(raw.Params, "encoding"),
		IncludeUnverifiedTranslations: boolParam(raw.Params, "include_unverified_translations"),
		UseLastReviewedVersion:        boolParam(raw.Params, "use_last_reviewed_version"),
		FallbackLocaleID:              stringParam(raw.Params, "fallback_locale_id"),
		FormatOptions:                 mapParam(raw.Params, "format_options"),
		SourceLocaleID:                stringParam(raw.Params, "source_locale_id"),
		TranslationKeyPrefix:          stringParam(raw.Params, "translation_key_prefix"),
		FilterByPrefix:                boolParam(raw.Params, "filter_by_prefix"),
		UseLocaleFallback:             boolParam(raw.Params, "use_locale_fallback"),
		SkipUnverifiedTranslations:    boolParam(raw.Params, "skip_unverified_translations"),
	}, nil
}

func validatePhraseConfigPath(path string) error {
	normalized := filepath.ToSlash(strings.TrimSpace(path))
	for _, segment := range strings.Split(normalized, "/") {
		if segment == ".." {
			return fmt.Errorf("path must not contain parent directory traversal")
		}
	}
	return nil
}

func resolvePhraseAccessToken(value string) string {
	value = strings.TrimSpace(value)
	if envName, ok := envReference(value); ok {
		return strings.TrimSpace(os.Getenv(envName))
	}
	if value != "" {
		return value
	}
	if token := strings.TrimSpace(os.Getenv(defaultPhraseAccessTokenEnv)); token != "" {
		return token
	}
	return strings.TrimSpace(os.Getenv(defaultTokenEnvName))
}

func envReference(value string) (string, bool) {
	if strings.HasPrefix(value, "${") && strings.HasSuffix(value, "}") && len(value) > 3 {
		return strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(value, "${"), "}")), true
	}
	if strings.HasPrefix(value, "$") && len(value) > 1 {
		return strings.TrimSpace(strings.TrimPrefix(value, "$")), true
	}
	return "", false
}

func normalizeScalar(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case uint64:
		return strconv.FormatUint(typed, 10)
	case string:
		return strings.TrimSpace(typed)
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func normalizeStringMap(values map[string]any) map[string]string {
	if len(values) == 0 {
		return nil
	}
	out := make(map[string]string, len(values))
	for key, value := range values {
		if trimmedKey := strings.TrimSpace(key); trimmedKey != "" {
			out[trimmedKey] = normalizeScalar(value)
		}
	}
	return out
}

func stringParam(params map[string]any, key string) string {
	if len(params) == 0 {
		return ""
	}
	return normalizeScalar(params[key])
}

func boolParam(params map[string]any, key string) *bool {
	if len(params) == 0 {
		return nil
	}
	value, ok := params[key]
	if !ok {
		return nil
	}
	switch typed := value.(type) {
	case bool:
		return &typed
	case string:
		parsed, err := strconv.ParseBool(strings.TrimSpace(typed))
		if err != nil {
			return nil
		}
		return &parsed
	default:
		return nil
	}
}

func tagsParam(params map[string]any, key string) []string {
	if len(params) == 0 {
		return nil
	}
	value, ok := params[key]
	if !ok {
		return nil
	}
	switch typed := value.(type) {
	case string:
		return SplitCLITags([]string{typed})
	case []string:
		return SplitCLITags(typed)
	case []any:
		values := make([]string, 0, len(typed))
		for _, item := range typed {
			values = append(values, normalizeScalar(item))
		}
		return SplitCLITags(values)
	default:
		return nil
	}
}

func mapParam(params map[string]any, key string) map[string]any {
	if len(params) == 0 {
		return nil
	}
	value, ok := params[key]
	if !ok {
		return nil
	}
	switch typed := value.(type) {
	case map[string]any:
		return typed
	case map[any]any:
		out := make(map[string]any, len(typed))
		for key, value := range typed {
			out[normalizeScalar(key)] = value
		}
		return out
	default:
		return nil
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
