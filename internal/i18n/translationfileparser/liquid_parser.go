package translationfileparser

import (
	"fmt"
	"strings"

	"github.com/osteele/liquid"
	"github.com/osteele/liquid/render"
)

// LiquidParser extracts static translation keys from Shopify Liquid templates.
type LiquidParser struct{}

// LiquidParseError wraps malformed Liquid input or recovered parser panics.
type LiquidParseError struct {
	FilePath    string
	Description string
	PanicValue  any
}

func (e *LiquidParseError) Error() string {
	if e == nil {
		return ""
	}
	filePath := e.FilePath
	if filePath == "" {
		filePath = unknownDiagnosticFilePath
	}
	return fmt.Sprintf("liquid parse %q: %s", filePath, e.Description)
}

func (e *LiquidParseError) Unwrap() error {
	return nil
}

func (p LiquidParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	if err != nil {
		return nil, err
	}

	return values, nil
}

func (p LiquidParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	return p.ParseWithDiagnostics(content, nil)
}

func (p LiquidParser) ParseWithDiagnostics(content []byte, diags *[]Diagnostic) (map[string]string, map[string]string, error) {
	return parseLiquidTemplateWithDiagnostics(content, diags, parseLiquidTemplateLocation)
}

type liquidTemplateLocationParser func(content []byte, filePath string, lineNumber int) (*liquid.Template, error)

func parseLiquidTemplateLocation(content []byte, filePath string, lineNumber int) (*liquid.Template, error) {
	engine := liquid.NewEngine()
	return engine.ParseTemplateLocation(content, filePath, lineNumber)
}

func parseLiquidTemplateWithDiagnostics(content []byte, diags *[]Diagnostic, parse liquidTemplateLocationParser) (values map[string]string, contextByKey map[string]string, err error) {
	filePath := unknownDiagnosticFilePath
	defer func() {
		if recovered := recover(); recovered != nil {
			values = nil
			contextByKey = nil
			err = &LiquidParseError{
				FilePath:    filePath,
				Description: fmt.Sprintf("recovered panic while parsing Liquid template: %v", recovered),
				PanicValue:  recovered,
			}
		}
	}()

	template, err := parse(content, filePath, 1)
	if err != nil {
		return nil, nil, &LiquidParseError{
			FilePath:    filePath,
			Description: fmt.Sprintf("parse Liquid template: %v", err),
			PanicValue:  nil,
		}
	}

	values = map[string]string{}

	walkLiquidRenderNode(template.GetRoot(), values, diags)

	return values, nil, nil
}

func walkLiquidRenderNode(node render.Node, values map[string]string, diags *[]Diagnostic) {
	switch typed := node.(type) {
	case *render.SeqNode:
		for _, child := range typed.Children {
			walkLiquidRenderNode(child, values, diags)
		}
	case *render.BlockNode:
		for _, child := range typed.Body {
			walkLiquidRenderNode(child, values, diags)
		}
		for _, clause := range typed.Clauses {
			walkLiquidRenderNode(clause, values, diags)
		}
	case *render.ObjectNode:
		if key, ok := extractLiquidStaticKey(typed.SourceText()); ok {
			values[key] = key
			return
		}
		appendLiquidDynamicKeyDiagnostic(typed, diags)
	}
}

func extractLiquidStaticKey(sourceText string) (string, bool) {
	parts, ok := liquidObjectFilterParts(sourceText)
	if !ok || len(parts) < 2 || !liquidFiltersContainT(parts[1:]) {
		return "", false
	}

	return liquidStringLiteralValue(parts[0])
}

func appendLiquidDynamicKeyDiagnostic(node render.Node, diags *[]Diagnostic) {
	if diags == nil {
		return
	}

	parts, ok := liquidObjectFilterParts(node.SourceText())
	if !ok || len(parts) < 2 || !liquidFiltersContainT(parts[1:]) {
		return
	}
	if _, ok := liquidStringLiteralValue(parts[0]); ok {
		return
	}

	location := node.SourceLocation()
	filePath := location.Pathname
	if filePath == "" {
		filePath = unknownDiagnosticFilePath
	}
	lineNumber := location.LineNo
	if lineNumber <= 0 {
		lineNumber = 1
	}

	*diags = append(*diags, Diagnostic{
		Code:       LiquidDynamicKeyDiagnosticCode,
		FilePath:   filePath,
		LineNumber: lineNumber,
		Hint:       DefaultDiagnosticHint(LiquidDynamicKeyDiagnosticCode),
	})
}

func liquidObjectFilterParts(sourceText string) ([]string, bool) {
	trimmed := strings.TrimSpace(sourceText)
	if !strings.HasPrefix(trimmed, "{{") || !strings.HasSuffix(trimmed, "}}") {
		return nil, false
	}

	expression := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(trimmed, "{{"), "}}"))
	expression = strings.TrimSpace(strings.TrimPrefix(expression, "-"))
	expression = strings.TrimSpace(strings.TrimSuffix(expression, "-"))
	parts := splitLiquidFilterExpression(expression)
	if len(parts) == 0 {
		return nil, false
	}

	return parts, true
}

func splitLiquidFilterExpression(expression string) []string {
	parts := []string{}
	var current strings.Builder
	var quote rune
	escaped := false

	for _, char := range expression {
		if quote != 0 {
			current.WriteRune(char)
			if escaped {
				escaped = false
				continue
			}
			if char == '\\' {
				escaped = true
				continue
			}
			if char == quote {
				quote = 0
			}
			continue
		}

		switch char {
		case '\'', '"':
			quote = char
			current.WriteRune(char)
		case '|':
			parts = append(parts, strings.TrimSpace(current.String()))
			current.Reset()
		default:
			current.WriteRune(char)
		}
	}

	parts = append(parts, strings.TrimSpace(current.String()))
	return parts
}

func liquidStringLiteralValue(expression string) (string, bool) {
	trimmed := strings.TrimSpace(expression)
	if len(trimmed) < 2 {
		return "", false
	}

	quote := trimmed[0]
	if (quote != '\'' && quote != '"') || trimmed[len(trimmed)-1] != quote {
		return "", false
	}

	return trimmed[1 : len(trimmed)-1], true
}

func liquidFiltersContainT(filters []string) bool {
	for _, rawFilter := range filters {
		filter := strings.TrimSpace(rawFilter)
		if filter == "" {
			continue
		}

		name, _, _ := strings.Cut(filter, ":")
		if strings.TrimSpace(name) == "t" {
			return true
		}
	}

	return false
}
