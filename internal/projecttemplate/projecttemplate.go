// Package projecttemplate stores project templates: a saved source locale, target locales,
// translation context, team, translation memories, glossaries, and content editor settings that
// new native projects start from. go-svc serves templates to the web app and the public API
// serves them to API keys; both go through this package.
package projecttemplate

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/nativeproject"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/text/language"
)

const (
	MaxNameLength               = 200
	MaxDescriptionLength        = 2_000
	MaxProjectNameLength        = 200
	MaxProjectDescriptionLength = 10_000
	MaxTranslationContextLength = 20_000
	MaxTargetLocales            = 50
	MaxLocaleLength             = 50
	// MaxResources caps the memories and the glossaries a template attaches, each.
	MaxResources = 50
	// MaxTemplates caps the templates a workspace lists in one response.
	MaxTemplates = 500
)

var (
	ErrNotFound  = errors.New("project template not found")
	ErrNameTaken = errors.New("a project template with this name already exists")
)

// ValidationError names the field that failed validation.
type ValidationError struct {
	Field   string
	Message string
}

func (e ValidationError) Error() string { return e.Field + ": " + e.Message }

func invalid(field, message string) error { return ValidationError{Field: field, Message: message} }

// Template is a stored project template.
type Template struct {
	ID                                 string    `json:"id"`
	Name                               string    `json:"name"`
	Description                        string    `json:"description"`
	SourceLocale                       string    `json:"sourceLocale"`
	TargetLocales                      []string  `json:"targetLocales"`
	ProjectDescription                 string    `json:"projectDescription"`
	TranslationContext                 string    `json:"translationContext"`
	TeamID                             *string   `json:"teamId"`
	AutomaticallyGroupIdenticalStrings bool      `json:"automaticallyGroupIdenticalStrings"`
	SourceTextEditable                 bool      `json:"sourceTextEditable"`
	ApprovedTranslationsOnSourceChange string    `json:"approvedTranslationsOnSourceChange"`
	MemoryIDs                          []string  `json:"memoryIds"`
	GlossaryIDs                        []string  `json:"glossaryIds"`
	CreatedAt                          time.Time `json:"createdAt"`
	UpdatedAt                          time.Time `json:"updatedAt"`
}

// Fields are a template's editable values.
type Fields struct {
	Name                               string
	Description                        string
	SourceLocale                       string
	TargetLocales                      []string
	ProjectDescription                 string
	TranslationContext                 string
	TeamID                             *string
	AutomaticallyGroupIdenticalStrings bool
	SourceTextEditable                 bool
	ApprovedTranslationsOnSourceChange string
	MemoryIDs                          []string
	GlossaryIDs                        []string
}

// Fields returns the template's editable values.
func (t Template) Fields() Fields {
	return Fields{
		Name:                               t.Name,
		Description:                        t.Description,
		SourceLocale:                       t.SourceLocale,
		TargetLocales:                      append([]string(nil), t.TargetLocales...),
		ProjectDescription:                 t.ProjectDescription,
		TranslationContext:                 t.TranslationContext,
		TeamID:                             t.TeamID,
		AutomaticallyGroupIdenticalStrings: t.AutomaticallyGroupIdenticalStrings,
		SourceTextEditable:                 t.SourceTextEditable,
		ApprovedTranslationsOnSourceChange: t.ApprovedTranslationsOnSourceChange,
		MemoryIDs:                          append([]string(nil), t.MemoryIDs...),
		GlossaryIDs:                        append([]string(nil), t.GlossaryIDs...),
	}
}

// Nullable is a JSON field that distinguishes absent, null, and a value.
type Nullable[T any] struct {
	Set   bool
	Value *T
}

func (n *Nullable[T]) UnmarshalJSON(raw []byte) error {
	n.Set = true
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		n.Value = nil
		return nil
	}
	var value T
	if err := json.Unmarshal(raw, &value); err != nil {
		return err
	}
	n.Value = &value
	return nil
}

// Body is the JSON body that creates a template, or with absent fields, patches one.
type Body struct {
	Name                               *string          `json:"name"`
	Description                        *string          `json:"description"`
	SourceLocale                       *string          `json:"sourceLocale"`
	TargetLocales                      *[]string        `json:"targetLocales"`
	ProjectDescription                 *string          `json:"projectDescription"`
	TranslationContext                 *string          `json:"translationContext"`
	TeamID                             Nullable[string] `json:"teamId"`
	AutomaticallyGroupIdenticalStrings *bool            `json:"automaticallyGroupIdenticalStrings"`
	SourceTextEditable                 *bool            `json:"sourceTextEditable"`
	ApprovedTranslationsOnSourceChange *string          `json:"approvedTranslationsOnSourceChange"`
	MemoryIDs                          *[]string        `json:"memoryIds"`
	GlossaryIDs                        *[]string        `json:"glossaryIds"`
}

// Empty reports whether the body sets no field.
func (b Body) Empty() bool {
	return b.Name == nil && b.Description == nil && b.SourceLocale == nil && b.TargetLocales == nil &&
		b.ProjectDescription == nil && b.TranslationContext == nil && !b.TeamID.Set &&
		b.AutomaticallyGroupIdenticalStrings == nil && b.SourceTextEditable == nil &&
		b.ApprovedTranslationsOnSourceChange == nil && b.MemoryIDs == nil && b.GlossaryIDs == nil
}

// ApplyTo returns base with the body's fields set. Create applies a body to Fields{}.
func (b Body) ApplyTo(base Fields) Fields {
	out := base
	if b.Name != nil {
		out.Name = *b.Name
	}
	if b.Description != nil {
		out.Description = *b.Description
	}
	if b.SourceLocale != nil {
		out.SourceLocale = *b.SourceLocale
	}
	if b.TargetLocales != nil {
		out.TargetLocales = *b.TargetLocales
	}
	if b.ProjectDescription != nil {
		out.ProjectDescription = *b.ProjectDescription
	}
	if b.TranslationContext != nil {
		out.TranslationContext = *b.TranslationContext
	}
	if b.TeamID.Set {
		out.TeamID = b.TeamID.Value
	}
	if b.AutomaticallyGroupIdenticalStrings != nil {
		out.AutomaticallyGroupIdenticalStrings = *b.AutomaticallyGroupIdenticalStrings
	}
	if b.SourceTextEditable != nil {
		out.SourceTextEditable = *b.SourceTextEditable
	}
	if b.ApprovedTranslationsOnSourceChange != nil {
		out.ApprovedTranslationsOnSourceChange = *b.ApprovedTranslationsOnSourceChange
	}
	if b.MemoryIDs != nil {
		out.MemoryIDs = *b.MemoryIDs
	}
	if b.GlossaryIDs != nil {
		out.GlossaryIDs = *b.GlossaryIDs
	}
	return out
}

// CanonicalLocale follows go-svc's project locale rules: underscores become hyphens and the tag
// is canonicalized, so "en_us" becomes "en-US".
func CanonicalLocale(raw string) (string, bool) {
	locale := strings.ReplaceAll(strings.TrimSpace(raw), "_", "-")
	if locale == "" || utf16Length(locale) > MaxLocaleLength {
		return "", false
	}
	tag, err := language.Parse(locale)
	if err != nil || tag == language.Und {
		return "", false
	}
	return tag.String(), true
}

// CanonicalTargetLocales canonicalizes locales, drops case-insensitive duplicates, and rejects an
// empty list, more than 50, or one holding the source locale.
func CanonicalTargetLocales(raw []string, sourceLocale string) ([]string, error) {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		locale, ok := CanonicalLocale(item)
		if !ok {
			return nil, invalid("targetLocales", "targetLocales must hold valid locale tags")
		}
		key := strings.ToLower(locale)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, locale)
	}
	if len(out) == 0 || len(out) > MaxTargetLocales {
		return nil, invalid("targetLocales", "targetLocales must hold 1 to 50 locales")
	}
	if _, clash := seen[strings.ToLower(sourceLocale)]; clash {
		return nil, invalid("targetLocales", "targetLocales cannot include the source locale")
	}
	return out, nil
}

// Normalize trims and validates fields, canonicalizes locales, and removes duplicate resource IDs.
func Normalize(f Fields) (Fields, error) {
	out := f
	out.Name = strings.TrimSpace(f.Name)
	if out.Name == "" || utf16Length(out.Name) > MaxNameLength {
		return Fields{}, invalid("name", "name must be 1 to 200 characters")
	}
	if utf16Length(f.Description) > MaxDescriptionLength {
		return Fields{}, invalid("description", "description must be at most 2,000 characters")
	}
	if utf16Length(f.ProjectDescription) > MaxProjectDescriptionLength {
		return Fields{}, invalid("projectDescription", "projectDescription must be at most 10,000 characters")
	}
	if utf16Length(f.TranslationContext) > MaxTranslationContextLength {
		return Fields{}, invalid("translationContext", "translationContext must be at most 20,000 characters")
	}
	source, ok := CanonicalLocale(f.SourceLocale)
	if !ok {
		return Fields{}, invalid("sourceLocale", "sourceLocale must be a valid locale tag")
	}
	out.SourceLocale = source
	targets, err := CanonicalTargetLocales(f.TargetLocales, source)
	if err != nil {
		return Fields{}, err
	}
	out.TargetLocales = targets
	if f.TeamID != nil {
		team := strings.TrimSpace(*f.TeamID)
		if _, err := uuid.Parse(team); err != nil {
			return Fields{}, invalid("teamId", "teamId must be a team ID")
		}
		out.TeamID = &team
	}
	switch f.ApprovedTranslationsOnSourceChange {
	case "":
		out.ApprovedTranslationsOnSourceChange = nativeproject.SourceChangeStayApproved
	case nativeproject.SourceChangeStayApproved, nativeproject.SourceChangeNeedsReview:
	default:
		return Fields{}, invalid("approvedTranslationsOnSourceChange", "approvedTranslationsOnSourceChange must be stay_approved or needs_review")
	}
	if out.MemoryIDs, err = uniqueIDs(f.MemoryIDs, "memoryIds"); err != nil {
		return Fields{}, err
	}
	if out.GlossaryIDs, err = uniqueIDs(f.GlossaryIDs, "glossaryIds"); err != nil {
		return Fields{}, err
	}
	return out, nil
}

func uniqueIDs(raw []string, field string) ([]string, error) {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		id, err := uuid.Parse(strings.TrimSpace(item))
		if err != nil {
			return nil, invalid(field, field+" must hold IDs")
		}
		key := id.String()
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, key)
	}
	if len(out) > MaxResources {
		return nil, invalid(field, field+" must hold at most 50 IDs")
	}
	return out, nil
}

// ProjectRequest is a request to create a project, optionally from a template. Fields left nil
// come from the template.
type ProjectRequest struct {
	Name               string    `json:"name"`
	Description        *string   `json:"description"`
	TranslationContext *string   `json:"translationContext"`
	SourceLocale       *string   `json:"sourceLocale"`
	TargetLocales      *[]string `json:"targetLocales"`
	TeamID             *string   `json:"teamId"`
}

// ProjectInput merges the request over the template (nil for none) into a validated project.
func ProjectInput(t *Template, req ProjectRequest) (nativeproject.Input, error) {
	in := nativeproject.Input{Name: strings.TrimSpace(req.Name)}
	if t != nil {
		in.Description = t.ProjectDescription
		in.TranslationContext = t.TranslationContext
		in.SourceLocale = t.SourceLocale
		in.TargetLocales = t.TargetLocales
		in.TeamID = t.TeamID
		in.Settings = nativeproject.Settings{
			AutomaticallyGroupIdenticalStrings: t.AutomaticallyGroupIdenticalStrings,
			SourceTextEditable:                 t.SourceTextEditable,
			ApprovedTranslationsOnSourceChange: t.ApprovedTranslationsOnSourceChange,
		}
		in.MemoryIDs = t.MemoryIDs
		in.GlossaryIDs = t.GlossaryIDs
	}
	if in.Name == "" || utf16Length(in.Name) > MaxProjectNameLength {
		return nativeproject.Input{}, invalid("name", "name must be 1 to 200 characters")
	}
	if req.Description != nil {
		in.Description = *req.Description
	}
	if utf16Length(in.Description) > MaxProjectDescriptionLength {
		return nativeproject.Input{}, invalid("description", "description must be at most 10,000 characters")
	}
	if req.TranslationContext != nil {
		in.TranslationContext = *req.TranslationContext
	}
	if utf16Length(in.TranslationContext) > MaxTranslationContextLength {
		return nativeproject.Input{}, invalid("translationContext", "translationContext must be at most 20,000 characters")
	}
	if req.SourceLocale != nil {
		in.SourceLocale = *req.SourceLocale
	}
	source, ok := CanonicalLocale(in.SourceLocale)
	if !ok {
		return nativeproject.Input{}, invalid("sourceLocale", "sourceLocale must be a valid locale tag")
	}
	in.SourceLocale = source
	if req.TargetLocales != nil {
		in.TargetLocales = *req.TargetLocales
	}
	targets, err := CanonicalTargetLocales(in.TargetLocales, source)
	if err != nil {
		return nativeproject.Input{}, err
	}
	in.TargetLocales = targets
	if req.TeamID != nil {
		team := strings.TrimSpace(*req.TeamID)
		if _, err := uuid.Parse(team); err != nil {
			return nativeproject.Input{}, invalid("teamId", "teamId must be a team ID")
		}
		in.TeamID = &team
	}
	return in, nil
}

// DB is the part of a pgx pool or transaction this package uses.
type DB = nativeproject.DB

const templateColumns = `
	t.id::text, t.name, t.description, t.source_locale, t.target_locales,
	t.project_description, t.translation_context, t.team_id::text,
	t.automatically_group_identical_strings, t.source_text_editable,
	t.approved_translations_on_source_change,
	coalesce((select jsonb_agg(m.memory_id::text order by m.priority, m.memory_id)
		from project_template_memories m where m.template_id = t.id), '[]'::jsonb),
	coalesce((select jsonb_agg(g.glossary_id::text order by g.priority, g.glossary_id)
		from project_template_glossaries g where g.template_id = t.id), '[]'::jsonb),
	t.created_at, t.updated_at`

func scan(row pgx.Row) (Template, error) {
	var t Template
	var targets, memories, glossaries []byte
	if err := row.Scan(&t.ID, &t.Name, &t.Description, &t.SourceLocale, &targets,
		&t.ProjectDescription, &t.TranslationContext, &t.TeamID,
		&t.AutomaticallyGroupIdenticalStrings, &t.SourceTextEditable,
		&t.ApprovedTranslationsOnSourceChange, &memories, &glossaries,
		&t.CreatedAt, &t.UpdatedAt); err != nil {
		return Template{}, err
	}
	for _, field := range []struct {
		raw  []byte
		into *[]string
	}{{targets, &t.TargetLocales}, {memories, &t.MemoryIDs}, {glossaries, &t.GlossaryIDs}} {
		if err := json.Unmarshal(field.raw, field.into); err != nil {
			return Template{}, fmt.Errorf("decode project template: %w", err)
		}
		if *field.into == nil {
			*field.into = []string{}
		}
	}
	return t, nil
}

// List returns the workspace's templates by name.
func List(ctx context.Context, db DB, organizationID string) ([]Template, error) {
	rows, err := db.Query(ctx, `select `+templateColumns+`
		from project_templates t where t.organization_id = $1
		order by lower(t.name), t.id limit $2`, organizationID, MaxTemplates)
	if err != nil {
		return nil, fmt.Errorf("list project templates: %w", err)
	}
	defer rows.Close()
	out := []Template{}
	for rows.Next() {
		t, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// Get returns one of the workspace's templates.
func Get(ctx context.Context, db DB, organizationID, templateID string) (Template, error) {
	if _, err := uuid.Parse(templateID); err != nil {
		return Template{}, ErrNotFound
	}
	t, err := scan(db.QueryRow(ctx, `select `+templateColumns+`
		from project_templates t where t.organization_id = $1 and t.id = $2`, organizationID, templateID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Template{}, ErrNotFound
	}
	return t, err
}

// Create validates fields and their resources, and stores a new template.
func Create(ctx context.Context, tx DB, organizationID, userID string, f Fields) (Template, error) {
	f, err := Normalize(f)
	if err != nil {
		return Template{}, err
	}
	if err := checkResources(ctx, tx, organizationID, f); err != nil {
		return Template{}, err
	}
	targets, err := json.Marshal(f.TargetLocales)
	if err != nil {
		return Template{}, err
	}
	var id string
	err = tx.QueryRow(ctx, `
		insert into project_templates (
			organization_id, created_by_user_id, updated_by_user_id, name, description,
			source_locale, target_locales, project_description, translation_context, team_id,
			automatically_group_identical_strings, source_text_editable,
			approved_translations_on_source_change
		) values ($1,$2,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)
		returning id::text`,
		organizationID, userID, f.Name, f.Description, f.SourceLocale, targets,
		f.ProjectDescription, f.TranslationContext, f.TeamID,
		f.AutomaticallyGroupIdenticalStrings, f.SourceTextEditable, f.ApprovedTranslationsOnSourceChange,
	).Scan(&id)
	if isUniqueViolation(err) {
		return Template{}, ErrNameTaken
	}
	if err != nil {
		return Template{}, fmt.Errorf("insert project template: %w", err)
	}
	if err := writeResources(ctx, tx, id, f); err != nil {
		return Template{}, err
	}
	return Get(ctx, tx, organizationID, id)
}

// Update replaces a template's fields.
func Update(ctx context.Context, tx DB, organizationID, userID, templateID string, f Fields) (Template, error) {
	if _, err := uuid.Parse(templateID); err != nil {
		return Template{}, ErrNotFound
	}
	f, err := Normalize(f)
	if err != nil {
		return Template{}, err
	}
	if err := checkResources(ctx, tx, organizationID, f); err != nil {
		return Template{}, err
	}
	targets, err := json.Marshal(f.TargetLocales)
	if err != nil {
		return Template{}, err
	}
	tag, err := tx.Exec(ctx, `
		update project_templates set
			name=$3, description=$4, source_locale=$5, target_locales=$6::jsonb,
			project_description=$7, translation_context=$8, team_id=$9,
			automatically_group_identical_strings=$10, source_text_editable=$11,
			approved_translations_on_source_change=$12, updated_by_user_id=$13, updated_at=now()
		where organization_id=$1 and id=$2`,
		organizationID, templateID, f.Name, f.Description, f.SourceLocale, targets,
		f.ProjectDescription, f.TranslationContext, f.TeamID,
		f.AutomaticallyGroupIdenticalStrings, f.SourceTextEditable, f.ApprovedTranslationsOnSourceChange, userID)
	if isUniqueViolation(err) {
		return Template{}, ErrNameTaken
	}
	if err != nil {
		return Template{}, fmt.Errorf("update project template: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return Template{}, ErrNotFound
	}
	if err := writeResources(ctx, tx, templateID, f); err != nil {
		return Template{}, err
	}
	return Get(ctx, tx, organizationID, templateID)
}

// Delete removes a template. Projects created from it keep their settings.
func Delete(ctx context.Context, db DB, organizationID, templateID string) error {
	if _, err := uuid.Parse(templateID); err != nil {
		return ErrNotFound
	}
	tag, err := db.Exec(ctx, `delete from project_templates where organization_id=$1 and id=$2`, organizationID, templateID)
	if err != nil {
		return fmt.Errorf("delete project template: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// FromProject returns a native project's settings and attachments as template fields named
// name. The caller checks the actor may read the project.
func FromProject(ctx context.Context, db DB, organizationID, projectID, name string) (Fields, error) {
	var (
		f            Fields
		sourceLocale *string
		targets      []byte
		memories     []byte
		glossaries   []byte
	)
	err := db.QueryRow(ctx, `
		select p.source_locale, p.target_locales, p.description, p.translation_context, p.team_id::text,
			p.automatically_group_identical_strings, p.source_text_editable,
			p.approved_translations_on_source_change,
			coalesce((select jsonb_agg(m.memory_id::text order by m.priority, m.created_at)
				from project_memories m where m.project_id = p.id), '[]'::jsonb),
			coalesce((select jsonb_agg(g.glossary_id::text order by g.priority, g.created_at)
				from project_glossaries g where g.project_id = p.id), '[]'::jsonb)
		from projects p
		where p.organization_id = $1 and p.id = $2 and p.source = 'native'`,
		organizationID, projectID,
	).Scan(&sourceLocale, &targets, &f.ProjectDescription, &f.TranslationContext, &f.TeamID,
		&f.AutomaticallyGroupIdenticalStrings, &f.SourceTextEditable, &f.ApprovedTranslationsOnSourceChange,
		&memories, &glossaries)
	if errors.Is(err, pgx.ErrNoRows) {
		return Fields{}, ErrNotFound
	}
	if err != nil {
		return Fields{}, fmt.Errorf("load project for template: %w", err)
	}
	if sourceLocale != nil {
		f.SourceLocale = *sourceLocale
	}
	for _, field := range []struct {
		raw  []byte
		into *[]string
	}{{targets, &f.TargetLocales}, {memories, &f.MemoryIDs}, {glossaries, &f.GlossaryIDs}} {
		if err := json.Unmarshal(field.raw, field.into); err != nil {
			return Fields{}, fmt.Errorf("decode project for template: %w", err)
		}
	}
	f.Name = name
	return f, nil
}

func checkResources(ctx context.Context, db DB, organizationID string, f Fields) error {
	if f.TeamID != nil {
		var found string
		err := db.QueryRow(ctx, `select id from teams where id=$1 and organization_id=$2`, *f.TeamID, organizationID).Scan(&found)
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("%w: %s", nativeproject.ErrTeamNotFound, *f.TeamID)
		}
		if err != nil {
			return err
		}
	}
	for _, id := range f.MemoryIDs {
		var found string
		err := db.QueryRow(ctx, `select id from memories where id=$1 and organization_id=$2`, id, organizationID).Scan(&found)
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("%w: %s", nativeproject.ErrMemoryNotFound, id)
		}
		if err != nil {
			return err
		}
	}
	for _, id := range f.GlossaryIDs {
		if _, err := nativeproject.CheckGlossary(ctx, db, organizationID, id, f.SourceLocale); err != nil {
			return err
		}
	}
	return nil
}

func writeResources(ctx context.Context, tx DB, templateID string, f Fields) error {
	if _, err := tx.Exec(ctx, `delete from project_template_memories where template_id=$1`, templateID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `delete from project_template_glossaries where template_id=$1`, templateID); err != nil {
		return err
	}
	for priority, id := range f.MemoryIDs {
		if _, err := tx.Exec(ctx, `insert into project_template_memories (template_id, memory_id, priority) values ($1,$2,$3)`,
			templateID, id, priority); err != nil {
			return err
		}
	}
	for priority, id := range f.GlossaryIDs {
		if _, err := tx.Exec(ctx, `insert into project_template_glossaries (template_id, glossary_id, priority) values ($1,$2,$3)`,
			templateID, id, priority); err != nil {
			return err
		}
	}
	return nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func utf16Length(value string) int {
	n := 0
	for _, r := range value {
		n += len(utf16.Encode([]rune{r}))
	}
	return n
}
