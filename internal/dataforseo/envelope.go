package dataforseo

import (
	"encoding/json"
)

// APICallCost captures provider billing metadata for a single DataForSEO task.
type APICallCost struct {
	Path    []string `json:"path"`
	CostUSD float64  `json:"costUsd"`
}

// APIResponse is the top-level DataForSEO response envelope.
type APIResponse struct {
	StatusCode    int     `json:"status_code"`
	StatusMessage string  `json:"status_message"`
	Tasks         []*Task `json:"tasks"`
}

// TaskResult is the first-level result object inside a task.
type TaskResult map[string]json.RawMessage

// Task is a single DataForSEO task result.
type Task struct {
	ID            string          `json:"id"`
	StatusCode    int             `json:"status_code"`
	StatusMessage string          `json:"status_message"`
	Path          []string        `json:"path"`
	Cost          float64         `json:"cost"`
	ResultCount   *int            `json:"result_count"`
	Data          json.RawMessage `json:"data"`
	Result        []TaskResult    `json:"result"`
}

// TaskResponse pairs parsed task data with billing metadata.
type TaskResponse[T any] struct {
	Data    T
	Billing APICallCost
}

type assertTaskOptions struct {
	okTaskStatusCode      int
	treatNoResultsAsEmpty bool
}

func buildTaskBilling(task *Task) (APICallCost, error) {
	if task == nil || len(task.Path) == 0 {
		return APICallCost{}, newError(
			ErrorCodeInvalidResponse,
			"DataForSEO task is missing billing metadata (path/cost)",
			"",
			0,
		)
	}
	return APICallCost{
		Path:    append([]string(nil), task.Path...),
		CostUSD: task.Cost,
	}, nil
}

func assertTask(task *Task, path string, opts assertTaskOptions) (*Task, error) {
	if task == nil {
		return nil, newError(ErrorCodeInvalidResponse, "DataForSEO response missing task", path, 0)
	}

	okStatus := opts.okTaskStatusCode
	if okStatus == 0 {
		okStatus = 20000
	}

	if task.StatusCode != okStatus {
		if opts.treatNoResultsAsEmpty && IsNoResultsTask(task) {
			return task, nil
		}

		message := task.StatusMessage
		if message == "" {
			message = "DataForSEO task failed"
		}

		billing, billingErr := buildTaskBilling(task)
		if billingErr == nil && task.Cost > 0 {
			return nil, &Error{
				Code:       ErrorCodeTaskFailed,
				Message:    message,
				StatusCode: task.StatusCode,
				Path:       path,
				Billing:    &billing,
			}
		}

		return nil, newError(ErrorCodeTaskFailed, message, path, task.StatusCode)
	}

	return task, nil
}

func assertResponse(response *APIResponse, path string, opts assertTaskOptions) (*Task, error) {
	if response == nil {
		return nil, newError(ErrorCodeInvalidResponse, "DataForSEO returned an empty response", path, 0)
	}
	if response.StatusCode != 20000 {
		message := response.StatusMessage
		if message == "" {
			message = "DataForSEO request failed"
		}
		return nil, newError(ErrorCodeTaskFailed, message, path, response.StatusCode)
	}
	if len(response.Tasks) == 0 {
		return nil, newError(ErrorCodeInvalidResponse, "DataForSEO response missing task", path, 0)
	}
	return assertTask(response.Tasks[0], path, opts)
}

func firstResultItems(task *Task) json.RawMessage {
	if task == nil || len(task.Result) == 0 {
		return nil
	}
	return task.Result[0]["items"]
}

func firstResultTotalCount(task *Task) *int {
	if task == nil || len(task.Result) == 0 {
		return nil
	}
	raw := task.Result[0]["total_count"]
	if len(raw) == 0 {
		return nil
	}
	var totalCount int
	if err := json.Unmarshal(raw, &totalCount); err != nil {
		return nil
	}
	return &totalCount
}

func firstResultTotal(task *Task) json.RawMessage {
	if task == nil || len(task.Result) == 0 {
		return nil
	}
	return task.Result[0]["total"]
}

func firstResultObject(task *Task) json.RawMessage {
	if task == nil || len(task.Result) == 0 {
		return nil
	}
	raw, err := json.Marshal(task.Result[0])
	if err != nil {
		return nil
	}
	return raw
}

func decodeItems[T any](items json.RawMessage) (T, error) {
	var out T
	if len(items) == 0 {
		return out, nil
	}
	if err := json.Unmarshal(items, &out); err != nil {
		return out, newError(
			ErrorCodeInvalidResponse,
			"DataForSEO returned an invalid items payload",
			"",
			0,
		)
	}
	return out, nil
}

func decodeTotal[T any](total json.RawMessage) (T, error) {
	var out T
	if len(total) == 0 {
		return out, nil
	}
	if err := json.Unmarshal(total, &out); err != nil {
		return out, newError(
			ErrorCodeInvalidResponse,
			"DataForSEO returned an invalid total payload",
			"",
			0,
		)
	}
	return out, nil
}

func taskResponseFromItems[T any](task *Task) (TaskResponse[T], error) {
	billing, err := buildTaskBilling(task)
	if err != nil {
		return TaskResponse[T]{}, err
	}
	data, err := decodeItems[T](firstResultItems(task))
	if err != nil {
		return TaskResponse[T]{}, err
	}
	return TaskResponse[T]{Data: data, Billing: billing}, nil
}

func taskResponseFromTotal[T any](task *Task) (TaskResponse[T], error) {
	billing, err := buildTaskBilling(task)
	if err != nil {
		return TaskResponse[T]{}, err
	}
	data, err := decodeTotal[T](firstResultTotal(task))
	if err != nil {
		return TaskResponse[T]{}, err
	}
	return TaskResponse[T]{Data: data, Billing: billing}, nil
}

func taskResponseFromFirstResult[T any](task *Task) (TaskResponse[T], error) {
	billing, err := buildTaskBilling(task)
	if err != nil {
		return TaskResponse[T]{}, err
	}
	data, err := decodeItems[T](firstResultObject(task))
	if err != nil {
		return TaskResponse[T]{}, err
	}
	return TaskResponse[T]{Data: data, Billing: billing}, nil
}
