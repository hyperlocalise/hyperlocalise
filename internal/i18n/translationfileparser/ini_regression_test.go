package translationfileparser

import (
	"strings"
	"testing"
)

func TestMarshalINIPartialValuesWithNewKeys(t *testing.T) {
	// Template has 3 entries
	template := []byte("[Home]\ncta = Get started\nquoted = \"Hello\"\nother = \"Value\"\n")
	// values has 2 entries: 1 existing updated ("cta"), 1 new added ("newKey")
	values := map[string]string{
		"Home.cta":    "Commencer",
		"Home.newKey": "Nouveau",
	}

	got, err := MarshalINI(template, values)
	if err != nil {
		t.Fatalf("MarshalINI failed: %v", err)
	}

	if !strings.Contains(string(got), "newKey=Nouveau") {
		t.Fatalf("MarshalINI failed to include newKey in output:\n%s", string(got))
	}
}
