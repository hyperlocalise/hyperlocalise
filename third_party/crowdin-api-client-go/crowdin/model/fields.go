package model

import (
	"errors"
	"net/url"
)

type FieldType string

const (
	TypeCheckbox     FieldType = "checkbox"
	TypeRadiobuttons FieldType = "radiobuttons"
	TypeDate         FieldType = "date"
	TypeDatetime     FieldType = "datetime"
	TypeNumber       FieldType = "number"
	TypeLabels       FieldType = "labels"
	TypeSelect       FieldType = "select"
	TypeMultiselect  FieldType = "multiselect"
	TypeText         FieldType = "text"
	TypeTextarea     FieldType = "textarea"
	TypeURL          FieldType = "url"
)

type FieldEntity string

const (
	EntityProject     FieldEntity = "project"
	EntityUser        FieldEntity = "user"
	EntityTask        FieldEntity = "task"
	EntityFile        FieldEntity = "file"
	EntityTranslation FieldEntity = "translation"
	EntityString      FieldEntity = "string"
)

type FieldPlace string

const (
	ProjectCreateModal        FieldPlace = "projectCreateModal"
	ProjectHeader             FieldPlace = "projectHeader"
	ProjectDetails            FieldPlace = "projectDetails"
	ProjectCrowdsourceDetails FieldPlace = "projectCrowdsourceDetails"
	ProjectSettings           FieldPlace = "projectSettings"
	ProjectTaskEditCreate     FieldPlace = "projectTaskEditCreate"
	ProjectTaskDetails        FieldPlace = "projectTaskDetails"
	FileDetails               FieldPlace = "fileDetails"
	FileSettings              FieldPlace = "fileSettings"
	UserEditModal             FieldPlace = "userEditModal"
	UserDetails               FieldPlace = "userDetails"
	UserPopover               FieldPlace = "userPopover"
	StringEditModal           FieldPlace = "stringEditModal"
	StringDetails             FieldPlace = "stringDetails"
	TranslationUnderContent   FieldPlace = "translationUnderContent"
)

type (
	// Field represents a field.
	Field struct {
		ID          int          `json:"id"`
		Name        string       `json:"name"`
		Slug        string       `json:"slug"`
		Description string       `json:"description"`
		Type        string       `json:"type"`
		Config      *FieldConfig `json:"config,omitempty"`
		Entities    []string     `json:"entities"`
		CreatedAt   string       `json:"createdAt"`
		UpdatedAt   string       `json:"updatedAt"`
	}

	// FieldConfig represents the configuration for the field.
	FieldConfig struct {
		Options   []FieldOption   `json:"options,omitempty"`
		Locations []FieldLocation `json:"locations,omitempty"`

		// Minimal value of the field.
		Min int `json:"min,omitempty"`
		// Maximum value of the field.
		Max int `json:"max,omitempty"`
		// Units label that will be display next to input.
		Units string `json:"units,omitempty"`
	}

	// FieldOption represents an option for a field config.
	FieldOption struct {
		Label string `json:"label,omitempty"`
		Value string `json:"value,omitempty"`
	}

	// FieldLocation represents a location for a field config.
	FieldLocation struct {
		// Enum: projectCreateModal, projectHeader, projectDetails, projectCrowdsourceDetails,
		// projectSettings, projectTaskEditCreate, projectTaskDetails, fileDetails, fileSettings,
		// userEditModal, userDetails, userPopover, stringEditModal, stringDetails,
		// translationUnderContent.
		Place FieldPlace `json:"place,omitempty"`
	}
)

// FieldResponse defines the structure of a response when
// getting a field.
type FieldResponse struct {
	Data *Field `json:"data"`
}

// FieldsListResponse defines the structure of a response when
// getting a list of fields.
type FieldsListResponse struct {
	Data []*FieldResponse `json:"data"`
}

// FieldsListOptions specifies the optional parameters to the
// FieldsService.List method.
type FieldsListOptions struct {
	// Search fields by `slug` or `name`.
	Search string `json:"search,omitempty"`
	// Filter fields by entity.
	// Enum: project, user, task, file, translation, string.
	Entity FieldEntity `json:"entity,omitempty"`
	// Filter fields by type.
	// Enum: checkbox, radiobuttons, date, datetime, number, labels,
	// select, multiselect, text, textarea, url.
	Type FieldType `json:"type,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of FieldsListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *FieldsListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if o.Search != "" {
		v.Add("search", o.Search)
	}
	if o.Entity != "" {
		v.Add("entity", string(o.Entity))
	}
	if o.Type != "" {
		v.Add("type", string(o.Type))
	}

	return v, len(v) > 0
}

// FieldAddRequest defines the structure of a request when
// adding a field.
type FieldAddRequest struct {
	// Field name.
	Name string `json:"name"`
	// Field slug.
	Slug string `json:"slug"`
	// Field type.
	// Enum: checkbox, radiobuttons, date, datetime, number, labels,
	// select, multiselect, text, textarea, url.
	Type FieldType `json:"type"`
	// Entities that will be associated with field.
	Entities []FieldEntity `json:"entities"`
	// Field description.
	Description string `json:"description,omitempty"`
	// Config represents the configuration for the field. It can contains
	// a variety of fields.
	//
	// For list field config:
	//  - Options
	//  - Locations
	// For number field config:
	//  - Min
	//  - Max
	//  - Units
	//  - Locations
	// For other type field config:
	//  - Locations
	Config FieldConfig `json:"config,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *FieldAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	if r.Slug == "" {
		return errors.New("slug is required")
	}
	if r.Type == "" {
		return errors.New("type is required")
	}
	if len(r.Entities) == 0 {
		return errors.New("entities is required")
	}

	return nil
}
