package runsvc

import (
	"strings"
	"testing"
)

func baseCacheTask() Task {
	return Task{
		SourceLocale:    "en-US",
		TargetLocale:    "fr-FR",
		SourceText:      "Hello",
		Provider:        "openai",
		Model:           "gpt-5.2",
		ProfileName:     "default",
		PromptVersion:   "p1",
		GlossaryVersion: "g1",
		ParserMode:      "json",
		RAGSnapshot:     "r1",
		ContextKey:      "file:a",
		SourceContext:   "Checkout submit button",
		ContextMemory:   "memory-A",
	}
}

func TestExactCacheKeyChangesWhenSourceLocaleChanges(t *testing.T) {
	base := baseCacheTask()
	other := base
	other.SourceLocale = "en-GB"
	if exactCacheKey(base) == exactCacheKey(other) {
		t.Fatal("expected source locale to affect exact cache key")
	}
}

func TestExactCacheKeyNormalizesSourceText(t *testing.T) {
	base := baseCacheTask()
	other := base
	other.SourceText = "  Hello\r\n"
	if exactCacheKey(base) != exactCacheKey(other) {
		t.Fatal("expected equivalent normalized source text to yield same key")
	}
}

func TestExactCacheKeyChangesWhenSourceContextChanges(t *testing.T) {
	base := baseCacheTask()
	other := base
	other.SourceContext = "Checkout final submit button"
	if exactCacheKey(base) == exactCacheKey(other) {
		t.Fatal("expected source context to affect exact cache key")
	}
}

func TestExactCacheKeyChangesWhenMarkdownSegmentSourceContextChanges(t *testing.T) {
	base := baseCacheTask()
	base.ParserMode = "other"
	base.SourceContext = "Markdown translatable segment.\nStructural path: /doc/heading[1]"
	other := base
	other.SourceContext = "Markdown translatable segment.\nStructural path: /doc/heading[2]"
	if exactCacheKey(base) == exactCacheKey(other) {
		t.Fatal("expected markdown-style per-segment source context to affect exact cache key")
	}
}

func TestExactCacheKeyIgnoresSourceContextChangesOutsidePromptLimit(t *testing.T) {
	base := baseCacheTask()
	limit := maxSourceContextLen
	base.SourceContext = strings.Repeat("a", limit) + "tail-a"
	other := base
	other.SourceContext = strings.Repeat("a", limit) + "tail-b"
	if exactCacheKey(base) != exactCacheKey(other) {
		t.Fatal("expected source context changes outside prompt limit to keep exact cache key stable")
	}
}

func TestExactCacheKeyChangesWhenContextMemoryChanges(t *testing.T) {
	base := baseCacheTask()
	other := base
	other.ContextMemory = "memory-B"
	if exactCacheKey(base) == exactCacheKey(other) {
		t.Fatal("expected context memory to affect exact cache key")
	}
}

func TestExactCacheKeyChangesAcrossDimensions(t *testing.T) {
	testCases := []struct {
		name   string
		mutate func(task *Task)
	}{
		{
			name: "source text",
			mutate: func(task *Task) {
				task.SourceText = "Hello there"
			},
		},
		{
			name: "target locale",
			mutate: func(task *Task) {
				task.TargetLocale = "de-DE"
			},
		},
		{
			name: "provider",
			mutate: func(task *Task) {
				task.Provider = "anthropic"
			},
		},
		{
			name: "model",
			mutate: func(task *Task) {
				task.Model = "claude-sonnet-4"
			},
		},
		{
			name: "profile name",
			mutate: func(task *Task) {
				task.ProfileName = "high-quality"
			},
		},
		{
			name: "prompt version",
			mutate: func(task *Task) {
				task.PromptVersion = "p2"
			},
		},
		{
			name: "glossary version",
			mutate: func(task *Task) {
				task.GlossaryVersion = "g2"
			},
		},
		{
			name: "parser mode",
			mutate: func(task *Task) {
				task.ParserMode = "formatjs"
			},
		},
		{
			name: "source context",
			mutate: func(task *Task) {
				task.SourceContext = "Checkout final submit button"
			},
		},
		{
			name: "context key",
			mutate: func(task *Task) {
				task.ContextKey = "file:b"
			},
		},
		{
			name: "retrieval snapshot",
			mutate: func(task *Task) {
				task.RAGSnapshot = "r2"
			},
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			base := baseCacheTask()
			other := base
			tc.mutate(&other)
			if exactCacheKey(base) == exactCacheKey(other) {
				t.Fatalf("expected %s to affect exact cache key", tc.name)
			}
		})
	}
}
