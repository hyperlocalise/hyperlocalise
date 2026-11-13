package translationfileparser

import (
	"strings"
	"testing"
)

// Target discovery ignores comments and CDATA and recognizes prefixed elements.
// Missing targets are created without changing the source.

func TestMarshalXLIFFIgnoresTargetLiteralInsideComment(t *testing.T) {
	template := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en-US">
    <body>
      <trans-unit id="hello">
        <source>Hello</source>
        <!-- do not treat &lt;target&gt;fake&lt;/target&gt; as a real target -->
        <!-- <target>fake</target> -->
      </trans-unit>
    </body>
  </file>
</xliff>`)

	out, err := MarshalXLIFF(template, map[string]string{"hello": "Bonjour"}, "en-US", "fr-FR")
	if err != nil {
		t.Fatalf("marshal xliff: %v", err)
	}

	content := string(out)
	if !strings.Contains(content, "<source>Hello</source><target>Bonjour</target>") || !strings.Contains(content, "<!-- <target>fake</target> -->") {
		t.Fatalf("expected real target created without modifying source or comments, got %q", content)
	}
}

func TestMarshalXLIFFIgnoresTargetLiteralInsideCDATA(t *testing.T) {
	template := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en-US">
    <body>
      <trans-unit id="hello">
        <source><![CDATA[<target>not-a-real-target</target>]]></source>
      </trans-unit>
    </body>
  </file>
</xliff>`)

	out, err := MarshalXLIFF(template, map[string]string{"hello": "Bonjour"}, "en-US", "fr-FR")
	if err != nil {
		t.Fatalf("marshal xliff: %v", err)
	}

	content := string(out)
	if !strings.Contains(content, "<source><![CDATA[<target>not-a-real-target</target>]]></source><target>Bonjour</target>") {
		t.Fatalf("expected CDATA source preserved and real target created, got %q", content)
	}
}

func TestMarshalXLIFFDetectsPrefixedTargetElement(t *testing.T) {
	template := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns:x="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en-US" target-language="fr">
    <body>
      <trans-unit id="hello">
        <source>Hello</source>
        <x:target state="translated">Hello</x:target>
      </trans-unit>
    </body>
  </file>
</xliff>`)

	out, err := MarshalXLIFF(template, map[string]string{"hello": "Bonjour"}, "en-US", "fr-FR")
	if err != nil {
		t.Fatalf("marshal xliff: %v", err)
	}

	content := string(out)
	if !strings.Contains(content, ">Hello</source>") {
		t.Fatalf("expected source preserved when prefixed target exists, got %q", content)
	}
	if !strings.Contains(content, "Bonjour") {
		t.Fatalf("expected prefixed target contents replaced, got %q", content)
	}
	if strings.Contains(content, "<source>Bonjour</source>") {
		t.Fatalf("expected source not rewritten when prefixed target exists, got %q", content)
	}
}

func TestMarshalXLIFFDoesNotLeakTargetDetectionAcrossUnits(t *testing.T) {
	template := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en-US" target-language="fr">
    <body>
      <trans-unit id="with-target">
        <source>Alpha</source>
        <target>Alpha</target>
      </trans-unit>
      <trans-unit id="source-only">
        <source>Beta</source>
      </trans-unit>
    </body>
  </file>
</xliff>`)

	out, err := MarshalXLIFF(template, map[string]string{
		"with-target": "Premier",
		"source-only": "Second",
	}, "en-US", "fr-FR")
	if err != nil {
		t.Fatalf("marshal xliff: %v", err)
	}

	content := string(out)
	if !strings.Contains(content, ">Alpha</source>") {
		t.Fatalf("expected first unit source preserved, got %q", content)
	}
	if !strings.Contains(content, ">Premier</target>") && !strings.Contains(content, "<target>Premier</target>") {
		t.Fatalf("expected first unit target replaced, got %q", content)
	}
	if !strings.Contains(content, "<source>Beta</source><target>Second</target>") {
		t.Fatalf("expected second unit target created independently, got %q", content)
	}
}
