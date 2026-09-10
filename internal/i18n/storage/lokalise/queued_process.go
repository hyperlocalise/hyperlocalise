package lokalise

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var lokaliseQueuedProcessPollInterval = time.Second

// QueuedProcessWaitInput polls one Lokalise queued file-import process.
type QueuedProcessWaitInput struct {
	ProjectID string
	ProcessID string
	Branch    string
	Interval  time.Duration
}

type queuedProcessResponse struct {
	Process struct {
		ID      string `json:"process_id"`
		Type    string `json:"type"`
		Status  string `json:"status"`
		Message string `json:"message"`
	} `json:"process"`
}

func normalizeQueuedProcessStatus(status string) string {
	return strings.ToLower(strings.TrimSpace(status))
}

func isQueuedProcessSuccessStatus(status string) bool {
	return normalizeQueuedProcessStatus(status) == "finished"
}

func isQueuedProcessFailedStatus(status string) bool {
	switch normalizeQueuedProcessStatus(status) {
	case "failed", "cancelled":
		return true
	default:
		return false
	}
}

func isQueuedProcessInProgressStatus(status string) bool {
	switch normalizeQueuedProcessStatus(status) {
	case "queued", "pre_processing", "running", "post_processing":
		return true
	default:
		return false
	}
}

// GetQueuedProcess retrieves GET /projects/{id}/processes/{process_id}.
func (c *HTTPClient) GetQueuedProcess(ctx context.Context, in QueuedProcessWaitInput) (SourceUploadResult, error) {
	if c == nil || c.httpClient == nil {
		return SourceUploadResult{}, fmt.Errorf("lokalise upload poll: client is nil")
	}
	projectID := strings.TrimSpace(in.ProjectID)
	processID := strings.TrimSpace(in.ProcessID)
	if projectID == "" {
		return SourceUploadResult{}, fmt.Errorf("lokalise upload poll: project id is required")
	}
	if processID == "" {
		return SourceUploadResult{}, fmt.Errorf("lokalise upload poll: process id is required")
	}
	if strings.TrimSpace(c.apiToken) == "" {
		return SourceUploadResult{}, fmt.Errorf("lokalise upload poll: api token is required")
	}

	endpoint := c.baseURL + "/projects/" + lokaliseProjectPathSegment(projectID, in.Branch) + "/processes/" + url.PathEscape(processID)
	var resp queuedProcessResponse
	if _, err := c.doLokaliseJSON(ctx, http.MethodGet, endpoint, &resp); err != nil {
		return SourceUploadResult{ProcessID: processID}, fmt.Errorf("lokalise upload poll: %w", err)
	}
	id := strings.TrimSpace(resp.Process.ID)
	if id == "" {
		id = processID
	}
	return SourceUploadResult{
		ProcessID: id,
		Type:      strings.TrimSpace(resp.Process.Type),
		Status:    strings.TrimSpace(resp.Process.Status),
		Message:   strings.TrimSpace(resp.Process.Message),
	}, nil
}

// WaitForQueuedProcess polls until the process finishes, fails, or the context deadline is reached.
// Empty details with status=finished is success. Unknown statuses fail closed.
func (c *HTTPClient) WaitForQueuedProcess(ctx context.Context, in QueuedProcessWaitInput) (SourceUploadResult, error) {
	interval := in.Interval
	if interval <= 0 {
		interval = lokaliseQueuedProcessPollInterval
	}
	if interval <= 0 {
		interval = time.Second
	}

	result, err := c.GetQueuedProcess(ctx, in)
	if err != nil {
		return queuedProcessResultOnError(in.ProcessID, result, err, ctx)
	}
	if done, err := queuedProcessOutcome(result); done {
		return result, err
	}

	for {
		if err := sleepWithContext(ctx, interval); err != nil {
			return result, queuedProcessTimeoutError(result, err)
		}
		next, err := c.GetQueuedProcess(ctx, in)
		if err != nil {
			return queuedProcessResultOnError(in.ProcessID, result, err, ctx)
		}
		result = next
		if done, err := queuedProcessOutcome(result); done {
			return result, err
		}
	}
}

func queuedProcessOutcome(result SourceUploadResult) (bool, error) {
	if isQueuedProcessSuccessStatus(result.Status) {
		return true, nil
	}
	if isQueuedProcessFailedStatus(result.Status) {
		if message := strings.TrimSpace(result.Message); message != "" {
			return true, fmt.Errorf("lokalise upload %s failed: status=%s: %s", result.ProcessID, result.Status, message)
		}
		return true, fmt.Errorf("lokalise upload %s failed: status=%s", result.ProcessID, result.Status)
	}
	if isQueuedProcessInProgressStatus(result.Status) {
		return false, nil
	}
	return true, fmt.Errorf("lokalise upload %s is in unknown status %q", result.ProcessID, result.Status)
}

func queuedProcessResultOnError(processID string, last SourceUploadResult, err error, ctx context.Context) (SourceUploadResult, error) {
	if last.ProcessID == "" {
		last.ProcessID = strings.TrimSpace(processID)
	}
	if ctx.Err() != nil {
		if last.Status != "" {
			return last, queuedProcessTimeoutError(last, ctx.Err())
		}
		return last, fmt.Errorf("lokalise upload %s wait timed out: %w", last.ProcessID, ctx.Err())
	}
	return last, err
}

func queuedProcessTimeoutError(result SourceUploadResult, err error) error {
	return fmt.Errorf("lokalise upload %s wait timed out: status=%s: %w", result.ProcessID, result.Status, err)
}

func sleepWithContext(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
