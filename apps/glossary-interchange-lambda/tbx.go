package main

import (
	"bytes"
	"encoding/xml"
	"strings"

	"github.com/google/uuid"
)

type tbxTermNote struct {
	Type string `xml:"type,attr"`
	Text string `xml:",chardata"`
}

type tbxDescrip struct {
	Type string `xml:"type,attr"`
	Text string `xml:",chardata"`
}

type tbxDescripGrp struct {
	Descrip tbxDescrip `xml:"descrip"`
	Note    string     `xml:"note"`
}

type tbxTermBag struct {
	ID          string          `xml:"id,attr"`
	Text        string          `xml:"term"`
	Descrips    []tbxDescrip    `xml:"descrip"`
	DescripGrps []tbxDescripGrp `xml:"descripGrp"`
	TermNotes   []tbxTermNote   `xml:"termNote"`
	Note        string          `xml:"note"`
}

type tbxNtig struct {
	ID          string          `xml:"id,attr"`
	TermGrp     tbxTermBag      `xml:"termGrp"`
	Descrips    []tbxDescrip    `xml:"descrip"`
	DescripGrps []tbxDescripGrp `xml:"descripGrp"`
	TermNotes   []tbxTermNote   `xml:"termNote"`
	Note        string          `xml:"note"`
}

type tbxLang struct {
	Locale   string       `xml:"lang,attr"`
	TermSecs []tbxTermBag `xml:"termSec"`
	Tigs     []tbxTermBag `xml:"tig"`
	Ntigs    []tbxNtig    `xml:"ntig"`
}

type tbxEntry struct {
	ID          string          `xml:"id,attr"`
	Descrips    []tbxDescrip    `xml:"descrip"`
	DescripGrps []tbxDescripGrp `xml:"descripGrp"`
	LangSecs    []tbxLang       `xml:"langSec"`
	LangSets    []tbxLang       `xml:"langSet"`
}

func decodeTBX(data []byte) ([]interchangeConcept, []string, error) {
	data = stripTBXPreamble(data)
	var root struct {
		ConceptEntries []tbxEntry `xml:"text>body>conceptEntry"`
		TermEntries    []tbxEntry `xml:"text>body>termEntry"`
	}
	if err := xml.Unmarshal(data, &root); err != nil {
		return nil, nil, err
	}
	entries := make([]tbxEntry, 0, len(root.ConceptEntries)+len(root.TermEntries))
	entries = append(entries, root.ConceptEntries...)
	entries = append(entries, root.TermEntries...)
	out := make([]interchangeConcept, 0, len(entries))
	for _, e := range entries {
		c := decodeTBXEntry(e)
		if len(c.Terms) == 0 {
			continue
		}
		out = append(out, c)
	}
	if len(out) == 0 && tbxLooksPopulated(data) {
		return nil, []string{"TBX document contains term entries that could not be imported"}, nil
	}
	return out, nil, nil
}

func decodeTBXEntry(e tbxEntry) interchangeConcept {
	c := interchangeConcept{ID: strings.TrimPrefix(strings.TrimSpace(e.ID), "c-")}
	applyTBXConceptDescrips(&c, e.Descrips)
	for _, group := range e.DescripGrps {
		applyTBXConceptDescrips(&c, []tbxDescrip{group.Descrip})
		if note := strings.TrimSpace(group.Note); note != "" && c.Note == "" {
			c.Note = note
			c.Present.Note = true
		}
	}
	for _, lang := range append(append([]tbxLang{}, e.LangSecs...), e.LangSets...) {
		locale := strings.ReplaceAll(strings.TrimSpace(lang.Locale), "_", "-")
		for _, bag := range append(append([]tbxTermBag{}, lang.TermSecs...), lang.Tigs...) {
			appendDecodedTBXTerm(&c, locale, bag)
		}
		for _, nested := range lang.Ntigs {
			bag := nested.TermGrp
			if strings.TrimSpace(bag.ID) == "" {
				bag.ID = nested.ID
			}
			bag.Descrips = append(append([]tbxDescrip{}, bag.Descrips...), nested.Descrips...)
			bag.DescripGrps = append(append([]tbxDescripGrp{}, bag.DescripGrps...), nested.DescripGrps...)
			bag.TermNotes = append(append([]tbxTermNote{}, bag.TermNotes...), nested.TermNotes...)
			if strings.TrimSpace(bag.Note) == "" {
				bag.Note = nested.Note
			}
			appendDecodedTBXTerm(&c, locale, bag)
		}
	}
	if c.ID == "" {
		c.ID = uuid.NewString()
	}
	return c
}

func appendDecodedTBXTerm(c *interchangeConcept, locale string, bag tbxTermBag) {
	text := strings.TrimSpace(bag.Text)
	if text == "" || locale == "" {
		return
	}
	if c.PrimaryTerm == "" {
		c.PrimaryTerm = text
	}
	term := interchangeTerm{
		ID:     strings.TrimPrefix(strings.TrimSpace(bag.ID), "t-"),
		Locale: locale,
		Term:   text,
		Status: "draft",
		Note:   strings.TrimSpace(bag.Note),
	}
	applyTBXTermDescrips(&term, bag.Descrips)
	for _, group := range bag.DescripGrps {
		applyTBXTermDescrips(&term, []tbxDescrip{group.Descrip})
		if note := strings.TrimSpace(group.Note); note != "" {
			term.Note = joinTBXNote(term.Note, note)
		}
	}
	for _, note := range bag.TermNotes {
		applyTBXTermNote(&term, note)
	}
	c.Terms = append(c.Terms, term)
}

func applyTBXConceptDescrips(c *interchangeConcept, descrips []tbxDescrip) {
	for _, d := range descrips {
		value := strings.TrimSpace(d.Text)
		switch strings.ToLower(strings.TrimSpace(d.Type)) {
		case "primaryterm":
			c.PrimaryTerm = value
			c.Present.PrimaryTerm = true
		case "subject", "subjectfield", "concept_domain", "domain":
			c.Subject = value
			c.Present.Subject = true
		case "definition", "concept_definition":
			c.Definition = value
			c.Present.Definition = true
		case "note", "concept_note", "conceptnote":
			c.Note = value
			c.Present.Note = true
		case "translatable":
			c.Translatable = isTBXTrue(value)
			c.Present.Translatable = true
		case "url", "concept_url", "concepturl":
			c.URL = value
			c.Present.URL = true
		case "figure":
			c.Figure = value
			c.Present.Figure = true
		case "createdbyuserid":
			c.CreatedByUserID = value
		}
	}
}

func applyTBXTermDescrips(term *interchangeTerm, descrips []tbxDescrip) {
	for _, d := range descrips {
		value := strings.TrimSpace(d.Text)
		switch strings.ToLower(strings.TrimSpace(d.Type)) {
		case "description", "context":
			term.Description = value
		case "note":
			term.Note = joinTBXNote(term.Note, value)
		case "partofspeech", "pos":
			term.PartOfSpeech = value
		case "gender":
			term.Gender = value
		case "termtype":
			term.TermType = value
		case "url":
			term.URL = value
		case "lemma":
			term.Lemma = value
		case "status":
			applyTBXTermStatus(term, value)
		case "casesensitive", "case":
			term.CaseSensitive = isTBXTrue(value)
		case "forbidden":
			term.Forbidden = isTBXTrue(value)
		case "preferred":
			if isTBXTrue(value) {
				term.Status = "preferred"
			}
		case "provenance":
			term.Provenance = value
		case "reviewstatus":
			term.ReviewStatus = value
		case "createdbyuserid":
			term.CreatedByUserID = value
		}
	}
}

func applyTBXTermNote(term *interchangeTerm, note tbxTermNote) {
	typ := strings.ToLower(strings.TrimSpace(note.Type))
	value := strings.TrimSpace(note.Text)
	switch typ {
	case "partofspeech", "pos":
		term.PartOfSpeech = value
	case "grammaticalgender", "gender":
		term.Gender = value
	case "termtype":
		term.TermType = value
	case "forbidden":
		term.Forbidden = isTBXTrue(value) || isTBXForbiddenToken(value)
	case "preferred":
		if isTBXTrue(value) {
			term.Status = "preferred"
		}
	case "casesensitive", "case":
		term.CaseSensitive = isTBXTrue(value)
	case "administrativestatus", "normativeauthorization":
		applyTBXAdministrativeStatus(term, value)
	case "status":
		applyTBXTermStatus(term, value)
	case "usagenote", "usage":
		if isTBXForbiddenToken(value) {
			term.Forbidden = true
			break
		}
		term.Note = joinTBXNote(term.Note, value)
	}
}

func applyTBXAdministrativeStatus(term *interchangeTerm, value string) {
	normalized := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(value), " ", ""))
	switch normalized {
	case "preferredterm-admn-sts", "preferredterm":
		term.Status = "preferred"
	case "admittedterm-admn-sts", "admittedterm":
		if term.Status != "preferred" {
			term.Status = "admitted"
		}
	case "deprecatedterm-admn-sts", "deprecatedterm":
		term.Status = "not_recommended"
	case "supersededterm-admn-sts", "supersededterm":
		term.Status = "obsolete"
	case "forbiddenterm", "forbidden":
		term.Forbidden = true
	}
}

func applyTBXTermStatus(term *interchangeTerm, value string) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "preferred", "preferredterm-admn-sts":
		term.Status = "preferred"
	case "admitted", "approved":
		if term.Status != "preferred" {
			term.Status = "admitted"
		}
	case "new", "draft":
		if term.Status == "" || term.Status == "draft" {
			term.Status = "draft"
		}
	case "not_recommended", "deprecated", "deprecatedterm-admn-sts":
		term.Status = "not_recommended"
	case "obsolete", "supersededterm-admn-sts":
		term.Status = "obsolete"
	case "forbidden", "forbiddenterm":
		term.Forbidden = true
	default:
		if value != "" {
			term.Status = value
		}
	}
}

func isTBXTrue(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "true", "yes", "1":
		return true
	default:
		return false
	}
}

func isTBXForbiddenToken(value string) bool {
	normalized := strings.ToLower(strings.TrimSpace(value))
	return normalized == "forbidden" || normalized == "forbiddenterm"
}

func joinTBXNote(existing, next string) string {
	existing = strings.TrimSpace(existing)
	next = strings.TrimSpace(next)
	switch {
	case next == "":
		return existing
	case existing == "":
		return next
	case existing == next:
		return existing
	default:
		return existing + "\n" + next
	}
}

func stripTBXPreamble(data []byte) []byte {
	data = bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf})
	lower := bytes.ToLower(data)
	start := bytes.Index(lower, []byte("<!doctype"))
	if start < 0 {
		return data
	}
	end := bytes.IndexByte(data[start:], '>')
	if end < 0 {
		return data
	}
	stripped := make([]byte, 0, len(data)-(end+1))
	stripped = append(stripped, data[:start]...)
	stripped = append(stripped, data[start+end+1:]...)
	return stripped
}

func tbxLooksPopulated(data []byte) bool {
	return bytes.Contains(data, []byte("<termEntry")) ||
		bytes.Contains(data, []byte("<conceptEntry")) ||
		bytes.Contains(data, []byte("<tig")) ||
		bytes.Contains(data, []byte("<termSec")) ||
		bytes.Contains(data, []byte("<ntig"))
}
