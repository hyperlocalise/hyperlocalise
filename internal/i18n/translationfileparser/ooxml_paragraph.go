package translationfileparser

import (
	"bytes"
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode"
)

// An Office paragraph is one entry. Its text is the paragraph's visible text in
// the formatting that holds most of it. Text in other formatting or inside a
// link is wrapped in a pair of placeholders, and objects that are not text,
// such as images, fields, and footnote marks, are single placeholders:
//
//	Read the \x1eHLOXPH_6F30_0\x1fterms\x1eHLOXPH_6330_1\x1f first.
//
// A placeholder is \x1eHLOXPH_<hex>_<n>\x1f, where <hex> encodes "o<g>" or
// "c<g>" (open and close formatting group g) or "a<k>" (object k), and <n> is
// its position in the entry. Writers read groups and objects from the source
// paragraph, so a translation only has to keep the placeholders.

const (
	ooxmlTokenMarker    = "\x1eHLOXPH_"
	ooxmlTokenOpen      = 'o'
	ooxmlTokenClose     = 'c'
	ooxmlTokenAtom      = 'a'
	ooxmlKeySeparator   = "#"
	ooxmlLineBreak      = "\n"
	ooxmlParagraphLocal = "p"
)

const ooxmlPreservePlaceholdersLine = "Preserve every placeholder token matching \\x1eHLOXPH_…\\x1f exactly (do not translate, remove, or rename them). Text between an opening and a closing token keeps that formatting, so move the pair with the words it wraps."

var ooxmlTokenPattern = regexp.MustCompile(`\x1eHLOXPH_([A-F0-9]+)_([0-9]+)\x1f`)

type ooxmlPiece struct {
	atom bool
	text string
	// props is the run's properties element as written; nil when empty.
	props []byte
	// inherit takes props and link from the neighbouring text, as line breaks do.
	inherit   bool
	link      *ooxmlNode
	atomNodes []*ooxmlNode
	atomProps []byte
	wrapRun   bool
}

type ooxmlParagraph struct {
	node       *ooxmlNode
	index      int
	isFallback bool
	head       []*ooxmlNode
	tail       []*ooxmlNode
	pieces     []ooxmlPiece
	context    string
	textSeen   bool
}

type ooxmlSpan struct {
	atom  bool
	plain bool
	text  string
	props []byte
	link  *ooxmlNode
	piece *ooxmlPiece
}

type ooxmlParagraphSpans struct {
	spans     []ooxmlSpan
	groups    []*ooxmlSpan
	atoms     []*ooxmlSpan
	baseProps []byte
}

func (p *ooxmlParagraph) addText(text string, props []byte, link *ooxmlNode, inherit bool) {
	if text == "" {
		return
	}
	p.textSeen = true
	p.pieces = append(p.pieces, ooxmlPiece{text: text, props: props, link: link, inherit: inherit})
}

func (p *ooxmlParagraph) addAtom(nodes []*ooxmlNode, props []byte, wrapRun bool) {
	p.pieces = append(p.pieces, ooxmlPiece{atom: true, atomNodes: nodes, atomProps: props, wrapRun: wrapRun})
}

func (p *ooxmlParagraph) addMarker(node *ooxmlNode) {
	if p.textSeen {
		p.tail = append(p.tail, node)
		return
	}
	p.head = append(p.head, node)
}

func (p *ooxmlParagraph) resolveInheritance() {
	for i := range p.pieces {
		piece := &p.pieces[i]
		if piece.atom || !piece.inherit {
			continue
		}
		if source := p.neighbourText(i); source != nil {
			piece.props, piece.link = source.props, source.link
		}
	}
}

func (p *ooxmlParagraph) neighbourText(i int) *ooxmlPiece {
	for j := i - 1; j >= 0; j-- {
		if !p.pieces[j].atom && !p.pieces[j].inherit {
			return &p.pieces[j]
		}
	}
	for j := i + 1; j < len(p.pieces); j++ {
		if !p.pieces[j].atom && !p.pieces[j].inherit {
			return &p.pieces[j]
		}
	}
	return nil
}

// baseProps is the formatting holding most of the paragraph's text outside
// links, with ties going to the first one written.
func (p *ooxmlParagraph) baseProps() []byte {
	order := []string{}
	counts := map[string]int{}
	values := map[string][]byte{}
	for _, piece := range p.pieces {
		if piece.atom || piece.link != nil {
			continue
		}
		key := string(piece.props)
		if _, ok := counts[key]; !ok {
			order = append(order, key)
			values[key] = piece.props
		}
		counts[key] += len([]rune(piece.text))
	}
	best := ""
	bestCount := -1
	for _, key := range order {
		if counts[key] > bestCount {
			best, bestCount = key, counts[key]
		}
	}
	return values[best]
}

func (p *ooxmlParagraph) spans() ooxmlParagraphSpans {
	p.resolveInheritance()
	base := p.baseProps()
	out := ooxmlParagraphSpans{baseProps: base}
	for i := range p.pieces {
		piece := &p.pieces[i]
		if piece.atom {
			out.spans = append(out.spans, ooxmlSpan{atom: true, piece: piece})
			continue
		}
		plain := piece.link == nil && bytes.Equal(piece.props, base)
		if n := len(out.spans); n > 0 {
			last := &out.spans[n-1]
			if !last.atom && last.plain == plain && last.link == piece.link && bytes.Equal(last.props, piece.props) {
				last.text += piece.text
				continue
			}
		}
		out.spans = append(out.spans, ooxmlSpan{plain: plain, text: piece.text, props: piece.props, link: piece.link})
	}
	for i := range out.spans {
		span := &out.spans[i]
		switch {
		case span.atom:
			out.atoms = append(out.atoms, span)
		case !span.plain:
			out.groups = append(out.groups, span)
		}
	}
	return out
}

func (s ooxmlParagraphSpans) segment() string {
	var b strings.Builder
	ordinal, group, atom := 0, 0, 0
	for _, span := range s.spans {
		switch {
		case span.atom:
			b.WriteString(ooxmlToken(ooxmlTokenAtom, atom, ordinal))
			atom++
			ordinal++
		case span.plain:
			b.WriteString(span.text)
		default:
			b.WriteString(ooxmlToken(ooxmlTokenOpen, group, ordinal))
			b.WriteString(span.text)
			b.WriteString(ooxmlToken(ooxmlTokenClose, group, ordinal+1))
			group++
			ordinal += 2
		}
	}
	return b.String()
}

func ooxmlToken(kind byte, index, ordinal int) string {
	desc := string(kind) + strconv.Itoa(index)
	var b strings.Builder
	b.WriteString(ooxmlTokenMarker)
	for i := 0; i < len(desc); i++ {
		b.WriteByte(hexDigits[desc[i]>>4])
		b.WriteByte(hexDigits[desc[i]&0x0f])
	}
	b.WriteByte('_')
	b.WriteString(strconv.Itoa(ordinal))
	b.WriteByte('\x1f')
	return b.String()
}

func decodeOOXMLToken(hex string) (byte, int, bool) {
	desc, ok := decodeUnrealRichTextLiteralHex(hex)
	if !ok || len(desc) < 2 {
		return 0, 0, false
	}
	index, err := strconv.Atoi(desc[1:])
	if err != nil || index < 0 {
		return 0, 0, false
	}
	switch desc[0] {
	case ooxmlTokenOpen, ooxmlTokenClose, ooxmlTokenAtom:
		return desc[0], index, true
	}
	return 0, 0, false
}

type ooxmlTranslatedItem struct {
	text  string
	token bool
	kind  byte
	index int
}

func parseOOXMLTranslation(translated string) []ooxmlTranslatedItem {
	var items []ooxmlTranslatedItem
	pos := 0
	for _, match := range ooxmlTokenPattern.FindAllStringSubmatchIndex(translated, -1) {
		if match[0] > pos {
			items = append(items, ooxmlTranslatedItem{text: normalizeOOXMLText(translated[pos:match[0]])})
		}
		kind, index, ok := decodeOOXMLToken(translated[match[2]:match[3]])
		if ok {
			items = append(items, ooxmlTranslatedItem{token: true, kind: kind, index: index})
		}
		pos = match[1]
	}
	if pos < len(translated) {
		items = append(items, ooxmlTranslatedItem{text: normalizeOOXMLText(translated[pos:])})
	}
	return items
}

// normalizeOOXMLText turns other line separators into line breaks and drops
// characters XML 1.0 cannot hold.
func normalizeOOXMLText(value string) string {
	value = strings.ReplaceAll(value, "\r\n", ooxmlLineBreak)
	var b strings.Builder
	b.Grow(len(value))
	for _, r := range value {
		switch {
		case r == '\v' || r == '\r' || r == '\u2028':
			b.WriteString(ooxmlLineBreak)
		case r == '\t' || r == '\n' || (r >= 0x20 && r != 0xFFFE && r != 0xFFFF):
			b.WriteRune(r)
		}
	}
	return b.String()
}

func normalizeOOXMLSourceRunText(text string) string {
	if !strings.ContainsAny(text, "\r\n") {
		return text
	}
	return strings.Join(strings.FieldsFunc(text, func(r rune) bool { return r == '\r' || r == '\n' }), " ")
}

type ooxmlTextWriter func(b *bytes.Buffer, paragraph *ooxmlParagraph, props []byte, text string)

func (p *ooxmlParagraph) write(b *bytes.Buffer, r *ooxmlRenderer, translated string, writeText ooxmlTextWriter) {
	spans := p.spans()
	b.Write(r.content[p.node.start:p.node.startTagEnd])
	for _, node := range p.head {
		r.render(b, node)
	}
	used := make([]bool, len(spans.atoms))
	current := -1
	for _, item := range parseOOXMLTranslation(translated) {
		if !item.token {
			if current >= 0 {
				group := spans.groups[current]
				p.writeLinkedText(b, r, group.link, group.props, item.text, writeText)
			} else {
				writeText(b, p, spans.baseProps, item.text)
			}
			continue
		}
		switch item.kind {
		case ooxmlTokenOpen:
			if item.index < len(spans.groups) {
				current = item.index
			}
		case ooxmlTokenClose:
			if item.index == current {
				current = -1
			}
		case ooxmlTokenAtom:
			if item.index < len(spans.atoms) && !used[item.index] {
				used[item.index] = true
				p.writeAtom(b, r, spans.atoms[item.index].piece)
			}
		}
	}
	for i, atom := range spans.atoms {
		if !used[i] {
			p.writeAtom(b, r, atom.piece)
		}
	}
	for _, node := range p.tail {
		r.render(b, node)
	}
	b.Write(r.content[p.node.closeStart:p.node.end])
}

func (p *ooxmlParagraph) writeLinkedText(b *bytes.Buffer, r *ooxmlRenderer, link *ooxmlNode, props []byte, text string, writeText ooxmlTextWriter) {
	if link == nil || link.selfClosing || text == "" {
		writeText(b, p, props, text)
		return
	}
	b.Write(r.content[link.start:link.startTagEnd])
	writeText(b, p, props, text)
	b.Write(r.content[link.closeStart:link.end])
}

func (p *ooxmlParagraph) writeAtom(b *bytes.Buffer, r *ooxmlRenderer, piece *ooxmlPiece) {
	if piece.wrapRun {
		run := p.node.qualified("r")
		b.WriteString("<" + run + ">")
		b.Write(piece.atomProps)
	}
	for _, node := range piece.atomNodes {
		r.render(b, node)
	}
	if piece.wrapRun {
		b.WriteString("</" + p.node.qualified("r") + ">")
	}
}

// ooxmlAlternateFrame maps the Fallback copy of each paragraph in a Choice to
// that paragraph, so both copies share one entry.
type ooxmlAlternateFrame struct {
	choice []int
	cursor int
}

type ooxmlWalker struct {
	count       int
	paragraphs  []*ooxmlParagraph
	isParagraph func(*ooxmlNode) bool
	build       func(*ooxmlParagraph)
	enter       func(*ooxmlNode) func()
}

func (w *ooxmlWalker) walk(node *ooxmlNode, frame *ooxmlAlternateFrame, inChoice, inFallback bool) {
	for _, child := range node.children {
		if child.is(ooxmlNamespaceMarkup, "AlternateContent") {
			inner := &ooxmlAlternateFrame{}
			for _, branch := range child.children {
				switch {
				case branch.is(ooxmlNamespaceMarkup, "Choice"):
					w.walk(branch, inner, true, false)
				case branch.is(ooxmlNamespaceMarkup, "Fallback"):
					w.walk(branch, inner, false, true)
				}
			}
			continue
		}
		if w.isParagraph(child) {
			counted := w.count
			w.count++
			paragraph := &ooxmlParagraph{node: child, index: counted}
			switch {
			case inFallback && frame != nil && frame.cursor < len(frame.choice):
				paragraph.index = frame.choice[frame.cursor]
				paragraph.isFallback = true
				frame.cursor++
			case inChoice && frame != nil:
				frame.choice = append(frame.choice, counted)
			}
			w.build(paragraph)
			w.paragraphs = append(w.paragraphs, paragraph)
			w.walk(child, frame, inChoice, inFallback)
			continue
		}
		leave := func() {}
		if w.enter != nil {
			leave = w.enter(child)
		}
		w.walk(child, frame, inChoice, inFallback)
		leave()
	}
}

// OOXMLEntry is one translatable paragraph of an Office package.
type OOXMLEntry struct {
	Key     string `json:"key"`
	Text    string `json:"text"`
	Context string `json:"context,omitempty"`
}

func ooxmlEntryKey(partName string, index int) string {
	return partName + ooxmlKeySeparator + strconv.Itoa(index)
}

func ooxmlPartEntries(partName string, paragraphs []*ooxmlParagraph) []OOXMLEntry {
	entries := make([]OOXMLEntry, 0, len(paragraphs))
	for _, paragraph := range paragraphs {
		if paragraph.isFallback {
			continue
		}
		text := paragraph.spans().segment()
		if !ooxmlHasLetter(text) {
			continue
		}
		context := paragraph.context
		if strings.Contains(text, ooxmlTokenMarker) {
			context = strings.TrimSpace(context + "\n" + ooxmlPreservePlaceholdersLine)
		}
		entries = append(entries, OOXMLEntry{
			Key:     ooxmlEntryKey(partName, paragraph.index),
			Text:    text,
			Context: context,
		})
	}
	return entries
}

func ooxmlHasLetter(text string) bool {
	for _, r := range ooxmlTokenPattern.ReplaceAllString(text, "") {
		if unicode.IsLetter(r) {
			return true
		}
	}
	return false
}

// marshalOOXMLPart regenerates the paragraphs of one part that have a
// translation different from their source text. It returns nil when nothing
// changes, so callers can copy the part unchanged.
func marshalOOXMLPart(content []byte, root *ooxmlNode, paragraphs []*ooxmlParagraph, partName string, values map[string]string, writeText ooxmlTextWriter) []byte {
	renderer := newOOXMLRenderer(content, root)
	changed := false
	for _, paragraph := range paragraphs {
		value, ok := values[ooxmlEntryKey(partName, paragraph.index)]
		if !ok || value == "" {
			continue
		}
		source := paragraph.spans().segment()
		if !ooxmlHasLetter(source) || normalizeOOXMLText(value) == source {
			continue
		}
		paragraph := paragraph
		renderer.replace(paragraph.node, func(b *bytes.Buffer) {
			paragraph.write(b, renderer, value, writeText)
		})
		changed = true
	}
	if !changed {
		return nil
	}
	var out bytes.Buffer
	out.Grow(len(content) + len(content)/8)
	renderer.render(&out, root)
	return out.Bytes()
}

func ooxmlEntriesToMaps(entries []OOXMLEntry) (map[string]string, map[string]string) {
	values := make(map[string]string, len(entries))
	var entryContext map[string]string
	for _, entry := range entries {
		values[entry.Key] = entry.Text
		if entry.Context != "" {
			if entryContext == nil {
				entryContext = map[string]string{}
			}
			entryContext[entry.Key] = entry.Context
		}
	}
	return values, entryContext
}

func ooxmlIngestEntries(entries []OOXMLEntry) map[string]IngestEntry {
	out := make(map[string]IngestEntry, len(entries))
	for _, entry := range entries {
		out[entry.Key] = IngestEntry{Text: entry.Text, Context: entry.Context}
	}
	return out
}

// OOXMLPlaceholderTokens returns the sorted Office placeholders in s.
func OOXMLPlaceholderTokens(s string) []string {
	if !strings.Contains(s, ooxmlTokenMarker) {
		return nil
	}
	matches := ooxmlTokenPattern.FindAllString(s, -1)
	slices.Sort(matches)
	return matches
}

// ValidateOOXMLPlaceholders returns an error when translated does not keep
// exactly the source's Office placeholders.
func ValidateOOXMLPlaceholders(source, translated string) error {
	src := OOXMLPlaceholderTokens(source)
	tgt := OOXMLPlaceholderTokens(translated)
	if slices.Equal(src, tgt) {
		return nil
	}
	return fmt.Errorf("office placeholder mismatch: expected %d token(s), got %d (source tokens %v vs candidate %v)", len(src), len(tgt), src, tgt)
}
