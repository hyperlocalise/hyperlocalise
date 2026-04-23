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

func precomputeStableTaskCacheFields(task *Task) {
	if task == nil {
		return
	}

	if isImageTask(*task) {
		task.sourceTextHash = strings.TrimSpace(task.sourceFingerprint)
		task.sourceContextFingerprint = sourceContextFingerprint(Task{})
		return
	}

	task.sourceTextHash = hashSourceText(normalizeSourceForCache(task.SourceText))
	task.sourceContextFingerprint = sourceContextFingerprint(*task)
}

func lockTaskHash(task Task) string {
	precomputeStableTaskCacheFields(&task)
	parts := []string{
		"source_norm_hash=" + task.sourceTextHash,
		"source_locale=" + strings.TrimSpace(task.SourceLocale),
		"target_locale=" + strings.TrimSpace(task.TargetLocale),
		"provider=" + strings.TrimSpace(task.Provider),
		"model=" + strings.TrimSpace(task.Model),
		"profile=" + strings.TrimSpace(task.ProfileName),
		"prompt_version_hash=" + strings.TrimSpace(task.PromptVersion),
		"parser_mode=" + strings.TrimSpace(task.ParserMode),
		"source_context_fingerprint=" + task.sourceContextFingerprint,
		"context_key=" + strings.TrimSpace(task.ContextKey),
		"context_provider=" + strings.TrimSpace(task.ContextProvider),
		"context_model=" + strings.TrimSpace(task.ContextModel),
	}
	if isImageTask(task) {
		parts = append(parts,
			"task_kind="+strings.TrimSpace(task.Kind),
			"output_format="+strings.TrimSpace(task.OutputFormat),
		)
	}
	canonical := strings.Join(parts, "\n")
	return lockStoredFingerprint(canonical)
}

func legacyDefaultRetrievalSnapshot() string {
	return hashSourceText(strings.Join([]string{
		"snapshot=none",
		"rag_enabled=false",
	}, "\n"))
}

func legacyDefaultLockTaskHash(task Task) string {
	precomputeStableTaskCacheFields(&task)
	parts := []string{
		"source_norm_hash=" + task.sourceTextHash,
		"source_locale=" + strings.TrimSpace(task.SourceLocale),
		"target_locale=" + strings.TrimSpace(task.TargetLocale),
		"provider=" + strings.TrimSpace(task.Provider),
		"model=" + strings.TrimSpace(task.Model),
		"profile=" + strings.TrimSpace(task.ProfileName),
		"prompt_version_hash=" + strings.TrimSpace(task.PromptVersion),
		"glossary_termbase_version_hash=none",
		"parser_mode=" + strings.TrimSpace(task.ParserMode),
		"source_context_fingerprint=" + task.sourceContextFingerprint,
		"retrieval_corpus_snapshot_version=" + legacyDefaultRetrievalSnapshot(),
		"context_key=" + strings.TrimSpace(task.ContextKey),
		"context_provider=" + strings.TrimSpace(task.ContextProvider),
		"context_model=" + strings.TrimSpace(task.ContextModel),
	}
	if isImageTask(task) {
		parts = append(parts,
			"task_kind="+strings.TrimSpace(task.Kind),
			"output_format="+strings.TrimSpace(task.OutputFormat),
		)
	}
	canonical := strings.Join(parts, "\n")
	return lockStoredFingerprint(canonical)
}
