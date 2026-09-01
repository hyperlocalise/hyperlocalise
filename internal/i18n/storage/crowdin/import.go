package crowdin

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

var (
	importPollInterval = time.Second
	importPollTimeout  = 5 * time.Minute
)

// ImportResult summarizes an asynchronous Crowdin import.
type ImportResult struct {
	Identifier string `json:"identifier"`
	Status     string `json:"status"`
	Progress   int    `json:"progress"`
}

// ImportTranslationMemoryFile uploads a TMX file into a Crowdin translation memory.
func (c *HTTPClient) ImportTranslationMemoryFile(ctx context.Context, tmID int, localPath string) (ImportResult, error) {
	if c == nil || c.client == nil {
		return ImportResult{}, fmt.Errorf("crowdin translation memory upload: client is nil")
	}
	if tmID <= 0 {
		return ImportResult{}, fmt.Errorf("crowdin translation memory upload: translation memory id must be positive")
	}
	if err := requireImportExtension(localPath, ".tmx"); err != nil {
		return ImportResult{}, fmt.Errorf("crowdin translation memory upload: %w", err)
	}
	storageID, err := c.uploadStorage(ctx, localPath)
	if err != nil {
		return ImportResult{}, fmt.Errorf("crowdin translation memory upload: %w", err)
	}
	started, _, err := c.client.TranslationMemory.ImportTM(ctx, tmID, &model.TranslationMemoryImportRequest{
		StorageID: storageID,
	})
	if err != nil {
		return ImportResult{}, fmt.Errorf("import translation memory: %w", err)
	}
	if started == nil || strings.TrimSpace(started.Identifier) == "" {
		return ImportResult{}, fmt.Errorf("import translation memory: empty import identifier")
	}
	return c.pollImport(ctx, started.Identifier, started.Status, started.Progress, func(ctx context.Context) (string, string, int, error) {
		status, _, err := c.client.TranslationMemory.CheckTMImportStatus(ctx, tmID, started.Identifier)
		if err != nil {
			return "", "", 0, err
		}
		if status == nil {
			return "", "", 0, fmt.Errorf("empty import status")
		}
		return status.Identifier, status.Status, status.Progress, nil
	})
}

// ImportGlossaryFile uploads a TBX file into a Crowdin glossary.
func (c *HTTPClient) ImportGlossaryFile(ctx context.Context, glossaryID int, localPath string) (ImportResult, error) {
	if c == nil || c.client == nil {
		return ImportResult{}, fmt.Errorf("crowdin glossary upload: client is nil")
	}
	if glossaryID <= 0 {
		return ImportResult{}, fmt.Errorf("crowdin glossary upload: glossary id must be positive")
	}
	if err := requireImportExtension(localPath, ".tbx"); err != nil {
		return ImportResult{}, fmt.Errorf("crowdin glossary upload: %w", err)
	}
	storageID, err := c.uploadStorage(ctx, localPath)
	if err != nil {
		return ImportResult{}, fmt.Errorf("crowdin glossary upload: %w", err)
	}
	started, _, err := c.client.Glossaries.ImportGlossary(ctx, glossaryID, &model.GlossaryImportRequest{
		StorageID: storageID,
	})
	if err != nil {
		return ImportResult{}, fmt.Errorf("import glossary: %w", err)
	}
	if started == nil || strings.TrimSpace(started.Identifier) == "" {
		return ImportResult{}, fmt.Errorf("import glossary: empty import identifier")
	}
	return c.pollImport(ctx, started.Identifier, started.Status, started.Progress, func(ctx context.Context) (string, string, int, error) {
		status, _, err := c.client.Glossaries.CheckGlossaryImportStatus(ctx, glossaryID, started.Identifier)
		if err != nil {
			return "", "", 0, err
		}
		if status == nil {
			return "", "", 0, fmt.Errorf("empty import status")
		}
		return status.Identifier, status.Status, status.Progress, nil
	})
}

func requireImportExtension(localPath, wantExt string) error {
	path := strings.TrimSpace(localPath)
	if path == "" {
		return fmt.Errorf("input path is required")
	}
	if !strings.EqualFold(filepath.Ext(path), wantExt) {
		return fmt.Errorf("input file must be %s", wantExt)
	}
	return nil
}

func (c *HTTPClient) pollImport(
	ctx context.Context,
	identifier, status string,
	progress int,
	check func(context.Context) (string, string, int, error),
) (ImportResult, error) {
	return c.pollAsyncStatus(ctx, identifier, status, progress, importPollTimeout, "import", check)
}

func (c *HTTPClient) pollAsyncStatus(
	ctx context.Context,
	identifier, status string,
	progress int,
	timeout time.Duration,
	op string,
	check func(context.Context) (string, string, int, error),
) (ImportResult, error) {
	deadline := time.Now().Add(timeout)
	for {
		normalized := strings.ToLower(strings.TrimSpace(status))
		switch normalized {
		case "failed", "canceled", "cancelled", "error":
			return ImportResult{}, fmt.Errorf("%s %s", op, normalized)
		}
		if importStatusFinished(status) {
			return ImportResult{Identifier: identifier, Status: status, Progress: progress}, nil
		}
		if time.Now().After(deadline) {
			return ImportResult{}, fmt.Errorf("%s timed out with status %s", op, status)
		}
		if err := waitForRetry(ctx, importPollInterval); err != nil {
			return ImportResult{}, err
		}
		nextID, nextStatus, nextProgress, err := check(ctx)
		if err != nil {
			return ImportResult{}, fmt.Errorf("check %s status: %w", op, err)
		}
		if strings.TrimSpace(nextID) != "" {
			identifier = nextID
		}
		status = nextStatus
		progress = nextProgress
	}
}

func importStatusFinished(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "finished", "completed", "done":
		return true
	default:
		return false
	}
}

func importStatusError(status string) error {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "failed", "canceled", "cancelled", "error":
		return fmt.Errorf("import %s", strings.ToLower(strings.TrimSpace(status)))
	default:
		return nil
	}
}
