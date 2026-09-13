package main

import (
	"context"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/text/collate"
	"golang.org/x/text/language"
)

func normalizeDictionaryProjectID(raw string) string {
	value := trimDictionaryInput(raw)
	for i := 0; i < 2 && strings.Contains(value, "%"); i++ {
		decoded, err := url.PathUnescape(value)
		if err != nil || decoded == value {
			break
		}
		value = decoded
	}
	return trimDictionaryInput(value)
}

func (api *dictionaryAPI) ownedProject(ctx context.Context, actor dictionaryActor, raw string) (string, error) {
	id := normalizeDictionaryProjectID(raw)
	if id == "" || utf16Length(id) > 128 {
		return "", missingDictionaryProject()
	}
	var found string
	err := api.pool.QueryRow(ctx, `select p.id from projects p where p.id=$1 and p.organization_id=$2 and ($3 or exists(select 1 from team_memberships m join teams t on t.id=m.team_id where m.user_id=$4 and t.organization_id=$2 and (t.id=p.team_id or (p.team_id is null and t.slug='default'))))`, id, actor.organizationID, actor.canWrite(), actor.userID).Scan(&found)
	if err == pgx.ErrNoRows {
		return "", missingDictionaryProject()
	}
	return found, err
}

type dictionaryAttachmentPayload struct {
	ProjectID    string `json:"projectId"`
	DictionaryID string `json:"dictionaryId"`
	Priority     *int   `json:"priority"`
}

func (p dictionaryAttachmentPayload) validate() error {
	if p.Priority != nil && (*p.Priority < 0 || *p.Priority > 10000) {
		return invalidDictionary()
	}
	return nil
}

type dictionaryProjectRecord struct {
	ProjectID   string `json:"projectId"`
	ProjectName string `json:"projectName"`
	Priority    int    `json:"priority"`
}

func (api *dictionaryAPI) dictionaryProjects(ctx context.Context, actor dictionaryActor, dictionaryID string) ([]dictionaryProjectRecord, error) {
	rows, err := api.pool.Query(ctx, `select a.project_id,p.name,a.priority from project_spellcheck_dictionaries a join projects p on p.id=a.project_id where a.dictionary_id=$1 and a.organization_id=$2 and p.organization_id=$2 order by a.priority,a.created_at,a.project_id`, dictionaryID, actor.organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []dictionaryProjectRecord{}
	for rows.Next() {
		var record dictionaryProjectRecord
		if err := rows.Scan(&record.ProjectID, &record.ProjectName, &record.Priority); err != nil {
			return nil, err
		}
		result = append(result, record)
	}
	return result, rows.Err()
}

func (api *dictionaryAPI) attachDictionary(ctx context.Context, actor dictionaryActor, projectID, dictionaryID string, priority *int) (int, bool, error) {
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return 0, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	// Serialize default priority assignment within a project.
	if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtextextended($1,0))`, "project_spellcheck_dictionaries:"+projectID); err != nil {
		return 0, false, err
	}
	value := 0
	if priority != nil {
		value = *priority
	} else if err := tx.QueryRow(ctx, `select coalesce(max(priority),-1)+1 from project_spellcheck_dictionaries where project_id=$1`, projectID).Scan(&value); err != nil {
		return 0, false, err
	}
	tag, err := tx.Exec(ctx, `insert into project_spellcheck_dictionaries (organization_id,project_id,dictionary_id,priority) select $1,p.id,d.id,$4 from projects p,spellcheck_dictionaries d where p.id=$2 and p.organization_id=$1 and d.id=$3 and d.organization_id=$1 on conflict do nothing`, actor.organizationID, projectID, dictionaryID, value)
	if err != nil {
		return 0, false, err
	}
	if err := tx.QueryRow(ctx, `select priority from project_spellcheck_dictionaries where project_id=$1 and dictionary_id=$2 and organization_id=$3`, projectID, dictionaryID, actor.organizationID).Scan(&value); err != nil {
		if err == pgx.ErrNoRows {
			return 0, false, missingDictionary()
		}
		return 0, false, err
	}
	return value, tag.RowsAffected() > 0, tx.Commit(ctx)
}

func (api *dictionaryAPI) dictionaryProjectRequest(r *http.Request, actor dictionaryActor, d dictionaryRecord, rest []string) (any, int, error) {
	if len(rest) > 1 {
		return nil, 0, missingDictionary()
	}
	ctx := r.Context()
	if r.Method == http.MethodDelete && len(rest) == 1 {
		projectID := normalizeDictionaryProjectID(rest[0])
		if projectID == "" || utf16Length(projectID) > 128 {
			return nil, 0, missingDictionary()
		}
		_, err := api.pool.Exec(ctx, `delete from project_spellcheck_dictionaries where dictionary_id=$1 and project_id=$2 and organization_id=$3`, d.ID, projectID, actor.organizationID)
		return nil, 204, err
	}
	if len(rest) != 0 {
		return nil, 0, missingDictionary()
	}
	if r.Method == http.MethodPost {
		var payload dictionaryAttachmentPayload
		if err := readDictionaryBody(r, &payload); err != nil {
			return nil, 0, err
		}
		if err := payload.validate(); err != nil {
			return nil, 0, err
		}
		projectID, err := api.ownedProject(ctx, actor, payload.ProjectID)
		if err != nil {
			return nil, 0, err
		}
		if _, _, err := api.attachDictionary(ctx, actor, projectID, d.ID, payload.Priority); err != nil {
			return nil, 0, err
		}
	} else if r.Method != http.MethodGet {
		return dictionaryMethodNotAllowed()
	}
	projects, err := api.dictionaryProjects(ctx, actor, d.ID)
	return map[string]any{"projects": projects}, 200, err
}

func (api *dictionaryAPI) projectDictionaries(ctx context.Context, actor dictionaryActor, projectID string, activeOnly bool) ([]dictionaryRecord, error) {
	rows, err := api.pool.Query(ctx, `select `+dictionaryColumns+`,a.priority from project_spellcheck_dictionaries a join spellcheck_dictionaries d on d.id=a.dictionary_id where a.project_id=$1 and a.organization_id=$2 and d.organization_id=$2 and (not $3 or d.status='active') order by a.priority,a.created_at,a.dictionary_id`, projectID, actor.organizationID, activeOnly)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []dictionaryRecord{}
	for rows.Next() {
		var priority int
		d, err := scanDictionary(rows, &priority)
		if err != nil {
			return nil, err
		}
		d.Priority = &priority
		result = append(result, d)
	}
	return result, rows.Err()
}

func (api *dictionaryAPI) projectRequest(r *http.Request, actor dictionaryActor) (any, int, error) {
	ctx := r.Context()
	projectID, err := api.ownedProject(ctx, actor, r.PathValue("projectId"))
	if err != nil {
		return nil, 0, err
	}
	rest := strings.Trim(r.PathValue("rest"), "/")
	if r.Method == http.MethodGet && rest == "resolved" {
		locale, err := dictionaryLocale(r.URL.Query().Get("locale"))
		if err != nil {
			return nil, 0, err
		}
		return api.resolvedWords(ctx, actor, projectID, locale)
	}
	if r.Method == http.MethodDelete && rest != "" && !strings.Contains(rest, "/") {
		// An absent attachment is an idempotent delete, including an unknown dictionary.
		if !validDictionaryID(rest) {
			return nil, 0, missingDictionary()
		}
		_, err := api.pool.Exec(ctx, `delete from project_spellcheck_dictionaries where project_id=$1 and dictionary_id=$2 and organization_id=$3`, projectID, rest, actor.organizationID)
		return nil, 204, err
	}
	if rest != "" {
		return nil, 0, missingDictionary()
	}
	switch r.Method {
	case http.MethodGet:
		dictionaries, err := api.projectDictionaries(ctx, actor, projectID, false)
		return map[string]any{"dictionaries": dictionaries}, 200, err
	case http.MethodPost:
		var payload dictionaryAttachmentPayload
		if err := readDictionaryBody(r, &payload); err != nil {
			return nil, 0, err
		}
		if err := payload.validate(); err != nil {
			return nil, 0, err
		}
		d, err := ownedDictionary(ctx, api.pool, actor, payload.DictionaryID)
		if err != nil {
			return nil, 0, err
		}
		priority, inserted, err := api.attachDictionary(ctx, actor, projectID, d.ID, payload.Priority)
		d.Priority = &priority
		status := 200
		if inserted {
			status = 201
		}
		return map[string]any{"dictionary": d}, status, err
	default:
		return dictionaryMethodNotAllowed()
	}
}

func (api *dictionaryAPI) resolvedWords(ctx context.Context, actor dictionaryActor, projectID, locale string) (any, int, error) {
	dictionaries, err := api.projectDictionaries(ctx, actor, projectID, true)
	if err != nil {
		return nil, 0, err
	}
	ids := []string{}
	versions := []string{}
	for _, d := range dictionaries {
		ids = append(ids, d.ID)
		versions = append(versions, d.ID+":"+strconv.Itoa(d.WordsVersion))
	}
	sort.Strings(versions)
	versions = append(versions, locale)
	rows, err := api.pool.Query(ctx, `select w.word,w.word_normalized,a.priority,a.created_at,a.dictionary_id from project_spellcheck_dictionaries a join spellcheck_dictionaries d on d.id=a.dictionary_id join spellcheck_dictionary_words w on w.dictionary_id=d.id where a.project_id=$1 and a.organization_id=$2 and d.organization_id=$2 and d.status='active' and w.locale=$3 order by a.priority,a.created_at,a.dictionary_id`, projectID, actor.organizationID, locale)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	wordRows := []dictionaryResolvedWord{}
	for rows.Next() {
		var row dictionaryResolvedWord
		if err := rows.Scan(&row.word, &row.folded, &row.priority, &row.createdAt, &row.dictionaryID); err != nil {
			return nil, 0, err
		}
		wordRows = append(wordRows, row)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"locale": locale, "words": mergeDictionaryWords(wordRows), "wordsVersion": strings.Join(versions, ","), "dictionaryIds": ids}, 200, nil
}

type dictionaryResolvedWord struct {
	word, folded, dictionaryID string
	priority                   int
	createdAt                  time.Time
}

func dictionaryWordWins(candidate, existing dictionaryResolvedWord) bool {
	if candidate.priority != existing.priority {
		return candidate.priority < existing.priority
	}
	if !candidate.createdAt.Equal(existing.createdAt) {
		return candidate.createdAt.Before(existing.createdAt)
	}
	return candidate.dictionaryID < existing.dictionaryID
}

func mergeDictionaryWords(rows []dictionaryResolvedWord) []string {
	winners := make(map[string]dictionaryResolvedWord, len(rows))
	for _, row := range rows {
		existing, ok := winners[row.folded]
		if !ok || dictionaryWordWins(row, existing) {
			winners[row.folded] = row
		}
	}
	words := make([]string, 0, len(winners))
	for _, row := range winners {
		words = append(words, row.word)
	}
	collator := collate.New(language.English)
	sort.Slice(words, func(i, j int) bool { return collator.CompareString(words[i], words[j]) < 0 })
	return capDictionaryWords(words)
}
