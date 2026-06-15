package crowdin

import (
	"context"
	"fmt"
	"strings"
)

// DownloadSourceFileByID downloads one Crowdin source file by numeric file ID.
func DownloadSourceFileByID(ctx context.Context, cfg Config, fileID int) ([]byte, error) {
	if fileID <= 0 {
		return nil, fmt.Errorf("crowdin source download: file id must be positive")
	}
	if strings.TrimSpace(cfg.ProjectID) == "" {
		return nil, fmt.Errorf("crowdin source download: project id is required")
	}
	if strings.TrimSpace(cfg.APIToken) == "" {
		return nil, fmt.Errorf("crowdin source download: api token is required")
	}

	client, err := NewHTTPClient(cfg)
	if err != nil {
		return nil, err
	}
	return client.DownloadSourceFile(ctx, cfg.ProjectID, fileID)
}
