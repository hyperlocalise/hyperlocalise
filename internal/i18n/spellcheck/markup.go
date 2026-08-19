package spellcheck

import "strings"

// stripMarkup replaces internal placeholder sentinels, HTML tags, and
// Markdown code spans with spaces so adjacent words remain separated.
func stripMarkup(s string) string {
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

// scanSentinel matches an internal placeholder delimited by ASCII
// record separator (\x1e) and unit separator (\x1f).
func scanSentinel(s string, start int) (int, bool) {
	end := strings.IndexByte(s[start+1:], '\x1f')
	if end < 0 {
		return 0, false
	}
	return start + 1 + end + 1, true
}

// scanHTMLTag matches an HTML-tag-shaped span through its unquoted closing
// '>', so '>' inside quoted attribute values does not terminate the tag.
// This also strips Markdown autolinks such as <https://example.com>.
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

// scanCodeSpan matches a Markdown code span whose closing backtick run has
// the same length as its opening run.
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
