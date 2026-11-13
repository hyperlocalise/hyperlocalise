package main

import (
	"regexp"
	"strings"
)

var (
	nativeWordCountHTMLTagPattern     = regexp.MustCompile(`<[^>]*>`)
	nativeWordCountPlaceholderPattern = regexp.MustCompile(`\{\{[^}]*\}\}|%\d*\$?[sdif]|\$\{[^}]*\}`)
	nativeWordLikePattern             = regexp.MustCompile(`\p{Han}|\p{Hiragana}|\p{Katakana}|\p{Hangul}|[\p{L}\p{N}][\p{L}\p{M}\p{N}'’-]*`)
)

func countNativeSourceWords(sourceText string) int {
	if strings.TrimSpace(sourceText) == "" {
		return 0
	}
	cleaned := stripNativeWordCountPlaceholders(sourceText)
	return len(nativeWordLikePattern.FindAllString(cleaned, -1))
}

func stripNativeWordCountPlaceholders(source string) string {
	cleaned := source
	// Fast-path: only invoke regular expression replacements when signal characters are present.
	if strings.IndexByte(cleaned, '<') >= 0 && strings.IndexByte(cleaned, '>') >= 0 {
		cleaned = nativeWordCountHTMLTagPattern.ReplaceAllString(cleaned, " ")
	}
	if strings.Contains(cleaned, "{{") || strings.IndexByte(cleaned, '%') >= 0 || strings.Contains(cleaned, "${") {
		cleaned = nativeWordCountPlaceholderPattern.ReplaceAllString(cleaned, " ")
	}
	return stripBraceArguments(cleaned)
}

func stripBraceArguments(source string) string {
	// Fast-path: if there are no opening braces, no ICU or brace arguments exist.
	if strings.IndexByte(source, '{') < 0 {
		return source
	}

	var out strings.Builder
	out.Grow(len(source))
	depth := 0
	start := -1
	for i, r := range source {
		switch {
		case r == '{':
			if depth == 0 {
				start = i
			}
			depth++
		case r == '}' && depth > 0:
			depth--
			if depth == 0 {
				inner := source[start+1 : i]
				if strings.IndexByte(inner, '{') >= 0 {
					out.WriteByte(' ')
					out.WriteString(extractNestedBraceLiterals(inner))
					out.WriteByte(' ')
				} else {
					out.WriteByte(' ')
				}
				start = -1
			}
		case depth == 0:
			out.WriteRune(r)
		}
	}
	if depth > 0 && start >= 0 {
		out.WriteString(source[start:])
	}
	return out.String()
}

func extractNestedBraceLiterals(source string) string {
	var out strings.Builder
	out.Grow(len(source))
	depth := 0
	start := -1
	for i, r := range source {
		switch {
		case r == '{':
			if depth == 0 {
				start = i
			}
			depth++
		case r == '}' && depth > 0:
			depth--
			if depth == 0 {
				if out.Len() > 0 {
					out.WriteByte(' ')
				}
				out.WriteString(stripBraceArguments(source[start+1 : i]))
				start = -1
			}
		}
	}
	if depth > 0 && start >= 0 {
		if out.Len() > 0 {
			out.WriteByte(' ')
		}
		out.WriteString(source[start:])
	}
	return out.String()
}
