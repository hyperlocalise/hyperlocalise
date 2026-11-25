package exa

import (
	"encoding/json"
	"strings"

	"golang.org/x/text/language"
)

// UserLocation localizes Exa results to a country and optional coordinates.
//
// A country-only value is sent as an ISO 3166-1 alpha-2 string (for example
// "AU"). Coordinates are sent as an object; include Country with them when
// the query should still be localised by market.
type UserLocation struct {
	Country   string
	Latitude  *float64
	Longitude *float64
}

// IsZero reports whether the location has no country and no coordinates.
func (l UserLocation) IsZero() bool {
	return strings.TrimSpace(l.Country) == "" && l.Latitude == nil && l.Longitude == nil
}

// MarshalJSON encodes a country-only location as a string and a coordinate
// location as an object, matching the Exa Search and Answer schemas.
func (l UserLocation) MarshalJSON() ([]byte, error) {
	if l.Latitude != nil || l.Longitude != nil {
		payload := struct {
			Country   string   `json:"country,omitempty"`
			Latitude  *float64 `json:"latitude,omitempty"`
			Longitude *float64 `json:"longitude,omitempty"`
		}{
			Country:   strings.ToUpper(strings.TrimSpace(l.Country)),
			Latitude:  l.Latitude,
			Longitude: l.Longitude,
		}
		return json.Marshal(payload)
	}
	country := strings.ToUpper(strings.TrimSpace(l.Country))
	if country == "" {
		return []byte("null"), nil
	}
	return json.Marshal(country)
}

// UnmarshalJSON accepts either a country string or a location object.
func (l *UserLocation) UnmarshalJSON(data []byte) error {
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" || trimmed == "null" {
		*l = UserLocation{}
		return nil
	}
	if strings.HasPrefix(trimmed, "\"") {
		var country string
		if err := json.Unmarshal(data, &country); err != nil {
			return err
		}
		*l = UserLocation{Country: strings.ToUpper(strings.TrimSpace(country))}
		return nil
	}
	var payload struct {
		Country   string   `json:"country"`
		Latitude  *float64 `json:"latitude"`
		Longitude *float64 `json:"longitude"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return err
	}
	*l = UserLocation{
		Country:   strings.ToUpper(strings.TrimSpace(payload.Country)),
		Latitude:  payload.Latitude,
		Longitude: payload.Longitude,
	}
	return nil
}

// CountryFromLocale returns the ISO 3166-1 alpha-2 region encoded in locale,
// or "" when the locale has no exact country (for example "fr" or "en").
func CountryFromLocale(locale string) string {
	normalized := strings.ReplaceAll(strings.TrimSpace(locale), "_", "-")
	if normalized == "" {
		return ""
	}
	tag, err := language.Parse(normalized)
	if err != nil {
		return ""
	}
	region, conf := tag.Region()
	if conf != language.Exact {
		return ""
	}
	code := strings.ToUpper(region.String())
	if len(code) != 2 {
		return ""
	}
	return code
}
