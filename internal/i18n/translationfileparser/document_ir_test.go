package translationfileparser

import (
	"strconv"
	"strings"
	"testing"
)

func TestParseMarkdownDocumentIRUsesStableSlotKeysAcrossWordingEdits(t *testing.T) {
	t.Parallel()

	original := ParseMarkdownDocumentIR([]byte("# Hello world\n\nFirst paragraph.\n"), false)
	edited := ParseMarkdownDocumentIR([]byte("# Hello there\n\nFirst paragraph changed.\n"), false)

	if len(original.Blocks) != 2 || len(edited.Blocks) != 2 {
		t.Fatalf("blocks original=%d edited=%d, want 2", len(original.Blocks), len(edited.Blocks))
	}
	if original.Blocks[0].ID != edited.Blocks[0].ID {
		t.Fatalf("heading slot changed: %q vs %q", original.Blocks[0].ID, edited.Blocks[0].ID)
	}
	if original.Blocks[1].ID != edited.Blocks[1].ID {
		t.Fatalf("paragraph slot changed: %q vs %q", original.Blocks[1].ID, edited.Blocks[1].ID)
	}
	if original.Blocks[0].Fingerprint == edited.Blocks[0].Fingerprint {
		t.Fatalf("expected heading fingerprint to change after wording edit")
	}
	if !strings.HasPrefix(original.Blocks[0].ID, "md.") {
		t.Fatalf("slot id = %q, want md. prefix", original.Blocks[0].ID)
	}
}

func TestParseMarkdownDocumentIRFrontmatterIsFieldKind(t *testing.T) {
	t.Parallel()

	doc := ParseMarkdownDocumentIR([]byte("---\ntitle: Docs\n---\n\nBody copy.\n"), false)
	if len(doc.Blocks) < 2 {
		t.Fatalf("expected frontmatter and body blocks, got %d", len(doc.Blocks))
	}

	var sawField bool
	for _, block := range doc.Blocks {
		if block.Kind == DocumentBlockKindField {
			sawField = true
			if block.Path != "frontmatter/title" {
				t.Fatalf("field path = %q, want frontmatter/title", block.Path)
			}
			if block.Text != "Docs" {
				t.Fatalf("field text = %q, want Docs", block.Text)
			}
		}
	}
	if !sawField {
		t.Fatalf("expected a frontmatter field block, got %+v", doc.Blocks)
	}
}

func TestAlignMarkdownSourceRevisionsMapsMovedCopyByFingerprint(t *testing.T) {
	t.Parallel()

	previous := []byte("Alpha\n\nBeta\n")
	current := []byte("Intro\n\nAlpha\n\nBeta\n")
	aligned := AlignMarkdownSourceRevisions(previous, current, false)

	prev := ParseMarkdownDocumentIR(previous, false)
	curr := ParseMarkdownDocumentIR(current, false)

	alphaPrev := findDocumentBlockByText(prev, "Alpha")
	alphaCurr := findDocumentBlockByText(curr, "Alpha")
	betaPrev := findDocumentBlockByText(prev, "Beta")
	betaCurr := findDocumentBlockByText(curr, "Beta")
	if alphaPrev.ID == "" || betaPrev.ID == "" {
		t.Fatalf("missing previous blocks")
	}
	if aligned[alphaPrev.ID] != alphaCurr.ID {
		t.Fatalf("alpha aligned to %q, want %q", aligned[alphaPrev.ID], alphaCurr.ID)
	}
	if aligned[betaPrev.ID] != betaCurr.ID {
		t.Fatalf("beta aligned to %q, want %q", aligned[betaPrev.ID], betaCurr.ID)
	}
}

func TestEncodeDocumentEntriesCommandOutputIncludesEnvelope(t *testing.T) {
	t.Parallel()

	doc := ParseMarkdownDocumentIR([]byte("# Title\n"), false)
	encoded := EncodeDocumentEntriesCommandOutput(doc)
	raw, ok := encoded[DocumentEntriesMetaKey]
	if !ok {
		t.Fatalf("missing %s envelope", DocumentEntriesMetaKey)
	}
	meta, ok := raw.(map[string]any)
	if !ok {
		t.Fatalf("envelope type %T", raw)
	}
	if meta["format"] != DocumentFormatMarkdown {
		t.Fatalf("format = %v, want markdown", meta["format"])
	}
}

func TestIsLegacyMarkdownHashKey(t *testing.T) {
	t.Parallel()

	if !IsLegacyMarkdownHashKey("md.0123456789abcdef") {
		t.Fatalf("expected hash key to be legacy")
	}
	if IsLegacyMarkdownHashKey("md.Heading[0]") {
		t.Fatalf("slot key should not be treated as a legacy hash")
	}
}

func TestRemapLegacyMarkdownPrefillMapsHashKeysOntoSlots(t *testing.T) {
	t.Parallel()

	source := []byte("# Hello\n\nWorld.\n")
	doc := ParseMarkdownDocumentIR(source, false)
	if len(doc.Blocks) == 0 {
		t.Fatalf("expected source blocks")
	}

	legacy := make(map[string]string, len(doc.Blocks))
	want := make(map[string]string, len(doc.Blocks))
	counts := make(map[string]int)
	for _, block := range doc.Blocks {
		n := counts[block.Fingerprint]
		counts[block.Fingerprint] = n + 1
		key := "md." + block.Fingerprint
		if n > 0 {
			key += "." + strconv.Itoa(n+1)
		}
		legacy[key] = "FR-" + block.Text
		want[block.ID] = "FR-" + block.Text
	}

	got := RemapLegacyMarkdownPrefill(source, false, legacy)
	for id, text := range want {
		if got[id] != text {
			t.Fatalf("remapped[%q] = %q, want %q (map=%v)", id, got[id], text, got)
		}
	}

	marshaled := string(MarshalMarkdown(source, legacy, false))
	if !strings.Contains(marshaled, "FR-World") {
		t.Fatalf("marshaled = %q, want legacy hash keys applied", marshaled)
	}
}

func findDocumentBlockByText(doc ParsedDocument, text string) DocumentBlock {
	for _, block := range doc.Blocks {
		if block.Text == text {
			return block
		}
	}
	return DocumentBlock{}
}
