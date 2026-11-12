// Package customfield stores workspace-defined project fields and each project's values for
// them. A field has a type, and select fields offer a fixed list of options. The public API
// serves fields and values to API keys through this package.
package customfield

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/nativeproject"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	MaxKeyLength         = 64
	MaxNameLength        = 200
	MaxDescriptionLength = 2_000
	MaxOptionLength      = 200
	MaxOptions           = 500
	// MaxFields caps the fields a workspace defines.
	MaxFields      = 200
	MaxTextLength  = 10_000
	MaxURLLength   = 2_048
	MaxValuesWrite = 100
)

// Field types.
const (
	TypeText         = "text"
	TypeNumber       = "number"
	TypeDate         = "date"
	TypeURL          = "url"
	TypeCheckbox     = "checkbox"
	TypeSingleSelect = "single_select"
	TypeMultiSelect  = "multi_select"
)

// Types lists every field type.
var Types = []string{TypeText, TypeNumber, TypeDate, TypeURL, TypeCheckbox, TypeSingleSelect, TypeMultiSelect}

var (
	ErrNotFound     = errors.New("custom field not found")
	ErrKeyTaken     = errors.New("a custom field with this key already exists")
	ErrLimitReached = errors.New("the workspace has reached its custom field limit")
	keyPattern      = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)
)

// ValidationError names the field that failed validation.
type ValidationError struct {
	Field   string
	Message string
}

func (e ValidationError) Error() string { return e.Field + ": " + e.Message }

func invalid(field, message string) error { return ValidationError{Field: field, Message: message} }

// DB is a pool or transaction.
type DB = nativeproject.DB

// Option is one choice of a select field.
type Option struct {
	ID    string `json:"id"`
	Value string `json:"value"`
}

// Field is a stored custom field. Options is empty for fields that are not selects.
type Field struct {
	ID          string    `json:"id"`
	Key         string    `json:"key"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Type        string    `json:"type"`
	Options     []Option  `json:"options"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// IsSelect reports whether the field offers options.
func (f Field) IsSelect() bool { return isSelect(f.Type) }

func isSelect(fieldType string) bool {
	return fieldType == TypeSingleSelect || fieldType == TypeMultiSelect
}

// OptionInput is an option in a create or update request. An ID keeps (and may rename) an
// existing option; no ID adds one.
type OptionInput struct {
	ID    *string `json:"id"`
	Value string  `json:"value"`
}

// CreateInput is a new field.
type CreateInput struct {
	Key         string        `json:"key"`
	Name        string        `json:"name"`
	Description string        `json:"description"`
	Type        string        `json:"type"`
	Options     []OptionInput `json:"options"`
}

// UpdateInput changes a field. Options, when set, is the field's whole option list: options it
// leaves out are removed, and so are project values that chose them. The type and key are fixed.
type UpdateInput struct {
	Name        *string        `json:"name"`
	Description *string        `json:"description"`
	Options     *[]OptionInput `json:"options"`
}

// Empty reports whether the update changes nothing.
func (u UpdateInput) Empty() bool { return u.Name == nil && u.Description == nil && u.Options == nil }

// ProjectValue is a project's value for one field. Value is a string (text, URL, YYYY-MM-DD
// date), a number, a boolean, an Option (single select) or a list of Options (multi select).
type ProjectValue struct {
	FieldID string `json:"fieldId"`
	Key     string `json:"key"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	Value   any    `json:"value"`
}

func validName(field, value string, maxLength int, required bool) (string, error) {
	trimmed := strings.TrimSpace(value)
	if required && trimmed == "" {
		return "", invalid(field, "is required")
	}
	if utf8.RuneCountInString(trimmed) > maxLength {
		return "", invalid(field, fmt.Sprintf("must be at most %d characters", maxLength))
	}
	return trimmed, nil
}

// normalizeOptions trims option values and rejects empty, duplicate (ignoring case) or
// oversized ones.
func normalizeOptions(fieldType string, options []OptionInput) ([]OptionInput, error) {
	if !isSelect(fieldType) {
		if len(options) > 0 {
			return nil, invalid("options", "only select fields have options")
		}
		return nil, nil
	}
	if len(options) == 0 {
		return nil, invalid("options", "a select field needs at least one option")
	}
	if len(options) > MaxOptions {
		return nil, invalid("options", fmt.Sprintf("a field has at most %d options", MaxOptions))
	}
	seenValues := map[string]struct{}{}
	seenIDs := map[string]struct{}{}
	out := make([]OptionInput, 0, len(options))
	for _, option := range options {
		value, err := validName("options.value", option.Value, MaxOptionLength, true)
		if err != nil {
			return nil, err
		}
		folded := strings.ToLower(value)
		if _, dup := seenValues[folded]; dup {
			return nil, invalid("options.value", "option values must be unique")
		}
		seenValues[folded] = struct{}{}
		if option.ID != nil {
			id := strings.TrimSpace(*option.ID)
			if _, err := uuid.Parse(id); err != nil {
				return nil, invalid("options.id", "must be an option ID of this field")
			}
			if _, dup := seenIDs[id]; dup {
				return nil, invalid("options.id", "option IDs must be unique")
			}
			seenIDs[id] = struct{}{}
			option.ID = &id
		}
		option.Value = value
		out = append(out, option)
	}
	return out, nil
}

// NormalizeCreate validates a new field.
func NormalizeCreate(in CreateInput) (CreateInput, error) {
	in.Key = strings.TrimSpace(in.Key)
	if in.Key == "" || len(in.Key) > MaxKeyLength || !keyPattern.MatchString(in.Key) {
		return in, invalid("key", fmt.Sprintf("must start with a lowercase letter and use only lowercase letters, digits and underscores, at most %d characters", MaxKeyLength))
	}
	var err error
	if in.Name, err = validName("name", in.Name, MaxNameLength, true); err != nil {
		return in, err
	}
	if in.Description, err = validName("description", in.Description, MaxDescriptionLength, false); err != nil {
		return in, err
	}
	known := false
	for _, t := range Types {
		known = known || t == in.Type
	}
	if !known {
		return in, invalid("type", "must be one of "+strings.Join(Types, ", "))
	}
	for _, option := range in.Options {
		if option.ID != nil {
			return in, invalid("options.id", "new fields take option values only")
		}
	}
	in.Options, err = normalizeOptions(in.Type, in.Options)
	return in, err
}

const fieldColumns = `f.id::text, f.key, f.name, f.description, f.type, f.created_at, f.updated_at`

func scanField(row pgx.Row) (Field, error) {
	var f Field
	err := row.Scan(&f.ID, &f.Key, &f.Name, &f.Description, &f.Type, &f.CreatedAt, &f.UpdatedAt)
	f.Options = []Option{}
	return f, err
}

// loadOptions fills each field's options in display order.
func loadOptions(ctx context.Context, db DB, fields []Field) error {
	ids := make([]string, 0, len(fields))
	index := make(map[string]int, len(fields))
	for i, f := range fields {
		if f.IsSelect() {
			ids = append(ids, f.ID)
			index[f.ID] = i
		}
	}
	if len(ids) == 0 {
		return nil
	}
	rows, err := db.Query(ctx, `select field_id::text, id::text, value from custom_field_options
		where field_id = any($1::uuid[]) order by field_id, position, value`, ids)
	if err != nil {
		return fmt.Errorf("list custom field options: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var fieldID string
		var option Option
		if err := rows.Scan(&fieldID, &option.ID, &option.Value); err != nil {
			return fmt.Errorf("scan custom field option: %w", err)
		}
		i := index[fieldID]
		fields[i].Options = append(fields[i].Options, option)
	}
	return rows.Err()
}

// List returns the workspace's fields by name.
func List(ctx context.Context, db DB, organizationID string) ([]Field, error) {
	rows, err := db.Query(ctx, `select `+fieldColumns+` from custom_fields f
		where f.organization_id = $1 order by lower(f.name), f.key limit $2`, organizationID, MaxFields)
	if err != nil {
		return nil, fmt.Errorf("list custom fields: %w", err)
	}
	fields, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Field, error) { return scanField(row) })
	if err != nil {
		return nil, fmt.Errorf("scan custom fields: %w", err)
	}
	return fields, loadOptions(ctx, db, fields)
}

// Get returns one field by ID or key.
func Get(ctx context.Context, db DB, organizationID, idOrKey string) (Field, error) {
	return get(ctx, db, organizationID, idOrKey, "")
}

func get(ctx context.Context, db DB, organizationID, idOrKey, lock string) (Field, error) {
	column := "f.key"
	if _, err := uuid.Parse(idOrKey); err == nil {
		column = "f.id::text"
	}
	f, err := scanField(db.QueryRow(ctx, `select `+fieldColumns+` from custom_fields f
		where f.organization_id = $1 and `+column+` = $2`+lock, organizationID, idOrKey))
	if errors.Is(err, pgx.ErrNoRows) {
		return Field{}, ErrNotFound
	}
	if err != nil {
		return Field{}, fmt.Errorf("get custom field: %w", err)
	}
	fields := []Field{f}
	if err := loadOptions(ctx, db, fields); err != nil {
		return Field{}, err
	}
	return fields[0], nil
}

// Create stores a new field. Run it in a transaction: the workspace limit is checked under a
// lock.
func Create(ctx context.Context, tx DB, organizationID, userID string, in CreateInput) (Field, error) {
	in, err := NormalizeCreate(in)
	if err != nil {
		return Field{}, err
	}
	if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtextextended($1, 0))`, "custom_fields:"+organizationID); err != nil {
		return Field{}, fmt.Errorf("lock custom fields: %w", err)
	}
	var count int
	if err := tx.QueryRow(ctx, `select count(*)::int from custom_fields where organization_id = $1`, organizationID).Scan(&count); err != nil {
		return Field{}, fmt.Errorf("count custom fields: %w", err)
	}
	if count >= MaxFields {
		return Field{}, ErrLimitReached
	}
	var id string
	err = tx.QueryRow(ctx, `insert into custom_fields
			(organization_id, key, name, description, type, created_by_user_id, updated_by_user_id)
		values ($1, $2, $3, $4, $5, $6, $6) returning id::text`,
		organizationID, in.Key, in.Name, in.Description, in.Type, userID).Scan(&id)
	if isUniqueViolation(err) {
		return Field{}, ErrKeyTaken
	}
	if err != nil {
		return Field{}, fmt.Errorf("insert custom field: %w", err)
	}
	for i, option := range in.Options {
		if _, err := tx.Exec(ctx, `insert into custom_field_options (field_id, value, position) values ($1, $2, $3)`,
			id, option.Value, i); err != nil {
			return Field{}, fmt.Errorf("insert custom field option: %w", err)
		}
	}
	return Get(ctx, tx, organizationID, id)
}

// Update changes a field's name, description, or options. Run it in a transaction.
func Update(ctx context.Context, tx DB, organizationID, userID, idOrKey string, in UpdateInput) (Field, error) {
	field, err := get(ctx, tx, organizationID, idOrKey, " for update")
	if err != nil {
		return Field{}, err
	}
	name, description := field.Name, field.Description
	if in.Name != nil {
		if name, err = validName("name", *in.Name, MaxNameLength, true); err != nil {
			return Field{}, err
		}
	}
	if in.Description != nil {
		if description, err = validName("description", *in.Description, MaxDescriptionLength, false); err != nil {
			return Field{}, err
		}
	}
	if in.Options != nil {
		options, err := normalizeOptions(field.Type, *in.Options)
		if err != nil {
			return Field{}, err
		}
		if err := replaceOptions(ctx, tx, field, options); err != nil {
			return Field{}, err
		}
	}
	if _, err := tx.Exec(ctx, `update custom_fields set name = $1, description = $2, updated_by_user_id = $3,
		updated_at = now() where id = $4`, name, description, userID, field.ID); err != nil {
		return Field{}, fmt.Errorf("update custom field: %w", err)
	}
	return Get(ctx, tx, organizationID, field.ID)
}

// replaceOptions makes options the field's whole option list, and drops removed options from
// project values.
func replaceOptions(ctx context.Context, tx DB, field Field, options []OptionInput) error {
	existing := map[string]struct{}{}
	for _, option := range field.Options {
		existing[option.ID] = struct{}{}
	}
	kept := []string{}
	for _, option := range options {
		if option.ID == nil {
			continue
		}
		if _, ok := existing[*option.ID]; !ok {
			return invalid("options.id", "must be an option ID of this field")
		}
		kept = append(kept, *option.ID)
	}
	removed := []string{}
	keptSet := map[string]struct{}{}
	for _, id := range kept {
		keptSet[id] = struct{}{}
	}
	for _, option := range field.Options {
		if _, ok := keptSet[option.ID]; !ok {
			removed = append(removed, option.ID)
		}
	}
	if len(removed) > 0 {
		if _, err := tx.Exec(ctx, `delete from custom_field_options where field_id = $1 and id = any($2::uuid[])`,
			field.ID, removed); err != nil {
			return fmt.Errorf("delete custom field options: %w", err)
		}
		if err := dropOptionsFromValues(ctx, tx, field, removed); err != nil {
			return err
		}
	}
	// Park kept values on their IDs first so options can swap values without a unique clash.
	if len(kept) > 0 {
		if _, err := tx.Exec(ctx, `update custom_field_options set value = id::text where field_id = $1 and id = any($2::uuid[])`,
			field.ID, kept); err != nil {
			return fmt.Errorf("park custom field options: %w", err)
		}
	}
	for i, option := range options {
		if option.ID != nil {
			if _, err := tx.Exec(ctx, `update custom_field_options set value = $1, position = $2 where field_id = $3 and id = $4`,
				option.Value, i, field.ID, *option.ID); err != nil {
				return fmt.Errorf("update custom field option: %w", err)
			}
			continue
		}
		if _, err := tx.Exec(ctx, `insert into custom_field_options (field_id, value, position) values ($1, $2, $3)`,
			field.ID, option.Value, i); err != nil {
			return fmt.Errorf("insert custom field option: %w", err)
		}
	}
	return nil
}

func dropOptionsFromValues(ctx context.Context, tx DB, field Field, removed []string) error {
	if field.Type == TypeSingleSelect {
		if _, err := tx.Exec(ctx, `delete from project_custom_field_values where field_id = $1 and value #>> '{}' = any($2::text[])`,
			field.ID, removed); err != nil {
			return fmt.Errorf("clear removed options: %w", err)
		}
		return nil
	}
	if _, err := tx.Exec(ctx, `update project_custom_field_values v set value = coalesce((
			select jsonb_agg(e) from jsonb_array_elements(v.value) e where not (e #>> '{}' = any($2::text[]))
		), '[]'::jsonb), updated_at = now()
		where v.field_id = $1 and v.value ?| $2::text[]`, field.ID, removed); err != nil {
		return fmt.Errorf("remove options from values: %w", err)
	}
	if _, err := tx.Exec(ctx, `delete from project_custom_field_values where field_id = $1 and value = '[]'::jsonb`, field.ID); err != nil {
		return fmt.Errorf("clear empty values: %w", err)
	}
	return nil
}

// Delete removes a field and every project's value for it.
func Delete(ctx context.Context, db DB, organizationID, idOrKey string) error {
	column := "key"
	if _, err := uuid.Parse(idOrKey); err == nil {
		column = "id::text"
	}
	tag, err := db.Exec(ctx, `delete from custom_fields where organization_id = $1 and `+column+` = $2`, organizationID, idOrKey)
	if err != nil {
		return fmt.Errorf("delete custom field: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ProjectValues returns the values set on a project, by field name. The caller checks the
// project is accessible.
func ProjectValues(ctx context.Context, db DB, organizationID, projectID string) ([]ProjectValue, error) {
	rows, err := db.Query(ctx, `select `+fieldColumns+`, v.value from project_custom_field_values v
		join custom_fields f on f.id = v.field_id
		where f.organization_id = $1 and v.project_id = $2
		order by lower(f.name), f.key`, organizationID, projectID)
	if err != nil {
		return nil, fmt.Errorf("list project custom field values: %w", err)
	}
	type row struct {
		field Field
		raw   []byte
	}
	items, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (row, error) {
		var item row
		err := r.Scan(&item.field.ID, &item.field.Key, &item.field.Name, &item.field.Description, &item.field.Type,
			&item.field.CreatedAt, &item.field.UpdatedAt, &item.raw)
		item.field.Options = []Option{}
		return item, err
	})
	if err != nil {
		return nil, fmt.Errorf("scan project custom field values: %w", err)
	}
	fields := make([]Field, len(items))
	for i, item := range items {
		fields[i] = item.field
	}
	if err := loadOptions(ctx, db, fields); err != nil {
		return nil, err
	}
	values := make([]ProjectValue, 0, len(items))
	for i, item := range items {
		value, err := present(fields[i], item.raw)
		if err != nil {
			return nil, err
		}
		values = append(values, ProjectValue{FieldID: fields[i].ID, Key: fields[i].Key, Name: fields[i].Name, Type: fields[i].Type, Value: value})
	}
	return values, nil
}

// present turns a stored value into its API shape: select option IDs become options.
func present(field Field, raw []byte) (any, error) {
	if !field.IsSelect() {
		decoder := json.NewDecoder(bytes.NewReader(raw))
		decoder.UseNumber()
		var value any
		if err := decoder.Decode(&value); err != nil {
			return nil, fmt.Errorf("decode custom field value: %w", err)
		}
		return value, nil
	}
	byID := make(map[string]Option, len(field.Options))
	for _, option := range field.Options {
		byID[option.ID] = option
	}
	if field.Type == TypeSingleSelect {
		var id string
		if err := json.Unmarshal(raw, &id); err != nil {
			return nil, fmt.Errorf("decode custom field value: %w", err)
		}
		if option, ok := byID[id]; ok {
			return option, nil
		}
		return nil, nil
	}
	var ids []string
	if err := json.Unmarshal(raw, &ids); err != nil {
		return nil, fmt.Errorf("decode custom field value: %w", err)
	}
	selected := make([]Option, 0, len(ids))
	for _, id := range ids {
		if option, ok := byID[id]; ok {
			selected = append(selected, option)
		}
	}
	return selected, nil
}

// SetProjectValues sets or (with JSON null) clears a project's values, keyed by field key or
// ID. Values for fields left out are kept. Run it in a transaction; the caller checks the
// project is writable.
func SetProjectValues(ctx context.Context, tx DB, organizationID, userID, projectID string, values map[string]json.RawMessage) error {
	if len(values) == 0 {
		return invalid("customFields", "provide at least one field")
	}
	if len(values) > MaxValuesWrite {
		return invalid("customFields", fmt.Sprintf("set at most %d fields at once", MaxValuesWrite))
	}
	names := make([]string, 0, len(values))
	for name := range values {
		names = append(names, name)
	}
	sort.Strings(names)
	seen := map[string]string{}
	for _, name := range names {
		label := "customFields." + name
		field, err := Get(ctx, tx, organizationID, strings.TrimSpace(name))
		if errors.Is(err, ErrNotFound) {
			return invalid(label, "no custom field has this key")
		}
		if err != nil {
			return err
		}
		if other, dup := seen[field.ID]; dup {
			return invalid(label, "names the same field as customFields."+other)
		}
		seen[field.ID] = name
		raw := bytes.TrimSpace(values[name])
		if len(raw) == 0 || bytes.Equal(raw, []byte("null")) {
			if _, err := tx.Exec(ctx, `delete from project_custom_field_values where project_id = $1 and field_id = $2`,
				projectID, field.ID); err != nil {
				return fmt.Errorf("clear project custom field value: %w", err)
			}
			continue
		}
		stored, err := Normalize(field, raw)
		if err != nil {
			var validation ValidationError
			if errors.As(err, &validation) {
				return invalid(label, validation.Message)
			}
			return err
		}
		if _, err := tx.Exec(ctx, `insert into project_custom_field_values (project_id, field_id, value, updated_by_user_id)
			values ($1, $2, $3::jsonb, $4)
			on conflict (project_id, field_id) do update set value = excluded.value,
				updated_by_user_id = excluded.updated_by_user_id, updated_at = now()`,
			projectID, field.ID, string(stored), userID); err != nil {
			return fmt.Errorf("set project custom field value: %w", err)
		}
	}
	return nil
}

// Normalize checks a value against the field and returns the JSON to store. Select values name
// options by ID or by value.
func Normalize(field Field, raw []byte) ([]byte, error) {
	switch field.Type {
	case TypeText, TypeURL, TypeDate:
		var value string
		if err := json.Unmarshal(raw, &value); err != nil {
			return nil, invalid("value", "must be a string")
		}
		value = strings.TrimSpace(value)
		switch field.Type {
		case TypeText:
			if value == "" || utf8.RuneCountInString(value) > MaxTextLength {
				return nil, invalid("value", fmt.Sprintf("must be 1 to %d characters", MaxTextLength))
			}
		case TypeURL:
			parsed, err := url.Parse(value)
			if err != nil || len(value) > MaxURLLength || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
				return nil, invalid("value", "must be an http or https URL")
			}
		case TypeDate:
			if _, err := time.Parse(time.DateOnly, value); err != nil {
				return nil, invalid("value", "must be a date in YYYY-MM-DD form")
			}
		}
		return json.Marshal(value)
	case TypeNumber:
		// Decode into any: json.Number alone would also accept a quoted "12".
		var decoded any
		decoder := json.NewDecoder(bytes.NewReader(raw))
		decoder.UseNumber()
		if err := decoder.Decode(&decoded); err != nil {
			return nil, invalid("value", "must be a number")
		}
		number, ok := decoded.(json.Number)
		if !ok {
			return nil, invalid("value", "must be a number")
		}
		parsed, err := strconv.ParseFloat(number.String(), 64)
		if err != nil || math.IsInf(parsed, 0) || math.IsNaN(parsed) {
			return nil, invalid("value", "must be a number")
		}
		return []byte(number.String()), nil
	case TypeCheckbox:
		var value bool
		if err := json.Unmarshal(raw, &value); err != nil {
			return nil, invalid("value", "must be true or false")
		}
		return json.Marshal(value)
	case TypeSingleSelect:
		var choice string
		if err := json.Unmarshal(raw, &choice); err != nil {
			return nil, invalid("value", "must be an option ID or value")
		}
		id, ok := findOption(field, choice)
		if !ok {
			return nil, invalid("value", "is not an option of this field")
		}
		return json.Marshal(id)
	case TypeMultiSelect:
		var choices []string
		if err := json.Unmarshal(raw, &choices); err != nil || len(choices) == 0 {
			return nil, invalid("value", "must be a non-empty list of option IDs or values")
		}
		ids := make([]string, 0, len(choices))
		seen := map[string]struct{}{}
		for _, choice := range choices {
			id, ok := findOption(field, choice)
			if !ok {
				return nil, invalid("value", fmt.Sprintf("%q is not an option of this field", choice))
			}
			if _, dup := seen[id]; dup {
				continue
			}
			seen[id] = struct{}{}
			ids = append(ids, id)
		}
		return json.Marshal(ids)
	}
	return nil, fmt.Errorf("unknown custom field type %q", field.Type)
}

// findOption matches an option by ID, then by value ignoring case.
func findOption(field Field, choice string) (string, bool) {
	choice = strings.TrimSpace(choice)
	for _, option := range field.Options {
		if option.ID == choice {
			return option.ID, true
		}
	}
	for _, option := range field.Options {
		if strings.EqualFold(option.Value, choice) {
			return option.ID, true
		}
	}
	return "", false
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
