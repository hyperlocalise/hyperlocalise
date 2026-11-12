package projecttemplate

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNormalize(t *testing.T) {
	memory := "6f1c1f3e-8a51-4cf0-9d0e-1e2f3a4b5c6d"
	f, err := Normalize(Fields{
		Name:          "  UI strings ",
		SourceLocale:  "zh_cn",
		TargetLocales: []string{"en-us", "EN-US", "es-419", "az"},
		MemoryIDs:     []string{memory, " " + memory},
	})
	require.NoError(t, err)
	require.Equal(t, "UI strings", f.Name)
	require.Equal(t, "zh-CN", f.SourceLocale)
	require.Equal(t, []string{"en-US", "es-419", "az"}, f.TargetLocales)
	require.Equal(t, []string{memory}, f.MemoryIDs)
	require.Equal(t, "stay_approved", f.ApprovedTranslationsOnSourceChange)

	for name, fields := range map[string]Fields{
		"empty name":        {SourceLocale: "en", TargetLocales: []string{"fr"}},
		"bad source":        {Name: "x", SourceLocale: "!!", TargetLocales: []string{"fr"}},
		"no targets":        {Name: "x", SourceLocale: "en"},
		"source in targets": {Name: "x", SourceLocale: "en", TargetLocales: []string{"EN"}},
		"bad team":          {Name: "x", SourceLocale: "en", TargetLocales: []string{"fr"}, TeamID: new("team")},
		"bad memory":        {Name: "x", SourceLocale: "en", TargetLocales: []string{"fr"}, MemoryIDs: []string{"tm"}},
		"bad source change": {Name: "x", SourceLocale: "en", TargetLocales: []string{"fr"}, ApprovedTranslationsOnSourceChange: "reset"},
	} {
		_, err := Normalize(fields)
		var validation ValidationError
		require.ErrorAs(t, err, &validation, name)
	}
}

func TestBodyApplyTo(t *testing.T) {
	team := "1d5e8a52-7a0b-4f43-9c1b-7a1d0d4f6b2a"
	base := Fields{Name: "Old", SourceLocale: "en", TargetLocales: []string{"fr"}, TeamID: &team, TranslationContext: "Formal"}

	var clearTeam Body
	require.NoError(t, json.Unmarshal([]byte(`{"targetLocales":["ja"],"teamId":null}`), &clearTeam))
	got := clearTeam.ApplyTo(base)
	require.Equal(t, []string{"ja"}, got.TargetLocales)
	require.Nil(t, got.TeamID)
	require.Equal(t, "Formal", got.TranslationContext)

	var keepTeam Body
	require.NoError(t, json.Unmarshal([]byte(`{"name":"New"}`), &keepTeam))
	require.Equal(t, &team, keepTeam.ApplyTo(base).TeamID)
	require.False(t, keepTeam.Empty())

	var empty Body
	require.NoError(t, json.Unmarshal([]byte(`{}`), &empty))
	require.True(t, empty.Empty())
}

func TestProjectInput(t *testing.T) {
	template := &Template{
		SourceLocale:                       "zh-CN",
		TargetLocales:                      []string{"en-US"},
		ProjectDescription:                 "From template",
		SourceTextEditable:                 true,
		ApprovedTranslationsOnSourceChange: "needs_review",
		MemoryIDs:                          []string{"m"},
		GlossaryIDs:                        []string{"g"},
	}
	targets := []string{"vi_vn"}
	in, err := ProjectInput(template, ProjectRequest{Name: " REQ-1 ", TargetLocales: &targets})
	require.NoError(t, err)
	require.Equal(t, "REQ-1", in.Name)
	require.Equal(t, "zh-CN", in.SourceLocale)
	require.Equal(t, []string{"vi-VN"}, in.TargetLocales)
	require.Equal(t, "From template", in.Description)
	require.True(t, in.Settings.SourceTextEditable)
	require.Equal(t, []string{"m"}, in.MemoryIDs)

	_, err = ProjectInput(nil, ProjectRequest{Name: "No template"})
	var validation ValidationError
	require.ErrorAs(t, err, &validation)
	require.Equal(t, "sourceLocale", validation.Field)

	source := "en-US"
	_, err = ProjectInput(template, ProjectRequest{Name: "Clash", SourceLocale: &source})
	require.ErrorAs(t, err, &validation)
	require.Equal(t, "targetLocales", validation.Field)
}
