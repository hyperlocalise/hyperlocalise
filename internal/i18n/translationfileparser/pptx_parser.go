package translationfileparser

import (
	"bytes"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strconv"
)

// PowerPoint decks (.pptx) are read one slide at a time in presentation order.
// Each paragraph of a shape or table cell is one entry, keyed by its slide part
// and its position among the slide's paragraphs, for example
// "ppt/slides/slide3.xml#4". Speaker notes, layouts, masters, charts, and
// diagrams are separate parts and are carried over unchanged.

const pptxFormat = "pptx"

var pptxSlidePartPattern = regexp.MustCompile(`^ppt/slides/slide(\d+)\.xml$`)

// PPTXParser parses PowerPoint decks into one entry per slide paragraph.
type PPTXParser struct{}

func (p PPTXParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	return values, err
}

func (p PPTXParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	entries, err := ReadPPTXEntries(content)
	if err != nil {
		return nil, nil, err
	}
	values, entryContext := ooxmlEntriesToMaps(entries)
	return values, entryContext, nil
}

// ReadPPTXEntries lists a deck's paragraphs with text, in slide order.
func ReadPPTXEntries(content []byte) ([]OOXMLEntry, error) {
	pkg, err := openOOXMLPackage(content, pptxFormat)
	if err != nil {
		return nil, err
	}
	slides, err := pptxSlideParts(pkg)
	if err != nil {
		return nil, err
	}
	var entries []OOXMLEntry
	for number, slide := range slides {
		_, paragraphs, err := scanPPTXSlide(slide, number+1)
		if err != nil {
			return nil, err
		}
		entries = append(entries, ooxmlPartEntries(slide.name, paragraphs)...)
	}
	return entries, nil
}

// MarshalPPTX writes values into a copy of template. Paragraphs without a
// value keep their source text, and every other part is carried over.
func MarshalPPTX(template []byte, values map[string]string) ([]byte, error) {
	pkg, err := openOOXMLPackage(template, pptxFormat)
	if err != nil {
		return nil, err
	}
	slides, err := pptxSlideParts(pkg)
	if err != nil {
		return nil, err
	}
	replacements := map[string][]byte{}
	for number, slide := range slides {
		root, paragraphs, err := scanPPTXSlide(slide, number+1)
		if err != nil {
			return nil, err
		}
		if updated := marshalOOXMLPart(slide.content, root, paragraphs, slide.name, values, writePPTXText); updated != nil {
			replacements[slide.name] = updated
		}
	}
	if len(replacements) == 0 {
		return slices.Clone(template), nil
	}
	return pkg.rewrite(replacements, pptxFormat)
}

// pptxSlideParts lists slides through the presentation's slide list, because
// part names follow creation order. Packages without a usable list fall back
// to part numbers.
func pptxSlideParts(pkg *ooxmlPackage) ([]ooxmlPart, error) {
	presentation, ok, err := pkg.read("ppt/presentation.xml")
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("pptx: package has no presentation part")
	}
	targets, _, err := pkg.relationshipTargets("ppt/_rels/presentation.xml.rels", "ppt")
	if err != nil {
		return nil, err
	}
	root, err := parseOOXMLTree(presentation)
	if err != nil {
		return nil, fmt.Errorf("pptx: parse presentation: %w", err)
	}
	var names []string
	var walk func(*ooxmlNode)
	walk = func(n *ooxmlNode) {
		for _, c := range n.children {
			if c.local == "sldId" {
				if id, ok := c.prefixedAttr("id"); ok {
					if target := targets[id]; target != "" {
						if _, exists := pkg.files[target]; exists {
							names = append(names, target)
						}
					}
				}
			}
			walk(c)
		}
	}
	walk(root)
	if len(names) == 0 {
		type numbered struct {
			name   string
			number int
		}
		var found []numbered
		for name := range pkg.files {
			if match := pptxSlidePartPattern.FindStringSubmatch(name); match != nil {
				number, _ := strconv.Atoi(match[1])
				found = append(found, numbered{name: name, number: number})
			}
		}
		slices.SortFunc(found, func(a, b numbered) int { return a.number - b.number })
		for _, f := range found {
			names = append(names, f.name)
		}
	}
	parts := make([]ooxmlPart, 0, len(names))
	for _, name := range names {
		content, ok, err := pkg.read(name)
		if err != nil {
			return nil, err
		}
		if ok {
			parts = append(parts, ooxmlPart{name: name, content: content})
		}
	}
	return parts, nil
}

func scanPPTXSlide(slide ooxmlPart, number int) (*ooxmlNode, []*ooxmlParagraph, error) {
	root, err := parseOOXMLTree(slide.content)
	if err != nil {
		return nil, nil, fmt.Errorf("pptx: parse %q: %w", slide.name, err)
	}
	shapeName := ""
	tableDepth := 0
	walker := &ooxmlWalker{
		isParagraph: func(n *ooxmlNode) bool { return n.is(ooxmlNamespaceDrawing, ooxmlParagraphLocal) },
		enter: func(n *ooxmlNode) func() {
			if n.local == "cNvPr" {
				shapeName, _ = n.attr("name")
			}
			if n.is(ooxmlNamespaceDrawing, "tbl") {
				tableDepth++
				return func() { tableDepth-- }
			}
			return func() {}
		},
	}
	walker.build = func(paragraph *ooxmlParagraph) {
		buildPPTXParagraph(paragraph)
		context := "Slide " + strconv.Itoa(number)
		if shapeName != "" {
			context += ", " + shapeName
		}
		if tableDepth > 0 {
			context += ", table cell"
		}
		paragraph.context = context
	}
	walker.walk(root, nil, false, false)
	return root, walker.paragraphs, nil
}

func buildPPTXParagraph(paragraph *ooxmlParagraph) {
	for _, child := range paragraph.node.children {
		if child.space != ooxmlNamespaceDrawing {
			paragraph.addAtom([]*ooxmlNode{child}, nil, false)
			continue
		}
		switch child.local {
		case "pPr":
			paragraph.head = append(paragraph.head, child)
		case "endParaRPr":
			paragraph.tail = append(paragraph.tail, child)
		case "r":
			var props []byte
			text := ""
			for _, c := range child.children {
				switch {
				case c.is(ooxmlNamespaceDrawing, "rPr"):
					props = c.raw()
				case c.is(ooxmlNamespaceDrawing, "t"):
					text += decodeOOXMLText(c.inner())
				}
			}
			paragraph.addText(normalizeOOXMLSourceRunText(text), props, nil, false)
		case "br":
			paragraph.addText(ooxmlLineBreak, nil, nil, true)
		default:
			paragraph.addAtom([]*ooxmlNode{child}, nil, false)
		}
	}
}

func writePPTXText(b *bytes.Buffer, paragraph *ooxmlParagraph, props []byte, text string) {
	run := paragraph.node.qualified("r")
	textTag := paragraph.node.qualified("t")
	for i, line := range splitOOXMLLines(text) {
		if i > 0 {
			b.WriteString("<" + paragraph.node.qualified("br") + "/>")
		}
		if line == "" {
			continue
		}
		b.WriteString("<" + run + ">")
		b.Write(props)
		b.WriteString("<" + textTag + ">")
		escapeOOXMLText(b, line)
		b.WriteString("</" + textTag + "></" + run + ">")
	}
}

func splitOOXMLLines(text string) []string {
	lines := []string{}
	start := 0
	for i := 0; i < len(text); i++ {
		if text[i] == '\n' {
			lines = append(lines, text[start:i])
			start = i + 1
		}
	}
	return append(lines, text[start:])
}
