package segmentvalidate

import "testing"

func TestQAModesSameAsSource(t *testing.T) {
	checks := ValidateSegment(Request{
		SourceText: "Hello",
		TargetText: "Hello",
		SourcePath: "/pkg/en.json",
		Modes:      []string{QAModeSameAsSource},
	})
	if len(checks) != 2 {
		t.Fatalf("expected format pass + same-as-source, got %+v", checks)
	}
	if checks[1].ID != "qa-same-as-source" || checks[1].Status != StatusWarn {
		t.Fatalf("unexpected same-as-source check: %+v", checks[1])
	}

	checks = ValidateSegment(Request{
		SourceText: "Hello",
		TargetText: "Bonjour",
		SourcePath: "/pkg/en.json",
		Modes:      []string{QAModeSameAsSource},
	})
	if len(checks) != 1 || checks[0].ID != "format-parity" {
		t.Fatalf("expected only format pass, got %+v", checks)
	}
}

func TestQAModesWhitespaceOnly(t *testing.T) {
	checks := ValidateSegment(Request{
		SourceText: "Hello",
		TargetText: "   \t\n",
		SourcePath: "/pkg/en.json",
		Modes:      []string{QAModeWhitespaceOnly},
	})
	if len(checks) != 2 {
		t.Fatalf("expected format pass + whitespace-only, got %+v", checks)
	}
	if checks[1].ID != "qa-whitespace-only" || checks[1].Status != StatusWarn {
		t.Fatalf("unexpected whitespace-only check: %+v", checks[1])
	}
}

func TestQAModesNotLocalized(t *testing.T) {
	checks := ValidateSegment(Request{
		SourceText: "Hello",
		TargetText: "   ",
		SourcePath: "/pkg/en.json",
		Modes:      []string{QAModeNotLocalized, QAModeWhitespaceOnly},
	})
	if len(checks) != 3 {
		t.Fatalf("expected format pass + not localized + whitespace-only, got %+v", checks)
	}
	if checks[1].ID != "qa-not-localized" || checks[1].Status != StatusFail {
		t.Fatalf("unexpected not-localized check: %+v", checks[1])
	}
}

func TestKnownQAModes(t *testing.T) {
	modes := KnownQAModes()
	if len(modes) != 3 {
		t.Fatalf("expected 3 known QA modes, got %v", modes)
	}
}

func TestQAModesIgnoredWhenEmpty(t *testing.T) {
	checks := ValidateSegment(Request{
		SourceText: "Hello",
		TargetText: "Hello",
		SourcePath: "/pkg/en.json",
	})
	if len(checks) != 1 || checks[0].ID != "format-parity" {
		t.Fatalf("expected format-only checks without modes, got %+v", checks)
	}
}
