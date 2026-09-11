package srx

import (
	"crypto/sha512"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	// TemplateDefault is the built-in general sentence-break ruleset.
	TemplateDefault = "default"
	// TemplateHTML is the built-in HTML-oriented ruleset.
	TemplateHTML = "html"
	// TemplateMarkdown is the built-in Markdown-oriented ruleset.
	TemplateMarkdown = "markdown"

	spanKeyInfix = "#srx."
)

// Document is a compiled SRX 2.0 ruleset.
type Document struct {
	languageRules []languageRule
	languageMaps  []languageMap
	fingerprint   string
}

type languageRule struct {
	name  string
	rules []rule
}

type languageMap struct {
	pattern *regexp.Regexp
	rule    string
}

type rule struct {
	breakAt bool
	before  *regexp.Regexp
	after   *regexp.Regexp
}

// Span is one contiguous slice of the source text.
type Span struct {
	Start int
	End   int
	Text  string
}

type srxXML struct {
	XMLName xml.Name `xml:"srx"`
	Body    srxBodyXML
}

type srxBodyXML struct {
	XMLName        xml.Name `xml:"body"`
	LanguageRules  []srxLanguageRuleXML
	LanguageMaps   []srxLanguageMapXML
}

func (b *srxBodyXML) UnmarshalXML(d *xml.Decoder, start xml.StartElement) error {
	for {
		tok, err := d.Token()
		if err != nil {
			return err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch localName(t.Name) {
			case "languagerules":
				if err := decodeLanguageRules(d, t, b); err != nil {
					return err
				}
			case "maprules":
				if err := decodeMapRules(d, t, b); err != nil {
					return err
				}
			default:
				if err := d.Skip(); err != nil {
					return err
				}
			}
		case xml.EndElement:
			if localName(t.Name) == localName(start.Name) {
				return nil
			}
		}
	}
}

type srxLanguageRuleXML struct {
	Name  string
	Rules []srxRuleXML
}

type srxRuleXML struct {
	Break  string
	Before string
	After  string
}

type srxLanguageMapXML struct {
	Pattern string
	Rule    string
}

func localName(name xml.Name) string {
	if name.Local != "" {
		return name.Local
	}
	return name.Space
}

func attrValue(attrs []xml.Attr, key string) string {
	for _, attr := range attrs {
		if localName(attr.Name) == key {
			return attr.Value
		}
	}
	return ""
}

func decodeLanguageRules(d *xml.Decoder, start xml.StartElement, body *srxBodyXML) error {
	for {
		tok, err := d.Token()
		if err != nil {
			return err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if localName(t.Name) != "languagerule" {
				if err := d.Skip(); err != nil {
					return err
				}
				continue
			}
			rule, err := decodeLanguageRule(d, t)
			if err != nil {
				return err
			}
			body.LanguageRules = append(body.LanguageRules, rule)
		case xml.EndElement:
			if localName(t.Name) == localName(start.Name) {
				return nil
			}
		}
	}
}

func decodeLanguageRule(d *xml.Decoder, start xml.StartElement) (srxLanguageRuleXML, error) {
	out := srxLanguageRuleXML{Name: strings.TrimSpace(attrValue(start.Attr, "languagename"))}
	for {
		tok, err := d.Token()
		if err != nil {
			return srxLanguageRuleXML{}, err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if localName(t.Name) != "rule" {
				if err := d.Skip(); err != nil {
					return srxLanguageRuleXML{}, err
				}
				continue
			}
			rule, err := decodeRule(d, t)
			if err != nil {
				return srxLanguageRuleXML{}, err
			}
			out.Rules = append(out.Rules, rule)
		case xml.EndElement:
			if localName(t.Name) == localName(start.Name) {
				return out, nil
			}
		}
	}
}

func decodeRule(d *xml.Decoder, start xml.StartElement) (srxRuleXML, error) {
	out := srxRuleXML{Break: strings.TrimSpace(attrValue(start.Attr, "break"))}
	for {
		tok, err := d.Token()
		if err != nil {
			return srxRuleXML{}, err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			name := localName(t.Name)
			text, err := decodeCharData(d, t)
			if err != nil {
				return srxRuleXML{}, err
			}
			switch name {
			case "beforebreak":
				out.Before = text
			case "afterbreak":
				out.After = text
			}
		case xml.EndElement:
			if localName(t.Name) == localName(start.Name) {
				return out, nil
			}
		}
	}
}

func decodeMapRules(d *xml.Decoder, start xml.StartElement, body *srxBodyXML) error {
	for {
		tok, err := d.Token()
		if err != nil {
			return err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if localName(t.Name) != "languagemap" {
				if err := d.Skip(); err != nil {
					return err
				}
				continue
			}
			body.LanguageMaps = append(body.LanguageMaps, srxLanguageMapXML{
				Pattern: attrValue(t.Attr, "languagepattern"),
				Rule:    attrValue(t.Attr, "languagerulename"),
			})
			if err := d.Skip(); err != nil {
				return err
			}
		case xml.EndElement:
			if localName(t.Name) == localName(start.Name) {
				return nil
			}
		}
	}
}

func decodeCharData(d *xml.Decoder, start xml.StartElement) (string, error) {
	var b strings.Builder
	for {
		tok, err := d.Token()
		if err != nil {
			return "", err
		}
		switch t := tok.(type) {
		case xml.CharData:
			b.Write(t)
		case xml.StartElement:
			if err := d.Skip(); err != nil {
				return "", err
			}
		case xml.EndElement:
			if localName(t.Name) == localName(start.Name) {
				return string(b.String()), nil
			}
		}
	}
}

// Parse compiles an SRX 2.0 document.
func Parse(data []byte) (*Document, error) {
	if len(strings.TrimSpace(string(data))) == 0 {
		return nil, fmt.Errorf("srx: empty document")
	}
	var raw srxXML
	if err := xml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("srx decode: %w", err)
	}
	if localName(raw.XMLName) != "srx" {
		return nil, fmt.Errorf("srx: root element must be srx")
	}
	if len(raw.Body.LanguageRules) == 0 {
		return nil, fmt.Errorf("srx: languagerules must not be empty")
	}

	doc := &Document{
		languageRules: make([]languageRule, 0, len(raw.Body.LanguageRules)),
		languageMaps:  make([]languageMap, 0, len(raw.Body.LanguageMaps)),
	}
	seen := make(map[string]struct{}, len(raw.Body.LanguageRules))
	for i, rawRule := range raw.Body.LanguageRules {
		name := strings.TrimSpace(rawRule.Name)
		if name == "" {
			return nil, fmt.Errorf("srx: languagerules[%d]: languagename is required", i)
		}
		if _, ok := seen[name]; ok {
			return nil, fmt.Errorf("srx: duplicate languagerule %q", name)
		}
		seen[name] = struct{}{}
		compiled := languageRule{name: name, rules: make([]rule, 0, len(rawRule.Rules))}
		for j, item := range rawRule.Rules {
			rule, err := compileRule(item, i, j)
			if err != nil {
				return nil, err
			}
			compiled.rules = append(compiled.rules, rule)
		}
		doc.languageRules = append(doc.languageRules, compiled)
	}
	for i, rawMap := range raw.Body.LanguageMaps {
		pattern := strings.TrimSpace(rawMap.Pattern)
		if pattern == "" {
			return nil, fmt.Errorf("srx: maprules[%d]: languagepattern is required", i)
		}
		re, err := regexp.Compile("(?i)" + pattern)
		if err != nil {
			return nil, fmt.Errorf("srx: maprules[%d]: invalid languagepattern: %w", i, err)
		}
		ruleName := strings.TrimSpace(rawMap.Rule)
		if ruleName == "" {
			return nil, fmt.Errorf("srx: maprules[%d]: languagerulename is required", i)
		}
		if _, ok := seen[ruleName]; !ok {
			return nil, fmt.Errorf("srx: maprules[%d]: unknown languagerulename %q", i, ruleName)
		}
		doc.languageMaps = append(doc.languageMaps, languageMap{pattern: re, rule: ruleName})
	}
	doc.fingerprint = fingerprintDocument(data)
	return doc, nil
}

func compileRule(raw srxRuleXML, languageIdx, ruleIdx int) (rule, error) {
	breakAt := true
	switch strings.ToLower(strings.TrimSpace(raw.Break)) {
	case "", "yes":
		breakAt = true
	case "no":
		breakAt = false
	default:
		return rule{}, fmt.Errorf("srx: languagerules[%d].rules[%d]: invalid break %q", languageIdx, ruleIdx, raw.Break)
	}
	before := strings.TrimSpace(raw.Before)
	after := strings.TrimSpace(raw.After)
	if before == "" && after == "" {
		return rule{}, fmt.Errorf("srx: languagerules[%d].rules[%d]: beforebreak or afterbreak is required", languageIdx, ruleIdx)
	}
	out := rule{breakAt: breakAt}
	if before != "" {
		re, err := regexp.Compile(before)
		if err != nil {
			return rule{}, fmt.Errorf("srx: languagerules[%d].rules[%d]: invalid beforebreak: %w", languageIdx, ruleIdx, err)
		}
		out.before = re
	}
	if after != "" {
		re, err := regexp.Compile(after)
		if err != nil {
			return rule{}, fmt.Errorf("srx: languagerules[%d].rules[%d]: invalid afterbreak: %w", languageIdx, ruleIdx, err)
		}
		out.after = re
	}
	return out, nil
}

func fingerprintDocument(data []byte) string {
	sum := sha512.Sum512(data)
	return hex.EncodeToString(sum[:16])
}

// Fingerprint returns a stable hash of the compiled source document.
func (d *Document) Fingerprint() string {
	if d == nil {
		return ""
	}
	return d.fingerprint
}

// Segment splits text using the language-matched SRX rules.
func (d *Document) Segment(text, language string) []Span {
	if d == nil || text == "" {
		if text == "" {
			return nil
		}
		return []Span{{Start: 0, End: len(text), Text: text}}
	}
	rules := d.rulesForLanguage(language)
	if len(rules) == 0 {
		return []Span{{Start: 0, End: len(text), Text: text}}
	}

	type hit struct {
		pos       int
		ruleIndex int
		breakAt   bool
	}
	hits := make([]hit, 0, 8)
	for ruleIdx, item := range rules {
		positions := matchBreakPositions(text, item)
		for _, pos := range positions {
			hits = append(hits, hit{pos: pos, ruleIndex: ruleIdx, breakAt: item.breakAt})
		}
	}
	if len(hits) == 0 {
		return []Span{{Start: 0, End: len(text), Text: text}}
	}
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].pos != hits[j].pos {
			return hits[i].pos < hits[j].pos
		}
		return hits[i].ruleIndex < hits[j].ruleIndex
	})

	chosen := make(map[int]bool, len(hits))
	for _, item := range hits {
		if _, ok := chosen[item.pos]; ok {
			continue
		}
		chosen[item.pos] = item.breakAt
	}
	positions := make([]int, 0, len(chosen))
	for pos, brk := range chosen {
		if brk && pos > 0 && pos < len(text) {
			positions = append(positions, pos)
		}
	}
	sort.Ints(positions)

	spans := make([]Span, 0, len(positions)+1)
	start := 0
	for _, pos := range positions {
		if pos <= start {
			continue
		}
		spans = append(spans, Span{Start: start, End: pos, Text: text[start:pos]})
		start = pos
	}
	if start < len(text) {
		spans = append(spans, Span{Start: start, End: len(text), Text: text[start:]})
	}
	if len(spans) == 0 {
		return []Span{{Start: 0, End: len(text), Text: text}}
	}
	return spans
}

func matchBreakPositions(text string, item rule) []int {
	if item.before == nil && item.after == nil {
		return nil
	}
	if item.before == nil {
		locs := item.after.FindAllStringIndex(text, -1)
		out := make([]int, 0, len(locs))
		for _, loc := range locs {
			if loc[0] > 0 {
				out = append(out, loc[0])
			}
		}
		return out
	}

	locs := item.before.FindAllStringIndex(text, -1)
	out := make([]int, 0, len(locs))
	for _, loc := range locs {
		end := loc[1]
		if end <= 0 || end > len(text) {
			continue
		}
		if item.after != nil {
			rest := text[end:]
			after := item.after.FindStringIndex(rest)
			if after == nil || after[0] != 0 {
				continue
			}
		}
		out = append(out, end)
	}
	return out
}

func (d *Document) rulesForLanguage(language string) []rule {
	normalized := normalizeLanguage(language)
	candidates := []string{normalized, language}
	if dash := strings.IndexAny(normalized, "-_"); dash > 0 {
		candidates = append(candidates, normalized[:dash])
	}
	for _, mapping := range d.languageMaps {
		for _, candidate := range candidates {
			if candidate == "" {
				continue
			}
			if mapping.pattern.MatchString(candidate) {
				return d.rulesNamed(mapping.rule)
			}
		}
	}
	if len(d.languageRules) == 1 {
		return d.languageRules[0].rules
	}
	for _, item := range d.languageRules {
		if strings.EqualFold(item.name, "Default") || strings.EqualFold(item.name, TemplateDefault) {
			return item.rules
		}
	}
	if len(d.languageRules) > 0 {
		return d.languageRules[0].rules
	}
	return nil
}

func (d *Document) rulesNamed(name string) []rule {
	for _, item := range d.languageRules {
		if item.name == name {
			return item.rules
		}
	}
	return nil
}

func normalizeLanguage(language string) string {
	trimmed := strings.TrimSpace(language)
	trimmed = strings.ReplaceAll(trimmed, "_", "-")
	return trimmed
}

// Join concatenates translations in span order and restores source leading whitespace
// when a translation trims it.
func Join(spans []Span, translations []string) string {
	if len(spans) == 0 {
		return ""
	}
	var b strings.Builder
	for i, span := range spans {
		translated := ""
		if i < len(translations) {
			translated = translations[i]
		}
		if translated == "" && span.Text != "" && (i >= len(translations) || translations[i] == "") {
			translated = span.Text
		}
		b.WriteString(restoreLeadingWhitespace(span.Text, translated))
	}
	return b.String()
}

func restoreLeadingWhitespace(source, translated string) string {
	lead := leadingWhitespace(source)
	if lead == "" || strings.HasPrefix(translated, lead) {
		return translated
	}
	trimmed := strings.TrimLeftFunc(translated, unicode.IsSpace)
	if trimmed == translated {
		return lead + translated
	}
	return lead + trimmed
}

func leadingWhitespace(text string) string {
	if text == "" {
		return ""
	}
	width := 0
	for width < len(text) {
		r, size := utf8.DecodeRuneInString(text[width:])
		if !unicode.IsSpace(r) {
			break
		}
		width += size
	}
	return text[:width]
}

// IsNamedTemplate reports whether spec is a built-in SRX template name.
func IsNamedTemplate(spec string) bool {
	switch strings.ToLower(strings.TrimSpace(spec)) {
	case TemplateDefault, TemplateHTML, TemplateMarkdown:
		return true
	default:
		return false
	}
}

// SpanKey builds a stable per-span entry key from a parser file key.
func SpanKey(fileKey string, index int) string {
	return fileKey + spanKeyInfix + strconv.Itoa(index)
}

// SplitSpanKey extracts the original file key and span index.
func SplitSpanKey(entryKey string) (fileKey string, index int, ok bool) {
	idx := strings.LastIndex(entryKey, spanKeyInfix)
	if idx <= 0 {
		return "", 0, false
	}
	suffix := entryKey[idx+len(spanKeyInfix):]
	if suffix == "" {
		return "", 0, false
	}
	parsed, err := strconv.Atoi(suffix)
	if err != nil || parsed < 0 {
		return "", 0, false
	}
	return entryKey[:idx], parsed, true
}

// FileKey returns the original parser key for a possibly segmented entry key.
func FileKey(entryKey string) string {
	if fileKey, _, ok := SplitSpanKey(entryKey); ok {
		return fileKey
	}
	return entryKey
}
