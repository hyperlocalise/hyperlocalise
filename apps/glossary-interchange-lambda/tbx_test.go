package main

import (
	"os"
	"strings"
	"testing"
)

func TestDecodeTBX_PhraseTBX2ImportsTermsAndForbiddenFlags(t *testing.T) {
	data, err := os.ReadFile(glossaryInterchangeFixturePath("phrase-export.tbx"))
	if err != nil {
		t.Fatal(err)
	}
	concepts, diagnostics, err := decodeTBX(data)
	if err != nil {
		t.Fatalf("decodeTBX() error = %v", err)
	}
	if len(diagnostics) > 0 {
		t.Fatalf("decodeTBX() diagnostics = %v", diagnostics)
	}
	if len(concepts) != 2 {
		t.Fatalf("decodeTBX() concepts = %d, want 2", len(concepts))
	}
	if got := countInterchangeTerms(concepts); got != 5 {
		t.Fatalf("decodeTBX() terms = %d, want 5", got)
	}

	checkout := findInterchangeTerm(t, concepts, "en-US", "Checkout")
	if !checkout.Forbidden && checkout.Status != "preferred" {
		t.Fatalf("Checkout status = %q forbidden = %t, want preferred", checkout.Status, checkout.Forbidden)
	}
	if checkout.Status != "preferred" {
		t.Fatalf("Checkout status = %q, want preferred", checkout.Status)
	}
	if checkout.Forbidden {
		t.Fatalf("Checkout forbidden = true, want false")
	}
	if checkout.PartOfSpeech != "noun" {
		t.Fatalf("Checkout partOfSpeech = %q, want noun", checkout.PartOfSpeech)
	}

	paiement := findInterchangeTerm(t, concepts, "fr-FR", "Paiement")
	if paiement.Status != "admitted" {
		t.Fatalf("Paiement status = %q, want admitted", paiement.Status)
	}
	if paiement.Forbidden {
		t.Fatalf("Paiement forbidden = true, want false")
	}

	forbidden := findInterchangeTerm(t, concepts, "de-DE", "Kasse alt")
	if !forbidden.Forbidden {
		t.Fatalf("Kasse alt forbidden = false, want true")
	}

	adminForbidden := findInterchangeTerm(t, concepts, "fr-FR", "Panier interdit")
	if !adminForbidden.Forbidden {
		t.Fatalf("Panier interdit forbidden = false, want true")
	}
}

func TestDecodeTBX_UnreadableEntriesReturnADiagnostic(t *testing.T) {
	data := []byte(`<?xml version="1.0"?><martif type="TBX"><text><body><termEntry id="1"><note>no terms</note></termEntry></body></text></martif>`)
	concepts, diagnostics, err := decodeTBX(data)
	if err != nil {
		t.Fatalf("decodeTBX() error = %v", err)
	}
	if len(concepts) != 0 {
		t.Fatalf("decodeTBX() concepts = %#v, want none", concepts)
	}
	if len(diagnostics) == 0 || !strings.Contains(diagnostics[0], "could not be imported") {
		t.Fatalf("decodeTBX() diagnostics = %v, want an import diagnostic", diagnostics)
	}
}

func findInterchangeTerm(t *testing.T, concepts []interchangeConcept, locale, text string) interchangeTerm {
	t.Helper()
	for _, concept := range concepts {
		for _, term := range concept.Terms {
			if term.Locale == locale && term.Term == text {
				return term
			}
		}
	}
	t.Fatalf("term %s/%s not found", locale, text)
	return interchangeTerm{}
}
