package runsvc

import (
	"os"
	"path/filepath"
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

func TestPlanTasksMixedLLMAndMTGroupsResolveDeterministically(t *testing.T) {
	dir := t.TempDir()
	sourceUI := filepath.Join(dir, "ui", "en.json")
	sourceDocs := filepath.Join(dir, "docs", "en.json")

	if err := os.MkdirAll(filepath.Dir(sourceUI), 0o755); err != nil {
		t.Fatalf("mkdir ui source dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(sourceDocs), 0o755); err != nil {
		t.Fatalf("mkdir docs source dir: %v", err)
	}
	if err := os.WriteFile(sourceUI, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write ui source: %v", err)
	}
	if err := os.WriteFile(sourceDocs, []byte(`{"doc":"Hello docs"}`), 0o644); err != nil {
		t.Fatalf("write docs source: %v", err)
	}

	configPath := filepath.Join(dir, "i18n.yml")
	configContent := `
locales:
  source: en
  targets:
    - fr
groups:
  bulk-ui:
    targets:
      - fr
    buckets:
      - ui
  docs-team:
    targets:
      - fr
    buckets:
      - docs
buckets:
  ui:
    files:
      - from: ` + sourceUI + `
        to: ` + filepath.Join(dir, "out", "ui", "{{target}}.json") + `
  docs:
    files:
      - from: ` + sourceDocs + `
        to: ` + filepath.Join(dir, "out", "docs", "{{target}}.json") + `
llm:
  profiles:
    default:
      provider: openai
      model: gpt-4.1-mini
mt:
  profiles:
    google:
      provider: google
      api_key_env: GOOGLE_TRANSLATE_API_KEY
translation:
  default:
    type: llm
    profile: default
  rules:
    - priority: 100
      group: bulk-ui
      type: mt
      profile: google
`
	if err := os.WriteFile(configPath, []byte(configContent), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	svc := newTestService()
	svc.readFile = os.ReadFile

	tasks, _, err := svc.planTasks(cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("plan tasks: %v", err)
	}
	if len(tasks) != 2 {
		t.Fatalf("task count=%d, want 2", len(tasks))
	}

	byGroup := make(map[string]Task, len(tasks))
	for _, task := range tasks {
		byGroup[task.GroupName] = task
	}

	uiTask, ok := byGroup["bulk-ui"]
	if !ok {
		t.Fatalf("missing task for group bulk-ui: %+v", tasks)
	}
	if uiTask.TranslationType != config.TranslationTypeMT || uiTask.Provider != "google" || uiTask.Model != "" {
		t.Fatalf("unexpected bulk-ui task: %+v", uiTask)
	}

	docsTask, ok := byGroup["docs-team"]
	if !ok {
		t.Fatalf("missing task for group docs-team: %+v", tasks)
	}
	if docsTask.TranslationType != config.TranslationTypeLLM || docsTask.Provider != "openai" || docsTask.Model != "gpt-4.1-mini" {
		t.Fatalf("unexpected docs-team task: %+v", docsTask)
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
