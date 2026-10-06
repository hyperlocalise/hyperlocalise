package main

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var editorCatISODate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

type editorCatAdvancedFilter struct {
	AddedFrom         string `json:"addedFrom"`
	AddedTo           string `json:"addedTo"`
	UpdatedFrom       string `json:"updatedFrom"`
	UpdatedTo         string `json:"updatedTo"`
	StringType        string `json:"stringType"`
	TranslationStatus string `json:"translationStatus"`
	ApprovalStatus    string `json:"approvalStatus"`
	QaIssues          string `json:"qaIssues"`
	QaIssueType       string `json:"qaIssueType"`
	Comments          string `json:"comments"`
	Visibility        string `json:"visibility"`
}

var editorCatAllowedQualifiers = map[string]struct{}{
	"not_localized":           {},
	"whitespace_only":         {},
	"same_as_source":          {},
	"escaped_char_mismatch":   {},
	"length":                  {},
	"placeholder_mismatch":    {},
	"glossary_violation":      {},
	"format":                  {},
	"spelling":                {},
	"numbers_mismatch":        {},
	"punctuation_mismatch":    {},
	"character_case_mismatch": {},
	"translation_job":         {},
	"agent":                   {},
	"import":                  {},
	"general_question":        {},
	"translation_mistake":     {},
	"context_request":         {},
	"source_mistake":          {},
	"qa_failure":              {},
}

func parseEditorCatQueueFilterQualifier(value string) string {
	trimmed := trimEditorCat(value)
	if trimmed == "" {
		return ""
	}
	if _, ok := editorCatAllowedQualifiers[trimmed]; !ok {
		return ""
	}
	return trimmed
}

func parseEditorCatAdvancedFilter(raw string) (*editorCatAdvancedFilter, error) {
	trimmed := trimEditorCat(raw)
	if trimmed == "" {
		return nil, nil
	}
	if len(trimmed) > 4096 {
		return nil, editorCatFailure(400, "invalid_project_payload", "Invalid CAT query")
	}
	var filter editorCatAdvancedFilter
	if err := json.Unmarshal([]byte(trimmed), &filter); err != nil {
		return nil, editorCatFailure(400, "invalid_project_payload", "Invalid CAT query")
	}
	compacted := compactEditorCatAdvancedFilter(filter)
	if compacted == nil {
		return nil, nil
	}
	return compacted, nil
}

func compactEditorCatAdvancedFilter(filter editorCatAdvancedFilter) *editorCatAdvancedFilter {
	out := editorCatAdvancedFilter{}
	has := false
	if validEditorCatISODate(filter.AddedFrom) {
		out.AddedFrom = filter.AddedFrom
		has = true
	}
	if validEditorCatISODate(filter.AddedTo) {
		out.AddedTo = filter.AddedTo
		has = true
	}
	if validEditorCatISODate(filter.UpdatedFrom) {
		out.UpdatedFrom = filter.UpdatedFrom
		has = true
	}
	if validEditorCatISODate(filter.UpdatedTo) {
		out.UpdatedTo = filter.UpdatedTo
		has = true
	}
	switch filter.StringType {
	case "plain", "plural", "icu", "asset":
		out.StringType = filter.StringType
		has = true
	}
	switch filter.TranslationStatus {
	case "translated", "untranslated", "partially_translated":
		out.TranslationStatus = filter.TranslationStatus
		has = true
	}
	switch filter.ApprovalStatus {
	case "approved", "not_approved", "partially_approved":
		out.ApprovalStatus = filter.ApprovalStatus
		has = true
	}
	switch filter.QaIssues {
	case "with", "without":
		out.QaIssues = filter.QaIssues
		has = true
	}
	if qualifier := parseEditorCatQueueFilterQualifier(filter.QaIssueType); qualifier != "" {
		out.QaIssueType = qualifier
		has = true
	}
	switch filter.Comments {
	case "with", "without":
		out.Comments = filter.Comments
		has = true
	}
	switch filter.Visibility {
	case "visible", "hidden":
		out.Visibility = filter.Visibility
		has = true
	}
	if !has {
		return nil
	}
	return &out
}

func validEditorCatISODate(value string) bool {
	if !editorCatISODate.MatchString(value) {
		return false
	}
	_, err := time.Parse(time.DateOnly, value)
	return err == nil
}

func editorCatQueueNeedsLocale(query editorCatQueueQuery) bool {
	switch query.queueFilter {
	case "untranslated", "reviewed", "needs_review", "has_issues", "qa_issues", "machine_translated", "with_comments":
		return true
	}
	if query.advancedFilter == nil {
		return false
	}
	advanced := query.advancedFilter
	return advanced.TranslationStatus != "" || advanced.ApprovalStatus != "" || advanced.QaIssues != "" || advanced.Comments != ""
}

func editorCatTranslationMatchSQL(orgN, projectN, localeN int) string {
	return `t.translation_key_id = k.id and t.organization_id=$` + strconv.Itoa(orgN) +
		` and t.project_id=$` + strconv.Itoa(projectN) + ` and t.target_locale=$` + strconv.Itoa(localeN)
}

func editorCatQaIssuesSQL(orgN, projectN, localeN int, checkTypeN int) string {
	checkTypeSQL := ""
	if checkTypeN > 0 {
		checkTypeSQL = ` and q.check_type=$` + strconv.Itoa(checkTypeN)
	}
	return `exists (
            select 1 from translation_qa_findings q
            where q.translation_key_id = k.id and q.organization_id=$` + strconv.Itoa(orgN) + `
              and q.project_id=$` + strconv.Itoa(projectN) + ` and q.target_locale=$` + strconv.Itoa(localeN) + `
              and q.status='open'` + checkTypeSQL + `
              and q.run_id = (
                  select r.id from translation_qa_runs r
                  where r.organization_id=$` + strconv.Itoa(orgN) + ` and r.project_id=$` + strconv.Itoa(projectN) + `
                    and r.status='succeeded'
                  order by r.completed_at desc nulls last, r.created_at desc
                  limit 1
              )
        )`
}

func editorCatCommentsSQL(orgN, projectN, localeN int, without bool) string {
	existsSQL := `exists (
            select 1 from project_translation_comments c
            where c.translation_key_id = k.id and c.organization_id=$` + strconv.Itoa(orgN) + `
              and c.project_id=$` + strconv.Itoa(projectN) + ` and c.target_locale=$` + strconv.Itoa(localeN) + `
        )`
	if without {
		return `not ` + existsSQL
	}
	return existsSQL
}

func editorCatHasIssuesSQL(orgN, projectN, localeN, issueTypeN int) string {
	issueTypeSQL := ""
	commentIssueTypeSQL := ""
	if issueTypeN > 0 {
		n := strconv.Itoa(issueTypeN)
		issueTypeSQL = ` and i.issue_type=$` + n
		commentIssueTypeSQL = ` and c.issue_type=$` + n
	}
	return `(
            exists (
                select 1 from issue_sheet_issues i
                where i.translation_key_id = k.id and i.organization_id=$` + strconv.Itoa(orgN) + `
                  and i.project_id=$` + strconv.Itoa(projectN) + ` and i.target_locale=$` + strconv.Itoa(localeN) + `
                  and i.status in ('open', 'in_progress')` + issueTypeSQL + `
            )
            or exists (
                select 1 from project_translation_comments c
                where c.translation_key_id = k.id and c.organization_id=$` + strconv.Itoa(orgN) + `
                  and c.project_id=$` + strconv.Itoa(projectN) + ` and c.target_locale=$` + strconv.Itoa(localeN) + `
                  and c.type='issue' and c.status='unresolved'` + commentIssueTypeSQL + `
                  and not exists (select 1 from issue_sheet_issues i where i.linked_comment_id = c.id)
            )
        )`
}

func editorCatMachineTranslatedSQL(orgN, projectN, localeN, provenanceN int) string {
	provenanceSQL := ` and t.provenance in ('translation_job','agent','import')`
	if provenanceN > 0 {
		provenanceSQL = ` and t.provenance=$` + strconv.Itoa(provenanceN)
	}
	return `exists (select 1 from project_translations t where ` + editorCatTranslationMatchSQL(orgN, projectN, localeN) +
		` and trim(t.text) != ''` + provenanceSQL + `)`
}

func editorCatPresetFilterSQL(query editorCatQueueQuery, orgN, projectN, localeN int, args *[]any) string {
	translationMatch := editorCatTranslationMatchSQL(orgN, projectN, localeN)
	switch query.queueFilter {
	case "untranslated":
		return ` and not exists (select 1 from project_translations t where ` + translationMatch + ` and trim(t.text) != '')`
	case "reviewed":
		return ` and exists (select 1 from project_translations t where ` + translationMatch + ` and t.status='approved')`
	case "needs_review":
		return ` and exists (select 1 from project_translations t where ` + translationMatch + ` and trim(t.text) != '' and t.status != 'approved')`
	case "has_issues":
		issueTypeN := 0
		if query.queueFilterQualifier != "" {
			*args = append(*args, query.queueFilterQualifier)
			issueTypeN = len(*args)
		}
		return ` and ` + editorCatHasIssuesSQL(orgN, projectN, localeN, issueTypeN)
	case "qa_issues":
		checkTypeN := 0
		if query.queueFilterQualifier != "" {
			*args = append(*args, query.queueFilterQualifier)
			checkTypeN = len(*args)
		}
		return ` and ` + editorCatQaIssuesSQL(orgN, projectN, localeN, checkTypeN)
	case "hidden":
		return ` and k.is_hidden = true`
	case "not_hidden":
		return ` and k.is_hidden = false`
	case "machine_translated":
		provenanceN := 0
		if query.queueFilterQualifier != "" {
			*args = append(*args, query.queueFilterQualifier)
			provenanceN = len(*args)
		}
		return ` and ` + editorCatMachineTranslatedSQL(orgN, projectN, localeN, provenanceN)
	case "with_comments":
		return ` and ` + editorCatCommentsSQL(orgN, projectN, localeN, false)
	default:
		return ""
	}
}

func editorCatDateBoundSQL(column, from, to string, args *[]any) string {
	parts := make([]string, 0, 2)
	if from != "" {
		*args = append(*args, from)
		parts = append(parts, column+` >= CAST($`+strconv.Itoa(len(*args))+` AS date)`)
	}
	if to != "" {
		*args = append(*args, to)
		parts = append(parts, column+` < (CAST($`+strconv.Itoa(len(*args))+` AS date) + interval '1 day')`)
	}
	if len(parts) == 0 {
		return ""
	}
	return ` and ` + strings.Join(parts, " and ")
}

func editorCatStringTypeSQL(stringType string) string {
	switch stringType {
	case "plain":
		// Native JSON/JSONC ingestion stores ordinary entries as type "string".
		return ` and (k.type is null or k.type = '' or k.type in ('text', 'plain', 'string'))`
	case "plural":
		return ` and k.type = 'plural'`
	case "icu":
		return ` and k.type = 'icu'`
	case "asset":
		return ` and k.type in ('asset', 'image', 'video')`
	default:
		return ""
	}
}

func editorCatAdvancedFilterSQL(filter *editorCatAdvancedFilter, orgN, projectN, localeN int, args *[]any) string {
	if filter == nil {
		return ""
	}
	sql := ""
	sql += editorCatDateBoundSQL("k.created_at", filter.AddedFrom, filter.AddedTo, args)
	sql += editorCatDateBoundSQL("k.updated_at", filter.UpdatedFrom, filter.UpdatedTo, args)
	sql += editorCatStringTypeSQL(filter.StringType)

	translationMatch := editorCatTranslationMatchSQL(orgN, projectN, localeN)
	switch filter.TranslationStatus {
	case "untranslated":
		sql += ` and not exists (select 1 from project_translations t where ` + translationMatch + ` and trim(t.text) != '')`
	case "translated", "partially_translated":
		sql += ` and exists (select 1 from project_translations t where ` + translationMatch + ` and trim(t.text) != '')`
	}
	switch filter.ApprovalStatus {
	case "approved":
		sql += ` and exists (select 1 from project_translations t where ` + translationMatch + ` and t.status='approved')`
	case "not_approved", "partially_approved":
		sql += ` and exists (select 1 from project_translations t where ` + translationMatch + ` and trim(t.text) != '' and t.status != 'approved')`
	}
	if filter.QaIssues == "with" {
		checkTypeN := 0
		if filter.QaIssueType != "" {
			*args = append(*args, filter.QaIssueType)
			checkTypeN = len(*args)
		}
		sql += ` and ` + editorCatQaIssuesSQL(orgN, projectN, localeN, checkTypeN)
	}
	if filter.QaIssues == "without" {
		sql += ` and not ` + editorCatQaIssuesSQL(orgN, projectN, localeN, 0)
	}
	if filter.Comments == "with" {
		sql += ` and ` + editorCatCommentsSQL(orgN, projectN, localeN, false)
	}
	if filter.Comments == "without" {
		sql += ` and ` + editorCatCommentsSQL(orgN, projectN, localeN, true)
	}
	if filter.Visibility == "hidden" {
		sql += ` and k.is_hidden = true`
	}
	if filter.Visibility == "visible" {
		sql += ` and k.is_hidden = false`
	}
	return sql
}

func appendEditorCatQueueFilterSQL(where string, args []any, query editorCatQueueQuery, orgN, projectN int) (string, []any) {
	localeN := 0
	if editorCatQueueNeedsLocale(query) {
		args = append(args, query.targetLocale)
		localeN = len(args)
	}
	where += editorCatPresetFilterSQL(query, orgN, projectN, localeN, &args)
	where += editorCatAdvancedFilterSQL(query.advancedFilter, orgN, projectN, localeN, &args)
	return where, args
}

// editorCatQueueFilterSQL keeps the historical helper used by unit tests.
func editorCatQueueFilterSQL(filter string, orgN, projectN, localeN int) string {
	query := editorCatQueueQuery{queueFilter: filter}
	return editorCatPresetFilterSQL(query, orgN, projectN, localeN, &[]any{})
}

// editorCatQueueFilterBindsLocale reports whether the preset filter SQL references
// the target-locale placeholder.
func editorCatQueueFilterBindsLocale(filter string) bool {
	return editorCatQueueNeedsLocale(editorCatQueueQuery{queueFilter: filter})
}

type editorCatWholeFileSubject struct {
	contentKind string
	hasTarget   bool
	status      string
	createdAt   time.Time
	updatedAt   time.Time
}

func editorCatWholeFileMatchesAdvanced(subject editorCatWholeFileSubject, filter *editorCatAdvancedFilter) bool {
	if filter == nil {
		return true
	}
	if !editorCatWholeFileStringTypeMatches(subject.contentKind, filter.StringType) {
		return false
	}
	if !editorCatWholeFileTranslationMatches(subject.hasTarget, filter.TranslationStatus) {
		return false
	}
	if !editorCatWholeFileApprovalMatches(subject.hasTarget, subject.status, filter.ApprovalStatus) {
		return false
	}
	if filter.QaIssues == "with" || filter.QaIssueType != "" || filter.Comments == "with" {
		return false
	}
	if filter.Visibility == "hidden" {
		return false
	}
	if !editorCatWholeFileDateMatches(subject.createdAt, filter.AddedFrom, filter.AddedTo) {
		return false
	}
	if !editorCatWholeFileDateMatches(subject.updatedAt, filter.UpdatedFrom, filter.UpdatedTo) {
		return false
	}
	return true
}

func editorCatWholeFileStringTypeMatches(contentKind, stringType string) bool {
	if stringType == "" {
		return true
	}
	if stringType == "asset" {
		return contentKind == string(editorCatKindImage) || contentKind == string(editorCatKindVideo)
	}
	return false
}

func editorCatWholeFileTranslationMatches(hasTarget bool, translationStatus string) bool {
	switch translationStatus {
	case "":
		return true
	case "untranslated":
		return !hasTarget
	default:
		return hasTarget
	}
}

func editorCatWholeFileApprovalMatches(hasTarget bool, status, approvalStatus string) bool {
	switch approvalStatus {
	case "":
		return true
	case "approved":
		return status == "approved"
	default:
		return hasTarget && status != "approved"
	}
}

func editorCatWholeFileDateMatches(at time.Time, from, to string) bool {
	if from == "" && to == "" {
		return true
	}
	if at.IsZero() {
		return false
	}
	day := at.UTC()
	if from != "" {
		start, err := time.Parse(time.DateOnly, from)
		if err != nil || day.Before(start) {
			return false
		}
	}
	if to != "" {
		end, err := time.Parse(time.DateOnly, to)
		if err != nil || !day.Before(end.AddDate(0, 0, 1)) {
			return false
		}
	}
	return true
}
