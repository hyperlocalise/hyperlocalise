package main

import (
	"regexp"
	"strings"
)

var (
	nativeWordCountHTMLTagPattern     = regexp.MustCompile(`<[^>]*>`)
	nativeWordCountPlaceholderPattern = regexp.MustCompile(`\{\{[^}]*\}\}|%\d*\$?[sdif]|\$\{[^}]*\}`)
	nativeWordLikePattern = regexp.MustCompile(`\p{Han}|\p{Hiragana}|\p{Katakana}|\p{Hangul}|[\p{L}\p{N}][\p{L}\p{M}\p{N}'’-]*`)
)

func countNativeSourceWords(sourceText string) int {
	cleaned := stripNativeWordCountPlaceholders(sourceText)
	return len(nativeWordLikePattern.FindAllString(cleaned, -1))
}

func stripNativeWordCountPlaceholders(source string) string {
	cleaned := nativeWordCountHTMLTagPattern.ReplaceAllString(source, " ")
	cleaned = nativeWordCountPlaceholderPattern.ReplaceAllString(cleaned, " ")
	return stripBraceArguments(cleaned)
}

func stripBraceArguments(source string) string {
	var out strings.Builder
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
				if strings.ContainsRune(inner, '{') {
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
