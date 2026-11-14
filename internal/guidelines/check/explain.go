package check

import (
	"context"
	"fmt"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
)

const explainCacheKeyPrefix = "go-svc:guideline-explain:v1:"

// ExplainRequest is a check plus optional passage IDs to send to Luna.
type ExplainRequest struct {
	Request
	PassageIDs []string
}

// Explain asks the reasoning model for grounded findings.
func (c *Checker) Explain(ctx context.Context, scope guidelines.Scope, req ExplainRequest) (Result, error) {
	return c.ExplainBeforeModel(ctx, scope, req, nil)
}

// ExplainBeforeModel is Explain with a hook that runs only when the model is about to be called.
func (c *Checker) ExplainBeforeModel(ctx context.Context, scope guidelines.Scope, req ExplainRequest, beforeModel func(context.Context) error) (Result, error) {
	normalized, err := Normalize(req.Request)
	if err != nil {
		return Result{}, err
	}
	req.Request = normalized
	retrieved, err := c.retriever.Retrieve(ctx, scope, retrievalQuery(req.Request), retrieveLimit)
	if err != nil {
		return Result{}, fmt.Errorf("retrieve guidelines: %w", err)
	}
	result := Result{Findings: []Finding{}, Passages: []Passage{}, SearchAvailable: retrieved.SearchAvailable}
	if c.explainer != nil {
		result.Model = c.explainer.Name()
	}
	passages, _, err := promptPassages(retrieved, maxPassageRunes)
	if err != nil {
		return Result{}, err
	}
	passages = filterPassages(passages, req.PassageIDs)
	if len(passages) == 0 {
		return result, nil
	}
	if c.explainer == nil {
		return Result{}, fmt.Errorf("guideline explain model is not configured")
	}
	user := userPrompt(req.Request, passages)
	if raw, ok := c.cachedOutput(ctx, scope, explainCacheKey(scope.OrganizationID, c.explainer.Name(), user)); ok {
		findings, cited, groundErr := groundFindings(req.Request, passages, raw)
		if groundErr == nil {
			result.Findings, result.Passages, result.Cached = findings, cited, true
			return result, nil
		}
	}
	if beforeModel != nil {
		if err := beforeModel(ctx); err != nil {
			return Result{}, err
		}
	}
	result.ModelInvoked = true
	completion, err := c.explainer.Complete(ctx, systemPrompt, user)
	if err != nil {
		return Result{}, fmt.Errorf("guideline explain model: %w", err)
	}
	result.InputTokens, result.OutputTokens = completion.InputTokens, completion.OutputTokens
	result.Findings, result.Passages, err = groundFindings(req.Request, passages, completion.Text)
	if err != nil {
		return Result{}, err
	}
	c.storeOutput(ctx, scope, explainCacheKey(scope.OrganizationID, c.explainer.Name(), user), completion.Text)
	return result, nil
}

func filterPassages(passages []Passage, passageIDs []string) []Passage {
	if len(passageIDs) == 0 {
		return passages
	}
	wanted := make(map[string]bool, len(passageIDs))
	for _, id := range passageIDs {
		id = strings.TrimSpace(id)
		if id != "" {
			wanted[id] = true
		}
	}
	if len(wanted) == 0 {
		return passages
	}
	filtered := make([]Passage, 0, len(passages))
	for _, passage := range passages {
		if wanted[passage.ID] {
			filtered = append(filtered, passage)
		}
	}
	return filtered
}

func explainCacheKey(organizationID, modelName, user string) string {
	return explainCacheKeyPrefix + organizationID + ":" + sha256Sum(modelName+"\x00"+systemPrompt+"\x00"+user)
}
