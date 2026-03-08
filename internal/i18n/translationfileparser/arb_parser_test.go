package translationfileparser

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestARBParserSkipsMetadataKeys(t *testing.T) {
	content := []byte(`{
  "@@locale": "en",
  "hello": "Hello",
  "@hello": {
    "description": "Greeting"
  }
}`)

	got, err := (ARBParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if got["hello"] != "Hello" {
		t.Fatalf("unexpected hello translation: %q", got["hello"])
	}
	if _, ok := got["@hello"]; ok {
		t.Fatalf("metadata key @hello must not be parsed as translatable entry")
	}
	if _, ok := got["@@locale"]; ok {
		t.Fatalf("metadata key @@locale must not be parsed as translatable entry")
	}
}

func TestARBParserRejectsNonStringMessageValues(t *testing.T) {
	_, err := (ARBParser{}).Parse([]byte(`{
  "count": 1
}`))
	if err == nil {
		t.Fatalf("expected parse error for non-string message value")
	}
}

func TestMarshalARBPreservesMetadataAndICUContent(t *testing.T) {
	template := []byte(`{
  "@@locale": "en",
  "inviteCount": "{count, plural, =0{No invites} one{1 invite} other{{count} invites}}",
  "@inviteCount": {
    "description": "Inbox invitation count",
    "placeholders": {
      "count": {
        "type": "int"
      }
    }
  },
  "hello": "Hello {name}",
  "@hello": {
    "description": "Greets the user",
    "placeholders": {
      "name": {}
    }
  }
}`)

	out, err := MarshalARB(template, map[string]string{
		"inviteCount": "{count, plural, =0{Aucune invitation} one{1 invitation} other{{count} invitations}}",
		"hello":       "Bonjour {name}",
	})
	if err != nil {
		t.Fatalf("marshal arb: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(out, &payload); err != nil {
		t.Fatalf("decode marshaled arb: %v", err)
	}

	if payload["hello"] != "Bonjour {name}" {
		t.Fatalf("unexpected hello translation: %#v", payload["hello"])
	}
	if payload["inviteCount"] != "{count, plural, =0{Aucune invitation} one{1 invitation} other{{count} invitations}}" {
		t.Fatalf("unexpected inviteCount translation: %#v", payload["inviteCount"])
	}
	if payload["@@locale"] != "en" {
		t.Fatalf("expected @@locale metadata preserved, got %#v", payload["@@locale"])
	}

	metaHello, ok := payload["@hello"].(map[string]any)
	if !ok {
		t.Fatalf("expected @hello metadata object, got %#v", payload["@hello"])
	}
	if metaHello["description"] != "Greets the user" {
		t.Fatalf("expected @hello.description metadata preserved, got %#v", metaHello["description"])
	}
}

func TestARBParserParseWithContextIncludesDescriptions(t *testing.T) {
	content := []byte(`{
  "hello": "Hello",
  "@hello": {
    "description": "Greeting"
  },
  "bye": "Bye"
}`)

	messages, contextByKey, err := (ARBParser{}).ParseWithContext(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if messages["hello"] != "Hello" {
		t.Fatalf("unexpected hello translation: %q", messages["hello"])
	}
	if contextByKey["hello"] != "Greeting" {
		t.Fatalf("unexpected hello context: %q", contextByKey["hello"])
	}
	if _, ok := contextByKey["bye"]; ok {
		t.Fatalf("did not expect context for bye")
	}
}

func TestMarshalARBStructureFirstAndDeterministicAppend(t *testing.T) {
	template := []byte(`{
  "@@locale": "fr",
  "hello": "Bonjour",
  "@hello": {
    "description": "target-hello"
  },
  "bye": "Au revoir",
  "@custom": {
    "owner": "mobile"
  }
}`)

	out, err := MarshalARB(template, map[string]string{
		"hello": "Salut",
		"new_b": "B",
		"new_a": "A",
	})
	if err != nil {
		t.Fatalf("marshal arb: %v", err)
	}

	rendered := string(out)
	helloIdx := strings.Index(rendered, `"hello": "Salut"`)
	metaIdx := strings.Index(rendered, `"@hello": {`)
	customIdx := strings.Index(rendered, `"@custom": {`)
	newAIdx := strings.Index(rendered, `"new_a": "A"`)
	newBIdx := strings.Index(rendered, `"new_b": "B"`)
	if helloIdx == -1 || metaIdx == -1 || customIdx == -1 || newAIdx == -1 || newBIdx == -1 {
		t.Fatalf("expected structure and new keys in rendered output, got %q", rendered)
	}
	if metaIdx < helloIdx {
		t.Fatalf("expected existing metadata to remain after existing key, got %q", rendered)
	}
	if customIdx < metaIdx {
		t.Fatalf("expected unrelated metadata block retained in original position, got %q", rendered)
	}
	if !(newAIdx < newBIdx && customIdx < newAIdx) {
		t.Fatalf("expected new keys appended in sorted order after template structure, got %q", rendered)
	}
	if strings.Contains(rendered, `"bye":`) {
		t.Fatalf("expected missing translatable key to be removed, got %q", rendered)
	}
}
