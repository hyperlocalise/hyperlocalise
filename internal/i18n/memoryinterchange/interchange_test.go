package memoryinterchange

import (
	"strings"
	"testing"
)

func TestParseTMXUsesHeaderSourceAndTuidKeys(t *testing.T) {
	content := `<?xml version="1.0"?><tmx version="1.4"><header srclang="en-US"/><body><tu tuid="one"><tuv xml:lang="fr-FR"><seg>Bonjour</seg></tuv><tuv xml:lang="en-US"><seg>Hello</seg></tuv></tu></body></tmx>`
	candidates, issues, header, err := Parse("tmx", content)
	if err != nil || len(issues) != 0 || header == nil || len(candidates) != 1 {
		t.Fatalf("Parse() = candidates=%d issues=%d header=%v err=%v", len(candidates), len(issues), header, err)
	}
	if candidates[0].SourceLocale != "en-US" || candidates[0].TargetLocale != "fr-FR" || candidates[0].SourceText != "Hello" || candidates[0].TargetText != "Bonjour" {
		t.Fatalf("unexpected candidate: %+v", candidates[0])
	}
	if candidates[0].ExternalKey == nil || *candidates[0].ExternalKey != "tmx:one:fr-FR" {
		t.Fatalf("unexpected external key: %v", candidates[0].ExternalKey)
	}
}

func TestCSVFormulaRoundTrip(t *testing.T) {
	rows := []Candidate{{SourceLocale: "en-US", TargetLocale: "fr-FR", SourceText: "=SUM(A1)", TargetText: "@mention", MatchScore: 100}}
	body, err := SerializeCSV(rows)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), FormulaEscapePrefix+"=SUM(A1)") {
		t.Fatalf("formula was not escaped: %s", body)
	}
	parsed := ParseCSV(string(body))
	if len(parsed) != 1 || parsed[0].SourceText != "=SUM(A1)" || parsed[0].TargetText != "@mention" {
		t.Fatalf("CSV round trip failed: %+v", parsed)
	}
}

func TestParseInvalidTMXReportsIssue(t *testing.T) {
	_, issues, _, err := Parse("tmx", "<not-xml")
	if err != nil || len(issues) != 1 || issues[0].Code != "invalid_tmx" {
		t.Fatalf("unexpected invalid TMX result: issues=%+v err=%v", issues, err)
	}
}
