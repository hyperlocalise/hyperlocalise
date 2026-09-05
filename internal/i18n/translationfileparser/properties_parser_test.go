package translationfileparser

import (
	"strings"
	"testing"
	"unsafe"
)

func TestJavaPropertiesParserParsesEscapesCommentsAndContinuations(t *testing.T) {
	content := []byte(`# Checkout screen
welcome.message = Hello {0}
escaped\ key: Line one\nLine two
path = C:\\Program Files\\Hyperlocalise
unicode = Snowman \u2603
spaced\:key value with \= equals and \: colon
continued = first \
    second
`)

	got, contextByKey, err := (JavaPropertiesParser{}).ParseWithContext(content)
	if err != nil {
		t.Fatalf("parse properties: %v", err)
	}

	assertPropertyValue(t, got, "welcome.message", "Hello {0}")
	assertPropertyValue(t, got, "escaped key", "Line one\nLine two")
	assertPropertyValue(t, got, "path", `C:\Program Files\Hyperlocalise`)
	assertPropertyValue(t, got, "unicode", "Snowman \u2603")
	assertPropertyValue(t, got, "spaced:key", "value with = equals and : colon")
	assertPropertyValue(t, got, "continued", "first second")
	if contextByKey["welcome.message"] != "Checkout screen" {
		t.Fatalf("unexpected context for welcome.message: %#v", contextByKey)
	}
}

func TestMarshalJavaPropertiesPreservesTemplateAndAppendsDeterministically(t *testing.T) {
	template := []byte(`# Checkout screen
welcome.message = Hello {0}
untouched=Keep
escaped\ key: Line one\nLine two
`)

	got, err := MarshalJavaProperties(template, map[string]string{
		"welcome.message": "Bonjour {0}",
		"escaped key":     "Ligne 1\nLigne 2",
		"z.last":          "Dernier",
		"a.first":         "Premier",
	})
	if err != nil {
		t.Fatalf("marshal properties: %v", err)
	}

	want := `# Checkout screen
welcome.message = Bonjour {0}
untouched=Keep
escaped\ key: Ligne 1\nLigne 2
a.first=Premier
z.last=Dernier
`
	if string(got) != want {
		t.Fatalf("properties output mismatch\n got:\n%s\nwant:\n%s", got, want)
	}
}

func TestJavaPropertiesParserAndMarshalHandleUTF8BOM(t *testing.T) {
	template := []byte("\xef\xbb\xbfwelcome.message=Hello {0}\n")

	got, err := (JavaPropertiesParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse properties with BOM: %v", err)
	}
	assertPropertyValue(t, got, "welcome.message", "Hello {0}")
	if _, ok := got["\ufeffwelcome.message"]; ok {
		t.Fatalf("BOM must not be included in the first key: %#v", got)
	}

	rendered, err := MarshalJavaProperties(template, map[string]string{"welcome.message": "Bonjour {0}"})
	if err != nil {
		t.Fatalf("marshal properties with BOM: %v", err)
	}
	want := "\ufeffwelcome.message=Bonjour {0}\n"
	if string(rendered) != want {
		t.Fatalf("properties output mismatch\n got: %q\nwant: %q", rendered, want)
	}
}

func TestPropertiesDocumentRenderAppendsEntriesSkippedByBoundsGuard(t *testing.T) {
	doc := propertiesDocument{
		template: "",
		entries: []propertiesEntry{{
			key:        "welcome.message",
			valueStart: 12,
			valueEnd:   18,
		}},
	}

	got := string(doc.render(map[string]string{"welcome.message": "Bonjour"}))
	if got != "welcome.message=Bonjour\n" {
		t.Fatalf("expected skipped entry to be appended, got %q", got)
	}
}

func TestMarshalJavaPropertiesEscapesNonBMPRunesAsSurrogatePairs(t *testing.T) {
	template := []byte("emoji.value=old\n")

	got, err := MarshalJavaProperties(template, map[string]string{
		"emoji.value":         "Face \U0001F600",
		"emoji.key\U0001F600": "new \U0001F600",
	})
	if err != nil {
		t.Fatalf("marshal properties with non-BMP runes: %v", err)
	}

	want := "emoji.value=Face \\uD83D\\uDE00\nemoji.key\\uD83D\\uDE00=new \\uD83D\\uDE00\n"
	if string(got) != want {
		t.Fatalf("properties output mismatch\n got: %q\nwant: %q", got, want)
	}
}

func TestJavaPropertiesParserRejectsMalformedUnicodeEscape(t *testing.T) {
	_, err := (JavaPropertiesParser{}).Parse([]byte(`bad = \u12xz
`))
	if err == nil {
		t.Fatal("expected malformed unicode escape error")
	}
	if !strings.Contains(err.Error(), "invalid \\u escape") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestJavaPropertiesParserRejectsDuplicateKeys(t *testing.T) {
	_, err := (JavaPropertiesParser{}).Parse([]byte("hello=Hello\nhello=Bonjour\n"))
	if err == nil {
		t.Fatal("expected duplicate key error")
	}
	if !strings.Contains(err.Error(), "duplicate properties key") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func assertPropertyValue(t *testing.T, got map[string]string, key, want string) {
	t.Helper()
	if got[key] != want {
		t.Fatalf("properties key %q = %q, want %q", key, got[key], want)
	}
}

func TestJavaPropertiesParserPreservesCommentStructure(t *testing.T) {
	content := []byte(`# First paragraph.
#
#   Indented line.
# Last paragraph.
key = value
`)

	_, contextByKey, err := (JavaPropertiesParser{}).ParseWithContext(content)
	if err != nil {
		t.Fatalf("parse properties: %v", err)
	}

	want := "First paragraph.\n\n  Indented line.\nLast paragraph."
	got := contextByKey["key"]
	if got != want {
		t.Fatalf("unexpected context for key:\ngot:  %q\nwant: %q", got, want)
	}
}

func TestJavaPropertiesParserLineNumbersWithCarriageReturn(t *testing.T) {
	// \r is a valid line terminator in Java properties.
	content := []byte("key1=val1\rkey1=val2")

	_, err := (JavaPropertiesParser{}).Parse(content)
	if err == nil {
		t.Fatal("expected duplicate key error")
	}

	// If \r is not counted as a newline, both keys will be thought to be on line 1.
	// But they are on line 1 and line 2.
	const want = "line 2: duplicate properties key \"key1\" first defined on line 1"
	if !strings.Contains(err.Error(), want) {
		t.Fatalf("unexpected error message: %v\nwant: %s", err, want)
	}
}

func TestPropertiesEntryCapHintUsesPlausibleEntriesNotPhysicalLines(t *testing.T) {
	tests := []struct {
		name    string
		text    string
		wantMin int
		wantMax int
	}{
		{
			name:    "empty",
			text:    "",
			wantMin: 0,
			wantMax: 0,
		},
		{
			name:    "blank heavy",
			text:    strings.Repeat("\n", 100000),
			wantMin: 0,
			wantMax: 16,
		},
		{
			name:    "comment heavy with trailing property",
			text:    strings.Repeat("# comment line\n", 50000) + "only.key=value\n",
			wantMin: 0,
			wantMax: 16,
		},
		{
			name:    "dense properties",
			text:    strings.Repeat("key=value\n", 100),
			wantMin: 100,
			wantMax: 100,
		},
		{
			name:    "mixed header comments",
			text:    "# header\n\n! note\nfoo=bar\n# c\nbaz=qux\n",
			wantMin: 2,
			wantMax: 2,
		},
		{
			name:    "large dense file is capped",
			text:    strings.Repeat("k=v\n", 100000),
			wantMin: propertiesEntryCapHintMax,
			wantMax: propertiesEntryCapHintMax,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := propertiesEntryCapHint(tt.text)
			if got < tt.wantMin || got > tt.wantMax {
				t.Fatalf("propertiesEntryCapHint() = %d, want in [%d, %d]", got, tt.wantMin, tt.wantMax)
			}
		})
	}
}

func TestDecodeJavaPropertiesEscapesDetachesUnescapedString(t *testing.T) {
	source := strings.Repeat("x", 4096) + "plain" + strings.Repeat("y", 4096)
	raw := source[4096 : 4096+len("plain")]

	got, err := decodeJavaPropertiesEscapes(raw)
	if err != nil {
		t.Fatalf("decodeJavaPropertiesEscapes: %v", err)
	}
	if got != "plain" {
		t.Fatalf("decodeJavaPropertiesEscapes() = %q, want %q", got, "plain")
	}
	if stringSharesBacking(got, source) {
		t.Fatal("unescaped decode result still shares the source backing array")
	}
}

func TestParseJavaPropertiesDetachesKeysAndValuesFromDocument(t *testing.T) {
	content := []byte(strings.Repeat("# bulky comment that should not stay alive\n", 200) + "greeting=hello\npath=C:\\\\temp\nempty=\n")

	doc, err := parseJavaPropertiesDocument(content)
	if err != nil {
		t.Fatalf("parseJavaPropertiesDocument: %v", err)
	}
	if len(doc.entries) != 3 {
		t.Fatalf("got %d entries, want 3", len(doc.entries))
	}

	for _, entry := range doc.entries {
		if stringSharesBacking(entry.key, doc.template) {
			t.Errorf("key %q shares document backing", entry.key)
		}
		if stringSharesBacking(entry.sourceValue, doc.template) {
			t.Errorf("value %q for key %q shares document backing", entry.sourceValue, entry.key)
		}
	}

	values, err := (JavaPropertiesParser{}).Parse(content)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	assertPropertyValue(t, values, "greeting", "hello")
	assertPropertyValue(t, values, "path", `C:\temp`)
	assertPropertyValue(t, values, "empty", "")
}

func TestJavaPropertiesParserReadsCommentHeavyFile(t *testing.T) {
	content := []byte(strings.Repeat("# ignored comment\n\n", 1000) + "only.key = only value\n")

	values, err := (JavaPropertiesParser{}).Parse(content)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(values) != 1 {
		t.Fatalf("got %d entries, want 1", len(values))
	}
	assertPropertyValue(t, values, "only.key", "only value")
}

func stringSharesBacking(value, src string) bool {
	if len(value) == 0 || len(src) == 0 {
		return false
	}

	valueStart := uintptr(unsafe.Pointer(unsafe.StringData(value)))
	srcStart := uintptr(unsafe.Pointer(unsafe.StringData(src)))
	srcEnd := srcStart + uintptr(len(src))
	valueEnd := valueStart + uintptr(len(value))

	return valueStart < srcEnd && srcStart < valueEnd
}
