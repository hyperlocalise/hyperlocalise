package segmentvalidate

import "testing"

func TestWebVTTCueMarkupParity(t *testing.T) {
	tests := []struct {
		name        string
		source      string
		translated  string
		wantMismatch bool
	}{
		{
			name:         "class_span_preserved",
			source:       "<c.red>Hello</c>",
			translated:   "<c.red>Bonjour</c>",
			wantMismatch: false,
		},
		{
			name:         "class_span_dropped",
			source:       "<c.red>Hello</c>",
			translated:   "Bonjour",
			wantMismatch: true,
		},
		{
			name:         "karaoke_timestamp_preserved",
			source:       "Hello <00:01.000>world",
			translated:   "Bonjour <00:01.000>monde",
			wantMismatch: false,
		},
		{
			name:         "karaoke_timestamp_dropped",
			source:       "Hello <00:01.000>world",
			translated:   "Bonjour",
			wantMismatch: true,
		},
		{
			name:         "voice_annotation_preserved",
			source:       "<v Speaker>Hello",
			translated:   "<v Speaker>Bonjour",
			wantMismatch: false,
		},
		{
			name:         "voice_annotation_dropped",
			source:       "<v Speaker>Hello",
			translated:   "Bonjour",
			wantMismatch: true,
		},
		{
			name:         "italic_html_span_preserved",
			source:       "<i>Hello</i>",
			translated:   "<i>Bonjour</i>",
			wantMismatch: false,
		},
		{
			name:         "plain_text",
			source:       "Hello",
			translated:   "Bonjour",
			wantMismatch: false,
		},
		{
			name:         "identical",
			source:       "<c.red>Hello</c>",
			translated:   "<c.red>Hello</c>",
			wantMismatch: false,
		},
		{
			name:         "comparison_angle_not_markup",
			source:       "a < b",
			translated:   "a < c",
			wantMismatch: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := webvttCueMarkupMismatch(tt.source, tt.translated); got != tt.wantMismatch {
				t.Fatalf("webvttCueMarkupMismatch(%q, %q) = %v, want %v", tt.source, tt.translated, got, tt.wantMismatch)
			}
		})
	}
}

func TestIsWebVTTCueTimestampToken(t *testing.T) {
	if !isWebVTTCueTimestampToken("00:01.000") {
		t.Fatal("expected mm:ss.mmm timestamp")
	}
	if !isWebVTTCueTimestampToken("100:00:00.000") {
		t.Fatal("expected long hours timestamp")
	}
	if isWebVTTCueTimestampToken("3") {
		t.Fatal("bare number is not a cue timestamp")
	}
	if isWebVTTCueTimestampToken("c.red") {
		t.Fatal("class name is not a timestamp")
	}
}
