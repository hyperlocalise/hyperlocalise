package translationfileparser

import (
	"strings"
	"testing"
)

// These cases lock the #1704 streaming hasXLIFFTargetElement contract: literal
// "<target>" text in comments/CDATA must not flip source→target selection, while
// a real (including prefixed) target element must.

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
	if !strings.Contains(content, "<source>Bonjour</source>") {
		t.Fatalf("expected source rewrite when only comment mentions target, got %q", content)
	}
	// Comments may still contain the literal text "<target>"; assert no real element.
	if strings.Contains(content, "<target>") && !strings.Contains(content, "<!-- <target>") {
		t.Fatalf("expected no real target element to be introduced, got %q", content)
	}
	if strings.Contains(content, "<source>Hello</source>") {
		t.Fatalf("expected original source text to be replaced, got %q", content)
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
	if !strings.Contains(content, "<source>Bonjour</source>") {
		t.Fatalf("expected source rewrite when CDATA only mentions target, got %q", content)
	}
	if strings.Count(content, "<target>") != 0 {
		t.Fatalf("expected no real target element, got %q", content)
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
	if !strings.Contains(content, "<source>Second</source>") {
		t.Fatalf("expected second unit source rewritten independently, got %q", content)
	}
}
