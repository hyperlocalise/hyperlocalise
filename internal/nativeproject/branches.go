package nativeproject

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/memoryinterchange"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Pool is a pgx pool that can open a transaction. A transaction satisfies DB.
type Pool interface {
	DB
	Begin(context.Context) (pgx.Tx, error)
}

// Error is a branch operation the caller can map to an HTTP status.
type Error struct {
	Code string
}

func (e *Error) Error() string { return e.Code }

func branchErr(code string) error { return &Error{Code: code} }

// AsError reports a branch error code.
func AsError(err error) (string, bool) {
	var failure *Error
	if errors.As(err, &failure) {
		return failure.Code, true
	}
	return "", false
}

const (
	branchNameMax  = 128
	branchTitleMax = 256
)

// Go's regexp is RE2 and has no lookahead, so "//" is rejected separately.
var branchNamePattern = regexp.MustCompile(`^[A-Za-z0-9._](?:[A-Za-z0-9._/-]{0,126}[A-Za-z0-9._])?$`)

// NormalizeBranchName trims space and surrounding slashes, matching the web app.
func NormalizeBranchName(value string) string {
	return strings.Trim(strings.TrimSpace(value), "/")
}

// ValidBranchName reports whether name is a native version branch name.
func ValidBranchName(value string) bool {
	name := NormalizeBranchName(value)
	if name == "" || len(name) > branchNameMax || strings.Contains(name, "//") {
		return false
	}
	// The table check rejects a name that starts or ends with '.', '/' or '-'.
	edges := "./-"
	if strings.ContainsAny(name[:1], edges) || strings.ContainsAny(name[len(name)-1:], edges) {
		return false
	}
	return branchNamePattern.MatchString(name)
}

// BranchRecord is one project_branches row plus file and key counts.
type BranchRecord struct {
	ID                 string     `json:"id"`
	ProjectID          string     `json:"projectId"`
	Name               string     `json:"name"`
	Title              *string    `json:"title"`
	BaseBranchID       *string    `json:"baseBranchId"`
	IsDefault          bool       `json:"isDefault"`
	IsProtected        bool       `json:"isProtected"`
	Status             string     `json:"status"`
	LastSyncedAt       *time.Time `json:"lastSyncedAt"`
	CreatedByUserID    *string    `json:"createdByUserId"`
	MergedAt           *time.Time `json:"mergedAt"`
	MergedIntoBranchID *string    `json:"mergedIntoBranchId"`
	CreatedAt          time.Time  `json:"createdAt"`
	UpdatedAt          time.Time  `json:"updatedAt"`
	FileCount          int        `json:"fileCount"`
	KeyCount           int        `json:"keyCount"`
}

// MergeChange is one key the source branch would write onto the target.
type MergeChange struct {
	Kind             string             `json:"kind"`
	SourcePath       *string            `json:"sourcePath"`
	Key              string             `json:"key"`
	SourceText       string             `json:"sourceText"`
	TargetSourceText *string            `json:"targetSourceText"`
	Translations     []MergeTranslation `json:"translations"`
}

// MergeTranslation is one locale on a merge change.
type MergeTranslation struct {
	Locale string `json:"locale"`
	Text   string `json:"text"`
	Status string `json:"status"`
}

type branchRow struct {
	ID                 string
	OrganizationID     string
	ProjectID          string
	Name               string
	Title              *string
	BaseBranchID       *string
	IsDefault          bool
	IsProtected        bool
	Status             string
	LastSyncedAt       *time.Time
	CreatedByUserID    *string
	MergedAt           *time.Time
	MergedIntoBranchID *string
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

const branchColumns = `id, organization_id, project_id, name, title, base_branch_id, is_default, is_protected,
	status, last_synced_at, created_by_user_id, merged_at, merged_into_branch_id, created_at, updated_at`

func scanBranch(row pgx.Row) (branchRow, error) {
	var record branchRow
	err := row.Scan(
		&record.ID, &record.OrganizationID, &record.ProjectID, &record.Name, &record.Title, &record.BaseBranchID,
		&record.IsDefault, &record.IsProtected, &record.Status, &record.LastSyncedAt, &record.CreatedByUserID,
		&record.MergedAt, &record.MergedIntoBranchID, &record.CreatedAt, &record.UpdatedAt,
	)
	return record, err
}

// ListBranches returns every branch on the project, default first.
func ListBranches(ctx context.Context, db DB, projectID string) ([]BranchRecord, error) {
	rows, err := db.Query(ctx, `
		select b.id, b.project_id, b.name, b.title, b.base_branch_id, b.is_default, b.is_protected,
			b.status, b.last_synced_at, b.created_by_user_id, b.merged_at, b.merged_into_branch_id,
			b.created_at, b.updated_at,
			coalesce(f.file_count, 0), coalesce(k.key_count, 0)
		from project_branches b
		left join (
			select branch_name, count(*)::int as file_count
			from repository_source_files
			where project_id = $1
			group by branch_name
		) f on f.branch_name = b.name
		left join (
			select branch_name, count(*)::int as key_count
			from project_translation_keys
			where project_id = $1
			group by branch_name
		) k on k.branch_name = b.name
		where b.project_id = $1
		order by b.is_default desc, b.name`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := []BranchRecord{}
	for rows.Next() {
		var record BranchRecord
		if err := rows.Scan(
			&record.ID, &record.ProjectID, &record.Name, &record.Title, &record.BaseBranchID,
			&record.IsDefault, &record.IsProtected, &record.Status, &record.LastSyncedAt,
			&record.CreatedByUserID, &record.MergedAt, &record.MergedIntoBranchID,
			&record.CreatedAt, &record.UpdatedAt, &record.FileCount, &record.KeyCount,
		); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

// CreateBranchInput is a new version branch.
type CreateBranchInput struct {
	OrganizationID  string
	ProjectID       string
	Name            string
	Title           *string
	BaseBranchName  *string
	CreatedByUserID string
	Clone           *bool
}

// CreateBranch clones an active branch. clone defaults to true.
func CreateBranch(ctx context.Context, pool Pool, input CreateBranchInput) (BranchRecord, error) {
	name := NormalizeBranchName(input.Name)
	if !ValidBranchName(name) {
		return BranchRecord{}, branchErr("invalid_branch_name")
	}
	if input.BaseBranchName != nil && strings.TrimSpace(*input.BaseBranchName) != "" && !ValidBranchName(*input.BaseBranchName) {
		return BranchRecord{}, branchErr("invalid_branch_name")
	}
	title := trimmedTitle(input.Title)
	if err := validateBranchTitle(title); err != nil {
		return BranchRecord{}, err
	}
	taken, err := findActiveByName(ctx, pool, input.ProjectID, name)
	if err != nil {
		return BranchRecord{}, err
	}
	if taken != nil {
		return BranchRecord{}, branchErr("branch_name_taken")
	}
	base, err := resolveBaseBranch(ctx, pool, input.ProjectID, input.BaseBranchName)
	if err != nil {
		return BranchRecord{}, err
	}
	if base == nil {
		return BranchRecord{}, branchErr("branch_not_found")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return BranchRecord{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	created, err := scanBranch(tx.QueryRow(ctx, `
		insert into project_branches (organization_id, project_id, name, title, base_branch_id, created_by_user_id)
		values ($1, $2, $3, $4, $5, $6)
		returning `+branchColumns,
		input.OrganizationID, input.ProjectID, name, title, base.ID, nullableUser(input.CreatedByUserID)))
	if err != nil {
		if mapped := mapWriteError(err); mapped != nil {
			return BranchRecord{}, mapped
		}
		return BranchRecord{}, err
	}
	if input.Clone == nil || *input.Clone {
		if err := copyBranchContent(ctx, tx, input.ProjectID, base.Name, name); err != nil {
			return BranchRecord{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return BranchRecord{}, err
	}
	return recordWithCounts(ctx, pool, input.ProjectID, created)
}

// UpdateBranchInput patches one active branch. TitleSet distinguishes an omitted title from a cleared one.
type UpdateBranchInput struct {
	ProjectID   string
	Name        string
	Title       *string
	TitleSet    bool
	IsProtected *bool
}

// UpdateBranch changes a title, the protect flag, or both.
func UpdateBranch(ctx context.Context, db DB, input UpdateBranchInput) (BranchRecord, error) {
	row, err := findActiveByName(ctx, db, input.ProjectID, NormalizeBranchName(input.Name))
	if err != nil {
		return BranchRecord{}, err
	}
	if row == nil {
		return BranchRecord{}, branchErr("branch_not_found")
	}
	title := row.Title
	if input.TitleSet {
		title = trimmedTitle(input.Title)
		if err := validateBranchTitle(title); err != nil {
			return BranchRecord{}, err
		}
	}
	protected := row.IsProtected
	if input.IsProtected != nil {
		protected = *input.IsProtected
	}
	updated, err := scanBranch(db.QueryRow(ctx, `
		update project_branches
		set title = $2, is_protected = $3, updated_at = now()
		where id = $1
		returning `+branchColumns, row.ID, title, protected))
	if err != nil {
		return BranchRecord{}, err
	}
	return recordWithCounts(ctx, db, input.ProjectID, updated)
}

// DeleteBranch removes a non-default branch that has no active children, and its files and keys.
func DeleteBranch(ctx context.Context, pool Pool, projectID, name string) error {
	row, err := findActiveByName(ctx, pool, projectID, NormalizeBranchName(name))
	if err != nil {
		return err
	}
	if row == nil {
		return branchErr("branch_not_found")
	}
	if row.IsDefault {
		return branchErr("cannot_delete_default")
	}
	if child, err := hasActiveChild(ctx, pool, row.ID); err != nil {
		return err
	} else if child {
		return branchErr("cannot_delete_with_children")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := deleteBranchContent(ctx, tx, projectID, row.Name); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `delete from project_branches where id = $1`, row.ID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// PreviewMerge diffs source onto its parent, or onto targetName when set.
func PreviewMerge(ctx context.Context, db DB, projectID, sourceName string, targetName *string) ([]MergeChange, error) {
	if err := validateOptionalBranchName(targetName); err != nil {
		return nil, err
	}
	source, target, err := mergePair(ctx, db, projectID, sourceName, targetName)
	if err != nil {
		return nil, err
	}
	return diffBranchKeys(ctx, db, projectID, source.Name, target.Name)
}

// MergeBranchInput merges source onto target. An empty target uses the parent.
type MergeBranchInput struct {
	ProjectID   string
	SourceName  string
	TargetName  *string
	Strategy    string
	DeleteAfter *bool
}

// MergeBranch copies accepted changes onto the parent and marks the source merged.
// deleteAfter defaults to true, which removes the source branch's files and keys.
func MergeBranch(ctx context.Context, pool Pool, input MergeBranchInput) (BranchRecord, error) {
	if err := validateOptionalBranchName(input.TargetName); err != nil {
		return BranchRecord{}, err
	}
	changes, err := PreviewMerge(ctx, pool, input.ProjectID, input.SourceName, input.TargetName)
	if err != nil {
		return BranchRecord{}, err
	}
	source, target, err := mergePair(ctx, pool, input.ProjectID, input.SourceName, input.TargetName)
	if err != nil {
		return BranchRecord{}, err
	}
	if child, err := hasActiveChild(ctx, pool, source.ID); err != nil {
		return BranchRecord{}, err
	} else if child {
		return BranchRecord{}, branchErr("has_child_branches")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return BranchRecord{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := applyBranchChanges(ctx, tx, source.OrganizationID, input.ProjectID, source.Name, target.Name, changes, input.Strategy); err != nil {
		return BranchRecord{}, err
	}
	if _, err := tx.Exec(ctx, `
		update project_branches
		set status = 'merged', merged_at = now(), merged_into_branch_id = $2, is_default = false, updated_at = now()
		where id = $1`, source.ID, target.ID); err != nil {
		return BranchRecord{}, err
	}
	if input.DeleteAfter == nil || *input.DeleteAfter {
		if err := deleteBranchContent(ctx, tx, input.ProjectID, source.Name); err != nil {
			return BranchRecord{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return BranchRecord{}, err
	}
	refreshed, err := findByID(ctx, pool, target.ID)
	if err != nil {
		return BranchRecord{}, err
	}
	if refreshed == nil {
		return BranchRecord{}, branchErr("branch_not_found")
	}
	return recordWithCounts(ctx, pool, input.ProjectID, *refreshed)
}

// SyncBranch copies the parent into the branch.
func SyncBranch(ctx context.Context, pool Pool, projectID, name, strategy string) (BranchRecord, error) {
	branch, err := findActiveByName(ctx, pool, projectID, NormalizeBranchName(name))
	if err != nil {
		return BranchRecord{}, err
	}
	if branch == nil || branch.BaseBranchID == nil {
		return BranchRecord{}, branchErr("branch_not_found")
	}
	base, err := findByID(ctx, pool, *branch.BaseBranchID)
	if err != nil {
		return BranchRecord{}, err
	}
	if base == nil || base.Status != "active" {
		return BranchRecord{}, branchErr("branch_not_found")
	}
	changes, err := diffBranchKeys(ctx, pool, projectID, base.Name, branch.Name)
	if err != nil {
		return BranchRecord{}, err
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return BranchRecord{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := applyBranchChanges(ctx, tx, branch.OrganizationID, projectID, base.Name, branch.Name, changes, strategy); err != nil {
		return BranchRecord{}, err
	}
	if _, err := tx.Exec(ctx, `
		update project_branches set last_synced_at = now(), updated_at = now() where id = $1`, branch.ID); err != nil {
		return BranchRecord{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return BranchRecord{}, err
	}
	refreshed, err := findByID(ctx, pool, branch.ID)
	if err != nil {
		return BranchRecord{}, err
	}
	if refreshed == nil {
		return BranchRecord{}, branchErr("branch_not_found")
	}
	return recordWithCounts(ctx, pool, projectID, *refreshed)
}

// AssertWritable rejects a missing or protected active branch. An empty name is main.
func AssertWritable(ctx context.Context, db DB, projectID, branchName string) (string, error) {
	name := NormalizeBranchName(branchName)
	if name == "" {
		name = DefaultBranchName
	}
	if !ValidBranchName(name) {
		return "", branchErr("invalid_branch_name")
	}
	row, err := findActiveByName(ctx, db, projectID, name)
	if err != nil {
		return "", err
	}
	if row == nil {
		return "", branchErr("branch_not_found")
	}
	if row.IsProtected {
		return "", branchErr("protected_branch")
	}
	return row.Name, nil
}

// ValidStrategy reports a merge or sync conflict strategy.
func ValidStrategy(value string) bool {
	return value == "use_branch" || value == "use_base"
}

func findActiveByName(ctx context.Context, db DB, projectID, name string) (*branchRow, error) {
	row, err := scanBranch(db.QueryRow(ctx, `
		select `+branchColumns+`
		from project_branches
		where project_id = $1 and name = $2 and status = 'active'`, projectID, name))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func findByID(ctx context.Context, db DB, id string) (*branchRow, error) {
	row, err := scanBranch(db.QueryRow(ctx, `
		select `+branchColumns+` from project_branches where id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func resolveBaseBranch(ctx context.Context, db DB, projectID string, name *string) (*branchRow, error) {
	if name != nil && strings.TrimSpace(*name) != "" {
		return findActiveByName(ctx, db, projectID, NormalizeBranchName(*name))
	}
	row, err := scanBranch(db.QueryRow(ctx, `
		select `+branchColumns+`
		from project_branches
		where project_id = $1 and is_default and status = 'active'
		limit 1`, projectID))
	if errors.Is(err, pgx.ErrNoRows) {
		return findActiveByName(ctx, db, projectID, DefaultBranchName)
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func hasActiveChild(ctx context.Context, db DB, branchID string) (bool, error) {
	var exists bool
	err := db.QueryRow(ctx, `
		select exists(
			select 1 from project_branches where base_branch_id = $1 and status = 'active'
		)`, branchID).Scan(&exists)
	return exists, err
}

func recordWithCounts(ctx context.Context, db DB, projectID string, row branchRow) (BranchRecord, error) {
	record := BranchRecord{
		ID: row.ID, ProjectID: row.ProjectID, Name: row.Name, Title: row.Title,
		BaseBranchID: row.BaseBranchID, IsDefault: row.IsDefault, IsProtected: row.IsProtected,
		Status: row.Status, LastSyncedAt: row.LastSyncedAt, CreatedByUserID: row.CreatedByUserID,
		MergedAt: row.MergedAt, MergedIntoBranchID: row.MergedIntoBranchID,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
	err := db.QueryRow(ctx, `
		select
			(select count(*)::int from repository_source_files where project_id = $1 and branch_name = $2),
			(select count(*)::int from project_translation_keys where project_id = $1 and branch_name = $2)`,
		projectID, row.Name).Scan(&record.FileCount, &record.KeyCount)
	return record, err
}

func deleteBranchContent(ctx context.Context, db DB, projectID, name string) error {
	if _, err := db.Exec(ctx, `
		delete from project_translation_keys
		where project_id = $1 and branch_name = $2 and repository_source_file_id is null`,
		projectID, name); err != nil {
		return err
	}
	_, err := db.Exec(ctx, `
		delete from repository_source_files
		where project_id = $1 and branch_name = $2`, projectID, name)
	return err
}

func mergePair(ctx context.Context, db DB, projectID, sourceName string, targetName *string) (*branchRow, *branchRow, error) {
	source, err := findActiveByName(ctx, db, projectID, NormalizeBranchName(sourceName))
	if err != nil {
		return nil, nil, err
	}
	if source == nil {
		return nil, nil, branchErr("branch_not_found")
	}
	resolved := ""
	if targetName != nil && strings.TrimSpace(*targetName) != "" {
		resolved = NormalizeBranchName(*targetName)
	} else if source.BaseBranchID != nil {
		base, err := findByID(ctx, db, *source.BaseBranchID)
		if err != nil {
			return nil, nil, err
		}
		if base != nil {
			resolved = base.Name
		}
	}
	if resolved == "" {
		resolved = DefaultBranchName
	}
	if resolved == source.Name {
		return nil, nil, branchErr("cannot_merge_into_self")
	}
	target, err := findActiveByName(ctx, db, projectID, resolved)
	if err != nil {
		return nil, nil, err
	}
	if target == nil {
		return nil, nil, branchErr("branch_not_found")
	}
	return source, target, nil
}

func trimmedTitle(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func validateBranchTitle(title *string) error {
	if title != nil && len([]rune(*title)) > branchTitleMax {
		return branchErr("invalid_branch_title")
	}
	return nil
}

func validateOptionalBranchName(name *string) error {
	if name == nil || strings.TrimSpace(*name) == "" {
		return nil
	}
	if !ValidBranchName(*name) {
		return branchErr("invalid_branch_name")
	}
	return nil
}

func nullableUser(id string) any {
	if id == "" {
		return nil
	}
	return id
}

func mapWriteError(err error) error {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return nil
	}
	switch pgErr.Code {
	case "23505":
		return branchErr("branch_name_taken")
	case "23514":
		return branchErr("invalid_branch_name")
	default:
		return nil
	}
}

type keySnapshot struct {
	id           string
	key          string
	sourcePath   *string
	sourceText   string
	context      *string
	keyType      *string
	maxLength    *int
	tags         []string
	isHidden     bool
	translations []MergeTranslation
}

func loadKeySnapshots(ctx context.Context, db DB, projectID, branchName string) ([]keySnapshot, error) {
	rows, err := db.Query(ctx, `
		select k.id, k.key, k.source_text, k.context, k.type, k.max_length, k.tags, k.is_hidden, f.source_path
		from project_translation_keys k
		left join repository_source_files f on f.id = k.repository_source_file_id
		where k.project_id = $1 and k.branch_name = $2`, projectID, branchName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	keys := []keySnapshot{}
	ids := []string{}
	for rows.Next() {
		var snap keySnapshot
		if err := rows.Scan(
			&snap.id, &snap.key, &snap.sourceText, &snap.context, &snap.keyType, &snap.maxLength,
			&snap.tags, &snap.isHidden, &snap.sourcePath,
		); err != nil {
			return nil, err
		}
		if snap.tags == nil {
			snap.tags = []string{}
		}
		keys = append(keys, snap)
		ids = append(ids, snap.id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return keys, nil
	}
	translations, err := db.Query(ctx, `
		select translation_key_id::text, target_locale, text, status
		from project_translations
		where translation_key_id = any($1::uuid[])`, ids)
	if err != nil {
		return nil, err
	}
	defer translations.Close()
	byKey := map[string][]MergeTranslation{}
	for translations.Next() {
		var keyID string
		var item MergeTranslation
		if err := translations.Scan(&keyID, &item.Locale, &item.Text, &item.Status); err != nil {
			return nil, err
		}
		byKey[keyID] = append(byKey[keyID], item)
	}
	if err := translations.Err(); err != nil {
		return nil, err
	}
	for i := range keys {
		keys[i].translations = byKey[keys[i].id]
		if keys[i].translations == nil {
			keys[i].translations = []MergeTranslation{}
		}
	}
	return keys, nil
}

func keyIdentity(path *string, key string) string {
	if path == nil {
		return "::" + key
	}
	return *path + "::" + key
}

func translationsEqual(left, right []MergeTranslation) bool {
	if len(left) != len(right) {
		return false
	}
	rightByLocale := map[string]MergeTranslation{}
	for _, item := range right {
		rightByLocale[item.Locale] = item
	}
	for _, item := range left {
		match, ok := rightByLocale[item.Locale]
		if !ok || match.Text != item.Text || match.Status != item.Status {
			return false
		}
	}
	return true
}

func diffBranchKeys(ctx context.Context, db DB, projectID, sourceBranch, targetBranch string) ([]MergeChange, error) {
	sourceKeys, err := loadKeySnapshots(ctx, db, projectID, sourceBranch)
	if err != nil {
		return nil, err
	}
	targetKeys, err := loadKeySnapshots(ctx, db, projectID, targetBranch)
	if err != nil {
		return nil, err
	}
	targetByID := map[string]keySnapshot{}
	for _, key := range targetKeys {
		targetByID[keyIdentity(key.sourcePath, key.key)] = key
	}
	changes := []MergeChange{}
	for _, source := range sourceKeys {
		target, ok := targetByID[keyIdentity(source.sourcePath, source.key)]
		if !ok {
			changes = append(changes, MergeChange{
				Kind: "added", SourcePath: source.sourcePath, Key: source.key,
				SourceText: source.sourceText, Translations: source.translations,
			})
			continue
		}
		sourceChanged := source.sourceText != target.sourceText
		translationChanged := !translationsEqual(source.translations, target.translations)
		if !sourceChanged && !translationChanged {
			continue
		}
		kind := "changed"
		if sourceChanged {
			kind = "conflicted"
		}
		targetText := target.sourceText
		changes = append(changes, MergeChange{
			Kind: kind, SourcePath: source.sourcePath, Key: source.key,
			SourceText: source.sourceText, TargetSourceText: &targetText, Translations: source.translations,
		})
	}
	return changes, nil
}

func copyBranchContent(ctx context.Context, db DB, projectID, fromName, toName string) error {
	if _, err := db.Exec(ctx, `
		insert into repository_source_files (
			organization_id, project_id, source_path, branch_name,
			segmentation_settings, message_format, placeholder_patterns, import_settings
		)
		select organization_id, project_id, source_path, $3,
			segmentation_settings, message_format, placeholder_patterns, import_settings
		from repository_source_files
		where project_id = $1 and branch_name = $2`, projectID, fromName, toName); err != nil {
		return err
	}
	if _, err := db.Exec(ctx, `
		insert into repository_source_file_versions (
			repository_source_file_id, organization_id, project_id, source_path, stored_file_id,
			source_hash, commit_sha, workflow_run_id, uploaded_by_user_id, uploaded_by_api_key_id,
			upload_surface, keep_approved_translations, ingest_state, ingest_error, ingested_at,
			ingest_workflow_run_id, sync_report
		)
		select nf.id, v.organization_id, v.project_id, v.source_path, v.stored_file_id,
			v.source_hash, v.commit_sha, v.workflow_run_id, v.uploaded_by_user_id, v.uploaded_by_api_key_id,
			v.upload_surface, v.keep_approved_translations, v.ingest_state, v.ingest_error, v.ingested_at,
			v.ingest_workflow_run_id, v.sync_report
		from repository_source_files ofile
		join repository_source_files nf
			on nf.project_id = ofile.project_id and nf.source_path = ofile.source_path and nf.branch_name = $3
		join lateral (
			select * from repository_source_file_versions
			where repository_source_file_id = ofile.id
			order by created_at desc, id desc
			limit 1
		) v on true
		where ofile.project_id = $1 and ofile.branch_name = $2`, projectID, fromName, toName); err != nil {
		return err
	}
	// Point the clone at the copied version when that version is the one the
	// source file has reconciled. Downloads and source-text edits read this id.
	if _, err := db.Exec(ctx, `
		update repository_source_files nf
		set reconciled_source_file_version_id = (
			select id
			from repository_source_file_versions
			where repository_source_file_id = nf.id
			order by created_at desc, id desc
			limit 1
		)
		from repository_source_files ofile
		where ofile.project_id = $1 and ofile.branch_name = $2
			and nf.project_id = ofile.project_id and nf.branch_name = $3
			and nf.source_path = ofile.source_path
			and ofile.reconciled_source_file_version_id = (
				select id
				from repository_source_file_versions
				where repository_source_file_id = ofile.id
				order by created_at desc, id desc
				limit 1
			)`, projectID, fromName, toName); err != nil {
		return err
	}
	if _, err := db.Exec(ctx, `
		insert into project_translation_keys (
			organization_id, project_id, repository_source_file_id, key, branch_name,
			source_text, normalized_source_text, imported_source_text, context, type,
			max_length, tags, design_url, is_hidden, metadata
		)
		select k.organization_id, k.project_id, nf.id, k.key, $3,
			k.source_text, k.normalized_source_text, k.imported_source_text, k.context, k.type,
			k.max_length, k.tags, k.design_url, k.is_hidden, k.metadata
		from project_translation_keys k
		left join repository_source_files ofile on ofile.id = k.repository_source_file_id
		left join repository_source_files nf
			on nf.project_id = k.project_id and nf.branch_name = $3 and nf.source_path = ofile.source_path
		where k.project_id = $1 and k.branch_name = $2`, projectID, fromName, toName); err != nil {
		return err
	}
	_, err := db.Exec(ctx, `
		insert into project_translations (
			organization_id, project_id, translation_key_id, target_locale, text, status, provenance, origin, metadata
		)
		select t.organization_id, t.project_id, nk.id, t.target_locale, t.text, t.status, t.provenance, t.origin, t.metadata
		from project_translations t
		join project_translation_keys ok on ok.id = t.translation_key_id
		left join repository_source_files ofile on ofile.id = ok.repository_source_file_id
		left join repository_source_files nf
			on nf.project_id = ok.project_id and nf.branch_name = $3 and nf.source_path = ofile.source_path
		join project_translation_keys nk
			on nk.project_id = ok.project_id and nk.branch_name = $3 and nk.key = ok.key
			and nk.repository_source_file_id is not distinct from nf.id
		where ok.project_id = $1 and ok.branch_name = $2`, projectID, fromName, toName)
	return err
}

func applyBranchChanges(
	ctx context.Context,
	db DB,
	organizationID, projectID, sourceBranch, targetBranch string,
	changes []MergeChange,
	strategy string,
) error {
	accepted := make([]MergeChange, 0, len(changes))
	for _, change := range changes {
		if change.Kind == "conflicted" && strategy != "use_branch" {
			continue
		}
		accepted = append(accepted, change)
	}
	if len(accepted) == 0 {
		return nil
	}
	sourceKeys, err := loadKeySnapshots(ctx, db, projectID, sourceBranch)
	if err != nil {
		return err
	}
	sourceByID := map[string]keySnapshot{}
	for _, key := range sourceKeys {
		sourceByID[keyIdentity(key.sourcePath, key.key)] = key
	}
	fileRows, err := db.Query(ctx, `
		select id::text, source_path from repository_source_files
		where project_id = $1 and branch_name = $2`, projectID, targetBranch)
	if err != nil {
		return err
	}
	fileIDByPath := map[string]string{}
	for fileRows.Next() {
		var id, path string
		if err := fileRows.Scan(&id, &path); err != nil {
			fileRows.Close()
			return err
		}
		fileIDByPath[path] = id
	}
	if err := fileRows.Err(); err != nil {
		fileRows.Close()
		return err
	}
	fileRows.Close()

	for _, change := range accepted {
		snapshot, ok := sourceByID[keyIdentity(change.SourcePath, change.Key)]
		if !ok {
			continue
		}
		var fileID *string
		if change.SourcePath != nil && *change.SourcePath != "" {
			if existing, found := fileIDByPath[*change.SourcePath]; found {
				id := existing
				fileID = &id
			} else {
				var created string
				err := db.QueryRow(ctx, `
					insert into repository_source_files (
						organization_id, project_id, source_path, branch_name,
						segmentation_settings, message_format, placeholder_patterns, import_settings
					)
					select organization_id, project_id, source_path, $4,
						segmentation_settings, message_format, placeholder_patterns, import_settings
					from repository_source_files
					where project_id = $2 and branch_name = $5 and source_path = $3
					returning id::text`,
					organizationID, projectID, *change.SourcePath, targetBranch, sourceBranch).Scan(&created)
				if errors.Is(err, pgx.ErrNoRows) {
					err = db.QueryRow(ctx, `
						insert into repository_source_files (organization_id, project_id, source_path, branch_name)
						values ($1, $2, $3, $4)
						returning id::text`,
						organizationID, projectID, *change.SourcePath, targetBranch).Scan(&created)
				}
				if err != nil {
					return err
				}
				fileID = &created
				fileIDByPath[*change.SourcePath] = created
				if err := copyLatestVersion(ctx, db, projectID, sourceBranch, *change.SourcePath, created); err != nil {
					return err
				}
			}
		}
		normalized := memoryinterchange.NormalizeSourceText(snapshot.sourceText)
		var keyID string
		err := db.QueryRow(ctx, `
			select id::text from project_translation_keys
			where project_id = $1 and branch_name = $2 and key = $3
				and repository_source_file_id is not distinct from $4::uuid
			limit 1`, projectID, targetBranch, snapshot.key, fileID).Scan(&keyID)
		if errors.Is(err, pgx.ErrNoRows) {
			err = db.QueryRow(ctx, `
				insert into project_translation_keys (
					organization_id, project_id, repository_source_file_id, key, branch_name,
					source_text, normalized_source_text, context, type, max_length, tags, is_hidden
				) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
				returning id::text`,
				organizationID, projectID, fileID, snapshot.key, targetBranch, snapshot.sourceText, normalized,
				snapshot.context, snapshot.keyType, snapshot.maxLength, snapshot.tags, snapshot.isHidden,
			).Scan(&keyID)
		} else if err == nil {
			_, err = db.Exec(ctx, `
				update project_translation_keys
				set source_text = $2, normalized_source_text = $3, context = $4, type = $5,
					max_length = $6, tags = $7, is_hidden = $8, updated_at = now()
				where id = $1`,
				keyID, snapshot.sourceText, normalized, snapshot.context, snapshot.keyType, snapshot.maxLength, snapshot.tags, snapshot.isHidden)
		}
		if err != nil {
			return err
		}
		for _, translation := range snapshot.translations {
			if _, err := db.Exec(ctx, `
				insert into project_translations (
					organization_id, project_id, translation_key_id, target_locale, text, status
				) values ($1, $2, $3, $4, $5, $6)
				on conflict (translation_key_id, target_locale) do update set
					text = excluded.text, status = excluded.status, updated_at = now()`,
				organizationID, projectID, keyID, translation.Locale, translation.Text, translation.Status); err != nil {
				return err
			}
		}
	}
	return nil
}

func copyLatestVersion(ctx context.Context, db DB, projectID, sourceBranch, sourcePath, targetFileID string) error {
	_, err := db.Exec(ctx, `
		insert into repository_source_file_versions (
			repository_source_file_id, organization_id, project_id, source_path, stored_file_id,
			source_hash, ingest_state
		)
		select $4::uuid, v.organization_id, v.project_id, v.source_path, v.stored_file_id, v.source_hash, v.ingest_state
		from repository_source_files f
		join lateral (
			select * from repository_source_file_versions
			where repository_source_file_id = f.id
			order by created_at desc, id desc
			limit 1
		) v on true
		where f.project_id = $1 and f.branch_name = $2 and f.source_path = $3`,
		projectID, sourceBranch, sourcePath, targetFileID)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx, `
		update repository_source_files target
		set reconciled_source_file_version_id = (
			select id from repository_source_file_versions
			where repository_source_file_id = target.id
			order by created_at desc, id desc
			limit 1
		)
		where target.id = $4::uuid
			and exists (
				select 1
				from repository_source_files source
				join lateral (
					select id from repository_source_file_versions
					where repository_source_file_id = source.id
					order by created_at desc, id desc
					limit 1
				) latest on latest.id = source.reconciled_source_file_version_id
				where source.project_id = $1 and source.branch_name = $2 and source.source_path = $3
			)`,
		projectID, sourceBranch, sourcePath, targetFileID)
	return err
}
