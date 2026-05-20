package translationfileparser

import (
	"reflect"
	"strings"
	"testing"
)

func TestGenericXMLParserParsesKeyedAndNestedEntries(t *testing.T) {
	content := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<locale code="en-US">
  <!-- translator metadata stays structural -->
  <metadata>
    <note>Do not translate this note.</note>
  </metadata>
  <section id="home">
    <string name="title" tone="hero">Welcome back, {name}</string>
    <body>Shop new arrivals today.</body>
  </section>
  <message key="checkout.cta" priority="primary">Checkout now</message>
</locale>`)

	got, err := GenericXMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse generic xml: %v", err)
	}
	want := map[string]string{
		"home.title":   "Welcome back, {name}",
		"home.body":    "Shop new arrivals today.",
		"checkout.cta": "Checkout now",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("entries mismatch\nwant: %#v\n got: %#v", want, got)
	}
}

func TestGenericXMLParserParsesResxStyleDataValues(t *testing.T) {
	content := []byte(`<?xml version="1.0" encoding="utf-8"?>
<root>
  <resheader name="version"><value>2.0</value></resheader>
  <data name="home.title" xml:space="preserve">
    <value>Welcome home</value>
    <comment>Main heading</comment>
  </data>
</root>`)

	got, err := GenericXMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse resx-style xml: %v", err)
	}
	if got["home.title"] != "Welcome home" {
		t.Fatalf("unexpected home.title: %q", got["home.title"])
	}
	if _, ok := got["version"]; ok {
		t.Fatalf("resheader metadata must not be parsed: %#v", got)
	}
}

func TestGenericXMLParserFallsBackPastEmptyKeyAttributes(t *testing.T) {
	content := []byte(`<locale><data key="" name="home.title">Welcome home</data></locale>`)

	got, err := GenericXMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse empty key fallback: %v", err)
	}
	if got["home.title"] != "Welcome home" {
		t.Fatalf("expected name attribute used after empty key, got %#v", got)
	}
	if _, ok := got["data"]; ok {
		t.Fatalf("empty key attribute should not force path-based key: %#v", got)
	}
}

func TestGenericXMLParserIgnoresNamespacedKeyAttributes(t *testing.T) {
	content := []byte(`<locale xmlns:tool="urn:tool"><section id="home"><message tool:name="ignored">Welcome home</message></section></locale>`)

	got, err := GenericXMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse namespaced key attr: %v", err)
	}
	want := map[string]string{"home.message": "Welcome home"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("entries mismatch\nwant: %#v\n got: %#v", want, got)
	}
}

func TestGenericXMLParserKeepsNamedChildElementsUnderKeyedParent(t *testing.T) {
	content := []byte(`<locale><section id="home"><message>Welcome</message><label>Start now</label></section></locale>`)

	got, err := GenericXMLParser{}.Parse(content)
	if err != nil {
		t.Fatalf("parse keyed child elements: %v", err)
	}
	want := map[string]string{
		"home.message": "Welcome",
		"home.label":   "Start now",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("entries mismatch\nwant: %#v\n got: %#v", want, got)
	}
}

func TestMarshalGenericXMLPreservesStructureAndReplacesOnlyText(t *testing.T) {
	template := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<locale code="en-US">
  <!-- keep comment -->
  <section id="home" data-kind="hero">
    <string name="title" tone="warm">Welcome &amp; relax</string>
  </section>
  <message key="checkout.cta" priority="primary">Checkout now</message>
</locale>`)

	out, err := MarshalGenericXML(template, map[string]string{
		"home.title":   "Bienvenue & detente",
		"checkout.cta": "Payer <maintenant>",
	})
	if err != nil {
		t.Fatalf("marshal generic xml: %v", err)
	}
	rendered := string(out)
	for _, want := range []string{
		`<?xml version="1.0" encoding="UTF-8"?>`,
		`<!-- keep comment -->`,
		`<section id="home" data-kind="hero">`,
		`<string name="title" tone="warm">Bienvenue &amp; detente</string>`,
		`<message key="checkout.cta" priority="primary">Payer &lt;maintenant&gt;</message>`,
	} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("expected %q in rendered xml:\n%s", want, rendered)
		}
	}
}

func TestMarshalGenericXMLWithTargetLocaleRewritesSourceLocaleAttributes(t *testing.T) {
	template := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<locale title='from code="en" xml:lang="en" locale="en_US" to fr' code="en-US" xml:lang="en" language='en-US' locale="en_US" data-code="keep">
  <message key="hello">Hello</message>
</locale>`)

	out, err := MarshalGenericXMLWithTargetLocale(template, map[string]string{"hello": "Bonjour"}, "en-US", "fr-FR")
	if err != nil {
		t.Fatalf("marshal generic xml with target locale: %v", err)
	}
	rendered := string(out)
	for _, want := range []string{
		`code="fr-FR"`,
		`xml:lang="fr"`,
		`language='fr-FR'`,
		`locale="fr_FR"`,
		`title='from code="en" xml:lang="en" locale="en_US" to fr'`,
		`data-code="keep"`,
		`<message key="hello">Bonjour</message>`,
	} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("expected %q in rendered xml:\n%s", want, rendered)
		}
	}
}

func TestMarshalGenericXMLWithTargetLocalePreservesExistingTargetLocale(t *testing.T) {
	template := []byte(`<locale code="fr-FR"><message key="hello">Salut</message></locale>`)

	out, err := MarshalGenericXMLWithTargetLocale(template, map[string]string{"hello": "Bonjour"}, "en-US", "fr-FR")
	if err != nil {
		t.Fatalf("marshal generic xml with existing target locale: %v", err)
	}
	if got := string(out); !strings.Contains(got, `code="fr-FR"`) {
		t.Fatalf("expected existing target locale preserved, got %q", got)
	}
}

func TestMarshalGenericXMLLeavesTemplateUnchangedWithoutValues(t *testing.T) {
	template := []byte(`<locale code="en-US"><message key="terms">Terms &amp; conditions</message></locale>`)

	out, err := MarshalGenericXML(template, nil)
	if err != nil {
		t.Fatalf("marshal generic xml without values: %v", err)
	}
	if got := string(out); got != string(template) {
		t.Fatalf("expected unchanged template\nwant: %s\n got: %s", template, got)
	}
}

func TestMarshalGenericXMLPreservesRawEntityWhenValueUnchanged(t *testing.T) {
	template := []byte(`<locale><message key="terms">Terms &amp; conditions</message></locale>`)

	out, err := MarshalGenericXML(template, map[string]string{"terms": "Terms & conditions"})
	if err != nil {
		t.Fatalf("marshal generic xml: %v", err)
	}
	if got := string(out); got != string(template) {
		t.Fatalf("expected raw entity spelling preserved\nwant: %s\n got: %s", template, got)
	}
}

func TestMarshalGenericXMLRejectsPreEscapedTranslatedValues(t *testing.T) {
	template := []byte(`<locale><message key="terms">Terms &amp; conditions</message></locale>`)

	_, err := MarshalGenericXML(template, map[string]string{"terms": "Conditions &amp; terms"})
	if err == nil || !strings.Contains(err.Error(), `key "terms"`) || !strings.Contains(err.Error(), "decoded plain text") {
		t.Fatalf("expected pre-escaped value error, got %v", err)
	}
}

func TestMarshalGenericXMLEscapesLiteralNamedEntityText(t *testing.T) {
	template := []byte(`<locale><message key="copyright">Copyright</message></locale>`)

	out, err := MarshalGenericXML(template, map[string]string{"copyright": "Copyright &copy; 2026"})
	if err != nil {
		t.Fatalf("marshal literal named entity text: %v", err)
	}
	if got, want := string(out), `<locale><message key="copyright">Copyright &amp;copy; 2026</message></locale>`; got != want {
		t.Fatalf("unexpected rendered xml\nwant: %s\n got: %s", want, got)
	}
}

func TestGenericXMLParserRejectsSpecializedAndroidResources(t *testing.T) {
	_, err := GenericXMLParser{}.Parse([]byte(`<resources><string name="app_name">App</string></resources>`))
	if err == nil || !strings.Contains(err.Error(), "<resources>") {
		t.Fatalf("expected Android resources rejection, got %v", err)
	}
}

func TestGenericXMLParserRejectsMixedContent(t *testing.T) {
	_, err := GenericXMLParser{}.Parse([]byte(`<locale><message key="hello">Hello <ph id="name"/>!</message></locale>`))
	if err == nil || !strings.Contains(err.Error(), "mixed content") {
		t.Fatalf("expected mixed content error, got %v", err)
	}
}

func TestGenericXMLParserIgnoresEmptyCommentInTextLeaf(t *testing.T) {
	got, err := GenericXMLParser{}.Parse([]byte(`<locale><message key="hello">Hello<!----></message></locale>`))
	if err != nil {
		t.Fatalf("parse empty comment in text leaf: %v", err)
	}
	if got["hello"] != "Hello" {
		t.Fatalf("unexpected hello entry: %#v", got)
	}
}

func TestGenericXMLParserRejectsNoEntries(t *testing.T) {
	_, err := GenericXMLParser{}.Parse([]byte(`<locale><metadata><note>Only metadata</note></metadata></locale>`))
	if err == nil || !strings.Contains(err.Error(), "no translatable XML text entries") {
		t.Fatalf("expected no entries error, got %v", err)
	}
}

func TestGenericXMLParserRejectsKeyedMetadataElements(t *testing.T) {
	_, err := GenericXMLParser{}.Parse([]byte(`<locale><comment key="checkout.note">Visible note</comment></locale>`))
	if err == nil || !strings.Contains(err.Error(), "metadata element <comment>") || !strings.Contains(err.Error(), "key/id/name") {
		t.Fatalf("expected keyed metadata error, got %v", err)
	}
}
