package model

import (
	"errors"
	"net/url"
)

// Team represents a team in the organization.
type Team struct {
	ID           int    `json:"id"`
	Name         string `json:"name"`
	TotalMembers int    `json:"totalMembers"`
	WebURL       string `json:"webUrl"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

// TeamResponse defines the structure of the response when
// getting a team.
type TeamResponse struct {
	Data *Team `json:"data"`
}

// TeamsListResponse defines the structure of the response when
// getting a list of teams.
type TeamsListResponse struct {
	Data []*TeamResponse `json:"data"`
}

// TeamsListOptions specifies the optional parameters to the
// TeamsService.List method.
type TeamsListOptions struct {
	// Search by name
	Search string `json:"search,omitempty"`
	// Filter by project identifier
	// It can be one project or a list of comma-separated ones
	ProjectIDs string `json:"projectIds,omitempty"`
	// Filter by role in project.
	// Enum: manager, developer, translator, proofreader, language_coordinator, member
	// Example: projectRoles=manager,developer,language_coordinator
	ProjectRoles string `json:"projectRoles,omitempty"`
	// Filter project languages
	// It can be one language or a list of comma-separated ones
	LanguageIDs string `json:"languageIds,omitempty"`
	// Filter by group identifier
	// It can be one group or a list of comma-separated ones
	GroupIDs string `json:"groupIds,omitempty"`
	// Sort teams by specified field.
	// Enum: id, name, createdAt, updatedAt. Default: id.
	OrderBy string `json:"orderBy,omitempty"`

	ListOptions
}

// Values returns the url.Values encoding of TeamsListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *TeamsListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if o.Search != "" {
		v.Add("search", o.Search)
	}

	if o.ProjectIDs != "" {
		v.Add("projectIds", o.ProjectIDs)
	}

	if o.ProjectRoles != "" {
		v.Add("projectRoles", o.ProjectRoles)
	}

	if o.LanguageIDs != "" {
		v.Add("languageIds", o.LanguageIDs)
	}

	if o.GroupIDs != "" {
		v.Add("groupIds", o.GroupIDs)
	}

	if o.OrderBy != "" {
		v.Add("orderBy", o.OrderBy)
	}

	return v, len(v) > 0
}

// TeamAddRequest defines the structure of the request when
// adding a new team.
type TeamAddRequest struct {
	Name string `json:"name"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *TeamAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Name == "" {
		return errors.New("name is required")
	}

	return nil
}

// TeamMember represents a team member in the organization.
type TeamMember struct {
	ID        int    `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	AvatarURL string `json:"avatarUrl"`
	AddedAt   string `json:"addedAt"`
}

// TeamMemberResponse defines the structure of the response when
// getting a team member.
type TeamMemberResponse struct {
	Data *TeamMember `json:"data"`
}

// TeamMembersListResponse defines the structure of the response when
// getting a list of team members.
type TeamMembersListResponse struct {
	Data []*TeamMemberResponse `json:"data"`
}

// TeamMemberAddRequest defines the structure of the request when
// adding a new team member.
type TeamMemberAddRequest struct {
	// Team user identifiers.
	// Note: You can invite up to 50 team members at a time.
	UserIDs []int `json:"userIds"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *TeamMemberAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if len(r.UserIDs) == 0 {
		return errors.New("userIds is required")
	}

	return nil
}

// TeamMemberAddResponse defines the structure of the response when
// adding a new team member.
type TeamMemberAddResponse struct {
	Skipped []*TeamMemberResponse `json:"skipped"`
	Added   []*TeamMemberResponse `json:"added"`
}

// ProjectTeam represents a team in the project.
type ProjectTeam struct {
	ID                          int               `json:"id"`
	HasManagerAccess            bool              `json:"hasManagerAccess"`
	HasDeveloperAccess          bool              `json:"hasDeveloperAccess"`
	HasAccessToAllWorkflowSteps bool              `json:"hasAccessToAllWorkflowSteps"`
	Permissions                 map[string]any    `json:"permissions"`
	Roles                       []*TranslatorRole `json:"roles"`
}

// ProjectTeamAddRequest defines the structure of the request when
// adding a team to the project.
type ProjectTeamAddRequest struct {
	// Team identifier.
	TeamID int `json:"teamId"`
	// Grand manager access to a project. Default: false.
	ManagerAccess *bool `json:"managerAccess,omitempty"`
	// Developer access to a project. Default: false.
	DeveloperAccess *bool `json:"developerAccess,omitempty"`
	// Team roles.
	// Note: `managerAccess`, `developerAccess` and `roles` parameters
	// are mutually exclusive.
	Roles []*TranslatorRole `json:"roles,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *ProjectTeamAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.TeamID == 0 {
		return errors.New("teamId is required")
	}

	return nil
}

// ProjectTeamAddResponse defines the structure of the response when
// adding a team to the project.
type ProjectTeamAddResponse struct {
	Skipped *ProjectTeam `json:"skipped,omitempty"`
	Added   *ProjectTeam `json:"added,omitempty"`
}

// GroupsTeamsData defines the structure of the response when
// list groups of teams.
type GroupsTeamsData struct {
	Data       []*TeamsGetResponse `json:"data"`
	Pagination *Pagination         `json:"pagination"`
}

// GroupsTeamsDataEdit defines the structure of the response when
// edinting groups of teams.
type GroupsTeamsDataEdit struct {
	Data []*TeamsGetResponse `json:"data"`
}

// TeamsGetResponse defines the structure of the response when
// list a group of teams.
type TeamsGetResponse struct {
	Data *GroupsTeam `json:"data"`
}

// GroupsTeam  represents a group team.
type GroupsTeam struct {
	ID   int   `json:"id"`
	Team *Team `json:"team"`
}
