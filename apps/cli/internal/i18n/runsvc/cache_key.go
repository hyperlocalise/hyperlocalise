package runsvc

import (
	"regexp"
	"strconv"
	"strings"
)

const markdownLockSourceContext = "markdown_segment_context=content_hash_only:v1"

var markdownStructuralOrdinalPattern = regexp.MustCompile(`\[(\d+)\]`)

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

func sourceContextFingerprintForLock(task Task) string {
	effectiveContext := sanitizePromptContext(task.SourceContext, maxSourceContextLen)
	if isMarkdownEntryKey(task.EntryKey) {
		// Markdown context is prompt-only. Including structural or adjacent hints
		// in the lock hash makes unchanged md.<hash> entries miss after inserts.
		effectiveContext = markdownLockSourceContext
	}
	return hashSourceText(strings.Join([]string{
		"source_context=" + normalizeSourceForCache(effectiveContext),
	}, "\n"))
}

func isMarkdownEntryKey(key string) bool {
	return strings.HasPrefix(strings.TrimSpace(key), "md.")
}

func legacyMarkdownContextSensitiveLockTaskHashCandidates(task Task) []string {
	if !isMarkdownEntryKey(task.EntryKey) {
		return nil
	}

	contexts := legacyMarkdownSourceContextVariants(task.SourceContext)
	candidates := make([]string, 0, len(contexts)*2)
	for _, context := range contexts {
		candidate := task
		candidate.SourceContext = context
		candidates = append(
			candidates,
			legacyContextSensitiveLockTaskHash(candidate),
			legacyDefaultContextSensitiveLockTaskHash(candidate),
		)
	}
	return candidates
}

func legacyMarkdownSourceContextVariants(context string) []string {
	// Older lockfiles included markdown structural paths. Try nearby previous
	// ordinals so common insertions can migrate instead of retranslating below.
	normalized := strings.ReplaceAll(context, "\r\n", "\n")
	normalized = strings.ReplaceAll(normalized, "\r", "\n")
	contexts := []string{normalized}
	lines := strings.Split(normalized, "\n")
	for idx, line := range lines {
		if !strings.HasPrefix(strings.TrimSpace(line), "Structural path:") {
			continue
		}
		for _, lineVariant := range markdownStructuralPathLegacyLineVariants(line) {
			variantLines := append([]string(nil), lines...)
			variantLines[idx] = lineVariant
			contexts = append(contexts, strings.Join(variantLines, "\n"))
		}
	}
	return dedupeStrings(contexts)
}

func markdownStructuralPathLegacyLineVariants(line string) []string {
	const maxShift = 8

	matches := markdownStructuralOrdinalPattern.FindAllStringSubmatchIndex(line, -1)
	var variants []string
	for _, match := range matches {
		if len(match) < 4 || match[2] < 0 || match[3] < 0 {
			continue
		}
		ordinal, err := strconv.Atoi(line[match[2]:match[3]])
		if err != nil || ordinal <= 0 {
			continue
		}
		for shift := 1; shift <= maxShift && shift <= ordinal; shift++ {
			replacement := strconv.Itoa(ordinal - shift)
			variants = append(variants, line[:match[2]]+replacement+line[match[3]:])
		}
	}
	return dedupeStrings(variants)
}

func dedupeStrings(values []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
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
	return lockTaskHashWithContextFingerprint(task, sourceContextFingerprintForLock(task), false)
}

func legacyContextSensitiveLockTaskHash(task Task) string {
	precomputeStableTaskCacheFields(&task)
	return lockTaskHashWithContextFingerprint(task, task.sourceContextFingerprint, false)
}

func lockTaskHashWithContextFingerprint(task Task, sourceContextFingerprint string, includeLegacyDefaults bool) string {
	parts := []string{
		"source_norm_hash=" + task.sourceTextHash,
		"source_locale=" + strings.TrimSpace(task.SourceLocale),
		"target_locale=" + strings.TrimSpace(task.TargetLocale),
		"provider=" + strings.TrimSpace(task.Provider),
		"model=" + strings.TrimSpace(task.Model),
		"profile=" + strings.TrimSpace(task.ProfileName),
		"prompt_version_hash=" + strings.TrimSpace(task.PromptVersion),
	}
	if includeLegacyDefaults {
		parts = append(parts, "glossary_termbase_version_hash=none")
	}
	parts = append(
		parts,
		"parser_mode="+strings.TrimSpace(task.ParserMode),
		"source_context_fingerprint="+sourceContextFingerprint,
	)
	if includeLegacyDefaults {
		parts = append(parts, "retrieval_corpus_snapshot_version="+legacyDefaultRetrievalSnapshot())
	}
	parts = append(
		parts,
		"context_key="+strings.TrimSpace(task.ContextKey),
		"context_provider="+strings.TrimSpace(task.ContextProvider),
		"context_model="+strings.TrimSpace(task.ContextModel),
	)
	if isImageTask(task) {
		parts = append(
			parts,
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
	return lockTaskHashWithContextFingerprint(task, sourceContextFingerprintForLock(task), true)
}

func legacyDefaultContextSensitiveLockTaskHash(task Task) string {
	precomputeStableTaskCacheFields(&task)
	return lockTaskHashWithContextFingerprint(task, task.sourceContextFingerprint, true)
}
