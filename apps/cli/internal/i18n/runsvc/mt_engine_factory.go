package runsvc

import (
	"fmt"
	"os"
	"slices"
	"strings"
	"sync"

	"github.com/hyperlocalise/hyperlocalise/internal/mt"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

const (
	mtProviderGoogle = "google"
	mtProviderDeepL  = "deepl"
)

type mtEngineConstructor func(mt.Config) (mt.Engine, error)

type mtCredentialResolver func(lookupEnv func(string) (string, bool), profileName string, profile config.MTProfile) (mt.Config, error)

type mtProviderRegistration struct {
	constructor   mtEngineConstructor
	resolveConfig mtCredentialResolver
}

type MTEngineConfigError struct {
	Profile string
	Field   string
	Message string
}

func (e *MTEngineConfigError) Error() string {
	return fmt.Sprintf("mt profile %q: %s: %s", e.Profile, e.Field, e.Message)
}

// mtEngineFactory constructs and caches exactly one internal/mt.Engine per MT
// profile name, reused for the lifetime of the run that owns it.
type mtEngineFactory struct {
	profiles      map[string]config.MTProfile
	lookupEnv     func(string) (string, bool) // defaults os.LookupEnv
	registrations map[string]mtProviderRegistration

	mu      sync.Mutex
	engines map[string]mt.Engine
}

func newMTEngineFactory(profiles map[string]config.MTProfile) *mtEngineFactory {
	return &mtEngineFactory{
		profiles:      profiles,
		lookupEnv:     os.LookupEnv,
		registrations: defaultMTProviderRegistrations(),
		engines:       map[string]mt.Engine{},
	}
}

func defaultMTProviderRegistrations() map[string]mtProviderRegistration {
	return map[string]mtProviderRegistration{
		mtProviderGoogle: {
			constructor:   func(cfg mt.Config) (mt.Engine, error) { return mt.NewGoogleClient(cfg) },
			resolveConfig: resolveGoogleConfig,
		},
		mtProviderDeepL: {
			constructor:   func(cfg mt.Config) (mt.Engine, error) { return mt.NewDeepLClient(cfg) },
			resolveConfig: resolveDeepLConfig,
		},
	}
}

func (f *mtEngineFactory) BuildSelected(profileNames []string) error {
	names := dedupeStrings(profileNames)
	slices.Sort(names)
	for _, name := range names {
		if err := f.build(name); err != nil {
			return err
		}
	}
	return nil
}

func (f *mtEngineFactory) Engine(profileName string) (mt.Engine, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	engine, ok := f.engines[profileName]
	if !ok {
		return nil, &MTEngineConfigError{Profile: profileName, Field: "profile", Message: "engine was not constructed for this run"}
	}
	return engine, nil
}

func (f *mtEngineFactory) build(name string) error {
	f.mu.Lock()
	_, built := f.engines[name]
	f.mu.Unlock()
	if built {
		return nil
	}

	profile, ok := f.profiles[name]
	if !ok {
		return &MTEngineConfigError{Profile: name, Field: "profile", Message: "unknown mt profile"}
	}

	provider := strings.ToLower(strings.TrimSpace(profile.Provider))
	registration, ok := f.registrations[provider]
	if !ok {
		return &MTEngineConfigError{Profile: name, Field: "provider", Message: fmt.Sprintf("unsupported provider %q", profile.Provider)}
	}

	cfg, err := registration.resolveConfig(f.lookupEnv, name, profile)
	if err != nil {
		return err
	}

	engine, err := registration.constructor(cfg)
	if err != nil {
		return &MTEngineConfigError{Profile: name, Field: "provider", Message: err.Error()}
	}

	f.mu.Lock()
	f.engines[name] = engine
	f.mu.Unlock()
	return nil
}

func resolveGoogleConfig(lookupEnv func(string) (string, bool), profileName string, profile config.MTProfile) (mt.Config, error) {
	apiKey, err := resolveEnvValue(lookupEnv, profileName, "api_key_env", profile.APIKeyEnv)
	if err != nil {
		return mt.Config{}, err
	}
	return mt.Config{APIKey: apiKey, BaseURL: strings.TrimSpace(profile.BaseURL)}, nil
}

func resolveDeepLConfig(lookupEnv func(string) (string, bool), profileName string, profile config.MTProfile) (mt.Config, error) {
	apiKey, err := resolveEnvValue(lookupEnv, profileName, "api_key_env", profile.APIKeyEnv)
	if err != nil {
		return mt.Config{}, err
	}
	baseURL := normalizeDeepLBaseURL(profile.BaseURL)
	if baseURL != mt.DeepLProBaseURL && baseURL != mt.DeepLFreeBaseURL {
		return mt.Config{}, &MTEngineConfigError{Profile: profileName, Field: "base_url", Message: "must be the DeepL Free or Pro base URL"}
	}
	return mt.Config{APIKey: apiKey, BaseURL: baseURL}, nil
}

func normalizeDeepLBaseURL(baseURL string) string {
	return strings.TrimRight(strings.TrimSpace(baseURL), "/")
}

func resolveEnvValue(lookupEnv func(string) (string, bool), profileName, field, envName string) (string, error) {
	trimmedName := strings.TrimSpace(envName)
	if trimmedName == "" {
		return "", &MTEngineConfigError{Profile: profileName, Field: field, Message: "environment variable name must not be empty"}
	}
	value, ok := lookupEnv(trimmedName)
	if !ok {
		return "", &MTEngineConfigError{Profile: profileName, Field: field, Message: fmt.Sprintf("environment variable %q is not set", trimmedName)}
	}
	trimmedValue := strings.TrimSpace(value)
	if trimmedValue == "" {
		return "", &MTEngineConfigError{Profile: profileName, Field: field, Message: fmt.Sprintf("environment variable %q is empty", trimmedName)}
	}
	return trimmedValue, nil
}

func selectedMTProfileNames(tasks []Task) []string {
	var names []string
	for _, task := range tasks {
		if task.TranslationType != config.TranslationTypeMT {
			continue
		}
		if name := strings.TrimSpace(task.ProfileName); name != "" {
			names = append(names, name)
		}
	}
	names = dedupeStrings(names)
	slices.Sort(names)
	return names
}

func mtProfilesFromConfig(cfg *config.I18NConfig) map[string]config.MTProfile {
	if cfg == nil || cfg.MT == nil {
		return nil
	}
	return cfg.MT.Profiles
}
