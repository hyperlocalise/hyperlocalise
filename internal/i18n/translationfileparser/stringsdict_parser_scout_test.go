package translationfileparser

import (
	"strings"
	"testing"
)

func TestAppleStringsdictParser_SyntaxErrors(t *testing.T) {
	tests := []struct {
		name          string
		input         string
		errSubstrings []string
	}{
		{
			name:          "Empty XML Document",
			input:         "",
			errSubstrings: []string{}, // empty returns empty doc with no entries
		},
		{
			name:          "Malformed XML Tag",
			input:         `<?xml version="1.0"?><plist><dict><key>test</dict></plist>`,
			errSubstrings: []string{"xml decode"},
		},
		{
			name:          "Unclosed Element",
			input:         `<?xml version="1.0"?><plist><dict><key>test</key>`,
			errSubstrings: []string{"xml decode"},
		},
	}

	parser := AppleStringsdictParser{}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parser.Parse([]byte(tt.input))
			if len(tt.errSubstrings) == 0 {
				if err != nil {
					t.Fatalf("unexpected error for %s: %v", tt.name, err)
				}
				if len(got) != 0 {
					t.Fatalf("expected empty result map for %s, got: %v", tt.name, got)
				}
				return
			}

			if err == nil {
				t.Fatalf("expected error for %s, got nil", tt.name)
			}
			for _, sub := range tt.errSubstrings {
				if !strings.Contains(err.Error(), sub) {
					t.Errorf("expected error containing %q, got: %v", sub, err)
				}
			}
		})
	}
}

func TestAppleStringsdictParser_ValidationErrors(t *testing.T) {
	tests := []struct {
		name          string
		input         string
		errSubstrings []string
	}{
		{
			name: "Format Key Missing Format Specifier",
			input: `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>item_count</key>
  <dict>
    <key>NSStringLocalizedFormatKey</key>
    <string>plain string without specifier</string>
    <key>items</key>
    <dict>
      <key>one</key>
      <string>%d item</string>
    </dict>
  </dict>
</dict>
</plist>`,
			errSubstrings: []string{`stringsdict key "item_count.NSStringLocalizedFormatKey" has invalid NSStringLocalizedFormatKey`},
		},
		{
			name: "Multiple Format Tokens - Second Token Missing Substitution Key",
			input: `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>complex_message</key>
  <dict>
    <key>NSStringLocalizedFormatKey</key>
    <string>%#@files@ %#@missing@</string>
    <key>files</key>
    <dict>
      <key>one</key>
      <string>%d file</string>
    </dict>
  </dict>
</dict>
</plist>`,
			errSubstrings: []string{`references missing substitution key "missing"`},
		},
	}

	parser := AppleStringsdictParser{}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := parser.Parse([]byte(tt.input))
			if err == nil {
				t.Fatalf("expected validation error for %s, got nil", tt.name)
			}
			for _, sub := range tt.errSubstrings {
				if !strings.Contains(err.Error(), sub) {
					t.Errorf("expected error containing %q, got: %v", sub, err)
				}
			}
		})
	}
}

func TestAppleStringsdictParser_MultipleSubstitutionsAndPluralCategories(t *testing.T) {
	content := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>multitoken_count</key>
  <dict>
    <key>NSStringLocalizedFormatKey</key>
    <string>%#@files@ and %#@folders@</string>
    <key>files</key>
    <dict>
      <key>NSStringFormatSpecTypeKey</key>
      <string>NSStringPluralRuleType</string>
      <key>NSStringFormatValueTypeKey</key>
      <string>d</string>
      <key>zero</key>
      <string>0 files</string>
      <key>one</key>
      <string>1 file</string>
      <key>two</key>
      <string>2 files</string>
      <key>few</key>
      <string>a few files</string>
      <key>many</key>
      <string>many files</string>
      <key>other</key>
      <string>%d files</string>
    </dict>
    <key>folders</key>
    <dict>
      <key>one</key>
      <string>1 folder</string>
      <key>other</key>
      <string>%d folders</string>
    </dict>
  </dict>
</dict>
</plist>`)

	got, err := (AppleStringsdictParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse stringsdict with multiple tokens: %v", err)
	}

	expectedKeys := map[string]string{
		"multitoken_count.files.zero":    "0 files",
		"multitoken_count.files.one":     "1 file",
		"multitoken_count.files.two":     "2 files",
		"multitoken_count.files.few":     "a few files",
		"multitoken_count.files.many":    "many files",
		"multitoken_count.files.other":   "%d files",
		"multitoken_count.folders.one":   "1 folder",
		"multitoken_count.folders.other": "%d folders",
	}

	for k, wantVal := range expectedKeys {
		val, ok := got[k]
		if !ok {
			t.Errorf("expected key %q in parsed result, but was missing", k)
			continue
		}
		if val != wantVal {
			t.Errorf("for key %q: got %q, want %q", k, val, wantVal)
		}
	}

	// Verify metadata keys are filtered out completely
	for k := range got {
		if strings.HasSuffix(k, "NSStringFormatSpecTypeKey") || strings.HasSuffix(k, "NSStringFormatValueTypeKey") || strings.HasSuffix(k, "NSStringLocalizedFormatKey") {
			t.Errorf("metadata key %q should be filtered out from parsed entries", k)
		}
	}
}

func TestMarshalAppleStringsdict_XMLEscapingAndFallbacks(t *testing.T) {
	template := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>msg_count</key>
  <dict>
    <key>NSStringLocalizedFormatKey</key>
    <string>%#@messages@</string>
    <key>messages</key>
    <dict>
      <key>one</key>
      <string>%d &lt;message&gt; &amp; "one"</string>
      <key>other</key>
      <string>%d messages</string>
    </dict>
  </dict>
</dict>
</plist>`)

	// 1. Partial translations + XML escaping check
	out, err := MarshalAppleStringsdict(template, map[string]string{
		"msg_count.messages.one": "%d <message> & 'un'", // contains <, >, &, quotes which must be escaped
		// "msg_count.messages.other" omitted to test template fallback
	})
	if err != nil {
		t.Fatalf("marshal stringsdict: %v", err)
	}

	rendered := string(out)
	expectedEscapedOne := "%d &lt;message&gt; &amp; 'un'"
	if !strings.Contains(rendered, expectedEscapedOne) {
		t.Errorf("expected escaped translation %q in rendered output, got: %s", expectedEscapedOne, rendered)
	}
	if !strings.Contains(rendered, "<string>%d messages</string>") {
		t.Errorf("expected unmapped fallback key to preserve raw template value, got: %s", rendered)
	}

	// 2. Unchanged translation check (should retain raw string value)
	outUnchanged, err := MarshalAppleStringsdict(template, map[string]string{
		"msg_count.messages.one": `%d <message> & "one"`,
	})
	if err != nil {
		t.Fatalf("marshal unchanged stringsdict: %v", err)
	}
	if !strings.Contains(string(outUnchanged), `<string>%d &lt;message&gt; &amp; "one"</string>`) {
		t.Errorf("expected unchanged value to match raw string from template, got: %s", string(outUnchanged))
	}
}
