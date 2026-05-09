package locales

import (
	"slices"
	"testing"
)

func TestNormalizeListSplitsTrimsAndDeduplicates(t *testing.T) {
	got := NormalizeList([]string{" fr-FR, de-DE ", "fr-fr", "", " es-ES "})
	want := []string{"fr-FR", "de-DE", "es-ES"}
	if !slices.Equal(got, want) {
		t.Fatalf("NormalizeList() = %#v, want %#v", got, want)
	}
}
