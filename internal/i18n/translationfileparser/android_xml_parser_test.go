package translationfileparser

import (
	"reflect"
	"strings"
	"testing"
)

func TestAndroidXMLResourcesParserParsesStringsAndPlurals(t *testing.T) {
	content := []byte(`<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2">
  <!-- App-facing text -->
  <string name="app_name">Hyperlocalise</string>
  <string name="welcome" formatted="true">Hello <xliff:g id="user">%1$s</xliff:g></string>
  <string name="debug_only" translatable="false">Do not translate</string>
  <plurals name="item_count">
    <item quantity="one">%d item</item>
    <item quantity="other">%d items</item>
  </plurals>
</resources>`)

	got, err := (AndroidXMLResourcesParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse android resources: %v", err)
	}

	want := map[string]string{
		"app_name":         "Hyperlocalise",
		"welcome":          `Hello <xliff:g id="user">%1$s</xliff:g>`,
		"item_count.one":   "%d item",
		"item_count.other": "%d items",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parsed entries mismatch\n got: %#v\nwant: %#v", got, want)
	}
	if _, ok := got["debug_only"]; ok {
		t.Fatalf("translatable=false string should be skipped")
	}
}

func TestMarshalAndroidXMLResourcesPreservesCommentsMetadataAndPlaceholders(t *testing.T) {
	template := []byte(`<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools" xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2">
  <!-- keep this comment -->
  <string name="welcome" formatted="true" tools:ignore="TypographyDashes">Hello <xliff:g id="user">%1$s</xliff:g></string>
  <string name="debug_only" translatable="false">Debug only</string>
  <plurals name="item_count">
    <item quantity="one">%d item</item>
    <item quantity="other">%d items</item>
  </plurals>
</resources>
`)

	out, err := MarshalAndroidXMLResources(template, map[string]string{
		"welcome":          `Bonjour <xliff:g id="user">%1$s</xliff:g>`,
		"item_count.one":   "%d article",
		"item_count.other": "%d articles",
	})
	if err != nil {
		t.Fatalf("marshal android resources: %v", err)
	}
	content := string(out)

	for _, want := range []string{
		"<!-- keep this comment -->",
		`formatted="true" tools:ignore="TypographyDashes"`,
		`<string name="debug_only" translatable="false">Debug only</string>`,
		`Bonjour <xliff:g id="user">%1$s</xliff:g>`,
		`<item quantity="one">%d article</item>`,
		`<item quantity="other">%d articles</item>`,
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("expected output to contain %q, got %q", want, content)
		}
	}
}

func TestMarshalAndroidXMLResourcesEscapesInvalidXMLText(t *testing.T) {
	template := []byte(`<resources>
  <string name="math">Math</string>
</resources>`)

	out, err := MarshalAndroidXMLResources(template, map[string]string{"math": "2 < 3 & 4"})
	if err != nil {
		t.Fatalf("marshal android resources: %v", err)
	}
	if !strings.Contains(string(out), `<string name="math">2 &lt; 3 &amp; 4</string>`) {
		t.Fatalf("expected invalid xml text to be escaped, got %q", string(out))
	}
}

func TestAndroidXMLResourcesParserRejectsUnsupportedTranslatableConstructs(t *testing.T) {
	content := []byte(`<resources>
  <string-array name="tabs">
    <item>Home</item>
  </string-array>
</resources>`)

	_, err := (AndroidXMLResourcesParser{}).Parse(content)
	if err == nil {
		t.Fatalf("expected unsupported construct error")
	}
	if !strings.Contains(err.Error(), "unsupported <string-array> resource") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestAndroidXMLResourcesParserRejectsInvalidPlurals(t *testing.T) {
	content := []byte(`<resources>
  <plurals name="item_count">
    <item quantity="one">%d item</item>
  </plurals>
</resources>`)

	_, err := (AndroidXMLResourcesParser{}).Parse(content)
	if err == nil {
		t.Fatalf("expected missing other plural error")
	}
	if !strings.Contains(err.Error(), `quantity="other"`) {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestStrategyParsesAndroidStringResourcesByPath(t *testing.T) {
	s := NewDefaultStrategy()
	content := []byte(`<resources>
  <string name="app_name">Hyperlocalise</string>
</resources>`)

	got, err := s.Parse("app/src/main/res/values/strings.xml", content)
	if err != nil {
		t.Fatalf("parse android resources through strategy: %v", err)
	}
	if got["app_name"] != "Hyperlocalise" {
		t.Fatalf("unexpected app_name: %#v", got)
	}

	_, err = s.Parse("app/src/main/res/layout/activity_main.xml", content)
	if err == nil {
		t.Fatalf("expected non-Android string XML path to be rejected")
	}
	if !strings.Contains(err.Error(), "require a specialized parser") {
		t.Fatalf("unexpected error: %v", err)
	}
}
