package translationfileparser

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestARBParser_ParseAndParseWithContext_EdgeCases_Scout(t *testing.T) {
	t.Run("parse error handling for malformed json and non-object roots", func(t *testing.T) {
		tests := []struct {
			name    string
			content []byte
			wantErr string
		}{
			{
				name:    "malformed json syntax",
				content: []byte(`{ "hello": "world", }`),
				wantErr: "arb decode",
			},
			{
				name:    "array json root",
				content: []byte(`["hello", "world"]`),
				wantErr: "arb decode",
			},
			{
				name:    "string json root",
				content: []byte(`"hello"`),
				wantErr: "arb decode",
			},
			{
				name:    "number json root",
				content: []byte(`123`),
				wantErr: "arb decode",
			},
			{
				name:    "boolean json root",
				content: []byte(`true`),
				wantErr: "arb decode",
			},
			{
				name:    "non-string message value type integer",
				content: []byte(`{"count": 42}`),
				wantErr: `arb key "count" must be string, got float64`,
			},
			{
				name:    "non-string message value type boolean",
				content: []byte(`{"enabled": true}`),
				wantErr: `arb key "enabled" must be string, got bool`,
			},
			{
				name:    "non-string message value type array",
				content: []byte(`{"tags": ["a", "b"]}`),
				wantErr: `arb key "tags" must be string, got []interface {}`,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				_, err := (ARBParser{}).Parse(tt.content)
				if err == nil {
					t.Fatalf("Parse() expected error containing %q, got nil", tt.wantErr)
				}
				if !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("Parse() error = %v, want substring %q", err, tt.wantErr)
				}

				_, _, errCtx := (ARBParser{}).ParseWithContext(tt.content)
				if errCtx == nil {
					t.Fatalf("ParseWithContext() expected error containing %q, got nil", tt.wantErr)
				}
				if !strings.Contains(errCtx.Error(), tt.wantErr) {
					t.Fatalf("ParseWithContext() error = %v, want substring %q", errCtx, tt.wantErr)
				}
			})
		}
	})

	t.Run("description extraction trimming and invalid metadata filtering", func(t *testing.T) {
		content := []byte(`{
  "padded": "Padded text",
  "@padded": {
    "description": "   Trimming spaces around context   "
  },
  "empty_desc": "No desc",
  "@empty_desc": {
    "description": ""
  },
  "whitespace_desc": "Whitespace desc",
  "@whitespace_desc": {
    "description": "     "
  },
  "non_string_desc": "Number desc",
  "@non_string_desc": {
    "description": 100
  },
  "string_meta": "String meta",
  "@string_meta": "not-a-metadata-map"
}`)

		messages, descriptions, err := (ARBParser{}).ParseWithContext(content)
		if err != nil {
			t.Fatalf("ParseWithContext() unexpected error: %v", err)
		}

		if len(messages) != 5 {
			t.Fatalf("expected 5 message entries, got %d", len(messages))
		}

		if desc, ok := descriptions["padded"]; !ok || desc != "Trimming spaces around context" {
			t.Errorf("expected trimmed description %q, got %q (ok=%v)", "Trimming spaces around context", desc, ok)
		}

		for _, key := range []string{"empty_desc", "whitespace_desc", "non_string_desc", "string_meta"} {
			if desc, ok := descriptions[key]; ok {
				t.Errorf("did not expect description for key %q, got %q", key, desc)
			}
		}
	})
}

func TestMarshalARB_TargetLocaleAndMetadata_EdgeCases_Scout(t *testing.T) {
	t.Run("target locale trimming and injection or preservation", func(t *testing.T) {
		// Scenario 1: Inject target locale with leading/trailing spaces when template missing @@locale
		templateWithoutLocale := []byte(`{
  "hello": "Hello"
}`)
		out, err := MarshalARB(templateWithoutLocale, templateWithoutLocale, map[string]string{
			"hello": "Hola",
		}, "  es-ES  ")
		if err != nil {
			t.Fatalf("MarshalARB() unexpected error: %v", err)
		}

		var payload map[string]any
		if err := json.Unmarshal(out, &payload); err != nil {
			t.Fatalf("failed to unmarshal output: %v", err)
		}
		if payload["@@locale"] != "es-ES" {
			t.Errorf("expected injected @@locale %q, got %#v", "es-ES", payload["@@locale"])
		}

		// Scenario 2: Update existing @@locale with trimmed target locale
		templateWithLocale := []byte(`{
  "@@locale": "en",
  "hello": "Hello"
}`)
		out, err = MarshalARB(templateWithLocale, templateWithLocale, map[string]string{
			"hello": "Bonjour",
		}, "  fr-FR  ")
		if err != nil {
			t.Fatalf("MarshalARB() unexpected error: %v", err)
		}

		if err := json.Unmarshal(out, &payload); err != nil {
			t.Fatalf("failed to unmarshal output: %v", err)
		}
		if payload["@@locale"] != "fr-FR" {
			t.Errorf("expected updated @@locale %q, got %#v", "fr-FR", payload["@@locale"])
		}

		// Scenario 3: Whitespace-only target locale preserves template @@locale
		out, err = MarshalARB(templateWithLocale, templateWithLocale, map[string]string{
			"hello": "Hello",
		}, "   ")
		if err != nil {
			t.Fatalf("MarshalARB() unexpected error: %v", err)
		}

		if err := json.Unmarshal(out, &payload); err != nil {
			t.Fatalf("failed to unmarshal output: %v", err)
		}
		if payload["@@locale"] != "en" {
			t.Errorf("expected preserved @@locale %q, got %#v", "en", payload["@@locale"])
		}
	})

	t.Run("template decode error handling for non-object and trailing tokens", func(t *testing.T) {
		valid := []byte(`{"hello": "world"}`)

		tests := []struct {
			name     string
			template []byte
			wantErr  string
		}{
			{
				name:     "template is non-object array",
				template: []byte(`[1, 2, 3]`),
				wantErr:  "arb decode: expected object",
			},
			{
				name:     "template is primitive number",
				template: []byte(`42`),
				wantErr:  "arb decode: expected object",
			},
			{
				name:     "template has trailing json tokens",
				template: []byte(`{"hello": "world"} {"extra": 1}`),
				wantErr:  "arb decode: unexpected trailing json tokens",
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				_, err := MarshalARB(tt.template, valid, map[string]string{"hello": "world"}, "en")
				if err == nil {
					t.Fatalf("MarshalARB() expected error containing %q, got nil", tt.wantErr)
				}
				if !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("MarshalARB() error = %v, want substring %q", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("key deletion with metadata pruning and sorted append", func(t *testing.T) {
		targetTemplate := []byte(`{
  "@@locale": "de",
  "keep": "Behalten",
  "@keep": {
    "description": "Keep message"
  },
  "remove": "Entfernen",
  "@remove": {
    "description": "Remove message"
  },
  "@custom_meta": {
    "version": "1.0"
  }
}`)

		sourceTemplate := []byte(`{
  "@@locale": "en",
  "keep": "Keep",
  "remove": "Remove",
  "zebra": "Zebra",
  "@zebra": {
    "description": "Animal zebra"
  },
  "apple": "Apple"
}`)

		// Only pass "keep", "zebra", "apple" in values map. "remove" should be pruned.
		out, err := MarshalARB(targetTemplate, sourceTemplate, map[string]string{
			"keep":  "Behalten",
			"zebra": "Zebra",
			"apple": "Apfel",
		}, "de")
		if err != nil {
			t.Fatalf("MarshalARB() unexpected error: %v", err)
		}

		rendered := string(out)

		// Assert "remove" and "@remove" are pruned
		if strings.Contains(rendered, `"remove"`) || strings.Contains(rendered, `"@remove"`) {
			t.Errorf("expected 'remove' key and metadata to be pruned, got:\n%s", rendered)
		}

		// Assert "@custom_meta" is retained
		if !strings.Contains(rendered, `"@custom_meta"`) {
			t.Errorf("expected '@custom_meta' to be retained, got:\n%s", rendered)
		}

		// Assert appended keys ("apple", "zebra") are written in sorted order
		appleIdx := strings.Index(rendered, `"apple": "Apfel"`)
		zebraIdx := strings.Index(rendered, `"zebra": "Zebra"`)
		zebraMetaIdx := strings.Index(rendered, `"@zebra": {`)

		if appleIdx == -1 || zebraIdx == -1 || zebraMetaIdx == -1 {
			t.Fatalf("expected 'apple', 'zebra', and '@zebra' in output, got:\n%s", rendered)
		}

		if appleIdx >= zebraIdx {
			t.Errorf("expected appended keys in sorted order: apple (%d) should precede zebra (%d)", appleIdx, zebraIdx)
		}

		if zebraMetaIdx <= zebraIdx {
			t.Errorf("expected source metadata for zebra (%d) to follow key zebra (%d)", zebraMetaIdx, zebraIdx)
		}
	})
}
