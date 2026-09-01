package crowdin

import (
	"context"
	"fmt"
	"strings"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// ListSourceStringsInput filters Crowdin source strings for CLI listing.
type ListSourceStringsInput struct {
	ProjectID string
	Branch    string
	FilePath  string
	Filter    string
}

// SourceStringRow is a source string shown by `crowdin string list`.
type SourceStringRow struct {
	ID         int    `json:"id"`
	Identifier string `json:"identifier"`
	Text       string `json:"text"`
	Context    string `json:"context,omitempty"`
	FileID     int    `json:"fileId,omitempty"`
	BranchID   int    `json:"branchId,omitempty"`
	CreatedAt  string `json:"createdAt,omitempty"`
	UpdatedAt  string `json:"updatedAt,omitempty"`
}

// ListProjectSourceStrings returns source strings, optionally scoped by branch, file path, or filter.
func (c *HTTPClient) ListProjectSourceStrings(ctx context.Context, in ListSourceStringsInput) ([]SourceStringRow, error) {
	if c == nil || c.client == nil {
		return nil, fmt.Errorf("crowdin string list: client is nil")
	}
	projectID, err := parseProjectID(in.ProjectID)
	if err != nil {
		return nil, fmt.Errorf("crowdin string list: %w", err)
	}

	opts := &model.SourceStringsListOptions{
		Filter: strings.TrimSpace(in.Filter),
	}
	filePath := strings.TrimSpace(in.FilePath)
	if filePath != "" {
		file, err := c.ResolveProjectFile(ctx, in.ProjectID, in.Branch, filePath)
		if err != nil {
			return nil, err
		}
		opts.FileID = file.ID
	} else if strings.TrimSpace(in.Branch) != "" {
		branchID, err := c.ResolveBranch(ctx, in.ProjectID, in.Branch)
		if err != nil {
			return nil, err
		}
		opts.BranchID = branchID
	}

	out := make([]SourceStringRow, 0)
	offset := 0
	for {
		pageOpts := *opts
		pageOpts.ListOptions = model.ListOptions{
			Limit:  pageLimit,
			Offset: offset,
		}
		stringsList, _, err := c.client.SourceStrings.List(ctx, projectID, &pageOpts)
		if err != nil {
			return nil, fmt.Errorf("list crowdin source strings: %w", err)
		}
		for _, src := range stringsList {
			if src == nil {
				continue
			}
			row := SourceStringRow{
				ID:         src.ID,
				Identifier: src.Identifier,
				Text:       src.Text,
				Context:    src.Context,
			}
			if src.FileID != nil {
				row.FileID = *src.FileID
			}
			if src.BranchID != nil {
				row.BranchID = *src.BranchID
			}
			if src.CreatedAt != nil {
				row.CreatedAt = *src.CreatedAt
			}
			if src.UpdatedAt != nil {
				row.UpdatedAt = *src.UpdatedAt
			}
			out = append(out, row)
		}
		if len(stringsList) < pageLimit {
			break
		}
		offset += pageLimit
	}
	return out, nil
}
