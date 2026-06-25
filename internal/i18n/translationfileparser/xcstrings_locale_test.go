package translationfileparser

import "testing"

func TestResolveXCStringsLocalizationKeyMatchesRegionalAndAliasLocales(t *testing.T) {
	available := []string{"en", "fr", "fr-CA", "zh-Hans"}

	cases := []struct {
		requested string
		want      string
	}{
		{requested: "fr-FR", want: "fr"},
		{requested: "fr_CA", want: "fr-CA"},
		{requested: "FR", want: "fr"},
		{requested: "zh-CN", want: "zh-Hans"},
	}

	for _, tc := range cases {
		got, ok := resolveXCStringsLocalizationKey(tc.requested, available)
		if !ok {
			t.Fatalf("resolveXCStringsLocalizationKey(%q) = false", tc.requested)
		}
		if got != tc.want {
			t.Fatalf("resolveXCStringsLocalizationKey(%q) = %q, want %q", tc.requested, got, tc.want)
		}
	}
}

func TestParseXCStringsLocaleResolvesProjectLocaleAliases(t *testing.T) {
	content := []byte(`{
  "sourceLanguage": "en",
  "strings": {
    "hello": {
      "localizations": {
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": "Hello"
          }
        },
        "fr": {
          "stringUnit": {
            "state": "translated",
            "value": "Bonjour"
          }
        }
      }
    }
  }
}`)

	got, err := ParseXCStringsLocale(content, "fr-FR")
	if err != nil {
		t.Fatalf("parse target locale: %v", err)
	}
	if got["hello"] != "Bonjour" {
		t.Fatalf("unexpected hello translation: %q", got["hello"])
	}
}

func TestStrategyParseWithLocaleResolvesXCStringsProjectLocale(t *testing.T) {
	s := NewDefaultStrategy()

	content := []byte(`{
  "sourceLanguage": "en",
  "strings": {
    "hello": {
      "localizations": {
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": "Hello"
          }
        },
        "zh-Hans": {
          "stringUnit": {
            "state": "translated",
            "value": "你好"
          }
        }
      }
    }
  }
}`)

	got, err := s.ParseWithLocale("Localizable.xcstrings", content, "zh-CN")
	if err != nil {
		t.Fatalf("parse with locale: %v", err)
	}
	if got["hello"] != "你好" {
		t.Fatalf("unexpected hello translation: %q", got["hello"])
	}
}
