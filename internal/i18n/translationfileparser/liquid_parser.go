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
	staticKeyPattern := regexp.MustCompile(`^\{\{\s*(?:'([^']+)'|"([^"]+)")\s*(\|.*?)\s*\}\}$`)

	walkLiquidRenderNode(template.GetRoot(), values, staticKeyPattern)

	return values, nil, nil
}

func walkLiquidRenderNode(node render.Node, values map[string]string, staticKeyPattern *regexp.Regexp) {
	switch typed := node.(type) {
	case *render.SeqNode:
		for _, child := range typed.Children {
			walkLiquidRenderNode(child, values, staticKeyPattern)
		}
	case *render.BlockNode:
		for _, child := range typed.Body {
			walkLiquidRenderNode(child, values, staticKeyPattern)
		}
		for _, clause := range typed.Clauses {
			walkLiquidRenderNode(clause, values, staticKeyPattern)
		}
	case *render.ObjectNode:
		extractLiquidStaticKey(typed.SourceText(), values, staticKeyPattern)
	}
}

func extractLiquidStaticKey(sourceText string, values map[string]string, staticKeyPattern *regexp.Regexp) {
	trimmed := strings.TrimSpace(sourceText)
	matches := staticKeyPattern.FindStringSubmatch(trimmed)
	if len(matches) != 4 || !liquidFilterChainContainsT(matches[3]) {
		return
	}

	if matches[1] != "" {
		values[matches[1]] = matches[1]
		return
	}
	values[matches[2]] = matches[2]
}

func liquidFilterChainContainsT(filterChain string) bool {
	for _, rawFilter := range strings.Split(filterChain, "|") {
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
