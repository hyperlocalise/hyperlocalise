package translationfileparser

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestXCStringsParser_DecodeErrors(t *testing.T) {
	tests := []struct {
		name    string
		content string
		wantErr string
	}{
		{
			name:    "invalid json payload",
			content: `{invalid json}`,
			wantErr: "xcstrings decode:",
		},
		{
			name:    "multiple json values or trailing data",
			content: `{"strings":{}} "extra data"`,
			wantErr: "multiple JSON values",
		},
		{
			name:    "missing strings object",
			content: `{"sourceLanguage": "en"}`,
			wantErr: `missing "strings" object`,
		},
		{
			name:    "strings field is not an object",
			content: `{"strings": "not an object"}`,
			wantErr: "strings must be an object",
		},
		{
			name:    "string entry is not an object",
			content: `{"strings": {"hello": 123}}`,
			wantErr: "strings.hello must be an object",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, err := (XCStringsParser{}).ParseWithContext([]byte(tt.content))
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErr)
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("expected error containing %q, got %v", tt.wantErr, err)
			}
		})
	}
}

func TestMarshalXCStrings_ValidationErrors(t *testing.T) {
	validTemplate := []byte(`{"sourceLanguage":"en","strings":{}}`)

	t.Run("empty or whitespace target locale", func(t *testing.T) {
		for _, loc := range []string{"", "   ", "\t\n"} {
			_, err := MarshalXCStrings(validTemplate, validTemplate, map[string]string{}, "en", loc)
			if err == nil || !strings.Contains(err.Error(), "target locale is required") {
				t.Fatalf("expected target locale required error for %q, got %v", loc, err)
			}
		}
	})

	t.Run("invalid json target template", func(t *testing.T) {
		_, err := MarshalXCStrings([]byte(`{bad json`), validTemplate, map[string]string{}, "en", "fr")
		if err == nil || !strings.Contains(err.Error(), "xcstrings decode:") {
			t.Fatalf("expected target template decode error, got %v", err)
		}
	})

	t.Run("invalid json source template", func(t *testing.T) {
		_, err := MarshalXCStrings(validTemplate, []byte(`{bad json`), map[string]string{}, "en", "fr")
		if err == nil || !strings.Contains(err.Error(), "xcstrings source template:") {
			t.Fatalf("expected source template decode error, got %v", err)
		}
	})

	t.Run("source template missing strings object", func(t *testing.T) {
		badSource := []byte(`{"sourceLanguage":"en"}`)
		_, err := MarshalXCStrings(validTemplate, badSource, map[string]string{}, "en", "fr")
		if err == nil || !strings.Contains(err.Error(), "missing \"strings\" object") {
			t.Fatalf("expected missing strings object error in source template, got %v", err)
		}
	})

	t.Run("target template missing strings object", func(t *testing.T) {
		badTarget := []byte(`{"sourceLanguage":"en"}`)
		_, err := MarshalXCStrings(badTarget, validTemplate, map[string]string{}, "en", "fr")
		if err == nil || !strings.Contains(err.Error(), "missing \"strings\" object") {
			t.Fatalf("expected missing strings object error in target template, got %v", err)
		}
	})
}

func TestEscapeXCStringsBaseKey_Scout(t *testing.T) {
	t.Run("plain key remains unescaped", func(t *testing.T) {
		key := "hello.world_123"
		if got := escapeXCStringsBaseKey(key); got != key {
			t.Fatalf("expected %q, got %q", key, got)
		}
	})

	t.Run("key containing double colons gets base64 url encoded", func(t *testing.T) {
		key := "button::title"
		got := escapeXCStringsBaseKey(key)
		if !strings.HasPrefix(got, xcstringsEscapedBaseKeyPrefix) {
			t.Fatalf("expected prefix %q, got %q", xcstringsEscapedBaseKeyPrefix, got)
		}

		encoded := strings.TrimPrefix(got, xcstringsEscapedBaseKeyPrefix)
		decoded, err := base64.RawURLEncoding.DecodeString(encoded)
		if err != nil {
			t.Fatalf("failed to decode base64 key %q: %v", encoded, err)
		}
		if string(decoded) != key {
			t.Fatalf("expected decoded string %q, got %q", key, string(decoded))
		}
	})

	t.Run("key starting with reserved escape prefix gets base64 url encoded", func(t *testing.T) {
		key := "%xcs:custom_key"
		got := escapeXCStringsBaseKey(key)
		if !strings.HasPrefix(got, xcstringsEscapedBaseKeyPrefix) {
			t.Fatalf("expected prefix %q, got %q", xcstringsEscapedBaseKeyPrefix, got)
		}
		encoded := strings.TrimPrefix(got, xcstringsEscapedBaseKeyPrefix)
		decoded, err := base64.RawURLEncoding.DecodeString(encoded)
		if err != nil {
			t.Fatalf("failed to decode base64 key %q: %v", encoded, err)
		}
		if string(decoded) != key {
			t.Fatalf("expected decoded string %q, got %q", key, string(decoded))
		}
	})
}

func TestParseXCStringsLocale_EdgeCases(t *testing.T) {
	content := []byte(`{
  "sourceLanguage": "en",
  "strings": {
    "welcome": {
      "localizations": {
        "fr": {
          "stringUnit": {
            "state": "translated",
            "value": "Bienvenue"
          }
        }
      }
    }
  }
}`)

	t.Run("trims whitespace from requested locale tag", func(t *testing.T) {
		got, err := ParseXCStringsLocale(content, "  fr \t")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got["welcome"] != "Bienvenue" {
			t.Fatalf("expected Bienvenue, got %q", got["welcome"])
		}
	})

	t.Run("unconfigured locale returns empty map without error", func(t *testing.T) {
		got, err := ParseXCStringsLocale(content, "de")
		if err != nil {
			t.Fatalf("unexpected error for unconfigured locale: %v", err)
		}
		if len(got) != 0 {
			t.Fatalf("expected 0 entries for unconfigured locale, got %d", len(got))
		}
	})
}
