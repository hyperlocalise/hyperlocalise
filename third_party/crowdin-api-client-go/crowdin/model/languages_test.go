package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAddLanguageRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *AddLanguageRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name: "empty rrequest",
			req:  &AddLanguageRequest{},
			err:  "name is required",
		},
		{
			name: "missing fields (code)",
			req:  &AddLanguageRequest{Name: "Test"},
			err:  "code is required",
		},
		{
			name: "missing fields (localeCode)",
			req:  &AddLanguageRequest{Name: "Test", Code: "en"},
			err:  "localeCode is required",
		},
		{
			name: "missing fields (threeLettersCode)",
			req:  &AddLanguageRequest{Name: "Test", Code: "en", LocaleCode: "en_US"},
			err:  "threeLettersCode is required",
		},
		{
			name: "missing fields (pluralCategoryNames)",
			req:  &AddLanguageRequest{Name: "Test", Code: "en", LocaleCode: "en_US", ThreeLettersCode: "eng"},
			err:  "pluralCategoryNames is required",
		},
		{
			name: "missing fields (textDirection)",
			req: &AddLanguageRequest{Name: "Test", Code: "en", LocaleCode: "en_US", ThreeLettersCode: "eng",
				PluralCategoryNames: []string{"one"}},
			err: "textDirection is required",
		},
		{
			name: "invalid textDirection",
			req: &AddLanguageRequest{Name: "Test", Code: "en", LocaleCode: "en_US", ThreeLettersCode: "eng",
				PluralCategoryNames: []string{"one"}, TextDirection: "invalid"},
			err: "textDirection must be \"ltr\" or \"rtl\"",
		},
		{
			name: "valid request",
			req: &AddLanguageRequest{Name: "Test", Code: "en", LocaleCode: "en_US", ThreeLettersCode: "eng",
				PluralCategoryNames: []string{"one"}, TextDirection: "ltr"},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				require.NoError(t, err)
			} else {
				require.EqualError(t, err, tt.err)
			}
		})
	}
}
