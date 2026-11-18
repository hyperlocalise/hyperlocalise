package translationfileparser

import (
	"slices"
	"strings"
)

// ParsedMarkdownDocument is a parsed markdown or MDX document. Callers that align many targets
// against one source, or look up many key lines, parse once instead of once per call.
// It is safe for concurrent use.
type ParsedMarkdownDocument struct {
	doc     markdownDocument
	entries map[string]string
	mdx     bool
}

// ParseMarkdownDocument parses a markdown or MDX document for reuse.
func ParseMarkdownDocument(content []byte, mdx bool) *ParsedMarkdownDocument {
	doc, entries := parseMarkdownDocument(stripBOM(content), mdx)
	return &ParsedMarkdownDocument{doc: doc, entries: entries, mdx: mdx}
}

// AlignTarget matches AlignMarkdownTargetToSource for this source and the given target.
func (d *ParsedMarkdownDocument) AlignTarget(targetTemplate []byte) map[string]string {
	return d.AlignTargetDocument(ParseMarkdownDocument(targetTemplate, d.mdx))
}

// AlignTargetDocument is AlignTarget for a target that is already parsed.
func (d *ParsedMarkdownDocument) AlignTargetDocument(target *ParsedMarkdownDocument) map[string]string {
	return alignMarkdownFallback(d.doc, d.entries, target.doc)
}

// KeyLines maps each segment key to the 1-based line of its first occurrence,
// matching LineForMarkdownKey for every key in one pass.
func (d *ParsedMarkdownDocument) KeyLines() map[string]int {
	return documentKeyLines(len(d.doc.parts), func(i int) (string, string) {
		return d.doc.parts[i].key, d.doc.parts[i].literal
	})
}

// ASTPaths matches MarkdownASTPaths for this document.
func (d *ParsedMarkdownDocument) ASTPaths() []string {
	contexts := d.doc.keyContexts()
	paths := make([]string, 0, len(contexts))
	for _, ctx := range contexts {
		paths = append(paths, ctx.path)
	}
	slices.Sort(paths)
	return slices.Compact(paths)
}

// ParsedAsciiDocDocument is a parsed AsciiDoc document. It is safe for concurrent use.
type ParsedAsciiDocDocument struct {
	doc     asciiDocDocument
	entries map[string]string
}

// ParseAsciiDocDocument parses an AsciiDoc document for reuse.
func ParseAsciiDocDocument(content []byte) *ParsedAsciiDocDocument {
	doc, entries := parseAsciiDocDocument(stripBOM(content))
	return &ParsedAsciiDocDocument{doc: doc, entries: entries}
}

// AlignTarget matches AlignAsciiDocTargetToSource for this source and the given target.
func (d *ParsedAsciiDocDocument) AlignTarget(targetTemplate []byte) map[string]string {
	return d.AlignTargetDocument(ParseAsciiDocDocument(targetTemplate))
}

// AlignTargetDocument is AlignTarget for a target that is already parsed.
func (d *ParsedAsciiDocDocument) AlignTargetDocument(target *ParsedAsciiDocDocument) map[string]string {
	fallback := newAsciiDocAligner(d.doc, target.doc)
	aligned := make(map[string]string, len(d.entries))
	for _, part := range d.doc.parts {
		if part.key == "" {
			continue
		}
		if _, ok := d.entries[part.key]; !ok {
			fallback.advance()
			continue
		}
		if text, ok := fallback.take(); ok {
			aligned[part.key] = text
			continue
		}
		aligned[part.key] = ""
	}
	return aligned
}

// KeyLines maps each segment key to the 1-based line of its first occurrence,
// matching LineForAsciiDocKey for every key in one pass.
func (d *ParsedAsciiDocDocument) KeyLines() map[string]int {
	return documentKeyLines(len(d.doc.parts), func(i int) (string, string) {
		return d.doc.parts[i].key, d.doc.parts[i].literal
	})
}

func documentKeyLines(count int, part func(int) (key, literal string)) map[string]int {
	lines := make(map[string]int, count)
	line := 1
	for i := range count {
		key, literal := part(i)
		if key != "" {
			if _, seen := lines[key]; !seen {
				lines[key] = line
			}
		}
		line += strings.Count(literal, "\n")
	}
	return lines
}
