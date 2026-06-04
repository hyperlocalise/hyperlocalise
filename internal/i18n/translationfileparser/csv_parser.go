package translationfileparser

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"io"
	"slices"
	"strings"
)

// CSVParser parses CSV translation files.
type CSVParser struct {
	KeyColumn   string
	ValueColumn string
	Delimiter   rune
}

func (p CSVParser) Parse(content []byte) (map[string]string, error) {
	r := csv.NewReader(bytes.NewReader(content))
	if p.Delimiter != 0 {
		r.Comma = p.Delimiter
	}
	r.FieldsPerRecord = -1
	r.LazyQuotes = true

	// BOLT OPTIMIZATION: Use streaming reader instead of loading all records into memory.
	first, err := r.Read()
	if err != nil {
		if err == io.EOF {
			return map[string]string{}, nil
		}
		return nil, fmt.Errorf("csv decode: %w", err)
	}

	headers := normalizeCSVHeaders(first)
	keyIdx, valueIdx, err := resolveCSVColumns(headers, p.KeyColumn, p.ValueColumn)
	if err != nil {
		return nil, err
	}

	out := map[string]string{}
	rowIdx := 2
	for {
		row, err := r.Read()
		if err != nil {
			if err == io.EOF {
				break
			}
			return nil, fmt.Errorf("csv decode: %w", err)
		}

		if keyIdx >= len(row) {
			rowIdx++
			continue
		}
		key := strings.TrimSpace(row[keyIdx])
		if key == "" {
			rowIdx++
			continue
		}
		if valueIdx >= len(row) {
			return nil, fmt.Errorf("csv row %d missing value column", rowIdx)
		}
		out[key] = row[valueIdx]
		rowIdx++
	}
	return out, nil
}

func MarshalCSV(template []byte, values map[string]string, parser CSVParser) ([]byte, error) {
	// BOLT OPTIMIZATION: Use streaming reader and writer instead of loading all records into memory.
	r := csv.NewReader(bytes.NewReader(template))
	if parser.Delimiter != 0 {
		r.Comma = parser.Delimiter
	}
	r.FieldsPerRecord = -1
	r.LazyQuotes = true

	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if parser.Delimiter != 0 {
		w.Comma = parser.Delimiter
	}

	first, err := r.Read()
	if err != nil {
		if err == io.EOF {
			keyHeader := strings.TrimSpace(parser.KeyColumn)
			if keyHeader == "" {
				keyHeader = "key"
			}
			valueHeader := strings.TrimSpace(parser.ValueColumn)
			if valueHeader == "" {
				valueHeader = "value"
			}
			first = []string{keyHeader, valueHeader}
		} else {
			return nil, fmt.Errorf("csv decode: %w", err)
		}
	}

	headers := normalizeCSVHeaders(first)
	keyIdx, valueIdx, err := resolveCSVColumns(headers, parser.KeyColumn, parser.ValueColumn)
	if err != nil {
		return nil, err
	}

	if err := w.Write(first); err != nil {
		return nil, fmt.Errorf("csv write header: %w", err)
	}

	seen := make(map[string]struct{}, len(values))
	for {
		row, err := r.Read()
		if err != nil {
			if err == io.EOF {
				break
			}
			return nil, fmt.Errorf("csv decode: %w", err)
		}

		if keyIdx < len(row) {
			key := strings.TrimSpace(row[keyIdx])
			if key != "" {
				if value, ok := values[key]; ok {
					row = ensureCSVLen(row, valueIdx+1)
					row[valueIdx] = value
				}
				seen[key] = struct{}{}
			}
		}

		if err := w.Write(row); err != nil {
			return nil, fmt.Errorf("csv write row: %w", err)
		}
	}

	keys := make([]string, 0, len(values))
	for key := range values {
		if _, ok := seen[key]; ok {
			continue
		}
		keys = append(keys, key)
	}
	slices.Sort(keys)
	for _, key := range keys {
		row := make([]string, max(keyIdx, valueIdx)+1)
		row[keyIdx] = key
		row[valueIdx] = values[key]
		if err := w.Write(row); err != nil {
			return nil, fmt.Errorf("csv write extra: %w", err)
		}
	}

	w.Flush()
	if err := w.Error(); err != nil {
		return nil, fmt.Errorf("csv flush: %w", err)
	}
	return buf.Bytes(), nil
}

func normalizeCSVHeaders(headers []string) []string {
	normalized := make([]string, len(headers))
	for i, header := range headers {
		clean := strings.TrimSpace(header)
		clean = strings.TrimPrefix(clean, "\ufeff")
		normalized[i] = strings.ToLower(clean)
	}
	return normalized
}

func resolveCSVColumns(headers []string, keyColumn, valueColumn string) (int, int, error) {
	keyIdx := resolveCSVColumn(headers, keyColumn, []string{"key", "id"})
	if keyIdx < 0 {
		return -1, -1, fmt.Errorf("csv key column not found")
	}

	valueFallback := []string{"target", "value", "source"}
	if strings.TrimSpace(valueColumn) == "" {
		for i := range headers {
			if i == keyIdx {
				continue
			}
			valueFallback = append(valueFallback, headers[i])
		}
	}
	valueIdx := resolveCSVColumn(headers, valueColumn, valueFallback)
	if valueIdx < 0 || valueIdx == keyIdx {
		for i := range headers {
			if i != keyIdx {
				valueIdx = i
				break
			}
		}
	}
	if valueIdx < 0 || valueIdx == keyIdx {
		return -1, -1, fmt.Errorf("csv value column not found")
	}

	return keyIdx, valueIdx, nil
}

func resolveCSVColumn(headers []string, preferred string, fallbacks []string) int {
	name := strings.ToLower(strings.TrimSpace(preferred))
	if name != "" {
		for i, header := range headers {
			if header == name {
				return i
			}
		}
		return -1
	}

	for _, candidate := range fallbacks {
		want := strings.ToLower(strings.TrimSpace(candidate))
		if want == "" {
			continue
		}
		for i, header := range headers {
			if header == want {
				return i
			}
		}
	}
	return -1
}

func ensureCSVLen(row []string, n int) []string {
	if len(row) >= n {
		return row
	}
	grown := make([]string, n)
	copy(grown, row)
	return grown
}
