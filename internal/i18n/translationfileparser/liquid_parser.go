package translationfileparser

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"html"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode"
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
	htmlDoc        htmlDocument
	liquidReplacer *strings.Replacer
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
//
// Positional fallback is reliable when source and target share the same Liquid
// structure and translatable segment order. If the source template adds,
// removes, or reorders Liquid expressions, unmatched segments may fall back to
// source text when placeholder validation detects the drift.
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

	liquidReplacer := newLiquidReplacer(liquidPlaceholders)

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
		if !liquidPartHasTranslatableText(*part) {
			part.literal = renderLiquidSourcePart(*part, liquidReplacer)
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
		htmlDoc:        htmlDoc,
		liquidReplacer: liquidReplacer,
	}, entries, nil
}

func maskLiquidSyntax(filePath string, content []byte) ([]byte, map[string]string, error) {
	placeholders := map[string]string{}
	var out strings.Builder
	out.Grow(len(content))
	inHTMLTag := false
	var htmlQuote byte

	for i := 0; i < len(content); {
		switch {
		case bytes.HasPrefix(content[i:], []byte("{{")):
			end, ok := findLiquidDelimiterEnd(content, i, []byte("}}"))
			if !ok {
				return nil, nil, &LiquidParseError{FilePath: filePath, Offset: i, Message: "unclosed liquid output delimiter"}
			}
			out.WriteString(appendLiquidPlaceholder(string(content[i:end]), placeholders))
			i = end
		case bytes.HasPrefix(content[i:], []byte("{%")):
			end, ok := findLiquidDelimiterEnd(content, i, []byte("%}"))
			if !ok {
				return nil, nil, &LiquidParseError{FilePath: filePath, Offset: i, Message: "unclosed liquid tag delimiter"}
			}
			tag := content[i:end]
			tagName := liquidTagName(tag)
			if isLiquidSkippedBlockStart(tagName) {
				blockEnd, ok := findLiquidSkippedBlockEnd(content, end, tagName)
				if !ok {
					return nil, nil, &LiquidParseError{FilePath: filePath, Offset: i, Message: "unclosed liquid " + tagName + " block"}
				}
				out.WriteString(appendLiquidBoundaryPlaceholder(string(content[i:blockEnd]), placeholders))
				i = blockEnd
				continue
			}
			if inHTMLTag {
				out.WriteString(appendLiquidPlaceholder(string(tag), placeholders))
			} else {
				out.WriteString(appendLiquidBoundaryPlaceholder(string(tag), placeholders))
			}
			i = end
		default:
			ch := content[i]
			out.WriteByte(ch)
			updateLiquidHTMLTagState(content, i, ch, &inHTMLTag, &htmlQuote)
			i++

			// BOLT OPTIMIZATION: Use bytes.IndexAny to skip uninteresting literal text
			// and reduce loop iterations.
			if !inHTMLTag {
				next := bytes.IndexAny(content[i:], "{<")
				if next > 0 {
					out.Write(content[i : i+next])
					i += next
				} else if next == -1 {
					out.Write(content[i:])
					i = len(content)
				}
			}
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
	// BOLT OPTIMIZATION: Reduce allocations by using a stack buffer for hashing
	// (avoids heap for short literals) and manually encoding hex in uppercase
	// to avoid extra string operations.
	var buf [64]byte
	hInput := strconv.AppendInt(buf[:0], int64(index), 10)
	hInput = append(hInput, ':')
	hInput = append(hInput, literal...)
	sum := sha256.Sum256(hInput)

	var res strings.Builder
	res.Grow(32)
	res.WriteString("\x1eHLLQPH_")
	for i := 0; i < 6; i++ {
		b := sum[i]
		res.WriteByte(upperHexTable[b>>4])
		res.WriteByte(upperHexTable[b&0x0f])
	}
	res.WriteByte('_')
	res.WriteString(strconv.Itoa(index))
	res.WriteByte('\x1f')
	return res.String()
}

const upperHexTable = "0123456789ABCDEF"

func updateLiquidHTMLTagState(input []byte, index int, ch byte, inHTMLTag *bool, htmlQuote *byte) {
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

func isLikelyLiquidHTMLTagStart(input []byte, index int) bool {
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

func findLiquidDelimiterEnd(input []byte, start int, close []byte) (int, bool) {
	// BOLT OPTIMIZATION: Use bytes.HasPrefix to operate directly on []byte
	// without string conversion.
	if len(input[start:]) < 2 {
		return 0, false
	}

	var quote byte
	escaped := false
	for i := start + 2; i+len(close)-1 < len(input); i++ {
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
		if bytes.HasPrefix(input[i:], close) {
			return i + len(close), true
		}
	}
	return 0, false
}

func liquidTagName(tag []byte) string {
	// BOLT OPTIMIZATION: Avoid multiple strings.Trim* and strings.Fields calls
	// by manually scanning for the tag name in the []byte.
	s := tag
	if bytes.HasPrefix(s, []byte("{%")) {
		s = s[2:]
	}
	if bytes.HasSuffix(s, []byte("%}")) {
		s = s[:len(s)-2]
	}
	s = bytes.Trim(s, " \t\n\r-")

	if len(s) == 0 {
		return ""
	}

	// Find the first word
	end := 0
	for end < len(s) && !isSpace(s[end]) {
		end++
	}

	return strings.ToLower(string(s[:end]))
}

func isSpace(b byte) bool {
	return b == ' ' || b == '\t' || b == '\n' || b == '\r'
}

func isLiquidSkippedBlockStart(tagName string) bool {
	switch tagName {
	case "raw", "comment", "schema", "javascript", "stylesheet":
		return true
	default:
		return false
	}
}

var liquidSkippedBlockEndPatterns = map[string]*regexp.Regexp{
	"raw":        regexp.MustCompile(`(?is)\{%-?\s*endraw\b.*?-?%\}`),
	"comment":    regexp.MustCompile(`(?is)\{%-?\s*endcomment\b.*?-?%\}`),
	"schema":     regexp.MustCompile(`(?is)\{%-?\s*endschema\b.*?-?%\}`),
	"javascript": regexp.MustCompile(`(?is)\{%-?\s*endjavascript\b.*?-?%\}`),
	"stylesheet": regexp.MustCompile(`(?is)\{%-?\s*endstylesheet\b.*?-?%\}`),
}

func findLiquidSkippedBlockEnd(input []byte, from int, tagName string) (int, bool) {
	pattern, ok := liquidSkippedBlockEndPatterns[tagName]
	if !ok {
		return 0, false
	}
	// BOLT OPTIMIZATION: Use FindIndex on []byte to avoid string conversion.
	loc := pattern.FindIndex(input[from:])
	if loc == nil {
		return 0, false
	}
	return from + loc[1], true
}

func liquidPartHasTranslatableText(part htmlPart) bool {
	// Optimization: instead of removing each placeholder via strings.ReplaceAll in a loop
	// (which causes O(N*M) allocations), we skip any text between sentinel delimiters.
	inPlaceholder := false
	for _, r := range part.source {
		if r == '\x1e' {
			inPlaceholder = true
			continue
		}
		if r == '\x1f' {
			inPlaceholder = false
			continue
		}
		if !inPlaceholder {
			if unicode.IsLetter(r) || unicode.IsDigit(r) {
				return true
			}
		}
	}
	return false
}

func renderLiquidSourcePart(part htmlPart, liquidReplacer *strings.Replacer) string {
	if part.isVoidAttr {
		return expandLiquidPlaceholders(part.voidTagPrefix+html.EscapeString(part.source)+part.voidTagSuffix, liquidReplacer)
	}
	return expandLiquidPlaceholders(expandHTMLPlaceholders(part.source, part.placeholders), liquidReplacer)
}

func liquidSegmentKey(segment string, occurrences map[string]int) string {
	sum := sha256.Sum256([]byte(segment))
	// BOLT OPTIMIZATION: Encode only the first 8 bytes of the hash to produce
	// the required 16-character hex string, reducing encoding overhead.
	hash := hex.EncodeToString(sum[:8])
	count := occurrences[hash]
	occurrences[hash] = count + 1
	if count == 0 {
		// BOLT OPTIMIZATION: Use string concatenation and strconv.Itoa instead of fmt.Sprintf
		return "liquid." + hash
	}
	return "liquid." + hash + "." + strconv.Itoa(count+1)
}

func (d liquidDocument) render(values map[string]string) ([]byte, LiquidRenderDiagnostics) {
	var diags LiquidRenderDiagnostics
	var b strings.Builder
	for _, part := range d.htmlDoc.parts {
		switch {
		case part.isVoidAttr:
			b.WriteString(d.renderVoidAttrPart(part, values, &diags))
		case part.key == "":
			b.WriteString(expandLiquidPlaceholders(part.literal, d.liquidReplacer))
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
	return expandLiquidPlaceholders(part.voidTagPrefix+html.EscapeString(rendered)+part.voidTagSuffix, d.liquidReplacer)
}

func (d liquidDocument) renderTextPart(part htmlPart, values map[string]string, diags *LiquidRenderDiagnostics) string {
	translated, ok := values[part.key]
	if !ok {
		diags.SourceFallbackKeys = append(diags.SourceFallbackKeys, part.key)
		return renderLiquidSourcePart(part, d.liquidReplacer)
	}

	rendered := preserveChunkBoundaryWhitespace(part.source, translated)
	// Ensure every placeholder survived translation and no new raw HTML syntax
	// was introduced (to prevent XSS).
	if !htmlPlaceholdersPresent(part, rendered) || !liquidPlaceholdersPresent(part.source, rendered) || IntroducesRawHTMLSyntax(part.sourceSyntaxCount, rendered) {
		diags.SourceFallbackKeys = append(diags.SourceFallbackKeys, part.key)
		return renderLiquidSourcePart(part, d.liquidReplacer)
	}

	rendered = expandHTMLPlaceholders(rendered, part.placeholders)
	rendered = expandLiquidPlaceholders(rendered, d.liquidReplacer)
	if strings.ContainsRune(rendered, '\x1e') || strings.ContainsRune(rendered, '\x1f') {
		diags.SourceFallbackKeys = append(diags.SourceFallbackKeys, part.key)
		return renderLiquidSourcePart(part, d.liquidReplacer)
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

func expandLiquidPlaceholders(rendered string, replacer *strings.Replacer) string {
	if replacer == nil {
		return rendered
	}
	return replacer.Replace(rendered)
}

func newLiquidReplacer(placeholders map[string]string) *strings.Replacer {
	if len(placeholders) == 0 {
		return nil
	}

	// BOLT OPTIMIZATION: Sentinel tokens (\x1eHLLQPH_..._\x1f) have fixed length
	// and do not collide, and strings.Replacer internally handles overlapping
	// matches by preferring the longest match at any position, so sorting keys
	// by length is unnecessary.
	oldnew := make([]string, 0, len(placeholders)*2)
	for placeholder, original := range placeholders {
		oldnew = append(oldnew, placeholder, original)
	}
	return strings.NewReplacer(oldnew...)
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
