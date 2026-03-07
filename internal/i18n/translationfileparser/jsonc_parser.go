package translationfileparser

import "github.com/tidwall/jsonc"

// JSONCParser parses translation JSONC files.
type JSONCParser struct {
	JSONParser
}

func (p JSONCParser) Parse(content []byte) (map[string]string, error) {
	return p.JSONParser.Parse(jsonc.ToJSON(content))
}
