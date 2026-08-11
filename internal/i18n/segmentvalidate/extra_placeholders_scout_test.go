package segmentvalidate

import (
	"reflect"
	"testing"
)

func TestExtractExtraPlaceholdersObjectiveC(t *testing.T) {
	tests := []struct {
		text string
		want []string
	}{
		{
			text: "Hello %@!",
			want: []string{"%@"},
		},
		{
			text: "Hello %s!",
			want: []string{"%s"},
		},
		{
			text: "Value is %d",
			want: []string{"%d"},
		},
		{
			text: "Objective-C object: %@",
			want: []string{"%@"},
		},
		{
			text: "%@ is at the start",
			want: []string{"%@"},
		},
		{
			text: "Double %@ and %@",
			want: []string{"%@", "%@"},
		},
		{
			text: "Mixed %@ and %s",
			want: []string{"%@", "%s"},
		},
		{
			text: "Literal %%@",
			want: nil,
		},
		{
			text: "Escaped then real %%%@",
			want: []string{"%@"},
		},
		{
			text: "Real then escaped %@ and %%@",
			want: []string{"%@"},
		},
		{
			text: "Only escaped %%s and %%@",
			want: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.text, func(t *testing.T) {
			got := extractExtraPlaceholders(tt.text)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("extractExtraPlaceholders(%q) = %v, want %v", tt.text, got, tt.want)
			}
		})
	}
}

func TestValidateExtraPlaceholderParityEscapedPercentAt(t *testing.T) {
	if err := validateExtraPlaceholderParity("Show %%@", "Afficher %%@"); err != nil {
		t.Fatalf("expected escaped %%@ parity pass, got %v", err)
	}
	if err := validateExtraPlaceholderParity("Hello", "Bonjour %%@"); err != nil {
		t.Fatalf("expected one-sided escaped %%@ to pass, got %v", err)
	}
	if err := validateExtraPlaceholderParity("Hello %@", "Bonjour %%@"); err == nil {
		t.Fatal("expected real %@ vs escaped %%@ to fail")
	}
	if err := validateExtraPlaceholderParity("Hello %%%@", "Bonjour %@"); err != nil {
		t.Fatalf("expected %%%%@ and %%@ parity pass, got %v", err)
	}
}
