package dataforseo

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

const (
	pathOrganicLiveAdvanced = "/v3/serp/google/organic/live/advanced"
	pathOrganicTaskPost     = "/v3/serp/google/organic/task_post"
	pathOrganicTaskGetFmt   = "/v3/serp/google/organic/task_get/advanced/%s"
	maxTasksPerPost         = 100
)

// LiveSerpInput fetches a live organic SERP snapshot.
type LiveSerpInput struct {
	Keyword  string
	Market   MarketScope
	Device   string
	Depth    int
}

// RankCheckSerpInput performs a live rank check for one keyword.
type RankCheckSerpInput struct {
	KeywordID    string
	Keyword      string
	TargetDomain string
	Market       MarketScope
	LocationName string
	Device       string
	Depth        int
}

// PostRankCheckTasksInput queues rank-check tasks for later collection.
type PostRankCheckTasksInput struct {
	Tasks        []RankCheckTaskInput
	TargetDomain string
	Market       MarketScope
	LocationName string
	Depth        int
}

// RankCheckTaskResultInput collects one queued rank-check task.
type RankCheckTaskResultInput struct {
	TaskID       string
	KeywordID    string
	Keyword      string
	TargetDomain string
}

func (s *SERP) LiveAdvanced(
	ctx context.Context,
	input LiveSerpInput,
) (TaskResponse[[]SerpItem], error) {
	keyword := normalizeKeyword(input.Keyword)
	if keyword == "" {
		return TaskResponse[[]SerpItem]{}, newError(
			ErrorCodeValidation,
			"keyword is required",
			pathOrganicLiveAdvanced,
			0,
		)
	}

	device := defaultDevice(input.Device)
	task, err := s.client.post(ctx, pathOrganicLiveAdvanced, []map[string]any{{
		"keyword":        keyword,
		"location_code":  input.Market.LocationCode,
		"language_code":  input.Market.LanguageCode,
		"device":         device,
		"os":             serpOS(device),
		"depth":          clampSerpDepth(input.Depth),
	}}, postOptions{})
	if err != nil {
		return TaskResponse[[]SerpItem]{}, err
	}
	return taskResponseFromItems[[]SerpItem](task)
}

func (s *SERP) RankCheck(
	ctx context.Context,
	input RankCheckSerpInput,
) (TaskResponse[RankCheckResult], error) {
	keyword := normalizeKeyword(input.Keyword)
	targetDomain := normalizeKeyword(input.TargetDomain)
	if keyword == "" || targetDomain == "" {
		return TaskResponse[RankCheckResult]{}, newError(
			ErrorCodeValidation,
			"keyword and targetDomain are required",
			pathOrganicLiveAdvanced,
			0,
		)
	}

	device := defaultDevice(input.Device)
	payload := map[string]any{
		"keyword":       keyword,
		"language_code": input.Market.LanguageCode,
		"device":        device,
		"os":            serpOS(device),
		"depth":         clampSerpDepth(input.Depth),
	}
	if strings.TrimSpace(input.LocationName) != "" {
		payload["location_name"] = strings.TrimSpace(input.LocationName)
	} else {
		payload["location_code"] = input.Market.LocationCode
	}
	for key, value := range stopCrawlOnTarget(targetDomain) {
		payload[key] = value
	}

	task, err := s.client.post(ctx, pathOrganicLiveAdvanced, []map[string]any{payload}, postOptions{
		treatNoResultsAsEmpty: true,
	})
	if err != nil {
		return TaskResponse[RankCheckResult]{}, err
	}

	items, err := decodeItems[[]SerpItem](firstResultItems(task))
	if err != nil {
		return TaskResponse[RankCheckResult]{}, err
	}
	billing, err := buildTaskBilling(task)
	if err != nil {
		return TaskResponse[RankCheckResult]{}, err
	}
	return TaskResponse[RankCheckResult]{
		Data: buildRankCheckResult(RankCheckSerpInput{
			KeywordID:    input.KeywordID,
			Keyword:      keyword,
			TargetDomain: targetDomain,
		}, items),
		Billing: billing,
	}, nil
}

func (s *SERP) PostRankCheckTasks(
	ctx context.Context,
	input PostRankCheckTasksInput,
) (TaskResponse[[]PostedRankCheckTask], error) {
	if len(input.Tasks) == 0 || len(input.Tasks) > maxTasksPerPost {
		return TaskResponse[[]PostedRankCheckTask]{}, newError(
			ErrorCodeValidation,
			fmt.Sprintf("task_post accepts 1-%d tasks", maxTasksPerPost),
			pathOrganicTaskPost,
			0,
		)
	}

	targetDomain := normalizeKeyword(input.TargetDomain)
	if targetDomain == "" {
		return TaskResponse[[]PostedRankCheckTask]{}, newError(
			ErrorCodeValidation,
			"targetDomain is required",
			pathOrganicTaskPost,
			0,
		)
	}

	payload := make([]map[string]any, 0, len(input.Tasks))
	for _, taskInput := range input.Tasks {
		device := defaultDevice(taskInput.Device)
		row := map[string]any{
			"keyword":       normalizeKeyword(taskInput.Keyword),
			"language_code": input.Market.LanguageCode,
			"device":        device,
			"os":            serpOS(device),
			"depth":         clampSerpDepth(input.Depth),
			"tag":           fmt.Sprintf("%s:%s", taskInput.KeywordID, device),
		}
		if strings.TrimSpace(input.LocationName) != "" {
			row["location_name"] = strings.TrimSpace(input.LocationName)
		} else {
			row["location_code"] = input.Market.LocationCode
		}
		for key, value := range stopCrawlOnTarget(targetDomain) {
			row[key] = value
		}
		payload = append(payload, row)
	}

	response, err := s.client.postResponse(ctx, pathOrganicTaskPost, payload, postOptions{
		okTaskStatusCode:      20000,
		allowNonRetryablePost: true,
	})
	if err != nil {
		return TaskResponse[[]PostedRankCheckTask]{}, err
	}
	if response.StatusCode != 20000 {
		message := response.StatusMessage
		if message == "" {
			message = "DataForSEO task_post failed"
		}
		return TaskResponse[[]PostedRankCheckTask]{}, newError(
			ErrorCodeTaskFailed,
			message,
			pathOrganicTaskPost,
			response.StatusCode,
		)
	}

	byTag := make(map[string]RankCheckTaskInput, len(input.Tasks))
	for _, taskInput := range input.Tasks {
		device := defaultDevice(taskInput.Device)
		byTag[fmt.Sprintf("%s:%s", taskInput.KeywordID, device)] = taskInput
	}

	posted := make([]PostedRankCheckTask, 0, len(response.Tasks))
	var costUSD float64
	for _, entry := range response.Tasks {
		if entry == nil {
			continue
		}
		costUSD += entry.Cost
		if entry.StatusCode != 20100 || entry.ID == "" {
			continue
		}
		tag := parseTaskTag(entry.Data)
		taskInput, ok := byTag[tag]
		if !ok {
			continue
		}
		posted = append(posted, PostedRankCheckTask{
			RankCheckTaskInput: taskInput,
			TaskID:             entry.ID,
		})
	}

	return TaskResponse[[]PostedRankCheckTask]{
		Data: posted,
		Billing: APICallCost{
			Path:    []string{"v3", "serp", "google", "organic", "task_post"},
			CostUSD: costUSD,
		},
	}, nil
}

func (s *SERP) RankCheckTaskResult(
	ctx context.Context,
	input RankCheckTaskResultInput,
) (RankCheckTaskOutcome, error) {
	if strings.TrimSpace(input.TaskID) == "" {
		return RankCheckTaskOutcome{}, newError(
			ErrorCodeValidation,
			"taskId is required",
			pathOrganicTaskGetFmt,
			0,
		)
	}

	path := fmt.Sprintf(pathOrganicTaskGetFmt, input.TaskID)
	response, err := s.client.getResponse(ctx, path)
	if err != nil {
		return RankCheckTaskOutcome{}, err
	}
	if response.StatusCode != 20000 || len(response.Tasks) == 0 {
		message := response.StatusMessage
		if message == "" {
			message = "DataForSEO task_get failed"
		}
		return RankCheckTaskOutcome{}, newError(ErrorCodeTaskFailed, message, path, response.StatusCode)
	}

	task := response.Tasks[0]
	if IsTaskInProgress(task) {
		return RankCheckTaskOutcome{Status: "pending"}, nil
	}
	if task.StatusCode != 20000 {
		if !IsNoResultsTask(task) {
			message := task.StatusMessage
			if message == "" {
				message = fmt.Sprintf("DataForSEO task failed (%d)", task.StatusCode)
			}
			return RankCheckTaskOutcome{Status: "failed", Message: message}, nil
		}
		result := buildRankCheckResult(RankCheckSerpInput{
			KeywordID:    input.KeywordID,
			Keyword:      input.Keyword,
			TargetDomain: input.TargetDomain,
		}, nil)
		return RankCheckTaskOutcome{Status: "completed", Result: &result}, nil
	}

	items, err := decodeItems[[]SerpItem](firstResultItems(task))
	if err != nil {
		return RankCheckTaskOutcome{}, err
	}
	result := buildRankCheckResult(RankCheckSerpInput{
		KeywordID:    input.KeywordID,
		Keyword:      input.Keyword,
		TargetDomain: input.TargetDomain,
	}, items)
	return RankCheckTaskOutcome{Status: "completed", Result: &result}, nil
}

func buildRankCheckResult(input RankCheckSerpInput, items []SerpItem) RankCheckResult {
	target := strings.ToLower(strings.TrimSpace(input.TargetDomain))
	var match SerpItem
	for _, item := range items {
		itemType, _ := item["type"].(string)
		domainValue, _ := item["domain"].(string)
		domain := strings.ToLower(strings.TrimSpace(domainValue))
		if itemType != "organic" || domain == "" {
			continue
		}
		if domain == target || strings.HasSuffix(domain, "."+target) {
			match = item
			break
		}
	}

	features := make([]string, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		itemType, _ := item["type"].(string)
		if itemType == "" {
			continue
		}
		if _, ok := seen[itemType]; ok {
			continue
		}
		seen[itemType] = struct{}{}
		features = append(features, itemType)
	}

	result := RankCheckResult{
		KeywordID:    input.KeywordID,
		Keyword:      input.Keyword,
		SerpFeatures: features,
	}
	if match == nil {
		return result
	}

	if position := intFromAny(match["rank_group"]); position != nil {
		result.Position = position
	} else if position := intFromAny(match["rank_absolute"]); position != nil {
		result.Position = position
	}
	if urlValue, ok := match["url"].(string); ok {
		result.URL = urlValue
	}
	return result
}

func stopCrawlOnTarget(targetDomain string) map[string]any {
	return map[string]any{
		"stop_crawl_on_match": []map[string]any{{
			"match_value": targetDomain,
			"match_type":  "with_subdomains",
		}},
		"find_targets_in": []string{"organic"},
	}
}

func defaultDevice(device string) string {
	if strings.TrimSpace(device) == "" {
		return "desktop"
	}
	return strings.TrimSpace(device)
}

func serpOS(device string) string {
	if device == "mobile" {
		return "android"
	}
	return "windows"
}

func intFromAny(value any) *int {
	switch typed := value.(type) {
	case int:
		return &typed
	case int32:
		converted := int(typed)
		return &converted
	case int64:
		converted := int(typed)
		return &converted
	case float64:
		converted := int(typed)
		return &converted
	default:
		return nil
	}
}

func parseTaskTag(data []byte) string {
	if len(data) == 0 {
		return ""
	}
	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		return ""
	}
	tag, _ := payload["tag"].(string)
	return tag
}
