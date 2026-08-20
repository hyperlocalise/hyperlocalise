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
