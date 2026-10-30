package translationfileparser

import (
	"bytes"
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	poParseMapMinCapacity = 4
	poParseMapMaxCapacity = 1 << 16
)

var poMsgIDFieldPrefix = []byte("msgid ")

// POFileParser parses GNU gettext .po and .pot catalogs.
type POFileParser struct{}

type poValue struct {
	first    string
	builder  *strings.Builder
	hasValue bool
}

func (v *poValue) WriteString(s string) {
	if !v.hasValue {
		v.first = s
		v.hasValue = true
		return
	}
	if v.builder == nil {
		v.builder = &strings.Builder{}
		v.builder.WriteString(v.first)
	} else if v.builder.Len() == 0 {
		v.builder.WriteString(v.first)
	}
	v.builder.WriteString(s)
}

func (v *poValue) String() string {
	if v.builder != nil && v.builder.Len() > 0 {
		return v.builder.String()
	}
	return v.first
}

func (v *poValue) Reset() {
	v.first = ""
	v.hasValue = false
	if v.builder != nil {
		v.builder.Reset()
	}
}

type poCommentBuf struct {
	translator []string
	extracted  []string
	fuzzy      bool
}

func (c *poCommentBuf) reset() {
	c.translator = c.translator[:0]
	c.extracted = c.extracted[:0]
	c.fuzzy = false
}

func (c *poCommentBuf) clone() poCommentBuf {
	return poCommentBuf{
		translator: append([]string(nil), c.translator...),
		extracted:  append([]string(nil), c.extracted...),
		fuzzy:      c.fuzzy,
	}
}

func (c *poCommentBuf) add(line string) {
	switch {
	case strings.HasPrefix(line, "#~"), strings.HasPrefix(line, "#|"), strings.HasPrefix(line, "#:"):
		return
	case strings.HasPrefix(line, "#."):
		c.extracted = append(c.extracted, strings.TrimSpace(line[2:]))
	case strings.HasPrefix(line, "#,"):
		_, fuzzy := parsePOFlags(line[2:])
		if fuzzy {
			c.fuzzy = true
		}
	default:
		text := strings.TrimPrefix(line, "#")
		if len(text) > 0 && (text[0] == ' ' || text[0] == '\t') {
			text = text[1:]
		}
		c.translator = append(c.translator, text)
	}
}

func (c poCommentBuf) contextText(msgctxt string) string {
	var b strings.Builder
	if msgctxt != "" {
		b.WriteString("Context: ")
		b.WriteString(msgctxt)
	}
	for _, line := range c.extracted {
		appendPOContextLine(&b, line)
	}
	for _, line := range c.translator {
		appendPOContextLine(&b, line)
	}
	return b.String()
}

func appendPOContextLine(b *strings.Builder, line string) {
	if line == "" {
		return
	}
	if b.Len() > 0 {
		b.WriteByte('\n')
	}
	b.WriteString(line)
}

type poHeaderMeta struct {
	language     string
	pluralForms  string
	strictMsgstr bool
}

func (m *poHeaderMeta) read(header string) {
	for _, line := range strings.Split(header, "\n") {
		trim := strings.TrimSpace(line)
		if rest, ok := strings.CutPrefix(trim, "Language:"); ok {
			m.language = strings.TrimSpace(rest)
			continue
		}
		if rest, ok := strings.CutPrefix(trim, "Plural-Forms:"); ok {
			m.pluralForms = strings.TrimSpace(rest)
			continue
		}
		if rest, ok := strings.CutPrefix(trim, "X-Crowdin-SourceKey:"); ok && strings.EqualFold(strings.TrimSpace(rest), "msgstr") {
			m.strictMsgstr = true
		}
	}
}

type poBuiltEntry struct {
	msgctxt     string
	msgid       string
	msgidPlural string
	forms       []string
	isPlural    bool
	isHeader    bool
	comments    poCommentBuf
}

type poWalkState struct {
	msgctxt     poValue
	msgid       poValue
	msgidPlural poValue
	forms       []poValue
	formsBuf    []string
	active      string
	activeForm  int
	seenMsgID   bool
	seenMsgStr  bool
	isPlural    bool
	comments    poCommentBuf
}

func (s *poWalkState) reset() {
	s.msgctxt.Reset()
	s.msgid.Reset()
	s.msgidPlural.Reset()
	for i := range s.forms {
		s.forms[i].Reset()
	}
	s.forms = s.forms[:0]
	s.formsBuf = s.formsBuf[:0]
	s.active = ""
	s.activeForm = -1
	s.seenMsgID = false
	s.seenMsgStr = false
	s.isPlural = false
	s.comments.reset()
}

func (s *poWalkState) build() (poBuiltEntry, bool) {
	if !s.seenMsgID || !s.seenMsgStr {
		return poBuiltEntry{}, false
	}
	if cap(s.formsBuf) < len(s.forms) {
		s.formsBuf = make([]string, len(s.forms))
	} else {
		s.formsBuf = s.formsBuf[:len(s.forms)]
	}
	for i := range s.forms {
		s.formsBuf[i] = s.forms[i].String()
	}
	entry := poBuiltEntry{
		msgctxt:     s.msgctxt.String(),
		msgid:       s.msgid.String(),
		msgidPlural: s.msgidPlural.String(),
		forms:       s.formsBuf,
		isPlural:    s.isPlural,
		comments:    s.comments.clone(),
	}
	entry.isHeader = entry.msgid == "" && !entry.isPlural
	return entry, true
}

func (s *poWalkState) setForm(index int, value string) {
	for len(s.forms) <= index {
		s.forms = append(s.forms, poValue{})
	}
	s.forms[index].Reset()
	s.forms[index].WriteString(value)
	s.active = "msgstr"
	s.activeForm = index
	s.seenMsgStr = true
}

func (s *poWalkState) appendForm(value string) {
	if s.activeForm < 0 {
		return
	}
	for len(s.forms) <= s.activeForm {
		s.forms = append(s.forms, poValue{})
	}
	s.forms[s.activeForm].WriteString(value)
}

func poOutputMapCapacity(content []byte) int {
	// Count msgid field markers instead of using raw byte length. Comment-heavy
	// or long-msgstr files can be huge while containing only a few map entries.
	n := bytes.Count(content, poMsgIDFieldPrefix)
	switch {
	case n < poParseMapMinCapacity:
		return poParseMapMinCapacity
	case n > poParseMapMaxCapacity:
		return poParseMapMaxCapacity
	default:
		return n
	}
}

func (p POFileParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	return values, err
}

func (p POFileParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	values, contexts, err := parsePOCatalog(content)
	if err != nil {
		return nil, nil, err
	}
	for key, value := range values {
		values[key] = protectUnrealRichTextValue(value)
	}
	return values, contexts, nil
}

func parsePOCatalog(content []byte) (map[string]string, map[string]string, error) {
	out := make(map[string]string, poOutputMapCapacity(content))
	var contexts map[string]string
	var meta poHeaderMeta
	var state poWalkState
	state.activeForm = -1

	flush := func() {
		entry, ok := state.build()
		if ok {
			if entry.isHeader {
				if len(entry.forms) > 0 {
					meta.read(entry.forms[0])
				}
			} else {
				addPOCatalogEntry(out, &contexts, entry, meta)
			}
		}
		state.reset()
	}

	s := string(content)
	lineNumber := 1
	for {
		var raw string
		idx := strings.IndexByte(s, '\n')
		if idx < 0 {
			raw = s
		} else {
			raw = s[:idx]
		}
		line := strings.TrimSpace(raw)
		if err := consumePOLine(lineNumber, line, &state, flush); err != nil {
			return nil, nil, err
		}
		if idx < 0 {
			break
		}
		s = s[idx+1:]
		lineNumber++
	}
	flush()
	return out, contexts, nil
}

func consumePOLine(lineNumber int, line string, state *poWalkState, flush func()) error {
	if line == "" {
		flush()
		return nil
	}
	if line[0] == '#' {
		state.active = ""
		state.activeForm = -1
		state.comments.add(line)
		return nil
	}

	switch {
	case strings.HasPrefix(line, "msgctxt "):
		if state.seenMsgID {
			flush()
		}
		v, err := parsePOQuoted(line[len("msgctxt "):])
		if err != nil {
			return fmt.Errorf("line %d: parse msgctxt: %w", lineNumber, err)
		}
		state.msgctxt.Reset()
		state.msgctxt.WriteString(v)
		state.active = "msgctxt"
		state.activeForm = -1
		return nil
	case strings.HasPrefix(line, "msgid_plural "):
		v, err := parsePOQuoted(line[len("msgid_plural "):])
		if err != nil {
			return fmt.Errorf("line %d: parse msgid_plural: %w", lineNumber, err)
		}
		state.msgidPlural.Reset()
		state.msgidPlural.WriteString(v)
		state.active = "msgid_plural"
		state.activeForm = -1
		state.isPlural = true
		return nil
	case strings.HasPrefix(line, "msgid "):
		if state.seenMsgID {
			flush()
		}
		v, err := parsePOQuoted(line[len("msgid "):])
		if err != nil {
			return fmt.Errorf("line %d: parse msgid: %w", lineNumber, err)
		}
		state.msgid.Reset()
		state.msgid.WriteString(v)
		state.active = "msgid"
		state.activeForm = -1
		state.seenMsgID = true
		return nil
	case strings.HasPrefix(line, "msgstr["):
		index, rest, err := parsePOIndexedMsgStr(lineNumber, line)
		if err != nil {
			return err
		}
		v, err := parsePOQuoted(rest)
		if err != nil {
			return fmt.Errorf("line %d: parse msgstr[%d]: %w", lineNumber, index, err)
		}
		state.setForm(index, v)
		state.isPlural = true
		return nil
	case strings.HasPrefix(line, "msgstr "):
		v, err := parsePOQuoted(line[len("msgstr "):])
		if err != nil {
			return fmt.Errorf("line %d: parse msgstr: %w", lineNumber, err)
		}
		state.setForm(0, v)
		return nil
	case line[0] == '"':
		return appendPOContinuation(lineNumber, line, state)
	default:
		state.active = ""
		state.activeForm = -1
		return nil
	}
}

func parsePOIndexedMsgStr(lineNumber int, line string) (int, string, error) {
	rest := line[len("msgstr["):]
	end := strings.IndexByte(rest, ']')
	if end <= 0 {
		return 0, "", fmt.Errorf("line %d: invalid msgstr[N] format", lineNumber)
	}
	index, err := strconv.Atoi(rest[:end])
	if err != nil || index < 0 || index >= poMaxPluralForms {
		return 0, "", fmt.Errorf("line %d: invalid msgstr[%s] index", lineNumber, rest[:end])
	}
	return index, strings.TrimSpace(rest[end+1:]), nil
}

func appendPOContinuation(lineNumber int, line string, state *poWalkState) error {
	v, err := parsePOQuoted(line)
	if err != nil {
		return fmt.Errorf("line %d: parse continued string: %w", lineNumber, err)
	}
	switch state.active {
	case "msgctxt":
		state.msgctxt.WriteString(v)
	case "msgid":
		state.msgid.WriteString(v)
	case "msgid_plural":
		state.msgidPlural.WriteString(v)
	case "msgstr":
		state.appendForm(v)
	}
	return nil
}

func addPOCatalogEntry(out map[string]string, contexts *map[string]string, entry poBuiltEntry, meta poHeaderMeta) {
	if entry.msgid == "" {
		return
	}
	base := poMessageKey(entry.msgctxt, entry.msgid)
	note := entry.comments.contextText(entry.msgctxt)
	if !entry.isPlural {
		value, ok := poSingularValue(entry.msgid, entry.forms, meta.strictMsgstr)
		if !ok {
			return
		}
		out[base] = value
		putPOContext(contexts, base, note)
		return
	}

	explicit := len(entry.forms)
	categories := poCategoriesForCatalog(meta.language, meta.pluralForms, explicit)
	count := poPluralSlotCount(explicit, categories)
	for i := 0; i < count; i++ {
		category := poCategoryAt(categories, i)
		form := ""
		if i < len(entry.forms) {
			form = entry.forms[i]
		}
		value, ok := poPluralFormValue(entry.msgid, entry.msgidPlural, form, category, meta.strictMsgstr)
		if !ok {
			continue
		}
		key := poPluralFormKey(base, category)
		out[key] = value
		putPOContext(contexts, key, poPluralContext(note, entry, category))
	}
}

func putPOContext(contexts *map[string]string, key, note string) {
	if note == "" {
		return
	}
	if *contexts == nil {
		*contexts = map[string]string{}
	}
	(*contexts)[key] = note
}

func poPluralContext(note string, entry poBuiltEntry, category string) string {
	var b strings.Builder
	b.WriteString("Plural form: ")
	b.WriteString(category)
	if category == "one" && entry.msgidPlural != "" {
		b.WriteByte('\n')
		b.WriteString("Plural: ")
		b.WriteString(entry.msgidPlural)
	}
	if category != "one" && entry.msgid != "" {
		b.WriteByte('\n')
		b.WriteString("Singular: ")
		b.WriteString(entry.msgid)
	}
	if note != "" {
		b.WriteByte('\n')
		b.WriteString(note)
	}
	return b.String()
}

func poSingularValue(msgid string, forms []string, strict bool) (string, bool) {
	form := ""
	if len(forms) > 0 {
		form = forms[0]
	}
	if form != "" {
		return form, true
	}
	if strict || msgid == "" {
		return "", false
	}
	return msgid, true
}

func poPluralFormValue(msgid, msgidPlural, form, category string, strict bool) (string, bool) {
	if form != "" {
		return form, true
	}
	if strict {
		return "", false
	}
	if category == "one" && msgid != "" {
		return msgid, true
	}
	if msgidPlural != "" {
		return msgidPlural, true
	}
	if msgid != "" {
		return msgid, true
	}
	return "", false
}

func parsePOFlags(rest string) (flags []string, fuzzy bool) {
	for _, part := range strings.Split(rest, ",") {
		flag := strings.TrimSpace(part)
		if flag == "" {
			continue
		}
		if flag == "fuzzy" {
			fuzzy = true
			continue
		}
		flags = append(flags, flag)
	}
	return flags, fuzzy
}

func parsePOQuoted(raw string) (string, error) {
	// BOLT OPTIMIZATION: Use strings.IndexByte checks instead of strings.ContainsAny
	// to avoid table lookups and leverage SIMD assembly instructions in assembly runtime.
	if len(raw) >= 2 && raw[0] == '"' && raw[len(raw)-1] == '"' {
		inner := raw[1 : len(raw)-1]
		if strings.IndexByte(inner, '\\') < 0 && strings.IndexByte(inner, '"') < 0 {
			return inner, nil
		}
	} else {
		raw = strings.TrimSpace(raw)
		if len(raw) < 2 || raw[0] != '"' || raw[len(raw)-1] != '"' {
			return "", fmt.Errorf("expected quoted string, got %q", raw)
		}
		inner := raw[1 : len(raw)-1]
		if strings.IndexByte(inner, '\\') < 0 && strings.IndexByte(inner, '"') < 0 {
			return inner, nil
		}
	}

	unquoted, err := strconv.Unquote(raw)
	if err != nil {
		return "", err
	}
	return unquoted, nil
}

// MarshalPOFile preserves .po structure while replacing msgstr values by msgid key.
func MarshalPOFile(template []byte, values map[string]string) ([]byte, error) {
	return MarshalPOFileForLocale(template, values, "")
}

// MarshalPOFileForLocale writes translations into a gettext catalog.
// A non-empty targetLocale updates the header Language and Plural-Forms fields
// and expands plural entries to that locale's gettext plural slots.
func MarshalPOFileForLocale(template []byte, values map[string]string, targetLocale string) ([]byte, error) {
	values = expandPOUnrealRichTextValues(values)
	targetLocale = strings.TrimSpace(targetLocale)

	var out strings.Builder
	out.Grow(len(template))

	var meta poHeaderMeta
	var entry []poRawLine
	var state poWalkState
	lineNumber := 1
	entryStart := 1

	flush := func() error {
		if len(entry) == 0 {
			return nil
		}
		rewritten, err := rewritePOEntry(entry, entryStart, values, &meta, targetLocale, &state)
		if err != nil {
			return err
		}
		writePORawLines(&out, rewritten)
		entry = entry[:0]
		return nil
	}

	s := string(template)
	for {
		var raw string
		idx := strings.IndexByte(s, '\n')
		followedByNewline := idx >= 0
		if idx < 0 {
			raw = s
		} else {
			raw = s[:idx]
		}
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			if err := flush(); err != nil {
				return nil, err
			}
			writePORawLines(&out, []poRawLine{{raw: raw, newline: followedByNewline}})
			entryStart = lineNumber + 1
		} else {
			// Compact catalogs omit the blank line between entries. A comment,
			// msgctxt, or msgid after a finished msgstr starts the next entry.
			// Flushing here keeps a later plural rebuild from deleting the
			// header and the messages above it.
			if poBufferHasMsgstr(entry) && poLineStartsNextEntry(trimmed) {
				if err := flush(); err != nil {
					return nil, err
				}
			}
			if len(entry) == 0 {
				entryStart = lineNumber
			}
			entry = append(entry, poRawLine{raw: raw, newline: followedByNewline})
		}
		if idx < 0 {
			break
		}
		s = s[idx+1:]
		lineNumber++
	}
	if err := flush(); err != nil {
		return nil, err
	}
	return []byte(out.String()), nil
}

type poRawLine struct {
	raw     string
	newline bool
}

func writePORawLines(out *strings.Builder, lines []poRawLine) {
	for _, line := range lines {
		out.WriteString(line.raw)
		if line.newline {
			out.WriteByte('\n')
		}
	}
}

func rewritePOEntry(lines []poRawLine, startLine int, values map[string]string, meta *poHeaderMeta, targetLocale string, state *poWalkState) ([]poRawLine, error) {
	entry, ok, err := inspectPOEntry(lines, startLine, state)
	if err != nil || !ok {
		return lines, err
	}
	if entry.isHeader {
		if len(entry.forms) > 0 {
			meta.read(entry.forms[0])
		}
		if targetLocale == "" {
			return lines, nil
		}
		return rewritePOHeader(lines, entry, targetLocale)
	}

	base := poMessageKey(entry.msgctxt, entry.msgid)
	categories := poCategoriesForCatalog(meta.language, meta.pluralForms, len(entry.forms))
	if entry.isPlural {
		lookupCategories := categories
		targetCount := len(entry.forms)
		if targetLocale != "" {
			targetSpec := poPluralSpecForLocale(targetLocale)
			lookupCategories = targetSpec.categories
			targetCount = targetSpec.nplurals()
		}
		// Same slot count can still mean different categories. Polish
		// one/few/many/other and Slovenian one/two/few/other are both four
		// forms, and writing the source order under the target header swaps them.
		if targetCount != len(entry.forms) || !poCategoryOrderEqual(categories, lookupCategories) || poPluralHasCategoryKeys(values, base, lookupCategories, targetCount) {
			return rebuildPOPlural(lines, entry, values, categories, lookupCategories, targetCount)
		}
	}
	return rewritePOSingular(lines, entry, base, values, categories)
}

func inspectPOEntry(lines []poRawLine, startLine int, state *poWalkState) (poBuiltEntry, bool, error) {
	if state == nil {
		var st poWalkState
		state = &st
	} else {
		state.reset()
	}
	state.activeForm = -1
	for i, line := range lines {
		trimmed := strings.TrimSpace(line.raw)
		if err := consumePOLine(startLine+i, trimmed, state, func() {}); err != nil {
			return poBuiltEntry{}, false, err
		}
	}
	entry, ok := state.build()
	return entry, ok, nil
}

func poPluralHasCategoryKeys(values map[string]string, base string, categories []string, explicit int) bool {
	count := explicit
	if len(categories) > count {
		count = len(categories)
	}
	for i := 0; i < count; i++ {
		if _, ok := values[poPluralFormKey(base, poCategoryAt(categories, i))]; ok {
			return true
		}
	}
	return false
}

func lookupPOPlural(values map[string]string, base string, categories []string, index int) (string, bool) {
	category := poCategoryAt(categories, index)
	if value, ok := values[poPluralFormKey(base, category)]; ok {
		return value, true
	}
	if value, ok := values[poPluralFormKey(base, "plural"+strconv.Itoa(index))]; ok {
		return value, true
	}
	if category == "one" || index == 0 && (len(categories) == 0 || categories[0] == "one" || categories[0] == "plural0") {
		if value, ok := values[base]; ok {
			return value, true
		}
	}
	return "", false
}

func rebuildPOPlural(lines []poRawLine, entry poBuiltEntry, values map[string]string, sourceCategories, categories []string, count int) ([]poRawLine, error) {
	if count < 1 {
		count = 1
	}
	if count > poMaxPluralForms {
		count = poMaxPluralForms
	}
	base := poMessageKey(entry.msgctxt, entry.msgid)
	forms := make([]string, count)
	replaced := false
	other, hasOther := values[poPluralFormKey(base, "other")]
	for i := 0; i < count; i++ {
		if value, ok := lookupPOPlural(values, base, categories, i); ok {
			forms[i] = value
			replaced = true
			continue
		}
		if i < len(entry.forms) && entry.forms[i] != "" && count == len(entry.forms) && poCategoryAt(sourceCategories, i) == poCategoryAt(categories, i) {
			forms[i] = entry.forms[i]
			continue
		}
		if hasOther && poCategoryAt(categories, i) != "other" {
			forms[i] = other
			replaced = true
			continue
		}
		if i < len(entry.forms) {
			forms[i] = entry.forms[i]
		}
	}
	if !replaced {
		return lines, nil
	}

	indent := ""
	out := make([]poRawLine, 0, poAllocCap(len(lines), count))
	skipping := false
	insertedAt := -1
	lastFormNewline := true
	crlf := false
	for _, line := range lines {
		if strings.HasSuffix(line.raw, "\r") {
			crlf = true
		}
		trimmed := strings.TrimSpace(line.raw)
		if replaced && entry.comments.fuzzy {
			if rewritten, drop, ok := clearPOFuzzyFlag(line.raw); ok {
				if drop {
					continue
				}
				line.raw = rewritten
				trimmed = strings.TrimSpace(line.raw)
			}
		}
		if strings.HasPrefix(trimmed, "msgstr[") || strings.HasPrefix(trimmed, "msgstr ") || (skipping && strings.HasPrefix(trimmed, "\"")) {
			if insertedAt < 0 {
				indent = preserveIndent(stripPOCR(line.raw))
				formLines := poPluralFormLines(indent, forms, true, crlf)
				insertedAt = len(out)
				out = append(out, formLines...)
			}
			lastFormNewline = line.newline
			skipping = true
			continue
		}
		if skipping {
			lastFormNewline = true
		}
		skipping = false
		out = append(out, line)
	}
	if insertedAt < 0 {
		newline := true
		if len(lines) > 0 {
			newline = lines[len(lines)-1].newline
		}
		out = append(out, poPluralFormLines(indent, forms, newline, crlf)...)
		return out, nil
	}
	if len(forms) > 0 {
		out[insertedAt+len(forms)-1].newline = lastFormNewline
	}
	return out, nil
}

func poPluralFormLines(indent string, forms []string, newline, crlf bool) []poRawLine {
	lines := make([]poRawLine, len(forms))
	for i, form := range forms {
		var b strings.Builder
		b.WriteString(indent)
		b.WriteString("msgstr[")
		b.WriteString(strconv.Itoa(i))
		b.WriteString("] ")
		writePOQuotedValue(&b, form)
		raw := b.String()
		if crlf {
			raw += "\r"
		}
		lines[i] = poRawLine{raw: raw, newline: newline || i < len(forms)-1}
	}
	if len(lines) > 0 {
		lines[len(lines)-1].newline = newline
	}
	return lines
}

func rewritePOSingular(lines []poRawLine, entry poBuiltEntry, keyBase string, values map[string]string, categories []string) ([]poRawLine, error) {
	// BOLT OPTIMIZATION: Pass precomputed keyBase to eliminate redundant poMessageKey calls per entry.
	out := make([]poRawLine, 0, len(lines))
	active := ""
	replacingForm := false
	replaced := false
	for _, line := range lines {
		raw := line.raw
		trimmed := strings.TrimSpace(raw)
		processed := false
		switch {
		case strings.HasPrefix(trimmed, "msgctxt "):
			active = "msgctxt"
		case strings.HasPrefix(trimmed, "msgid_plural "):
			active = "msgid_plural"
		case strings.HasPrefix(trimmed, "msgid "):
			active = "msgid"
		case strings.HasPrefix(trimmed, "msgstr["):
			index, _, err := parsePOIndexedMsgStr(0, trimmed)
			if err != nil {
				return nil, err
			}
			active = "msgstr"
			replacingForm = false
			if value, ok := lookupPOPlural(values, keyBase, categories, index); ok {
				replaced = true
				replacingForm = true
				out = append(out, poRawLine{
					raw:     replacePOFieldLine(raw, "msgstr["+strconv.Itoa(index)+"]", value),
					newline: line.newline,
				})
				processed = true
			}
		case strings.HasPrefix(trimmed, "msgstr "):
			active = "msgstr"
			replacingForm = false
			if value, ok := values[keyBase]; ok {
				replaced = true
				replacingForm = true
				out = append(out, poRawLine{raw: replacePOFieldLine(raw, "msgstr", value), newline: line.newline})
				processed = true
			}
		case strings.HasPrefix(trimmed, "\""):
			if active == "msgstr" && replacingForm {
				out = append(out, poRawLine{raw: preserveIndent(stripPOCR(raw)) + `""` + poCRSuffix(raw), newline: line.newline})
				processed = true
			}
		}
		if !processed {
			out = append(out, line)
		}
	}
	if replaced && entry.comments.fuzzy {
		return clearPOFuzzyLines(out), nil
	}
	return out, nil
}

func replacePOFieldLine(raw, field, value string) string {
	indent := preserveIndent(stripPOCR(raw))
	cr := poCRSuffix(raw)
	if canWriteSimplePOQuoted(value) {
		return indent + field + ` "` + value + `"` + cr
	}
	var stackBuf [256]byte
	q := strconv.AppendQuote(stackBuf[:0], value)
	return indent + field + " " + string(q) + cr
}

func clearPOFuzzyLines(lines []poRawLine) []poRawLine {
	// BOLT OPTIMIZATION: Filter fuzzy lines on the local entry slice without allocating a second slice.
	idx := 0
	for _, line := range lines {
		rewritten, drop, ok := clearPOFuzzyFlag(line.raw)
		if !ok {
			lines[idx] = line
			idx++
			continue
		}
		if drop {
			continue
		}
		line.raw = rewritten
		lines[idx] = line
		idx++
	}
	return lines[:idx]
}

func clearPOFuzzyFlag(raw string) (string, bool, bool) {
	trimmed := strings.TrimSpace(raw)
	if !strings.HasPrefix(trimmed, "#,") {
		return "", false, false
	}
	flags, fuzzy := parsePOFlags(trimmed[2:])
	if !fuzzy {
		return "", false, false
	}
	if len(flags) == 0 {
		return "", true, true
	}
	return preserveIndent(stripPOCR(raw)) + "#, " + strings.Join(flags, ", ") + poCRSuffix(raw), false, true
}

func rewritePOHeader(lines []poRawLine, entry poBuiltEntry, targetLocale string) ([]poRawLine, error) {
	header := ""
	if len(entry.forms) > 0 {
		header = entry.forms[0]
	}
	updated := updatePOHeaderFields(header, targetLocale, poPluralSpecForLocale(targetLocale))
	if updated == header {
		return lines, nil
	}
	indent := ""
	crlf := false
	out := make([]poRawLine, 0, len(lines))
	skipping := false
	inserted := false
	for _, line := range lines {
		if strings.HasSuffix(line.raw, "\r") {
			crlf = true
		}
		trimmed := strings.TrimSpace(line.raw)
		if strings.HasPrefix(trimmed, "msgstr") || (skipping && strings.HasPrefix(trimmed, "\"")) {
			if !inserted {
				indent = preserveIndent(stripPOCR(line.raw))
				out = append(out, poHeaderValueLines(indent, updated, line.newline, crlf)...)
				inserted = true
			}
			skipping = true
			continue
		}
		skipping = false
		out = append(out, line)
	}
	if !inserted {
		out = append(out, poHeaderValueLines(indent, updated, true, crlf)...)
	}
	return out, nil
}

func updatePOHeaderFields(header, locale string, spec poPluralSpec) string {
	language := "Language: " + poHeaderLanguage(locale)
	plural := "Plural-Forms: " + spec.headerValue()
	lines := strings.Split(header, "\n")
	foundLanguage := false
	foundPlural := false
	for i, line := range lines {
		trim := strings.TrimSpace(line)
		if strings.HasPrefix(trim, "Language:") {
			lines[i] = language
			foundLanguage = true
		}
		if strings.HasPrefix(trim, "Plural-Forms:") {
			lines[i] = plural
			foundPlural = true
		}
	}
	if !foundLanguage {
		lines = insertPOHeaderField(lines, language)
	}
	if !foundPlural {
		lines = insertPOHeaderField(lines, plural)
	}
	if len(lines) == 0 {
		return language + "\n" + plural + "\n"
	}
	joined := strings.Join(lines, "\n")
	if !strings.HasSuffix(joined, "\n") {
		joined += "\n"
	}
	return joined
}

func insertPOHeaderField(lines []string, field string) []string {
	if len(lines) == 1 && strings.TrimSpace(lines[0]) == "" {
		return []string{field, ""}
	}
	for i, line := range lines {
		if strings.TrimSpace(line) == "" {
			return append(lines[:i], append([]string{field}, lines[i:]...)...)
		}
	}
	return append(lines, field)
}

func poHeaderValueLines(indent, header string, newline, crlf bool) []poRawLine {
	parts := strings.SplitAfter(header, "\n")
	lines := make([]poRawLine, 0, poAllocCap(len(parts), 1))
	empty := indent + `msgstr ""`
	if crlf {
		empty += "\r"
	}
	lines = append(lines, poRawLine{raw: empty, newline: true})
	for _, part := range parts {
		if part == "" {
			continue
		}
		raw := indent + strconv.Quote(part)
		if crlf {
			raw += "\r"
		}
		lines = append(lines, poRawLine{raw: raw, newline: true})
	}
	if len(lines) > 0 {
		lines[len(lines)-1].newline = newline
	}
	return lines
}

func poBufferHasMsgstr(entry []poRawLine) bool {
	for _, line := range entry {
		if strings.HasPrefix(strings.TrimSpace(line.raw), "msgstr") {
			return true
		}
	}
	return false
}

func poLineStartsNextEntry(trimmed string) bool {
	if trimmed == "" {
		return false
	}
	if trimmed[0] == '#' {
		return true
	}
	if strings.HasPrefix(trimmed, "msgctxt ") {
		return true
	}
	return strings.HasPrefix(trimmed, "msgid ")
}

func poCategoryOrderEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// poAllocCap adds extra to n without wrapping a length used as a slice capacity.
func poAllocCap(n, extra int) int {
	if extra <= 0 || n > math.MaxInt-extra {
		return n
	}
	return n + extra
}

func stripPOCR(raw string) string {
	return strings.TrimSuffix(raw, "\r")
}

func poCRSuffix(raw string) string {
	if strings.HasSuffix(raw, "\r") {
		return "\r"
	}
	return ""
}

func writePOQuotedValue(w *strings.Builder, value string) {
	if canWriteSimplePOQuoted(value) {
		w.WriteByte('"')
		w.WriteString(value)
		w.WriteByte('"')
		return
	}
	var stackBuf [256]byte
	q := strconv.AppendQuote(stackBuf[:0], value)
	w.Write(q)
}

func canWriteSimplePOQuoted(value string) bool {
	// BOLT OPTIMIZATION: Single-pass ASCII byte scanner bypasses utf8 decoding
	// and strconv.IsPrint unicode lookups for standard printable text.
	asciiOnly := true
	for i := 0; i < len(value); i++ {
		b := value[i]
		if b < 0x20 || b == 0x7f || b == '\\' || b == '"' {
			return false
		}
		if b >= 0x80 {
			asciiOnly = false
		}
	}
	if asciiOnly {
		return true
	}
	if !utf8.ValidString(value) {
		return false
	}
	for _, r := range value {
		if r == '\\' || r == '"' || !strconv.IsPrint(r) {
			return false
		}
	}
	return true
}

func preserveIndent(raw string) string {
	idx := 0
	for idx < len(raw) {
		if raw[idx] != ' ' && raw[idx] != '\t' {
			break
		}
		idx++
	}
	return raw[:idx]
}
