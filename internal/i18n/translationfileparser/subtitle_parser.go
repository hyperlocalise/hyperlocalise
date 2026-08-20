package translationfileparser

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

// SubtitleKind selects SubRip (.srt) or WebVTT (.vtt) parsing rules.
type SubtitleKind int

const (
	SubtitleSRT SubtitleKind = iota
	SubtitleVTT
)

// SubtitleParser parses subtitle files into translatable cue payloads.
type SubtitleParser struct {
	Kind SubtitleKind
}

type subtitleCue struct {
	key         string
	identifier  string
	timing      string
	sourceValue string
	textStart   int
	textEnd     int
}

type subtitleDocument struct {
	template string
	kind     SubtitleKind
	newline  string
	entries  []subtitleCue
}

type subtitleLine struct {
	start int
	end   int
	text  string
}

var subtitleTimestampPattern = regexp.MustCompile(`^(?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3}\s+-->\s+(?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3}(?:\s+\S.*)?$`)

func (p SubtitleParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	if err != nil {
		return nil, err
	}
	return values, nil
}

func (p SubtitleParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	doc, err := parseSubtitleDocument(content, p.Kind)
	if err != nil {
		return nil, nil, err
	}

	values := make(map[string]string, len(doc.entries))
	contextByKey := make(map[string]string, len(doc.entries))
	for _, entry := range doc.entries {
		values[entry.key] = entry.sourceValue
		if ctx := subtitleCueContext(entry); ctx != "" {
			contextByKey[entry.key] = ctx
		}
	}
	if len(contextByKey) == 0 {
		contextByKey = nil
	}
	return values, contextByKey, nil
}

// MarshalSubtitles preserves cue numbers, timestamps, and non-cue blocks while
// replacing cue text. Extra translation keys are ignored so cue counts stay
// aligned with the template.
func MarshalSubtitles(template []byte, values map[string]string, kind SubtitleKind) ([]byte, error) {
	doc, err := parseSubtitleDocument(template, kind)
	if err != nil {
		return nil, err
	}
	return doc.render(values), nil
}

func parseSubtitleDocument(content []byte, kind SubtitleKind) (subtitleDocument, error) {
	content = stripBOM(content)
	if !utf8.Valid(content) {
		return subtitleDocument{}, fmt.Errorf("%s: content must be valid UTF-8", subtitleKindName(kind))
	}

	text := string(content)
	doc := subtitleDocument{
		template: text,
		kind:     kind,
		newline:  subtitleNewline(text),
		entries:  make([]subtitleCue, 0, strings.Count(text, "-->")),
	}
	if strings.TrimSpace(text) == "" {
		return doc, nil
	}

	lines := scanSubtitleLines(text)
	start := 0
	if kind == SubtitleVTT {
		headerEnd, err := consumeWebVTTHeader(lines)
		if err != nil {
			return subtitleDocument{}, err
		}
		start = headerEnd
	} else if looksLikeWebVTTHeader(firstNonEmptySubtitleLine(lines)) {
		return subtitleDocument{}, fmt.Errorf("srt: file looks like WebVTT; use a .vtt extension")
	}

	cueIndex := 0
	for start < len(lines) {
		start = skipBlankSubtitleLines(lines, start)
		if start >= len(lines) {
			break
		}
		blockEnd := nextSubtitleBlockEnd(lines, start)
		block := lines[start:blockEnd]
		start = blockEnd

		if kind == SubtitleVTT && isWebVTTNonCueBlock(block[0].text) {
			continue
		}

		cue, err := parseSubtitleCue(block, kind, cueIndex+1)
		if err != nil {
			return subtitleDocument{}, err
		}
		if strings.TrimSpace(cue.sourceValue) == "" {
			continue
		}
		cueIndex++
		cue.key = subtitleCueKey(kind, cueIndex)
		doc.entries = append(doc.entries, cue)
	}

	return doc, nil
}

func (d subtitleDocument) render(values map[string]string) []byte {
	var b strings.Builder
	b.Grow(len(d.template))
	cursor := 0
	for _, entry := range d.entries {
		if entry.textStart < cursor || entry.textStart > len(d.template) || entry.textEnd > len(d.template) {
			continue
		}
		b.WriteString(d.template[cursor:entry.textStart])
		if translated, ok := values[entry.key]; ok {
			b.WriteString(encodeSubtitleCueText(translated, d.newline))
		} else {
			b.WriteString(d.template[entry.textStart:entry.textEnd])
		}
		cursor = entry.textEnd
	}
	b.WriteString(d.template[cursor:])
	return []byte(b.String())
}

func parseSubtitleCue(block []subtitleLine, kind SubtitleKind, cueNumber int) (subtitleCue, error) {
	if len(block) == 0 {
		return subtitleCue{}, fmt.Errorf("%s: empty cue", subtitleKindName(kind))
	}

	timingIndex := 0
	identifier := ""
	if isSubtitleTimestampLine(block[0].text) {
		timingIndex = 0
	} else if len(block) > 1 && isSubtitleTimestampLine(block[1].text) {
		identifier = strings.TrimSpace(block[0].text)
		timingIndex = 1
	} else {
		return subtitleCue{}, fmt.Errorf("%s: cue %d: missing timestamp line", subtitleKindName(kind), cueNumber)
	}

	textLines := block[timingIndex+1:]
	if len(textLines) == 0 {
		return subtitleCue{
			identifier: identifier,
			timing:     strings.TrimSpace(block[timingIndex].text),
		}, nil
	}

	var payload strings.Builder
	for i, line := range textLines {
		if i > 0 {
			payload.WriteByte('\n')
		}
		payload.WriteString(line.text)
	}

	return subtitleCue{
		identifier:  identifier,
		timing:      strings.TrimSpace(block[timingIndex].text),
		sourceValue: payload.String(),
		textStart:   textLines[0].start,
		textEnd:     textLines[len(textLines)-1].end,
	}, nil
}

func consumeWebVTTHeader(lines []subtitleLine) (int, error) {
	idx := skipBlankSubtitleLines(lines, 0)
	if idx >= len(lines) || !looksLikeWebVTTHeader(lines[idx].text) {
		return 0, fmt.Errorf("vtt: file must start with WEBVTT")
	}
	idx++
	if idx < len(lines) && strings.TrimSpace(lines[idx].text) != "" {
		// Optional header text on the same first block until a blank line.
		idx = nextSubtitleBlockEnd(lines, idx-1)
	}
	return skipBlankSubtitleLines(lines, idx), nil
}

func scanSubtitleLines(text string) []subtitleLine {
	lines := make([]subtitleLine, 0, strings.Count(text, "\n")+1)
	for start := 0; start < len(text); {
		next := strings.IndexByte(text[start:], '\n')
		lineEnd := len(text)
		after := len(text)
		if next >= 0 {
			lineEnd = start + next
			after = lineEnd + 1
		}
		end := lineEnd
		if end > start && text[end-1] == '\r' {
			end--
		}
		lines = append(lines, subtitleLine{
			start: start,
			end:   end,
			text:  text[start:end],
		})
		start = after
	}
	return lines
}

func skipBlankSubtitleLines(lines []subtitleLine, start int) int {
	i := start
	for i < len(lines) && strings.TrimSpace(lines[i].text) == "" {
		i++
	}
	return i
}

func nextSubtitleBlockEnd(lines []subtitleLine, start int) int {
	i := start
	for i < len(lines) && strings.TrimSpace(lines[i].text) != "" {
		i++
	}
	return i
}

func firstNonEmptySubtitleLine(lines []subtitleLine) string {
	idx := skipBlankSubtitleLines(lines, 0)
	if idx >= len(lines) {
		return ""
	}
	return lines[idx].text
}

func looksLikeWebVTTHeader(line string) bool {
	trimmed := strings.TrimSpace(line)
	if trimmed == "WEBVTT" {
		return true
	}
	return strings.HasPrefix(trimmed, "WEBVTT ") || strings.HasPrefix(trimmed, "WEBVTT\t")
}

func isWebVTTNonCueBlock(first string) bool {
	trimmed := strings.TrimSpace(first)
	switch {
	case trimmed == "NOTE", strings.HasPrefix(trimmed, "NOTE "), strings.HasPrefix(trimmed, "NOTE\t"):
		return true
	case trimmed == "STYLE", strings.HasPrefix(trimmed, "STYLE "), strings.HasPrefix(trimmed, "STYLE\t"):
		return true
	case trimmed == "REGION", strings.HasPrefix(trimmed, "REGION "), strings.HasPrefix(trimmed, "REGION\t"):
		return true
	default:
		return false
	}
}

func isSubtitleTimestampLine(line string) bool {
	return subtitleTimestampPattern.MatchString(strings.TrimSpace(line))
}

func subtitleCueKey(kind SubtitleKind, index int) string {
	return fmt.Sprintf("%s.%04d", subtitleKindName(kind), index)
}

func subtitleKindName(kind SubtitleKind) string {
	if kind == SubtitleVTT {
		return "vtt"
	}
	return "srt"
}

func subtitleCueContext(entry subtitleCue) string {
	if entry.identifier == "" {
		return entry.timing
	}
	if isAllDecimalDigits(entry.identifier) {
		return entry.timing
	}
	return entry.identifier + " · " + entry.timing
}

func isAllDecimalDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if !unicode.IsDigit(r) {
			return false
		}
	}
	return true
}

func subtitleNewline(template string) string {
	if strings.Contains(template, "\r\n") {
		return "\r\n"
	}
	return "\n"
}

func encodeSubtitleCueText(value, newline string) string {
	lines := strings.Split(strings.ReplaceAll(value, "\r\n", "\n"), "\n")
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimRight(line, " \t")
		if strings.TrimSpace(trimmed) == "" {
			continue
		}
		kept = append(kept, trimmed)
	}
	return strings.Join(kept, newline)
}
