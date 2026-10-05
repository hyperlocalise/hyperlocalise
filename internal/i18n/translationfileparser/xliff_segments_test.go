package translationfileparser

import (
	"bytes"
	"strings"
	"testing"
)

func TestXLIFFSegmentsMixedTargetsAndStableIDs(t *testing.T) {
	template := []byte(`<xliff version="2.1" srcLang="en" xmlns="urn:oasis:names:tc:xliff:document:2.0"><file id="f"><unit id="u"><notes><note>Keep me</note></notes><segment id="a/b"><source>One</source><target state="initial"/></segment><ignorable id="i"><source> </source></ignorable><segment id="b"><source>Two</source><target>Deux</target></segment><segment id="c"><source xml:space="preserve"> Three </source></segment></unit></file></xliff>`)
	entries, err := (XLIFFParser{}).Parse(template)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 3 || entries["u#segment=a%2Fb"] != "One" || entries["u#segment=b"] != "Deux" || entries["u#segment=c"] != " Three " {
		t.Fatalf("unexpected entries: %#v", entries)
	}
	out, err := MarshalXLIFF(template, map[string]string{"u#segment=a%2Fb": "Un", "u#segment=c": " Trois "}, "en", "fr")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`<source>One</source><target state="initial">Un</target>`, `<source>Two</source><target>Deux</target>`, `<source xml:space="preserve"> Three </source><target xml:space="preserve"> Trois </target>`, `<ignorable id="i"><source> </source></ignorable>`, `<notes><note>Keep me</note></notes>`, `trgLang="fr"`} {
		if !bytes.Contains(out, []byte(want)) {
			t.Fatalf("missing %q in %s", want, out)
		}
	}
	roundTrip, err := (XLIFFParser{}).Parse(out)
	if err != nil || roundTrip["u#segment=a%2Fb"] != "Un" || roundTrip["u#segment=c"] != " Trois " {
		t.Fatalf("round trip: %#v, %v", roundTrip, err)
	}
}

func TestXLIFFSegmentIDsSurviveReordering(t *testing.T) {
	template := []byte(`<xliff version="2.0"><file><unit id="u"><segment id="b"><source>Two</source></segment><segment id="a"><source>One</source></segment></unit></file></xliff>`)
	out, err := MarshalXLIFF(template, map[string]string{"u#segment=a": "Un", "u#segment=b": "Deux"}, "en", "fr")
	if err != nil {
		t.Fatal(err)
	}
	entries, err := (XLIFFParser{}).Parse(out)
	if err != nil || entries["u#segment=a"] != "Un" || entries["u#segment=b"] != "Deux" {
		t.Fatalf("unexpected entries: %#v, %v", entries, err)
	}
}

func TestXLIFF12SegmentedSource(t *testing.T) {
	for _, target := range []string{"", `<target><mrk mtype="seg" mid="1">Un</mrk> <mrk mtype="seg" mid="2">Deux</mrk></target>`} {
		template := []byte(`<xliff version="1.2"><file><body><trans-unit id="u"><source>One Two</source><seg-source><mrk mtype="seg" mid="1">One</mrk> <mrk mtype="seg" mid="2">Two</mrk></seg-source>` + target + `<note>Keep note</note></trans-unit></body></file></xliff>`)
		entries, err := (XLIFFParser{}).Parse(template)
		if err != nil || len(entries) != 2 {
			t.Fatalf("parse: %#v, %v", entries, err)
		}
		out, err := MarshalXLIFF(template, map[string]string{"u#segment=2": "Second"}, "en", "fr")
		if err != nil {
			t.Fatal(err)
		}
		roundTrip, err := (XLIFFParser{}).Parse(out)
		first := "One"
		if target != "" {
			first = "Un"
		}
		if err != nil || roundTrip["u#segment=1"] != first || roundTrip["u#segment=2"] != "Second" {
			t.Fatalf("round trip: %#v, %v", roundTrip, err)
		}
		if !bytes.Contains(out, []byte(`<source>One Two</source><seg-source><mrk mtype="seg" mid="1">One</mrk> <mrk mtype="seg" mid="2">Two</mrk></seg-source>`)) || !bytes.Contains(out, []byte(`<note>Keep note</note>`)) {
			t.Fatalf("source/metadata changed: %s", out)
		}
	}
}

func TestXLIFFInlineNamespacesAndSourceBytes(t *testing.T) {
	template := []byte(`<?xml version="1.0"?><x:xliff xmlns:x="urn:oasis:names:tc:xliff:document:2.0" version='2.0' srcLang='en'><x:file id='f'><x:unit id='u'><x:segment><x:source xmlns:code="urn:oasis:names:tc:xliff:document:2.0" xml:space="preserve">A &amp; <code:pc id='p' dataRefStart='d1' dataRefEnd='d2'>B <code:ph id='n'/></code:pc></x:source><!-- keep --></x:segment><x:originalData><x:data id='d1'>&lt;b&gt;</x:data></x:originalData></x:unit></x:file></x:xliff>`)
	entries, err := (XLIFFParser{}).Parse(template)
	if err != nil {
		t.Fatal(err)
	}
	value := strings.Replace(entries["u"], "A &amp;", "Un &amp;", 1)
	out, err := MarshalXLIFF(template, map[string]string{"u": value}, "en", "fr")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(out, []byte(`<x:source xmlns:code="urn:oasis:names:tc:xliff:document:2.0" xml:space="preserve">A &amp; <code:pc id='p' dataRefStart='d1' dataRefEnd='d2'>B <code:ph id='n'/></code:pc></x:source>`)) {
		t.Fatalf("source changed: %s", out)
	}
	if !bytes.Contains(out, []byte(`<x:target xmlns:code="urn:oasis:names:tc:xliff:document:2.0" xml:space="preserve">Un &amp;`)) {
		t.Fatalf("missing namespaced target: %s", out)
	}
	if _, err := (XLIFFParser{}).Parse(out); err != nil {
		t.Fatal(err)
	}
	repeated, err := MarshalXLIFF(out, map[string]string{"u": value}, "en", "fr")
	if err != nil || !bytes.Equal(out, repeated) {
		t.Fatalf("writeback not idempotent: %s, %v", repeated, err)
	}
}

func TestXLIFFRejectsDamagedInlineCodes(t *testing.T) {
	template := []byte(`<xliff version="1.2"><file><body><trans-unit id="u"><source>One <g id="g"><ph id="p">%s</ph></g></source></trans-unit></body></file></xliff>`)
	for _, value := range []string{`Un`, `Un <g id="g"><ph id="changed">%s</ph></g>`, `Un <g id="g"><ph id="p">%d</ph></g>`, `Un <g id="g"><ph id="p">%s</ph>`, `Un <g id="g"><ph id="p">%s</ph><ph id="p">%s</ph></g>`} {
		if out, err := MarshalXLIFF(template, map[string]string{"u": value}, "en", "fr"); err == nil || out != nil {
			t.Fatalf("expected failure for %q: %s, %v", value, out, err)
		}
	}
}

func TestXLIFFRejectsAmbiguousSegmentKeys(t *testing.T) {
	duplicate := []byte(`<xliff version="2.0"><file><unit id="u"><segment id="a"><source>One</source></segment><segment id="a"><source>Two</source></segment></unit></file></xliff>`)
	if _, err := (XLIFFParser{}).Parse(duplicate); err == nil {
		t.Fatal("duplicate segment accepted")
	}
	if _, err := MarshalXLIFF(duplicate, map[string]string{}, "en", "fr"); err == nil {
		t.Fatal("duplicate segment accepted by writer")
	}
	template := bytes.Replace(duplicate, []byte(`<segment id="a"><source>Two`), []byte(`<segment id="b"><source>Two`), 1)
	if _, err := MarshalXLIFF(template, map[string]string{"u": "Combined"}, "en", "fr"); err == nil {
		t.Fatal("ambiguous unit-level value accepted")
	}
}

func TestXLIFFSelfClosingSourceAndEmptyTarget(t *testing.T) {
	template := []byte(`<xliff version="1.2"><file><body><trans-unit id="u"><source/><target state="new" /></trans-unit></body></file></xliff>`)
	out, err := MarshalXLIFF(template, map[string]string{"u": ""}, "en", "fr")
	if err != nil || !bytes.Contains(out, []byte(`<source/><target state="new" ></target>`)) {
		t.Fatalf("empty writeback: %s, %v", out, err)
	}
}
