package translationfileparser

import (
	"bytes"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

// Word documents (.docx) are read one paragraph at a time from the main
// document, then headers, footers, footnotes, and endnotes. A paragraph is
// keyed by its part and its position among all of the part's paragraphs, for
// example "word/document.xml#12", so empty paragraphs keep later keys stable.
//
// Tracked deletions are left out and tracked insertions are read as text, so a
// translated document has its tracked changes accepted. Complex fields that
// start in a paragraph, such as page numbers, are kept as placeholders.

const docxFormat = "docx"

var docxSecondaryPartPattern = regexp.MustCompile(`^word/(header|footer)(\d*)\.xml$`)

// docxMarkerLocals are zero-width marks between runs. They are kept at the
// start or end of a translated paragraph.
var docxMarkerLocals = map[string]bool{
	"bookmarkStart":               true,
	"bookmarkEnd":                 true,
	"commentRangeStart":           true,
	"commentRangeEnd":             true,
	"permStart":                   true,
	"permEnd":                     true,
	"moveFromRangeStart":          true,
	"moveFromRangeEnd":            true,
	"moveToRangeStart":            true,
	"moveToRangeEnd":              true,
	"customXmlInsRangeStart":      true,
	"customXmlInsRangeEnd":        true,
	"customXmlDelRangeStart":      true,
	"customXmlDelRangeEnd":        true,
	"customXmlMoveFromRangeStart": true,
	"customXmlMoveFromRangeEnd":   true,
	"customXmlMoveToRangeStart":   true,
	"customXmlMoveToRangeEnd":     true,
}

// DOCXParser parses Word documents into one entry per paragraph.
type DOCXParser struct{}

func (p DOCXParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	return values, err
}

func (p DOCXParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	entries, err := ReadDOCXEntries(content)
	if err != nil {
		return nil, nil, err
	}
	values, entryContext := ooxmlEntriesToMaps(entries)
	return values, entryContext, nil
}

// ReadDOCXEntries lists a document's paragraphs with text, in part order.
func ReadDOCXEntries(content []byte) ([]OOXMLEntry, error) {
	pkg, err := openOOXMLPackage(content, docxFormat)
	if err != nil {
		return nil, err
	}
	parts, err := docxParts(pkg)
	if err != nil {
		return nil, err
	}
	var entries []OOXMLEntry
	for _, part := range parts {
		_, paragraphs, err := scanDOCXPart(part)
		if err != nil {
			return nil, err
		}
		entries = append(entries, ooxmlPartEntries(part.name, paragraphs)...)
	}
	return entries, nil
}

// MarshalDOCX writes values into a copy of template. Paragraphs without a
// value keep their source text, and every other part is carried over.
func MarshalDOCX(template []byte, values map[string]string) ([]byte, error) {
	pkg, err := openOOXMLPackage(template, docxFormat)
	if err != nil {
		return nil, err
	}
	parts, err := docxParts(pkg)
	if err != nil {
		return nil, err
	}
	replacements := map[string][]byte{}
	for _, part := range parts {
		root, paragraphs, err := scanDOCXPart(part)
		if err != nil {
			return nil, err
		}
		if updated := marshalOOXMLPart(part.content, root, paragraphs, part.name, values, writeDOCXText); updated != nil {
			replacements[part.name] = updated
		}
	}
	if len(replacements) == 0 {
		return slices.Clone(template), nil
	}
	return pkg.rewrite(replacements, docxFormat)
}

type docxPart struct {
	ooxmlPart
	location string
}

func docxParts(pkg *ooxmlPackage) ([]docxPart, error) {
	mainName := "word/document.xml"
	if _, ok := pkg.files[mainName]; !ok {
		targets, types, err := pkg.relationshipTargets("_rels/.rels", "")
		if err != nil {
			return nil, err
		}
		mainName = ""
		for id, relType := range types {
			if strings.HasSuffix(relType, "/officeDocument") {
				mainName = targets[id]
			}
		}
	}
	content, ok, err := pkg.read(mainName)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("docx: package has no main document")
	}
	parts := []docxPart{{ooxmlPart: ooxmlPart{name: mainName, content: content}, location: "Word body"}}

	type secondary struct {
		name     string
		kind     string
		number   int
		location string
	}
	var others []secondary
	for name := range pkg.files {
		if match := docxSecondaryPartPattern.FindStringSubmatch(name); match != nil {
			number, _ := strconv.Atoi(match[2])
			others = append(others, secondary{name: name, kind: match[1], number: number, location: "Word " + match[1]})
		}
	}
	slices.SortFunc(others, func(a, b secondary) int {
		if rank := docxSecondaryRank(a.kind) - docxSecondaryRank(b.kind); rank != 0 {
			return rank
		}
		if a.number != b.number {
			return a.number - b.number
		}
		return strings.Compare(a.name, b.name)
	})
	for _, notes := range []secondary{
		{name: "word/footnotes.xml", location: "Word footnote"},
		{name: "word/endnotes.xml", location: "Word endnote"},
	} {
		if _, ok := pkg.files[notes.name]; ok {
			others = append(others, notes)
		}
	}
	for _, other := range others {
		content, ok, err := pkg.read(other.name)
		if err != nil {
			return nil, err
		}
		if ok {
			parts = append(parts, docxPart{ooxmlPart: ooxmlPart{name: other.name, content: content}, location: other.location})
		}
	}
	return parts, nil
}

func docxSecondaryRank(kind string) int {
	if kind == "header" {
		return 0
	}
	return 1
}

func scanDOCXPart(part docxPart) (*ooxmlNode, []*ooxmlParagraph, error) {
	root, err := parseOOXMLTree(part.content)
	if err != nil {
		return nil, nil, fmt.Errorf("docx: parse %q: %w", part.name, err)
	}
	locations := []string{part.location}
	walker := &ooxmlWalker{
		isParagraph: func(n *ooxmlNode) bool { return n.is(ooxmlNamespaceWord, ooxmlParagraphLocal) },
		enter: func(n *ooxmlNode) func() {
			location := ""
			switch {
			case n.is(ooxmlNamespaceWord, "tc"):
				location = "Word table cell"
			case n.is(ooxmlNamespaceWord, "txbxContent"):
				location = "Word text box"
			}
			if location == "" {
				return func() {}
			}
			locations = append(locations, location)
			return func() { locations = locations[:len(locations)-1] }
		},
	}
	walker.build = func(paragraph *ooxmlParagraph) {
		buildDOCXParagraph(paragraph)
		paragraph.context = docxParagraphContext(paragraph, locations[len(locations)-1])
	}
	walker.walk(root, nil, false, false)
	return root, walker.paragraphs, nil
}

func docxParagraphContext(paragraph *ooxmlParagraph, location string) string {
	properties := paragraph.node.child(ooxmlNamespaceWord, "pPr")
	if properties == nil {
		return location
	}
	style := properties.child(ooxmlNamespaceWord, "pStyle")
	if style == nil {
		return location
	}
	if id, ok := style.attr("val"); ok && id != "" {
		return location + ", style " + id
	}
	return location
}

type docxCollector struct {
	paragraph  *ooxmlParagraph
	field      []*ooxmlNode
	fieldDepth int
}

func buildDOCXParagraph(paragraph *ooxmlParagraph) {
	collector := &docxCollector{paragraph: paragraph}
	for _, child := range paragraph.node.children {
		if child.is(ooxmlNamespaceWord, "pPr") {
			paragraph.head = append(paragraph.head, child)
			continue
		}
		collector.collect(child, nil)
	}
	collector.flushField()
}

func (c *docxCollector) flushField() {
	if len(c.field) > 0 {
		c.paragraph.addAtom(c.field, nil, false)
	}
	c.field, c.fieldDepth = nil, 0
}

func (c *docxCollector) collect(node *ooxmlNode, link *ooxmlNode) {
	if c.fieldDepth > 0 {
		c.field = append(c.field, node)
		if node.is(ooxmlNamespaceWord, "r") {
			c.fieldDepth += docxFieldDepthChange(node)
			if c.fieldDepth <= 0 {
				c.flushField()
			}
		}
		return
	}
	if node.space != ooxmlNamespaceWord {
		c.paragraph.addAtom([]*ooxmlNode{node}, nil, false)
		return
	}
	switch node.local {
	case "r":
		c.collectRun(node, link)
	case "hyperlink":
		if node.selfClosing {
			c.paragraph.addMarker(node)
			return
		}
		for _, child := range node.children {
			c.collect(child, node)
		}
	case "ins", "moveTo", "smartTag", "customXml":
		for _, child := range node.children {
			if child.is(ooxmlNamespaceWord, "smartTagPr") || child.is(ooxmlNamespaceWord, "customXmlPr") {
				continue
			}
			c.collect(child, link)
		}
	case "del", "moveFrom", "proofErr":
	default:
		if docxMarkerLocals[node.local] {
			c.paragraph.addMarker(node)
			return
		}
		c.paragraph.addAtom([]*ooxmlNode{node}, nil, false)
	}
}

func docxFieldDepthChange(run *ooxmlNode) int {
	change := 0
	for _, child := range run.children {
		if !child.is(ooxmlNamespaceWord, "fldChar") {
			continue
		}
		switch kind, _ := child.attr("fldCharType"); kind {
		case "begin":
			change++
		case "end":
			change--
		}
	}
	return change
}

func (c *docxCollector) collectRun(run *ooxmlNode, link *ooxmlNode) {
	if change := docxFieldDepthChange(run); change > 0 {
		c.field = []*ooxmlNode{run}
		c.fieldDepth = change
		return
	}
	var props []byte
	if properties := run.child(ooxmlNamespaceWord, "rPr"); properties != nil {
		props = properties.raw()
	}
	paragraph := c.paragraph
	for _, child := range run.children {
		if child.space != ooxmlNamespaceWord {
			paragraph.addAtom([]*ooxmlNode{child}, props, true)
			continue
		}
		switch child.local {
		case "rPr", "lastRenderedPageBreak", "delText", "delInstrText":
		case "t":
			if !child.selfClosing {
				paragraph.addText(normalizeOOXMLSourceRunText(decodeOOXMLText(child.inner())), props, link, false)
			}
		case "tab":
			paragraph.addText("\t", props, link, false)
		case "cr":
			paragraph.addText(ooxmlLineBreak, props, link, false)
		case "br":
			if kind, _ := child.attr("type"); kind == "" || kind == "textWrapping" {
				paragraph.addText(ooxmlLineBreak, props, link, false)
				continue
			}
			paragraph.addAtom([]*ooxmlNode{child}, props, true)
		case "noBreakHyphen":
			paragraph.addText("\u2011", props, link, false)
		case "softHyphen":
			paragraph.addText("\u00AD", props, link, false)
		default:
			paragraph.addAtom([]*ooxmlNode{child}, props, true)
		}
	}
}

func writeDOCXText(b *bytes.Buffer, paragraph *ooxmlParagraph, props []byte, text string) {
	if text == "" {
		return
	}
	run := paragraph.node.qualified("r")
	b.WriteString("<" + run + ">")
	b.Write(props)
	textTag := paragraph.node.qualified("t")
	inText := false
	closeText := func() {
		if inText {
			b.WriteString("</" + textTag + ">")
			inText = false
		}
	}
	for _, r := range text {
		element := ""
		switch r {
		case '\t':
			element = "tab"
		case '\n':
			element = "br"
		case '\u2011':
			element = "noBreakHyphen"
		case '\u00AD':
			element = "softHyphen"
		}
		if element != "" {
			closeText()
			b.WriteString("<" + paragraph.node.qualified(element) + "/>")
			continue
		}
		if !inText {
			b.WriteString("<" + textTag + ` xml:space="preserve">`)
			inText = true
		}
		escapeOOXMLText(b, string(r))
	}
	closeText()
	b.WriteString("</" + run + ">")
}
