package crowdin

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
	"gopkg.in/yaml.v3"
)

const (
	defaultCrowdinConfigPath    = "crowdin.yml"
	defaultCrowdinConfigPathAlt = "crowdin.yaml"
	defaultIdentityPath         = ".crowdin.yml"
	defaultProjectIDEnvName     = "CROWDIN_PROJECT_ID"
	defaultAPITokenEnvName      = "CROWDIN_PERSONAL_TOKEN"
	legacyAPITokenEnvName       = "CROWDIN_API_TOKEN"
	defaultBaseURLEnvName       = "CROWDIN_BASE_URL"
	defaultBasePathEnvName      = "CROWDIN_BASE_PATH"
)

var crowdinPlaceholderRE = regexp.MustCompile(`%([A-Za-z0-9_]+)%`)

type fileConfigYAML struct {
	ProjectID         any                             `yaml:"project_id"`
	ProjectIDEnv      string                          `yaml:"project_id_env"`
	APIToken          string                          `yaml:"api_token"`
	APITokenEnv       string                          `yaml:"api_token_env"`
	BaseURL           string                          `yaml:"base_url"`
	BaseURLEnv        string                          `yaml:"base_url_env"`
	BasePath          string                          `yaml:"base_path"`
	BasePathEnv       string                          `yaml:"base_path_env"`
	PreserveHierarchy bool                            `yaml:"preserve_hierarchy"`
	Files             []fileGroupYAML                 `yaml:"files"`
}

type identityConfigYAML struct {
	ProjectID    any    `yaml:"project_id"`
	ProjectIDEnv string `yaml:"project_id_env"`
	APIToken     string `yaml:"api_token"`
	APITokenEnv  string `yaml:"api_token_env"`
	BaseURL      string `yaml:"base_url"`
	BaseURLEnv   string `yaml:"base_url_env"`
}

type fileGroupYAML struct {
	Source                  string                       `yaml:"source"`
	Translation             string                       `yaml:"translation"`
	LanguagesMapping        map[string]map[string]string `yaml:"languages_mapping"`
	ExcludedTargetLanguages []string                     `yaml:"excluded_target_languages"`
	SkipUntranslatedStrings bool                         `yaml:"skip_untranslated_strings"`
	SkipUntranslatedFiles   bool                         `yaml:"skip_untranslated_files"`
	ExportOnlyApproved      bool                         `yaml:"export_only_approved"`
}

// ResolveFileConfigPath resolves the project crowdin config path.
func ResolveFileConfigPath(path string) (string, error) {
	if strings.TrimSpace(path) != "" {
		return path, nil
	}
	if _, err := os.Stat(defaultCrowdinConfigPath); err == nil {
		return defaultCrowdinConfigPath, nil
	}
	if _, err := os.Stat(defaultCrowdinConfigPathAlt); err == nil {
		return defaultCrowdinConfigPathAlt, nil
	}
	return "", fmt.Errorf("open crowdin config: neither %s nor %s exists", defaultCrowdinConfigPath, defaultCrowdinConfigPathAlt)
}

// LoadFileWorkflowConfig loads and validates crowdin.yml into normalized file-mode config.
func LoadFileWorkflowConfig(path, identityPath string) (storage.FileWorkflowConfig, error) {
	resolvedPath, err := ResolveFileConfigPath(path)
	if err != nil {
		return storage.FileWorkflowConfig{}, err
	}

	projectCfg, err := decodeYAMLFile[fileConfigYAML](resolvedPath)
	if err != nil {
		return storage.FileWorkflowConfig{}, err
	}

	identityCfg, err := loadIdentityConfig(identityPath)
	if err != nil {
		return storage.FileWorkflowConfig{}, err
	}

	cfgDir := filepath.Dir(resolvedPath)
	cfg, err := normalizeFileWorkflowConfig(projectCfg, identityCfg, cfgDir)
	if err != nil {
		return storage.FileWorkflowConfig{}, err
	}
	return cfg, nil
}

func loadIdentityConfig(path string) (identityConfigYAML, error) {
	if strings.TrimSpace(path) != "" {
		return decodeYAMLFile[identityConfigYAML](path)
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return identityConfigYAML{}, nil
	}
	defaultPath := filepath.Join(home, defaultIdentityPath)
	if _, statErr := os.Stat(defaultPath); statErr != nil {
		if os.IsNotExist(statErr) {
			return identityConfigYAML{}, nil
		}
		return identityConfigYAML{}, fmt.Errorf("open crowdin identity: %w", statErr)
	}

	return decodeYAMLFile[identityConfigYAML](defaultPath)
}

func decodeYAMLFile[T any](path string) (T, error) {
	var out T
	content, err := os.ReadFile(path)
	if err != nil {
		return out, fmt.Errorf("open crowdin config: %w", err)
	}
	dec := yaml.NewDecoder(bytes.NewReader(content))
	dec.KnownFields(true)
	if err := dec.Decode(&out); err != nil {
		return out, fmt.Errorf("decode crowdin config: %w", err)
	}
	return out, nil
}

func normalizeFileWorkflowConfig(raw fileConfigYAML, identity identityConfigYAML, cfgDir string) (storage.FileWorkflowConfig, error) {
	projectID, err := resolveProjectID(raw, identity)
	if err != nil {
		return storage.FileWorkflowConfig{}, err
	}
	apiToken, err := resolveAPIToken(raw, identity)
	if err != nil {
		return storage.FileWorkflowConfig{}, err
	}
	baseURL, err := resolveBaseURL(raw, identity)
	if err != nil {
		return storage.FileWorkflowConfig{}, err
	}
	basePath := resolveBasePath(raw, cfgDir)

	if len(raw.Files) == 0 {
		return storage.FileWorkflowConfig{}, fmt.Errorf("crowdin config: files must not be empty")
	}

	files := make([]storage.FileGroupSpec, 0, len(raw.Files))
	for idx, file := range raw.Files {
		group, groupErr := normalizeFileGroup(file)
		if groupErr != nil {
			return storage.FileWorkflowConfig{}, fmt.Errorf("crowdin config: files[%d]: %w", idx, groupErr)
		}
		files = append(files, group)
	}

	return storage.FileWorkflowConfig{
		ProjectID:         projectID,
		APIToken:          apiToken,
		APIBaseURL:        baseURL,
		BasePath:          basePath,
		PreserveHierarchy: raw.PreserveHierarchy,
		Files:             files,
	}, nil
}

func normalizeFileGroup(raw fileGroupYAML) (storage.FileGroupSpec, error) {
	if strings.TrimSpace(raw.Source) == "" {
		return storage.FileGroupSpec{}, fmt.Errorf("source is required")
	}
	if strings.TrimSpace(raw.Translation) == "" {
		return storage.FileGroupSpec{}, fmt.Errorf("translation is required")
	}
	if err := validateTranslationPlaceholders(raw.Translation, raw.LanguagesMapping); err != nil {
		return storage.FileGroupSpec{}, err
	}
	excluded := normalizeDistinct(raw.ExcludedTargetLanguages)
	return storage.FileGroupSpec{
		Source:                  raw.Source,
		Translation:             raw.Translation,
		LanguagesMapping:        raw.LanguagesMapping,
		ExcludedTargetLanguages: excluded,
		Export: storage.FileExportOptions{
			SkipUntranslatedStrings: raw.SkipUntranslatedStrings,
			SkipUntranslatedFiles:   raw.SkipUntranslatedFiles,
			ExportOnlyApproved:      raw.ExportOnlyApproved,
		},
	}, nil
}

func validateTranslationPlaceholders(pattern string, languageMappings map[string]map[string]string) error {
	matches := crowdinPlaceholderRE.FindAllStringSubmatch(pattern, -1)
	for _, match := range matches {
		name := match[1]
		if _, ok := supportedCrowdinPlaceholderValue(name, "", "", nil); ok {
			continue
		}
		if _, ok := languageMappings[name]; ok {
			continue
		}
		return fmt.Errorf("unsupported placeholder %q in translation pattern", "%"+name+"%")
	}
	return nil
}

func supportedCrowdinPlaceholderValue(name, locale, sourceRel string, languageMappings map[string]map[string]string) (string, bool) {
	if locale != "" {
		if mapped := lookupLanguageMapping(languageMappings, name, locale); mapped != "" {
			return mapped, true
		}
	}

	switch name {
	case "locale", "language":
		return locale, true
	case "locale_with_underscore":
		return strings.ReplaceAll(locale, "-", "_"), true
	case "two_letters_code":
		return twoLetterLocaleCode(locale), true
	case "original_file_name":
		return filepath.Base(sourceRel), true
	case "file_name":
		base := filepath.Base(sourceRel)
		return strings.TrimSuffix(base, filepath.Ext(base)), true
	case "file_extension":
		return strings.TrimPrefix(filepath.Ext(sourceRel), "."), true
	case "original_path":
		dir := filepath.Dir(filepath.ToSlash(sourceRel))
		if dir == "." {
			return "", true
		}
		return dir, true
	default:
		return "", false
	}
}

func lookupLanguageMapping(mappings map[string]map[string]string, placeholder, locale string) string {
	if len(mappings) == 0 {
		return ""
	}
	byLocale, ok := mappings[placeholder]
	if !ok {
		return ""
	}
	if value := strings.TrimSpace(byLocale[locale]); value != "" {
		return value
	}
	if value := strings.TrimSpace(byLocale[twoLetterLocaleCode(locale)]); value != "" {
		return value
	}
	return ""
}

func twoLetterLocaleCode(locale string) string {
	locale = strings.TrimSpace(locale)
	if locale == "" {
		return ""
	}
	split := strings.FieldsFunc(locale, func(r rune) bool { return r == '-' || r == '_' })
	if len(split) == 0 {
		return locale
	}
	return split[0]
}

func resolveProjectID(raw fileConfigYAML, identity identityConfigYAML) (string, error) {
	if value := normalizeScalar(identity.ProjectID); value != "" {
		if err := validateProjectID(value); err != nil {
			return "", err
		}
		return value, nil
	}
	if value := normalizeScalar(raw.ProjectID); value != "" {
		if err := validateProjectID(value); err != nil {
			return "", err
		}
		return value, nil
	}
	envName := firstNonEmpty(identity.ProjectIDEnv, raw.ProjectIDEnv, defaultProjectIDEnvName)
	value := strings.TrimSpace(os.Getenv(envName))
	if value == "" {
		return "", fmt.Errorf("crowdin config: project_id is required (%s)", envName)
	}
	if err := validateProjectID(value); err != nil {
		return "", err
	}
	return value, nil
}

func resolveAPIToken(raw fileConfigYAML, identity identityConfigYAML) (string, error) {
	if value := strings.TrimSpace(identity.APIToken); value != "" {
		return value, nil
	}
	if value := strings.TrimSpace(raw.APIToken); value != "" {
		return value, nil
	}
	for _, envName := range []string{
		firstNonEmpty(identity.APITokenEnv, raw.APITokenEnv),
		defaultAPITokenEnvName,
		legacyAPITokenEnvName,
	} {
		if value := strings.TrimSpace(os.Getenv(envName)); value != "" {
			return value, nil
		}
	}
	return "", fmt.Errorf("crowdin config: api_token is required (%s)", defaultAPITokenEnvName)
}

func resolveBaseURL(raw fileConfigYAML, identity identityConfigYAML) (string, error) {
	value := firstNonEmpty(identity.BaseURL, raw.BaseURL)
	if value == "" {
		envName := firstNonEmpty(identity.BaseURLEnv, raw.BaseURLEnv, defaultBaseURLEnvName)
		value = strings.TrimSpace(os.Getenv(envName))
	}
	if strings.TrimSpace(value) == "" {
		return "", nil
	}
	return normalizeAPIBaseURL(value)
}

func resolveBasePath(raw fileConfigYAML, cfgDir string) string {
	value := strings.TrimSpace(raw.BasePath)
	if value == "" {
		envName := firstNonEmpty(raw.BasePathEnv, defaultBasePathEnvName)
		value = strings.TrimSpace(os.Getenv(envName))
	}
	if value == "" {
		value = "."
	}
	if !filepath.IsAbs(value) {
		value = filepath.Join(cfgDir, value)
	}
	return filepath.Clean(value)
}

func validateProjectID(value string) error {
	projectID, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || projectID <= 0 {
		return fmt.Errorf("crowdin config: project_id must be a positive integer")
	}
	return nil
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

func normalizeDistinct(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
	}
	slices.Sort(out)
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
