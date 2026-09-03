package mt

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateBCP47(t *testing.T) {
	cases := []struct {
		name    string
		locale  string
		wantErr bool
	}{
		{name: "simple language", locale: "en", wantErr: false},
		{name: "language and region", locale: "en-US", wantErr: false},
		{name: "language and script", locale: "zh-Hans", wantErr: false},
		{name: "empty", locale: "", wantErr: true},
		{name: "whitespace only", locale: "   ", wantErr: true},
		{name: "not a locale", locale: "not a locale", wantErr: true},
		{name: "leading and trailing whitespace", locale: " en ", wantErr: true},
		{name: "trailing whitespace", locale: "en ", wantErr: true},
		{name: "leading whitespace", locale: " en", wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateBCP47(tc.locale)
			if !tc.wantErr {
				require.NoError(t, err)
				return
			}

			typed, ok := AsError(err)
			require.True(t, ok)
			require.Equal(t, ErrorCodeValidation, typed.Code)
		})
	}
}

func TestValidateRequest(t *testing.T) {
	valid := Request{
		SourceLocale: "en",
		TargetLocale: "fr",
		Sources:      []string{"hello"},
	}

	cases := []struct {
		name    string
		req     Request
		wantErr bool
	}{
		{
			name:    "valid request",
			req:     valid,
			wantErr: false,
		},
		{
			name: "same source and target locale is allowed",
			req: Request{
				SourceLocale: "en",
				TargetLocale: "en",
				Sources:      []string{"hello"},
			},
			wantErr: false,
		},
		{
			name: "missing source locale",
			req: Request{
				SourceLocale: "",
				TargetLocale: "fr",
				Sources:      []string{"hello"},
			},
			wantErr: true,
		},
		{
			name: "invalid source locale",
			req: Request{
				SourceLocale: "not a locale",
				TargetLocale: "fr",
				Sources:      []string{"hello"},
			},
			wantErr: true,
		},
		{
			name: "missing target locale",
			req: Request{
				SourceLocale: "en",
				TargetLocale: "",
				Sources:      []string{"hello"},
			},
			wantErr: true,
		},
		{
			name: "invalid target locale",
			req: Request{
				SourceLocale: "en",
				TargetLocale: "not a locale",
				Sources:      []string{"hello"},
			},
			wantErr: true,
		},
		{
			name: "empty sources",
			req: Request{
				SourceLocale: "en",
				TargetLocale: "fr",
				Sources:      []string{},
			},
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateRequest(tc.req)
			if !tc.wantErr {
				require.NoError(t, err)
				return
			}

			typed, ok := AsError(err)
			require.True(t, ok)
			require.Equal(t, ErrorCodeValidation, typed.Code)
		})
	}
}
