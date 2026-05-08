package model

import "errors"

type PermissionValue string

const (
	PermissionOwn        PermissionValue = "own"        // All projects (Enterprise) / Own project
	PermissionOwner      PermissionValue = "owner"      // Only organization admins (Enterprise) / All project members
	PermissionManagers   PermissionValue = "managers"   // Organization admins, project managers and developers
	PermissionAll        PermissionValue = "all"        // All users in the organization projects
	PermissionGuests     PermissionValue = "guests"     // All users, including guests (unauthenticated users)
	PermissionRestricted PermissionValue = "restricted" // Selected projects
)

type (
	// Installation represents an application installation.
	Installation struct {
		Identifier         string            `json:"identifier"`
		Name               string            `json:"name"`
		Description        string            `json:"description"`
		Logo               string            `json:"logo"`
		BaseURL            string            `json:"baseUrl"`
		ManifestURL        string            `json:"manifestUrl"`
		CreatedAt          string            `json:"createdAt"`
		Modules            []*Module         `json:"modules"`
		Scopes             []string          `json:"scopes"`
		Permissions        ProjectPermission `json:"permissions"`
		DefaultPermissions struct {
			User    PermissionValue `json:"user"`
			Project PermissionValue `json:"project"`
		} `json:"defaultPermissions"`
		LimitReached bool `json:"limitReached"`
	}

	// Module represents an application module.
	Module struct {
		Key                string         `json:"key"`
		Type               string         `json:"type"`
		Data               any            `json:"data"`
		Permissions        UserPermission `json:"permissions"`
		AuthenticationType string         `json:"authenticationType"`

		// Integration module fields.
		Identifier *string `json:"identifier,omitempty"`
		Scopes     any     `json:"scopes,omitempty"`
		Iframe     any     `json:"iframe,omitempty"`
	}

	// ProjectPermission represents a permission for a project where
	// users will be able to use the app.
	ProjectPermission struct {
		// Value enum: own, restricted.
		Project Permission `json:"project,omitempty"`
	}

	// UserPermission represents a permission for a user that will
	// be able to use the app.
	UserPermission struct {
		// Value enum: owner, managers, all, guests, restricted.
		// Note: For exporters, the `all` value will be set.
		User Permission `json:"user,omitempty"`
	}

	// Permission represents a permission value for a project or a user.
	Permission struct {
		// Value of the permission.
		Value PermissionValue `json:"value,omitempty"`
		// IDs is only available for restricted value.
		IDs []int `json:"ids,omitempty"`
	}
)

// InstallationResponse defines the structure of the response
// when getting an installation.
type InstallationResponse struct {
	Data *Installation `json:"data"`
}

// InstallationsListResponse defines the structure of the response
// when getting a list of installations.
type InstallationsListResponse struct {
	Data []*InstallationResponse `json:"data"`
}

// InstallApplicationRequest defines the structure of the request
// to install an application.
type InstallApplicationRequest struct {
	// Manifest URL of the application.
	URL string `json:"url"`
	// Permissions to set for the application.
	Permissions *ProjectPermission `json:"permissions,omitempty"`
	// Modules with permissions to set for the application.
	Modules []*InstallationModule `json:"modules,omitempty"`
}

// InstallationReplaceValue represents the structure of the values to be replaced.
// Can be used to update permissions or module permissions with
// the replace operation in the ApplicationsService.EditInstallation method.
type InstallationReplaceValue struct {
	User Permission `json:"user,omitempty"`
	// Available only for application permissions.
	Project Permission `json:"project,omitempty"`
}

type InstallationModule struct {
	Key         string         `json:"key,omitempty"`
	Permissions UserPermission `json:"permissions,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *InstallApplicationRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.URL == "" {
		return errors.New("url is required")
	}

	return nil
}

// ApplicationDataResponse defines the structure of the response
// with application data. The data field can contain any application-specific data.
type ApplicationDataResponse struct {
	Data any `json:"data"`
}
