package model

import (
	"fmt"
	"net/url"
)

// SecurityLog represents a security log.
type SecurityLog struct {
	ID         int    `json:"id"`
	Event      string `json:"event"`
	Info       string `json:"info"`
	UserID     int    `json:"userId"`
	Location   string `json:"location"`
	IPAddress  string `json:"ipAddress"`
	DeviceName string `json:"deviceName"`
	CreatedAt  string `json:"createdAt"`
}

// SecurityLogResponse defines the structure of a response when
// getting a security log.
type SecurityLogResponse struct {
	Data *SecurityLog `json:"data"`
}

// SecurityLogsListResponse defines the structure of a response when
// getting a list of security logs.
type SecurityLogsListResponse struct {
	Data []*SecurityLogResponse `json:"data"`
}

// LogEvent is a type representing a security log event.
type LogEvent string

const (
	Login                      LogEvent = "login"
	PasswordSet                LogEvent = "password.set"
	PasswordChange             LogEvent = "password.change"
	EmailChange                LogEvent = "email.change"
	LoginChange                LogEvent = "login.change"
	PersonalTokenIssued        LogEvent = "personal_token.issued"
	PersonalTokenRevoked       LogEvent = "personal_token.revoked"
	MFAEnabled                 LogEvent = "mfa.enabled"
	MFADisabled                LogEvent = "mfa.disabled"
	SessionRevoke              LogEvent = "session.revoke"
	SessionRevokeAll           LogEvent = "session.revoke_all"
	SSOConnect                 LogEvent = "sso.connect"
	SSODisconnect              LogEvent = "sso.disconnect"
	UserRegistered             LogEvent = "user.registered"
	UserRemove                 LogEvent = "user.remove"
	ApplicationConnected       LogEvent = "application.connected"
	ApplicationDisconnected    LogEvent = "application.disconnected"
	WebAuthnCreated            LogEvent = "webauthn.created"
	WebAuthnDeleted            LogEvent = "webauthn.deleted"
	TrustedDeviceRemove        LogEvent = "trusted_device.remove"
	TrustedDeviceRemoveAll     LogEvent = "trusted_device.remove_all"
	DeviceVerificationEnabled  LogEvent = "device_verification.enabled"
	DeviceVerificationDisabled LogEvent = "device_verification.disabled"
)

// SecurityLogsListOptions specifies the optional parameters to the
// SecurityLogsService.ListUserLogs and SecurityLogsService.ListOrganizationLogs methods.
type SecurityLogsListOptions struct {
	// Event is the type of event to filter by.
	Event LogEvent `json:"event,omitempty"`
	// Date in UTC, ISO 8601. Example: createdAfter=2024-01-10T10:41:33+00:00.
	CreatedAfter string `json:"createdAfter,omitempty"`
	// Date in UTC, ISO 8601. Example: createdBefore=2024-01-26T10:33:43+00:00.
	CreatedBefore string `json:"createdBefore,omitempty"`
	// IPAddress is the IP address to filter by.
	IPAddress string `json:"ipAddress,omitempty"`
	// Filter by user ID.
	// Used for the organization logs.
	UserID int `json:"userId,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of the SecurityLogsListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *SecurityLogsListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if o.Event != "" {
		v.Add("event", string(o.Event))
	}
	if o.CreatedAfter != "" {
		v.Add("createdAfter", o.CreatedAfter)
	}
	if o.CreatedBefore != "" {
		v.Add("createdBefore", o.CreatedBefore)
	}
	if o.IPAddress != "" {
		v.Add("ipAddress", o.IPAddress)
	}
	if o.UserID != 0 {
		v.Add("userId", fmt.Sprintf("%d", o.UserID))
	}

	return v, len(v) > 0
}
