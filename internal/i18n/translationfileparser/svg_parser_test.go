package translationfileparser

import (
	"reflect"
	"strings"
	"testing"
)

const sampleSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40">
  <title>Product mark</title>
  <text x="8" y="24">Hello <tspan font-weight="700">world</tspan>!</text>
  <style>.hidden { display:none }</style>
</svg>
`

func TestSVGParserExtractsTextTitleAndTspans(t *testing.T) {
	got, err := (SVGParser{}).Parse([]byte(sampleSVG))
	if err != nil {
		t.Fatalf("parse svg: %v", err)
	}
	want := map[string]string{
		"svg.0001": "Product mark",
		"svg.0002": "Hello ",
		"svg.0003": "world",
		"svg.0004": "!",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parsed values mismatch\n got: %#v\nwant: %#v", got, want)
	}
}

func TestMarshalSVGReplacesTextAndEscapes(t *testing.T) {
	got, err := MarshalSVG([]byte(sampleSVG), map[string]string{
		"svg.0001": "Marque",
		"svg.0003": "monde & cie",
	})
	if err != nil {
		t.Fatalf("marshal svg: %v", err)
	}
	out := string(got)
	if !strings.Contains(out, "<title>Marque</title>") {
		t.Fatalf("expected replaced title, got %q", out)
	}
	if !strings.Contains(out, "monde &amp; cie") {
		t.Fatalf("expected escaped tspan, got %q", out)
	}
	if !strings.Contains(out, ">Hello <tspan") {
		t.Fatalf("expected preserved surrounding text, got %q", out)
	}
}

func TestSVGParserSkipsStyleAndScript(t *testing.T) {
	got, err := (SVGParser{}).Parse([]byte(`<svg><script>var label = "nope"</script><text>Save</text></svg>`))
	if err != nil {
		t.Fatalf("parse svg: %v", err)
	}
	if got["svg.0001"] != "Save" || len(got) != 1 {
		t.Fatalf("unexpected entries: %#v", got)
	}
}
