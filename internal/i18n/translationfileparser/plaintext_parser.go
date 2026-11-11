package translationfileparser

import (
	"path/filepath"
	"strconv"
	"strings"
)

// PlainTextParser parses plain text (.txt) files into paragraph segments.
type PlainTextParser struct{}

type plainTextPart struct {
	literal string
	key     string
	source  string
	path    string
}

type plainTextDocument struct {
	parts []plainTextPart
}

func (p PlainTextParser) Parse(content []byte) (map[string]string, error) {
	_, entries := parsePlainTextDocument(stripBOM(content))
	return entries, nil
}

func (p PlainTextParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	doc, entries := parsePlainTextDocument(stripBOM(content))
	ctx := plainTextEntryContext(doc)
	return entries, ctx, nil
}

func parsePlainTextDocument(content []byte) (plainTextDocument, map[string]string) {
	s := string(content)
	doc := plainTextDocument{}
	entries := map[string]string{}
	if s == "" {
		return doc, entries
	}

	paragraphIndex := 0
	i := 0
	n := len(s)

	appendLiteral := func(text string) {
		if text == "" {
			return
		}
		doc.parts = append(doc.parts, plainTextPart{literal: text})
	}

	for i < n {
		litStart := i
		for i < n && isPlainTextBlankLineAt(s, i) {
			i = plainTextLineEndExclusive(s, i)
		}
		if i > litStart {
			appendLiteral(s[litStart:i])
		}
		if i >= n {
			break
		}

		paraStart := i
		for i < n {
			if i > paraStart && isPlainTextBlankLineAt(s, i) {
				break
			}
			i = plainTextLineEndExclusive(s, i)
		}
		paraText := s[paraStart:i]
		if strings.TrimSpace(paraText) == "" {
			appendLiteral(paraText)
			continue
		}
		body, terminator := splitPlainTextParagraphSuffix(paraText)
		if strings.TrimSpace(body) == "" {
			appendLiteral(paraText)
			continue
		}
		paragraphIndex++
		key := plainTextParagraphKey(paragraphIndex)
		doc.parts = append(doc.parts, plainTextPart{
			key:    key,
			source: body,
			path:   "paragraph",
		})
		entries[key] = body
		if terminator != "" {
			appendLiteral(terminator)
		}
	}

	return doc, entries
}

func (d plainTextDocument) render(values map[string]string) []byte {
	var b strings.Builder
	for _, part := range d.parts {
		if part.key == "" {
			b.WriteString(part.literal)
			continue
		}
		if v, ok := values[part.key]; ok {
			b.WriteString(v)
		} else {
			b.WriteString(part.source)
		}
	}
	return []byte(b.String())
}

func plainTextParagraphKey(index int) string {
	if index < 10 {
		return "txt.000" + strconv.Itoa(index)
	}
	if index < 100 {
		return "txt.00" + strconv.Itoa(index)
	}
	if index < 1000 {
		return "txt.0" + strconv.Itoa(index)
	}
	return "txt." + strconv.Itoa(index)
}

func isPlainTextBlankLineAt(s string, i int) bool {
	end := plainTextLineEndExclusive(s, i)
	line := s[i:end]
	if end < len(s) {
		line = strings.TrimSuffix(line, "\r\n")
		line = strings.TrimSuffix(line, "\n")
		line = strings.TrimSuffix(line, "\r")
	}
	return strings.TrimSpace(line) == ""
}

func splitPlainTextParagraphSuffix(paraText string) (body, terminator string) {
	if strings.HasSuffix(paraText, "\r\n") {
		return paraText[:len(paraText)-2], "\r\n"
	}
	if strings.HasSuffix(paraText, "\n") {
		return paraText[:len(paraText)-1], "\n"
	}
	if strings.HasSuffix(paraText, "\r") {
		return paraText[:len(paraText)-1], "\r"
	}
	return paraText, ""
}

func plainTextLineEndExclusive(s string, i int) int {
	j := i
	for j < len(s) {
		if s[j] == '\n' {
			return j + 1
		}
		if s[j] == '\r' {
			if j+1 < len(s) && s[j+1] == '\n' {
				return j + 2
			}
			return j + 1
		}
		j++
	}
	return len(s)
}

func plainTextEntryContext(doc plainTextDocument) map[string]string {
	if len(doc.parts) == 0 {
		return nil
	}
	ctx := make(map[string]string, len(doc.parts))
	for _, part := range doc.parts {
		if part.key == "" {
			continue
		}
		ctx[part.key] = "Plain text paragraph. Preserve line breaks inside the paragraph exactly."
	}
	return ctx
}

func parsedDocumentFromPlainText(doc plainTextDocument) ParsedDocument {
	out := ParsedDocument{
		Format: DocumentFormatPlainText,
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
		block := DocumentBlock{
			ID:          part.key,
			Path:        part.path,
			Fingerprint: markdownContentFingerprint(part.source),
			Kind:        DocumentBlockKindBody,
			Text:        part.source,
		}
		out.Blocks = append(out.Blocks, block)
		out.Parts = append(out.Parts, DocumentPart{BlockID: part.key})
	}
	return out
}

func IsPlainTextDocumentExtension(path string) bool {
	return strings.ToLower(filepath.Ext(strings.TrimSpace(path))) == ".txt"
}

func ParsePlainTextDocumentIR(content []byte) ParsedDocument {
	doc, _ := parsePlainTextDocument(stripBOM(content))
	return parsedDocumentFromPlainText(doc)
}

func plainTextIngestEntries(content []byte) map[string]IngestEntry {
	doc, _ := parsePlainTextDocument(stripBOM(content))
	return applyContextByKey(parsedDocumentFromPlainText(doc).ingestEntries(), plainTextEntryContext(doc))
}

func MarshalPlainText(template []byte, values map[string]string) []byte {
	doc, _ := parsePlainTextDocument(stripBOM(template))
	return doc.render(values)
}

func AlignPlainTextTargetToSource(sourceTemplate, targetTemplate []byte) map[string]string {
	sourceDoc, sourceEntries := parsePlainTextDocument(stripBOM(sourceTemplate))
	targetDoc, _ := parsePlainTextDocument(stripBOM(targetTemplate))

	sourceKeys := make([]string, 0, len(sourceEntries))
	for _, part := range sourceDoc.parts {
		if part.key == "" {
			continue
		}
		if _, ok := sourceEntries[part.key]; !ok {
			continue
		}
		sourceKeys = append(sourceKeys, part.key)
	}

	targetTexts := make([]string, 0, len(targetDoc.parts))
	for _, part := range targetDoc.parts {
		if part.key == "" {
			continue
		}
		targetTexts = append(targetTexts, part.source)
	}

	aligned := alignPlainTextParagraphKeys(sourceKeys, targetTexts, sourceEntries)
	for key := range sourceEntries {
		if _, ok := aligned[key]; !ok {
			aligned[key] = ""
		}
	}
	return aligned
}

func alignPlainTextParagraphKeys(sourceKeys []string, targetTexts []string, sourceEntries map[string]string) map[string]string {
	aligned := make(map[string]string, len(sourceKeys))
	if len(sourceKeys) == 0 || len(targetTexts) == 0 {
		return aligned
	}

	usedTarget := make([]bool, len(targetTexts))
	matchedSource := make([]bool, len(sourceKeys))
	for i, key := range sourceKeys {
		sourceText := sourceEntries[key]
		for j, text := range targetTexts {
			if usedTarget[j] || text != sourceText {
				continue
			}
			aligned[key] = text
			usedTarget[j] = true
			matchedSource[i] = true
			break
		}
	}

	remainingSource := make([]string, 0, len(sourceKeys))
	for i, key := range sourceKeys {
		if matchedSource[i] {
			continue
		}
		remainingSource = append(remainingSource, key)
	}
	remainingTarget := make([]string, 0, len(targetTexts))
	for j, text := range targetTexts {
		if usedTarget[j] {
			continue
		}
		remainingTarget = append(remainingTarget, text)
	}

	nS := len(remainingSource)
	nT := len(remainingTarget)
	if nS == 0 {
		return aligned
	}
	if nT == 0 {
		for _, key := range remainingSource {
			if _, ok := aligned[key]; !ok {
				aligned[key] = ""
			}
		}
		return aligned
	}
	if nS == nT {
		for i := range remainingSource {
			aligned[remainingSource[i]] = remainingTarget[i]
		}
		return aligned
	}

	aligned[remainingSource[0]] = remainingTarget[0]
	if nS > 1 && nT > 1 {
		aligned[remainingSource[nS-1]] = remainingTarget[nT-1]
	}
	for i := 1; i < nS-1; i++ {
		aligned[remainingSource[i]] = ""
	}
	return aligned
}
