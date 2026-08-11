package scoring

import "testing"

func TestLocaleValidityScore_Scout(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		targetLocale string
		translated   string
		want         float64
	}{
		{
			name:         "empty target locale is ignored",
			targetLocale: "",
			translated:   "Hello",
			want:         1.0,
		},
		{
			name:         "whitespace-only target locale is ignored",
			targetLocale: "   ",
			translated:   "Hello",
			want:         1.0,
		},
		{
			name:         "invalid target locale format returns 0",
			targetLocale: "invalid_locale_format",
			translated:   "Hello",
			want:         0.0,
		},
		{
			name:         "unrecognized language tag returns 0",
			targetLocale: "???",
			translated:   "Hello",
			want:         0.0,
		},
		{
			name:         "matching script - Latn",
			targetLocale: "en-US",
			translated:   "Hello World",
			want:         1.0,
		},
		{
			name:         "matching script - Cyrl",
			targetLocale: "ru-RU",
			translated:   "Привет",
			want:         1.0,
		},
		{
			name:         "matching script - Arab",
			targetLocale: "ar-EG",
			translated:   "مرحبا",
			want:         1.0,
		},
		{
			name:         "matching script - Hans",
			targetLocale: "zh-Hans",
			translated:   "你好",
			want:         1.0,
		},
		{
			name:         "matching script - Jpan",
			targetLocale: "ja-JP",
			translated:   "今日",
			want:         1.0,
		},
		{
			name:         "non-matching script with letters returns 0",
			targetLocale: "ru-RU",
			translated:   "Hello",
			want:         0.0,
		},
		{
			name:         "non-matching script with letters (Arabic) returns 0",
			targetLocale: "ar-EG",
			translated:   "Hello",
			want:         0.0,
		},
		{
			name:         "non-matching script without any letters returns 1 (numbers only)",
			targetLocale: "ru-RU",
			translated:   "123456",
			want:         1.0,
		},
		{
			name:         "non-matching script without any letters returns 1 (punctuation only)",
			targetLocale: "zh-CN",
			translated:   "!!! @#$ %^&*",
			want:         1.0,
		},
		{
			name:         "non-matching script without any letters returns 1 (mixed num/punct)",
			targetLocale: "ar-EG",
			translated:   "12.34 !!!",
			want:         1.0,
		},
		{
			name:         "Zzzz script returns 1",
			targetLocale: "mul", // Multiple languages
			translated:   "Hello",
			want:         1.0,
		},
		{
			name:         "private use script returns 1",
			targetLocale: "qaa", // Private use language/script
			translated:   "Hello",
			want:         1.0,
		},
		{
			name:         "whitespace trimmed in target locale",
			targetLocale: "  en-US  ",
			translated:   "Hello",
			want:         1.0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := localeValidityScore(tt.targetLocale, tt.translated)
			if got != tt.want {
				t.Errorf("localeValidityScore(%q, %q) = %v, want %v", tt.targetLocale, tt.translated, got, tt.want)
			}
		})
	}
}
