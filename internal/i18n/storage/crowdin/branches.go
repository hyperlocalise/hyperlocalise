package crowdin

import (
	"context"
	"fmt"
	"strings"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Branch is a Crowdin project branch.
type Branch struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// ListBranches returns every branch in the project, paginated.
func (c *HTTPClient) ListBranches(ctx context.Context, projectID string) ([]Branch, error) {
	if c == nil || c.client == nil {
		return nil, fmt.Errorf("crowdin branch list: client is nil")
	}
	projectInt, err := parseProjectID(projectID)
	if err != nil {
		return nil, fmt.Errorf("crowdin branch list: %w", err)
	}

	out := make([]Branch, 0)
	offset := 0
	for {
		branches, _, err := c.client.Branches.List(ctx, projectInt, &model.BranchesListOptions{
			ListOptions: model.ListOptions{
				Limit:  pageLimit,
				Offset: offset,
			},
		})
		if err != nil {
			return nil, fmt.Errorf("list crowdin branches: %w", err)
		}
		for _, item := range branches {
			if item == nil {
				continue
			}
			out = append(out, Branch{ID: item.ID, Name: item.Name})
		}
		if len(branches) < pageLimit {
			break
		}
		offset += pageLimit
	}
	return out, nil
}

// AddBranch creates a Crowdin project branch by name.
func (c *HTTPClient) AddBranch(ctx context.Context, projectID, name string) (Branch, error) {
	if c == nil || c.client == nil {
		return Branch{}, fmt.Errorf("crowdin branch add: client is nil")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return Branch{}, fmt.Errorf("crowdin branch add: name is required")
	}
	projectInt, err := parseProjectID(projectID)
	if err != nil {
		return Branch{}, fmt.Errorf("crowdin branch add: %w", err)
	}
	created, _, err := c.client.Branches.Add(ctx, projectInt, &model.BranchesAddRequest{Name: name})
	if err != nil {
		return Branch{}, fmt.Errorf("add crowdin branch: %w", err)
	}
	if created == nil {
		return Branch{}, fmt.Errorf("add crowdin branch: empty response")
	}
	return Branch{ID: created.ID, Name: created.Name}, nil
}
