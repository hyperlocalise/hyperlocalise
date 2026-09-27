package main

import "testing"

func TestCountNativeSourceWords(t *testing.T) {
	cases := []struct {
		name   string
		source string
		want   int
	}{
		{"empty", "", 0},
		{"whitespace only", "   ", 0},
		{"simple sentence", "Buy now", 2},
		{"strips html tags", "<b>Buy</b> now", 2},
		{"strips mustache placeholder", "Hello {{name}}, welcome", 2},
		{"strips printf placeholder", "You have %d items", 3},
		{"strips template placeholder", "Total: ${amount}", 1},
		{"strips simple icu argument", "Hello {name}, welcome", 2},
		{"strips simple icu number argument", "Count is {n, number}", 2},
		{"counts icu plural option literals", "{count, plural, one {One file} other {Many files}}", 4},
		{"counts icu plural hash option literals", "{count, plural, one {# item} other {# items}}", 2},
		{"counts icu select option literals", "{gender, select, male {He} female {She} other {They}} liked this", 5},
		{"counts nested icu option literals", "{gender, select, other {{count, plural, one {one file} other {many files}}}}", 4},
		{"keeps punctuation-only text as zero words", "...", 0},
		{"counts hyphenated word as one", "state-of-the-art", 1},
		{"counts apostrophe contraction as one", "don't stop", 2},
		{"unbalanced opening brace is kept as literal", "missing {close", 2},
		{"counts each CJK character separately", "你好世界", 4},
		{"counts each Japanese character separately", "こんにちは", 5},
		{"counts mixed script text", "Hello 世界", 3},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := countNativeSourceWords(tc.source)
			if got != tc.want {
				t.Fatalf("countNativeSourceWords(%q) = %d, want %d", tc.source, got, tc.want)
			}
		})
	}
}

func TestStripBraceArguments(t *testing.T) {
	cases := []struct {
		name   string
		source string
		want   string
	}{
		{"no braces", "hello world", "hello world"},
		{"simple argument", "hello {name}", "hello  "},
		{"simple typed argument", "Count is {n, number}", "Count is  "},
		{"nested plural keeps option literals", "a {count, plural, one {# item} other {# items}} b", "a  # item # items  b"},
		{"unbalanced trailing brace kept literal", "a {b", "a {b"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := stripBraceArguments(tc.source)
			if got != tc.want {
				t.Fatalf("stripBraceArguments(%q) = %q, want %q", tc.source, got, tc.want)
			}
		})
	}
}
