package runsvc

import (
	"testing"

	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func TestResolveTranslationFallsBackToLLMWhenTranslationNil(t *testing.T) {
	cfg := testConfig("/tmp/source.json", "/tmp/out.json")

	wantProfileName, wantProfile, err := resolveProfile(&cfg, "default")
	if err != nil {
		t.Fatalf("resolve profile: %v", err)
	}

	selection, err := resolveTranslation(&cfg, "default")
	if err != nil {
		t.Fatalf("resolve translation: %v", err)
	}
	if selection.Type != config.TranslationTypeLLM {
		t.Fatalf("type=%q, want %q", selection.Type, config.TranslationTypeLLM)
	}
	if selection.ProfileName != wantProfileName {
		t.Fatalf("profile name=%q, want %q", selection.ProfileName, wantProfileName)
	}
	if selection.LLMProfile != wantProfile {
		t.Fatalf("llm profile=%+v, want %+v", selection.LLMProfile, wantProfile)
	}
}

func TestResolveTranslationRulePriorityMixedLLMAndMT(t *testing.T) {
	cfg := testConfig("/tmp/source.json", "/tmp/out.json")
	cfg.MT = &config.MTConfig{
		Profiles: map[string]config.MTProfile{
			"google": {Provider: "google", APIKeyEnv: "GOOGLE_TRANSLATE_API_KEY"},
		},
	}
	cfg.Translation = &config.TranslationConfig{
		Default: config.TranslationSelection{Type: config.TranslationTypeLLM, Profile: "default"},
		Rules: []config.TranslationRule{
			{Priority: 1, Group: "default", Type: config.TranslationTypeLLM, Profile: "default"},
			{Priority: 100, Group: "default", Type: config.TranslationTypeMT, Profile: "google"},
		},
	}

	selection, err := resolveTranslation(&cfg, "default")
	if err != nil {
		t.Fatalf("resolve translation: %v", err)
	}
	if selection.Type != config.TranslationTypeMT {
		t.Fatalf("type=%q, want %q", selection.Type, config.TranslationTypeMT)
	}
	if selection.ProfileName != "google" {
		t.Fatalf("profile name=%q, want google", selection.ProfileName)
	}
	if selection.MTProfile.Provider != "google" {
		t.Fatalf("mt profile provider=%q, want google", selection.MTProfile.Provider)
	}

	// No rule matches this group, so resolution falls back to translation.default.
	fallback, err := resolveTranslation(&cfg, "unknown-group")
	if err != nil {
		t.Fatalf("resolve fallback translation: %v", err)
	}
	if fallback.Type != config.TranslationTypeLLM || fallback.ProfileName != "default" {
		t.Fatalf("unexpected fallback selection: %+v", fallback)
	}
}

func TestResolveTranslationSelectsMTProfileWithZeroValueLLMProfile(t *testing.T) {
	cfg := testConfig("/tmp/source.json", "/tmp/out.json")
	cfg.MT = &config.MTConfig{
		Profiles: map[string]config.MTProfile{
			"google": {Provider: "google", APIKeyEnv: "GOOGLE_TRANSLATE_API_KEY"},
		},
	}
	cfg.Translation = &config.TranslationConfig{
		Default: config.TranslationSelection{Type: config.TranslationTypeMT, Profile: "google"},
	}

	selection, err := resolveTranslation(&cfg, "default")
	if err != nil {
		t.Fatalf("resolve translation: %v", err)
	}
	if selection.Type != config.TranslationTypeMT {
		t.Fatalf("type=%q, want %q", selection.Type, config.TranslationTypeMT)
	}
	if selection.MTProfile.Provider != "google" {
		t.Fatalf("mt profile provider=%q, want google", selection.MTProfile.Provider)
	}
	if selection.LLMProfile != (config.LLMProfile{}) {
		t.Fatalf("expected zero-value llm profile, got %+v", selection.LLMProfile)
	}
}

func TestPlanTasksMTGroupLeavesLLMFieldsZeroValued(t *testing.T) {
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	cfg := testConfig(sourcePath, targetPath)
	cfg.MT = &config.MTConfig{
		Profiles: map[string]config.MTProfile{
			"google": {Provider: "google", APIKeyEnv: "GOOGLE_TRANSLATE_API_KEY"},
		},
	}
	cfg.Translation = &config.TranslationConfig{
		Default: config.TranslationSelection{Type: config.TranslationTypeMT, Profile: "google"},
	}

	svc := newTestService()

	tasks, _, err := svc.planTasks(&cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("plan tasks: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("task count=%d, want 1", len(tasks))
	}

	task := tasks[0]
	if task.TranslationType != config.TranslationTypeMT {
		t.Fatalf("translation type=%q, want %q", task.TranslationType, config.TranslationTypeMT)
	}
	if task.Provider != "google" {
		t.Fatalf("provider=%q, want google", task.Provider)
	}
	if task.ProfileName != "google" {
		t.Fatalf("profile name=%q, want google", task.ProfileName)
	}
	if task.Model != "" {
		t.Fatalf("model=%q, want empty", task.Model)
	}
	if task.SystemPrompt != "" || task.UserPrompt != "" {
		t.Fatalf("expected no prompts, got system=%q user=%q", task.SystemPrompt, task.UserPrompt)
	}
	if task.PromptLegacyTemplate != "" || task.PromptSystemTemplate != "" || task.PromptUserTemplate != "" {
		t.Fatalf("expected no prompt templates, got legacy=%q system=%q user=%q", task.PromptLegacyTemplate, task.PromptSystemTemplate, task.PromptUserTemplate)
	}
	if task.LegacyPrompt {
		t.Fatalf("expected LegacyPrompt=false for mt task")
	}
	if task.PromptVersion != "" {
		t.Fatalf("prompt version=%q, want empty", task.PromptVersion)
	}
}

func TestPlanTasksLLMGroupUnchangedWhenTranslationPresent(t *testing.T) {
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	cfg := testConfig(sourcePath, targetPath)
	cfg.Translation = &config.TranslationConfig{
		Default: config.TranslationSelection{Type: config.TranslationTypeLLM, Profile: "default"},
	}

	svc := newTestService()

	tasks, _, err := svc.planTasks(&cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("plan tasks: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("task count=%d, want 1", len(tasks))
	}

	task := tasks[0]
	if task.TranslationType != config.TranslationTypeLLM {
		t.Fatalf("translation type=%q, want %q", task.TranslationType, config.TranslationTypeLLM)
	}
	if task.Provider != "openai" || task.Model != "gpt-4.1-mini" {
		t.Fatalf("unexpected provider/model: provider=%q model=%q", task.Provider, task.Model)
	}
	if task.ProfileName != "default" {
		t.Fatalf("profile name=%q, want default", task.ProfileName)
	}
}
