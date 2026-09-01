package gsc

// Site is a verified Search Console property on the connected grant.
type Site struct {
	SiteURL          string `json:"siteUrl"`
	PermissionLevel  string `json:"permissionLevel"`
}

// PermissionSiteUnverifiedUser is returned for properties the grant can see but
// cannot query.
const PermissionSiteUnverifiedUser = "siteUnverifiedUser"

// SearchAnalyticsRow is one row from searchAnalytics.query.
type SearchAnalyticsRow struct {
	Keys        []string `json:"keys,omitempty"`
	Clicks      float64  `json:"clicks"`
	Impressions float64  `json:"impressions"`
	CTR         float64  `json:"ctr"`
	Position    float64  `json:"position"`
}

// DimensionFilter filters rows in a Search Analytics query.
type DimensionFilter struct {
	Dimension  string `json:"dimension"`
	Operator   string `json:"operator"`
	Expression string `json:"expression"`
}

// DimensionFilterGroup combines filters with AND/OR logic.
type DimensionFilterGroup struct {
	GroupType string            `json:"groupType"`
	Filters   []DimensionFilter `json:"filters"`
}

// SearchAnalyticsRequest is the body for searchAnalytics.query.
type SearchAnalyticsRequest struct {
	StartDate             string                 `json:"startDate"`
	EndDate               string                 `json:"endDate"`
	Dimensions            []string               `json:"dimensions,omitempty"`
	DimensionFilterGroups []DimensionFilterGroup `json:"dimensionFilterGroups,omitempty"`
	RowLimit              int                    `json:"rowLimit,omitempty"`
	StartRow              int                    `json:"startRow,omitempty"`
	Type                  string                 `json:"type,omitempty"`
	DataState             string                 `json:"dataState,omitempty"`
	AggregationType       string                 `json:"aggregationType,omitempty"`
}

// SearchAnalyticsResponse is the searchAnalytics.query response envelope.
type SearchAnalyticsResponse struct {
	Rows []SearchAnalyticsRow `json:"rows,omitempty"`
}

// InspectURLRequest is the body for urlInspection.index.inspect.
type InspectURLRequest struct {
	SiteURL        string `json:"siteUrl"`
	InspectionURL  string `json:"inspectionUrl"`
	LanguageCode   string `json:"languageCode,omitempty"`
}

// URLInspectionResult is the subset of the inspection API result we surface.
type URLInspectionResult struct {
	IndexStatusResult      *IndexStatusResult      `json:"indexStatusResult,omitempty"`
	MobileUsabilityResult  *VerdictResult          `json:"mobileUsabilityResult,omitempty"`
	RichResultsResult      *VerdictResult          `json:"richResultsResult,omitempty"`
	InspectionResultLink   string                  `json:"inspectionResultLink,omitempty"`
}

// IndexStatusResult captures index coverage details for an inspected URL.
type IndexStatusResult struct {
	Verdict         string   `json:"verdict,omitempty"`
	CoverageState   string   `json:"coverageState,omitempty"`
	RobotsTxtState  string   `json:"robotsTxtState,omitempty"`
	IndexingState   string   `json:"indexingState,omitempty"`
	LastCrawlTime   string   `json:"lastCrawlTime,omitempty"`
	PageFetchState  string   `json:"pageFetchState,omitempty"`
	GoogleCanonical string   `json:"googleCanonical,omitempty"`
	UserCanonical   string   `json:"userCanonical,omitempty"`
	CrawledAs       string   `json:"crawledAs,omitempty"`
	Sitemap         []string `json:"sitemap,omitempty"`
	ReferringURLs   []string `json:"referringUrls,omitempty"`
}

// VerdictResult is a simple pass/fail verdict block.
type VerdictResult struct {
	Verdict string `json:"verdict,omitempty"`
}

// UserInfo holds the OpenID Connect userinfo fields we read.
type UserInfo struct {
	Email string `json:"email"`
}
