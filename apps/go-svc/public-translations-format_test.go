package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNodePathPortsMatchNode(t *testing.T) {
	for _, tc := range []struct{ path, ext, base, plain, file string }{
		{"locales/en.json", ".json", "en", "en.json", "en-fr.json"},
		{"a/b/en-fr.json", ".json", "en-fr", "en-fr.json", "en-fr.json"},
		{"README", "", "README", "README", "README-fr.json"},
		{"dir/README", "", "README", "README", "README-fr.json"},
		{".env", "", ".env", ".env", ".env-fr.json"},
		{"dir/.env", "", ".env", ".env", ".env-fr.json"},
		{"file.", ".", "file", "file.", "file-fr."},
		{"a.b/c", "", "c", "c", "c-fr.json"},
		{"a.b/c/", "", "c", "c", "c-fr.json"},
		{"..", "", "..", "..", "..-fr.json"},
		{"...", ".", "..", "...", "..-fr."},
		{"..x", ".x", ".", "..x", ".-fr.x"},
		{"./x.json", ".json", "x", "x.json", "x-fr.json"},
		{"x.tar.gz", ".gz", "x.tar", "x.tar.gz", "x.tar-fr.gz"},
		{"/abs/path.yml", ".yml", "path", "path.yml", "path-fr.yml"},
		{"a//b.json//", ".json", "b", "b.json", "b-fr.json"},
		{"café/übersicht.json", ".json", "übersicht", "übersicht.json", "übersicht-fr.json"},
		{"with space/file name.po", ".po", "file name", "file name.po", "file name-fr.po"},
		{"quote'(x)*!~.json", ".json", "quote'(x)*!~", "quote'(x)*!~.json", "quote'(x)*!~-fr.json"},
		{"%2F.json", ".json", "%2F", "%2F.json", "%2F-fr.json"},
		{`a\b.json`, ".json", `a\b`, `a\b.json`, `a\b-fr.json`},
		{"", "", "", "", "-fr.json"},
		{".", "", ".", ".", ".-fr.json"},
		{"/", "", "", "", "-fr.json"},
		{"x/..", "", "..", "..", "..-fr.json"},
		{"x/.hidden.json", ".json", ".hidden", ".hidden.json", ".hidden-fr.json"},
	} {
		require.Equal(t, tc.ext, nodePathExtname(tc.path), "extname(%q)", tc.path)
		require.Equal(t, tc.base, nodePathBasename(tc.path, tc.ext), "basename(%q, %q)", tc.path, tc.ext)
		require.Equal(t, tc.plain, nodePathBasename(tc.path, ""), "basename(%q)", tc.path)
		require.Equal(t, tc.file, publicTranslationFilename(tc.path, "fr"), "filename(%q)", tc.path)
	}
}

func TestPublicTranslationFilenameLocaleSuffix(t *testing.T) {
	for _, tc := range []struct{ path, locale, want string }{
		{"en.json", "en", "en-en.json"},
		{"en-en.json", "en", "en-en.json"},
		{"strings.xml", "pt-BR", "strings-pt-BR.xml"},
		{"x.json", "fr/../x", "x-fr/../x.json"},
		{"x.json", "日本", "x-日本.json"},
	} {
		require.Equal(t, tc.want, publicTranslationFilename(tc.path, tc.locale), "%q %q", tc.path, tc.locale)
	}
}

func TestEncodeURIComponentMatchesJavaScript(t *testing.T) {
	for input, want := range map[string]string{
		"en-fr.json":           "en-fr.json",
		"a b.json":             "a%20b.json",
		"café-fr.json":         "caf%C3%A9-fr.json",
		"quote'(x)*!~-fr.json": "quote'(x)*!~-fr.json",
		`x;y=z,"q".json`:       "x%3By%3Dz%2C%22q%22.json",
		"😀.json":               "%F0%9F%98%80.json",
		"%2F-fr.json":          "%252F-fr.json",
		"a+b&c#d?e.json":       "a%2Bb%26c%23d%3Fe.json",
	} {
		require.Equal(t, want, encodeURIComponent(input), input)
	}
	require.Equal(t, "attachment; filename*=UTF-8''caf%C3%A9-fr.json", publicTranslationContentDisposition("café-fr.json"))
}

func TestPublicTranslationObjectMatchesJSONStringify(t *testing.T) {
	object := newPublicTranslationObject()
	for _, kv := range [][2]string{
		{"b", "1"},
		{"10", "ten"},
		{"2", "two"},
		{"a", "<script>&amp;</script>"},
		{"01", "leading"},
		{"4294967294", "maxidx"},
		{"4294967295", "notidx"},
		{"-1", "neg"},
		{"__proto__", "dropped"},
		{"ctl", "\x00\x01\b\t\n\v\f\r\x1f\x7f"},
		{"ls", "\u2028\u2029"},
		{"q", `"\/`},
		{"uni", "é日😀"},
		{"b", "overwritten"},
	} {
		object.set(kv[0], kv[1])
	}

	want := "{\n" +
		"  \"2\": \"two\",\n" +
		"  \"10\": \"ten\",\n" +
		"  \"4294967294\": \"maxidx\",\n" +
		"  \"b\": \"overwritten\",\n" +
		"  \"a\": \"<script>&amp;</script>\",\n" +
		"  \"01\": \"leading\",\n" +
		"  \"4294967295\": \"notidx\",\n" +
		"  \"-1\": \"neg\",\n" +
		"  \"ctl\": \"\\u0000\\u0001\\b\\t\\n\\u000b\\f\\r\\u001f\x7f\",\n" +
		"  \"ls\": \"\u2028\u2029\",\n" +
		"  \"q\": \"\\\"\\\\/\",\n" +
		"  \"uni\": \"é日😀\"\n" +
		"}\n"
	require.Equal(t, want, string(object.marshal()))
}

func TestPublicTranslationObjectEmpty(t *testing.T) {
	object := newPublicTranslationObject()
	object.set("__proto__", "dropped")
	require.Equal(t, "{}\n", string(object.marshal()))
	require.Empty(t, object.orderedKeys())
}

func TestIsLottieTranslationSource(t *testing.T) {
	lottieKeys := []string{"layers[0].t.d.k[0].s.t", "assets[2].layers[10].t.d.k[3].s.t"}

	require.True(t, isLottieTranslationSource("anim/intro.lottie", nil))
	require.True(t, isLottieTranslationSource("anim/INTRO.LOTTIE", []string{"title"}))
	require.True(t, isLottieTranslationSource("anim/intro.json", lottieKeys))
	require.True(t, isLottieTranslationSource("anim/intro.JSON", lottieKeys))

	require.False(t, isLottieTranslationSource("anim/intro.json", nil))
	require.False(t, isLottieTranslationSource("anim/intro.json", append([]string{"title"}, lottieKeys...)))
	require.False(t, isLottieTranslationSource("anim/intro.json", []string{"layers[0].t.d.k[0].s.t\n"}))
	require.False(t, isLottieTranslationSource("anim/intro.json", []string{"layers[a].t.d.k[0].s.t"}))
	require.False(t, isLottieTranslationSource("anim/intro.yaml", lottieKeys))
	require.False(t, isLottieTranslationSource("anim.json/intro", lottieKeys))
	require.False(t, isLottieTranslationSource("intro", lottieKeys))
}

func TestPublicTranslationValue(t *testing.T) {
	ptr := func(value string) *string { return &value }
	for _, tc := range []struct {
		name         string
		source       string
		hidden       bool
		text, status *string
		want         string
	}{
		{"missing translation", "Hello", false, nil, nil, "Hello"},
		{"approved", "Hello", false, ptr("Bonjour"), ptr("approved"), "Bonjour"},
		{"draft", "Hello", false, ptr("Bonjour"), ptr("draft"), "Bonjour"},
		{"rejected", "Hello", false, ptr("Bonjour"), ptr("rejected"), "Hello"},
		{"blank", "Hello", false, ptr(" \u00a0\ufeff\n"), ptr("approved"), "Hello"},
		{"needs review same multi word source", "Hello world", false, ptr(" Hello world "), ptr("needs_review"), "Hello world"},
		{"needs review same single word source", "OK", false, ptr("OK"), ptr("needs_review"), "OK"},
		{"needs review different text", "Hello world", false, ptr("Bonjour le monde"), ptr("needs_review"), "Bonjour le monde"},
		{"approved same multi word source", "Hello world", false, ptr("Hello world"), ptr("approved"), "Hello world"},
		{"hidden needs review same source", "Hello world", true, ptr(" Hello world "), ptr("needs_review"), " Hello world "},
		{"hidden untranslated", "Hello", true, nil, nil, "Hello"},
		{"hidden rejected", "Hello", true, ptr("Bonjour"), ptr("rejected"), "Hello"},
	} {
		require.Equal(t, tc.want, publicTranslationValue(tc.source, tc.hidden, tc.text, tc.status), tc.name)
	}
}

func TestIsSameAsSourcePrefillWordCount(t *testing.T) {
	require.True(t, isSameAsSourcePrefill("Hello\u3000world", "Hello\u3000world"))
	require.False(t, isSameAsSourcePrefill("Hello", "Hello"))
	require.False(t, isSameAsSourcePrefill("", ""))
	require.False(t, isSameAsSourcePrefill("Hello world", "Hello  world"))
}

func TestRequestLogPathBoundsPublicProjectRoutes(t *testing.T) {
	require.Equal(t, "/v1/projects/{projectId}/{resource}", requestLogPath("/v1/projects/project_secret/translations/download"))
	require.Equal(t, "/v1/projects/{projectId}/{resource}", requestLogPath("/v1/projects/ext:crowdin:42"))
}
