package csvsafe

import (
	"reflect"
	"testing"
)

func TestEscapeFormula_ScoutEdgeCases(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "empty string",
			in:   "",
			want: "",
		},
		{
			name: "injection char in the middle of a string should not be escaped",
			in:   "hello=world",
			want: "hello=world",
		},
		{
			name: "plus char in the middle of a string should not be escaped",
			in:   "1+1",
			want: "1+1",
		},
		{
			name: "minus char in the middle of a string should not be escaped",
			in:   "abc-def",
			want: "abc-def",
		},
		{
			name: "at-sign char in the middle of a string should not be escaped",
			in:   "user@domain.com",
			want: "user@domain.com",
		},
		{
			name: "leading space before injection char should not be escaped",
			in:   " =1+1",
			want: " =1+1",
		},
		{
			name: "leading space before plus char should not be escaped",
			in:   " +cmd",
			want: " +cmd",
		},
		{
			name: "leading space before at-sign should not be escaped",
			in:   " @evil",
			want: " @evil",
		},
		{
			name: "leading newline before plain text should be escaped",
			in:   "\nplain text",
			want: "'\nplain text",
		},
		{
			name: "leading tab before plain text should be escaped",
			in:   "\tplain text",
			want: "'\tplain text",
		},
		{
			name: "leading carriage return before plain text should be escaped",
			in:   "\rplain text",
			want: "'\rplain text",
		},
		{
			name: "safe plain text",
			in:   "hello world",
			want: "hello world",
		},
		{
			name: "unicode chars starting with letter",
			in:   "π=3.14",
			want: "π=3.14",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := EscapeFormula(tt.in); got != tt.want {
				t.Errorf("EscapeFormula(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestEscapeRow_ScoutEdgeCases(t *testing.T) {
	t.Run("nil row", func(t *testing.T) {
		got := EscapeRow(nil)
		if got != nil {
			t.Errorf("EscapeRow(nil) = %v, want nil", got)
		}
	})

	t.Run("empty row", func(t *testing.T) {
		got := EscapeRow([]string{})
		if got == nil {
			t.Errorf("EscapeRow([]) returned nil, want non-nil empty slice")
		}
		if len(got) != 0 {
			t.Errorf("EscapeRow([]) len = %d, want 0", len(got))
		}
	})

	t.Run("mixed safe and unsafe cells", func(t *testing.T) {
		row := []string{"safe text", "=unsafe formula", "+another unsafe", "okay", "@at-sign", "\tlead-tab"}
		want := []string{"safe text", "'=unsafe formula", "'+another unsafe", "okay", "'@at-sign", "'\tlead-tab"}

		got := EscapeRow(row)
		if !reflect.DeepEqual(got, want) {
			t.Errorf("EscapeRow(%q) = %q, want %q", row, got, want)
		}
	})

	t.Run("all safe cells", func(t *testing.T) {
		row := []string{"first", "second", "third"}
		want := []string{"first", "second", "third"}

		got := EscapeRow(row)
		if !reflect.DeepEqual(got, want) {
			t.Errorf("EscapeRow(%q) = %q, want %q", row, got, want)
		}
	})
}
