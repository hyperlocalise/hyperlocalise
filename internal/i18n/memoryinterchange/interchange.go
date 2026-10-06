package memoryinterchange

import (
	"bytes"
	"encoding/csv"
	"encoding/xml"
	"fmt"
	"io"
	"strconv"
	"strings"
	"unicode"

	editor_export "github.com/hyperlocalise/hyperlocalise/internal/i18n/editor-export"
	"golang.org/x/text/language"
	"golang.org/x/text/unicode/norm"
)

const FormulaEscapePrefix = "__HYPERLOCALISE_CSV_FORMULA__"

// NormalizeSourceText is the canonical memory-entry source key normalization.
func NormalizeSourceText(sourceText string) string {
	if sourceText == "" {
		return ""
	}
	if isASCII(sourceText) && isNormalizedASCII(sourceText) {
		return sourceText
	}
	if isASCII(sourceText) {
		var builder strings.Builder
		builder.Grow(len(sourceText))
		pendingSpace := false
		hasWritten := false
		for i := 0; i < len(sourceText); i++ {
			character := sourceText[i]
			if isASCIIWhitespace(character) {
				if hasWritten {
					pendingSpace = true
				}
				continue
			}
			if pendingSpace {
				builder.WriteByte(' ')
				pendingSpace = false
			}
			if character >= 'A' && character <= 'Z' {
				character += 'a' - 'A'
			}
			builder.WriteByte(character)
			hasWritten = true
		}
		return builder.String()
	}
	normalized := norm.NFKC.String(sourceText)
	var builder strings.Builder
	builder.Grow(len(normalized))
	pendingSpace := false
	hasWritten := false
	for _, r := range normalized {
		if unicode.IsSpace(r) {
			if hasWritten {
				pendingSpace = true
			}
			continue
		}
		if pendingSpace {
			builder.WriteByte(' ')
			pendingSpace = false
		}
		builder.WriteRune(unicode.ToLower(r))
		hasWritten = true
	}
	return builder.String()
}

func isASCII(value string) bool {
	for index := 0; index < len(value); index++ {
		if value[index] >= 0x80 {
			return false
		}
	}
	return true
}

func isASCIIWhitespace(value byte) bool {
	return value == ' ' || value == '\t' || value == '\n' || value == '\r' || value == '\f' || value == '\v'
}

func isNormalizedASCII(value string) bool {
	if len(value) == 0 || isASCIIWhitespace(value[0]) || isASCIIWhitespace(value[len(value)-1]) {
		return false
	}
	inSpace := false
	for index := 0; index < len(value); index++ {
		character := value[index]
		if isASCIIWhitespace(character) {
			if character != ' ' || inSpace {
				return false
			}
			inSpace = true
		} else {
			if character >= 'A' && character <= 'Z' {
				return false
			}
			inSpace = false
		}
	}
	return true
}

type Candidate struct {
	SourceLocale string
	TargetLocale string
	SourceText   string
	TargetText   string
	MatchScore   int
	ExternalKey  *string
	UnitIndex    int
	Tuid         *string
	IsVariant    bool
}

type Issue struct {
	Severity  string
	Code      string
	Message   string
	UnitIndex *int
	Tuid      *string
}

func Parse(format, content string) ([]Candidate, []Issue, *string, error) {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "csv":
		candidates, issues := ParseCSV(content)
		return candidates, issues, nil, nil
	case "tmx":
		candidates, issues, header := ParseTMX(content)
		return candidates, issues, header, nil
	default:
		return nil, nil, nil, fmt.Errorf("unsupported memory interchange format %q", format)
	}
}

func parseCanonicalMemoryLocale(raw string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || len(trimmed) > 35 || strings.Contains(trimmed, " ") {
		return "", false
	}
	normalized := strings.ReplaceAll(trimmed, "_", "-")
	tag, err := language.Parse(normalized)
	if err != nil {
		return "", false
	}
	return tag.String(), true
}

func looksLikeBCP47Tag(value string) bool {
	_, ok := parseCanonicalMemoryLocale(value)
	return ok
}

func csvHasFourColumnDataRows(rows [][]string, start int) bool {
	for i := start; i < len(rows); i++ {
		if len(rows[i]) >= 4 {
			return true
		}
	}
	return false
}

func parseCSVCrowdinTwoColumn(rows [][]string) []Candidate {
	if len(rows) < 2 || len(rows[0]) != 2 {
		return nil
	}
	if !looksLikeBCP47Tag(rows[0][0]) || !looksLikeBCP47Tag(rows[0][1]) {
		return nil
	}
	sourceLocale, ok := parseCanonicalMemoryLocale(unescapeFormula(strings.TrimSpace(rows[0][0])))
	if !ok {
		return nil
	}
	targetLocale, ok := parseCanonicalMemoryLocale(unescapeFormula(strings.TrimSpace(rows[0][1])))
	if !ok {
		return nil
	}
	candidates := make([]Candidate, 0, len(rows)-1)
	for i := 1; i < len(rows); i++ {
		row := rows[i]
		if len(row) < 2 {
			continue
		}
		sourceText := unescapeFormula(row[0])
		targetText := unescapeFormula(row[1])
		if strings.TrimSpace(sourceText) == "" || strings.TrimSpace(targetText) == "" {
			continue
		}
		candidates = append(candidates, Candidate{
			SourceLocale: sourceLocale, TargetLocale: targetLocale,
			SourceText: sourceText, TargetText: targetText, MatchScore: 100, UnitIndex: i + 1,
		})
	}
	return candidates
}

func csvInvalidLocaleIssue(rowNum int, field, raw string) Issue {
	unitIndex := rowNum
	message := fmt.Sprintf("Skipping row %d: %s is not a valid BCP 47 locale.", rowNum, field)
	if trimmed := strings.TrimSpace(raw); trimmed != "" {
		message = fmt.Sprintf("Skipping row %d: %s locale %q is not a valid BCP 47 tag.", rowNum, field, trimmed)
	}
	return Issue{Severity: "warning", Code: "invalid_locale", Message: message, UnitIndex: &unitIndex}
}

func ParseCSV(content string) ([]Candidate, []Issue) {
	reader := csv.NewReader(strings.NewReader(strings.TrimPrefix(content, "\ufeff")))
	reader.FieldsPerRecord = -1
	rows, err := reader.ReadAll()
	if err != nil || len(rows) == 0 {
		return nil, nil
	}
	start := 0
	if len(rows[0]) >= 2 {
		joined := strings.ToLower(strings.Join(rows[0], " "))
		if strings.Contains(joined, "source") || strings.Contains(joined, "locale") {
			start = 1
		}
	}
	if !csvHasFourColumnDataRows(rows, start) {
		if crowdin := parseCSVCrowdinTwoColumn(rows); len(crowdin) > 0 {
			return crowdin, nil
		}
	}
	candidates := make([]Candidate, 0, len(rows)-start)
	issues := []Issue{}
	for i := start; i < len(rows); i++ {
		row := rows[i]
		rowNum := i + 1
		if len(row) < 4 {
			continue
		}
		score := 100
		if len(row) > 4 {
			if n, parseErr := strconv.Atoi(strings.TrimSpace(row[4])); parseErr == nil {
				score = n
			}
		}
		sourceLocale, ok := parseCanonicalMemoryLocale(unescapeFormula(strings.TrimSpace(row[0])))
		if !ok {
			issues = append(issues, csvInvalidLocaleIssue(rowNum, "source", row[0]))
			continue
		}
		targetLocale, ok := parseCanonicalMemoryLocale(unescapeFormula(strings.TrimSpace(row[1])))
		if !ok {
			issues = append(issues, csvInvalidLocaleIssue(rowNum, "target", row[1]))
			continue
		}
		sourceText := unescapeFormula(row[2])
		targetText := unescapeFormula(row[3])
		if strings.TrimSpace(sourceText) == "" || strings.TrimSpace(targetText) == "" {
			continue
		}
		candidates = append(candidates, Candidate{SourceLocale: sourceLocale, TargetLocale: targetLocale, SourceText: sourceText, TargetText: targetText, MatchScore: score, UnitIndex: rowNum})
	}
	return candidates, issues
}

func ParseTMX(content string) ([]Candidate, []Issue, *string) {
	issues := []Issue{}
	var headerSrclang *string
	candidates := []Candidate{}
	decoder := xml.NewDecoder(strings.NewReader(content))
	unitIndex := 0
	for {
		tok, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, []Issue{{Severity: "error", Code: "invalid_tmx", Message: "Unable to parse TMX content"}}, nil
		}
		start, ok := tok.(xml.StartElement)
		if !ok {
			continue
		}
		switch start.Name.Local {
		case "header":
			for _, attr := range start.Attr {
				if attr.Name.Local == "srclang" && attr.Value != "" {
					if value, ok := parseCanonicalMemoryLocale(attr.Value); ok {
						headerSrclang = &value
					}
				}
			}
		case "tu":
			unitIndex++
			var tuid *string
			for _, attr := range start.Attr {
				if attr.Name.Local == "tuid" && attr.Value != "" {
					value := attr.Value
					tuid = &value
				}
			}
			type tuv struct{ locale, text string }
			tuvs := []tuv{}
			depth := 1
			var currentLocale string
			var collecting bool
			var segment strings.Builder
			for depth > 0 {
				inner, innerErr := decoder.Token()
				if innerErr != nil {
					break
				}
				switch value := inner.(type) {
				case xml.StartElement:
					depth++
					if value.Name.Local == "tuv" {
						currentLocale = ""
						for _, attr := range value.Attr {
							if attr.Name.Local == "lang" {
								if locale, ok := parseCanonicalMemoryLocale(attr.Value); ok {
									currentLocale = locale
								}
							}
						}
					}
					if value.Name.Local == "seg" {
						collecting = true
						segment.Reset()
					}
				case xml.EndElement:
					if value.Name.Local == "seg" && collecting {
						tuvs = append(tuvs, tuv{locale: currentLocale, text: segment.String()})
						collecting = false
					}
					depth--
				case xml.CharData:
					if collecting {
						segment.Write(value)
					}
				}
			}
			if len(tuvs) < 2 {
				idx := unitIndex
				issues = append(issues, Issue{Severity: "error", Code: "invalid_tu", Message: "Translation unit requires at least two tuv segments", UnitIndex: &idx, Tuid: tuid})
				continue
			}
			source := tuvs[0]
			if headerSrclang != nil {
				for _, candidate := range tuvs {
					if strings.EqualFold(candidate.locale, *headerSrclang) {
						source = candidate
						break
					}
				}
			}
			for _, target := range tuvs {
				if target.locale == source.locale && target.text == source.text {
					continue
				}
				if strings.TrimSpace(target.text) == "" || target.locale == "" {
					continue
				}
				var externalKey *string
				if tuid != nil {
					key := "tmx:" + *tuid + ":" + target.locale
					externalKey = &key
				}
				candidates = append(candidates, Candidate{SourceLocale: source.locale, TargetLocale: target.locale, SourceText: source.text, TargetText: target.text, MatchScore: 100, ExternalKey: externalKey, UnitIndex: unitIndex, Tuid: tuid})
			}
		}
	}
	return candidates, issues, headerSrclang
}

func SerializeCSV(rows []Candidate) ([]byte, error) {
	var buffer bytes.Buffer
	buffer.WriteString("\ufeffsource_locale,target_locale,source_text,target_text,match_score\r\n")
	writer := csv.NewWriter(&buffer)
	writer.UseCRLF = true
	for _, row := range rows {
		if err := writer.Write([]string{escapeFormula(row.SourceLocale), escapeFormula(row.TargetLocale), escapeFormula(row.SourceText), escapeFormula(row.TargetText), strconv.Itoa(row.MatchScore)}); err != nil {
			return nil, err
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func SerializeTMX(rows []Candidate) []byte {
	exportRows := make([]editor_export.Row, 0, len(rows))
	for index, row := range rows {
		key := strconv.Itoa(index + 1)
		if row.ExternalKey != nil && *row.ExternalKey != "" {
			key = *row.ExternalKey
		}
		exportRows = append(exportRows, editor_export.Row{Key: key, SourceLocale: row.SourceLocale, TargetLocale: row.TargetLocale, SourceText: row.SourceText, TargetText: row.TargetText})
	}
	return editor_export.SerializeTMX(exportRows)
}

func escapeFormula(value string) string {
	if strings.HasPrefix(value, FormulaEscapePrefix) {
		return FormulaEscapePrefix + value
	}
	trimmed := strings.TrimLeft(value, " \t")
	if trimmed != "" && strings.ContainsRune("=+-@", rune(trimmed[0])) {
		return FormulaEscapePrefix + value
	}
	return value
}

func unescapeFormula(value string) string {
	if !strings.HasPrefix(value, FormulaEscapePrefix) {
		return value
	}
	rest := strings.TrimPrefix(value, FormulaEscapePrefix)
	if strings.HasPrefix(rest, FormulaEscapePrefix) {
		return rest
	}
	trimmed := strings.TrimLeft(rest, " \t")
	if trimmed != "" && strings.ContainsRune("=+-@", rune(trimmed[0])) {
		return rest
	}
	return value
}
