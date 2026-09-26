package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/dataforseo"
	"golang.org/x/sync/errgroup"
)

func (h *handler) registerDomainResearch(mux *http.ServeMux, verifier SessionVerifier) {
	base := orgRoutePrefix + "/domains/{linkedDomainId}/research"
	read := func(actor workspaceActor) bool { return actor.canReadProjects() }
	write := func(actor workspaceActor) bool { return actor.canWriteProjects() }
	route := func(pattern string, allow func(workspaceActor) bool, fn func(*http.Request, workspaceActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, h.workspaceHandle(workspaceDomainsFlag, "Workspace domains is not enabled for this organization", "Insufficient permissions", allow, fn))
	}
	route("GET "+base, read, h.getDomainResearch)
	route("POST "+base+"/keywords/expand", write, h.expandDomainKeywords)
	route("POST "+base+"/keywords/save", write, h.saveDomainKeywords)
	route("POST "+base+"/serp", read, h.inspectDomainSerp)
	route("POST "+base+"/ranks", write, h.trackDomainKeywords)
	route("POST "+base+"/ranks/refresh", write, h.refreshDomainRanks)
	route("POST "+orgRoutePrefix+"/domains/research/market-visibility", write, h.orgDomainMarketVisibility)
}

type linkedDomainRecord struct {
	ID                  string
	OrganizationID      string
	DomainKey           string
	DomainSlug          string
	SourceURL           string
	MarketIDs           []string
	Status              string
	PreferredMethod     *string
	VerifiedMethod      *string
	VerifiedAt          *time.Time
	LocalisationAuditID *string
	ProjectID           *string
	CreatedAt           time.Time
	UpdatedAt           time.Time
	VerificationToken   string
	AuditScore          *int
}

func (h *handler) loadLinkedDomain(ctx context.Context, organizationID, linkedDomainID string, verified bool) (linkedDomainRecord, error) {
	var domain linkedDomainRecord
	err := h.workspace.pool.QueryRow(ctx, `
		select d.id, d.organization_id, d.domain_key, d.domain_slug, d.source_url, d.market_ids, d.status,
			d.preferred_method, d.verified_method, d.verified_at, d.localisation_audit_id, d.project_id,
			d.created_at, d.updated_at, d.verification_token, a.score
		from linked_domains d
		left join localisation_audits a on a.id = d.localisation_audit_id
		where d.id = $1 and d.organization_id = $2`, linkedDomainID, organizationID).Scan(
		&domain.ID, &domain.OrganizationID, &domain.DomainKey, &domain.DomainSlug, &domain.SourceURL, &domain.MarketIDs, &domain.Status,
		&domain.PreferredMethod, &domain.VerifiedMethod, &domain.VerifiedAt, &domain.LocalisationAuditID, &domain.ProjectID,
		&domain.CreatedAt, &domain.UpdatedAt, &domain.VerificationToken, &domain.AuditScore,
	)
	if isNoRows(err) {
		return domain, workspaceFailure(404, "linked_domain_not_found", "Linked domain was not found.")
	}
	if err != nil {
		return domain, err
	}
	if verified && domain.Status != "verified" {
		return domain, workspaceFailure(400, "linked_domain_not_verified", "Verify the domain before running research.")
	}
	return domain, nil
}

func (h *handler) orgDomainMarketVisibility(r *http.Request, _ workspaceActor) (any, int, error) {
	var req researchMarketVisibilityRequest
	if err := decodeWorkspaceBody(r, &req); err != nil {
		return nil, 0, workspaceFailure(400, "invalid_domain_research_payload", "targetDomain, marketId, locationCode, and languageCode are required.")
	}
	if strings.TrimSpace(req.TargetDomain) == "" || strings.TrimSpace(req.MarketID) == "" || req.LocationCode <= 0 || strings.TrimSpace(req.LanguageCode) == "" {
		return nil, 0, workspaceFailure(400, "provider_validation_failed", "targetDomain, marketId, locationCode, and languageCode are required.")
	}
	if h.research == nil {
		return nil, 0, workspaceFailure(503, "provider_not_configured", "DataForSEO is not configured.")
	}
	result, err := h.computeMarketVisibility(r.Context(), req)
	if err != nil {
		return nil, 0, researchProviderError(err)
	}
	return result, http.StatusOK, nil
}

func (h *handler) getDomainResearch(r *http.Request, actor workspaceActor) (any, int, error) {
	catalog, domain, err := h.loadResearchCatalog(r.Context(), actor.organizationID, r.PathValue("linkedDomainId"))
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"catalog": catalog, "linkedDomain": domain.public()}, http.StatusOK, nil
}

type researchKeywordBody struct {
	Keyword string  `json:"keyword"`
	Volume  int     `json:"volume"`
	KD      int     `json:"kd"`
	CPC     float64 `json:"cpc"`
	Intent  string  `json:"intent"`
}

type expandKeywordsBody struct {
	SeedKeyword string `json:"seedKeyword"`
	MarketID    string `json:"marketId"`
}

func (h *handler) expandDomainKeywords(r *http.Request, actor workspaceActor) (any, int, error) {
	var body expandKeywordsBody
	if err := decodeWorkspaceBody(r, &body); err != nil {
		return nil, 0, workspaceFailure(400, "invalid_domain_research_payload", "Seed keyword and market are required.")
	}
	domain, err := h.loadLinkedDomain(r.Context(), actor.organizationID, r.PathValue("linkedDomainId"), true)
	if err != nil {
		return nil, 0, err
	}
	market, ok := researchMarketByID(strings.TrimSpace(body.MarketID))
	if !ok || strings.TrimSpace(body.SeedKeyword) == "" {
		if strings.TrimSpace(body.SeedKeyword) == "" {
			return nil, 0, workspaceFailure(400, "invalid_domain_research_payload", "Seed keyword and market are required.")
		}
		return nil, 0, workspaceFailure(400, "market_not_found", "Unknown research market.")
	}
	ideas, err := h.keywordIdeas(r.Context(), strings.TrimSpace(body.SeedKeyword), market)
	if err != nil {
		return nil, 0, err
	}
	_ = domain
	rows := make([]map[string]any, 0, len(ideas))
	for _, idea := range ideas {
		rows = append(rows, map[string]any{
			"id":       "idea:" + itoa(market.LocationCode) + ":" + market.Language + ":" + strings.ToLower(idea.Keyword),
			"keyword":  idea.Keyword,
			"volume":   idea.Volume,
			"kd":       idea.KD,
			"cpc":      idea.CPC,
			"intent":   researchIntent(idea.Intent),
			"marketId": market.ID,
		})
	}
	return map[string]any{"ideas": rows, "marketId": market.ID}, http.StatusOK, nil
}

type saveKeywordsBody struct {
	MarketID    string                `json:"marketId"`
	SeedKeyword string                `json:"seedKeyword"`
	Keywords    []researchKeywordBody `json:"keywords"`
}

func (h *handler) saveDomainKeywords(r *http.Request, actor workspaceActor) (any, int, error) {
	var body saveKeywordsBody
	if err := decodeWorkspaceBody(r, &body); err != nil {
		return nil, 0, workspaceFailure(400, "invalid_domain_research_payload", "Keywords to save are invalid.")
	}
	if _, err := h.loadLinkedDomain(r.Context(), actor.organizationID, r.PathValue("linkedDomainId"), true); err != nil {
		return nil, 0, err
	}
	market, ok := researchMarketByID(strings.TrimSpace(body.MarketID))
	if !ok {
		return nil, 0, workspaceFailure(400, "market_not_found", "Unknown research market.")
	}
	if err := validateResearchKeywordBodies(body.Keywords, 100); err != nil {
		return nil, 0, err
	}
	rows := uniqueResearchKeywords(body.Keywords)
	if len(rows) == 0 {
		return map[string]any{"keywords": []any{}}, http.StatusOK, nil
	}
	seed := strings.TrimSpace(body.SeedKeyword)
	var seedValue any
	if seed != "" {
		seedValue = seed
	}
	tx, err := h.workspace.pool.Begin(r.Context())
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	for _, keyword := range rows {
		_, err = tx.Exec(r.Context(), `
			insert into domain_research_keywords (
				organization_id, linked_domain_id, keyword, seed_keyword, market_id, location_code, language_code, volume, kd, cpc, intent
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			on conflict (linked_domain_id, location_code, language_code, keyword)
			do update set volume=excluded.volume, kd=excluded.kd, cpc=excluded.cpc, intent=excluded.intent,
				seed_keyword=excluded.seed_keyword, market_id=excluded.market_id, updated_at=now()`,
			actor.organizationID, r.PathValue("linkedDomainId"), keyword.Keyword, seedValue, market.ID, market.LocationCode, market.Language,
			keyword.Volume, keyword.KD, keyword.CPC, researchIntent(keyword.Intent),
		)
		if err != nil {
			return nil, 0, err
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		return nil, 0, err
	}
	catalog, _, err := h.loadResearchCatalog(r.Context(), actor.organizationID, r.PathValue("linkedDomainId"))
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"keywords": catalog["keywords"]}, http.StatusOK, nil
}

type serpBody struct {
	Keyword  string `json:"keyword"`
	MarketID string `json:"marketId"`
}

func (h *handler) inspectDomainSerp(r *http.Request, actor workspaceActor) (any, int, error) {
	var body serpBody
	if err := decodeWorkspaceBody(r, &body); err != nil || strings.TrimSpace(body.Keyword) == "" {
		return nil, 0, workspaceFailure(400, "invalid_domain_research_payload", "Keyword and market are required.")
	}
	domain, err := h.loadLinkedDomain(r.Context(), actor.organizationID, r.PathValue("linkedDomainId"), true)
	if err != nil {
		return nil, 0, err
	}
	market, ok := researchMarketByID(strings.TrimSpace(body.MarketID))
	if !ok {
		return nil, 0, workspaceFailure(400, "market_not_found", "Unknown research market.")
	}
	keyword := strings.TrimSpace(body.Keyword)
	var device string
	err = h.workspace.pool.QueryRow(r.Context(), `
		select device from domain_research_tracked_keywords
		where linked_domain_id=$1 and market_id=$2 and lower(keyword)=lower($3)
		limit 1`, r.PathValue("linkedDomainId"), market.ID, keyword).Scan(&device)
	if isNoRows(err) {
		device = "desktop"
	} else if err != nil {
		return nil, 0, err
	}
	if device != "mobile" {
		device = "desktop"
	}
	results, err := h.liveOrganicSerp(r.Context(), keyword, market, domain.DomainKey, device)
	if err != nil {
		return nil, 0, err
	}
	payload, err := json.Marshal(results)
	if err != nil {
		return nil, 0, err
	}
	_, err = h.workspace.pool.Exec(r.Context(), `
		insert into domain_research_serp_snapshots (
			organization_id, linked_domain_id, keyword, location_code, language_code, results, captured_at
		) values ($1,$2,$3,$4,$5,$6,now())
		on conflict (linked_domain_id, location_code, language_code, keyword)
		do update set results=excluded.results, captured_at=excluded.captured_at`,
		actor.organizationID, domain.ID, keyword, market.LocationCode, market.Language, payload,
	)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"results": results, "device": device}, http.StatusOK, nil
}

type trackKeywordsBody struct {
	MarketID string                `json:"marketId"`
	Device   string                `json:"device"`
	Keywords []researchKeywordBody `json:"keywords"`
}

func (h *handler) trackDomainKeywords(r *http.Request, actor workspaceActor) (any, int, error) {
	var body trackKeywordsBody
	if err := decodeWorkspaceBody(r, &body); err != nil {
		return nil, 0, workspaceFailure(400, "invalid_domain_research_payload", "Keywords to track are invalid.")
	}
	domain, err := h.loadLinkedDomain(r.Context(), actor.organizationID, r.PathValue("linkedDomainId"), true)
	if err != nil {
		return nil, 0, err
	}
	market, ok := researchMarketByID(strings.TrimSpace(body.MarketID))
	if !ok {
		return nil, 0, workspaceFailure(400, "market_not_found", "Unknown research market.")
	}
	device := body.Device
	if device != "mobile" {
		device = "desktop"
	}
	if err := validateResearchKeywordBodies(body.Keywords, maxRankCheckBatchSize); err != nil {
		return nil, 0, err
	}
	rows := uniqueResearchKeywords(body.Keywords)
	if len(rows) == 0 {
		catalog, _, err := h.loadResearchCatalog(r.Context(), actor.organizationID, domain.ID)
		if err != nil {
			return nil, 0, err
		}
		return map[string]any{"ranks": catalog["ranks"]}, http.StatusOK, nil
	}
	if len(rows) > maxRankCheckBatchSize {
		rows = rows[:maxRankCheckBatchSize]
	}
	keywords := make([]researchRankCheckKeyword, len(rows))
	for i, row := range rows {
		keywords[i] = researchRankCheckKeyword{KeywordID: row.Keyword, Keyword: row.Keyword}
	}
	checks, err := h.rankKeywords(r.Context(), domain.DomainKey, market, device, keywords)
	if err != nil {
		return nil, 0, err
	}
	byKeyword := map[string]dataforseo.RankCheckResult{}
	for _, check := range checks {
		byKeyword[strings.ToLower(check.Keyword)] = check
	}
	tx, err := h.workspace.pool.Begin(r.Context())
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	for _, row := range rows {
		check, found := byKeyword[strings.ToLower(row.Keyword)]
		var position any
		var checked any
		pageURL := ""
		if found {
			position = check.Position
			pageURL = check.URL
			checked = time.Now().UTC()
		}
		var trackedID string
		err = tx.QueryRow(r.Context(), `
			insert into domain_research_tracked_keywords (
				organization_id, linked_domain_id, keyword, market_id, location_code, language_code, device,
				volume, position, url, last_checked_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			on conflict (linked_domain_id, location_code, language_code, keyword, device)
			do update set volume=excluded.volume, market_id=excluded.market_id,
				previous_position=domain_research_tracked_keywords.position,
				position=excluded.position, url=excluded.url, last_checked_at=excluded.last_checked_at, updated_at=now()
			returning id`,
			actor.organizationID, domain.ID, row.Keyword, market.ID, market.LocationCode, market.Language, device,
			row.Volume, position, pageURL, checked,
		).Scan(&trackedID)
		if err != nil {
			return nil, 0, err
		}
		if found {
			if _, err = tx.Exec(r.Context(), `
				insert into domain_research_rank_snapshots (tracked_keyword_id, position, url)
				values ($1,$2,$3)`, trackedID, check.Position, check.URL); err != nil {
				return nil, 0, err
			}
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		return nil, 0, err
	}
	catalog, _, err := h.loadResearchCatalog(r.Context(), actor.organizationID, domain.ID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"ranks": catalog["ranks"]}, http.StatusOK, nil
}

func (h *handler) refreshDomainRanks(r *http.Request, actor workspaceActor) (any, int, error) {
	domain, err := h.loadLinkedDomain(r.Context(), actor.organizationID, r.PathValue("linkedDomainId"), true)
	if err != nil {
		return nil, 0, err
	}
	tracked, err := h.workspace.pool.Query(r.Context(), `
		select id, keyword, location_code, language_code, device
		from domain_research_tracked_keywords
		where linked_domain_id=$1
		order by updated_at desc`, domain.ID)
	if err != nil {
		return nil, 0, err
	}
	defer tracked.Close()
	type trackedKeyword struct {
		id, keyword, language, device string
		location                      int
	}
	var rows []trackedKeyword
	for tracked.Next() {
		var row trackedKeyword
		if err := tracked.Scan(&row.id, &row.keyword, &row.location, &row.language, &row.device); err != nil {
			return nil, 0, err
		}
		rows = append(rows, row)
	}
	if err := tracked.Err(); err != nil {
		return nil, 0, err
	}
	if len(rows) == 0 {
		return map[string]any{"ranks": []any{}}, http.StatusOK, nil
	}
	groups := map[string][]trackedKeyword{}
	for _, row := range rows {
		device := row.device
		if device != "mobile" {
			device = "desktop"
		}
		key := itoa(row.location) + ":" + row.language + ":" + device
		groups[key] = append(groups[key], row)
	}
	var checks []dataforseo.RankCheckResult
	for _, group := range groups {
		device := group[0].device
		if device != "mobile" {
			device = "desktop"
		}
		market := researchMarket{LocationCode: group[0].location, Language: group[0].language}
		for offset := 0; offset < len(group); offset += maxRankCheckBatchSize {
			end := offset + maxRankCheckBatchSize
			if end > len(group) {
				end = len(group)
			}
			batch := group[offset:end]
			keywords := make([]researchRankCheckKeyword, len(batch))
			for i, row := range batch {
				keywords[i] = researchRankCheckKeyword{KeywordID: row.id, Keyword: row.keyword}
			}
			ranked, err := h.rankKeywords(r.Context(), domain.DomainKey, market, device, keywords)
			if err != nil {
				return nil, 0, err
			}
			checks = append(checks, ranked...)
		}
	}
	if err := h.applyRankChecks(r.Context(), checks, true); err != nil {
		return nil, 0, err
	}
	catalog, _, err := h.loadResearchCatalog(r.Context(), actor.organizationID, domain.ID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"ranks": catalog["ranks"]}, http.StatusOK, nil
}

func (h *handler) applyRankChecks(ctx context.Context, checks []dataforseo.RankCheckResult, updateTracked bool) error {
	for _, check := range checks {
		if check.KeywordID == "" {
			continue
		}
		var currentID string
		var position *int
		err := h.workspace.pool.QueryRow(ctx, `select id, position from domain_research_tracked_keywords where id=$1`, check.KeywordID).Scan(&currentID, &position)
		if isNoRows(err) {
			continue
		}
		if err != nil {
			return err
		}
		if updateTracked {
			if _, err = h.workspace.pool.Exec(ctx, `
				update domain_research_tracked_keywords
				set previous_position=$2, position=$3, url=$4, last_checked_at=now(), updated_at=now()
				where id=$1`, currentID, position, check.Position, check.URL); err != nil {
				return err
			}
		}
		if _, err = h.workspace.pool.Exec(ctx, `
			insert into domain_research_rank_snapshots (tracked_keyword_id, position, url)
			values ($1,$2,$3)`, currentID, check.Position, check.URL); err != nil {
			return err
		}
	}
	return nil
}

func (h *handler) keywordIdeas(ctx context.Context, keyword string, market researchMarket) ([]dataforseo.KeywordIdea, error) {
	if h.research == nil {
		return nil, workspaceFailure(503, "provider_not_configured", "DataForSEO is not configured.")
	}
	response, err := h.research.KeywordIdeas(ctx, dataforseo.KeywordIdeasInput{
		Keyword: keyword,
		Market:  dataforseo.MarketScope{LocationCode: market.LocationCode, LanguageCode: market.Language},
		Limit:   defaultKeywordIdeaLimit,
	})
	if err != nil {
		return nil, researchProviderError(err)
	}
	return dataforseo.ParseKeywordIdeas(response.Data), nil
}

func (h *handler) liveOrganicSerp(ctx context.Context, keyword string, market researchMarket, targetDomain, device string) ([]dataforseo.OrganicSerpResult, error) {
	if h.research == nil {
		return nil, workspaceFailure(503, "provider_not_configured", "DataForSEO is not configured.")
	}
	response, err := h.research.LiveAdvanced(ctx, dataforseo.LiveSerpInput{
		Keyword: keyword,
		Market:  dataforseo.MarketScope{LocationCode: market.LocationCode, LanguageCode: market.Language},
		Device:  device,
		Depth:   defaultResearchSerpDepth,
	})
	if err != nil {
		return nil, researchProviderError(err)
	}
	results := dataforseo.ParseOrganicSerpResults(response.Data, targetDomain)
	if results == nil {
		results = []dataforseo.OrganicSerpResult{}
	}
	return results, nil
}

func (h *handler) rankKeywords(ctx context.Context, targetDomain string, market researchMarket, device string, keywords []researchRankCheckKeyword) ([]dataforseo.RankCheckResult, error) {
	if h.research == nil {
		return nil, workspaceFailure(503, "provider_not_configured", "DataForSEO is not configured.")
	}
	results := make([]dataforseo.RankCheckResult, len(keywords))
	group, ctx := errgroup.WithContext(ctx)
	group.SetLimit(rankCheckConcurrency)
	for i, item := range keywords {
		group.Go(func() error {
			response, err := h.research.RankCheck(ctx, dataforseo.RankCheckSerpInput{
				KeywordID:    item.KeywordID,
				Keyword:      item.Keyword,
				TargetDomain: targetDomain,
				Market:       dataforseo.MarketScope{LocationCode: market.LocationCode, LanguageCode: market.Language},
				Device:       device,
				Depth:        defaultResearchSerpDepth,
			})
			if err != nil {
				return researchProviderError(err)
			}
			results[i] = response.Data
			return nil
		})
	}
	if err := group.Wait(); err != nil {
		return nil, err
	}
	return results, nil
}

func researchProviderError(err error) error {
	if typed, ok := dataforseo.AsError(err); ok {
		message := typed.Message
		if message == "" {
			message = "DataForSEO request failed."
		}
		switch typed.Code {
		case dataforseo.ErrorCodeRateLimited:
			return workspaceFailure(429, "provider_rate_limited", message)
		case dataforseo.ErrorCodeValidation:
			return workspaceFailure(400, "provider_validation_failed", message)
		default:
			return workspaceFailure(400, "provider_failed", message)
		}
	}
	return workspaceFailure(503, "provider_unavailable", "The DataForSEO service is unavailable.")
}

const maxResearchKeywordLength = 200

func validateResearchKeywordBodies(keywords []researchKeywordBody, maxCount int) error {
	if len(keywords) == 0 {
		return workspaceFailure(400, "invalid_domain_research_payload", "Keywords to save are invalid.")
	}
	if len(keywords) > maxCount {
		return workspaceFailure(400, "invalid_domain_research_payload", "Keywords to save are invalid.")
	}
	for _, keyword := range keywords {
		trimmed := strings.TrimSpace(keyword.Keyword)
		if trimmed == "" || len(trimmed) > maxResearchKeywordLength {
			return workspaceFailure(400, "invalid_domain_research_payload", "Keywords to save are invalid.")
		}
		if keyword.Volume < 0 || keyword.KD < 0 || keyword.CPC < 0 {
			return workspaceFailure(400, "invalid_domain_research_payload", "Keywords to save are invalid.")
		}
		if intent := strings.TrimSpace(keyword.Intent); intent != "" {
			switch intent {
			case "informational", "commercial", "transactional", "navigational":
			default:
				return workspaceFailure(400, "invalid_domain_research_payload", "Keywords to save are invalid.")
			}
		}
	}
	return nil
}

func uniqueResearchKeywords(keywords []researchKeywordBody) []researchKeywordBody {
	seen := map[string]researchKeywordBody{}
	order := make([]string, 0, len(keywords))
	for _, keyword := range keywords {
		normalized := strings.TrimSpace(keyword.Keyword)
		if normalized == "" {
			continue
		}
		key := strings.ToLower(normalized)
		if _, ok := seen[key]; !ok {
			order = append(order, key)
		}
		keyword.Keyword = normalized
		seen[key] = keyword
	}
	rows := make([]researchKeywordBody, 0, len(order))
	for _, key := range order {
		rows = append(rows, seen[key])
	}
	return rows
}

func researchIntent(value string) string {
	switch value {
	case "commercial", "transactional", "navigational", "informational":
		return value
	default:
		return "informational"
	}
}

func nullableInt(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}

func nullableString(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func (h *handler) loadResearchCatalog(ctx context.Context, organizationID, linkedDomainID string) (map[string]any, linkedDomainRecord, error) {
	domain, err := h.loadLinkedDomain(ctx, organizationID, linkedDomainID, false)
	if err != nil {
		return nil, domain, err
	}
	keywords, err := h.listResearchKeywords(ctx, domain.ID)
	if err != nil {
		return nil, domain, err
	}
	ranks, err := h.listResearchRanks(ctx, domain.ID)
	if err != nil {
		return nil, domain, err
	}
	serp, err := h.listResearchSerp(ctx, domain.ID, keywords)
	if err != nil {
		return nil, domain, err
	}
	marketID := ""
	if len(keywords) > 0 {
		marketID, _ = keywords[0]["marketId"].(string)
	} else if len(ranks) > 0 {
		marketID, _ = ranks[0]["marketId"].(string)
	}
	market, ok := researchMarketByID(marketID)
	if !ok {
		market = researchMarkets[defaultResearchMarketIDs[0]]
	}
	return map[string]any{
		"domain":           domain.researchDomain(len(keywords), len(ranks)),
		"market":           market.public(),
		"keywords":         keywords,
		"ranks":            ranks,
		"overviewKeywords": overviewKeywords(ranks),
		"overviewPages":    overviewPages(ranks),
		"competitors":      []any{},
		"engineMentions":   map[string]int{"chatgpt": 0, "claude": 0, "gemini": 0, "perplexity": 0},
		"prompt":           "",
		"promptResults":    []any{},
		"serpByKeywordId":  serp,
	}, domain, nil
}

func (h *handler) listResearchKeywords(ctx context.Context, linkedDomainID string) ([]map[string]any, error) {
	rows, err := h.workspace.pool.Query(ctx, `
		select id, keyword, volume, kd, cpc, intent, market_id
		from domain_research_keywords
		where linked_domain_id=$1
		order by volume desc`, linkedDomainID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	keywords := []map[string]any{}
	for rows.Next() {
		var id, keyword, intent, marketID string
		var volume, kd int
		var cpc float64
		if err := rows.Scan(&id, &keyword, &volume, &kd, &cpc, &intent, &marketID); err != nil {
			return nil, err
		}
		keywords = append(keywords, map[string]any{
			"id": id, "keyword": keyword, "volume": volume, "kd": kd, "cpc": cpc,
			"intent": researchIntent(intent), "marketId": marketID,
		})
	}
	return keywords, rows.Err()
}

func (h *handler) listResearchRanks(ctx context.Context, linkedDomainID string) ([]map[string]any, error) {
	rows, err := h.workspace.pool.Query(ctx, `
		select id, keyword, position, previous_position, url, volume, market_id, device
		from domain_research_tracked_keywords
		where linked_domain_id=$1
		order by volume desc`, linkedDomainID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ranks := []map[string]any{}
	for rows.Next() {
		var id, keyword, pageURL, marketID, device string
		var volume int
		var position, previous *int
		if err := rows.Scan(&id, &keyword, &position, &previous, &pageURL, &volume, &marketID, &device); err != nil {
			return nil, err
		}
		if device != "mobile" {
			device = "desktop"
		}
		ranks = append(ranks, map[string]any{
			"id": id, "keyword": keyword, "position": nullableInt(position), "previousPosition": nullableInt(previous),
			"url": pageURL, "volume": volume, "marketId": marketID, "device": device,
		})
	}
	return ranks, rows.Err()
}

func (h *handler) listResearchSerp(ctx context.Context, linkedDomainID string, keywords []map[string]any) (map[string]any, error) {
	rows, err := h.workspace.pool.Query(ctx, `
		select location_code, language_code, keyword, results
		from domain_research_serp_snapshots
		where linked_domain_id=$1`, linkedDomainID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := map[string]string{}
	for _, keyword := range keywords {
		marketID, _ := keyword["marketId"].(string)
		market, ok := researchMarketByID(marketID)
		text, _ := keyword["keyword"].(string)
		id, _ := keyword["id"].(string)
		if ok {
			ids[serpKey(market.LocationCode, market.Language, text)] = id
		}
	}
	serp := map[string]any{}
	for rows.Next() {
		var location int
		var language, keyword string
		var raw []byte
		if err := rows.Scan(&location, &language, &keyword, &raw); err != nil {
			return nil, err
		}
		id := ids[serpKey(location, language, keyword)]
		if id == "" {
			continue
		}
		var results any
		if err := json.Unmarshal(raw, &results); err != nil {
			return nil, err
		}
		serp[id] = results
	}
	return serp, rows.Err()
}

func serpKey(location int, language, keyword string) string {
	return itoa(location) + ":" + language + ":" + strings.ToLower(keyword)
}

func overviewKeywords(ranks []map[string]any) []map[string]any {
	rows := []map[string]any{}
	for _, rank := range ranks {
		if rank["position"] == nil {
			continue
		}
		rows = append(rows, map[string]any{
			"id": rank["id"], "keyword": rank["keyword"], "position": rank["position"], "volume": rank["volume"], "traffic": 0,
		})
	}
	return rows
}

func overviewPages(ranks []map[string]any) []map[string]any {
	pages := []map[string]any{}
	for _, rank := range ranks {
		raw, _ := rank["url"].(string)
		if raw == "" {
			continue
		}
		path := raw
		if parsed, err := url.Parse(raw); err == nil && parsed.Path != "" {
			path = parsed.Path
		}
		found := false
		for _, page := range pages {
			if page["path"] == path {
				page["keywords"] = page["keywords"].(int) + 1
				found = true
				break
			}
		}
		if !found {
			pages = append(pages, map[string]any{"id": rank["id"], "path": path, "keywords": 1, "traffic": 0})
		}
	}
	return pages
}

func (m researchMarket) public() map[string]any {
	return map[string]any{
		"id": m.ID, "location": m.Location, "language": m.Language, "label": m.Label, "locationCode": m.LocationCode,
	}
}

func (d linkedDomainRecord) researchDomain(keywordCount, trackedCount int) map[string]any {
	locales := []map[string]any{}
	for _, marketID := range d.MarketIDs {
		if market, ok := researchMarketByID(marketID); ok {
			locales = append(locales, market.public())
		}
	}
	if len(locales) == 0 {
		for _, marketID := range defaultResearchMarketIDs {
			locales = append(locales, researchMarkets[marketID].public())
		}
	}
	status := "pending_verification"
	if d.Status == "verified" {
		status = "verified"
	}
	var score any
	if d.AuditScore != nil {
		score = *d.AuditScore
	}
	return map[string]any{
		"id": d.ID, "domainKey": d.DomainKey, "domainSlug": d.DomainSlug, "sourceUrl": d.SourceURL,
		"localisationAuditId": nullableString(d.LocalisationAuditID), "locales": locales, "status": status,
		"keywordCount": keywordCount, "keywordCountLabel": compactCount(keywordCount),
		"traffic": 0, "trafficLabel": "—", "score": score, "trackedCount": trackedCount, "aiMentions": 0,
	}
}

func compactCount(value int) string {
	if value <= 0 {
		return "—"
	}
	if value >= 1_000_000 {
		return trimCompact(float64(value)/1_000_000) + "m"
	}
	if value >= 1_000 {
		return trimCompact(float64(value)/1_000) + "k"
	}
	return itoa(value)
}

func trimCompact(value float64) string {
	return strings.TrimSuffix(strconv.FormatFloat(value, 'f', 1, 64), ".0")
}

func (d linkedDomainRecord) public() map[string]any {
	return map[string]any{
		"id": d.ID, "organizationId": d.OrganizationID, "domainKey": d.DomainKey, "domainSlug": d.DomainSlug,
		"sourceUrl": d.SourceURL, "marketIds": stringSlice(d.MarketIDs), "status": d.Status,
		"preferredMethod": nullableString(d.PreferredMethod), "verifiedMethod": nullableString(d.VerifiedMethod), "verifiedAt": isoTime(d.VerifiedAt),
		"localisationAuditId": nullableString(d.LocalisationAuditID), "projectId": nullableString(d.ProjectID),
		"createdAt": isoTime(&d.CreatedAt), "updatedAt": isoTime(&d.UpdatedAt),
		"challenges": d.challenges(), "auditScore": nullableInt(d.AuditScore),
	}
}

func (d linkedDomainRecord) challenges() map[string]any {
	origin := d.SourceURL
	if parsed, err := url.Parse(d.SourceURL); err == nil && parsed.Scheme != "" && parsed.Host != "" {
		origin = parsed.Scheme + "://" + parsed.Host
	}
	const htmlPath = "/.well-known/hyperlocalise-verification.txt"
	return map[string]any{
		"token": d.VerificationToken,
		"dnsTxt": map[string]string{
			"host":  "_hyperlocalise-verify." + d.DomainKey,
			"value": "hyperlocalise-site-verification=" + d.VerificationToken,
		},
		"htmlFile": map[string]string{
			"path": htmlPath,
			"url":  origin + htmlPath,
			"body": d.VerificationToken,
		},
		"metaTag": map[string]string{
			"html": `<meta name="hyperlocalise-site-verification" content="` + d.VerificationToken + `" />`,
		},
	}
}

func stringSlice(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func isoTime(value *time.Time) any {
	if value == nil {
		return nil
	}
	return value.UTC().Format("2006-01-02T15:04:05.000Z")
}
