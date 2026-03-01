package evalset

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/tidwall/jsonc"
)

// Load parses and validates an evaluation dataset from path.
func Load(path string) (*Dataset, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("open evalset: %w", err)
	}

	decoder := json.NewDecoder(bytes.NewReader(jsonc.ToJSON(content)))
	decoder.DisallowUnknownFields()

	var dataset Dataset
	if err := decoder.Decode(&dataset); err != nil {
		return nil, fmt.Errorf("decode evalset: %w", err)
	}

	if err := expectEOF(decoder); err != nil {
		return nil, err
	}

	if err := dataset.Validate(); err != nil {
		return nil, fmt.Errorf("validate evalset: %w", err)
	}

	return &dataset, nil
}

func expectEOF(decoder *json.Decoder) error {
	var extra json.RawMessage
	if err := decoder.Decode(&extra); err != nil {
		if err == io.EOF {
			return nil
		}

		return fmt.Errorf("decode trailing evalset content: %w", err)
	}

	return fmt.Errorf("decode trailing evalset content: unexpected trailing JSON value")
}
