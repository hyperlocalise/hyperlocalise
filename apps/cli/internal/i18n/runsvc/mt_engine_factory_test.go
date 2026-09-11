package runsvc

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/mt"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

// fakeMTEngine is a no-op mt.Engine used to prove no live network calls happen.
type fakeMTEngine struct{ id string }

func (f *fakeMTEngine) Translate(context.Context, mt.Request) (mt.Response, error) {
	panic("fakeMTEngine.Translate must never be called by these tests")
}

// fakeConstructor records every call (and the mt.Config it received) so tests
// can assert call counts and captured config without hitting the network.
type fakeConstructor struct {
	calls   int
	configs []mt.Config
	engine  mt.Engine
	err     error
}

func (c *fakeConstructor) construct(cfg mt.Config) (mt.Engine, error) {
	c.calls++
	c.configs = append(c.configs, cfg)
	if c.err != nil {
		return nil, c.err
	}
	return c.engine, nil
}

func lookupEnvFromMap(values map[string]string) func(string) (string, bool) {
	return func(name string) (string, bool) {
		value, ok := values[name]
		return value, ok
	}
}

func newTestMTEngineFactory(profiles map[string]config.MTProfile, lookupEnv func(string) (string, bool), registrations map[string]mtProviderRegistration) *mtEngineFactory {
	return &mtEngineFactory{
		profiles:      profiles,
		lookupEnv:     lookupEnv,
		registrations: registrations,
		engines:       map[string]mt.Engine{},
	}
}

func TestMTEngineFactoryBuildSelectedGoogleResolvesCredentialsAndInvokesConstructor(t *testing.T) {
	profiles := map[string]config.MTProfile{
		"google-default": {Provider: "Google", APIKeyEnv: " GOOGLE_TRANSLATE_API_KEY "},
	}
	lookupEnv := lookupEnvFromMap(map[string]string{"GOOGLE_TRANSLATE_API_KEY": "  google-secret  "})
	engine := &fakeMTEngine{id: "google-engine"}
	ctor := &fakeConstructor{engine: engine}
	registrations := map[string]mtProviderRegistration{
		mtProviderGoogle: {constructor: ctor.construct, resolveConfig: resolveGoogleConfig},
	}

	f := newTestMTEngineFactory(profiles, lookupEnv, registrations)

	if err := f.BuildSelected([]string{"google-default"}); err != nil {
		t.Fatalf("BuildSelected: %v", err)
	}
	if ctor.calls != 1 {
		t.Fatalf("constructor calls=%d, want 1", ctor.calls)
	}
	want := mt.Config{APIKey: "google-secret"}
	if ctor.configs[0] != want {
		t.Fatalf("constructed config=%+v, want %+v", ctor.configs[0], want)
	}

	got, err := f.Engine("google-default")
	if err != nil {
		t.Fatalf("Engine: %v", err)
	}
	if got != engine {
		t.Fatalf("Engine returned %+v, want the cached fake engine", got)
	}
}

func TestMTEngineFactoryBuildSelectedDeepLResolvesCredentialsAndBaseURL(t *testing.T) {
	profiles := map[string]config.MTProfile{
		"deepl-pro": {Provider: "deepl", APIKeyEnv: "DEEPL_API_KEY", BaseURL: mt.DeepLProBaseURL},
	}
	lookupEnv := lookupEnvFromMap(map[string]string{"DEEPL_API_KEY": "deepl-secret"})
	engine := &fakeMTEngine{id: "deepl-engine"}
	ctor := &fakeConstructor{engine: engine}
	registrations := map[string]mtProviderRegistration{
		mtProviderDeepL: {constructor: ctor.construct, resolveConfig: resolveDeepLConfig},
	}

	f := newTestMTEngineFactory(profiles, lookupEnv, registrations)

	if err := f.BuildSelected([]string{"deepl-pro"}); err != nil {
		t.Fatalf("BuildSelected: %v", err)
	}
	if ctor.calls != 1 {
		t.Fatalf("constructor calls=%d, want 1", ctor.calls)
	}
	want := mt.Config{APIKey: "deepl-secret", BaseURL: mt.DeepLProBaseURL}
	if ctor.configs[0] != want {
		t.Fatalf("constructed config=%+v, want %+v", ctor.configs[0], want)
	}
}

func TestMTEngineFactoryMissingEnvVarOnlyFailsWhenProfileSelected(t *testing.T) {
	profiles := map[string]config.MTProfile{
		"broken-google": {Provider: "google", APIKeyEnv: "MISSING_GOOGLE_KEY"},
		"good-google":   {Provider: "google", APIKeyEnv: "GOOD_GOOGLE_KEY"},
	}
	lookupEnv := lookupEnvFromMap(map[string]string{"GOOD_GOOGLE_KEY": "value"})
	ctor := &fakeConstructor{engine: &fakeMTEngine{}}
	registrations := map[string]mtProviderRegistration{
		mtProviderGoogle: {constructor: ctor.construct, resolveConfig: resolveGoogleConfig},
	}

	f := newTestMTEngineFactory(profiles, lookupEnv, registrations)

	if err := f.BuildSelected([]string{"good-google"}); err != nil {
		t.Fatalf("BuildSelected(good-google): %v", err)
	}
	if ctor.calls != 1 {
		t.Fatalf("constructor calls=%d after selecting only good-google, want 1", ctor.calls)
	}

	err := f.BuildSelected([]string{"broken-google"})
	if err == nil {
		t.Fatalf("BuildSelected(broken-google): expected error, got nil")
	}
	var cfgErr *MTEngineConfigError
	if !errors.As(err, &cfgErr) {
		t.Fatalf("error type=%T, want *MTEngineConfigError", err)
	}
	if cfgErr.Profile != "broken-google" || cfgErr.Field != "api_key_env" {
		t.Fatalf("unexpected error fields: %+v", cfgErr)
	}
	if !strings.Contains(cfgErr.Message, "MISSING_GOOGLE_KEY") {
		t.Fatalf("error message=%q, want it to name the env var", cfgErr.Message)
	}
}

func TestMTEngineFactoryEmptyResolvedValueProducesSafeError(t *testing.T) {
	profiles := map[string]config.MTProfile{
		"google-empty": {Provider: "google", APIKeyEnv: "GOOGLE_EMPTY_KEY"},
	}
	const secretLookingValue = "   " // trims to empty
	lookupEnv := lookupEnvFromMap(map[string]string{"GOOGLE_EMPTY_KEY": secretLookingValue})
	ctor := &fakeConstructor{engine: &fakeMTEngine{}}
	registrations := map[string]mtProviderRegistration{
		mtProviderGoogle: {constructor: ctor.construct, resolveConfig: resolveGoogleConfig},
	}

	f := newTestMTEngineFactory(profiles, lookupEnv, registrations)

	err := f.BuildSelected([]string{"google-empty"})
	if err == nil {
		t.Fatalf("expected error for empty resolved credential value")
	}
	var cfgErr *MTEngineConfigError
	if !errors.As(err, &cfgErr) {
		t.Fatalf("error type=%T, want *MTEngineConfigError", err)
	}
	if cfgErr.Profile != "google-empty" || cfgErr.Field != "api_key_env" {
		t.Fatalf("unexpected error fields: %+v", cfgErr)
	}
	if !strings.Contains(cfgErr.Message, "GOOGLE_EMPTY_KEY") {
		t.Fatalf("error message=%q, want it to name the env var", cfgErr.Message)
	}
	if ctor.calls != 0 {
		t.Fatalf("constructor calls=%d, want 0 (should fail before construction)", ctor.calls)
	}
}

func TestMTEngineFactoryDeepLMissingOrInvalidBaseURLFailsSafely(t *testing.T) {
	tests := []struct {
		name    string
		baseURL string
	}{
		{name: "empty", baseURL: ""},
		{name: "unsupported host", baseURL: "https://example.com"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			profiles := map[string]config.MTProfile{
				"deepl-bad": {Provider: "deepl", APIKeyEnv: "DEEPL_KEY", BaseURL: tt.baseURL},
			}
			lookupEnv := lookupEnvFromMap(map[string]string{"DEEPL_KEY": "secret"})
			ctor := &fakeConstructor{engine: &fakeMTEngine{}}
			registrations := map[string]mtProviderRegistration{
				mtProviderDeepL: {constructor: ctor.construct, resolveConfig: resolveDeepLConfig},
			}

			f := newTestMTEngineFactory(profiles, lookupEnv, registrations)

			err := f.BuildSelected([]string{"deepl-bad"})
			if err == nil {
				t.Fatalf("expected error for base_url=%q", tt.baseURL)
			}
			var cfgErr *MTEngineConfigError
			if !errors.As(err, &cfgErr) {
				t.Fatalf("error type=%T, want *MTEngineConfigError", err)
			}
			if cfgErr.Field != "base_url" {
				t.Fatalf("error field=%q, want base_url", cfgErr.Field)
			}
			if ctor.calls != 0 {
				t.Fatalf("constructor calls=%d, want 0 (should fail before construction)", ctor.calls)
			}
		})
	}
}

func TestMTEngineFactoryReusesOneEngineAcrossMultipleSelections(t *testing.T) {
	profiles := map[string]config.MTProfile{
		"google-default": {Provider: "google", APIKeyEnv: "GOOGLE_KEY"},
	}
	lookupEnv := lookupEnvFromMap(map[string]string{"GOOGLE_KEY": "secret"})
	engine := &fakeMTEngine{id: "shared"}
	ctor := &fakeConstructor{engine: engine}
	registrations := map[string]mtProviderRegistration{
		mtProviderGoogle: {constructor: ctor.construct, resolveConfig: resolveGoogleConfig},
	}

	f := newTestMTEngineFactory(profiles, lookupEnv, registrations)

	// Duplicate name within a single call.
	if err := f.BuildSelected([]string{"google-default", "google-default"}); err != nil {
		t.Fatalf("BuildSelected: %v", err)
	}
	// A second, separate call for the same already-cached profile.
	if err := f.BuildSelected([]string{"google-default"}); err != nil {
		t.Fatalf("BuildSelected (second call): %v", err)
	}
	if ctor.calls != 1 {
		t.Fatalf("constructor calls=%d, want exactly 1 despite repeated selection", ctor.calls)
	}

	first, err := f.Engine("google-default")
	if err != nil {
		t.Fatalf("Engine: %v", err)
	}
	second, err := f.Engine("google-default")
	if err != nil {
		t.Fatalf("Engine (second lookup): %v", err)
	}
	if first != second || first != engine {
		t.Fatalf("expected the same cached engine instance across lookups")
	}
}

func TestMTEngineFactoryUnselectedProfilesAreNotConstructed(t *testing.T) {
	profiles := map[string]config.MTProfile{
		"good-google":     {Provider: "google", APIKeyEnv: "GOOGLE_KEY"},
		"unselected-bad":  {Provider: "google", APIKeyEnv: "MISSING_KEY_NEVER_SET"},
		"unselected-good": {Provider: "deepl", APIKeyEnv: "DEEPL_KEY", BaseURL: mt.DeepLProBaseURL},
	}
	lookupEnv := lookupEnvFromMap(map[string]string{"GOOGLE_KEY": "secret", "DEEPL_KEY": "secret"})
	googleCtor := &fakeConstructor{engine: &fakeMTEngine{}}
	deeplCtor := &fakeConstructor{engine: &fakeMTEngine{}}
	registrations := map[string]mtProviderRegistration{
		mtProviderGoogle: {constructor: googleCtor.construct, resolveConfig: resolveGoogleConfig},
		mtProviderDeepL:  {constructor: deeplCtor.construct, resolveConfig: resolveDeepLConfig},
	}

	f := newTestMTEngineFactory(profiles, lookupEnv, registrations)

	if err := f.BuildSelected([]string{"good-google"}); err != nil {
		t.Fatalf("BuildSelected: %v", err)
	}
	if googleCtor.calls != 1 {
		t.Fatalf("google constructor calls=%d, want 1", googleCtor.calls)
	}
	if deeplCtor.calls != 0 {
		t.Fatalf("deepl constructor calls=%d, want 0 (never selected)", deeplCtor.calls)
	}

	if _, err := f.Engine("unselected-bad"); err == nil {
		t.Fatalf("Engine(unselected-bad): expected error, engine was never built")
	}
	if _, err := f.Engine("unselected-good"); err == nil {
		t.Fatalf("Engine(unselected-good): expected error, engine was never built")
	}
}

func TestMTEngineFactoryUnknownProfileNameErrors(t *testing.T) {
	f := newTestMTEngineFactory(map[string]config.MTProfile{}, lookupEnvFromMap(nil), defaultMTProviderRegistrations())

	err := f.BuildSelected([]string{"does-not-exist"})
	if err == nil {
		t.Fatalf("expected error for unknown profile")
	}
	var cfgErr *MTEngineConfigError
	if !errors.As(err, &cfgErr) {
		t.Fatalf("error type=%T, want *MTEngineConfigError", err)
	}
	if cfgErr.Profile != "does-not-exist" || cfgErr.Field != "profile" {
		t.Fatalf("unexpected error fields: %+v", cfgErr)
	}
}

func TestMTEngineFactoryUnsupportedProviderErrors(t *testing.T) {
	profiles := map[string]config.MTProfile{
		"amazon-profile": {Provider: "amazon", AccessKeyIDEnv: "AWS_ACCESS_KEY_ID"},
	}
	f := newTestMTEngineFactory(profiles, lookupEnvFromMap(nil), defaultMTProviderRegistrations())

	err := f.BuildSelected([]string{"amazon-profile"})
	if err == nil {
		t.Fatalf("expected error for unsupported provider")
	}
	var cfgErr *MTEngineConfigError
	if !errors.As(err, &cfgErr) {
		t.Fatalf("error type=%T, want *MTEngineConfigError", err)
	}
	if cfgErr.Field != "provider" || !strings.Contains(cfgErr.Message, "amazon") {
		t.Fatalf("unexpected error: %+v", cfgErr)
	}
}

func TestMTEngineFactoryConstructorErrorIsWrappedWithoutLeakingSecret(t *testing.T) {
	profiles := map[string]config.MTProfile{
		"google-default": {Provider: "google", APIKeyEnv: "GOOGLE_KEY"},
	}
	const secretValue = "super-secret-api-key-value"
	lookupEnv := lookupEnvFromMap(map[string]string{"GOOGLE_KEY": secretValue})
	ctor := &fakeConstructor{err: errors.New("construction rejected")}
	registrations := map[string]mtProviderRegistration{
		mtProviderGoogle: {constructor: ctor.construct, resolveConfig: resolveGoogleConfig},
	}

	f := newTestMTEngineFactory(profiles, lookupEnv, registrations)

	err := f.BuildSelected([]string{"google-default"})
	if err == nil {
		t.Fatalf("expected error from constructor")
	}
	var cfgErr *MTEngineConfigError
	if !errors.As(err, &cfgErr) {
		t.Fatalf("error type=%T, want *MTEngineConfigError", err)
	}
	if cfgErr.Profile != "google-default" || cfgErr.Field != "provider" {
		t.Fatalf("unexpected error fields: %+v", cfgErr)
	}
	if strings.Contains(err.Error(), secretValue) {
		t.Fatalf("error leaked resolved secret value: %q", err.Error())
	}
	if ctor.calls != 1 {
		t.Fatalf("constructor calls=%d, want 1", ctor.calls)
	}
}

func TestMTEngineFactoryBuildSelectedEmptyListDoesNothing(t *testing.T) {
	ctor := &fakeConstructor{engine: &fakeMTEngine{}}
	registrations := map[string]mtProviderRegistration{
		mtProviderGoogle: {constructor: ctor.construct, resolveConfig: resolveGoogleConfig},
	}
	f := newTestMTEngineFactory(map[string]config.MTProfile{
		"google-default": {Provider: "google", APIKeyEnv: "GOOGLE_KEY"},
	}, lookupEnvFromMap(nil), registrations)

	if err := f.BuildSelected(nil); err != nil {
		t.Fatalf("BuildSelected(nil): %v", err)
	}
	if ctor.calls != 0 {
		t.Fatalf("constructor calls=%d, want 0", ctor.calls)
	}
}

func TestResolveEnvValueTrimsNameAndValue(t *testing.T) {
	lookupEnv := lookupEnvFromMap(map[string]string{"MY_ENV": "  trimmed-value  "})

	value, err := resolveEnvValue(lookupEnv, "profile-a", "api_key_env", "  MY_ENV  ")
	if err != nil {
		t.Fatalf("resolveEnvValue: %v", err)
	}
	if value != "trimmed-value" {
		t.Fatalf("value=%q, want trimmed-value", value)
	}
}

func TestResolveEnvValueEmptyEnvNameErrors(t *testing.T) {
	_, err := resolveEnvValue(lookupEnvFromMap(nil), "profile-a", "api_key_env", "   ")
	if err == nil {
		t.Fatalf("expected error for empty env var name")
	}
	var cfgErr *MTEngineConfigError
	if !errors.As(err, &cfgErr) {
		t.Fatalf("error type=%T, want *MTEngineConfigError", err)
	}
	if cfgErr.Profile != "profile-a" || cfgErr.Field != "api_key_env" {
		t.Fatalf("unexpected error fields: %+v", cfgErr)
	}
}

func TestMTEngineConfigErrorMessageFormat(t *testing.T) {
	err := &MTEngineConfigError{Profile: "p", Field: "f", Message: "m"}
	want := `mt profile "p": f: m`
	if err.Error() != want {
		t.Fatalf("Error()=%q, want %q", err.Error(), want)
	}
}
