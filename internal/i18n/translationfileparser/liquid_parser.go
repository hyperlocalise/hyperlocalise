package translationfileparser

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"html"
	"regexp"
	"slices"
	"strings"
)

const unknownLiquidFilePath = "<unknown>"

// LiquidParser parses Liquid templates into translatable visible text segments.
// Liquid output and tag syntax is protected as internal placeholders so templates
// can be translated as files without translating Shopify locale keys.
type LiquidParser struct{}

func (p LiquidParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	if err != nil {
		return nil, err
	}

	return values, nil
}

func (p LiquidParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	return p.parseWithPath(unknownLiquidFilePath, content)
}

func (p LiquidParser) parseWithPath(filePath string, content []byte) (map[string]string, map[string]string, error) {
	if strings.TrimSpace(filePath) == "" {
		filePath = unknownLiquidFilePath
	}
	_, values, err := parseLiquidDocument(filePath, content)
	if err != nil {
		return nil, nil, err
	}

	return values, nil, nil
}

// LiquidParseError reports malformed Liquid delimiters or skipped blocks.
type LiquidParseError struct {
	FilePath string
	Offset   int
	Message  string
}

func (e *LiquidParseError) Error() string {
	filePath := e.FilePath
	if filePath == "" {
		filePath = unknownLiquidFilePath
	}
	if e.Offset >= 0 {
		return fmt.Sprintf("liquid parse %q at byte %d: %s", filePath, e.Offset, e.Message)
	}
	return fmt.Sprintf("liquid parse %q: %s", filePath, e.Message)
}

func (e *LiquidParseError) Unwrap() error {
	return nil
}

// LiquidRenderDiagnostics records keys that fell back to source text during render.
type LiquidRenderDiagnostics struct {
	SourceFallbackKeys []string
}

type liquidDocument struct {
	htmlDoc            htmlDocument
	liquidPlaceholders map[string]string
}

// MarshalLiquid reconstructs a Liquid template with translated values applied.
// Keys missing from values fall back to source text and are recorded for caller warnings.
func MarshalLiquid(template []byte, values map[string]string) ([]byte, LiquidRenderDiagnostics) {
	doc, _, err := parseLiquidDocument(unknownLiquidFilePath, template)
	if err != nil {
		return template, LiquidRenderDiagnostics{}
	}
	return doc.render(values)
}

// MarshalLiquidWithTargetFallback is like MarshalLiquid but also accepts an
// existing target file. For source keys absent from values, it recovers
// translations by structural position from the target file.
func MarshalLiquidWithTargetFallback(sourceTemplate, targetTemplate []byte, values map[string]string) ([]byte, LiquidRenderDiagnostics) {
	sourceDoc, _, err := parseLiquidDocument(unknownLiquidFilePath, sourceTemplate)
	if err != nil {
		return sourceTemplate, LiquidRenderDiagnostics{}
	}
	targetDoc, _, err := parseLiquidDocument(unknownLiquidFilePath, targetTemplate)
	if err != nil {
		return sourceDoc.render(values)
	}

	targetParts := make([]htmlPart, 0)
	for _, part := range targetDoc.htmlDoc.parts {
		if part.key != "" {
			targetParts = append(targetParts, part)
		}
	}

	merged := make(map[string]string, len(values)+len(targetParts))
	for key, value := range values {
		merged[key] = value
	}
	targetIndex := 0
	for _, part := range sourceDoc.htmlDoc.parts {
		if part.key == "" {
			continue
		}
		if _, ok := merged[part.key]; !ok && targetIndex < len(targetParts) {
			merged[part.key] = targetParts[targetIndex].source
		}
		targetIndex++
	}

	return sourceDoc.render(merged)
}

func parseLiquidDocument(filePath string, content []byte) (liquidDocument, map[string]string, error) {
	masked, liquidPlaceholders, err := maskLiquidSyntax(filePath, content)
	if err != nil {
		return liquidDocument{}, nil, err
	}

	htmlDoc, _, err := parseHTMLDocument(masked)
	if err != nil {
		return liquidDocument{}, nil, err
	}

	entries := map[string]string{}
	occurrences := map[string]int{}
	for i := range htmlDoc.parts {
		part := &htmlDoc.parts[i]
		if part.key == "" {
			continue
		}
		if !liquidPartHasTranslatableText(*part, liquidPlaceholders) {
			part.literal = renderLiquidSourcePart(*part, liquidPlaceholders)
			part.key = ""
			part.source = ""
			part.placeholders = nil
			part.isVoidAttr = false
			part.voidTagPrefix = ""
			part.voidTagSuffix = ""
			continue
		}
		key := liquidSegmentKey(part.source, occurrences)
		part.key = key
		entries[key] = part.source
	}

	return liquidDocument{
		htmlDoc:            htmlDoc,
		liquidPlaceholders: liquidPlaceholders,
	}, entries, nil
}

func maskLiquidSyntax(filePath string, content []byte) ([]byte, map[string]string, error) {
	input := string(content)
	placeholders := map[string]string{}
	var out strings.Builder
	inHTMLTag := false
	var htmlQuote byte

	for i := 0; i < len(input); {
		switch {
		case strings.HasPrefix(input[i:], "{{"):
			end, ok := findLiquidDelimiterEnd(input, i, "}}")
			if !ok {
				return nil, nil, &LiquidParseError{FilePath: filePath, Offset: i, Message: "unclosed liquid output delimiter"}
			}
			out.WriteString(appendLiquidPlaceholder(input[i:end], placeholders))
			i = end
		case strings.HasPrefix(input[i:], "{%"):
			end, ok := findLiquidDelimiterEnd(input, i, "%}")
			if !ok {
				return nil, nil, &LiquidParseError{FilePath: filePath, Offset: i, Message: "unclosed liquid tag delimiter"}
			}
			tag := input[i:end]
			tagName := liquidTagName(tag)
			if isLiquidSkippedBlockStart(tagName) {
				blockEnd, ok := findLiquidSkippedBlockEnd(input, end, tagName)
				if !ok {
					return nil, nil, &LiquidParseError{FilePath: filePath, Offset: i, Message: "unclosed liquid " + tagName + " block"}
				}
				out.WriteString(appendLiquidBoundaryPlaceholder(input[i:blockEnd], placeholders))
				i = blockEnd
				continue
			}
			if inHTMLTag {
				out.WriteString(appendLiquidPlaceholder(tag, placeholders))
			} else {
				out.WriteString(appendLiquidBoundaryPlaceholder(tag, placeholders))
			}
			i = end
		default:
			ch := input[i]
			out.WriteByte(ch)
			updateLiquidHTMLTagState(input, i, ch, &inHTMLTag, &htmlQuote)
			i++
		}
	}

	return []byte(out.String()), placeholders, nil
}

func appendLiquidPlaceholder(literal string, placeholders map[string]string) string {
	index := len(placeholders)
	token := liquidPlaceholderToken(index, literal)
	placeholders[token] = literal
	return token
}

func appendLiquidBoundaryPlaceholder(literal string, placeholders map[string]string) string {
	index := len(placeholders)
	token := liquidPlaceholderToken(index, literal)
	placeholder := "<!--" + token + "-->"
	placeholders[placeholder] = literal
	return placeholder
}

func liquidPlaceholderToken(index int, literal string) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("%d:%s", index, literal)))
	return fmt.Sprintf("\x1eHLLQPH_%s_%d\x1f", strings.ToUpper(hex.EncodeToString(sum[:])[:12]), index)
}

func updateLiquidHTMLTagState(input string, index int, ch byte, inHTMLTag *bool, htmlQuote *byte) {
	if !*inHTMLTag {
		if ch == '<' && isLikelyLiquidHTMLTagStart(input, index) {
			*inHTMLTag = true
			*htmlQuote = 0
		}
		return
	}

	if *htmlQuote != 0 {
		if ch == *htmlQuote {
			*htmlQuote = 0
		}
		return
	}

	switch ch {
	case '\'', '"':
		*htmlQuote = ch
	case '>':
		*inHTMLTag = false
	}
}

func isLikelyLiquidHTMLTagStart(input string, index int) bool {
	if index+1 >= len(input) {
		return false
	}
	next := input[index+1]
	return (next >= 'a' && next <= 'z') ||
		(next >= 'A' && next <= 'Z') ||
		next == '/' ||
		next == '!' ||
		next == '?'
}

func findLiquidDelimiterEnd(input string, start int, close string) (int, bool) {
	var quote byte
	escaped := false
	for i := start + 2; i+1 < len(input); i++ {
		ch := input[i]
		if quote != 0 {
			if escaped {
				escaped = false
				continue
			}
			if ch == '\\' {
				escaped = true
				continue
			}
			if ch == quote {
				quote = 0
			}
			continue
		}
		if ch == '\'' || ch == '"' {
			quote = ch
			continue
		}
		if input[i:i+2] == close {
			return i + 2, true
		}
	}
	return 0, false
}

func liquidTagName(tag string) string {
	inner := strings.TrimSpace(tag)
	inner = strings.TrimPrefix(inner, "{%")
	inner = strings.TrimSuffix(inner, "%}")
	inner = strings.TrimSpace(inner)
	inner = strings.TrimPrefix(inner, "-")
	inner = strings.TrimSuffix(inner, "-")
	inner = strings.TrimSpace(inner)
	if inner == "" {
		return ""
	}
	fields := strings.Fields(inner)
	if len(fields) == 0 {
		return ""
	}
	return strings.ToLower(fields[0])
}

func isLiquidSkippedBlockStart(tagName string) bool {
	switch tagName {
	case "raw", "comment", "schema", "javascript", "stylesheet":
		return true
	default:
		return false
	}
}

func findLiquidSkippedBlockEnd(input string, from int, tagName string) (int, bool) {
	endTagName := "end" + tagName
	pattern := regexp.MustCompile(`(?is)\{%-?\s*` + regexp.QuoteMeta(endTagName) + `\b.*?-?%\}`)
	loc := pattern.FindStringIndex(input[from:])
	if loc == nil {
		return 0, false
	}
	return from + loc[1], true
}

func liquidPartHasTranslatableText(part htmlPart, liquidPlaceholders map[string]string) bool {
	plain := part.source
	if part.isVoidAttr {
		plain = part.source
	}
	for placeholder := range part.placeholders {
		plain = strings.ReplaceAll(plain, placeholder, "")
	}
	for placeholder := range liquidPlaceholders {
		plain = strings.ReplaceAll(plain, placeholder, "")
	}
	return isTranslatableChunk(plain)
}

func renderLiquidSourcePart(part htmlPart, liquidPlaceholders map[string]string) string {
	if part.isVoidAttr {
		return expandLiquidPlaceholders(part.voidTagPrefix+html.EscapeString(part.source)+part.voidTagSuffix, liquidPlaceholders)
	}
	return expandLiquidPlaceholders(expandHTMLPlaceholders(part.source, part.placeholders), liquidPlaceholders)
}

func liquidSegmentKey(segment string, occurrences map[string]int) string {
	sum := sha256.Sum256([]byte(segment))
	hash := hex.EncodeToString(sum[:])[:16]
	count := occurrences[hash]
	occurrences[hash] = count + 1
	if count == 0 {
		return fmt.Sprintf("liquid.%s", hash)
	}
	return fmt.Sprintf("liquid.%s.%d", hash, count+1)
}

func (d liquidDocument) render(values map[string]string) ([]byte, LiquidRenderDiagnostics) {
	var diags LiquidRenderDiagnostics
	var b strings.Builder
	for _, part := range d.htmlDoc.parts {
		switch {
		case part.isVoidAttr:
			b.WriteString(d.renderVoidAttrPart(part, values, &diags))
		case part.key == "":
			b.WriteString(expandLiquidPlaceholders(part.literal, d.liquidPlaceholders))
		default:
			b.WriteString(d.renderTextPart(part, values, &diags))
		}
	}
	return []byte(b.String()), diags
}

func (d liquidDocument) renderVoidAttrPart(part htmlPart, values map[string]string, diags *LiquidRenderDiagnostics) string {
	translated, ok := values[part.key]
	if !ok {
		diags.SourceFallbackKeys = append(diags.SourceFallbackKeys, part.key)
		translated = part.source
	}
	rendered := preserveChunkBoundaryWhitespace(part.source, translated)
	if !liquidPlaceholdersPresent(part.source, rendered) {
		diags.SourceFallbackKeys = append(diags.SourceFallbackKeys, part.key)
		rendered = part.source
	}
	rendered = expandLiquidPlaceholders(rendered, d.liquidPlaceholders)
	return expandLiquidPlaceholders(part.voidTagPrefix+html.EscapeString(rendered)+part.voidTagSuffix, d.liquidPlaceholders)
}

func (d liquidDocument) renderTextPart(part htmlPart, values map[string]string, diags *LiquidRenderDiagnostics) string {
	translated, ok := values[part.key]
	if !ok {
		diags.SourceFallbackKeys = append(diags.SourceFallbackKeys, part.key)
		return renderLiquidSourcePart(part, d.liquidPlaceholders)
	}

	rendered := preserveChunkBoundaryWhitespace(part.source, translated)
	if !htmlPlaceholdersPresent(part, rendered) || !liquidPlaceholdersPresent(part.source, rendered) {
		diags.SourceFallbackKeys = append(diags.SourceFallbackKeys, part.key)
		return renderLiquidSourcePart(part, d.liquidPlaceholders)
	}

	rendered = expandHTMLPlaceholders(rendered, part.placeholders)
	rendered = expandLiquidPlaceholders(rendered, d.liquidPlaceholders)
	if strings.ContainsRune(rendered, '\x1e') || strings.ContainsRune(rendered, '\x1f') {
		diags.SourceFallbackKeys = append(diags.SourceFallbackKeys, part.key)
		return renderLiquidSourcePart(part, d.liquidPlaceholders)
	}
	return rendered
}

func htmlPlaceholdersPresent(part htmlPart, rendered string) bool {
	for placeholder := range part.placeholders {
		if !strings.Contains(rendered, placeholder) {
			return false
		}
	}
	return true
}

func liquidPlaceholdersPresent(source, rendered string) bool {
	for _, token := range liquidSyntaxPlaceholderTokens(source) {
		if !strings.Contains(rendered, token) {
			return false
		}
	}
	return true
}

func expandLiquidPlaceholders(rendered string, placeholders map[string]string) string {
	keys := make([]string, 0, len(placeholders))
	for placeholder := range placeholders {
		keys = append(keys, placeholder)
	}
	slices.SortFunc(keys, func(a, b string) int { return len(b) - len(a) })
	for _, placeholder := range keys {
		rendered = strings.ReplaceAll(rendered, placeholder, placeholders[placeholder])
	}
	return rendered
}

var liquidInternalPlaceholderPattern = regexp.MustCompile(`\x1eHL(?:LQ|HT)PH_[A-F0-9]{12}_[0-9]+\x1f`)

// LiquidInternalPlaceholderTokens returns sorted internal Liquid/HTML sentinel
// tokens found in s.
func LiquidInternalPlaceholderTokens(s string) []string {
	matches := liquidInternalPlaceholderPattern.FindAllString(s, -1)
	slices.Sort(matches)
	return matches
}

func liquidSyntaxPlaceholderTokens(s string) []string {
	tokens := LiquidInternalPlaceholderTokens(s)
	out := tokens[:0]
	for _, token := range tokens {
		if strings.Contains(token, "HLLQPH_") {
			out = append(out, token)
		}
	}
	return out
}

// ValidateLiquidInternalPlaceholders returns an error if internal Liquid/HTML
// placeholder tokens in translated differ from source.
func ValidateLiquidInternalPlaceholders(source, translated string) error {
	src := LiquidInternalPlaceholderTokens(source)
	tgt := LiquidInternalPlaceholderTokens(translated)
	if slices.Equal(src, tgt) {
		return nil
	}
	return fmt.Errorf("liquid internal placeholder mismatch: expected %d token(s), got %d (source tokens %v vs candidate %v)", len(src), len(tgt), src, tgt)
}
