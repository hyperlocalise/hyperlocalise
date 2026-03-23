package store

import "testing"

func TestBuildGlossaryTSQuery(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "sentence becomes OR query", input: "Use account balance", want: "use | account | balance"},
		{name: "punctuation removed and deduped", input: "Account, balance; account!", want: "account | balance"},
		{name: "single rune terms dropped", input: "a x z", want: ""},
		{name: "unicode preserved", input: "Tài khoản số dư", want: "tài | khoản | số | dư"},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := buildGlossaryTSQuery(tc.input); got != tc.want {
				t.Fatalf("buildGlossaryTSQuery(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}
