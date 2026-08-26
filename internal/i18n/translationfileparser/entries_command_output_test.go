package translationfileparser

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestEncodeEntriesCommandOutput(t *testing.T) {
	t.Parallel()

	t.Run("empty map", func(t *testing.T) {
		t.Parallel()
		got := EncodeEntriesCommandOutput(nil)
		if len(got) != 0 {
			t.Fatalf("EncodeEntriesCommandOutput(nil) = %#v, want empty map", got)
		}
		got = EncodeEntriesCommandOutput(map[string]IngestEntry{})
		if len(got) != 0 {
			t.Fatalf("EncodeEntriesCommandOutput(empty) = %#v, want empty map", got)
		}
	})

	t.Run("plain string when maxLength missing or non-positive", func(t *testing.T) {
		t.Parallel()
		got := EncodeEntriesCommandOutput(map[string]IngestEntry{
			"plain": {Text: "Hello"},
			"zero":  {Text: "Zero", MaxLength: 0},
			"neg":   {Text: "Neg", MaxLength: -5},
		})

		want := map[string]EntriesCommandOutputValue{
			"plain": "Hello",
			"zero":  "Zero",
			"neg":   "Neg",
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("EncodeEntriesCommandOutput() = %#v, want %#v", got, want)
		}
	})

	t.Run("object payload when maxLength is positive", func(t *testing.T) {
		t.Parallel()
		got := EncodeEntriesCommandOutput(map[string]IngestEntry{
			"cta":   {Text: "Continue", MaxLength: 24},
			"plain": {Text: "No limit"},
		})

		raw, err := json.Marshal(got)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}

		var decoded map[string]json.RawMessage
		if err := json.Unmarshal(raw, &decoded); err != nil {
			t.Fatalf("unmarshal wrapper: %v", err)
		}

		var plain string
		if err := json.Unmarshal(decoded["plain"], &plain); err != nil {
			t.Fatalf("plain decode: %v", err)
		}
		if plain != "No limit" {
			t.Fatalf("plain = %q, want %q", plain, "No limit")
		}

		var enriched struct {
			Text      string `json:"text"`
			MaxLength int    `json:"maxLength"`
		}
		if err := json.Unmarshal(decoded["cta"], &enriched); err != nil {
			t.Fatalf("cta decode: %v", err)
		}
		if enriched.Text != "Continue" || enriched.MaxLength != 24 {
			t.Fatalf("cta = %+v, want text=Continue maxLength=24", enriched)
		}
	})
}
