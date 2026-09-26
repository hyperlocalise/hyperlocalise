package main

import (
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/gsc"
	"golang.org/x/sync/errgroup"
)

func (h *handler) registerDomainSearchConsole(mux *http.ServeMux, verifier SessionVerifier) {
	base := orgRoutePrefix + "/domains/{linkedDomainId}/search-console"
	read := func(actor workspaceActor) bool { return actor.canReadProjects() }
	route := func(pattern string, fn func(*http.Request, workspaceActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, h.workspaceHandle(
			workspaceDomainsFlag,
			"Workspace domains is not enabled for this organization",
			"Insufficient permissions",
			read,
			fn,
		))
	}
	route("GET "+base, h.getDomainSearchConsole)
	route("POST "+base+"/inspect", h.inspectDomainSearchConsole)
}

func (h *handler) getDomainSearchConsole(r *http.Request, actor workspaceActor) (any, int, error) {
	dateRange := r.URL.Query().Get("dateRange")
	if dateRange == "" {
		dateRange = string(gsc.DateRangeLast28Days)
	} else if !isGscDateRange(dateRange) {
		return nil, 0, workspaceFailure(400, "invalid_search_console_query", "Date range is invalid.")
	}
	locale := strings.TrimSpace(r.URL.Query().Get("locale"))
	domain, err := h.loadLinkedDomain(r.Context(), actor.organizationID, r.PathValue("linkedDomainId"), false)
	if err != nil {
		return nil, 0, err
	}
	if h.workspace.pipes == nil {
		return map[string]any{
			"searchConsole": emptyGscSnapshot(dateRange, "unconfigured", nil),
			"linkedDomain":  domain.public(),
		}, http.StatusOK, nil
	}
	token, err := h.workspace.pipes.AccessToken(r.Context(), gscPipesSlug, actor.workosUserID, actor.workosOrganizationID)
	if err != nil {
		if snapshot, ok := gscSnapshotForPipesError(dateRange, err); ok {
			return map[string]any{"searchConsole": snapshot, "linkedDomain": domain.public()}, http.StatusOK, nil
		}
		return nil, 0, err
	}
	if h.gsc == nil {
		return map[string]any{
			"searchConsole": emptyGscSnapshot(dateRange, "unconfigured", nil),
			"linkedDomain":  domain.public(),
		}, http.StatusOK, nil
	}
	sites, err := h.gsc.ListSites(r.Context(), token)
	if err != nil {
		return nil, 0, gscProviderError(err)
	}
	site, ok := matchSearchConsoleSite(sites, domain.DomainKey)
	if !ok {
		return map[string]any{
			"searchConsole": emptyGscSnapshot(dateRange, "no_property", map[string]any{
				"connected": true, "needsReauthorization": false,
			}),
			"linkedDomain": domain.public(),
		}, http.StatusOK, nil
	}
	country := gscCountryForMarket(locale)
	type query struct {
		dimensions []string
		limit      int
		rows       []gsc.SearchAnalyticsRow
		start, end string
	}
	queries := []*query{
		{dimensions: []string{gsc.DimensionDate}},
		{dimensions: []string{gsc.DimensionQuery}, limit: 25},
		{dimensions: []string{gsc.DimensionPage}, limit: 25},
	}
	group, ctx := errgroup.WithContext(r.Context())
	for _, item := range queries {
		group.Go(func() error {
			request := gscPerformanceRequestFor(dateRange, item.dimensions, country, item.limit)
			rows, err := h.gsc.QuerySearchAnalytics(ctx, token, site.SiteURL, request)
			if err != nil {
				return gscProviderError(err)
			}
			item.rows = rows
			item.start = request.StartDate
			item.end = request.EndDate
			return nil
		})
	}
	if err := group.Wait(); err != nil {
		return nil, 0, err
	}
	series := queries[0]
	start, end := series.start, series.end
	if start == "" {
		start = ""
	}
	return map[string]any{
		"searchConsole": map[string]any{
			"status":     "ready",
			"connection": map[string]any{"connected": true, "needsReauthorization": false},
			"siteUrl":    site.SiteURL,
			"startDate":  nilIfEmpty(start),
			"endDate":    nilIfEmpty(end),
			"dateRange":  dateRange,
			"totals":     summarizeGscRows(series.rows),
			"series":     seriesFromDateRows(series.rows),
			"queries":    queryRowsFromGsc(queries[1].rows),
			"pages":      pageRowsFromGsc(queries[2].rows),
		},
		"linkedDomain": domain.public(),
	}, http.StatusOK, nil
}

func (h *handler) inspectDomainSearchConsole(r *http.Request, actor workspaceActor) (any, int, error) {
	var body struct {
		URL string `json:"url"`
	}
	if err := decodeWorkspaceBody(r, &body); err != nil {
		return nil, 0, workspaceFailure(400, "invalid_search_console_inspect_payload", "A valid URL is required.")
	}
	parsed, err := url.ParseRequestURI(strings.TrimSpace(body.URL))
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return nil, 0, workspaceFailure(400, "invalid_search_console_inspect_payload", "A valid URL is required.")
	}
	domain, err := h.loadLinkedDomain(r.Context(), actor.organizationID, r.PathValue("linkedDomainId"), false)
	if err != nil {
		return nil, 0, err
	}
	if h.workspace.pipes == nil {
		return nil, 0, workspaceFailure(503, "gsc_pipes_unavailable", "WorkOS is not configured, so Search Console cannot connect through Pipes.")
	}
	token, err := h.workspace.pipes.AccessToken(r.Context(), gscPipesSlug, actor.workosUserID, actor.workosOrganizationID)
	if err != nil {
		return nil, 0, err
	}
	if h.gsc == nil {
		return nil, 0, workspaceFailure(503, "gsc_upstream_unavailable", "Search Console request failed")
	}
	sites, err := h.gsc.ListSites(r.Context(), token)
	if err != nil {
		return nil, 0, gscProviderError(err)
	}
	site, ok := matchSearchConsoleSite(sites, domain.DomainKey)
	if !ok {
		return nil, 0, workspaceFailure(404, "gsc_property_not_found", "This domain is not a verified Search Console property on the connected account.")
	}
	inspection, err := h.gsc.InspectURL(r.Context(), token, site.SiteURL, parsed.String(), "")
	if err != nil {
		return nil, 0, gscProviderError(err)
	}
	return map[string]any{"inspection": inspection, "siteUrl": site.SiteURL}, http.StatusOK, nil
}

func gscPerformanceRequestFor(dateRange string, dimensions []string, country string, rowLimit int) gsc.SearchAnalyticsRequest {
	filters := []gsc.DimensionFilter{}
	if country != "" {
		filters = append(filters, gsc.DimensionFilter{
			Dimension: gsc.DimensionCountry, Operator: gsc.FilterOperatorEquals, Expression: country,
		})
	}
	return gsc.BuildSearchAnalyticsRequest(gsc.PerformanceInput{
		Dimensions: dimensions,
		DateRange:  gsc.DateRange(dateRange),
		Filters:    filters,
		RowLimit:   rowLimit,
	}, time.Now().UTC())
}

func isGscDateRange(value string) bool {
	switch gsc.DateRange(value) {
	case gsc.DateRangeLast7Days, gsc.DateRangeLast28Days, gsc.DateRangeLast3Months, gsc.DateRangeLast6Months, gsc.DateRangeLast12Months:
		return true
	default:
		return false
	}
}

func gscCountryForMarket(marketID string) string {
	switch marketID {
	case "france-fr":
		return "fra"
	case "germany-de":
		return "deu"
	case "japan-ja":
		return "jpn"
	case "vietnam-vi":
		return "vnm"
	default:
		return ""
	}
}

func gscSnapshotForPipesError(dateRange string, err error) (map[string]any, bool) {
	var failure *workspaceError
	if !errors.As(err, &failure) {
		return nil, false
	}
	switch failure.code {
	case "gsc_pipes_unavailable":
		return emptyGscSnapshot(dateRange, "unconfigured", nil), true
	case "gsc_pipes_needs_reauthorization":
		return emptyGscSnapshot(dateRange, "needs_reauthorization", map[string]any{
			"connected": false, "needsReauthorization": true,
		}), true
	case "gsc_not_connected":
		return emptyGscSnapshot(dateRange, "disconnected", nil), true
	default:
		return nil, false
	}
}

func emptyGscSnapshot(dateRange, status string, connection any) map[string]any {
	return map[string]any{
		"status": status, "connection": connection, "siteUrl": nil, "startDate": nil, "endDate": nil,
		"dateRange": dateRange,
		"totals":    map[string]float64{"clicks": 0, "impressions": 0, "ctr": 0, "position": 0},
		"series":    []any{}, "queries": []any{}, "pages": []any{},
	}
}

func summarizeGscRows(rows []gsc.SearchAnalyticsRow) map[string]float64 {
	totals := map[string]float64{"clicks": 0, "impressions": 0, "ctr": 0, "position": 0}
	var weighted float64
	for _, row := range rows {
		totals["clicks"] += row.Clicks
		totals["impressions"] += row.Impressions
		weighted += row.Position * row.Impressions
	}
	if totals["impressions"] > 0 {
		totals["ctr"] = totals["clicks"] / totals["impressions"]
		totals["position"] = weighted / totals["impressions"]
	}
	return totals
}

func seriesFromDateRows(rows []gsc.SearchAnalyticsRow) []map[string]any {
	series := []map[string]any{}
	for _, row := range rows {
		if len(row.Keys) == 0 || row.Keys[0] == "" {
			continue
		}
		series = append(series, gscMetric(row, "date", row.Keys[0]))
	}
	return series
}

func queryRowsFromGsc(rows []gsc.SearchAnalyticsRow) []map[string]any {
	result := []map[string]any{}
	for _, row := range rows {
		if len(row.Keys) == 0 || row.Keys[0] == "" {
			continue
		}
		result = append(result, gscMetric(row, "query", row.Keys[0]))
	}
	return result
}

func pageRowsFromGsc(rows []gsc.SearchAnalyticsRow) []map[string]any {
	result := []map[string]any{}
	for _, row := range rows {
		if len(row.Keys) == 0 || row.Keys[0] == "" {
			continue
		}
		result = append(result, gscMetric(row, "page", row.Keys[0]))
	}
	return result
}

func gscMetric(row gsc.SearchAnalyticsRow, key, value string) map[string]any {
	return map[string]any{
		key: value, "clicks": row.Clicks, "impressions": row.Impressions, "ctr": row.CTR, "position": row.Position,
	}
}

func gscProviderError(err error) error {
	if typed, ok := gsc.AsError(err); ok {
		message := typed.Message
		if message == "" {
			message = "Search Console request failed"
		}
		switch typed.Code {
		case gsc.ErrorCodeValidation:
			return workspaceFailure(400, string(typed.Code), message)
		case gsc.ErrorCodeRateLimited:
			return workspaceFailure(429, string(typed.Code), message)
		case gsc.ErrorCodeAuthFailed:
			return workspaceFailure(401, string(typed.Code), message)
		case gsc.ErrorCodeNotFound:
			return workspaceFailure(404, string(typed.Code), message)
		case gsc.ErrorCodeUpstreamUnavailable:
			return workspaceFailure(503, string(typed.Code), message)
		default:
			return workspaceFailure(400, string(typed.Code), message)
		}
	}
	return workspaceFailure(503, "gsc_upstream_unavailable", "Search Console request failed")
}

func matchSearchConsoleSite(sites []gsc.Site, domainKey string) (gsc.Site, bool) {
	key := normalizeHost(domainKey)
	if key == "" {
		return gsc.Site{}, false
	}
	type parsedSite struct {
		site gsc.Site
		kind string
		host string
	}
	queryable := make([]parsedSite, 0, len(sites))
	for _, site := range sites {
		if site.PermissionLevel == gsc.PermissionSiteUnverifiedUser {
			continue
		}
		kind, host, ok := parseSearchConsoleSiteURL(site.SiteURL)
		if ok {
			queryable = append(queryable, parsedSite{site, kind, host})
		}
	}
	for _, entry := range queryable {
		if entry.kind == "domain" && entry.host == key {
			return entry.site, true
		}
	}
	for _, entry := range queryable {
		if entry.kind == "url" && entry.host == key {
			return entry.site, true
		}
	}
	for _, entry := range queryable {
		if entry.kind == "domain" && (key == entry.host || strings.HasSuffix(key, "."+entry.host)) {
			return entry.site, true
		}
	}
	return gsc.Site{}, false
}

func parseSearchConsoleSiteURL(siteURL string) (kind, host string, ok bool) {
	trimmed := strings.TrimSpace(siteURL)
	const prefix = "sc-domain:"
	if strings.HasPrefix(strings.ToLower(trimmed), prefix) {
		host = normalizeHost(trimmed[len(prefix):])
		return "domain", host, host != ""
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", "", false
	}
	host = normalizeHost(parsed.Hostname())
	return "url", host, host != ""
}

func normalizeHost(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.TrimSuffix(value, ".")
	value = strings.TrimPrefix(value, "www.")
	return value
}

func nilIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}
