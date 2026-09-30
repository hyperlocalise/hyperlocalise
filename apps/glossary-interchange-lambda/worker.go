package main

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/xuri/excelize/v2"
)

type interchangeConcept struct {
	ID, PrimaryTerm, Subject, Definition, Note, URL, Figure, CreatedByUserID string
	Translatable                                                             bool
	Terms                                                                    []interchangeTerm
}
type interchangeTerm struct {
	ID, Locale, Term, Description, Note, PartOfSpeech, Gender, TermType, URL, Lemma, Status, Provenance, ReviewStatus, CreatedByUserID string
	CaseSensitive, Forbidden                                                                                                           bool
}

type interchangeImportOptions struct {
	StrictLocale  *bool             `json:"strictLocale"`
	LocaleMapping map[string]string `json:"localeMapping"`
}

type interchangeExportOptions struct {
	Scope            string   `json:"scope"`
	Locales          []string `json:"locales"`
	Search           string   `json:"search"`
	PartOfSpeech     string   `json:"partOfSpeech"`
	TermType         string   `json:"termType"`
	Gender           string   `json:"gender"`
	LinguisticStatus string   `json:"linguisticStatus"`
	CreatedByUserID  string   `json:"createdByUserId"`
}

const maxGlossaryInterchangeBytes int64 = 25 * 1024 * 1024

var headers = []string{"conceptId", "termId", "locale", "term", "primaryTerm", "subject", "definition", "translatable", "conceptNote", "conceptUrl", "figure", "description", "termNote", "partOfSpeech", "gender", "termType", "termUrl", "lemma", "status", "caseSensitive", "forbidden", "provenance", "reviewStatus"}

const csvFormulaEscapePrefix = "__HYPERLOCALISE_CSV_FORMULA__"

func escapeCSVFormula(value string) string {
	if strings.HasPrefix(value, csvFormulaEscapePrefix) {
		return csvFormulaEscapePrefix + value
	}
	trimmed := strings.TrimLeft(value, " \t")
	if trimmed != "" && strings.ContainsRune("=+-@", rune(trimmed[0])) {
		return csvFormulaEscapePrefix + value
	}
	return value
}

func processRun(ctx context.Context, pool *pgxpool.Pool, objects *objectstore.Registry, message interchangeMessage) error {
	var operation, format, mode, sourceLocation, sourceKey string
	var options []byte
	err := pool.QueryRow(ctx, `update glossary_import_runs set status='running' where id=$1 and operation=$2 and status in ('queued','running') returning operation, format, mode, coalesce(source_object_location,''), coalesce(source_object_key,''), options`, message.RunID, message.Operation).Scan(&operation, &format, &mode, &sourceLocation, &sourceKey, &options)
	if err == pgx.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	var runErr error
	if operation == "export" {
		runErr = runExport(ctx, pool, objects, message.RunID, format, options)
	} else {
		runErr = runImport(ctx, pool, objects, message.RunID, format, mode, sourceLocation, sourceKey, options)
	}
	if runErr != nil {
		if ctx.Err() != nil {
			return runErr
		}
		_, _ = pool.Exec(ctx, `update glossary_import_runs set status='failed', error_code='glossary_interchange_failed', error_message=$2, completed_at=now() where id=$1`, message.RunID, runErr.Error())
		return runErr
	}
	return nil
}

func runExport(ctx context.Context, pool *pgxpool.Pool, objects *objectstore.Registry, runID, format string, options []byte) error {
	var glossaryID, location string
	if err := pool.QueryRow(ctx, `select glossary_id, organization_id from glossary_import_runs where id=$1`, runID).Scan(&glossaryID, &location); err != nil {
		return err
	}
	concepts, err := loadConcepts(ctx, pool, glossaryID)
	if err != nil {
		return err
	}
	var exportOptions interchangeExportOptions
	if err := json.Unmarshal(options, &exportOptions); err != nil {
		return fmt.Errorf("decode export options: %w", err)
	}
	concepts = filterExportConcepts(concepts, exportOptions)
	body, contentType, ext, err := encodeDocument(format, concepts)
	if err != nil {
		return err
	}
	key := fmt.Sprintf("glossary-interchange/%s/%s/export/%s.%s", location, glossaryID, runID, ext)
	_, _, err = objects.Put(ctx, objectstore.PutInput{Key: key, Body: bytes.NewReader(body), Size: int64(len(body)), ContentType: contentType})
	if err != nil {
		return err
	}
	filename := fmt.Sprintf("glossary-%s.%s", glossaryID, ext)
	_, err = pool.Exec(ctx, `update glossary_import_runs set status='completed', result_object_location=$2, result_object_key=$3, result_filename=$4, result_content_type=$5, counts=$6::jsonb, completed_at=now() where id=$1`, runID, objects.DefaultLocationID(), key, filename, contentType, json.RawMessage(fmt.Sprintf(`{"concepts":%d}`, len(concepts))))
	return err
}

func runImport(ctx context.Context, pool *pgxpool.Pool, objects *objectstore.Registry, runID, format, mode, location, key string, options []byte) error {
	store, err := objects.Resolve(location)
	if err != nil {
		return err
	}
	info, err := store.Stat(ctx, key)
	if err != nil {
		return err
	}
	if info.Size <= 0 || info.Size > maxGlossaryInterchangeBytes {
		return fmt.Errorf("glossary import object size %d exceeds the 25 MB limit", info.Size)
	}
	body, _, err := store.Get(ctx, key)
	if err != nil {
		return err
	}
	defer func() { _ = body.Close() }()
	data, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	concepts, diagnostics, err := decodeDocument(format, data)
	if err != nil {
		return err
	}
	if len(diagnostics) > 0 {
		return fmt.Errorf("%s", diagnostics[0])
	}
	var importOptions interchangeImportOptions
	if err := json.Unmarshal(options, &importOptions); err != nil {
		return fmt.Errorf("decode import options: %w", err)
	}
	var sourceLocale string
	var localeCoverage []string
	if err := pool.QueryRow(ctx, `select source_locale, locale_coverage from glossaries where id=(select glossary_id from glossary_import_runs where id=$1)`, runID).Scan(&sourceLocale, &localeCoverage); err != nil {
		return err
	}
	knownLocales := map[string]bool{strings.ReplaceAll(sourceLocale, "_", "-"): true}
	for _, locale := range localeCoverage {
		knownLocales[strings.ReplaceAll(locale, "_", "-")] = true
	}
	strictLocale := importOptions.StrictLocale == nil || *importOptions.StrictLocale
	for i := range concepts {
		for j := range concepts[i].Terms {
			locale := strings.ReplaceAll(concepts[i].Terms[j].Locale, "_", "-")
			if mapped := importOptions.LocaleMapping[locale]; mapped != "" {
				locale = strings.ReplaceAll(mapped, "_", "-")
			}
			if strictLocale && !knownLocales[locale] {
				return fmt.Errorf("locale %q is not configured for this glossary", locale)
			}
			concepts[i].Terms[j].Locale = locale
		}
	}
	if mode == "preview" {
		_, err = pool.Exec(ctx, `update glossary_import_runs set status='completed', counts=$2::jsonb, completed_at=now() where id=$1`, runID, json.RawMessage(fmt.Sprintf(`{"concepts":%d}`, len(concepts))))
		return err
	}
	glossaryID := ""
	if err := pool.QueryRow(ctx, `select glossary_id from glossary_import_runs where id=$1`, runID).Scan(&glossaryID); err != nil {
		return err
	}
	if mode == "replace" {
		currentConcepts, err := loadConcepts(ctx, pool, glossaryID)
		if err != nil {
			return err
		}
		backup, contentType, ext, err := encodeDocument("tbx", currentConcepts)
		if err != nil {
			return err
		}
		backupKey := fmt.Sprintf("glossary-interchange/%s/%s/backup/%s.%s", objects.DefaultLocationID(), glossaryID, runID, ext)
		if _, _, err := objects.Put(ctx, objectstore.PutInput{Key: backupKey, Body: bytes.NewReader(backup), Size: int64(len(backup)), ContentType: contentType}); err != nil {
			return err
		}
		if _, err := pool.Exec(ctx, `update glossary_import_runs set backup_object_location=$2, backup_object_key=$3 where id=$1`, runID, objects.DefaultLocationID(), backupKey); err != nil {
			return err
		}
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if mode == "replace" {
		if _, err := tx.Exec(ctx, `delete from glossary_concepts where glossary_id=$1`, glossaryID); err != nil {
			return err
		}
	}
	for _, concept := range concepts {
		if err := saveConcept(ctx, tx, glossaryID, concept, mode); err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	_, err = pool.Exec(ctx, `update glossary_import_runs set status='completed', counts=$2::jsonb, completed_at=now() where id=$1`, runID, json.RawMessage(fmt.Sprintf(`{"concepts":%d}`, len(concepts))))
	return err
}

func loadConcepts(ctx context.Context, pool *pgxpool.Pool, glossaryID string) ([]interchangeConcept, error) {
	rows, err := pool.Query(ctx, `select c.id,c.primary_term,c.subject,c.definition,c.translatable,coalesce(c.note,''),coalesce(c.url,''),coalesce(c.figure,''),coalesce(c.created_by_user_id::text,'') from glossary_concepts c where c.glossary_id=$1 and c.archived_at is null order by c.id`, glossaryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var concepts []interchangeConcept
	byID := map[string]*interchangeConcept{}
	for rows.Next() {
		var c interchangeConcept
		if err := rows.Scan(&c.ID, &c.PrimaryTerm, &c.Subject, &c.Definition, &c.Translatable, &c.Note, &c.URL, &c.Figure, &c.CreatedByUserID); err != nil {
			return nil, err
		}
		concepts = append(concepts, c)
		byID[c.ID] = &concepts[len(concepts)-1]
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(concepts) == 0 {
		return concepts, nil
	}
	termRows, err := pool.Query(ctx, `select id,concept_id,coalesce(locale,''),coalesce(term,''),coalesce(description,''),coalesce(note,''),coalesce(part_of_speech,''),coalesce(gender,''),coalesce(term_type,''),coalesce(url,''),coalesce(lemma,''),coalesce(status,'draft'),coalesce(provenance,'manual'),coalesce(review_status,'proposed'),coalesce(case_sensitive,false),coalesce(forbidden,false),coalesce(created_by_user_id::text,'') from glossary_terms where glossary_id=$1 and concept_id is not null and archived_at is null order by locale,term`, glossaryID)
	if err != nil {
		return nil, err
	}
	defer termRows.Close()
	for termRows.Next() {
		var t interchangeTerm
		var conceptID string
		if err := termRows.Scan(&t.ID, &conceptID, &t.Locale, &t.Term, &t.Description, &t.Note, &t.PartOfSpeech, &t.Gender, &t.TermType, &t.URL, &t.Lemma, &t.Status, &t.Provenance, &t.ReviewStatus, &t.CaseSensitive, &t.Forbidden, &t.CreatedByUserID); err != nil {
			return nil, err
		}
		if c := byID[conceptID]; c != nil {
			c.Terms = append(c.Terms, t)
		}
	}
	return concepts, termRows.Err()
}

func filterExportConcepts(concepts []interchangeConcept, options interchangeExportOptions) []interchangeConcept {
	if options.Scope != "filtered" {
		return concepts
	}
	locales := map[string]bool{}
	for _, locale := range options.Locales {
		locales[strings.ReplaceAll(locale, "_", "-")] = true
	}
	search := strings.ToLower(strings.TrimSpace(options.Search))
	contains := func(values ...string) bool {
		if search == "" {
			return true
		}
		for _, value := range values {
			if strings.Contains(strings.ToLower(value), search) {
				return true
			}
		}
		return false
	}
	filtered := make([]interchangeConcept, 0, len(concepts))
	for _, concept := range concepts {
		terms := make([]interchangeTerm, 0, len(concept.Terms))
		for _, term := range concept.Terms {
			if len(locales) > 0 && !locales[strings.ReplaceAll(term.Locale, "_", "-")] {
				continue
			}
			if options.Gender != "" && term.Gender != options.Gender || options.PartOfSpeech != "" && term.PartOfSpeech != options.PartOfSpeech || options.TermType != "" && term.TermType != options.TermType || options.LinguisticStatus != "" && term.Status != options.LinguisticStatus {
				continue
			}
			if options.CreatedByUserID != "" && term.CreatedByUserID != options.CreatedByUserID && concept.CreatedByUserID != options.CreatedByUserID {
				continue
			}
			if contains(concept.PrimaryTerm, concept.Subject, concept.Definition, concept.Note, term.Term, term.Description, term.Note) {
				terms = append(terms, term)
			}
		}
		if len(terms) > 0 {
			concept.Terms = terms
			filtered = append(filtered, concept)
		}
	}
	return filtered
}

func saveConcept(ctx context.Context, tx pgx.Tx, glossaryID string, c interchangeConcept, mode string) error {
	var conceptID string
	lookupErr := tx.QueryRow(ctx, `select id from glossary_concepts where glossary_id=$1 and primary_term=$2 and archived_at is null limit 1`, glossaryID, c.PrimaryTerm).Scan(&conceptID)
	if lookupErr != nil && lookupErr != pgx.ErrNoRows {
		return lookupErr
	}
	if mode == "create" && lookupErr == nil {
		return nil
	}
	if mode == "update" && lookupErr == pgx.ErrNoRows {
		return nil
	}
	if conceptID == "" {
		if err := tx.QueryRow(ctx, `insert into glossary_concepts (glossary_id,primary_term,subject,definition,translatable,note,url,figure) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`, glossaryID, c.PrimaryTerm, c.Subject, c.Definition, c.Translatable, c.Note, c.URL, c.Figure).Scan(&conceptID); err != nil {
			return err
		}
	} else if mode != "merge" {
		if _, err := tx.Exec(ctx, `update glossary_concepts set subject=$2,definition=$3,translatable=$4,note=$5,url=$6,figure=$7,updated_at=now() where id=$1`, conceptID, c.Subject, c.Definition, c.Translatable, c.Note, c.URL, c.Figure); err != nil {
			return err
		}
	}
	for _, t := range c.Terms {
		_, err := tx.Exec(ctx, `insert into glossary_terms (glossary_id,concept_id,locale,term,source_term,target_term,description,note,part_of_speech,gender,term_type,url,lemma,status,case_sensitive,forbidden,provenance,review_status) values ($1,$2,$3,$4,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) on conflict (concept_id,locale,term) where concept_id is not null and locale is not null and term is not null do update set description=excluded.description,note=excluded.note,part_of_speech=excluded.part_of_speech,gender=excluded.gender,term_type=excluded.term_type,url=excluded.url,lemma=excluded.lemma,status=excluded.status,case_sensitive=excluded.case_sensitive,forbidden=excluded.forbidden,provenance=excluded.provenance,review_status=excluded.review_status,updated_at=now()`, glossaryID, conceptID, t.Locale, t.Term, t.Description, t.Note, t.PartOfSpeech, t.Gender, t.TermType, t.URL, t.Lemma, t.Status, t.CaseSensitive, t.Forbidden, t.Provenance, t.ReviewStatus)
		if err != nil {
			return err
		}
	}
	return nil
}

func encodeDocument(format string, concepts []interchangeConcept) ([]byte, string, string, error) {
	switch format {
	case "csv":
		var b bytes.Buffer
		w := csv.NewWriter(&b)
		if err := w.Write(headers); err != nil {
			return nil, "", "", err
		}
		for _, c := range concepts {
			for _, t := range c.Terms {
				if err := w.Write([]string{
					escapeCSVFormula(c.ID), escapeCSVFormula(t.ID), escapeCSVFormula(t.Locale), escapeCSVFormula(t.Term),
					escapeCSVFormula(c.PrimaryTerm), escapeCSVFormula(c.Subject), escapeCSVFormula(c.Definition),
					fmt.Sprintf("%t", c.Translatable), escapeCSVFormula(c.Note), escapeCSVFormula(c.URL), escapeCSVFormula(c.Figure),
					escapeCSVFormula(t.Description), escapeCSVFormula(t.Note), escapeCSVFormula(t.PartOfSpeech), escapeCSVFormula(t.Gender),
					escapeCSVFormula(t.TermType), escapeCSVFormula(t.URL), escapeCSVFormula(t.Lemma), escapeCSVFormula(t.Status),
					fmt.Sprintf("%t", t.CaseSensitive), fmt.Sprintf("%t", t.Forbidden), escapeCSVFormula(t.Provenance), escapeCSVFormula(t.ReviewStatus),
				}); err != nil {
					return nil, "", "", err
				}
			}
		}
		w.Flush()
		return b.Bytes(), "text/csv; charset=utf-8", "csv", w.Error()
	case "xlsx":
		b := bytes.NewBuffer(nil)
		f := excelize.NewFile()
		sheet := f.GetSheetName(0)
		for i, h := range headers {
			cell, _ := excelize.CoordinatesToCellName(i+1, 1)
			_ = f.SetCellValue(sheet, cell, h)
		}
		row := 2
		for _, c := range concepts {
			for _, t := range c.Terms {
				vals := []string{
					c.ID, t.ID, t.Locale, t.Term, c.PrimaryTerm, c.Subject, c.Definition, fmt.Sprintf("%t", c.Translatable), c.Note, c.URL, c.Figure,
					t.Description, t.Note, t.PartOfSpeech, t.Gender, t.TermType, t.URL, t.Lemma, t.Status, fmt.Sprintf("%t", t.CaseSensitive), fmt.Sprintf("%t", t.Forbidden), t.Provenance, t.ReviewStatus,
				}
				for i, v := range vals {
					cell, _ := excelize.CoordinatesToCellName(i+1, row)
					_ = f.SetCellValue(sheet, cell, v)
				}
				row++
			}
		}
		if err := f.Write(b); err != nil {
			return nil, "", "", err
		}
		return b.Bytes(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx", nil
	default:
		return encodeTBX(concepts)
	}
}

func encodeTBX(concepts []interchangeConcept) ([]byte, string, string, error) {
	type descrip struct {
		Type string `xml:"type,attr"`
		Text string `xml:",chardata"`
	}
	type term struct {
		ID       string    `xml:"id,attr"`
		Text     string    `xml:"term"`
		Descrips []descrip `xml:"descrip"`
	}
	type lang struct {
		Locale string `xml:"lang,attr"`
		Terms  []term `xml:"termSec"`
	}
	type entry struct {
		ID       string    `xml:"id,attr"`
		Descrips []descrip `xml:"descrip"`
		Langs    []lang    `xml:"langSec"`
	}
	root := struct {
		XMLName xml.Name `xml:"martif"`
		Entries []entry  `xml:"text>body>conceptEntry"`
	}{Entries: []entry{}}
	for _, c := range concepts {
		e := entry{ID: "c-" + c.ID, Descrips: []descrip{{Type: "primaryTerm", Text: c.PrimaryTerm}, {Type: "subject", Text: c.Subject}, {Type: "definition", Text: c.Definition}, {Type: "note", Text: c.Note}, {Type: "translatable", Text: fmt.Sprintf("%t", c.Translatable)}, {Type: "url", Text: c.URL}, {Type: "figure", Text: c.Figure}, {Type: "createdByUserId", Text: c.CreatedByUserID}}}
		by := map[string][]term{}
		for _, t := range c.Terms {
			by[t.Locale] = append(by[t.Locale], term{ID: "t-" + t.ID, Text: t.Term, Descrips: []descrip{{Type: "description", Text: t.Description}, {Type: "note", Text: t.Note}, {Type: "partOfSpeech", Text: t.PartOfSpeech}, {Type: "gender", Text: t.Gender}, {Type: "termType", Text: t.TermType}, {Type: "url", Text: t.URL}, {Type: "lemma", Text: t.Lemma}, {Type: "status", Text: t.Status}, {Type: "caseSensitive", Text: fmt.Sprintf("%t", t.CaseSensitive)}, {Type: "forbidden", Text: fmt.Sprintf("%t", t.Forbidden)}, {Type: "provenance", Text: t.Provenance}, {Type: "reviewStatus", Text: t.ReviewStatus}, {Type: "createdByUserId", Text: t.CreatedByUserID}}})
		}
		for l, ts := range by {
			e.Langs = append(e.Langs, lang{Locale: l, Terms: ts})
		}
		root.Entries = append(root.Entries, e)
	}
	out, err := xml.MarshalIndent(root, "", "  ")
	return append([]byte(xml.Header), out...), "application/xml; charset=utf-8", "tbx", err
}

func decodeDocument(format string, data []byte) ([]interchangeConcept, []string, error) {
	if format == "xlsx" {
		f, err := excelize.OpenReader(bytes.NewReader(data))
		if err != nil {
			return nil, nil, err
		}
		sheet := f.GetSheetName(0)
		rows, err := f.GetRows(sheet)
		if err != nil {
			return nil, nil, err
		}
		var b bytes.Buffer
		w := csv.NewWriter(&b)
		for _, r := range rows {
			_ = w.Write(r)
		}
		w.Flush()
		data = b.Bytes()
		format = "csv"
	}
	if format == "tbx" {
		return decodeTBX(data)
	}
	return decodeCSV(data)
}

func decodeCSV(data []byte) ([]interchangeConcept, []string, error) {
	rows, err := csv.NewReader(bytes.NewReader(bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf}))).ReadAll()
	if err != nil {
		return nil, nil, err
	}
	if len(rows) == 0 {
		return nil, nil, nil
	}
	header := map[string]int{}
	start := 0
	for i, h := range rows[0] {
		header[strings.ToLower(strings.TrimSpace(h))] = i
	}
	if _, ok := header["term"]; ok {
		start = 1
	}
	get := func(r []string, k string) string {
		if i, ok := header[k]; ok && i < len(r) {
			return strings.TrimSpace(r[i])
		}
		return ""
	}
	by := map[string]*interchangeConcept{}
	var order []string
	for _, r := range rows[start:] {
		id := get(r, "conceptid")
		term := get(r, "term")
		locale := strings.ReplaceAll(get(r, "locale"), "_", "-")
		if id == "" {
			id = term
		}
		if id == "" || term == "" || locale == "" {
			continue
		}
		c := by[id]
		if c == nil {
			c = &interchangeConcept{ID: id, PrimaryTerm: get(r, "primaryterm"), Subject: get(r, "subject"), Definition: get(r, "definition"), Note: get(r, "conceptnote")}
			if c.PrimaryTerm == "" {
				c.PrimaryTerm = term
			}
			by[id] = c
			order = append(order, id)
		}
		c.Translatable = strings.ToLower(get(r, "translatable")) != "false"
		c.URL = get(r, "concepturl")
		c.Figure = get(r, "figure")
		c.Terms = append(c.Terms, interchangeTerm{
			ID: get(r, "termid"), Locale: locale, Term: term, Description: get(r, "description"), Note: get(r, "termnote"),
			PartOfSpeech: get(r, "partofspeech"), Gender: get(r, "gender"), TermType: get(r, "termtype"), URL: get(r, "termurl"),
			Lemma: get(r, "lemma"), Status: get(r, "status"), Provenance: get(r, "provenance"), ReviewStatus: get(r, "reviewstatus"),
			CaseSensitive: strings.ToLower(get(r, "casesensitive")) == "true", Forbidden: strings.ToLower(get(r, "forbidden")) == "true",
		})
	}
	out := make([]interchangeConcept, 0, len(order))
	for _, id := range order {
		out = append(out, *by[id])
	}
	return out, nil, nil
}

func decodeTBX(data []byte) ([]interchangeConcept, []string, error) {
	type term struct {
		ID   string `xml:"id,attr"`
		Text string `xml:"term"`
	}
	type lang struct {
		Locale string `xml:"lang,attr"`
		Terms  []term `xml:"termSec"`
	}
	type entry struct {
		ID    string `xml:"id,attr"`
		Langs []lang `xml:"langSec"`
	}
	var root struct {
		Entries []entry `xml:"text>body>conceptEntry"`
	}
	if err := xml.Unmarshal(data, &root); err != nil {
		return nil, nil, err
	}
	var out []interchangeConcept
	for _, e := range root.Entries {
		c := interchangeConcept{ID: strings.TrimPrefix(e.ID, "c-")}
		for _, l := range e.Langs {
			for _, t := range l.Terms {
				if c.PrimaryTerm == "" {
					c.PrimaryTerm = t.Text
				}
				c.Terms = append(c.Terms, interchangeTerm{ID: strings.TrimPrefix(t.ID, "t-"), Locale: l.Locale, Term: t.Text, Status: "draft"})
			}
		}
		if c.ID == "" {
			c.ID = uuid.NewString()
		}
		out = append(out, c)
	}
	return out, nil, nil
}
