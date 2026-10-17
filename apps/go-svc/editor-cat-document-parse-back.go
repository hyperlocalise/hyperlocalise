package main

import (
	"net/http"
	"path"
	"sort"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/srx"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

// Unmapped reasons tell the editor why an edit in the whole document was not saved.
const (
	editorCatParseBackUnknownKey  = "unknown_key"
	editorCatParseBackMissing     = "missing"
	editorCatParseBackSentences   = "split_into_sentences"
	editorCatParseBackMaxDocument = 1 << 20
)

var editorCatParseBackExtensions = map[string]bool{".md": true, ".mdx": true, ".html": true}

type editorCatDocumentChange struct {
	ExternalStringID string `json:"externalStringId"`
	Key              string `json:"key"`
	TargetText       string `json:"targetText"`
}

type editorCatDocumentUnmapped struct {
	Key    string `json:"key"`
	Text   string `json:"text"`
	Reason string `json:"reason"`
}

type editorCatDocumentParseBack struct {
	Changes  []editorCatDocumentChange   `json:"changes"`
	Unmapped []editorCatDocumentUnmapped `json:"unmapped"`
}

type editorCatParseBackKey struct {
	id     string
	key    string
	target string
}

// parseBackDocument maps an edited Markdown or HTML target back onto the file's segments.
// It parses with the ingest parser, so a paragraph keeps its key while its structure holds.
// It returns the changed segments and the edits it could not map; the client saves the
// changes as drafts through the normal translation path.
func (api *editorCatAPI) parseBackDocument(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	var body struct {
		SourcePath   string `json:"sourcePath"`
		TargetLocale string `json:"targetLocale"`
		Content      string `json:"content"`
	}
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	sourcePath := trimEditorCat(body.SourcePath)
	targetLocale := trimEditorCat(body.TargetLocale)
	if sourcePath == "" || targetLocale == "" || len(body.Content) > editorCatParseBackMaxDocument {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if !editorCatParseBackExtensions[strings.ToLower(path.Ext(sourcePath))] {
		return nil, 0, editorCatFailure(400, "unsupported_document_format", "Only Markdown, MDX, and HTML files map back to segments")
	}
	sourceFileID, err := api.sourceFileID(r, actor, project, sourcePath)
	if err != nil {
		return nil, 0, err
	}
	parsed, err := translationfileparser.NewDefaultStrategy().Parse(sourcePath, []byte(body.Content))
	if err != nil {
		return nil, 0, editorCatFailure(422, "document_parse_failed", "The edited document could not be parsed")
	}
	keys, err := api.parseBackKeys(r, actor, project, sourceFileID, targetLocale)
	if err != nil {
		return nil, 0, err
	}
	result := mapParsedDocumentToKeys(parsed, keys)
	noteRequest(r, "changes", len(result.Changes), "unmapped", len(result.Unmapped))
	return result, http.StatusOK, nil
}

func (api *editorCatAPI) parseBackKeys(r *http.Request, actor editorCatActor, project editorCatProject, sourceFileID, targetLocale string) ([]editorCatParseBackKey, error) {
	rows, err := api.pool.Query(r.Context(), `
        select k.id::text, k.key, coalesce(nullif(t.text, ''), k.source_text)
        from project_translation_keys k
        left join project_translations t on t.translation_key_id=k.id and t.target_locale=$4
            and t.organization_id=$1 and t.project_id=$2
        where k.organization_id=$1 and k.project_id=$2 and k.repository_source_file_id=$3`,
		actor.organizationID, project.ID, sourceFileID, targetLocale)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var keys []editorCatParseBackKey
	for rows.Next() {
		var key editorCatParseBackKey
		if err := rows.Scan(&key.id, &key.key, &key.target); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

// mapParsedDocumentToKeys diffs parsed document text against the stored targets.
// SRX splits a paragraph into sentence keys by the source text, and a translation does not
// split the same way, so an edited split paragraph is reported instead of guessed at.
func mapParsedDocumentToKeys(parsed map[string]string, keys []editorCatParseBackKey) editorCatDocumentParseBack {
	result := editorCatDocumentParseBack{Changes: []editorCatDocumentChange{}, Unmapped: []editorCatDocumentUnmapped{}}
	byKey := make(map[string]editorCatParseBackKey, len(keys))
	spans := map[string][]editorCatParseBackKey{}
	spanIndex := map[string]int{}
	for _, key := range keys {
		if fileKey, index, ok := srx.SplitSpanKey(key.key); ok {
			spans[fileKey] = append(spans[fileKey], key)
			spanIndex[key.key] = index
			continue
		}
		byKey[key.key] = key
	}

	fileKeys := make([]string, 0, len(parsed))
	for fileKey := range parsed {
		fileKeys = append(fileKeys, fileKey)
	}
	sort.Strings(fileKeys)
	for _, fileKey := range fileKeys {
		text := parsed[fileKey]
		if key, ok := byKey[fileKey]; ok {
			if strings.TrimSpace(text) != "" && text != key.target {
				result.Changes = append(result.Changes, editorCatDocumentChange{ExternalStringID: key.id, Key: fileKey, TargetText: text})
			}
			continue
		}
		if sentences, ok := spans[fileKey]; ok {
			sort.Slice(sentences, func(i, j int) bool { return spanIndex[sentences[i].key] < spanIndex[sentences[j].key] })
			joined := make([]string, len(sentences))
			for i, sentence := range sentences {
				joined[i] = sentence.target
			}
			if normalizeParseBackSpace(text) != normalizeParseBackSpace(strings.Join(joined, " ")) {
				result.Unmapped = append(result.Unmapped, editorCatDocumentUnmapped{Key: fileKey, Text: text, Reason: editorCatParseBackSentences})
			}
			continue
		}
		result.Unmapped = append(result.Unmapped, editorCatDocumentUnmapped{Key: fileKey, Text: text, Reason: editorCatParseBackUnknownKey})
	}

	missing := make([]string, 0)
	for key := range byKey {
		if _, ok := parsed[key]; !ok {
			missing = append(missing, key)
		}
	}
	for fileKey := range spans {
		if _, ok := parsed[fileKey]; !ok {
			missing = append(missing, fileKey)
		}
	}
	sort.Strings(missing)
	for _, key := range missing {
		result.Unmapped = append(result.Unmapped, editorCatDocumentUnmapped{Key: key, Reason: editorCatParseBackMissing})
	}
	return result
}

func normalizeParseBackSpace(value string) string {
	return strings.Join(strings.Fields(value), " ")
}
