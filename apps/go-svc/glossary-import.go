package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type glossaryImportPayload struct {
	Format          string            `json:"format"`
	Content         string            `json:"content"`
	ContentEncoding *string           `json:"contentEncoding"`
	SourceFilename  *string           `json:"sourceFilename"`
	Mode            *string           `json:"mode"`
	PreviewForMode  *string           `json:"previewForMode"`
	StrictLocale    *bool             `json:"strictLocale"`
	LocaleMapping   map[string]string `json:"localeMapping"`
}

type glossaryImportConcept struct {
	ID          string
	PrimaryTerm string
	Subject     string
	Definition  string
	Note        string
	Terms       []glossaryImportTerm
}

type glossaryImportTerm struct {
	ID           string
	Locale       string
	Term         string
	Description  string
	Note         string
	PartOfSpeech string
	Status       string
}

type glossaryImportDiagnostic struct {
	Severity  string  `json:"severity"`
	Code      string  `json:"code"`
	Message   string  `json:"message"`
	SourceRow *int    `json:"sourceRow,omitempty"`
	ConceptID *string `json:"conceptId,omitempty"`
	TermID    *string `json:"termId,omitempty"`
	Field     *string `json:"field,omitempty"`
}

func (api *glossaryAPI) exportGlossaryHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	return api.exportGlossary(r, g)
}

func (api *glossaryAPI) getGlossaryImportReportHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	reportID := r.PathValue("reportId")
	if !validGlossaryID(reportID) {
		return nil, 0, missingGlossary()
	}
	return api.getGlossaryImportReport(r.Context(), actor, g, reportID)
}

func (api *glossaryAPI) getGlossaryImportBackupHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	if !validGlossaryID(r.PathValue("reportId")) {
		return nil, 0, missingGlossary()
	}
	return glossaryNotImplemented()
}

func (api *glossaryAPI) getGlossaryImportReport(ctx context.Context, actor glossaryActor, g glossaryRecord, reportID string) (any, int, error) {
	var (
		id, orgID, glossaryID, format, mode, status string
		createdBy                                   *string
		sourceFilename, sourceSha, backupFileID     *string
		options, sourceTotals, counts               []byte
		createdAt                                   time.Time
		completedAt                                 *time.Time
	)
	err := api.pool.QueryRow(ctx, `select id, organization_id, glossary_id, created_by_user_id, format, mode, status, source_filename, source_sha256, options, source_totals, counts, backup_file_id, created_at, completed_at from glossary_import_runs where id=$1 and glossary_id=$2 and organization_id=$3`, reportID, g.ID, actor.organizationID).Scan(
		&id, &orgID, &glossaryID, &createdBy, &format, &mode, &status, &sourceFilename, &sourceSha, &options, &sourceTotals, &counts, &backupFileID, &createdAt, &completedAt,
	)
	if errorsIsNoRows(err) {
		return nil, 0, missingGlossary()
	}
	if err != nil {
		return nil, 0, err
	}
	entries := []map[string]any{}
	rows, err := api.pool.Query(ctx, `select id, severity, code, message, source_row, concept_id, term_id, field, created_at from glossary_import_report_entries where run_id=$1 order by created_at, id`, reportID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	for rows.Next() {
		var entryID, severity, code, message string
		var sourceRow *int
		var conceptID, termID, field *string
		var entryCreated time.Time
		if err := rows.Scan(&entryID, &severity, &code, &message, &sourceRow, &conceptID, &termID, &field, &entryCreated); err != nil {
			return nil, 0, err
		}
		entries = append(entries, map[string]any{
			"id": entryID, "severity": severity, "code": code, "message": message,
			"sourceRow": sourceRow, "conceptId": conceptID, "termId": termID, "field": field,
			"createdAt": formatGlossaryTime(entryCreated),
		})
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	report := map[string]any{
		"id": id, "organizationId": orgID, "glossaryId": glossaryID, "createdByUserId": createdBy,
		"format": format, "mode": mode, "status": status, "sourceFilename": sourceFilename,
		"sourceSha256": sourceSha, "options": jsonObjectOrEmpty(options), "sourceTotals": jsonObjectOrEmpty(sourceTotals),
		"counts": jsonObjectOrEmpty(counts), "backupFileId": backupFileID,
		"createdAt": formatGlossaryTime(createdAt), "completedAt": formatGlossaryTimePtr(completedAt),
	}
	return map[string]any{"report": report, "entries": entries}, 200, nil
}

func errorsIsNoRows(err error) bool {
	return err != nil && (err == pgx.ErrNoRows || strings.Contains(err.Error(), "no rows"))
}

func jsonObjectOrEmpty(raw []byte) json.RawMessage {
	if len(raw) == 0 {
		return json.RawMessage(`{}`)
	}
	return json.RawMessage(raw)
}

func (api *glossaryAPI) importGlossaryConcepts(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	if err := api.requireConceptWrite(r.Context(), actor, g); err != nil {
		return nil, 0, err
	}
	var payload glossaryImportPayload
	if err := readGlossaryBody(r, []string{"format", "content", "contentEncoding", "sourceFilename", "mode", "previewForMode", "strictLocale", "localeMapping"}, &payload); err != nil {
		return nil, 0, err
	}
	format := strings.ToLower(trimGlossaryInput(payload.Format))
	if format != "csv" && format != "tbx" && format != "xlsx" {
		return nil, 0, invalidGlossary()
	}
	if format == "xlsx" {
		return nil, 0, glossaryFailure(501, "not_implemented", "XLSX glossary import is not available on the native Go service yet")
	}
	mode := "merge"
	if payload.Mode != nil && *payload.Mode != "" {
		mode = *payload.Mode
	}
	switch mode {
	case "preview", "create", "update", "merge", "replace":
	default:
		return nil, 0, invalidGlossary()
	}
	content := payload.Content
	if payload.ContentEncoding != nil && strings.EqualFold(*payload.ContentEncoding, "base64") {
		decoded, err := base64.StdEncoding.DecodeString(content)
		if err != nil {
			return nil, 0, invalidGlossary()
		}
		content = string(decoded)
	}
	concepts, diagnostics := parseGlossaryImport(format, content)
	concepts, diagnostics = applyGlossaryImportLocaleOptions(g, payload, concepts, diagnostics)
	if mode == "preview" {
		counts := glossaryImportCounts(concepts, diagnostics)
		reportID, err := api.persistGlossaryImportRun(r.Context(), api.pool, actor, g, payload, mode, "preview", concepts, counts, diagnostics, nil)
		if err != nil {
			return nil, 0, err
		}
		return map[string]any{
			"reportId":    reportID,
			"imported":    0,
			"skipped":     counts["skipped"],
			"diagnostics": diagnostics,
			"planned": map[string]any{
				"concepts": len(concepts),
				"terms":    countImportTerms(concepts),
				"counts":   counts,
			},
		}, 200, nil
	}
	if mode == "replace" && glossaryImportHasErrors(diagnostics) {
		counts := glossaryImportCounts(concepts, diagnostics)
		reportID, err := api.persistGlossaryImportRun(r.Context(), api.pool, actor, g, payload, mode, "failed", concepts, counts, diagnostics, nil)
		if err != nil {
			return nil, 0, err
		}
		return map[string]any{
			"reportId":     reportID,
			"imported":     0,
			"updated":      0,
			"merged":       0,
			"skipped":      counts["skipped"],
			"diagnostics":  diagnostics,
			"backupFileId": nil,
		}, 400, nil
	}
	applied, counts, applyDiagnostics, reportID, err := api.applyGlossaryImport(r.Context(), actor, g, payload, mode, concepts, diagnostics)
	if err != nil {
		return nil, 0, err
	}
	api.bumpGlossaryCache(r.Context(), actor, g.ID)
	diagnostics = append(diagnostics, applyDiagnostics...)
	return map[string]any{
		"reportId":     reportID,
		"concepts":     applied,
		"imported":     counts["created"],
		"updated":      counts["updated"],
		"merged":       counts["merged"],
		"skipped":      counts["skipped"],
		"diagnostics":  diagnostics,
		"backupFileId": nil,
	}, 201, nil
}

func glossaryImportHasErrors(diagnostics []glossaryImportDiagnostic) bool {
	for _, d := range diagnostics {
		if d.Severity == "error" {
			return true
		}
	}
	return false
}

func applyGlossaryImportLocaleOptions(g glossaryRecord, payload glossaryImportPayload, concepts []glossaryImportConcept, diagnostics []glossaryImportDiagnostic) ([]glossaryImportConcept, []glossaryImportDiagnostic) {
	strict := payload.StrictLocale == nil || *payload.StrictLocale
	known := map[string]bool{}
	for _, lang := range glossaryLanguages(g) {
		known[strings.ToLower(lang.Locale)] = true
	}
	out := make([]glossaryImportConcept, 0, len(concepts))
	for _, concept := range concepts {
		terms := make([]glossaryImportTerm, 0, len(concept.Terms))
		for _, term := range concept.Terms {
			raw := strings.ReplaceAll(trimGlossaryInput(term.Locale), "_", "-")
			mapped := raw
			if payload.LocaleMapping != nil {
				if replacement, ok := payload.LocaleMapping[raw]; ok {
					mapped = strings.ReplaceAll(trimGlossaryInput(replacement), "_", "-")
				} else if replacement, ok := payload.LocaleMapping[term.Locale]; ok {
					mapped = strings.ReplaceAll(trimGlossaryInput(replacement), "_", "-")
				}
			}
			term.Locale = mapped
			if mapped == "" {
				id := concept.ID
				termID := term.ID
				field := "locale"
				diagnostics = append(diagnostics, glossaryImportDiagnostic{
					Severity: "error", Code: "invalid_locale", Message: "Term locale is missing",
					ConceptID: &id, TermID: &termID, Field: &field,
				})
				continue
			}
			if strict && len(known) > 0 && !known[strings.ToLower(mapped)] {
				id := concept.ID
				termID := term.ID
				field := "locale"
				diagnostics = append(diagnostics, glossaryImportDiagnostic{
					Severity: "error", Code: "unknown_locale", Message: "Term locale is not configured for this glossary",
					ConceptID: &id, TermID: &termID, Field: &field,
				})
				continue
			}
			terms = append(terms, term)
		}
		if len(terms) == 0 {
			if len(concept.Terms) > 0 {
				id := concept.ID
				diagnostics = append(diagnostics, glossaryImportDiagnostic{
					Severity: "error", Code: "concept_has_no_valid_terms", Message: "Concept has no valid terms and was not imported",
					ConceptID: &id,
				})
			}
			continue
		}
		concept.Terms = terms
		out = append(out, concept)
	}
	return out, diagnostics
}

func countImportTerms(concepts []glossaryImportConcept) int {
	n := 0
	for _, c := range concepts {
		n += len(c.Terms)
	}
	return n
}

func glossaryImportCounts(concepts []glossaryImportConcept, diagnostics []glossaryImportDiagnostic) map[string]int {
	counts := map[string]int{
		"conceptsRead": len(concepts), "termsRead": countImportTerms(concepts),
		"conceptsCreated": 0, "termsCreated": 0, "conceptsUpdated": 0, "termsUpdated": 0,
		"conceptsMerged": 0, "termsMerged": 0, "conceptsSkipped": 0, "termsSkipped": 0,
		"conceptsFailed": 0, "termsFailed": 0, "created": 0, "updated": 0, "merged": 0,
		"skipped": 0, "warned": 0, "failed": 0,
	}
	for _, d := range diagnostics {
		switch d.Severity {
		case "warning":
			counts["warned"]++
		case "error":
			counts["failed"]++
		}
	}
	return counts
}

func parseGlossaryImport(format, content string) ([]glossaryImportConcept, []glossaryImportDiagnostic) {
	if format == "tbx" {
		return parseGlossaryTBX(content)
	}
	return parseGlossaryCSV(content)
}

func parseGlossaryCSV(content string) ([]glossaryImportConcept, []glossaryImportDiagnostic) {
	diagnostics := []glossaryImportDiagnostic{}
	reader := csv.NewReader(strings.NewReader(strings.TrimPrefix(content, "\ufeff")))
	reader.FieldsPerRecord = -1
	rows, err := reader.ReadAll()
	if err != nil {
		return nil, []glossaryImportDiagnostic{{Severity: "error", Code: "invalid_csv", Message: "Unable to parse CSV content"}}
	}
	if len(rows) == 0 {
		return nil, diagnostics
	}
	headerIndex := map[string]int{}
	start := 0
	for i, cell := range rows[0] {
		key := strings.ToLower(strings.TrimSpace(cell))
		if key == "conceptid" || key == "locale" || key == "term" || key == "primaryterm" {
			for j, h := range rows[0] {
				headerIndex[strings.ToLower(strings.TrimSpace(h))] = j
			}
			start = 1
			break
		}
		_ = i
	}
	if start == 0 {
		headerIndex = map[string]int{"conceptid": 0, "locale": 1, "term": 2}
	}
	cell := func(row []string, key string) string {
		idx, ok := headerIndex[key]
		if !ok || idx >= len(row) {
			return ""
		}
		return unescapeGlossaryCSVFormula(strings.TrimSpace(row[idx]))
	}
	byConcept := map[string]*glossaryImportConcept{}
	order := []string{}
	for i := start; i < len(rows); i++ {
		row := rows[i]
		rowNum := i + 1
		conceptID := cell(row, "conceptid")
		if conceptID == "" {
			conceptID = cell(row, "conceptkey")
		}
		locale := strings.ReplaceAll(cell(row, "locale"), "_", "-")
		termText := cell(row, "term")
		if conceptID == "" {
			conceptID = termText
		}
		if conceptID == "" || locale == "" || termText == "" {
			n := rowNum
			diagnostics = append(diagnostics, glossaryImportDiagnostic{Severity: "error", Code: "invalid_csv_row", Message: "Row is missing conceptId, locale, or term", SourceRow: &n})
			continue
		}
		concept, ok := byConcept[conceptID]
		if !ok {
			concept = &glossaryImportConcept{
				ID:          conceptID,
				PrimaryTerm: cell(row, "primaryterm"),
				Subject:     cell(row, "subject"),
				Definition:  cell(row, "definition"),
				Note:        firstNonEmpty(cell(row, "conceptnote"), cell(row, "note")),
			}
			if concept.PrimaryTerm == "" {
				concept.PrimaryTerm = termText
			}
			byConcept[conceptID] = concept
			order = append(order, conceptID)
		}
		termID := cell(row, "termid")
		if termID == "" {
			termID = uuid.NewString()
		}
		concept.Terms = append(concept.Terms, glossaryImportTerm{
			ID: termID, Locale: locale, Term: termText,
			Description: cell(row, "description"), Note: firstNonEmpty(cell(row, "termnote"), cell(row, "note")),
			PartOfSpeech: cell(row, "partofspeech"), Status: firstNonEmpty(cell(row, "status"), "draft"),
		})
	}
	concepts := make([]glossaryImportConcept, 0, len(order))
	for _, id := range order {
		concepts = append(concepts, *byConcept[id])
	}
	return concepts, diagnostics
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

type tbxEntry struct {
	ID       string       `xml:"id,attr"`
	Descrips []tbxDescrip `xml:"descrip"`
	Langs    []tbxLangSec `xml:"langSec"`
}

type tbxDescrip struct {
	Type  string `xml:"type,attr"`
	Value string `xml:",chardata"`
}

type tbxLangSec struct {
	Lang  string       `xml:"lang,attr"`
	Terms []tbxTermSec `xml:"termSec"`
}

type tbxTermSec struct {
	ID   string `xml:"id,attr"`
	Term string `xml:"term"`
}

func parseGlossaryTBX(content string) ([]glossaryImportConcept, []glossaryImportDiagnostic) {
	diagnostics := []glossaryImportDiagnostic{}
	decoder := xml.NewDecoder(strings.NewReader(content))
	concepts := []glossaryImportConcept{}
	for {
		tok, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, []glossaryImportDiagnostic{{Severity: "error", Code: "invalid_tbx", Message: "Unable to parse TBX content"}}
		}
		se, ok := tok.(xml.StartElement)
		if !ok || se.Name.Local != "conceptEntry" {
			continue
		}
		var entry tbxEntry
		if err := decoder.DecodeElement(&entry, &se); err != nil {
			diagnostics = append(diagnostics, glossaryImportDiagnostic{Severity: "error", Code: "invalid_tbx_concept", Message: "Unable to parse conceptEntry"})
			continue
		}
		conceptID := strings.TrimPrefix(entry.ID, "c-")
		if conceptID == "" {
			conceptID = uuid.NewString()
		}
		concept := glossaryImportConcept{ID: conceptID}
		for _, d := range entry.Descrips {
			switch d.Type {
			case "subjectField":
				concept.Subject = strings.TrimSpace(d.Value)
			case "definition":
				concept.Definition = strings.TrimSpace(d.Value)
			}
		}
		for _, lang := range entry.Langs {
			locale := strings.ReplaceAll(attrOr(lang.Lang, seLang(lang)), "_", "-")
			for _, term := range lang.Terms {
				text := strings.TrimSpace(term.Term)
				if text == "" || locale == "" {
					continue
				}
				termID := strings.TrimPrefix(term.ID, "t-")
				if termID == "" {
					termID = uuid.NewString()
				}
				if concept.PrimaryTerm == "" {
					concept.PrimaryTerm = text
				}
				concept.Terms = append(concept.Terms, glossaryImportTerm{ID: termID, Locale: locale, Term: text, Status: "draft"})
			}
		}
		if len(concept.Terms) == 0 {
			continue
		}
		concepts = append(concepts, concept)
	}
	return concepts, diagnostics
}

func seLang(lang tbxLangSec) string { return lang.Lang }

func attrOr(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

var errGlossaryImportTermIDConflict = errors.New("glossary import term id conflict")

func isGlossaryImportTermConflict(err error) bool {
	return errors.Is(err, errGlossaryImportTermIDConflict)
}

func lookupImportGlossaryTerm(ctx context.Context, db dictionaryDB, glossaryID, conceptID, termID, locale, text string) (string, bool, error) {
	if validGlossaryID(termID) {
		var existing string
		err := db.QueryRow(ctx, `select id from glossary_terms where glossary_id=$1 and concept_id=$2 and id=$3 and archived_at is null`, glossaryID, conceptID, termID).Scan(&existing)
		if err == nil {
			return existing, true, nil
		}
		if !errorsIsNoRows(err) {
			return "", false, err
		}
		var otherConcept string
		conflictErr := db.QueryRow(ctx, `select concept_id from glossary_terms where glossary_id=$1 and id=$2 and archived_at is null`, glossaryID, termID).Scan(&otherConcept)
		if conflictErr == nil {
			return "", false, errGlossaryImportTermIDConflict
		}
		if !errorsIsNoRows(conflictErr) {
			return "", false, conflictErr
		}
	}
	var existing string
	err := db.QueryRow(ctx, `select id from glossary_terms where glossary_id=$1 and concept_id=$2 and locale=$3 and lower(term)=lower($4) and archived_at is null limit 1`, glossaryID, conceptID, locale, text).Scan(&existing)
	if err == nil {
		return existing, false, nil
	}
	if errorsIsNoRows(err) {
		return "", false, nil
	}
	return "", false, err
}

func (api *glossaryAPI) applyGlossaryImport(ctx context.Context, actor glossaryActor, g glossaryRecord, payload glossaryImportPayload, mode string, concepts []glossaryImportConcept, parseDiagnostics []glossaryImportDiagnostic) ([]glossaryConceptRecord, map[string]int, []glossaryImportDiagnostic, string, error) {
	counts := glossaryImportCounts(concepts, parseDiagnostics)
	diagnostics := []glossaryImportDiagnostic{}
	appliedIDs := []string{}
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, nil, nil, "", err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if mode == "replace" {
		if _, err := tx.Exec(ctx, `delete from glossary_concepts where glossary_id=$1`, g.ID); err != nil {
			return nil, nil, nil, "", err
		}
	}
	for _, incoming := range concepts {
		existingID := ""
		lookupErr := tx.QueryRow(ctx, `select id from glossary_concepts where glossary_id=$1 and id=$2 and archived_at is null`, g.ID, incoming.ID).Scan(&existingID)
		exists := lookupErr == nil
		if lookupErr != nil && !errorsIsNoRows(lookupErr) {
			return nil, nil, nil, "", lookupErr
		}
		if !exists && !validGlossaryID(incoming.ID) {
			lookupErr = tx.QueryRow(ctx, `select id from glossary_concepts where glossary_id=$1 and lower(primary_term)=lower($2) and archived_at is null limit 1`, g.ID, incoming.PrimaryTerm).Scan(&existingID)
			exists = lookupErr == nil
			if lookupErr != nil && !errorsIsNoRows(lookupErr) {
				return nil, nil, nil, "", lookupErr
			}
		}
		switch mode {
		case "create":
			if exists {
				counts["skipped"]++
				counts["conceptsSkipped"]++
				continue
			}
		case "update":
			if !exists {
				counts["failed"]++
				counts["conceptsFailed"]++
				id := incoming.ID
				diagnostics = append(diagnostics, glossaryImportDiagnostic{Severity: "error", Code: "concept_not_found", Message: "Concept not found for update", ConceptID: &id})
				continue
			}
		}
		primary := incoming.PrimaryTerm
		if primary == "" && len(incoming.Terms) > 0 {
			primary = incoming.Terms[0].Term
		}
		var conceptID string
		if exists {
			conceptID = existingID
			_, err = tx.Exec(ctx, `update glossary_concepts set primary_term=$3, subject=$4, definition=$5, note=$6, modified_by_user_id=$7, version=version+1, updated_at=now() where id=$1 and glossary_id=$2`, conceptID, g.ID, primary, incoming.Subject, incoming.Definition, incoming.Note, actor.userID)
			if err != nil {
				return nil, nil, nil, "", err
			}
			if mode == "merge" || mode == "replace" {
				counts["merged"]++
				counts["conceptsMerged"]++
			} else {
				counts["updated"]++
				counts["conceptsUpdated"]++
			}
		} else {
			conceptID = incoming.ID
			if !validGlossaryID(conceptID) {
				conceptID = uuid.NewString()
			}
			err = tx.QueryRow(ctx, `insert into glossary_concepts (id, glossary_id, primary_term, subject, definition, note, created_by_user_id, modified_by_user_id) values ($1,$2,$3,$4,$5,$6,$7,$7) returning id`, conceptID, g.ID, primary, incoming.Subject, incoming.Definition, incoming.Note, actor.userID).Scan(&conceptID)
			if err != nil {
				return nil, nil, nil, "", err
			}
			counts["created"]++
			counts["conceptsCreated"]++
		}
		for _, term := range incoming.Terms {
			locale := strings.ReplaceAll(trimGlossaryInput(term.Locale), "_", "-")
			text := trimGlossaryInput(term.Term)
			if locale == "" || text == "" {
				continue
			}
			termExists, _, termErr := lookupImportGlossaryTerm(ctx, tx, g.ID, conceptID, term.ID, locale, text)
			if termErr != nil {
				if isGlossaryImportTermConflict(termErr) {
					counts["failed"]++
					id := term.ID
					conceptRef := conceptID
					diagnostics = append(diagnostics, glossaryImportDiagnostic{
						Severity: "error", Code: "term_id_conflict", Message: "Term id belongs to another concept in this glossary",
						ConceptID: &conceptRef, TermID: &id,
					})
					continue
				}
				return nil, nil, nil, "", termErr
			}
			if termExists != "" {
				if mode == "create" {
					counts["termsSkipped"]++
					counts["skipped"]++
					continue
				}
				_, err = tx.Exec(ctx, `update glossary_terms set locale=$4, term=$5, source_term=$5, target_term=$5, description=$6, note=$7, part_of_speech=$8, status=$9, modified_by_user_id=$10, version=version+1, updated_at=now() where id=$1 and concept_id=$2 and glossary_id=$3`,
					termExists, conceptID, g.ID, locale, text, term.Description, term.Note, term.PartOfSpeech, firstNonEmpty(term.Status, "draft"), actor.userID)
				if err != nil {
					return nil, nil, nil, "", err
				}
				counts["termsMerged"]++
				continue
			}
			status := firstNonEmpty(term.Status, "draft")
			_, err = insertGlossaryTerm(ctx, tx, g, conceptID, actor.userID, glossaryConceptTermInput{
				Locale: locale, Term: text, Description: &term.Description, Note: &term.Note, PartOfSpeech: &term.PartOfSpeech, Status: &status,
			})
			if err != nil {
				return nil, nil, nil, "", err
			}
			counts["termsCreated"]++
			counts["created"]++
		}
		appliedIDs = append(appliedIDs, conceptID)
	}
	allDiagnostics := append(append([]glossaryImportDiagnostic{}, parseDiagnostics...), diagnostics...)
	reportID, err := api.persistGlossaryImportRun(ctx, tx, actor, g, payload, mode, "completed", concepts, counts, allDiagnostics, nil)
	if err != nil {
		return nil, nil, nil, "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, nil, nil, "", err
	}
	applied := []glossaryConceptRecord{}
	for _, conceptID := range appliedIDs {
		value, _, getErr := api.getConcept(ctx, g, conceptID)
		if getErr != nil {
			continue
		}
		if envelope, ok := value.(map[string]any); ok {
			if concept, ok := envelope["concept"].(glossaryConceptRecord); ok {
				applied = append(applied, concept)
			}
		}
	}
	return applied, counts, diagnostics, reportID, nil
}

func (api *glossaryAPI) persistGlossaryImportRun(ctx context.Context, db dictionaryDB, actor glossaryActor, g glossaryRecord, payload glossaryImportPayload, mode, status string, concepts []glossaryImportConcept, counts map[string]int, diagnostics []glossaryImportDiagnostic, backupFileID *string) (string, error) {
	options, _ := json.Marshal(map[string]any{
		"strictLocale":  payload.StrictLocale == nil || *payload.StrictLocale,
		"localeMapping": payload.LocaleMapping,
	})
	sourceTotals, _ := json.Marshal(map[string]int{"concepts": len(concepts), "terms": countImportTerms(concepts)})
	countsJSON, _ := json.Marshal(counts)
	sum := sha256.Sum256([]byte(payload.Content))
	sha := hex.EncodeToString(sum[:])
	var reportID string
	err := db.QueryRow(ctx, `insert into glossary_import_runs (organization_id, glossary_id, created_by_user_id, format, mode, status, source_filename, source_sha256, options, source_totals, counts, backup_file_id, completed_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,now()) returning id`,
		actor.organizationID, g.ID, actor.userID, strings.ToLower(payload.Format), mode, status, payload.SourceFilename, sha, options, sourceTotals, countsJSON, backupFileID,
	).Scan(&reportID)
	if err != nil {
		return "", err
	}
	for _, d := range diagnostics {
		if _, err := db.Exec(ctx, `insert into glossary_import_report_entries (run_id, severity, code, message, source_row, concept_id, term_id, field) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
			reportID, d.Severity, d.Code, d.Message, d.SourceRow, d.ConceptID, d.TermID, d.Field); err != nil {
			return "", err
		}
	}
	return reportID, nil
}
