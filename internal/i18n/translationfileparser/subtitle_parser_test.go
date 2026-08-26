package translationfileparser

import (
	"reflect"
	"strings"
	"testing"
)

const sampleSRT = `1
00:00:00,000 --> 00:00:02,500
Hello world

2
00:00:02,500 --> 00:00:05,000
This is a subtitle
on two lines

3
00:00:05,000 --> 00:00:07,000
<i>Italic line</i>
`

const sampleVTT = `WEBVTT

NOTE Intro credits

STYLE
::cue { color: white }

intro
00:00:00.000 --> 00:00:02.500 align:start
Hello world

00:00:02.500 --> 00:00:05.000
This is a subtitle
on two lines
`

func TestSubtitleParserParsesSRTCuesAndContext(t *testing.T) {
	values, ctx, err := (SubtitleParser{Kind: SubtitleSRT}).ParseWithContext([]byte(sampleSRT))
	if err != nil {
		t.Fatalf("parse srt: %v", err)
	}

	want := map[string]string{
		"srt.0001": "Hello world",
		"srt.0002": "This is a subtitle\non two lines",
		"srt.0003": "<i>Italic line</i>",
	}
	if !reflect.DeepEqual(values, want) {
		t.Fatalf("parsed values mismatch\n got: %#v\nwant: %#v", values, want)
	}
	if ctx["srt.0001"] != "00:00:00,000 --> 00:00:02,500" {
		t.Fatalf("unexpected srt.0001 context: %q", ctx["srt.0001"])
	}
	if ctx["srt.0002"] != "00:00:02,500 --> 00:00:05,000" {
		t.Fatalf("unexpected srt.0002 context: %q", ctx["srt.0002"])
	}
}

func TestSubtitleParserParsesVTTCuesNotesAndSettings(t *testing.T) {
	values, ctx, err := (SubtitleParser{Kind: SubtitleVTT}).ParseWithContext([]byte(sampleVTT))
	if err != nil {
		t.Fatalf("parse vtt: %v", err)
	}

	want := map[string]string{
		"vtt.0001": "Hello world",
		"vtt.0002": "This is a subtitle\non two lines",
	}
	if !reflect.DeepEqual(values, want) {
		t.Fatalf("parsed values mismatch\n got: %#v\nwant: %#v", values, want)
	}
	if ctx["vtt.0001"] != "intro · 00:00:00.000 --> 00:00:02.500 align:start" {
		t.Fatalf("unexpected vtt.0001 context: %q", ctx["vtt.0001"])
	}
	if ctx["vtt.0002"] != "00:00:02.500 --> 00:00:05.000" {
		t.Fatalf("unexpected vtt.0002 context: %q", ctx["vtt.0002"])
	}
}

func TestMarshalSubtitlesReplacesCueTextAndPreservesStructure(t *testing.T) {
	out, err := MarshalSubtitles([]byte(sampleSRT), map[string]string{
		"srt.0001": "Bonjour le monde",
		"srt.0002": "Ceci est un sous-titre\nsur deux lignes",
		"srt.0003": "<i>Ligne en italique</i>",
	}, SubtitleSRT)
	if err != nil {
		t.Fatalf("marshal srt: %v", err)
	}

	got := string(out)
	if !strings.Contains(got, "1\n00:00:00,000 --> 00:00:02,500\nBonjour le monde\n") {
		t.Fatalf("missing translated first cue:\n%s", got)
	}
	if strings.Contains(got, "Hello world") || strings.Contains(got, "This is a subtitle") {
		t.Fatalf("source cue text should be replaced:\n%s", got)
	}
	if !strings.Contains(got, "Ceci est un sous-titre\nsur deux lignes") {
		t.Fatalf("missing translated second cue:\n%s", got)
	}
	if !strings.Contains(got, "<i>Ligne en italique</i>") {
		t.Fatalf("missing translated italic cue:\n%s", got)
	}
}

func TestMarshalSubtitlesIsIdempotentWhenValuesMatchSource(t *testing.T) {
	parser := SubtitleParser{Kind: SubtitleSRT}
	values, err := parser.Parse([]byte(sampleSRT))
	if err != nil {
		t.Fatalf("parse srt: %v", err)
	}
	out, err := MarshalSubtitles([]byte(sampleSRT), values, SubtitleSRT)
	if err != nil {
		t.Fatalf("marshal srt: %v", err)
	}
	if string(out) != sampleSRT {
		t.Fatalf("idempotent marshal mismatch\n got: %q\nwant: %q", string(out), sampleSRT)
	}
}

func TestMarshalSubtitlesPreservesCRLFAndDropsBlankCueLines(t *testing.T) {
	template := "1\r\n00:00:00,000 --> 00:00:01,000\r\nHello\r\n\r\n"
	out, err := MarshalSubtitles([]byte(template), map[string]string{
		"srt.0001": "Bonjour\n\nle monde\n",
	}, SubtitleSRT)
	if err != nil {
		t.Fatalf("marshal srt: %v", err)
	}
	if string(out) != "1\r\n00:00:00,000 --> 00:00:01,000\r\nBonjour\r\nle monde\r\n\r\n" {
		t.Fatalf("unexpected crlf marshal output: %q", string(out))
	}
}

func TestMarshalSubtitlesKeepsSourceWhenKeyMissing(t *testing.T) {
	out, err := MarshalSubtitles([]byte(sampleSRT), map[string]string{
		"srt.0001": "Bonjour le monde",
	}, SubtitleSRT)
	if err != nil {
		t.Fatalf("marshal srt: %v", err)
	}
	got := string(out)
	if !strings.Contains(got, "Bonjour le monde") {
		t.Fatalf("missing translated cue: %q", got)
	}
	if !strings.Contains(got, "This is a subtitle\non two lines") {
		t.Fatalf("expected source fallback for missing key: %q", got)
	}
}

func TestMarshalVTTPreservesHeaderNotesAndSettings(t *testing.T) {
	out, err := MarshalSubtitles([]byte(sampleVTT), map[string]string{
		"vtt.0001": "Bonjour le monde",
		"vtt.0002": "Ceci est un sous-titre\nsur deux lignes",
	}, SubtitleVTT)
	if err != nil {
		t.Fatalf("marshal vtt: %v", err)
	}
	got := string(out)
	if !strings.HasPrefix(got, "WEBVTT\n") {
		t.Fatalf("expected WEBVTT header, got %q", got)
	}
	if !strings.Contains(got, "NOTE Intro credits") || !strings.Contains(got, "::cue { color: white }") {
		t.Fatalf("expected NOTE and STYLE preserved, got %q", got)
	}
	if !strings.Contains(got, "intro\n00:00:00.000 --> 00:00:02.500 align:start\nBonjour le monde\n") {
		t.Fatalf("missing translated vtt cue with settings: %q", got)
	}
}

func TestSubtitleParserStripsBOMAndSkipsEmptyCues(t *testing.T) {
	content := []byte("\uFEFF1\n00:00:00,000 --> 00:00:01,000\nHello\n\n2\n00:00:01,000 --> 00:00:02,000\n\n")
	values, err := (SubtitleParser{Kind: SubtitleSRT}).Parse(content)
	if err != nil {
		t.Fatalf("parse srt: %v", err)
	}
	if len(values) != 1 || values["srt.0001"] != "Hello" {
		t.Fatalf("unexpected values: %#v", values)
	}
}

func TestSubtitleParserRejectsInvalidUTF8AndMissingTimestamps(t *testing.T) {
	_, err := (SubtitleParser{Kind: SubtitleSRT}).Parse([]byte{0xff, 0xfe, 'a'})
	if err == nil || !strings.Contains(err.Error(), "UTF-8") {
		t.Fatalf("expected utf-8 error, got %v", err)
	}

	_, err = (SubtitleParser{Kind: SubtitleSRT}).Parse([]byte("1\nHello without a timestamp\n"))
	if err == nil || !strings.Contains(err.Error(), "missing timestamp") {
		t.Fatalf("expected timestamp error, got %v", err)
	}

	_, err = (SubtitleParser{Kind: SubtitleVTT}).Parse([]byte("1\n00:00:00.000 --> 00:00:01.000\nHello\n"))
	if err == nil || !strings.Contains(err.Error(), "WEBVTT") {
		t.Fatalf("expected WEBVTT header error, got %v", err)
	}

	_, err = (SubtitleParser{Kind: SubtitleSRT}).Parse([]byte("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n"))
	if err == nil || !strings.Contains(err.Error(), "WebVTT") {
		t.Fatalf("expected srt/webvtt mismatch error, got %v", err)
	}
}

func TestSubtitleParserAcceptsEmptyFile(t *testing.T) {
	values, err := (SubtitleParser{Kind: SubtitleSRT}).Parse([]byte(""))
	if err != nil {
		t.Fatalf("parse empty srt: %v", err)
	}
	if len(values) != 0 {
		t.Fatalf("expected no entries, got %#v", values)
	}
}

func TestSubtitleParserAcceptsDotMillisecondsAndPositioning(t *testing.T) {
	content := []byte("1\n0:00:01.500 --> 0:00:03.000 X1:0 X2:100\nHi\n")
	values, ctx, err := (SubtitleParser{Kind: SubtitleSRT}).ParseWithContext(content)
	if err != nil {
		t.Fatalf("parse srt: %v", err)
	}
	if values["srt.0001"] != "Hi" {
		t.Fatalf("unexpected value: %#v", values)
	}
	if ctx["srt.0001"] != "0:00:01.500 --> 0:00:03.000 X1:0 X2:100" {
		t.Fatalf("unexpected context: %q", ctx["srt.0001"])
	}
}

func TestSubtitleParserAcceptsWebVTTHoursBeyond99(t *testing.T) {
	content := []byte("WEBVTT\n\n100:00:00.000 --> 100:00:01.000\nHello\n")
	values, ctx, err := (SubtitleParser{Kind: SubtitleVTT}).ParseWithContext(content)
	if err != nil {
		t.Fatalf("parse vtt: %v", err)
	}
	if values["vtt.0001"] != "Hello" {
		t.Fatalf("unexpected values: %#v", values)
	}
	if ctx["vtt.0001"] != "100:00:00.000 --> 100:00:01.000" {
		t.Fatalf("unexpected context: %q", ctx["vtt.0001"])
	}
}

func TestSubtitleCueStructureEqualComparesTimingsNotCounts(t *testing.T) {
	source := []byte("1\n00:00:00,000 --> 00:00:01,000\nNew intro\n\n2\n00:00:01,000 --> 00:00:02,000\nHello\n\n")
	staleTarget := []byte("1\n00:00:01,000 --> 00:00:02,000\nSalut\n\n2\n00:00:02,000 --> 00:00:03,000\nBye\n\n")
	matchingTarget := []byte("1\n00:00:00,000 --> 00:00:01,000\nSalut\n\n2\n00:00:01,000 --> 00:00:02,000\nBonjour\n\n")
	if SubtitleCueStructureEqual(source, staleTarget, SubtitleSRT) {
		t.Fatal("expected stale timings to differ")
	}
	if !SubtitleCueStructureEqual(source, matchingTarget, SubtitleSRT) {
		t.Fatal("expected matching timings to be equal")
	}
	if SubtitleCueStructureEqual(source, []byte{0xff, 0xfe}, SubtitleSRT) {
		t.Fatal("invalid target should not match")
	}
}

func TestIsBlankSubtitleLineMatchesTrimSpace(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		in   string
		want bool
	}{
		{name: "empty", in: "", want: true},
		{name: "spaces", in: "   ", want: true},
		{name: "tabs", in: "\t\t", want: true},
		{name: "crlf", in: "\r\n", want: true},
		{name: "verticalTab", in: "\v", want: true},
		{name: "formFeed", in: "\f", want: true},
		{name: "mixedAsciiWhitespace", in: " \t\v\f\r\n", want: true},
		{name: "nbsp", in: "\u00a0", want: true},
		{name: "nextLine", in: "\u0085", want: true},
		{name: "emSpace", in: "\u2003", want: true},
		{name: "ideographicSpace", in: "\u3000", want: true},
		{name: "nbspSurroundedByAscii", in: " \u00a0\t", want: true},
		{name: "text", in: "Hello", want: false},
		{name: "textWithLeadingSpace", in: " Hello", want: false},
		{name: "nbspThenText", in: "\u00a0Hello", want: false},
		{name: "formFeedThenText", in: "\fHello", want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := isBlankSubtitleLine(tc.in); got != tc.want {
				t.Fatalf("isBlankSubtitleLine(%q) = %v, want %v", tc.in, got, tc.want)
			}
			if got := strings.TrimSpace(tc.in) == ""; got != tc.want {
				t.Fatalf("strings.TrimSpace(%q) == \"\" = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

func TestSubtitleParserSplitsCuesOnUnicodeWhitespaceSeparators(t *testing.T) {
	t.Parallel()

	separators := []struct {
		name string
		sep  string
	}{
		{name: "formFeed", sep: "\f"},
		{name: "verticalTab", sep: "\v"},
		{name: "nbsp", sep: "\u00a0"},
		{name: "nextLine", sep: "\u0085"},
		{name: "ideographicSpace", sep: "\u3000"},
	}

	for _, tc := range separators {
		t.Run("srt/"+tc.name, func(t *testing.T) {
			t.Parallel()
			content := []byte("1\n00:00:00,000 --> 00:00:01,000\nHello\n" + tc.sep + "\n2\n00:00:01,000 --> 00:00:02,000\nWorld\n")
			values, err := (SubtitleParser{Kind: SubtitleSRT}).Parse(content)
			if err != nil {
				t.Fatalf("parse srt: %v", err)
			}
			want := map[string]string{
				"srt.0001": "Hello",
				"srt.0002": "World",
			}
			if !reflect.DeepEqual(values, want) {
				t.Fatalf("parsed values mismatch\n got: %#v\nwant: %#v", values, want)
			}
		})
		t.Run("vtt/"+tc.name, func(t *testing.T) {
			t.Parallel()
			content := []byte("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n" + tc.sep + "\n00:00:01.000 --> 00:00:02.000\nWorld\n")
			values, err := (SubtitleParser{Kind: SubtitleVTT}).Parse(content)
			if err != nil {
				t.Fatalf("parse vtt: %v", err)
			}
			want := map[string]string{
				"vtt.0001": "Hello",
				"vtt.0002": "World",
			}
			if !reflect.DeepEqual(values, want) {
				t.Fatalf("parsed values mismatch\n got: %#v\nwant: %#v", values, want)
			}
		})
	}
}

func TestMarshalSubtitlesDropsUnicodeWhitespaceCueLines(t *testing.T) {
	t.Parallel()

	out, err := MarshalSubtitles([]byte("1\n00:00:00,000 --> 00:00:01,000\nHello\n\n"), map[string]string{
		"srt.0001": "Bonjour\n\u00a0\nle monde\n\f\n",
	}, SubtitleSRT)
	if err != nil {
		t.Fatalf("marshal srt: %v", err)
	}
	if string(out) != "1\n00:00:00,000 --> 00:00:01,000\nBonjour\nle monde\n\n" {
		t.Fatalf("unexpected marshal output: %q", string(out))
	}
}

func TestIsAllDecimalDigitsAcceptsUnicodeNd(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		in   string
		want bool
	}{
		{name: "empty", in: "", want: false},
		{name: "asciiDigits", in: "12345", want: true},
		{name: "asciiLetter", in: "12a", want: false},
		{name: "arabicIndic", in: "١٢٣", want: true},
		{name: "mixedAsciiAndArabicIndic", in: "1٢3", want: true},
		{name: "fullwidthDigits", in: "１２３", want: true},
		{name: "arabicIndicWithLetter", in: "١a", want: false},
		{name: "customIdentifier", in: "intro_cue", want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := isAllDecimalDigits(tc.in); got != tc.want {
				t.Fatalf("isAllDecimalDigits(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

func TestSubtitleCueTreatsUnicodeDecimalIdentifiersAsCounters(t *testing.T) {
	source := []byte("١\n00:00:00,000 --> 00:00:01,000\nHello\n\n٢\n00:00:01,000 --> 00:00:02,000\nWorld\n")
	renumbered := []byte("٣\n00:00:00,000 --> 00:00:01,000\nSalut\n\n٤\n00:00:01,000 --> 00:00:02,000\nMonde\n")
	named := []byte("مقدمة\n00:00:00,000 --> 00:00:01,000\nHello\n\nخاتمة\n00:00:01,000 --> 00:00:02,000\nWorld\n")

	_, ctx, err := (SubtitleParser{Kind: SubtitleSRT}).ParseWithContext(source)
	if err != nil {
		t.Fatalf("parse srt: %v", err)
	}
	if ctx["srt.0001"] != "00:00:00,000 --> 00:00:01,000" {
		t.Fatalf("unicode decimal identifier should not prefix context: %q", ctx["srt.0001"])
	}
	if ctx["srt.0002"] != "00:00:01,000 --> 00:00:02,000" {
		t.Fatalf("unicode decimal identifier should not prefix context: %q", ctx["srt.0002"])
	}

	if !SubtitleCueStructureEqual(source, renumbered, SubtitleSRT) {
		t.Fatal("renumbered unicode decimal counters should still match by timing")
	}
	if SubtitleCueStructureEqual(source, named, SubtitleSRT) {
		t.Fatal("non-digit unicode identifiers should participate in structural equality")
	}

	_, namedCtx, err := (SubtitleParser{Kind: SubtitleSRT}).ParseWithContext(named)
	if err != nil {
		t.Fatalf("parse named srt: %v", err)
	}
	if namedCtx["srt.0001"] != "مقدمة · 00:00:00,000 --> 00:00:01,000" {
		t.Fatalf("non-digit unicode identifier should prefix context: %q", namedCtx["srt.0001"])
	}
}
