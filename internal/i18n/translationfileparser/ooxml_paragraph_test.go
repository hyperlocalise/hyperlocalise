package translationfileparser

import "testing"

func TestParseOOXMLTranslationStripsLeakedTokenNames(t *testing.T) {
	open := "\x1eHLOXPH_6F30_0\x1f"
	close := "\x1eHLOXPH_6330_1\x1f"
	leaked := open + "HLOXPH_6F30_0 RECETTE" + close + " HLOXPH_6330_1 Pancakes à la fraise"

	items := parseOOXMLTranslation(leaked)
	if len(items) != 4 {
		t.Fatalf("items: got %d, want 4 (%#v)", len(items), items)
	}
	if !items[0].token || items[0].kind != ooxmlTokenOpen || items[0].index != 0 {
		t.Fatalf("open token: %#v", items[0])
	}
	if items[1].token || items[1].text != "RECETTE" {
		t.Fatalf("group text: %q", items[1].text)
	}
	if !items[2].token || items[2].kind != ooxmlTokenClose || items[2].index != 0 {
		t.Fatalf("close token: %#v", items[2])
	}
	if items[3].token || items[3].text != " Pancakes à la fraise" {
		t.Fatalf("tail text: %q", items[3].text)
	}
}

func TestStripLeakedOOXMLTokenNamesKeepsPlainText(t *testing.T) {
	got := stripLeakedOOXMLTokenNames("Pancakes à la fraise")
	if got != "Pancakes à la fraise" {
		t.Fatalf("got %q", got)
	}
}
