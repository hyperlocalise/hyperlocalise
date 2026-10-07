package main

import (
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/memoryinterchange"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/memoryinterchange/fixtures"
)

func TestMemoryImportParseFixtures(t *testing.T) {
	tests := []struct {
		format string
		file   string
		wantN  int
	}{
		{format: "csv", file: "crowdin-two-column.csv", wantN: 2},
		{format: "tmx", file: "crowdin-with-prop.tmx", wantN: 2},
	}
	for _, tc := range tests {
		t.Run(tc.file, func(t *testing.T) {
			data, readErr := fixtures.Read(tc.file)
			if readErr != nil {
				t.Fatal(readErr)
			}
			candidates, issues, _, err := memoryinterchange.Parse(tc.format, string(data))
			if err != nil {
				t.Fatalf("Parse() err = %v", err)
			}
			for _, issue := range issues {
				if issue.Code == "invalid_tmx" {
					t.Fatalf("unexpected invalid_tmx: %+v", issue)
				}
			}
			if len(candidates) != tc.wantN {
				t.Fatalf("Parse() len = %d, want %d", len(candidates), tc.wantN)
			}
		})
	}
}
