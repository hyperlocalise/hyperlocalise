package runsvc

import "testing"

func TestExactCacheKeyChangesWhenSourceLocaleChanges(t *testing.T) {
	base := Task{
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
	}
	other := base
	other.SourceLocale = "en-GB"
	if exactCacheKey(base) == exactCacheKey(other) {
		t.Fatal("expected source locale to affect exact cache key")
	}
}

func TestExactCacheKeyNormalizesSourceText(t *testing.T) {
	base := Task{
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
	}
	other := base
	other.SourceText = "  Hello\r\n"
	if exactCacheKey(base) != exactCacheKey(other) {
		t.Fatal("expected equivalent normalized source text to yield same key")
	}
}

func TestExactCacheKeyChangesWhenContextMemoryChanges(t *testing.T) {
	base := Task{
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
		ContextMemory:   "memory-A",
	}
	other := base
	other.ContextMemory = "memory-B"
	if exactCacheKey(base) == exactCacheKey(other) {
		t.Fatal("expected context memory to affect exact cache key")
	}
}
