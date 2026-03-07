package translationfileparser

import "github.com/tidwall/jsonc"

// JSONCParser parses translation JSONC files.
type JSONCParser struct{}

func (p JSONCParser) Parse(content []byte) (map[string]string, error) {
	return (JSONParser{}).Parse(jsonc.ToJSON(content))
}
