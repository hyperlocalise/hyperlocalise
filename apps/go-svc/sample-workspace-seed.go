package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"path"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/memoryinterchange"
	"github.com/hyperlocalise/hyperlocalise/internal/nativeproject"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/jackc/pgx/v5"
)

const (
	sampleUploadSurface  = "sample_workspace"
	sampleMetadataKey    = "sampleWorkspace"
	sampleContentVersion = 1
)

type sampleWorkspaceMarker struct {
	Version       int      `json:"version"`
	GlossaryIDs   []string `json:"glossaryIds"`
	MemoryIDs     []string `json:"memoryIds"`
	DictionaryIDs []string `json:"dictionaryIds"`
}

type listedSampleProject struct {
	id       string
	name     string
	metadata []byte
}

func (api *sampleWorkspaceAPI) listSampleProjects(ctx context.Context, organizationID string) ([]listedSampleProject, error) {
	rows, err := api.pool.Query(ctx, `
		select id, name, coalesce(provider_metadata, '{}'::jsonb)
		from projects
		where organization_id=$1 and (provider_metadata -> $2) is not null`,
		organizationID, sampleMetadataKey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var projects []listedSampleProject
	for rows.Next() {
		var project listedSampleProject
		if err := rows.Scan(&project.id, &project.name, &project.metadata); err != nil {
			return nil, err
		}
		projects = append(projects, project)
	}
	return projects, rows.Err()
}

func (api *sampleWorkspaceAPI) status(ctx context.Context, organizationID string) (sampleWorkspaceStatus, error) {
	projects, err := api.listSampleProjects(ctx, organizationID)
	if err != nil {
		return sampleWorkspaceStatus{}, err
	}
	status := sampleWorkspaceStatus{Loaded: len(projects) > 0, Projects: make([]sampleWorkspaceProject, 0, len(projects))}
	for _, project := range projects {
		status.Projects = append(status.Projects, sampleWorkspaceProject{ID: project.id, Name: project.name})
	}
	return status, nil
}

func (api *sampleWorkspaceAPI) seedSampleWorkspace(ctx context.Context, actor organizationActor) (sampleWorkspaceSeedResult, error) {
	existing, err := api.listSampleProjects(ctx, actor.organizationID)
	if err != nil {
		return sampleWorkspaceSeedResult{}, err
	}
	if len(existing) > 0 {
		return sampleWorkspaceSeedResult{}, sampleWorkspaceExists()
	}

	created, err := api.insertSampleResources(ctx, actor)
	if err != nil {
		return sampleWorkspaceSeedResult{}, err
	}

	var fileCount, stringCount int
	for _, project := range created {
		for _, file := range project.spec.files {
			if err := api.seedSampleFile(ctx, actor, project.id, project.spec, file); err != nil {
				slog.ErrorContext(ctx, "sample_workspace_seed_failed", "error", err)
				_, _ = api.removeSampleWorkspace(ctx, actor.organizationID)
				return sampleWorkspaceSeedResult{}, err
			}
			fileCount++
			stringCount += len(file.strings)
		}
		if err := api.seedSampleComments(ctx, actor, project.id, project.spec); err != nil {
			slog.ErrorContext(ctx, "sample_workspace_seed_failed", "error", err)
			_, _ = api.removeSampleWorkspace(ctx, actor.organizationID)
			return sampleWorkspaceSeedResult{}, err
		}
	}

	projects := make([]sampleWorkspaceProject, 0, len(created))
	for _, project := range created {
		projects = append(projects, sampleWorkspaceProject{ID: project.id, Name: project.spec.name})
	}
	return sampleWorkspaceSeedResult{
		Projects:        projects,
		GlossaryCount:   1,
		MemoryCount:     1,
		DictionaryCount: 1,
		FileCount:       fileCount,
		StringCount:     stringCount,
	}, nil
}

type createdSampleProject struct {
	id   string
	spec sampleProject
}

func (api *sampleWorkspaceAPI) insertSampleResources(ctx context.Context, actor organizationActor) ([]createdSampleProject, error) {
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	coverage := sampleLocaleCoverageJSON()

	var glossaryID string
	if err := tx.QueryRow(ctx, `
		insert into glossaries (
			organization_id, created_by_user_id, name, description, source_locale, target_locale,
			control_level, locale_coverage, source
		) values ($1,$2,$3,$4,$5,null,'org',$6::jsonb,'native')
		returning id`,
		actor.organizationID, actor.userID, sampleGlossary.name, sampleGlossary.description,
		sampleSourceLocale, coverage,
	).Scan(&glossaryID); err != nil {
		return nil, err
	}

	for _, concept := range sampleGlossary.concepts {
		var conceptID string
		if err := tx.QueryRow(ctx, `
			insert into glossary_concepts (
				glossary_id, primary_term, definition, translatable, note, created_by_user_id, modified_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$6)
			returning id`,
			glossaryID, concept.primaryTerm, concept.definition, concept.translatable, concept.note, actor.userID,
		).Scan(&conceptID); err != nil {
			return nil, err
		}
		type glossaryTerm struct {
			locale    string
			text      string
			forbidden bool
		}
		terms := []glossaryTerm{{locale: sampleSourceLocale, text: concept.primaryTerm}}
		for locale, text := range concept.terms {
			terms = append(terms, glossaryTerm{locale: locale, text: text})
		}
		for locale, text := range concept.forbidden {
			terms = append(terms, glossaryTerm{locale: locale, text: text, forbidden: true})
		}
		for _, term := range terms {
			status := "preferred"
			if term.forbidden {
				status = "not_recommended"
			}
			if _, err := tx.Exec(ctx, `
				insert into glossary_terms (
					glossary_id, concept_id, locale, term, source_term, target_term, status, forbidden,
					provenance, created_by_user_id, modified_by_user_id
				) values ($1,$2,$3,$4,$4,$4,$5,$6,'manual',$7,$7)`,
				glossaryID, conceptID, term.locale, term.text, status, term.forbidden, actor.userID,
			); err != nil {
				return nil, err
			}
		}
	}

	var memoryID string
	if err := tx.QueryRow(ctx, `
		insert into memories (
			organization_id, created_by_user_id, name, description, source, locale_coverage
		) values ($1,$2,$3,$4,'native',$5::jsonb)
		returning id`,
		actor.organizationID, actor.userID, sampleMemory.name, sampleMemory.description, coverage,
	).Scan(&memoryID); err != nil {
		return nil, err
	}
	for _, entry := range sampleMemory.entries {
		normalized := memoryinterchange.NormalizeSourceText(entry.sourceText)
		for locale, target := range entry.translations {
			if _, err := tx.Exec(ctx, `
				insert into memory_entries (
					memory_id, source_locale, target_locale, source_text, normalized_source_text,
					target_text, provenance, created_by_user_id, modified_by_user_id
				) values ($1,$2,$3,$4,$5,$6,'manual',$7,$7)`,
				memoryID, sampleSourceLocale, locale, entry.sourceText, normalized, target, actor.userID,
			); err != nil {
				return nil, err
			}
		}
	}

	var dictionaryID string
	if err := tx.QueryRow(ctx, `
		insert into spellcheck_word_libraries (
			organization_id, created_by_user_id, name, description
		) values ($1,$2,$3,$4)
		returning id`,
		actor.organizationID, actor.userID, sampleDictionary.name, sampleDictionary.description,
	).Scan(&dictionaryID); err != nil {
		return nil, err
	}
	for _, locale := range sampleDictionary.locales {
		for _, word := range sampleDictionary.words {
			normalized, ok := normalizeDictionaryWord(word)
			if !ok {
				continue
			}
			if _, err := tx.Exec(ctx, `
				insert into spellcheck_word_library_words (
					library_id, locale, word, word_normalized, created_by_user_id
				) values ($1,$2,$3,$4,$5)
				on conflict do nothing`,
				dictionaryID, locale, normalized.word, normalized.folded, actor.userID,
			); err != nil {
				return nil, err
			}
		}
	}
	if _, err := tx.Exec(ctx, `update spellcheck_word_libraries set words_version=words_version+1, updated_at=now() where id=$1`, dictionaryID); err != nil {
		return nil, err
	}

	marker, err := json.Marshal(sampleWorkspaceMarker{
		Version:       sampleContentVersion,
		GlossaryIDs:   []string{glossaryID},
		MemoryIDs:     []string{memoryID},
		DictionaryIDs: []string{dictionaryID},
	})
	if err != nil {
		return nil, err
	}
	metadata, err := json.Marshal(map[string]json.RawMessage{sampleMetadataKey: marker})
	if err != nil {
		return nil, err
	}

	created := make([]createdSampleProject, 0, len(sampleProjects))
	for _, spec := range sampleProjects {
		targets := make([]string, 0, len(spec.targetLocales))
		for _, target := range spec.targetLocales {
			targets = append(targets, target.locale)
		}
		projectID, err := nativeproject.Create(ctx, tx, nativeproject.Actor{
			OrganizationID:  actor.organizationID,
			UserID:          actor.userID,
			CanReadAllTeams: true,
		}, nativeproject.Input{
			Name:               spec.name,
			Description:        spec.description,
			TranslationContext: spec.translationContext,
			SourceLocale:       sampleSourceLocale,
			TargetLocales:      targets,
			MemoryIDs:          []string{memoryID},
			GlossaryIDs:        []string{glossaryID},
		})
		if err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `
			insert into project_spellcheck_word_libraries (organization_id, project_id, library_id, priority)
			values ($1,$2,$3,0)
			on conflict do nothing`,
			actor.organizationID, projectID, dictionaryID,
		); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `
			update projects
			set provider_metadata = coalesce(provider_metadata, '{}'::jsonb) || $2::jsonb, updated_by_user_id=$3, updated_at=now()
			where id=$1 and organization_id=$4`,
			projectID, metadata, actor.userID, actor.organizationID,
		); err != nil {
			return nil, err
		}
		created = append(created, createdSampleProject{id: projectID, spec: spec})
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return created, nil
}

func sampleFileContent(file sampleFile) []byte {
	payload := make(map[string]string, len(file.strings))
	for _, entry := range file.strings {
		payload[entry.key] = entry.text
	}
	body, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return []byte("{}\n")
	}
	return append(body, '\n')
}

func sampleTranslationStatus(progress sampleLocaleProgress, index, total int) string {
	switch progress {
	case sampleProgressApproved:
		return "approved"
	case sampleProgressInReview:
		if index < (total+1)/2 {
			return "approved"
		}
		return "needs_review"
	case sampleProgressPartial:
		if index < (total+2)/3 {
			return "approved"
		}
		if index < (total*2+2)/3 {
			return "draft"
		}
		return ""
	default:
		return ""
	}
}

func (api *sampleWorkspaceAPI) seedSampleFile(
	ctx context.Context,
	actor organizationActor,
	projectID string,
	spec sampleProject,
	file sampleFile,
) error {
	content := sampleFileContent(file)
	sum := sha256.Sum256(content)
	filename := path.Base(file.sourcePath)
	storedFileID := "file_" + uuid.NewString()
	storageProvider := "sample_workspace"
	storageKey := storedFileID
	storageURL := storedFileID

	if api.objects != nil {
		objectKey := fmt.Sprintf("sample-workspace/%s/%s/%s/%s", actor.organizationID, projectID, storedFileID, filename)
		ref, _, err := api.objects.Put(ctx, objectstore.PutInput{
			Key:         objectKey,
			Body:        bytes.NewReader(content),
			Size:        int64(len(content)),
			ContentType: "application/json",
			IfAbsent:    true,
		})
		if err != nil {
			return err
		}
		storageProvider = ref.LocationID
		storageKey = ref.Key
		storageURL = fmt.Sprintf("object://%s/%s", ref.LocationID, ref.Key)
	}

	tx, err := api.pool.Begin(ctx)
	if err != nil {
		api.deleteSampleObject(ctx, storageProvider, storageKey)
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
			api.deleteSampleObject(ctx, storageProvider, storageKey)
		}
	}()

	if _, err := tx.Exec(ctx, `
		insert into stored_files (
			id, organization_id, project_id, created_by_user_id, role, source_kind,
			storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256
		) values ($1,$2,$3,$4,'source','repository_file',$5,$6,$7,$8,'application/json',$9,$10)`,
		storedFileID, actor.organizationID, projectID, actor.userID,
		storageProvider, storageKey, storageURL, filename, len(content), hex.EncodeToString(sum[:]),
	); err != nil {
		return err
	}

	var sourceFileID, versionID string
	if err := tx.QueryRow(ctx, `
		insert into repository_source_files (organization_id, project_id, source_path, branch_name)
		values ($1,$2,$3,'main')
		returning id`,
		actor.organizationID, projectID, file.sourcePath,
	).Scan(&sourceFileID); err != nil {
		return err
	}
	if err := tx.QueryRow(ctx, `
		insert into repository_source_file_versions (
			repository_source_file_id, organization_id, project_id, source_path, stored_file_id,
			source_hash, uploaded_by_user_id, upload_surface, ingest_state, ingested_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8,'ingested',now())
		returning id`,
		sourceFileID, actor.organizationID, projectID, file.sourcePath, storedFileID,
		hex.EncodeToString(sum[:]), actor.userID, sampleUploadSurface,
	).Scan(&versionID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		update repository_source_files
		set reconciled_source_file_version_id=$2
		where id=$1`,
		sourceFileID, versionID,
	); err != nil {
		return err
	}

	keyIDs := make(map[string]string, len(file.strings))
	for _, entry := range file.strings {
		var keyID string
		var maxLength any
		if entry.maxLength > 0 {
			maxLength = entry.maxLength
		}
		var contextValue any
		if entry.context != "" {
			contextValue = entry.context
		}
		if err := tx.QueryRow(ctx, `
			insert into project_translation_keys (
				organization_id, project_id, repository_source_file_id, key, branch_name,
				source_text, normalized_source_text, context, max_length
			) values ($1,$2,$3,$4,'main',$5,$6,$7,$8)
			returning id`,
			actor.organizationID, projectID, sourceFileID, entry.key, entry.text,
			memoryinterchange.NormalizeSourceText(entry.text), contextValue, maxLength,
		).Scan(&keyID); err != nil {
			return err
		}
		keyIDs[entry.key] = keyID
	}

	for _, target := range spec.targetLocales {
		for index, entry := range file.strings {
			text := entry.translations[target.locale]
			status := sampleTranslationStatus(target.progress, index, len(file.strings))
			keyID := keyIDs[entry.key]
			if text == "" || status == "" || keyID == "" {
				continue
			}
			origin := "machine"
			var reviewedBy any
			var reviewedAt any
			if status == "approved" {
				origin = "human"
				reviewedBy = actor.userID
				reviewedAt = time.Now().UTC()
			}
			if _, err := tx.Exec(ctx, `
				insert into project_translations (
					organization_id, project_id, translation_key_id, target_locale, text, status,
					provenance, origin, reviewed_by_user_id, reviewed_at
				) values ($1,$2,$3,$4,$5,$6::project_translation_status,'import',$7::text::project_translation_origin,$8,$9)
				on conflict (translation_key_id, target_locale) do nothing`,
				actor.organizationID, projectID, keyID, target.locale, text, status, origin, reviewedBy, reviewedAt,
			); err != nil {
				return err
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	committed = true
	return nil
}

func (api *sampleWorkspaceAPI) seedSampleComments(ctx context.Context, actor organizationActor, projectID string, spec sampleProject) error {
	if len(spec.comments) == 0 {
		return nil
	}
	keys := make([]string, 0, len(spec.comments))
	for _, comment := range spec.comments {
		keys = append(keys, comment.key)
	}
	rows, err := api.pool.Query(ctx, `
		select id, key from project_translation_keys
		where project_id=$1 and key = any($2)`,
		projectID, keys)
	if err != nil {
		return err
	}
	defer rows.Close()
	keyIDs := map[string]string{}
	for rows.Next() {
		var id, key string
		if err := rows.Scan(&id, &key); err != nil {
			return err
		}
		keyIDs[key] = id
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, comment := range spec.comments {
		keyID := keyIDs[comment.key]
		if keyID == "" {
			continue
		}
		if _, err := api.pool.Exec(ctx, `
			insert into project_translation_comments (
				organization_id, project_id, translation_key_id, target_locale, type, text, author_user_id
			) values ($1,$2,$3,$4,'comment',$5,$6)`,
			actor.organizationID, projectID, keyID, comment.locale, comment.text, actor.userID,
		); err != nil {
			return err
		}
	}
	return nil
}

func readSampleMarker(metadata []byte) sampleWorkspaceMarker {
	var wrapper map[string]sampleWorkspaceMarker
	if err := json.Unmarshal(metadata, &wrapper); err != nil {
		return sampleWorkspaceMarker{Version: sampleContentVersion}
	}
	marker := wrapper[sampleMetadataKey]
	if marker.Version == 0 {
		marker.Version = sampleContentVersion
	}
	return marker
}

func uniqueIDs(lists ...[]string) []string {
	seen := map[string]struct{}{}
	var ids []string
	for _, list := range lists {
		for _, id := range list {
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			ids = append(ids, id)
		}
	}
	return ids
}

func (api *sampleWorkspaceAPI) removeSampleWorkspace(ctx context.Context, organizationID string) (int, error) {
	projects, err := api.listSampleProjects(ctx, organizationID)
	if err != nil {
		return 0, err
	}
	if len(projects) == 0 {
		return 0, nil
	}
	projectIDs := make([]string, 0, len(projects))
	var glossaryIDs, memoryIDs, dictionaryIDs []string
	for _, project := range projects {
		projectIDs = append(projectIDs, project.id)
		marker := readSampleMarker(project.metadata)
		glossaryIDs = append(glossaryIDs, marker.GlossaryIDs...)
		memoryIDs = append(memoryIDs, marker.MemoryIDs...)
		dictionaryIDs = append(dictionaryIDs, marker.DictionaryIDs...)
	}
	glossaryIDs = uniqueIDs(glossaryIDs)
	memoryIDs = uniqueIDs(memoryIDs)
	dictionaryIDs = uniqueIDs(dictionaryIDs)

	type storedSampleFile struct {
		id, provider, key string
	}
	rows, err := api.pool.Query(ctx, `
		select id, storage_provider, storage_key
		from stored_files
		where organization_id=$1 and project_id = any($2)`,
		organizationID, projectIDs)
	if err != nil {
		return 0, err
	}
	var files []storedSampleFile
	for rows.Next() {
		var file storedSampleFile
		if err := rows.Scan(&file.id, &file.provider, &file.key); err != nil {
			rows.Close()
			return 0, err
		}
		files = append(files, file)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := deleteByIDs(ctx, tx, `delete from projects where organization_id=$1 and id = any($2)`, organizationID, projectIDs); err != nil {
		return 0, err
	}
	if err := deleteByIDs(ctx, tx, `delete from glossaries where organization_id=$1 and id = any($2)`, organizationID, glossaryIDs); err != nil {
		return 0, err
	}
	if err := deleteByIDs(ctx, tx, `delete from memories where organization_id=$1 and id = any($2)`, organizationID, memoryIDs); err != nil {
		return 0, err
	}
	if err := deleteByIDs(ctx, tx, `delete from spellcheck_word_libraries where organization_id=$1 and id = any($2)`, organizationID, dictionaryIDs); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}

	for _, file := range files {
		_, err := api.pool.Exec(ctx, `delete from stored_files where id=$1 and organization_id=$2`, file.id, organizationID)
		if err != nil {
			continue
		}
		api.deleteSampleObject(ctx, file.provider, file.key)
	}
	return len(projectIDs), nil
}

func deleteByIDs(ctx context.Context, tx pgx.Tx, query, organizationID string, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	_, err := tx.Exec(ctx, query, organizationID, ids)
	return err
}

func (api *sampleWorkspaceAPI) deleteSampleObject(ctx context.Context, locationID, key string) {
	if api.objects == nil || strings.TrimSpace(locationID) == "" || strings.TrimSpace(key) == "" {
		return
	}
	store, err := api.objects.Resolve(locationID)
	if err != nil {
		return
	}
	_ = store.Delete(ctx, key)
}
