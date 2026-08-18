package pathresolver_test

import (
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/pathresolver"
)

func TestResolveSourcePath_ScoutEdgeCases(t *testing.T) {
	tests := []struct {
		name         string
		pattern      string
		sourceLocale string
		want         string
	}{
		{
			name:         "standard source replacement",
			pattern:      "locales/{{source}}/messages.json",
			sourceLocale: "en-US",
			want:         "locales/en-US/messages.json",
		},
		{
			name:         "empty localeDir at relative path start trimmed cleanly",
			pattern:      "{{localeDir}}/content/[locale].json",
			sourceLocale: "en",
			want:         "content/en.json",
		},
		{
			name:         "absolute path starting with slash preserves leading slash",
			pattern:      "/abs/path/{{localeDir}}/{{source}}/file.json",
			sourceLocale: "en",
			want:         "/abs/path/en/file.json",
		},
		{
			name:         "multiple consecutive slashes collapsed",
			pattern:      "i18n///{{localeDir}}///{{source}}///file.json",
			sourceLocale: "en",
			want:         "i18n/en/file.json",
		},
		{
			name:         "complex script and region tag",
			pattern:      "locales/{{source}}/strings.json",
			sourceLocale: "zh-Hans-CN",
			want:         "locales/zh-Hans-CN/strings.json",
		},
		{
			name:         "legacy locale token replacement",
			pattern:      "locales/[locale]/messages.json",
			sourceLocale: "es-419",
			want:         "locales/es-419/messages.json",
		},
		{
			name:         "pattern without tokens returned unchanged",
			pattern:      "static/assets/en.json",
			sourceLocale: "en",
			want:         "static/assets/en.json",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := pathresolver.ResolveSourcePath(tt.pattern, tt.sourceLocale)
			if got != tt.want {
				t.Errorf("ResolveSourcePath(%q, %q) = %q, want %q", tt.pattern, tt.sourceLocale, got, tt.want)
			}
		})
	}
}

func TestResolveTargetPath_ScoutEdgeCases(t *testing.T) {
	tests := []struct {
		name         string
		pattern      string
		sourceLocale string
		targetLocale string
		want         string
	}{
		{
			name:         "same source and target resolves localeDir to empty string",
			pattern:      "docs/{{localeDir}}/index.mdx",
			sourceLocale: "en",
			targetLocale: "en",
			want:         "docs/index.mdx",
		},
		{
			name:         "different source and target resolves localeDir to target",
			pattern:      "docs/{{localeDir}}/index.mdx",
			sourceLocale: "en",
			targetLocale: "ja-JP",
			want:         "docs/ja-JP/index.mdx",
		},
		{
			name:         "combination of all tokens in single pattern",
			pattern:      "i18n/{{source}}_to_{{target}}/{{localeDir}}/[locale].json",
			sourceLocale: "en-US",
			targetLocale: "fr-FR",
			want:         "i18n/en-US_to_fr-FR/fr-FR/fr-FR.json",
		},
		{
			name:         "combination of tokens when source and target match",
			pattern:      "i18n/{{source}}_to_{{target}}/{{localeDir}}/[locale].json",
			sourceLocale: "en-US",
			targetLocale: "en-US",
			want:         "i18n/en-US_to_en-US/en-US.json",
		},
		{
			name:         "absolute path starting with slash preserves leading slash when localeDir empty",
			pattern:      "/var/locales/{{localeDir}}/{{target}}.json",
			sourceLocale: "en",
			targetLocale: "en",
			want:         "/var/locales/en.json",
		},
		{
			name:         "windows style path starting with backslash preserves leading backslash and backslashes",
			pattern:      `\var\locales\{{localeDir}}\{{target}}.json`,
			sourceLocale: "en",
			targetLocale: "en",
			want:         `\var\locales\\en.json`,
		},
		{
			name:         "multiple consecutive slashes collapsed in middle",
			pattern:      "locales///{{localeDir}}///{{target}}.json",
			sourceLocale: "en",
			targetLocale: "en",
			want:         "locales/en.json",
		},
		{
			name:         "relative pattern with localeDir at start stays relative",
			pattern:      "{{localeDir}}/sub/{{target}}.json",
			sourceLocale: "en",
			targetLocale: "en",
			want:         "sub/en.json",
		},
		{
			name:         "regional subtags and non-standard locale tags",
			pattern:      "i18n/{{localeDir}}/strings.json",
			sourceLocale: "en-US",
			targetLocale: "pt-BR",
			want:         "i18n/pt-BR/strings.json",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := pathresolver.ResolveTargetPath(tt.pattern, tt.sourceLocale, tt.targetLocale)
			if got != tt.want {
				t.Errorf("ResolveTargetPath(%q, %q, %q) = %q, want %q", tt.pattern, tt.sourceLocale, tt.targetLocale, got, tt.want)
			}
		})
	}
}
