package translationfileparser

import (
	"regexp"
	"strings"

	"github.com/osteele/liquid"
	"github.com/osteele/liquid/render"
)

// LiquidParser extracts static translation keys from Shopify Liquid templates.
type LiquidParser struct{}

func (p LiquidParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	if err != nil {
		return nil, err
	}

	return values, nil
}

func (p LiquidParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	engine := liquid.NewEngine()
	template, err := engine.ParseTemplate(content)
	if err != nil {
		return nil, nil, err
	}

	values := map[string]string{}
	singleQuotedPattern := regexp.MustCompile(`^\{\{\s*'([^']+)'\s*\|\s*t\s*\}\}$`)
	doubleQuotedPattern := regexp.MustCompile(`^\{\{\s*"([^"]+)"\s*\|\s*t\s*\}\}$`)

	walkLiquidRenderNode(template.GetRoot(), values, singleQuotedPattern, doubleQuotedPattern)

	return values, nil, nil
}

func walkLiquidRenderNode(node render.Node, values map[string]string, singleQuotedPattern, doubleQuotedPattern *regexp.Regexp) {
	switch typed := node.(type) {
	case *render.SeqNode:
		for _, child := range typed.Children {
			walkLiquidRenderNode(child, values, singleQuotedPattern, doubleQuotedPattern)
		}
	case *render.BlockNode:
		for _, child := range typed.Body {
			walkLiquidRenderNode(child, values, singleQuotedPattern, doubleQuotedPattern)
		}
		for _, clause := range typed.Clauses {
			walkLiquidRenderNode(clause, values, singleQuotedPattern, doubleQuotedPattern)
		}
	case *render.ObjectNode:
		extractLiquidStaticKey(typed.SourceText(), values, singleQuotedPattern, doubleQuotedPattern)
	}
}

func extractLiquidStaticKey(sourceText string, values map[string]string, singleQuotedPattern, doubleQuotedPattern *regexp.Regexp) {
	trimmed := strings.TrimSpace(sourceText)

	if matches := singleQuotedPattern.FindStringSubmatch(trimmed); len(matches) == 2 {
		values[matches[1]] = matches[1]
		return
	}
	if matches := doubleQuotedPattern.FindStringSubmatch(trimmed); len(matches) == 2 {
		values[matches[1]] = matches[1]
	}
}
