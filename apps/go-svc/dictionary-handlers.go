package main

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

// utf16Length returns the number of UTF-16 code units in value without heap allocations.
func utf16Length(value string) int {
	// ASCII fast-path: if all bytes are ASCII (< 0x80), UTF-16 code unit count equals string length.
	for i := 0; i < len(value); i++ {
		if value[i] >= 0x80 {
			n := 0
			for _, r := range value {
				if r > 0xffff {
					n += 2
				} else {
					n++
				}
			}
			return n
		}
	}
	return len(value)
}

type dictionaryPayload struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	Status      *string `json:"status"`
}

func (p *dictionaryPayload) validate(create bool) error {
	if p.Name != nil {
		value := trimDictionaryInput(*p.Name)
		p.Name = &value
		if value == "" || utf16Length(value) > 200 {
			return invalidDictionary()
		}
	}
	if create && p.Name == nil {
		return invalidDictionary()
	}
	if p.Description != nil && utf16Length(*p.Description) > 10000 {
		return invalidDictionary()
	}
	if !create && p.Name == nil && p.Description == nil && p.Status == nil {
		return invalidDictionary()
	}
	if !create && p.Status != nil && *p.Status != "active" && *p.Status != "draft" && *p.Status != "archived" {
		return invalidDictionary()
	}
	return nil
}

func dictionaryPage(r *http.Request, defaultLimit, maxLimit int) (int, int, error) {
	limit, offset := defaultLimit, 0
	for key, target := range map[string]*int{"limit": &limit, "offset": &offset} {
		if raw, ok := r.URL.Query()[key]; ok {
			n, err := strconv.ParseFloat(strings.TrimSpace(raw[0]), 64)
			if strings.TrimSpace(raw[0]) == "" {
				n, err = 0, nil
			}
			if err != nil || n < 0 || n > 9007199254740991 || n != float64(int(n)) {
				return 0, 0, invalidDictionary()
			}
			*target = int(n)
		}
	}
	if limit < 1 || limit > maxLimit {
		return 0, 0, invalidDictionary()
	}
	return limit, offset, nil
}

func (api *dictionaryAPI) createDictionary(r *http.Request, actor dictionaryActor) (any, int, error) {
	var payload dictionaryPayload
	if err := readDictionaryBody(r, &payload); err != nil {
		return nil, 0, err
	}
	if err := payload.validate(true); err != nil {
		return nil, 0, err
	}
	description := ""
	if payload.Description != nil {
		description = *payload.Description
	}
	d, err := scanDictionary(api.pool.QueryRow(r.Context(), `insert into spellcheck_word_libraries as d (organization_id, created_by_user_id, name, description) values ($1,$2,$3,$4) returning `+dictionaryColumns, actor.organizationID, actor.userID, *payload.Name, description))
	return map[string]any{"dictionary": d}, 201, err
}

func (api *dictionaryAPI) getDictionary(r *http.Request, actor dictionaryActor, d dictionaryRecord) (any, int, error) {
	var err error
	d.WordCount, err = dictionaryCount(r.Context(), api.pool, d.ID)
	return map[string]any{"dictionary": d}, 200, err
}

func (api *dictionaryAPI) patchDictionary(r *http.Request, actor dictionaryActor, d dictionaryRecord) (any, int, error) {
	var payload dictionaryPayload
	if err := readDictionaryBody(r, &payload); err != nil {
		return nil, 0, err
	}
	if err := payload.validate(false); err != nil {
		return nil, 0, err
	}
	updated, err := scanDictionary(api.pool.QueryRow(r.Context(), `update spellcheck_word_libraries as d set name=coalesce($3,name), description=coalesce($4,description), status=coalesce($5::asset_status,status), updated_at=now() where id=$1 and organization_id=$2 returning `+dictionaryColumns, d.ID, actor.organizationID, payload.Name, payload.Description, payload.Status))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, missingDictionary()
	}
	if err != nil {
		return nil, 0, err
	}
	updated.WordCount, err = dictionaryCount(r.Context(), api.pool, updated.ID)
	return map[string]any{"dictionary": updated}, 200, err
}

func (api *dictionaryAPI) deleteDictionary(r *http.Request, actor dictionaryActor, d dictionaryRecord) (any, int, error) {
	_, err := api.pool.Exec(r.Context(), `delete from spellcheck_word_libraries where id=$1 and organization_id=$2`, d.ID, actor.organizationID)
	return nil, 204, err
}

func (api *dictionaryAPI) listDictionaries(r *http.Request, actor dictionaryActor) (any, int, error) {
	limit, offset, err := dictionaryPage(r, 50, 100)
	projectID := normalizeDictionaryProjectID(r.URL.Query().Get("projectId"))
	// The previous API ignores the whole query if any list parameter is invalid.
	if err != nil || (r.URL.Query().Has("projectId") && (projectID == "" || utf16Length(projectID) > 128)) {
		limit, offset, projectID = 50, 0, ""
	}
	// Require team access before filtering by projectId; otherwise any member could
	// probe dictionaries attached to private team projects.
	if projectID != "" {
		if _, projectErr := api.ownedProject(r.Context(), actor, projectID); projectErr != nil {
			return map[string]any{"dictionaries": []dictionaryRecord{}}, 200, nil
		}
	}
	where := `d.organization_id=$1 and ($2='' or exists(select 1 from project_spellcheck_word_libraries a where a.library_id=d.id and a.organization_id=$1 and a.project_id=$2))`
	rows, err := api.pool.Query(r.Context(), `select `+dictionaryColumns+` from spellcheck_word_libraries d where `+where+` order by d.created_at desc limit $3 offset $4`, actor.organizationID, projectID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	records := []dictionaryRecord{}
	for rows.Next() {
		d, scanErr := scanDictionary(rows)
		if scanErr != nil {
			rows.Close()
			return nil, 0, scanErr
		}
		records = append(records, d)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	// Aggregate counts in one query rather than one round trip per library.
	ids := make([]string, len(records))
	for i, d := range records {
		ids[i] = d.ID
	}
	counts, err := api.pool.Query(r.Context(), `select library_id, count(*) from spellcheck_word_library_words where library_id=any($1::uuid[]) group by library_id`, ids)
	if err != nil {
		return nil, 0, err
	}
	countByID := map[string]int{}
	for counts.Next() {
		var id string
		var count int
		if err := counts.Scan(&id, &count); err != nil {
			counts.Close()
			return nil, 0, err
		}
		countByID[id] = count
	}
	counts.Close()
	if err := counts.Err(); err != nil {
		return nil, 0, err
	}
	for i := range records {
		records[i].WordCount = countByID[records[i].ID]
	}
	var total int
	err = api.pool.QueryRow(r.Context(), `select count(*) from spellcheck_word_libraries d where `+where, actor.organizationID, projectID).Scan(&total)
	return map[string]any{"dictionaries": records, "total": total}, 200, err
}

func (api *dictionaryAPI) withDictionaryWords(ctx context.Context, actor dictionaryActor, id string, fn func(pgx.Tx) error) error {
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }() // Rollback after commit is harmless.
	if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtextextended($1,0))`, "spellcheck_word_library_words:"+id); err != nil {
		return err
	}
	// Lock the owner row as well so deleting a library cannot race a word mutation.
	var owned string
	if err := tx.QueryRow(ctx, `select id from spellcheck_word_libraries where id=$1 and organization_id=$2 for update`, id, actor.organizationID).Scan(&owned); err != nil {
		if err == pgx.ErrNoRows {
			return missingDictionary()
		}
		return err
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
