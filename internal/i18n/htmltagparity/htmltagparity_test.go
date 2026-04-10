package htmltagparity

import "testing"

func TestMismatchEqualTags(t *testing.T) {
	src := `Hello <strong>world</strong>`
	tgt := `Bonjour <strong>monde</strong>`
	if Mismatch(src, tgt) {
		t.Fatalf("expected no mismatch for same tag skeleton")
	}
}

func TestMismatchExtraTag(t *testing.T) {
	src := `Hello <b>world</b>`
	tgt := `Bonjour <b>monde</b> <br/>`
	if !Mismatch(src, tgt) {
		t.Fatalf("expected mismatch when target has extra tag")
	}
}

func TestMismatchReorderedTags(t *testing.T) {
	src := `<p><span>a</span><em>b</em></p>`
	tgt := `<p><em>b</em><span>a</span></p>`
	if !Mismatch(src, tgt) {
		t.Fatalf("expected mismatch when tag order differs")
	}
}

func TestMismatchPlainText(t *testing.T) {
	if Mismatch("hello", "bonjour") {
		t.Fatalf("plain text should not mismatch")
	}
}
