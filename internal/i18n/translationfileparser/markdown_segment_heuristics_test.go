package translationfileparser

import (
	"strings"
	"testing"
)

func TestValidateMarkdownTranslatedBlockStructureSingleLineSourceOK(t *testing.T) {
	if err := ValidateMarkdownTranslatedBlockStructure("Hello.", "Bonjour."); err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
}

func TestValidateMarkdownTranslatedBlockStructureSkipsMultiLineSource(t *testing.T) {
	src := "# Title\n\nBody line."
	tgt := "# Title\n\nBody line.\n\n# Extra"
	if err := ValidateMarkdownTranslatedBlockStructure(src, tgt); err != nil {
		t.Fatalf("expected no heuristic error for multi-line source, got %v", err)
	}
}

func TestValidateMarkdownTranslatedBlockStructureRejectsInjectedHeading(t *testing.T) {
	err := ValidateMarkdownTranslatedBlockStructure("Hello world.", "Bonjour.\n\n# Bad")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "ATX heading") {
		t.Fatalf("unexpected: %v", err)
	}
}

func TestValidateMarkdownTranslatedBlockStructureAllowsHeadingWhenSourceHasIt(t *testing.T) {
	if err := ValidateMarkdownTranslatedBlockStructure("# A", "# B"); err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
}

func TestValidateMarkdownTranslatedBlockStructureRejectsThematicBreak(t *testing.T) {
	err := ValidateMarkdownTranslatedBlockStructure("Hello.", "Hi.\n\n---\n")
	if err == nil {
		t.Fatal("expected error")
	}
}
