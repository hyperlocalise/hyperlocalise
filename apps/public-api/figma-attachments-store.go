package main

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"slices"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/keymeta"
	"github.com/jackc/pgx/v5"
)

// Figma attachments are built on the design link each
// string already has (`project_translation_keys.design_url`, shown in the Content Editor's key
// details). An attachment is every string whose design link names the same Figma file and node;
// it has no row of its own. Its id is derived from the link, so it is stable and needs no lookup.

var (
	errFigmaAttachmentNotFound   = fmt.Errorf("%w: figma attachment", errResourceNotFound)
	errFigmaAttachmentInvalidURL = errors.New("figma attachment url is not a Figma file link")

	figmaFileKeyPattern = regexp.MustCompile(`^[A-Za-z0-9]{1,128}$`)
	figmaNodeIDPattern  = regexp.MustCompile(`^[A-Za-z0-9:;-]{1,256}$`)
)

// figmaDesignURLSQL narrows design links to figma.com before Go parses them.
const figmaDesignURLSQL = `k.design_url ~* '^https://([a-z0-9-]+\.)?figma\.com/'`

// figmaAttachment is the Figma file or node that strings' design links point at.
type figmaAttachment struct {
	ID          string  `json:"id"`
	URL         string  `json:"url"`
	FileKey     string  `json:"fileKey"`
	NodeID      *string `json:"nodeId"`
	StringCount int     `json:"stringCount"`
}

// figmaAttachmentString is a string whose design link points at a Figma attachment.
type figmaAttachmentString struct {
	ID        string  `json:"id"`
	Key       string  `json:"key"`
	FilePath  *string `json:"filePath"`
	DesignURL string  `json:"designUrl"`
}

type figmaAttachmentFilters struct {
	StringID string
	Limit    int
	Offset   int
}

// figmaLink is the file and optional node a Figma URL names.
type figmaLink struct {
	FileKey string
	NodeID  *string
}

// id is the file key, plus `.` and the node in its URL spelling (`12-345`) when there is one.
func (l figmaLink) id() string {
	if l.NodeID == nil {
		return l.FileKey
	}
	return l.FileKey + "." + strings.ReplaceAll(*l.NodeID, ":", "-")
}

// url is the link the API writes to strings' design links.
func (l figmaLink) url() string {
	base := "https://www.figma.com/design/" + l.FileKey
	if l.NodeID == nil {
		return base
	}
	return base + "?node-id=" + url.QueryEscape(strings.ReplaceAll(*l.NodeID, ":", "-"))
}

func (l figmaLink) attachment(stringCount int) figmaAttachment {
	return figmaAttachment{ID: l.id(), URL: l.url(), FileKey: l.FileKey, NodeID: l.NodeID, StringCount: stringCount}
}

func newFigmaLink(fileKey, node string) (figmaLink, error) {
	if !figmaFileKeyPattern.MatchString(fileKey) {
		return figmaLink{}, errFigmaAttachmentInvalidURL
	}
	link := figmaLink{FileKey: fileKey}
	if node != "" {
		node = strings.ReplaceAll(node, "-", ":")
		if !figmaNodeIDPattern.MatchString(node) {
			return figmaLink{}, errFigmaAttachmentInvalidURL
		}
		link.NodeID = &node
	}
	return link, nil
}

// parseFigmaURL accepts https links to a Figma file, design, prototype, board, or slides
// (`/{kind}/{fileKey}/...`, with `/branch/{branchKey}` naming a branch's own file key) and
// reads the node from `node-id`, written with `:` as the Figma REST API expects.
func parseFigmaURL(raw string) (figmaLink, error) {
	if !keymeta.ValidDesignURL(raw) {
		return figmaLink{}, errFigmaAttachmentInvalidURL
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil {
		return figmaLink{}, errFigmaAttachmentInvalidURL
	}
	host := strings.ToLower(parsed.Hostname())
	if host != "figma.com" && !strings.HasSuffix(host, ".figma.com") {
		return figmaLink{}, errFigmaAttachmentInvalidURL
	}
	segments := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(segments) < 2 {
		return figmaLink{}, errFigmaAttachmentInvalidURL
	}
	switch segments[0] {
	case "file", "design", "proto", "board", "slides", "deck":
	default:
		return figmaLink{}, errFigmaAttachmentInvalidURL
	}
	fileKey := segments[1]
	if len(segments) >= 4 && segments[2] == "branch" {
		fileKey = segments[3]
	}
	return newFigmaLink(fileKey, strings.TrimSpace(parsed.Query().Get("node-id")))
}

// parseFigmaAttachmentID reads an id made by figmaLink.id.
func parseFigmaAttachmentID(id string) (figmaLink, error) {
	fileKey, node, _ := strings.Cut(id, ".")
	link, err := newFigmaLink(fileKey, node)
	if err != nil {
		return figmaLink{}, errFigmaAttachmentNotFound
	}
	return link, nil
}

// readNativeProject resolves an accessible native project for a read outside a transaction.
func (s *postgresStore) readNativeProject(ctx context.Context, actor principal, projectID string) (projectScope, error) {
	scope, err := loadProjectScope(ctx, s.pool, actor, projectID)
	if err != nil {
		return projectScope{}, err
	}
	return scope, scope.requireNative()
}

// countFigmaLinks groups the project's Figma design links by attachment. A file key narrows
// the query to links that mention it; a string id to that string's link.
func countFigmaLinks(ctx context.Context, db screenshotExec, actor principal, scope projectScope, fileKey, stringID string) (map[string]figmaAttachment, error) {
	where := newSQLFilter("k.organization_id = $1 AND k.project_id = $2 AND "+figmaDesignURLSQL, actor.OrganizationID, scope.ID)
	if fileKey != "" {
		where.add("strpos(k.design_url, ?) > 0", fileKey)
	}
	if stringID != "" {
		where.add("k.id = ?::uuid", stringID)
	}
	rows, err := db.Query(ctx, `SELECT k.design_url, count(*)::int FROM project_translation_keys k
		WHERE `+where.sql()+` GROUP BY k.design_url`, where.args...)
	if err != nil {
		return nil, fmt.Errorf("count figma links: %w", err)
	}
	defer rows.Close()
	groups := map[string]figmaAttachment{}
	for rows.Next() {
		var designURL string
		var count int
		if err := rows.Scan(&designURL, &count); err != nil {
			return nil, fmt.Errorf("count figma links: %w", err)
		}
		link, err := parseFigmaURL(designURL)
		if err != nil {
			continue
		}
		group, ok := groups[link.id()]
		if !ok {
			group = link.attachment(0)
		}
		group.StringCount += count
		groups[link.id()] = group
	}
	return groups, rows.Err()
}

func (s *postgresStore) listFigmaAttachments(ctx context.Context, actor principal, projectID string, filters figmaAttachmentFilters) ([]figmaAttachment, int, error) {
	scope, err := s.readNativeProject(ctx, actor, projectID)
	if err != nil {
		return nil, 0, err
	}
	groups, err := countFigmaLinks(ctx, s.pool, actor, scope, "", filters.StringID)
	if err != nil {
		return nil, 0, err
	}
	items := make([]figmaAttachment, 0, len(groups))
	for _, group := range groups {
		items = append(items, group)
	}
	slices.SortFunc(items, func(a, b figmaAttachment) int { return cmp.Compare(a.ID, b.ID) })
	total := len(items)
	start := min(filters.Offset, total)
	end := min(start+filters.Limit, total)
	return items[start:end], total, nil
}

// getFigmaAttachment returns the attachment an id names, with the strings that link to it. Any
// well-formed id names a Figma file or node, so it resolves even when no string links to it yet.
func (s *postgresStore) getFigmaAttachment(ctx context.Context, actor principal, projectID, attachmentID string) (figmaAttachment, error) {
	link, err := parseFigmaAttachmentID(attachmentID)
	if err != nil {
		return figmaAttachment{}, err
	}
	return s.resolveFigmaAttachment(ctx, actor, projectID, link)
}

// createFigmaAttachment checks a Figma link and returns its attachment. Nothing is stored:
// linking strings writes their design links.
func (s *postgresStore) createFigmaAttachment(ctx context.Context, actor principal, projectID, rawURL string) (figmaAttachment, error) {
	link, err := parseFigmaURL(rawURL)
	if err != nil {
		return figmaAttachment{}, err
	}
	return s.resolveFigmaAttachment(ctx, actor, projectID, link)
}

func (s *postgresStore) resolveFigmaAttachment(ctx context.Context, actor principal, projectID string, link figmaLink) (figmaAttachment, error) {
	scope, err := s.readNativeProject(ctx, actor, projectID)
	if err != nil {
		return figmaAttachment{}, err
	}
	groups, err := countFigmaLinks(ctx, s.pool, actor, scope, link.FileKey, "")
	if err != nil {
		return figmaAttachment{}, err
	}
	if group, ok := groups[link.id()]; ok {
		return group, nil
	}
	return link.attachment(0), nil
}

// linkedFigmaStrings returns the project's strings whose design link points at the attachment,
// sorted by key. keyIDs, when not nil, narrows them to those strings.
func linkedFigmaStrings(ctx context.Context, db screenshotExec, actor principal, scope projectScope, link figmaLink, keyIDs []string) ([]figmaAttachmentString, error) {
	where := newSQLFilter("k.organization_id = $1 AND k.project_id = $2 AND "+figmaDesignURLSQL, actor.OrganizationID, scope.ID)
	where.add("strpos(k.design_url, ?) > 0", link.FileKey)
	if keyIDs != nil {
		where.add("k.id = ANY(?::uuid[])", keyIDs)
	}
	rows, err := db.Query(ctx, `SELECT k.id, k.key, f.source_path, k.design_url
		FROM project_translation_keys k
		LEFT JOIN repository_source_files f ON f.id = k.repository_source_file_id
		WHERE `+where.sql()+` ORDER BY k.key ASC, k.id ASC`, where.args...)
	if err != nil {
		return nil, fmt.Errorf("list figma attachment strings: %w", err)
	}
	all, err := collectRows(rows, func(row rowScanner) (figmaAttachmentString, error) {
		var item figmaAttachmentString
		err := row.Scan(&item.ID, &item.Key, &item.FilePath, &item.DesignURL)
		return item, err
	})
	if err != nil {
		return nil, err
	}
	matched := all[:0]
	for _, item := range all {
		if parsed, err := parseFigmaURL(item.DesignURL); err == nil && parsed.id() == link.id() {
			matched = append(matched, item)
		}
	}
	return matched, nil
}

func (s *postgresStore) listFigmaAttachmentStrings(ctx context.Context, actor principal, projectID, attachmentID string, limit, offset int) ([]figmaAttachmentString, int, error) {
	link, err := parseFigmaAttachmentID(attachmentID)
	if err != nil {
		return nil, 0, err
	}
	scope, err := s.readNativeProject(ctx, actor, projectID)
	if err != nil {
		return nil, 0, err
	}
	items, err := linkedFigmaStrings(ctx, s.pool, actor, scope, link, nil)
	if err != nil {
		return nil, 0, err
	}
	total := len(items)
	start := min(offset, total)
	end := min(start+limit, total)
	return items[start:end], total, nil
}

// linkFigmaAttachmentStrings sets the selected strings' design link to the attachment, as the
// strings bulk update does, and returns how many changed. A string has one design link, so
// linking replaces any link it had.
func (s *postgresStore) linkFigmaAttachmentStrings(ctx context.Context, actor principal, projectID, attachmentID string, sel stringSelector) (int, error) {
	link, err := parseFigmaAttachmentID(attachmentID)
	if err != nil {
		return 0, err
	}
	designURL := link.url()
	return s.bulkUpdateStrings(ctx, actor, projectID, stringBulkUpdate{
		Select:    sel,
		DesignURL: optionalString{Set: true, Value: &designURL},
	})
}

// unlinkFigmaAttachmentStrings clears the design link of the selected strings that point at the
// attachment, leaving strings linked elsewhere alone, and returns how many it cleared.
func (s *postgresStore) unlinkFigmaAttachmentStrings(ctx context.Context, actor principal, projectID, attachmentID string, sel stringSelector) (int, error) {
	link, err := parseFigmaAttachmentID(attachmentID)
	if err != nil {
		return 0, err
	}
	cleared := 0
	err = s.withNativeProject(ctx, actor, projectID, func(tx pgx.Tx, scope projectScope) error {
		where := newSQLFilter("k.organization_id = $1 AND k.project_id = $2", actor.OrganizationID, scope.ID)
		sel.apply(where)
		keyIDs, err := lockSelectedStrings(ctx, tx, where, maxSelectedStrings)
		if err != nil {
			return err
		}
		cleared, err = clearFigmaLinks(ctx, tx, actor, scope, link, keyIDs)
		return err
	})
	return cleared, err
}

// deleteFigmaAttachment clears the design link of every string that points at the attachment.
// With none, there is nothing to clear and it succeeds.
func (s *postgresStore) deleteFigmaAttachment(ctx context.Context, actor principal, projectID, attachmentID string) error {
	link, err := parseFigmaAttachmentID(attachmentID)
	if err != nil {
		return err
	}
	return s.withNativeProject(ctx, actor, projectID, func(tx pgx.Tx, scope projectScope) error {
		linked, err := linkedFigmaStrings(ctx, tx, actor, scope, link, nil)
		if err != nil {
			return err
		}
		if len(linked) == 0 {
			return nil
		}
		keyIDs := make([]string, len(linked))
		for i, item := range linked {
			keyIDs[i] = item.ID
		}
		where := newSQLFilter("k.organization_id = $1 AND k.project_id = $2", actor.OrganizationID, scope.ID)
		where.add("k.id = ANY(?::uuid[])", keyIDs)
		locked, err := lockSelectedStrings(ctx, tx, where, len(keyIDs))
		if err != nil {
			return err
		}
		_, err = clearFigmaLinks(ctx, tx, actor, scope, link, locked)
		return err
	})
}

// clearFigmaLinks clears the design link of the locked strings that point at the attachment
// and records the change as the strings bulk update does.
func clearFigmaLinks(ctx context.Context, tx pgx.Tx, actor principal, scope projectScope, link figmaLink, keyIDs []string) (int, error) {
	linked, err := linkedFigmaStrings(ctx, tx, actor, scope, link, keyIDs)
	if err != nil || len(linked) == 0 {
		return 0, err
	}
	ids := make([]string, len(linked))
	for i, item := range linked {
		ids[i] = item.ID
	}
	tag, err := tx.Exec(ctx, `UPDATE project_translation_keys k SET design_url = NULL, updated_at = now()
		WHERE k.organization_id = $1 AND k.project_id = $2 AND k.id = ANY($3::uuid[])`,
		actor.OrganizationID, scope.ID, ids)
	if err != nil {
		return 0, fmt.Errorf("clear figma links: %w", err)
	}
	cleared := int(tag.RowsAffected())
	if cleared == 0 {
		return 0, nil
	}
	return cleared, insertActivity(ctx, tx, actor, activityEvent{
		EventType:  "project_strings_updated",
		TargetID:   scope.ID,
		TargetKind: "project",
		Payload:    map[string]any{"projectId": scope.ID, "created": 0, "updated": cleared, "itemCount": len(keyIDs)},
	})
}
