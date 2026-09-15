package runsvc

import (
	"testing"
)

func TestPrecomputeStableTaskCacheFieldsPreservesExistingHashes(t *testing.T) {
	t.Parallel()

	task := Task{
		SourceText:               "Hello",
		SourceContext:            "context-a",
		sourceTextHash:           "precomputed-text",
		sourceContextFingerprint: "precomputed-context",
	}
	precomputeStableTaskCacheFields(&task)

	if task.sourceTextHash != "precomputed-text" {
		t.Fatalf("sourceTextHash = %q, want precomputed value preserved", task.sourceTextHash)
	}
	if task.sourceContextFingerprint != "precomputed-context" {
		t.Fatalf(
			"sourceContextFingerprint = %q, want precomputed value preserved",
			task.sourceContextFingerprint,
		)
	}
}

func TestPrecomputeStableTaskCacheFieldsFillsMissingFieldsOnly(t *testing.T) {
	t.Parallel()

	task := Task{
		SourceText:     "Hello",
		SourceContext:  "context-a",
		sourceTextHash: "precomputed-text",
	}
	precomputeStableTaskCacheFields(&task)

	if task.sourceTextHash != "precomputed-text" {
		t.Fatalf("sourceTextHash = %q, want precomputed value preserved", task.sourceTextHash)
	}
	wantContext := sourceContextFingerprint(Task{SourceContext: "context-a"})
	if task.sourceContextFingerprint != wantContext {
		t.Fatalf(
			"sourceContextFingerprint = %q, want %q",
			task.sourceContextFingerprint,
			wantContext,
		)
	}

	task = Task{
		SourceText:               "Hello",
		SourceContext:            "context-a",
		sourceContextFingerprint: "precomputed-context",
	}
	precomputeStableTaskCacheFields(&task)

	wantText := hashSourceText(normalizeSourceForCache("Hello"))
	if task.sourceTextHash != wantText {
		t.Fatalf("sourceTextHash = %q, want %q", task.sourceTextHash, wantText)
	}
	if task.sourceContextFingerprint != "precomputed-context" {
		t.Fatalf(
			"sourceContextFingerprint = %q, want precomputed value preserved",
			task.sourceContextFingerprint,
		)
	}
}

func TestPrecomputeStableTaskCacheFieldsComputesTextTaskHashes(t *testing.T) {
	t.Parallel()

	task := Task{
		SourceText:    "  Hello\r\nWorld  ",
		SourceContext: "prompt context",
	}
	precomputeStableTaskCacheFields(&task)

	wantText := hashSourceText(normalizeSourceForCache(task.SourceText))
	wantContext := sourceContextFingerprint(task)
	if task.sourceTextHash != wantText {
		t.Fatalf("sourceTextHash = %q, want %q", task.sourceTextHash, wantText)
	}
	if task.sourceContextFingerprint != wantContext {
		t.Fatalf(
			"sourceContextFingerprint = %q, want %q",
			task.sourceContextFingerprint,
			wantContext,
		)
	}
}

func TestPrecomputeStableTaskCacheFieldsImageTaskUsesFingerprint(t *testing.T) {
	t.Parallel()

	task := Task{
		Kind:              taskKindImage,
		sourceFingerprint: "  image-fingerprint  ",
		SourceText:        "ignored for image hash",
		SourceContext:     "ignored for empty context fingerprint",
	}
	precomputeStableTaskCacheFields(&task)

	if task.sourceTextHash != "image-fingerprint" {
		t.Fatalf("sourceTextHash = %q, want trimmed sourceFingerprint", task.sourceTextHash)
	}
	wantContext := sourceContextFingerprint(Task{})
	if task.sourceContextFingerprint != wantContext {
		t.Fatalf(
			"sourceContextFingerprint = %q, want empty-task fingerprint %q",
			task.sourceContextFingerprint,
			wantContext,
		)
	}

	task = Task{
		Kind:                     taskKindImage,
		sourceFingerprint:        "fresh-fingerprint",
		sourceTextHash:           "kept-hash",
		sourceContextFingerprint: "kept-context",
	}
	precomputeStableTaskCacheFields(&task)
	if task.sourceTextHash != "kept-hash" || task.sourceContextFingerprint != "kept-context" {
		t.Fatalf(
			"image precompute mutated existing hashes: text=%q context=%q",
			task.sourceTextHash,
			task.sourceContextFingerprint,
		)
	}
}

func TestPrecomputeStableTaskCacheFieldsNilSafe(t *testing.T) {
	t.Parallel()
	precomputeStableTaskCacheFields(nil)
}
