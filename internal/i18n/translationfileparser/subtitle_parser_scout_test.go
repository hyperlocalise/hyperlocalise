package translationfileparser

import (
	"testing"
)

func TestSubtitleParser_ScoutEdgeCases(t *testing.T) {
	t.Run("WebVTT_WithRegionBlocksAndCustomIdentifiers", func(t *testing.T) {
		content := []byte(`WEBVTT - Header info

REGION id:top width:100% lines:3
REGION id:bottom

NOTE region comment block

intro_cue
00:00:00.000 --> 00:00:02.000 region:top
Welcome to the stream

12345
00:00:02.000 --> 00:00:04.000 region:bottom
Second subtitle line
`)

		parser := SubtitleParser{Kind: SubtitleVTT}
		values, ctx, err := parser.ParseWithContext(content)
		if err != nil {
			t.Fatalf("unexpected error parsing WebVTT with REGION: %v", err)
		}

		if len(values) != 2 {
			t.Fatalf("expected 2 values, got %d: %#v", len(values), values)
		}

		if values["vtt.0001"] != "Welcome to the stream" {
			t.Errorf("vtt.0001 mismatch: got %q", values["vtt.0001"])
		}
		if values["vtt.0002"] != "Second subtitle line" {
			t.Errorf("vtt.0002 mismatch: got %q", values["vtt.0002"])
		}

		// Non-decimal identifier "intro_cue" should appear in context
		if ctx["vtt.0001"] != "intro_cue · 00:00:00.000 --> 00:00:02.000 region:top" {
			t.Errorf("vtt.0001 context mismatch: got %q", ctx["vtt.0001"])
		}

		// All-decimal digit identifier "12345" should NOT prefix context
		if ctx["vtt.0002"] != "00:00:02.000 --> 00:00:04.000 region:bottom" {
			t.Errorf("vtt.0002 context mismatch: got %q", ctx["vtt.0002"])
		}
	})

	t.Run("WebVTT_HeaderValidationEdgeCases", func(t *testing.T) {
		invalidHeaders := []struct {
			name    string
			content string
		}{
			{"MissingWEBVTT", "00:00:00.000 --> 00:00:01.000\nHello\n"},
			{"MalformedHeaderPrefix", "WEBVT\n00:00:00.000 --> 00:00:01.000\nHello\n"},
		}

		for _, tc := range invalidHeaders {
			t.Run(tc.name, func(t *testing.T) {
				_, err := (SubtitleParser{Kind: SubtitleVTT}).Parse([]byte(tc.content))
				if err == nil {
					t.Fatalf("expected error for invalid WebVTT header in %s", tc.name)
				}
			})
		}
	})

	t.Run("SubtitleCueStructureEqual_CustomIdentifiersAndMismatches", func(t *testing.T) {
		srt1 := []byte("custom_id_1\n00:00:00,000 --> 00:00:02,000\nHello\n\ncustom_id_2\n00:00:02,000 --> 00:00:04,000\nWorld\n")
		// Same timing, same custom identifier names
		srt1Matching := []byte("custom_id_1\n00:00:00,000 --> 00:00:02,000\nBonjour\n\ncustom_id_2\n00:00:02,000 --> 00:00:04,000\nMonde\n")
		// Different custom identifier name
		srt1DiffId := []byte("different_id\n00:00:00,000 --> 00:00:02,000\nBonjour\n\ncustom_id_2\n00:00:02,000 --> 00:00:04,000\nMonde\n")
		// Differing cue count
		srt1FewerCues := []byte("custom_id_1\n00:00:00,000 --> 00:00:02,000\nHello\n")

		if !SubtitleCueStructureEqual(srt1, srt1Matching, SubtitleSRT) {
			t.Error("expected matching timing and custom identifiers to be equal")
		}

		if SubtitleCueStructureEqual(srt1, srt1DiffId, SubtitleSRT) {
			t.Error("expected differing custom identifier to fail structural equality")
		}

		if SubtitleCueStructureEqual(srt1, srt1FewerCues, SubtitleSRT) {
			t.Error("expected differing cue counts to fail structural equality")
		}

		if SubtitleCueStructureEqual([]byte{0xff}, srt1, SubtitleSRT) {
			t.Error("expected invalid source UTF-8 to fail structural equality")
		}
	})
}
