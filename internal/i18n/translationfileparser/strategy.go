package translationfileparser

import (
	"fmt"
	"path/filepath"
	"strings"
)

const (
	hexDigits      = "0123456789ABCDEF"
	hexDigitsLower = "0123456789abcdef"
)

// Parser parses translation file content into key/value pairs.
type Parser interface {
	Parse(content []byte) (map[string]string, error)
}

// ContextParser optionally returns per-entry context that can be used to enrich prompts.
// The returned map key must match message keys from Parse.
type ContextParser interface {
	ParseWithContext(content []byte) (map[string]string, map[string]string, error)
}

type pathAwareParser interface {
	parseWithPath(path string, content []byte) (map[string]string, map[string]string, error)
}

// Strategy selects a parser based on file extension.
type Strategy struct {
	parsersByExt map[string]Parser
}

// NewDefaultStrategy returns a strategy preconfigured for supported locale file formats.
func NewDefaultStrategy() *Strategy {
	// BOLT OPTIMIZATION: Use a pre-allocated map to avoid re-allocations
	// during initialization. We use assignments for static extensions and
	// a loop for JSTSLocaleModuleExts to maintain correctness and DRY.
	parsers := make(map[string]Parser, 22+len(JSTSLocaleModuleExts))
	parsers[".json"] = JSONParser{}
	parsers[".jsonc"] = JSONCParser{}
	parsers[".yaml"] = YAMLParser{}
	parsers[".yml"] = YAMLParser{}
	parsers[".arb"] = ARBParser{}
	parsers[".xlf"] = XLIFFParser{}
	parsers[".xlif"] = XLIFFParser{}
	parsers[".xliff"] = XLIFFParser{}
	parsers[".po"] = POFileParser{}
	parsers[".html"] = HTMLParser{}
	parsers[".liquid"] = LiquidParser{}
	parsers[".md"] = MarkdownParser{MDX: false}
	parsers[".mdx"] = MarkdownParser{MDX: true}
	parsers[".strings"] = AppleStringsParser{}
	parsers[".stringsdict"] = AppleStringsdictParser{}
	parsers[".xcstrings"] = XCStringsParser{}
	parsers[".csv"] = CSVParser{}
	parsers[".php"] = PHPArrayParser{}
	parsers[".ftl"] = FluentParser{}
	parsers[".xml"] = XMLParser{}
	parsers[".resx"] = GenericXMLParser{}
	parsers[".properties"] = JavaPropertiesParser{}

	for _, ext := range JSTSLocaleModuleExts {
		parsers[ext] = JSTSLocaleModuleParser{}
	}

	return &Strategy{parsersByExt: parsers}
}

// XMLParser routes Android string resource XML files to the Android-specific
// parser and all other .xml files to the generic XML locale parser.
type XMLParser struct{}

func (p XMLParser) Parse(content []byte) (map[string]string, error) {
	return GenericXMLParser{}.Parse(content)
}

func (p XMLParser) parseWithPath(path string, content []byte) (map[string]string, map[string]string, error) {
	if IsAndroidStringResourcePath(path) {
		return AndroidXMLResourcesParser{}.parseWithPath(path, content)
	}
	values, err := GenericXMLParser{}.Parse(content)
	return values, nil, err
}

// Register binds a parser to a file extension.
func (s *Strategy) Register(ext string, parser Parser) {
	if s.parsersByExt == nil {
		s.parsersByExt = map[string]Parser{}
	}

	normalizedExt := strings.ToLower(strings.TrimSpace(ext))
	if normalizedExt == "" {
		return
	}
	if !strings.HasPrefix(normalizedExt, ".") {
		normalizedExt = "." + normalizedExt
	}

	s.parsersByExt[normalizedExt] = parser
}

// Parse resolves a parser from the file path extension and parses content.
func (s *Strategy) Parse(path string, content []byte) (map[string]string, error) {
	values, _, err := s.ParseWithContext(path, content)
	if err != nil {
		return nil, err
	}

	return values, nil
}

// ParseWithLocale parses content for a specific target locale when the format
// stores multiple locales in one file (for example Apple .xcstrings catalogs or
// multi-column CSV files). For other formats, locale is ignored and Parse is used.
func (s *Strategy) ParseWithLocale(path string, content []byte, locale string) (map[string]string, error) {
	locale = strings.TrimSpace(locale)
	ext := strings.ToLower(filepath.Ext(strings.TrimSpace(path)))
	if locale == "" {
		return s.Parse(path, content)
	}
	if ext == ".xcstrings" {
		values, err := ParseXCStringsLocale(content, locale)
		if err != nil {
			return nil, fmt.Errorf("translation file parser: parse %q: %w", path, err)
		}
		return values, nil
	}
	if ext == ".csv" {
		values, err := ParseCSVLocale(content, locale)
		if err != nil {
			return nil, fmt.Errorf("translation file parser: parse %q: %w", path, err)
		}
		return values, nil
	}

	return s.Parse(path, content)
}

// ParseWithContext resolves a parser from the file path extension and parses content.
// Some parser implementations may return additional per-entry context (for example,
// FormatJS/ARB descriptions).
func (s *Strategy) ParseWithContext(path string, content []byte) (map[string]string, map[string]string, error) {
	return s.parseWithContext(path, content)
}

func (s *Strategy) parseWithContext(path string, content []byte) (map[string]string, map[string]string, error) {
	ext := strings.ToLower(filepath.Ext(strings.TrimSpace(path)))
	if ext == "" {
		return nil, nil, fmt.Errorf("translation file parser: file %q has no extension", path)
	}

	parser, ok := s.parsersByExt[ext]
	if !ok {
		return nil, nil, fmt.Errorf("translation file parser: unsupported file extension %q", ext)
	}

	if pathParser, ok := parser.(pathAwareParser); ok {
		values, entryContext, err := pathParser.parseWithPath(path, content)
		if err != nil {
			return nil, nil, fmt.Errorf("translation file parser: parse %q: %w", path, err)
		}
		return values, entryContext, nil
	}

	if contextParser, ok := parser.(ContextParser); ok {
		values, entryContext, err := contextParser.ParseWithContext(content)
		if err != nil {
			return nil, nil, fmt.Errorf("translation file parser: parse %q: %w", path, err)
		}
		return values, entryContext, nil
	}

	values, err := parser.Parse(content)
	if err != nil {
		return nil, nil, fmt.Errorf("translation file parser: parse %q: %w", path, err)
	}

	return values, nil, nil
}
