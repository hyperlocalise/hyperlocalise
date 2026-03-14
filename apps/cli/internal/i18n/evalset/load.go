package evalset

import (
	"bytes"
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Load parses and validates an evaluation dataset from path.
func Load(path string) (*Dataset, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("open evalset: %w", err)
	}

	decoder := yaml.NewDecoder(bytes.NewReader(content))
	decoder.KnownFields(true)

	var dataset Dataset
	if err := decoder.Decode(&dataset); err != nil {
		return nil, fmt.Errorf("decode evalset: %w", err)
	}

	if err := dataset.Validate(); err != nil {
		return nil, fmt.Errorf("validate evalset: %w", err)
	}

	return &dataset, nil
}
