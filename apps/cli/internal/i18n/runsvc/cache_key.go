package runsvc

import (
	"strings"
)

func normalizeSourceForCache(source string) string {
	normalized := strings.ReplaceAll(source, "\r\n", "\n")
	normalized = strings.ReplaceAll(normalized, "\r", "\n")
	return strings.TrimSpace(normalized)
}

func sourceContextFingerprint(task Task) string {
	effectiveContext := sanitizePromptContext(task.SourceContext, maxSourceContextLen)
	return hashSourceText(strings.Join([]string{
		"source_context=" + normalizeSourceForCache(effectiveContext),
	}, "\n"))
}

func contextMemoryFingerprint(task Task) string {
	return hashSourceText(strings.Join([]string{
		"context_key=" + strings.TrimSpace(task.ContextKey),
		"context_memory=" + normalizeSourceForCache(task.ContextMemory),
	}, "\n"))
}

func precomputeStableTaskCacheFields(task *Task) {
	if task == nil {
		return
	}

	task.sourceTextHash = hashSourceText(normalizeSourceForCache(task.SourceText))
	task.sourceContextFingerprint = sourceContextFingerprint(*task)
	task.stableExactCacheKeyPrefix = buildStableExactCacheKeyPrefix(
		task.sourceTextHash,
		task.SourceLocale,
		task.TargetLocale,
		task.Provider,
		task.Model,
		task.ProfileName,
		task.PromptVersion,
		task.GlossaryVersion,
		task.ParserMode,
		task.sourceContextFingerprint,
	)
	if strings.TrimSpace(task.ContextMemory) == "" {
		task.contextMemoryFingerprint = contextMemoryFingerprint(*task)
	}
}

func precomputeExecutionTaskCacheFields(task *Task) {
	if task == nil {
		return
	}
	if task.sourceTextHash == "" || task.sourceContextFingerprint == "" || task.stableExactCacheKeyPrefix == "" {
		precomputeStableTaskCacheFields(task)
	}
	task.contextMemoryFingerprint = contextMemoryFingerprint(*task)
}

func buildStableExactCacheKeyPrefix(sourceTextHash, sourceLocale, targetLocale, provider, model, profileName, promptVersion, glossaryVersion, parserMode, sourceContextFingerprint string) string {
	return strings.Join([]string{
		"source_norm_hash=" + sourceTextHash,
		"source_locale=" + strings.TrimSpace(sourceLocale),
		"target_locale=" + strings.TrimSpace(targetLocale),
		"provider=" + strings.TrimSpace(provider),
		"model=" + strings.TrimSpace(model),
		"profile=" + strings.TrimSpace(profileName),
		"prompt_version_hash=" + strings.TrimSpace(promptVersion),
		"glossary_termbase_version_hash=" + strings.TrimSpace(glossaryVersion),
		"parser_mode=" + strings.TrimSpace(parserMode),
		"source_context_fingerprint=" + sourceContextFingerprint,
	}, "\n")
}

func exactCacheKey(task Task) string {
	precomputedSourceTextHash := task.sourceTextHash
	if precomputedSourceTextHash == "" {
		precomputedSourceTextHash = hashSourceText(normalizeSourceForCache(task.SourceText))
	}
	precomputedSourceContextFingerprint := task.sourceContextFingerprint
	if precomputedSourceContextFingerprint == "" {
		precomputedSourceContextFingerprint = sourceContextFingerprint(task)
	}
	stablePrefix := task.stableExactCacheKeyPrefix
	if stablePrefix == "" {
		stablePrefix = buildStableExactCacheKeyPrefix(
			precomputedSourceTextHash,
			task.SourceLocale,
			task.TargetLocale,
			task.Provider,
			task.Model,
			task.ProfileName,
			task.PromptVersion,
			task.GlossaryVersion,
			task.ParserMode,
			precomputedSourceContextFingerprint,
		)
	}
	precomputedContextMemoryFingerprint := task.contextMemoryFingerprint
	if precomputedContextMemoryFingerprint == "" {
		precomputedContextMemoryFingerprint = contextMemoryFingerprint(task)
	}
	canonical := stablePrefix +
		"\ncontext_memory_fingerprint=" + precomputedContextMemoryFingerprint +
		"\nretrieval_corpus_snapshot_version=" + strings.TrimSpace(task.RAGSnapshot)
	return hashSourceText(canonical)
}

func lockTaskHash(task Task) string {
	precomputeStableTaskCacheFields(&task)
	canonical := task.stableExactCacheKeyPrefix +
		"\nretrieval_corpus_snapshot_version=" + strings.TrimSpace(task.RAGSnapshot) +
		"\ncontext_key=" + strings.TrimSpace(task.ContextKey) +
		"\ncontext_provider=" + strings.TrimSpace(task.ContextProvider) +
		"\ncontext_model=" + strings.TrimSpace(task.ContextModel)
	return hashSourceText(canonical)
}
