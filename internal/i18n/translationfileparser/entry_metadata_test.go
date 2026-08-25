package translationfileparser

import "testing"

func TestParseMaxLengthFromComment(t *testing.T) {
	tests := []struct {
		name    string
		comment string
		want    int
		ok      bool
	}{
		{name: "hl directive", comment: "hl:max-length=24", want: 24, ok: true},
		{name: "max length words", comment: "Max length: 40", want: 40, ok: true},
		{name: "max.length crowdin style", comment: "max.length: 35", want: 35, ok: true},
		{name: "character limit", comment: "Character limit = 12", want: 12, ok: true},
		{name: "embedded in sentence", comment: "Button label. Max length: 18 chars.", want: 18, ok: true},
		{name: "zero rejected", comment: "max length: 0", ok: false},
		{name: "missing", comment: "Shown on the welcome screen", ok: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := ParseMaxLengthFromComment(tc.comment)
			if ok != tc.ok {
				t.Fatalf("ParseMaxLengthFromComment(%q) ok = %v, want %v", tc.comment, ok, tc.ok)
			}
			if ok && got != tc.want {
				t.Fatalf("ParseMaxLengthFromComment(%q) = %d, want %d", tc.comment, got, tc.want)
			}
		})
	}
}
