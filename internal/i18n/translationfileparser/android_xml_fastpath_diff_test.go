package translationfileparser

import (
	"encoding/xml"
	"fmt"
	"strings"
	"testing"
)

func decoderAccepts(value, namespaceAttrs string) bool {
	var b strings.Builder
	b.WriteString("<resources")
	b.WriteString(namespaceAttrs)
	b.WriteString(">")
	b.WriteString(value)
	b.WriteString("</resources>")
	d := xml.NewDecoder(strings.NewReader(b.String()))
	for {
		if _, err := d.Token(); err != nil {
			return isEOFError(err)
		}
	}
}

func TestFastPathNeverAcceptsWhatDecoderRejects(t *testing.T) {
	ns := ` xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2" xmlns:tools="http://schemas.android.com/tools"`
	cases := []string{
		`<img src="foo.png" /  >`,
		`<1a>x</1a>`,
		`<a:b:c>x</a:b:c>`,
		`]]>`,
		`hello ]]> world`,
		`<b>]]></b>`,
		`&#0;`,
		`&#X41;`,
		`&#X0A;`,
		`&#xFFFE;`,
		`&#xFFFF;`,
		`&#x110000;`,
		`&#x1;`,
		`&#x8;`,
		`&#xB;`,
		`<-a>x</-a>`,
		`<.a>x</.a>`,
		`<a::b>x</a::b>`,
		`hello &unknown; world`,
		`<b>hello`,
		`<b>hello</i>`,
		`<b>hello</B>`,
		`<>`,
		`<b`,
		`<a href="url>link</a>`,
		`<a href=url>link</a>`,
		`<b attr="` + "\x00" + `">x</b>`,
		`<b><!-- comment --></b>`,
		`<b><![CDATA[x]]></b>`,
		`<?pi ?>`,
		`<!DOCTYPE x>`,
		`<b>Hello</b>`,
		`<img src="foo.png" />`,
		`<xliff:g id="user">%1$s</xliff:g>`,
		`hello &amp; world`,
		`&#32;`,
		`&#xA0;`,
		`<b/>`,
		`<b></b>`,
		`text <b>bold</b> text`,
		`<b>a &amp; b</b>`,
		`<b attr="">x</b>`,
		`<b attr = "x">y</b>`,
		"\x00",
		"<b>\x00</b>",
		"hello\x01world",
		"<b>\uFFFE</b>",
		"<b>\uFFFF</b>",
	}

	var bugs []string
	for _, c := range cases {
		fast := fastIsXMLFragmentWellFormed(c, ns)
		dec := decoderAccepts(c, ns)
		if fast && !dec {
			bugs = append(bugs, fmt.Sprintf("FALSE ACCEPT: %q (fast=true, decoder=false)", c))
		}
	}
	if len(bugs) > 0 {
		t.Fatalf("fast path accepted decoder-rejected inputs:\n%s", strings.Join(bugs, "\n"))
	}
}
