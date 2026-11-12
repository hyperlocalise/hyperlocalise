package customfield

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNormalize(t *testing.T) {
	selectField := func(fieldType string) Field {
		return Field{Type: fieldType, Options: []Option{{ID: "a1", Value: "EU"}, {ID: "b2", Value: "LATAM"}}}
	}
	cases := []struct {
		name  string
		field Field
		raw   string
		want  string
	}{
		{"text is trimmed", Field{Type: TypeText}, `"  REQ-1 "`, `"REQ-1"`},
		{"number keeps its digits", Field{Type: TypeNumber}, `12.50`, `12.50`},
		{"date", Field{Type: TypeDate}, `"2026-12-01"`, `"2026-12-01"`},
		{"url", Field{Type: TypeURL}, `"https://example.com/a"`, `"https://example.com/a"`},
		{"checkbox", Field{Type: TypeCheckbox}, `false`, `false`},
		{"single select by value ignores case", selectField(TypeSingleSelect), `"latam"`, `"b2"`},
		{"single select by id", selectField(TypeSingleSelect), `"a1"`, `"a1"`},
		{"multi select drops repeats", selectField(TypeMultiSelect), `["EU","a1","LATAM"]`, `["a1","b2"]`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Normalize(tc.field, []byte(tc.raw))
			require.NoError(t, err)
			require.JSONEq(t, tc.want, string(got))
		})
	}

	rejected := []struct {
		name  string
		field Field
		raw   string
	}{
		{"empty text", Field{Type: TypeText}, `"  "`},
		{"number as string", Field{Type: TypeNumber}, `"12"`},
		{"date with time", Field{Type: TypeDate}, `"2026-12-01T00:00:00Z"`},
		{"url without scheme", Field{Type: TypeURL}, `"example.com"`},
		{"javascript url", Field{Type: TypeURL}, `"javascript:alert(1)"`},
		{"checkbox as string", Field{Type: TypeCheckbox}, `"true"`},
		{"unknown option", selectField(TypeSingleSelect), `"APAC"`},
		{"empty multi select", selectField(TypeMultiSelect), `[]`},
	}
	for _, tc := range rejected {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Normalize(tc.field, []byte(tc.raw))
			require.ErrorAs(t, err, &ValidationError{})
		})
	}
}

func TestNormalizeCreate(t *testing.T) {
	in, err := NormalizeCreate(CreateInput{Key: "request_ref", Name: " Request ", Type: TypeText})
	require.NoError(t, err)
	require.Equal(t, "Request", in.Name)

	for name, bad := range map[string]CreateInput{
		"key with capitals":       {Key: "Request", Name: "x", Type: TypeText},
		"key starting with digit": {Key: "1ref", Name: "x", Type: TypeText},
		"unknown type":            {Key: "ref", Name: "x", Type: "json"},
		"options on text":         {Key: "ref", Name: "x", Type: TypeText, Options: []OptionInput{{Value: "a"}}},
		"select without options":  {Key: "ref", Name: "x", Type: TypeSingleSelect},
		"duplicate options":       {Key: "ref", Name: "x", Type: TypeMultiSelect, Options: []OptionInput{{Value: "EU"}, {Value: "eu"}}},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := NormalizeCreate(bad)
			require.ErrorAs(t, err, &ValidationError{})
		})
	}
}
