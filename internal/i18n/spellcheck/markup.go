package spellcheck

import "strings"

// stripMarkup replaces Hyperlocalise/Liquid internal placeholder sentinels,
// HTML tags and attributes, and Markdown code spans with a single space
// each, leaving everything else (including the text inside HTML elements)
// untouched. Replacing a matched span with exactly one space, regardless of
// its length, prevents words on either side of the removed span from being
// glued together.
func stripMarkup(s string) string {
	// BOLT OPTIMIZATION: Fast-path strings that contain none of the
	// trigger bytes to avoid allocating a builder for plain text.
	if !strings.ContainsAny(s, "\x1e<`") {
		return s
	}

	var b strings.Builder
	b.Grow(len(s))

	for i := 0; i < len(s); {
		switch s[i] {
		case '\x1e':
			if end, ok := scanSentinel(s, i); ok {
				b.WriteByte(' ')
				i = end
				continue
			}
		case '<':
			if end, ok := scanHTMLTag(s, i); ok {
				b.WriteByte(' ')
				i = end
				continue
			}
		case '`':
			if end, ok := scanCodeSpan(s, i); ok {
				b.WriteByte(' ')
				i = end
				continue
			}
		}
		b.WriteByte(s[i])
		i++
	}
	return b.String()
}

// scanSentinel reports whether s[start:] begins a Hyperlocalise/Liquid
// internal placeholder sentinel, delimited by ASCII RS (\x1e) and US (\x1f)
// control bytes. It matches any \x1e...\x1f span generically (covering
// HLMDPH_, HLLQPH_, HLHTPH_, and any future HL*PH_ prefix) since these
// control bytes don't otherwise appear in translation content. On success it
// returns the index immediately after the closing \x1f.
func scanSentinel(s string, start int) (int, bool) {
	end := strings.IndexByte(s[start+1:], '\x1f')
	if end < 0 {
		return 0, false
	}
	return start + 1 + end + 1, true
}

// scanHTMLTag reports whether s[start:] begins an HTML-tag-shaped span:
// '<' followed by a letter (opening tag), '/' then a letter (closing tag),
// '!' (comment/doctype), or '?' (processing instruction). It scans to the
// matching unquoted '>', respecting quoted attribute values the same way
// htmltagparity.collectMarkupTags does, so a '>' inside a quoted attribute
// value does not terminate the tag early. On success it returns the index
// immediately after the matching '>'.
//
// This incidentally also matches Markdown autolinks (<https://example.com>)
// since they share the same "< followed by a letter" shape, and it removes
// any ICU-look-alike placeholder embedded inside an attribute value (e.g.
// href="/{lang}/page") since the whole tag span is dropped.
func scanHTMLTag(s string, start int) (int, bool) {
	i := start + 1
	if i >= len(s) {
		return 0, false
	}
	next := s[i]
	if next == '/' {
		i++
		if i >= len(s) {
			return 0, false
		}
		next = s[i]
	}
	if !isHTMLTagLead(next) {
		return 0, false
	}

	var quote byte
	for j := i; j < len(s); j++ {
		ch := s[j]
		if quote != 0 {
			if ch == quote {
				quote = 0
			}
			continue
		}
		switch ch {
		case '"', '\'':
			quote = ch
		case '>':
			return j + 1, true
		}
	}
	return 0, false
}

func isHTMLTagLead(ch byte) bool {
	return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch == '!' || ch == '?'
}

// scanCodeSpan reports whether s[start:] begins a Markdown code span: a run
// of one or more backticks with a later run of exactly the same length
// (the CommonMark code-span rule — a longer or shorter run of backticks
// does not close the span). On success it returns the index immediately
// after the closing backtick run. If no matching closing run exists, the
// opening backticks are left in place as ordinary, non-word punctuation.
func scanCodeSpan(s string, start int) (int, bool) {
	i := start
	for i < len(s) && s[i] == '`' {
		i++
	}
	fenceLen := i - start

	for i < len(s) {
		if s[i] != '`' {
			i++
			continue
		}
		j := i
		for j < len(s) && s[j] == '`' {
			j++
		}
		if j-i == fenceLen {
			return j, true
		}
		i = j
	}
	return 0, false
}
