package translationfileparser

import "github.com/osteele/liquid"

// LiquidParser is the bootstrap parser for Shopify Liquid templates.
//
// Story 1.1 only establishes the parser shape and registration. Real key
// extraction lands in later stories.
type LiquidParser struct{}

func (p LiquidParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	if err != nil {
		return nil, err
	}

	return values, nil
}

func (p LiquidParser) ParseWithContext(_ []byte) (map[string]string, map[string]string, error) {
	_ = liquid.NewEngine

	return map[string]string{}, nil, nil
}
