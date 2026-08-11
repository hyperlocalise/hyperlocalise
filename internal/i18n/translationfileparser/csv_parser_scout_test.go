package translationfileparser

import (
	"reflect"
	"strings"
	"testing"
)

func TestCSVParser_ParseErrors(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		parser  CSVParser
		wantErr string
	}{
		{
			name:    "missing key column - automatically resolved",
			input:   "col1,col2\nval1,val2\n",
			parser:  CSVParser{},
			wantErr: "csv key column not found",
		},
		{
			name:    "missing key column - explicitly specified",
			input:   "id,fr\nhello,Bonjour\n",
			parser:  CSVParser{KeyColumn: "missing_key"},
			wantErr: "csv key column not found",
		},
		{
			name:    "missing value column - single column CSV",
			input:   "key\nhello\n",
			parser:  CSVParser{},
			wantErr: "csv value column not found",
		},
		{
			name:    "row missing value column",
			input:   "key,value\nhello\n",
			parser:  CSVParser{},
			wantErr: "csv row 2 missing value column",
		},
		{
			name:    "row missing value column - row index 3",
			input:   "key,value\nhello,Bonjour\nmissing_val_row\n",
			parser:  CSVParser{},
			wantErr: "csv row 3 missing value column",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := tt.parser.Parse([]byte(tt.input))
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErr)
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("expected error containing %q, got: %v", tt.wantErr, err)
			}
		})
	}
}

func TestCSVParser_ParseEdgeCases(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		parser CSVParser
		want   map[string]string
	}{
		{
			name:   "empty input string parses to empty map",
			input:  "",
			parser: CSVParser{},
			want:   map[string]string{},
		},
		{
			name:   "empty keys are skipped",
			input:  "key,value\nhello,Bonjour\n,value_without_key\n",
			parser: CSVParser{},
			want:   map[string]string{"hello": "Bonjour"},
		},
		{
			name:   "whitespace-only keys are skipped",
			input:  "key,value\nhello,Bonjour\n   ,value_without_key\n",
			parser: CSVParser{},
			want:   map[string]string{"hello": "Bonjour"},
		},
		{
			name:   "custom delimiter semicolon",
			input:  "key;value\nhello;Bonjour\n",
			parser: CSVParser{Delimiter: ';'},
			want:   map[string]string{"hello": "Bonjour"},
		},
		{
			name:   "headers trimmed and case-insensitive matching",
			input:  "  KEY  ,  VALUE  \nhello,Bonjour\n",
			parser: CSVParser{},
			want:   map[string]string{"hello": "Bonjour"},
		},
		{
			name:   "fallback to any column when preferred value column is missing",
			input:  "key,en,fr\nhello,Hello,Bonjour\n",
			parser: CSVParser{ValueColumn: "missing_val"},
			want:   map[string]string{"hello": "Hello"}, // Falls back to first non-key column which is 'en'
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := tt.parser.Parse([]byte(tt.input))
			if err != nil {
				t.Fatalf("Parse failed: %v", err)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCSVParser_MarshalCSVErrorsAndEdgeCases(t *testing.T) {
	t.Run("empty template creates default headers", func(t *testing.T) {
		values := map[string]string{
			"hello": "Bonjour",
			"apple": "Pomme",
		}
		// Expect headers "key,value" sorted deterministically
		got, err := MarshalCSV(nil, values, CSVParser{})
		if err != nil {
			t.Fatalf("MarshalCSV failed: %v", err)
		}
		want := "key,value\napple,Pomme\nhello,Bonjour\n"
		if string(got) != want {
			t.Fatalf("got %q, want %q", string(got), want)
		}
	})

	t.Run("empty template custom columns", func(t *testing.T) {
		values := map[string]string{
			"hello": "Bonjour",
		}
		got, err := MarshalCSV(nil, values, CSVParser{KeyColumn: "id", ValueColumn: "fr"})
		if err != nil {
			t.Fatalf("MarshalCSV failed: %v", err)
		}
		want := "id,fr\nhello,Bonjour\n"
		if string(got) != want {
			t.Fatalf("got %q, want %q", string(got), want)
		}
	})

	t.Run("missing key column in template returns error", func(t *testing.T) {
		template := []byte("col1,col2\n")
		_, err := MarshalCSV(template, map[string]string{"hello": "Bonjour"}, CSVParser{KeyColumn: "id"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !strings.Contains(err.Error(), "csv key column not found") {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("custom delimiter marshalling", func(t *testing.T) {
		template := []byte("key;fr\nhello;Salut\n")
		got, err := MarshalCSV(template, map[string]string{"hello": "Bonjour", "bye": "Au revoir"}, CSVParser{Delimiter: ';', ValueColumn: "fr"})
		if err != nil {
			t.Fatalf("MarshalCSV failed: %v", err)
		}
		want := "key;fr\nhello;Bonjour\nbye;Au revoir\n"
		if string(got) != want {
			t.Fatalf("got %q, want %q", string(got), want)
		}
	})
}
