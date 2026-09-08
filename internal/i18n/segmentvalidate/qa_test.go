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

func TestQAModesEscapedChar(t *testing.T) {
	checks := ValidateSegment(Request{
		SourceText: "Included",
		TargetText: "Inclus\\tgranted",
		SourcePath: "/pkg/en.json",
		Modes:      []string{QAModeEscapedChar},
	})
	if len(checks) != 2 {
		t.Fatalf("expected format fail + escaped-char warning, got %+v", checks)
	}
	if checks[0].ID != "format-special-char-mismatch" {
		t.Fatalf("expected special char format failure first, got %+v", checks[0])
	}
	if checks[1].ID != "qa-escaped-char-mismatch" || checks[1].Status != StatusWarn {
		t.Fatalf("unexpected escaped-char check: %+v", checks[1])
	}
	if checks[1].Message != "Target introduces escaped characters (\\t) that are not in the source." {
		t.Fatalf("unexpected escaped-char message: %q", checks[1].Message)
	}

	checks = ValidateSegment(Request{
		SourceText: "Created job",
		TargetText: "已创建工作\tjob",
		SourcePath: "/pkg/en.json",
		Modes:      []string{QAModeEscapedChar},
	})
	if len(checks) != 2 {
		t.Fatalf("expected format pass + escaped-char warning for decoded tab, got %+v", checks)
	}
	if checks[0].ID != "format-parity" || checks[1].ID != "qa-escaped-char-mismatch" {
		t.Fatalf("unexpected checks for decoded tab: %+v", checks)
	}

	checks = ValidateSegment(Request{
		SourceText: "Included",
		TargetText: "Inclus\u0000granted",
		SourcePath: "/pkg/en.json",
		Modes:      []string{QAModeEscapedChar},
	})
	if len(checks) != 2 {
		t.Fatalf("expected format pass + escaped-char warning for decoded NUL, got %+v", checks)
	}
	if checks[1].ID != "qa-escaped-char-mismatch" || len(checks[1].RelatedTokens) != 1 || checks[1].RelatedTokens[0] != `\u0000` {
		t.Fatalf("unexpected decoded NUL check: %+v", checks[1])
	}

	checks = ValidateSegment(Request{
		SourceText: "Included",
		TargetText: "Inclus",
		SourcePath: "/pkg/en.json",
		Modes:      []string{QAModeEscapedChar},
	})
	if len(checks) != 1 || checks[0].ID != "format-parity" {
		t.Fatalf("expected only format pass, got %+v", checks)
	}
}

func TestKnownQAModes(t *testing.T) {
	modes := KnownQAModes()
	if len(modes) != 4 {
		t.Fatalf("expected 4 known QA modes, got %v", modes)
	}
	found := false
	for _, mode := range modes {
		if mode == QAModeEscapedChar {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected %q in known QA modes, got %v", QAModeEscapedChar, modes)
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
