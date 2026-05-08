package model

import (
	"errors"
	"fmt"
	"net/url"
)

// StringComment represents a Crowdin string comment.
type StringComment struct {
	ID          int        `json:"id"`
	Text        string     `json:"text"`
	UserID      int        `json:"userId"`
	StringID    int        `json:"stringId"`
	User        *ShortUser `json:"user"`
	String      *String    `json:"string"`
	ProjectID   int        `json:"projectId"`
	LanguageID  string     `json:"languageId"`
	Type        string     `json:"type"`
	IssueType   string     `json:"issueType"`
	IssueStatus string     `json:"issueStatus"`
	ResolverID  int        `json:"resolverId"`
	Resolver    *ShortUser `json:"resolver"`
	ResolvedAt  string     `json:"resolvedAt"`
	CreatedAt   string     `json:"createdAt"`

	IsShared             *bool         `json:"isShared,omitempty"`
	SenderOrganization   *Organization `json:"senderOrganization,omitempty"`
	ResolverOrganization *Organization `json:"resolverOrganization,omitempty"`
}

type String struct {
	ID      int    `json:"id"`
	Text    string `json:"text"`
	Type    string `json:"type"`
	Context string `json:"context"`
	FileID  int    `json:"fileId"`
}

type Organization struct {
	ID     int    `json:"id"`
	Domain string `json:"domain"`
}

// StringCommentsResponse defines the structure of of the response when
// getting a single string comment.
type StringCommentsResponse struct {
	Data *StringComment `json:"data"`
}

// StringCommentsListResponse defines the structure of the response when
// getting a list of string comments.
type StringCommentsListResponse struct {
	Data []*StringCommentsResponse `json:"data"`
}

// StringCommentsListOptions specifies the optional parameters to the
// StringCommentsService.List method.
type StringCommentsListOptions struct {
	// Sort results by specified field.
	// Enum: id, text, type, createdAt, resolvedAt, issueStatus, issueType.
	// Example: orderBy=createdAt desc,text
	OrderBy string `json:"orderBy,omitempty"`
	// String Identifier.
	StringID int `json:"stringId,omitempty"`
	// Defines string comment type.
	// Enum: comment, issue.
	// Note: `type=comment` can't be used with `issueType` or `issueStatus`
	// in same request.
	Type string `json:"type,omitempty"`
	// Defines issue type. It can be one issue type or multiple issue types.
	// Enum: general_question, translation_mistake, context_request, source_mistake.
	// Example: issueType=general_question,translation_mistake
	IssueType []string `json:"issueType,omitempty"`
	// Defines issue resolution status.
	// Enum: resolved, unresolved.
	IssueStatus string `json:"issueStatus,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of the StringCommentsListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *StringCommentsListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if o.OrderBy != "" {
		v.Set("orderBy", o.OrderBy)
	}
	if o.StringID != 0 {
		v.Set("stringId", fmt.Sprintf("%d", o.StringID))
	}
	if o.Type != "" {
		v.Set("type", o.Type)
	}
	if o.IssueType != nil {
		v.Set("issueType", JoinSlice(o.IssueType))
	}
	if o.IssueStatus != "" {
		v.Set("issueStatus", o.IssueStatus)
	}

	return v, len(v) > 0
}

// StringCommentsAddRequest defines the structure of the request to add a
// new string comment.
type StringCommentsAddRequest struct {
	// Text of the comment.
	Text string `json:"text"`
	// String Identifier.
	StringID int `json:"stringId"`
	// Target Language Identifier.
	TargetLanguageID string `json:"targetLanguageId"`
	// Defines comment or issue.
	// Enum: comment, issue.
	Type string `json:"type"`
	// Defines issue type.
	// Enum: general_question, translation_mistake, context_request, source_mistake.
	// Default: general_question.
	IssueType string `json:"issueType,omitempty"`
	// Defines shared comment or issue.
	IsShared *bool `json:"isShared,omitempty"`
}

// Validate checks if the StringCommentsAddRequest is valid.
// It implements the crowdin.RequestValidator interface.
func (r *StringCommentsAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Text == "" {
		return errors.New("text is required")
	}
	if r.StringID == 0 {
		return errors.New("stringId is required")
	}
	if r.TargetLanguageID == "" {
		return errors.New("targetLanguageId is required")
	}
	if r.Type == "" {
		return errors.New("type is required")
	}

	return nil
}
