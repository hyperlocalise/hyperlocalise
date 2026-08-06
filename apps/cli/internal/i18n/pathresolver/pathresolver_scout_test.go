package pathresolver

import (
	"testing"
)

func TestPathResolver_ScoutEdgeCases(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		fn           func(pattern, source, target string) string
		pattern      string
		sourceLocale string
		targetLocale string
		want         string
	}{
		{
			name: "ResolveSourcePath collapses multiple sequential slashes",
			fn: func(pattern, source, target string) string {
				return ResolveSourcePath(pattern, source)
			},
			pattern:      "content///{{source}}//[locale].json",
			sourceLocale: "en",
			targetLocale: "en",
			want:         "content/en/en.json",
		},
		{
			name:         "ResolveTargetPath collapses multiple sequential slashes",
			fn:           ResolveTargetPath,
			pattern:      "dist////{{localeDir}}///{{target}}//[locale].json",
			sourceLocale: "en",
			targetLocale: "fr",
			want:         "dist/fr/fr/fr.json",
		},
		{
			name:         "ResolveTargetPath collapses multiple slashes when localeDir is empty",
			fn:           ResolveTargetPath,
			pattern:      "dist/{{localeDir}}/{{target}}.json",
			sourceLocale: "en",
			targetLocale: "en",
			want:         "dist/en.json",
		},
		{
			name:         "ResolveTargetPath relative remains relative with empty localeDir",
			fn:           ResolveTargetPath,
			pattern:      "{{localeDir}}/file.json",
			sourceLocale: "en",
			targetLocale: "en",
			want:         "file.json",
		},
		{
			name:         "ResolveTargetPath relative with multiple slashes treated as absolute if pattern has leading slash",
			fn:           ResolveTargetPath,
			pattern:      "///{{localeDir}}/file.json",
			sourceLocale: "en",
			targetLocale: "en",
			want:         "/file.json",
		},
		{
			name:         "ResolveTargetPath absolute with leading slash preserves leading slash",
			fn:           ResolveTargetPath,
			pattern:      "/{{localeDir}}/file.json",
			sourceLocale: "en",
			targetLocale: "en",
			want:         "/file.json",
		},
		{
			name:         "ResolveTargetPath absolute with leading backslash preserves leading backslash and keeps uncollapsed backslash",
			fn:           ResolveTargetPath,
			pattern:      `\{{localeDir}}\file.json`,
			sourceLocale: "en",
			targetLocale: "en",
			want:         `\\file.json`,
		},
		{
			name:         "ResolveTargetPath complex Unicode locales",
			fn:           ResolveTargetPath,
			pattern:      "{{localeDir}}/{{target}}/strings.json",
			sourceLocale: "en-US",
			targetLocale: "zh-Hant-TW",
			want:         "zh-Hant-TW/zh-Hant-TW/strings.json",
		},
		{
			name:         "ResolveTargetPath with legacy and new tokens combined",
			fn:           ResolveTargetPath,
			pattern:      "lang/[locale]/{{localeDir}}/{{target}}/{{source}}.json",
			sourceLocale: "en-US",
			targetLocale: "es-ES",
			want:         "lang/es-ES/es-ES/es-ES/en-US.json",
		},
		{
			name:         "ResolveTargetPath with legacy and new tokens combined (same locales)",
			fn:           ResolveTargetPath,
			pattern:      "lang/[locale]/{{localeDir}}/{{target}}/{{source}}.json",
			sourceLocale: "en-US",
			targetLocale: "en-US",
			want:         "lang/en-US/en-US/en-US.json",
		},
		{
			name:         "ResolveTargetPath with completely empty pattern",
			fn:           ResolveTargetPath,
			pattern:      "",
			sourceLocale: "en",
			targetLocale: "fr",
			want:         "",
		},
		{
			name:         "ResolveTargetPath with only token",
			fn:           ResolveTargetPath,
			pattern:      "{{localeDir}}",
			sourceLocale: "en",
			targetLocale: "en",
			want:         "",
		},
		{
			name:         "ResolveTargetPath with only token (different locales)",
			fn:           ResolveTargetPath,
			pattern:      "{{localeDir}}",
			sourceLocale: "en",
			targetLocale: "fr",
			want:         "fr",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.fn(tt.pattern, tt.sourceLocale, tt.targetLocale)
			if got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}
