package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Workflows are the sequences of steps that content in your project should go through
// (e.g. pre-translation, translation, proofreading). You can use a default template or
// create the one that works best for you and assign it to the needed projects.
//
// Use API to get the list of workflow templates available in your organization and to check
// the details of a specific template.
//
// Crowdin API docs: https://developer.crowdin.com/enterprise/api/v2/#tag/Workflows
type WorkflowsService struct {
	client *Client
}

// ListSteps returns a list of workflow steps available in the project.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.projects.workflow-steps.getMany
func (s *WorkflowsService) ListSteps(ctx context.Context, projectID string) ([]*model.WorkflowStep, *Response, error) {
	res := new(model.WorkflowStepsResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%s/workflow-steps", projectID), nil, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.WorkflowStep, 0, len(res.Data))
	for _, step := range res.Data {
		list = append(list, step.Data)
	}

	return list, resp, nil
}

// ListStepStrings returns a list of strings on	the workflow step.
//
// https://support.crowdin.com/developer/enterprise/api/v2/#tag/Workflows/operation/api.projects.workflow-steps.strings.getMany
func (s *WorkflowsService) ListStepStrings(ctx context.Context, projectID, stepID int, opts *model.WorkflowStepStringsListOptions) (
	[]*model.SourceString, *Response, error,
) {
	res := new(model.SourceStringsListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/workflow-steps/%d/strings", projectID, stepID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.SourceString, 0, len(res.Data))
	for _, str := range res.Data {
		list = append(list, str.Data)
	}

	return list, resp, nil
}

// GetStep returns a specific workflow step.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.projects.workflow-steps.get
func (s *WorkflowsService) GetStep(ctx context.Context, projectID, stepID int) (*model.WorkflowStep, *Response, error) {
	res := new(model.WorkflowStepResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/workflow-steps/%d", projectID, stepID), nil, res)

	return res.Data, resp, err
}

// ListTemplates returns a list of workflow templates available in the organization.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.workflow-templates.get
func (s *WorkflowsService) ListTemplates(ctx context.Context, opts *model.WorkflowTemplatesListOptions) (
	[]*model.WorkflowTemplate, *Response, error,
) {
	res := new(model.WorkflowTemplatesListResponse)
	resp, err := s.client.Get(ctx, "/api/v2/workflow-templates", opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.WorkflowTemplate, 0, len(res.Data))
	for _, template := range res.Data {
		list = append(list, template.Data)
	}

	return list, resp, nil
}

// GetTemplate returns a specific workflow template.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.workflow-templates.get
func (s *WorkflowsService) GetTemplate(ctx context.Context, templateID int) (*model.WorkflowTemplate, *Response, error) {
	res := new(model.WorkflowTemplateResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/workflow-templates/%d", templateID), nil, res)

	return res.Data, resp, err
}
