package translationfileparser

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

// SubtitleKind selects SubRip (.srt), WebVTT (.vtt), or YouTube SBV parsing rules.
type SubtitleKind int

const (
	SubtitleSRT SubtitleKind = iota
	SubtitleVTT
	SubtitleSBV
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

// SubtitleCueStructureEqual reports whether source and target share the same
// cue identifiers and timings in document order. Sequential keys such as
// srt.0001 are ignored, so equal cue counts are not treated as a match.
func SubtitleCueStructureEqual(source, target []byte, kind SubtitleKind) bool {
	src, err := parseSubtitleDocument(source, kind)
	if err != nil {
		return false
	}
	tgt, err := parseSubtitleDocument(target, kind)
	if err != nil {
		return false
	}
	if len(src.entries) != len(tgt.entries) {
		return false
	}
	for i := range src.entries {
		if subtitleCueSignature(src.entries[i]) != subtitleCueSignature(tgt.entries[i]) {
			return false
		}
	}
	return true
}

func subtitleCueSignature(entry subtitleCue) string {
	if entry.identifier != "" && !isAllDecimalDigits(entry.identifier) {
		return entry.identifier + "\n" + entry.timing
	}
	return entry.timing
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
		entries:  make([]subtitleCue, 0, subtitleCapacityHint(text, kind)),
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
		return subtitleDocument{}, fmt.Errorf("%s: file looks like WebVTT; use a .vtt extension", subtitleKindName(kind))
	} else if kind == SubtitleSBV && subtitleHasArrowTimestampLine(lines) {
		return subtitleDocument{}, fmt.Errorf("sbv: file looks like SubRip or WebVTT; use a .srt or .vtt extension")
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
			writeEncodedSubtitleCueText(&b, translated, d.newline)
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
	if isSubtitleTimestampLine(block[0].text, kind) {
		timingIndex = 0
	} else if len(block) > 1 && isSubtitleTimestampLine(block[1].text, kind) {
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

	// BOLT OPTIMIZATION: Fast path for single line text payload to avoid strings.Builder allocation.
	var sourceValue string
	if len(textLines) == 1 {
		sourceValue = textLines[0].text
	} else {
		var payload strings.Builder
		totalLen := textLines[len(textLines)-1].end - textLines[0].start
		if totalLen > 0 {
			payload.Grow(totalLen)
		}
		for i, line := range textLines {
			if i > 0 {
				payload.WriteByte('\n')
			}
			payload.WriteString(line.text)
		}
		sourceValue = payload.String()
	}

	return subtitleCue{
		identifier:  identifier,
		timing:      strings.TrimSpace(block[timingIndex].text),
		sourceValue: sourceValue,
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
	for i < len(lines) && isBlankSubtitleLine(lines[i].text) {
		i++
	}
	return i
}

func nextSubtitleBlockEnd(lines []subtitleLine, start int) int {
	i := start
	for i < len(lines) && !isBlankSubtitleLine(lines[i].text) {
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

func subtitleHasArrowTimestampLine(lines []subtitleLine) bool {
	for _, line := range lines {
		if !strings.Contains(line.text, "-->") {
			continue
		}
		trimmed := strings.TrimSpace(line.text)
		if isSRTTimestampLineFast(trimmed) || isVTTTimestampLineFast(trimmed) {
			return true
		}
	}
	return false
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

// BOLT OPTIMIZATION: Replace regex MatchString for subtitle timestamp line validation
// with zero-allocation byte scanning routines (isSRTTimestampLineFast, isVTTTimestampLineFast, isSBVTimestampLineFast).
func isSubtitleTimestampLine(line string, kind SubtitleKind) bool {
	if kind == SubtitleSBV {
		return isSBVTimestampLineFast(strings.TrimSpace(line))
	}
	if !strings.Contains(line, "-->") {
		return false
	}
	trimmed := strings.TrimSpace(line)
	if kind == SubtitleVTT {
		return isVTTTimestampLineFast(trimmed)
	}
	return isSRTTimestampLineFast(trimmed)
}

func isSRTTimestampLineFast(s string) bool {
	return isArrowTimestampLineFast(s, false)
}

func isVTTTimestampLineFast(s string) bool {
	return isArrowTimestampLineFast(s, true)
}

func isArrowTimestampLineFast(s string, isVTT bool) bool {
	consumed1, ok1 := parseTimestampToken(s, isVTT)
	if !ok1 {
		return false
	}
	i := consumed1
	ws1 := 0
	for i < len(s) && (s[i] == ' ' || s[i] == '\t') {
		ws1++
		i++
	}
	if ws1 == 0 || i >= len(s) {
		return false
	}
	if !strings.HasPrefix(s[i:], "-->") {
		return false
	}
	i += 3
	ws2 := 0
	for i < len(s) && (s[i] == ' ' || s[i] == '\t') {
		ws2++
		i++
	}
	if ws2 == 0 || i >= len(s) {
		return false
	}
	consumed2, ok2 := parseTimestampToken(s[i:], isVTT)
	if !ok2 {
		return false
	}
	i += consumed2
	if i == len(s) {
		return true
	}
	if s[i] != ' ' && s[i] != '\t' {
		return false
	}
	for i < len(s) && (s[i] == ' ' || s[i] == '\t') {
		i++
	}
	return true
}

func parseTimestampToken(s string, isVTT bool) (int, bool) {
	if len(s) == 0 {
		return 0, false
	}
	i := 0
	d1 := 0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		d1++
		i++
	}
	if d1 == 0 || i >= len(s) || s[i] != ':' {
		return 0, false
	}
	i++ // skip ':'

	d2 := 0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		d2++
		i++
	}
	if d2 == 0 || i >= len(s) {
		return 0, false
	}

	var minutesDigits, secondsDigits int

	if s[i] == ':' {
		hoursDigits := d1
		if isVTT {
			if hoursDigits < 2 {
				return 0, false
			}
		} else {
			if hoursDigits < 1 || hoursDigits > 2 {
				return 0, false
			}
		}
		minutesDigits = d2
		if minutesDigits < 1 || minutesDigits > 2 {
			return 0, false
		}

		i++ // skip ':'
		d3 := 0
		for i < len(s) && s[i] >= '0' && s[i] <= '9' {
			d3++
			i++
		}
		secondsDigits = d3
	} else {
		if !isVTT {
			// SRT timestamps require 3 components (HH:MM:SS,mmm) or (H:MM:SS,mmm).
			return 0, false
		}
		minutesDigits = d1
		if minutesDigits < 1 || minutesDigits > 2 {
			return 0, false
		}
		secondsDigits = d2
	}

	if secondsDigits != 2 {
		return 0, false
	}

	if i >= len(s) || (s[i] != ',' && s[i] != '.') {
		return 0, false
	}
	i++ // skip ',' or '.'

	dMS := 0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		dMS++
		i++
	}
	if dMS < 1 || dMS > 3 {
		return 0, false
	}

	return i, true
}

func isSBVTimestampLineFast(s string) bool {
	consumed1, ok1 := parseSBVTimestamp(s)
	if !ok1 {
		return false
	}
	if consumed1 >= len(s) || s[consumed1] != ',' {
		return false
	}
	consumed2, ok2 := parseSBVTimestamp(s[consumed1+1:])
	if !ok2 {
		return false
	}
	return consumed1+1+consumed2 == len(s)
}

func parseSBVTimestamp(s string) (int, bool) {
	if len(s) == 0 {
		return 0, false
	}
	i := 0
	dHours := 0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		dHours++
		i++
	}
	if dHours < 1 || i >= len(s) || s[i] != ':' {
		return 0, false
	}
	i++ // skip ':'

	dMin := 0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		dMin++
		i++
	}
	if dMin != 2 || i >= len(s) || s[i] != ':' {
		return 0, false
	}
	i++ // skip ':'

	dSec := 0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		dSec++
		i++
	}
	if dSec != 2 || i >= len(s) || s[i] != '.' {
		return 0, false
	}
	i++ // skip '.'

	dMS := 0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		dMS++
		i++
	}
	if dMS < 1 || dMS > 3 {
		return 0, false
	}

	return i, true
}

func subtitleCapacityHint(text string, kind SubtitleKind) int {
	if kind == SubtitleSBV {
		return strings.Count(text, "\n") / 3
	}
	return strings.Count(text, "-->")
}

func subtitleCueKey(kind SubtitleKind, index int) string {
	// BOLT OPTIMIZATION: Avoid fmt.Sprintf reflection and formatting allocations for cue key formatting.
	prefix := "srt."
	switch kind {
	case SubtitleVTT:
		prefix = "vtt."
	case SubtitleSBV:
		prefix = "sbv."
	}
	if index < 10 {
		return prefix + "000" + strconv.Itoa(index)
	}
	if index < 100 {
		return prefix + "00" + strconv.Itoa(index)
	}
	if index < 1000 {
		return prefix + "0" + strconv.Itoa(index)
	}
	return prefix + strconv.Itoa(index)
}

func subtitleKindName(kind SubtitleKind) string {
	switch kind {
	case SubtitleVTT:
		return "vtt"
	case SubtitleSBV:
		return "sbv"
	default:
		return "srt"
	}
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
	// ASCII digits stay on a byte loop. Non-ASCII bytes fall back to
	// unicode.IsDigit so Arabic-Indic and other Nd cue counters still match.
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= '0' && c <= '9' {
			continue
		}
		if c < utf8.RuneSelf {
			return false
		}
		for _, r := range s[i:] {
			if !unicode.IsDigit(r) {
				return false
			}
		}
		return true
	}
	return true
}

func subtitleNewline(template string) string {
	if strings.Contains(template, "\r\n") {
		return "\r\n"
	}
	return "\n"
}

// writeEncodedSubtitleCueText streams lines from value directly into b,
// eliminating intermediate []string slice allocations and redundant string replacements.
func writeEncodedSubtitleCueText(b *strings.Builder, value, newline string) {
	hasWritten := false
	for start := 0; start < len(value); {
		next := strings.IndexByte(value[start:], '\n')
		lineEnd := len(value)
		after := len(value)
		if next >= 0 {
			lineEnd = start + next
			after = lineEnd + 1
		}
		end := lineEnd
		if end > start && value[end-1] == '\r' {
			end--
		}
		line := value[start:end]
		trimmed := trimRightSpaceTab(line)
		if !isBlankSubtitleLine(trimmed) {
			if hasWritten {
				b.WriteString(newline)
			}
			b.WriteString(trimmed)
			hasWritten = true
		}
		start = after
	}
}

func trimRightSpaceTab(s string) string {
	end := len(s)
	for end > 0 && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[:end]
}

func isBlankSubtitleLine(s string) bool {
	// ASCII whitespace stays on a byte loop. Non-ASCII bytes fall back to
	// unicode.IsSpace so form feed, NBSP, and other TrimSpace separators
	// still split cues instead of being absorbed as payload text.
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch c {
		case ' ', '\t', '\n', '\r', '\v', '\f':
			continue
		}
		if c < utf8.RuneSelf {
			return false
		}
		for _, r := range s[i:] {
			if !unicode.IsSpace(r) {
				return false
			}
		}
		return true
	}
	return true
}
