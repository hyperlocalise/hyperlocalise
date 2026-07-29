package translationfileparser

import (
	"errors"
	"strings"
	"testing"
)

type mockCustomParser struct{}

func (m mockCustomParser) Parse(content []byte) (map[string]string, error) {
	if string(content) == "invalid" {
		return nil, errors.New("invalid content")
	}
	return map[string]string{"custom_key": string(content)}, nil
}

func TestStrategyRegisterAndNormalization(t *testing.T) {
	tests := []struct {
		name      string
		ext       string
		parsedExt string
	}{
		{
			name:      "already normalized",
			ext:       ".custom",
			parsedExt: ".custom",
		},
		{
			name:      "missing leading dot",
			ext:       "custom",
			parsedExt: ".custom",
		},
		{
			name:      "uppercase with missing dot",
			ext:       "CUSTOM",
			parsedExt: ".custom",
		},
		{
			name:      "whitespace in extension with dot",
			ext:       "  .CUSTOM  ",
			parsedExt: ".custom",
		},
		{
			name:      "whitespace in extension without dot",
			ext:       "  CUSTOM  ",
			parsedExt: ".custom",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &Strategy{} // starts with nil parsersByExt
			s.Register(tt.ext, mockCustomParser{})

			// Check normalization inside strategy map
			parser, ok := s.parsersByExt[tt.parsedExt]
			if !ok {
				t.Fatalf("expected parser to be registered under normalized extension %q", tt.parsedExt)
			}

			if _, ok := parser.(mockCustomParser); !ok {
				t.Fatalf("expected mockCustomParser, got %T", parser)
			}

			// Construct a valid filename that ends with a dot followed by the extension
			cleanExt := strings.TrimPrefix(strings.TrimSpace(tt.ext), ".")
			filename := "file." + cleanExt

			// Verify it resolves and parses correctly through Strategy.Parse
			got, err := s.Parse(filename, []byte("hello-scout"))
			if err != nil {
				t.Fatalf("Parse() error = %v", err)
			}
			if got["custom_key"] != "hello-scout" {
				t.Fatalf("expected custom_key = %q, got %q", "hello-scout", got["custom_key"])
			}
		})
	}
}

func TestStrategyRegisterIgnoresEmptyExtension(t *testing.T) {
	s := &Strategy{}
	s.Register("  ", mockCustomParser{})
	s.Register("", mockCustomParser{})

	if len(s.parsersByExt) != 0 {
		t.Fatalf("expected parsersByExt to remain empty, got length %d", len(s.parsersByExt))
	}
}

func TestStrategyRegisterOverwritesDefaultParser(t *testing.T) {
	s := NewDefaultStrategy()
	// Default .json parser is JSONParser. Overwrite it.
	s.Register("json", mockCustomParser{})

	got, err := s.Parse("file.json", []byte("hello-scout"))
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if got["custom_key"] != "hello-scout" {
		t.Fatalf("expected custom_key = %q, got %q", "hello-scout", got["custom_key"])
	}
}
