package pluralrules

import (
	"maps"
	"testing"

	"golang.org/x/text/feature/plural"
	"golang.org/x/text/language"
)

// Categories caches by base language. That is only correct while every
// regional variant has the same category set as its base language, so this
// test checks the cached answer against a fresh probe of each variant.
func TestCategoriesCacheKeyMatchesRegionalVariants(t *testing.T) {
	t.Parallel()
	variants := []string{
		"pt", "pt-PT", "pt-BR", "es", "es-419", "es-MX", "fr", "fr-CA", "fr-CH",
		"en", "en-GB", "en-IN", "de", "de-CH", "zh", "zh-Hant", "zh-HK",
		"sr", "sr-Latn", "ar", "ar-EG", "ca", "it", "nl-BE",
	}
	for _, pluralType := range []string{"plural", "selectordinal"} {
		rules := plural.Cardinal
		if pluralType == "selectordinal" {
			rules = plural.Ordinal
		}
		for _, locale := range variants {
			want := probeCategories(rules, language.MustParse(locale))
			if got := Categories(locale, pluralType); !maps.Equal(got, want) {
				t.Errorf("Categories(%q, %q) = %v, want %v from a direct probe", locale, pluralType, got, want)
			}
		}
	}
}

func TestCategoriesInvalidLocale(t *testing.T) {
	t.Parallel()
	for _, locale := range []string{"", "not a locale", "x-private"} {
		if got := Categories(locale, "plural"); got != nil {
			t.Errorf("Categories(%q) = %v, want nil", locale, got)
		}
	}
}

func TestFormName(t *testing.T) {
	t.Parallel()
	cases := map[plural.Form]string{
		plural.Zero:  CategoryZero,
		plural.One:   CategoryOne,
		plural.Two:   CategoryTwo,
		plural.Few:   CategoryFew,
		plural.Many:  CategoryMany,
		plural.Other: "",
	}
	for form, want := range cases {
		if got := formName(form); got != want {
			t.Errorf("formName(%v) = %q, want %q", form, got, want)
		}
	}
}

func BenchmarkCategoriesCached(b *testing.B) {
	_ = Categories("ar-EG", "plural")
	b.ReportAllocs()
	for b.Loop() {
		_ = Categories("ar-EG", "plural")
	}
}

func BenchmarkCategoriesProbe(b *testing.B) {
	tag := language.MustParse("ar-EG")
	b.ReportAllocs()
	for b.Loop() {
		_ = probeCategories(plural.Cardinal, tag)
	}
}

func BenchmarkUnreachable(b *testing.B) {
	options := []string{"=0", "zero", "one", "two", "few", "many", "other"}
	_ = Unreachable("ja", "plural", options)
	b.ReportAllocs()
	for b.Loop() {
		_ = Unreachable("ja", "plural", options)
	}
}
