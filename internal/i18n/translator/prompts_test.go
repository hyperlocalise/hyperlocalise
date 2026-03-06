package translator

import (
	"strings"
	"testing"
)

func TestBuildSystemPromptPrefersSystemPrompt(t *testing.T) {
	t.Parallel()

	got := buildSystemPrompt(Request{
		Prompt:       "legacy prompt",
		SystemPrompt: "custom system",
	})

	if !strings.HasPrefix(got, "custom system") {
		t.Fatalf("expected system_prompt to be used, got %q", got)
	}
}

func TestBuildSystemPromptFallsBackToPrompt(t *testing.T) {
	t.Parallel()

	got := buildSystemPrompt(Request{Prompt: "legacy prompt"})
	if !strings.HasPrefix(got, "legacy prompt") {
		t.Fatalf("expected prompt fallback, got %q", got)
	}
}

func TestBuildUserPromptPrefersUserPrompt(t *testing.T) {
	t.Parallel()

	got := buildUserPrompt(Request{
		Source:         "hello",
		TargetLanguage: "fr",
		Context:        "ctx",
		UserPrompt:     "custom user",
	})
	if got != "custom user" {
		t.Fatalf("expected custom user prompt, got %q", got)
	}
}
