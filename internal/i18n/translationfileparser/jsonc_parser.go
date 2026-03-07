package translationfileparser

import "github.com/tidwall/jsonc"

// JSONCParser parses JSONC translation files by stripping comments/trailing commas
// before delegating to the JSON parser logic.
type JSONCParser struct{}

func (p JSONCParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	if err != nil {
		return nil, err
	}
	return values, nil
}

func (p JSONCParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	return (JSONParser{}).ParseWithContext(jsonc.ToJSON(content))
}
