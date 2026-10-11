package icuparser

import (
	"reflect"
	"testing"
)

func TestExtractInterpolations(t *testing.T) {
	tests := []struct {
		name      string
		msg       string
		wantNames []string
		wantLits  []string
	}{
		{
			name:      "simple mustache",
			msg:       "Hello {{name}}",
			wantNames: []string{"name"},
			wantLits:  []string{"{{name}}"},
		},
		{
			name:      "i18next format",
			msg:       "Price {{val, number}}",
			wantNames: []string{"val"},
			wantLits:  []string{"{{val, number}}"},
		},
		{
			name:      "i18next unescape",
			msg:       "HTML {{- html}}",
			wantNames: []string{"html"},
			wantLits:  []string{"{{-html}}"},
		},
		{
			name:      "triple mustache",
			msg:       "Raw {{{title}}}",
			wantNames: []string{"title"},
			wantLits:  []string{"{{{title}}}"},
		},
		{
			name:      "skips nested ICU",
			msg:       "{gender, select, male {{count, plural, one {#} other {#}}} other {x}}",
			wantNames: nil,
			wantLits:  nil,
		},
		{
			name:      "mixed icu and interpolation",
			msg:       "{count, plural, one {item} other {items}} for {{user_name}}",
			wantNames: []string{"user_name"},
			wantLits:  []string{"{{user_name}}"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ExtractInterpolations(tt.msg)
			var names, lits []string
			for _, span := range got {
				names = append(names, span.Name)
				lits = append(lits, span.Literal)
			}
			if !reflect.DeepEqual(names, tt.wantNames) {
				t.Errorf("names = %#v, want %#v", names, tt.wantNames)
			}
			if !reflect.DeepEqual(lits, tt.wantLits) {
				t.Errorf("literals = %#v, want %#v", lits, tt.wantLits)
			}
		})
	}
}

func TestParseInvariantI18nextPlaceholders(t *testing.T) {
	tests := []struct {
		name string
		msg  string
		want []string
	}{
		{
			name: "i18next format",
			msg:  "Hello {{name, uppercase}}",
			want: []string{"name"},
		},
		{
			name: "i18next unescape with space",
			msg:  "Hello {{- name}}",
			want: []string{"name"},
		},
		{
			name: "i18next number format",
			msg:  "{{count, number}} files",
			want: []string{"count"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inv, err := ParseInvariant(tt.msg)
			if err != nil {
				t.Fatalf("ParseInvariant(%q) error = %v", tt.msg, err)
			}
			if !SamePlaceholderSet(inv.Placeholders, tt.want) {
				t.Errorf("placeholders = %v, want %v", inv.Placeholders, tt.want)
			}
		})
	}
}
