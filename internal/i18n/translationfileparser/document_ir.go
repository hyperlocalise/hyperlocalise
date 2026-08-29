package translationfileparser

import (
	"path/filepath"
	"strings"
)

// DocumentEntriesMetaKey is the reserved `hl entries` key for document structure.
// Cloud ingest skips it as a translation key and stores it as file metadata.
const DocumentEntriesMetaKey = "__hl_document"

// DocumentFormat names a document adapter.
type DocumentFormat string

const (
	DocumentFormatMarkdown DocumentFormat = "markdown"
	DocumentFormatMDX      DocumentFormat = "mdx"
)

// DocumentBlockKind distinguishes CMS fields (frontmatter) from body blocks.
type DocumentBlockKind string

const (
	DocumentBlockKindBody  DocumentBlockKind = "body"
	DocumentBlockKindField DocumentBlockKind = "field"
)

// DocumentPart is one reconstructed document region: frozen literal or a translatable block.
type DocumentPart struct {
	Literal string `json:"literal,omitempty"`
	BlockID string `json:"blockId,omitempty"`
}

// DocumentBlock is a translatable slot with stable structural identity and a content fingerprint.
type DocumentBlock struct {
	ID          string            `json:"id"`
	Path        string            `json:"path"`
	Fingerprint string            `json:"fingerprint"`
	Kind        DocumentBlockKind `json:"kind"`
	Text        string            `json:"text"`
}

// ParsedDocument is the public markdown/MDX document IR.
type ParsedDocument struct {
	Format DocumentFormat  `json:"format"`
	Parts  []DocumentPart  `json:"parts"`
	Blocks []DocumentBlock `json:"blocks"`
}

// IsMarkdownDocumentExtension reports whether path is a markdown or MDX document.
func IsMarkdownDocumentExtension(path string) bool {
	switch strings.ToLower(filepath.Ext(strings.TrimSpace(path))) {
	case ".md", ".mdx", ".markdown", ".mdown", ".mkdn", ".mdwn", ".mkd":
		return true
	default:
		return false
	}
}

// IsMarkdownDocumentMDX reports whether path should use the MDX adapter.
func IsMarkdownDocumentMDX(path string) bool {
	return strings.ToLower(filepath.Ext(strings.TrimSpace(path))) == ".mdx"
}

// ParseMarkdownDocumentIR parses markdown or MDX into a document IR with stable slot ids.
func ParseMarkdownDocumentIR(content []byte, mdx bool) ParsedDocument {
	doc, _ := parseMarkdownDocument(stripBOM(content), mdx)
	return parsedDocumentFromMarkdown(doc, mdx)
}

func parsedDocumentFromMarkdown(doc markdownDocument, mdx bool) ParsedDocument {
	format := DocumentFormatMarkdown
	if mdx {
		format = DocumentFormatMDX
	}

	out := ParsedDocument{
		Format: format,
		Parts:  make([]DocumentPart, 0, len(doc.parts)),
		Blocks: make([]DocumentBlock, 0),
	}
	for _, part := range doc.parts {
		if part.key == "" {
			if part.literal == "" {
				continue
			}
			out.Parts = append(out.Parts, DocumentPart{Literal: part.literal})
			continue
		}
		kind := DocumentBlockKind(part.kind)
		if kind == "" {
			kind = markdownBlockKindForPath(part.path)
		}
		fingerprint := part.fingerprint
		if fingerprint == "" {
			fingerprint = markdownContentFingerprint(part.source)
		}
		block := DocumentBlock{
			ID:          part.key,
			Path:        part.path,
			Fingerprint: fingerprint,
			Kind:        kind,
			Text:        part.source,
		}
		out.Blocks = append(out.Blocks, block)
		out.Parts = append(out.Parts, DocumentPart{BlockID: part.key})
	}
	return out
}

func (d ParsedDocument) ingestEntries() map[string]IngestEntry {
	if len(d.Blocks) == 0 {
		return nil
	}
	out := make(map[string]IngestEntry, len(d.Blocks))
	for _, block := range d.Blocks {
		out[block.ID] = IngestEntry{
			Text:        block.Text,
			Fingerprint: block.Fingerprint,
			Path:        block.Path,
			Kind:        string(block.Kind),
			Format:      string(d.Format),
		}
	}
	return out
}

func (d ParsedDocument) WithBlockText(values map[string]string) ParsedDocument {
	if len(values) == 0 {
		return d
	}
	blocks := make([]DocumentBlock, len(d.Blocks))
	copy(blocks, d.Blocks)
	for i, block := range blocks {
		if text, ok := values[block.ID]; ok {
			blocks[i].Text = text
		}
	}
	d.Blocks = blocks
	return d
}

// EncodeDocumentEntriesCommandOutput emits `hl entries` JSON for a document:
// block records plus the reserved document envelope.
func EncodeDocumentEntriesCommandOutput(doc ParsedDocument) map[string]EntriesCommandOutputValue {
	out := EncodeEntriesCommandOutput(doc.ingestEntries())
	if out == nil {
		out = map[string]EntriesCommandOutputValue{}
	}
	out[DocumentEntriesMetaKey] = map[string]any{
		"format": doc.Format,
		"parts":  doc.Parts,
	}
	return out
}

// AlignMarkdownSourceRevisions maps previous slot ids onto the current parse by
// fingerprint first, then identical source text. Used when source structure shifts.
func AlignMarkdownSourceRevisions(previous, current []byte, mdx bool) map[string]string {
	prevDoc := ParseMarkdownDocumentIR(previous, mdx)
	currDoc := ParseMarkdownDocumentIR(current, mdx)
	return alignDocumentBlocksByFingerprint(prevDoc.Blocks, currDoc.Blocks)
}

func alignDocumentBlocksByFingerprint(previous, current []DocumentBlock) map[string]string {
	used := make([]bool, len(current))
	aligned := make(map[string]string, len(previous))

	indexByFingerprint := make(map[string][]int, len(current))
	indexByText := make(map[string][]int, len(current))
	for i, block := range current {
		if block.Fingerprint != "" {
			indexByFingerprint[block.Fingerprint] = append(indexByFingerprint[block.Fingerprint], i)
		}
		indexByText[block.Text] = append(indexByText[block.Text], i)
	}

	take := func(indexes []int) (DocumentBlock, bool) {
		for _, idx := range indexes {
			if used[idx] {
				continue
			}
			used[idx] = true
			return current[idx], true
		}
		return DocumentBlock{}, false
	}

	for _, block := range previous {
		if next, ok := take(indexByFingerprint[block.Fingerprint]); ok {
			aligned[block.ID] = next.ID
			continue
		}
		if next, ok := take(indexByText[block.Text]); ok {
			aligned[block.ID] = next.ID
		}
	}
	return aligned
}
