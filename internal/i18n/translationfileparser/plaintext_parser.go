package translationfileparser

import (
	"fmt"
	"strings"
)

// PlainTextParser splits plain text into paragraph segments separated by blank lines.
type PlainTextParser struct{}

func (PlainTextParser) Parse(content []byte) (map[string]string, error) {
	text := strings.ReplaceAll(string(stripBOM(content)), "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	paragraphs := strings.Split(text, "\n\n")
	out := make(map[string]string, len(paragraphs))
	for index, paragraph := range paragraphs {
		trimmed := strings.TrimSpace(paragraph)
		if trimmed == "" {
			continue
		}
		key := fmt.Sprintf("txt.p%04d", index+1)
		out[key] = paragraph
	}
	return out, nil
}
