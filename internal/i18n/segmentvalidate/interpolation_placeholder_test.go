package segmentvalidate

import (
	"reflect"
	"testing"
)

func TestValidateExtraPlaceholderParityI18next(t *testing.T) {
	if err := validateExtraPlaceholderParity("Hello {{name, uppercase}}", "Bonjour {{name, uppercase}}"); err != nil {
		t.Fatalf("matching i18next format should pass, got %v", err)
	}
	if err := validateExtraPlaceholderParity("Hello {{name, uppercase}}", "Bonjour {{name}}"); err == nil {
		t.Fatal("expected dropped i18next format to fail")
	}
	if err := validateExtraPlaceholderParity("See $t(help.link)", "Voir $t(other.link)"); err == nil {
		t.Fatal("expected i18next nesting mismatch to fail")
	}
}

func TestExtractExtraPlaceholdersI18next(t *testing.T) {
	tests := []struct {
		text string
		want []string
	}{
		{
			text: "Hello {{name}}",
			want: []string{"{{name}}"},
		},
		{
			text: "Hello {{name, uppercase}}",
			want: []string{"{{name, uppercase}}"},
		},
		{
			text: "Hello {{- html}}",
			want: []string{"{{-html}}"},
		},
		{
			text: "See $t(help.link)",
			want: []string{"$t(help.link)"},
		},
		{
			text: "{{name}} and $t(other.key)",
			want: []string{"$t(other.key)", "{{name}}"},
		},
		{
			text: "{gender, select, male {{count, plural, one {#} other {#}}} other {x}}",
			want: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.text, func(t *testing.T) {
			got := extractExtraPlaceholders(tt.text)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("extractExtraPlaceholders(%q) = %#v, want %#v", tt.text, got, tt.want)
			}
		})
	}
}
