package translationfileparser

import (
	"bytes"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

const lottieFixture = `{"v":"5.7.4","fr":30,"ip":0,"op":90.0000036657751,"w":512,"h":512,"nm":"Promo","ddd":0,
"assets":[{"id":"comp_0","nm":"Badge","fr":30,"layers":[
  {"ddd":0,"ind":1,"ty":5,"nm":"Badge Label","t":{"d":{"k":[{"s":{"s":24,"f":"Inter-Bold","t":"New","j":2,"tr":0,"lh":28.8,"ls":0,"fc":[1,1,1]},"t":0}]},"p":{},"m":{"g":1,"a":{"a":0,"k":[0,0]}},"a":[]}}
]}],
"fonts":{"list":[{"fName":"Inter-Bold","fFamily":"Inter","fStyle":"Bold","ascent":72.7}]},
"layers":[
  {"ddd":0,"ind":1,"ty":4,"nm":"Shape","shapes":[{"ty":"gr","nm":"t","it":[]}]},
  {"ddd":0,"ind":2,"ty":5,"nm":"Headline","t":{"d":{"k":[
    {"s":{"s":48,"f":"Inter-Bold","t":"Save <b>more</b>\rtoday & tomorrow","j":0,"tr":0,"lh":57.6,"ls":0,"fc":[0,0,0]},"t":0},
    {"s":{"s":48,"f":"Inter-Bold","t":"Limited offer","j":0,"tr":0,"lh":57.6,"ls":0,"fc":[0,0,0]},"t":45.5}
  ]},"p":{},"m":{"g":1,"a":{"a":0,"k":[0,0]}},"a":[]}},
  {"ddd":0,"ind":3,"ty":5,"nm":"Blank","t":{"d":{"k":[{"s":{"s":12,"f":"Inter-Bold","t":"  ","j":0},"t":0}]}}},
  {"ddd":0,"ind":4,"ty":0,"nm":"Badge Precomp","refId":"comp_0"}
]}`

func TestIsLottieJSON(t *testing.T) {
	if !IsLottieJSON([]byte(lottieFixture)) {
		t.Fatalf("expected fixture to be detected as Lottie")
	}
	notLottie := []string{
		`{"layers":"Layers","title":"Hello"}`,
		`{"v":"1","layers":[],"fr":"30","ip":0,"op":10}`,
		`{"home":{"title":"Welcome"}}`,
		`{`,
	}
	for _, content := range notLottie {
		if IsLottieJSON([]byte(content)) {
			t.Fatalf("did not expect %s to be detected as Lottie", content)
		}
	}
}

func TestParseLottieExtractsTextLayers(t *testing.T) {
	values, entryContext, err := ParseLottie([]byte(lottieFixture))
	if err != nil {
		t.Fatalf("parse lottie: %v", err)
	}

	want := map[string]string{
		"layers[1].t.d.k[0].s.t":           "Save <b>more</b>\rtoday & tomorrow",
		"layers[1].t.d.k[1].s.t":           "Limited offer",
		"assets[0].layers[0].t.d.k[0].s.t": "New",
	}
	if !reflect.DeepEqual(values, want) {
		t.Fatalf("values mismatch:\n got %#v\nwant %#v", values, want)
	}

	if got := entryContext["layers[1].t.d.k[0].s.t"]; !strings.Contains(got, `"Headline"`) || !strings.Contains(got, "frame 0") || !strings.Contains(got, `\r`) {
		t.Fatalf("unexpected headline context: %q", got)
	}
	if got := entryContext["layers[1].t.d.k[1].s.t"]; !strings.Contains(got, "frame 45.5") || strings.Contains(got, `\r`) {
		t.Fatalf("unexpected second keyframe context: %q", got)
	}
	if got := entryContext["assets[0].layers[0].t.d.k[0].s.t"]; got != `Lottie text layer "Badge Label" in precomposition "comp_0"` {
		t.Fatalf("unexpected precomp context: %q", got)
	}
}

func TestStrategyRoutesLottieJSON(t *testing.T) {
	values, entryContext, err := NewDefaultStrategy().ParseWithContext("animations/promo.json", []byte(lottieFixture))
	if err != nil {
		t.Fatalf("strategy parse: %v", err)
	}
	if len(values) != 3 || values["assets[0].layers[0].t.d.k[0].s.t"] != "New" {
		t.Fatalf("unexpected strategy values: %#v", values)
	}
	if len(entryContext) != 3 {
		t.Fatalf("expected context for each entry, got %#v", entryContext)
	}
}

func TestMarshalLottieReplacesOnlyTextLiterals(t *testing.T) {
	template := []byte(lottieFixture)
	values := map[string]string{
		"layers[1].t.d.k[0].s.t":           "Économisez <b>plus</b>\raujourd'hui & \"demain\"",
		"assets[0].layers[0].t.d.k[0].s.t": "Nouveau",
		"layers[2].t.d.k[0].s.t":           "ignored because blank source text is not extracted",
		"unknown.key":                      "ignored",
	}

	content, err := MarshalLottie(template, values)
	if err != nil {
		t.Fatalf("marshal lottie: %v", err)
	}

	expected := strings.Replace(lottieFixture, `"t":"Save <b>more</b>\rtoday & tomorrow"`, `"t":"Économisez <b>plus</b>\raujourd'hui & \"demain\""`, 1)
	expected = strings.Replace(expected, `"t":"New"`, `"t":"Nouveau"`, 1)
	if string(content) != expected {
		t.Fatalf("marshal output mismatch:\n got %s\nwant %s", content, expected)
	}

	roundTrip, _, err := ParseLottie(content)
	if err != nil {
		t.Fatalf("reparse marshalled lottie: %v", err)
	}
	if got := roundTrip["layers[1].t.d.k[0].s.t"]; got != values["layers[1].t.d.k[0].s.t"] {
		t.Fatalf("round trip mismatch: %q", got)
	}
	if got := roundTrip["layers[1].t.d.k[1].s.t"]; got != "Limited offer" {
		t.Fatalf("untranslated keyframe should keep source text, got %q", got)
	}
}

func TestMarshalLottieHandlesIndentedTemplates(t *testing.T) {
	var payload any
	if err := json.Unmarshal([]byte(lottieFixture), &payload); err != nil {
		t.Fatalf("decode fixture: %v", err)
	}
	indented, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("indent fixture: %v", err)
	}

	content, err := MarshalLottie(indented, map[string]string{"layers[1].t.d.k[1].s.t": "Offre limitée"})
	if err != nil {
		t.Fatalf("marshal lottie: %v", err)
	}
	if !bytes.Contains(content, []byte(`"t": "Offre limitée"`)) {
		t.Fatalf("expected translated text in output:\n%s", content)
	}
	if !bytes.Equal(bytes.Replace(content, []byte("Offre limitée"), []byte("Limited offer"), 1), indented) {
		t.Fatalf("expected all non-text bytes to be preserved")
	}
}

func TestMarshalLottieWithoutChangesReturnsTemplate(t *testing.T) {
	content, err := MarshalLottie([]byte(lottieFixture), map[string]string{"layers[1].t.d.k[1].s.t": "Limited offer"})
	if err != nil {
		t.Fatalf("marshal lottie: %v", err)
	}
	if string(content) != lottieFixture {
		t.Fatalf("expected unchanged template")
	}
}

func TestMarshalJSONRoutesLottie(t *testing.T) {
	content, err := MarshalJSON([]byte(lottieFixture), map[string]string{"assets[0].layers[0].t.d.k[0].s.t": "Neu"})
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}
	if !bytes.Contains(content, []byte(`"t":"Neu"`)) || !bytes.Contains(content, []byte(`"op":90.0000036657751`)) {
		t.Fatalf("expected in-place lottie rewrite, got %s", content)
	}
}

func TestParseLottieRejectsNonLottie(t *testing.T) {
	if _, _, err := ParseLottie([]byte(`{"home":"Welcome"}`)); err == nil {
		t.Fatalf("expected error for non-Lottie document")
	}
}
