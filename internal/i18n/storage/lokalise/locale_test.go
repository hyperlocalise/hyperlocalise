package lokalise

import (
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

func TestMatchRequestedLocale(t *testing.T) {
	requested := []string{"en-US", "fr"}
	if got := matchRequestedLocale("en_US", requested); got != "en-US" {
		t.Fatalf("matchRequestedLocale(en_US) = %q, want en-US", got)
	}
	if got := matchRequestedLocale("fr", requested); got != "fr" {
		t.Fatalf("matchRequestedLocale(fr) = %q, want fr", got)
	}
	if got := matchRequestedLocale("de", requested); got != "" {
		t.Fatalf("matchRequestedLocale(de) = %q, want empty", got)
	}
}

func TestResolvePullLocalesPrefersEntryIDsOverTargetLanguages(t *testing.T) {
	req := storage.PullRequest{
		EntryIDs: []storage.EntryID{
			{Key: "hello", Locale: "en-US"},
		},
	}
	got := resolvePullLocales(req, []string{"fr", "de"})
	if len(got) != 1 || got[0] != "en-US" {
		t.Fatalf("resolvePullLocales = %#v, want [en-US]", got)
	}
}

func TestResolvePullLocalesUsesTargetLanguagesWhenNoEntryIDs(t *testing.T) {
	got := resolvePullLocales(storage.PullRequest{}, []string{"fr", "de"})
	if len(got) != 2 || got[0] != "fr" || got[1] != "de" {
		t.Fatalf("resolvePullLocales = %#v, want [fr de]", got)
	}
}

func TestResolvePullLocalesExplicitLocalesWin(t *testing.T) {
	req := storage.PullRequest{
		Locales:  []string{"es"},
		EntryIDs: []storage.EntryID{{Key: "hello", Locale: "en-US"}},
	}
	got := resolvePullLocales(req, []string{"fr"})
	if len(got) != 1 || got[0] != "es" {
		t.Fatalf("resolvePullLocales = %#v, want [es]", got)
	}
}

func TestToLokaliseLanguageISO(t *testing.T) {
	if got := toLokaliseLanguageISO("en-US"); got != "en_US" {
		t.Fatalf("toLokaliseLanguageISO = %q, want en_US", got)
	}
}
