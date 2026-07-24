package translationfileparser

import (
	"strings"
	"testing"
)

// TestJavaProperties_SeparatorVariants verifies that key-value pairs can be
// separated by '=', ':', or whitespace, with or without surrounding spaces,
// and that escaped separators inside keys are handled correctly.
func TestJavaProperties_SeparatorVariants(t *testing.T) {
	content := []byte(`
# Equals separator
key1=value1
# Colon separator
key2:value2
# Whitespace separator
key3 value3
# Equals with spaces
key4 = value4
# Colon with spaces
key5 : value5
# Whitespace with extra spaces
key6   value6
# Escaped separator in key
key\:with\:colons = value7
key\=with\=equals : value8
key\ with\ spaces = value9
`)

	got, _, err := (JavaPropertiesParser{}).ParseWithContext(content)
	if err != nil {
		t.Fatalf("Parse() failed: %v", err)
	}

	expected := map[string]string{
		"key1":            "value1",
		"key2":            "value2",
		"key3":            "value3",
		"key4":            "value4",
		"key5":            "value5",
		"key6":            "value6",
		"key:with:colons": "value7",
		"key=with=equals": "value8",
		"key with spaces": "value9",
	}

	for k, want := range expected {
		if got[k] != want {
			t.Errorf("key %q = %q, want %q", k, got[k], want)
		}
	}
}

// TestJavaProperties_LineContinuationOddEven verifies that trailing backslashes
// behave according to their parity: odd counts continue the logical line,
// while even counts represent escaped backslashes and terminate the logical line.
func TestJavaProperties_LineContinuationOddEven(t *testing.T) {
	content := []byte(`
# Odd backslashes (1) - continues line
continued.one = first \
    second

# Even backslashes (2) - escaped backslash, does not continue line
escaped.backslash = value\\
next.key = separate

# Odd backslashes (3) - continues line, includes an escaped backslash
continued.three = first \\\
    second

# Even backslashes (4) - two escaped backslashes, does not continue line
escaped.four = value\\\\
final.key = finished
`)

	got, _, err := (JavaPropertiesParser{}).ParseWithContext(content)
	if err != nil {
		t.Fatalf("Parse() failed: %v", err)
	}

	expected := map[string]string{
		"continued.one":     "first second",
		"escaped.backslash": "value\\",
		"next.key":          "separate",
		"continued.three":   "first \\second",
		"escaped.four":      "value\\\\",
		"final.key":         "finished",
	}

	for k, want := range expected {
		if got[k] != want {
			t.Errorf("key %q = %q, want %q", k, got[k], want)
		}
	}
}

// TestJavaProperties_UnicodeAndSurrogatePairs verifies that valid Unicode escapes
// and UTF-16 surrogate pairs are correctly decoded, and that various malformed
// or incomplete escapes correctly return errors.
func TestJavaProperties_UnicodeAndSurrogatePairs(t *testing.T) {
	t.Run("valid unicode escapes and surrogate pairs", func(t *testing.T) {
		content := []byte(`
snowman = \u2603
emoji = \uD83D\uDE00
`)
		got, err := (JavaPropertiesParser{}).Parse(content)
		if err != nil {
			t.Fatalf("Parse() unexpected error: %v", err)
		}
		if got["snowman"] != "☃" {
			t.Errorf("expected snowman to be '☃', got %q", got["snowman"])
		}
		if got["emoji"] != "😀" {
			t.Errorf("expected emoji to be '😀', got %q", got["emoji"])
		}
	})

	t.Run("invalid incomplete unicode escape", func(t *testing.T) {
		content := []byte("key = \\u12\n")
		_, err := (JavaPropertiesParser{}).Parse(content)
		if err == nil {
			t.Error("expected error for incomplete unicode escape")
		}
		if !strings.Contains(err.Error(), "invalid \\u escape") {
			t.Errorf("expected 'invalid \\u escape' error, got %v", err)
		}
	})

	t.Run("invalid non-hex unicode escape", func(t *testing.T) {
		content := []byte("key = \\u12g3\n")
		_, err := (JavaPropertiesParser{}).Parse(content)
		if err == nil {
			t.Error("expected error for non-hex unicode escape")
		}
		if !strings.Contains(err.Error(), "invalid \\u escape") {
			t.Errorf("expected 'invalid \\u escape' error, got %v", err)
		}
	})

	t.Run("low surrogate without high surrogate", func(t *testing.T) {
		content := []byte("key = \\uDE00\n")
		_, err := (JavaPropertiesParser{}).Parse(content)
		if err == nil {
			t.Error("expected error for isolated low surrogate")
		}
		if !strings.Contains(err.Error(), "invalid low surrogate without high surrogate") {
			t.Errorf("expected 'invalid low surrogate without high surrogate' error, got %v", err)
		}
	})

	t.Run("invalid low surrogate in pair", func(t *testing.T) {
		// D83D is high surrogate, 2603 is snowman (not a valid low surrogate which must be DC00-DFFF)
		content := []byte("key = \\uD83D\\u2603\n")
		_, err := (JavaPropertiesParser{}).Parse(content)
		if err == nil {
			t.Error("expected error for invalid low surrogate in pair")
		}
		if !strings.Contains(err.Error(), "invalid surrogate pair") {
			t.Errorf("expected 'invalid surrogate pair' error, got %v", err)
		}
	})

	t.Run("incomplete surrogate pair at EOF", func(t *testing.T) {
		content := []byte("key = \\uD83D")
		_, err := (JavaPropertiesParser{}).Parse(content)
		if err == nil {
			t.Error("expected error for incomplete surrogate pair at EOF")
		}
		if !strings.Contains(err.Error(), "invalid surrogate pair") && !strings.Contains(err.Error(), "invalid \\u escape") {
			t.Errorf("expected surrogate error, got %v", err)
		}
	})
}

// TestJavaProperties_CommentsAndContext verifies that comments starting with '#'
// and '!' are correctly handled and trimmed, and that consecutive comments are
// aggregated correctly as context.
func TestJavaProperties_CommentsAndContext(t *testing.T) {
	content := []byte(`
# First comment paragraph.
# Second line of first paragraph.
!
! Exclamation comment paragraph.
!
# Another paragraph after exclamation comment.
key = value
`)

	_, contextByKey, err := (JavaPropertiesParser{}).ParseWithContext(content)
	if err != nil {
		t.Fatalf("ParseWithContext() failed: %v", err)
	}

	want := "First comment paragraph.\nSecond line of first paragraph.\n\nExclamation comment paragraph.\n\nAnother paragraph after exclamation comment."
	got := contextByKey["key"]
	if got != want {
		t.Fatalf("context mismatch:\ngot:  %q\nwant: %q", got, want)
	}
}

// TestJavaProperties_DanglingContinuationError verifies that a physical line ending
// with a single backslash at the end of the file is handled properly and returns
// a clear error rather than crashing.
func TestJavaProperties_DanglingContinuationError(t *testing.T) {
	content := []byte("key = value \\\n")
	_, err := (JavaPropertiesParser{}).Parse(content)
	if err == nil {
		t.Error("expected error for dangling continuation at EOF")
	}
	if !strings.Contains(err.Error(), "continuation escape at end of file") {
		t.Errorf("expected 'continuation escape at end of file' error, got %v", err)
	}
}

// TestJavaProperties_RenderDeterminism verifies that rendering properties preserves
// original order and formatting while updating updated values and appending new ones.
func TestJavaProperties_RenderDeterminism(t *testing.T) {
	template := []byte(`# Comments
key1 = value1
key2 : value2
`)

	values := map[string]string{
		"key1": "newvalue1",
		"key2": "newvalue2",
		"key3": "appendedvalue3",
	}

	rendered, err := MarshalJavaProperties(template, values)
	if err != nil {
		t.Fatalf("MarshalJavaProperties() failed: %v", err)
	}

	want := `# Comments
key1 = newvalue1
key2 : newvalue2
key3=appendedvalue3
`
	if string(rendered) != want {
		t.Errorf("rendered output mismatch:\ngot:\n%s\nwant:\n%s", rendered, want)
	}
}
