package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/hyperlocalise/hyperlocalise/internal/dataforseo"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	linkedDomainBase        = orgRoutePrefix + "/domains/linked-domains"
	linkedDomainHTMLPath    = "/.well-known/hyperlocalise-verification.txt"
	linkedDomainTokenPrefix = "hyperlocalise-site-verification="
	linkedDomainMetaName    = "hyperlocalise-site-verification"
)

type linkedDomainAPI struct {
	workspace *workspaceAPI
	research  researchService
	autumn    *autumn.Client
}

func (api *linkedDomainAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	read := func(a workspaceActor) bool { return a.canReadProjects() }
	write := func(a workspaceActor) bool { return a.canWriteProjects() }
	route := func(pattern string, allow func(workspaceActor) bool, fn func(*http.Request, workspaceActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.workspace.handleWithWorkspace(fn, allow))
	}
	route("GET "+linkedDomainBase, read, api.list)
	route("POST "+linkedDomainBase, write, api.create)
	route("GET "+linkedDomainBase+"/{linkedDomainId}", read, api.get)
	route("GET "+linkedDomainBase+"/{linkedDomainId}/audit", read, api.audit)
	route("POST "+linkedDomainBase+"/{linkedDomainId}/verify", write, api.verify)
	route("POST "+linkedDomainBase+"/{linkedDomainId}/market-recommendations", write, api.recommendMarkets)
	route("PATCH "+linkedDomainBase+"/{linkedDomainId}/markets", write, api.updateMarkets)
	route("PATCH "+linkedDomainBase+"/{linkedDomainId}/project", write, api.updateProject)
	route("DELETE "+linkedDomainBase+"/{linkedDomainId}", write, api.cancel)
}

// handleWithWorkspace applies the same authentication and feature gate used by
// the other org-scoped domain APIs, while keeping domain authorization local.
func (api *workspaceAPI) handleWithWorkspace(fn func(*http.Request, workspaceActor) (any, int, error), allow func(workspaceActor) bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeWorkspaceError(w, r, workspaceFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
		if api == nil || api.pool == nil {
			writeWorkspaceError(w, r, workspaceFailure(503, "service_unavailable", "Workspace service unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeWorkspaceError(w, r, workspaceFailure(401, "unauthorized", "Authentication required"))
			return
		}
		actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeWorkspaceError(w, r, err)
			return
		}
		if err = api.requireFlag(ctx, actor, workspaceDomainsFlag, "Workspace domains is not enabled for this organization"); err != nil {
			writeWorkspaceError(w, r, err)
			return
		}
		if !allow(actor) {
			writeWorkspaceError(w, r, workspaceFailure(403, "forbidden", "Insufficient permissions"))
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, workspaceBodyLimit)
		value, status, err := fn(r, actor)
		if err != nil {
			writeWorkspaceError(w, r, err)
			return
		}
		if status == http.StatusNoContent {
			w.WriteHeader(status)
			return
		}
		writeJSON(w, status, value)
	})
}

type linkedDomainRow struct {
	ID                  string     `json:"id"`
	OrganizationID      string     `json:"organizationId"`
	DomainKey           string     `json:"domainKey"`
	DomainSlug          string     `json:"domainSlug"`
	SourceURL           string     `json:"sourceUrl"`
	MarketIDs           []string   `json:"marketIds"`
	Status              string     `json:"status"`
	PreferredMethod     *string    `json:"preferredMethod"`
	VerifiedMethod      *string    `json:"verifiedMethod"`
	VerifiedAt          *time.Time `json:"verifiedAt"`
	LocalisationAuditID *string    `json:"localisationAuditId"`
	ProjectID           *string    `json:"projectId"`
	CreatedAt           time.Time  `json:"createdAt"`
	UpdatedAt           time.Time  `json:"updatedAt"`
	VerificationToken   string     `json:"-"`
	AuditScore          *int       `json:"auditScore"`
}

func (d linkedDomainRow) public() map[string]any {
	origin := d.SourceURL
	if u, err := url.Parse(d.SourceURL); err == nil {
		origin = u.Scheme + "://" + u.Host
	}
	return map[string]any{
		"id": d.ID, "organizationId": d.OrganizationID, "domainKey": d.DomainKey, "domainSlug": d.DomainSlug, "sourceUrl": d.SourceURL, "marketIds": stringSlice(d.MarketIDs), "status": d.Status, "preferredMethod": d.PreferredMethod, "verifiedMethod": d.VerifiedMethod, "verifiedAt": isoTime(d.VerifiedAt), "localisationAuditId": d.LocalisationAuditID, "projectId": d.ProjectID, "createdAt": isoTime(&d.CreatedAt), "updatedAt": isoTime(&d.UpdatedAt), "auditScore": d.AuditScore,
		"challenges": map[string]any{"token": d.VerificationToken, "dnsTxt": map[string]string{"host": "_hyperlocalise-verify." + d.DomainKey, "value": linkedDomainTokenPrefix + d.VerificationToken}, "htmlFile": map[string]string{"path": linkedDomainHTMLPath, "url": origin + linkedDomainHTMLPath, "body": d.VerificationToken}, "metaTag": map[string]string{"html": `<meta name="` + linkedDomainMetaName + `" content="` + d.VerificationToken + `" />`}},
	}
}

func (api *linkedDomainAPI) load(ctx context.Context, actor workspaceActor, id string) (linkedDomainRow, error) {
	var d linkedDomainRow
	orgWide := actor.role == "admin" || actor.role == "localization_manager"
	err := api.workspace.pool.QueryRow(ctx, `select d.id,d.organization_id,d.domain_key,d.domain_slug,d.source_url,d.market_ids,d.status,d.preferred_method,d.verified_method,d.verified_at,d.localisation_audit_id,d.project_id,d.created_at,d.updated_at,d.verification_token,a.score from linked_domains d left join localisation_audits a on a.id=d.localisation_audit_id where d.id=$1 and d.organization_id=$2 and ($3 or (d.project_id is null and d.created_by_user_id=$4) or exists(select 1 from projects p join team_memberships m on m.user_id=$4 join teams t on t.id=m.team_id where p.id=d.project_id and p.organization_id=$2 and t.organization_id=$2 and (t.id=p.team_id or (p.team_id is null and t.slug='default'))))`, id, actor.organizationID, orgWide, actor.userID).Scan(&d.ID, &d.OrganizationID, &d.DomainKey, &d.DomainSlug, &d.SourceURL, &d.MarketIDs, &d.Status, &d.PreferredMethod, &d.VerifiedMethod, &d.VerifiedAt, &d.LocalisationAuditID, &d.ProjectID, &d.CreatedAt, &d.UpdatedAt, &d.VerificationToken, &d.AuditScore)
	if isNoRows(err) {
		return d, workspaceFailure(404, "linked_domain_not_found", "Linked domain was not found.")
	}
	return d, err
}

func (api *linkedDomainAPI) list(r *http.Request, a workspaceActor) (any, int, error) {
	rows, err := api.workspace.pool.Query(r.Context(), `select d.id,d.organization_id,d.domain_key,d.domain_slug,d.source_url,d.market_ids,d.status,d.preferred_method,d.verified_method,d.verified_at,d.localisation_audit_id,d.project_id,d.created_at,d.updated_at,d.verification_token,la.score from linked_domains d left join localisation_audits la on la.id=d.localisation_audit_id where d.organization_id=$1 and ($2 or (d.project_id is null and d.created_by_user_id=$3) or exists(select 1 from projects p join team_memberships m on m.user_id=$3 join teams t on t.id=m.team_id where p.id=d.project_id and p.organization_id=$1 and t.organization_id=$1 and (t.id=p.team_id or (p.team_id is null and t.slug='default')))) order by d.created_at desc`, a.organizationID, a.role == "admin" || a.role == "localization_manager", a.userID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	result := []map[string]any{}
	for rows.Next() {
		var d linkedDomainRow
		if err := rows.Scan(&d.ID, &d.OrganizationID, &d.DomainKey, &d.DomainSlug, &d.SourceURL, &d.MarketIDs, &d.Status, &d.PreferredMethod, &d.VerifiedMethod, &d.VerifiedAt, &d.LocalisationAuditID, &d.ProjectID, &d.CreatedAt, &d.UpdatedAt, &d.VerificationToken, &d.AuditScore); err != nil {
			return nil, 0, err
		}
		result = append(result, d.public())
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"linkedDomains": result}, 200, nil
}

func (api *linkedDomainAPI) get(r *http.Request, a workspaceActor) (any, int, error) {
	d, err := api.load(r.Context(), a, r.PathValue("linkedDomainId"))
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"linkedDomain": d.public()}, 200, nil
}

func (api *linkedDomainAPI) audit(r *http.Request, a workspaceActor) (any, int, error) {
	d, err := api.load(r.Context(), a, r.PathValue("linkedDomainId"))
	if err != nil {
		return nil, 0, err
	}
	if d.LocalisationAuditID == nil {
		return nil, 0, workspaceFailure(404, "audit_not_found", "No localisation audit is attached to this linked domain.")
	}
	var id, domainKey, domainSlug, sourceURL, status string
	var score *int
	var completedAt *time.Time
	var teaser, report []byte
	var auditOrganizationID *string
	err = api.workspace.pool.QueryRow(r.Context(), `select id,domain_key,domain_slug,source_url,status,score,completed_at,teaser,report,organization_id from localisation_audits where id=$1`, *d.LocalisationAuditID).Scan(&id, &domainKey, &domainSlug, &sourceURL, &status, &score, &completedAt, &teaser, &report, &auditOrganizationID)
	if isNoRows(err) {
		return nil, 0, workspaceFailure(404, "audit_not_found", "Localisation audit was not found.")
	}
	if err != nil {
		return nil, 0, err
	}
	if auditOrganizationID != nil && *auditOrganizationID != a.organizationID {
		return nil, 0, workspaceFailure(404, "linked_domain_not_found", "Linked domain was not found.")
	}
	var teaserValue, reportValue any
	if len(teaser) > 0 {
		_ = json.Unmarshal(teaser, &teaserValue)
	}
	if d.Status == "verified" && len(report) > 0 {
		_ = json.Unmarshal(report, &reportValue)
	}
	return map[string]any{"audit": map[string]any{"id": id, "domainKey": domainKey, "domainSlug": domainSlug, "sourceUrl": sourceURL, "status": status, "score": score, "completedAt": isoTime(completedAt), "teaser": teaserValue, "report": reportValue}}, 200, nil
}

type (
	linkedDomainCreateBody struct {
		DomainSlug string   `json:"domainSlug"`
		Domain     string   `json:"domain"`
		MarketIDs  []string `json:"marketIds"`
	}
	linkedDomainVerifyBody struct {
		Method        string   `json:"method"`
		ProjectID     *string  `json:"projectId"`
		CreateProject *bool    `json:"createProject"`
		MarketIDs     []string `json:"marketIds"`
	}
)

func newVerificationToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func validResearchMarkets(ids []string) bool {
	for _, id := range ids {
		if _, ok := researchMarketByID(id); !ok {
			return false
		}
	}
	return true
}

func normalizedMarketIDs(ids []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func (api *linkedDomainAPI) create(r *http.Request, a workspaceActor) (any, int, error) {
	var body linkedDomainCreateBody
	if decodeWorkspaceBody(r, &body) != nil {
		return nil, 0, workspaceFailure(400, "invalid_linked_domain_payload", "Linked domain payload is invalid.")
	}
	markets := normalizedMarketIDs(body.MarketIDs)
	if !validResearchMarkets(markets) {
		return nil, 0, workspaceFailure(400, "invalid_market_selection", "Select supported markets.")
	}
	var domainKey, domainSlug, source string
	var auditID *string
	if strings.TrimSpace(body.Domain) != "" {
		var err error
		domainKey, domainSlug, source, err = resolveLinkedDomainIdentity(body.Domain)
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_domain_url", "Enter a public domain or URL.")
		}
	} else {
		if !regexp.MustCompile(`^[a-z]+(?:-[a-z]+)*$`).MatchString(body.DomainSlug) {
			return nil, 0, workspaceFailure(400, "invalid_domain_slug", "Domain slug is invalid.")
		}
		var status string
		var report []byte
		var foundAuditID string
		err := api.workspace.pool.QueryRow(r.Context(), `select id,domain_key,domain_slug,source_url,status,report from localisation_audits where domain_slug=$1 limit 1`, body.DomainSlug).Scan(&foundAuditID, &domainKey, &domainSlug, &source, &status, &report)
		if isNoRows(err) {
			return nil, 0, workspaceFailure(404, "audit_not_found", "Localisation audit was not found.")
		}
		if err != nil {
			return nil, 0, err
		}
		if status != "succeeded" || len(report) == 0 || string(report) == "null" {
			return nil, 0, workspaceFailure(400, "audit_not_ready", "Localisation audit must succeed before it can be claimed.")
		}
		auditID = &foundAuditID
		markets = []string{}
	}
	var existing linkedDomainRow
	err := api.workspace.pool.QueryRow(r.Context(), `select id,organization_id,domain_key,domain_slug,source_url,market_ids,status,preferred_method,verified_method,verified_at,localisation_audit_id,project_id,created_at,updated_at,verification_token from linked_domains where domain_key=$1 and status='verified' limit 1`, domainKey).Scan(&existing.ID, &existing.OrganizationID, &existing.DomainKey, &existing.DomainSlug, &existing.SourceURL, &existing.MarketIDs, &existing.Status, &existing.PreferredMethod, &existing.VerifiedMethod, &existing.VerifiedAt, &existing.LocalisationAuditID, &existing.ProjectID, &existing.CreatedAt, &existing.UpdatedAt, &existing.VerificationToken)
	if err == nil && existing.OrganizationID != a.organizationID {
		return nil, 0, workspaceFailure(409, "domain_already_claimed", "This domain is already linked to another workspace.")
	}
	if err != nil && !isNoRows(err) {
		return nil, 0, err
	}
	var current linkedDomainRow
	err = api.workspace.pool.QueryRow(r.Context(), `select id,organization_id,domain_key,domain_slug,source_url,market_ids,status,preferred_method,verified_method,verified_at,localisation_audit_id,project_id,created_at,updated_at,verification_token from linked_domains where organization_id=$1 and domain_key=$2 limit 1`, a.organizationID, domainKey).Scan(&current.ID, &current.OrganizationID, &current.DomainKey, &current.DomainSlug, &current.SourceURL, &current.MarketIDs, &current.Status, &current.PreferredMethod, &current.VerifiedMethod, &current.VerifiedAt, &current.LocalisationAuditID, &current.ProjectID, &current.CreatedAt, &current.UpdatedAt, &current.VerificationToken)
	if err == nil && (current.Status == "pending_verification" || current.Status == "verified") {
		// Idempotent create must still enforce team-scoped access; never return
		// verification challenges for domains the actor cannot load.
		accessible, loadErr := api.load(r.Context(), a, current.ID)
		if loadErr != nil {
			var we *workspaceError
			if errors.As(loadErr, &we) && we.status == http.StatusNotFound {
				return nil, 0, workspaceFailure(409, "claim_pending_exists", "A claim for this domain already exists.")
			}
			return nil, 0, loadErr
		}
		return map[string]any{"linkedDomain": accessible.public()}, 201, nil
	}
	if err != nil && !isNoRows(err) {
		return nil, 0, err
	}
	token, err := newVerificationToken()
	if err != nil {
		return nil, 0, err
	}
	if current.ID != "" {
		_, err = api.workspace.pool.Exec(r.Context(), `update linked_domains set status='pending_verification',verification_token=$2,preferred_method=null,verified_method=null,verified_at=null,localisation_audit_id=$3,source_url=$4,domain_slug=$5,market_ids=$6,created_by_user_id=$7,project_id=null,updated_at=now() where id=$1`, current.ID, token, auditID, source, domainSlug, markets, a.userID)
	} else {
		err = api.workspace.pool.QueryRow(r.Context(), `insert into linked_domains(organization_id,created_by_user_id,domain_key,domain_slug,source_url,market_ids,status,verification_token,localisation_audit_id) values($1,$2,$3,$4,$5,$6,'pending_verification',$7,$8) returning id`, a.organizationID, a.userID, domainKey, domainSlug, source, markets, token, auditID).Scan(&current.ID)
	}
	if err != nil {
		return nil, 0, workspaceFailure(409, "claim_pending_exists", "A claim for this domain already exists.")
	}
	created, err := api.load(r.Context(), a, current.ID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"linkedDomain": created.public()}, 201, nil
}

func resolveLinkedDomainIdentity(raw string) (domainKey, slug, source string, err error) {
	raw = strings.TrimSpace(raw)
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, e := url.Parse(raw)
	if e != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil {
		return "", "", "", errors.New("invalid_url")
	}
	host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	host = strings.TrimPrefix(host, "www.")
	if !isPublicHostname(host) {
		return "", "", "", errors.New("not_public")
	}
	if u.Port() != "" && u.Port() != "80" && u.Port() != "443" {
		return "", "", "", errors.New("invalid_port")
	}
	domainKey = host
	digest := sha256.Sum256([]byte(host))
	base := regexp.MustCompile(`[^a-z]+`).ReplaceAllString(host, "-")
	base = strings.Trim(base, "-")
	suffix := ""
	for _, b := range digest[:] {
		suffix += string(rune('a' + int(b)%26))
		if len(suffix) == 6 {
			break
		}
	}
	slug = base + "-" + suffix
	if base == "" {
		return "", "", "", errors.New("empty_slug")
	}
	return domainKey, slug, u.Scheme + "://" + host + "/", nil
}

func isPublicHostname(host string) bool {
	ip, err := netip.ParseAddr(host)
	if err == nil {
		return isRoutableLinkedDomainIP(ip)
	}
	if strings.Contains(host, "localhost") || !strings.Contains(host, ".") {
		return false
	}
	return true
}

func isRoutableLinkedDomainIP(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() || ip.IsMulticast() {
		return false
	}
	blocked := []string{"100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "2001:db8::/32", "2001:2::/48", "64:ff9b::/96"}
	for _, raw := range blocked {
		prefix, _ := netip.ParsePrefix(raw)
		if prefix.Contains(ip) {
			return false
		}
	}
	return true
}

func (api *linkedDomainAPI) verify(r *http.Request, a workspaceActor) (any, int, error) {
	id := r.PathValue("linkedDomainId")
	var body linkedDomainVerifyBody
	if decodeWorkspaceBody(r, &body) != nil {
		return nil, 0, workspaceFailure(400, "invalid_linked_domain_verify_payload", "Verification method is required.")
	}
	if body.Method != "dns_txt" && body.Method != "html_file" && body.Method != "meta_tag" {
		return nil, 0, workspaceFailure(400, "invalid_linked_domain_verify_payload", "Verification method is required.")
	}
	d, err := api.load(r.Context(), a, id)
	if err != nil {
		return nil, 0, err
	}
	markets := d.MarketIDs
	if body.MarketIDs != nil {
		markets = normalizedMarketIDs(body.MarketIDs)
	}
	if !validResearchMarkets(markets) || d.LocalisationAuditID == nil && len(markets) == 0 {
		return nil, 0, workspaceFailure(400, "invalid_market_selection", "Select supported markets.")
	}
	if d.Status == "verified" {
		return map[string]any{"linkedDomain": d.public()}, 200, nil
	}
	if d.Status != "pending_verification" && d.Status != "failed" {
		return nil, 0, workspaceFailure(400, "linked_domain_not_pending", "This linked domain cannot be verified in its current state.")
	}
	_, err = api.workspace.pool.Exec(r.Context(), `update linked_domains set preferred_method=$2,updated_at=now() where id=$1`, id, body.Method)
	if err != nil {
		return nil, 0, err
	}
	ok, code, msg := verifyLinkedDomain(r.Context(), d, body.Method)
	if !ok {
		_, _ = api.workspace.pool.Exec(r.Context(), `update linked_domains set status='failed',updated_at=now() where id=$1 and status in ('pending_verification','failed')`, id)
		return nil, 0, workspaceFailure(400, code, msg)
	}
	projectID := body.ProjectID
	createProject := (body.CreateProject == nil && projectID == nil) || (body.CreateProject != nil && *body.CreateProject)
	autoCreatedProjectID := ""
	tx, err := api.workspace.pool.Begin(r.Context())
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	var verifiedID string
	err = tx.QueryRow(r.Context(), `select id from linked_domains where domain_key=$1 and status='verified' for update`, d.DomainKey).Scan(&verifiedID)
	if err == nil {
		if verifiedID != id {
			return nil, 0, workspaceFailure(409, "domain_already_claimed", "This domain is already linked to another workspace.")
		}
		if err := tx.Commit(r.Context()); err != nil {
			return nil, 0, err
		}
		verified, err := api.load(r.Context(), a, id)
		if err != nil {
			return nil, 0, err
		}
		return map[string]any{"linkedDomain": verified.public()}, 200, nil
	}
	if err != nil && !isNoRows(err) {
		return nil, 0, err
	}
	if createProject {
		projectID, err = api.createLinkedDomainProject(r.Context(), tx, a, d)
		if err != nil {
			return nil, 0, err
		}
		if projectID != nil {
			autoCreatedProjectID = *projectID
		}
	} else if projectID != nil {
		if err := api.assertAccessibleProject(r.Context(), tx, a, *projectID); err != nil {
			return nil, 0, err
		}
	}
	var newID string
	err = tx.QueryRow(r.Context(), `update linked_domains set status='verified',verified_method=$2,verified_at=now(),preferred_method=$2,project_id=$3,market_ids=$4,updated_at=now() where id=$1 and status in ('pending_verification','failed') returning id`, id, body.Method, projectID, markets).Scan(&newID)
	if isNoRows(err) {
		return nil, 0, workspaceFailure(400, "linked_domain_not_pending", "This linked domain cannot be verified in its current state.")
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.ConstraintName == "uq_linked_domains_verified_domain_key" {
			return nil, 0, workspaceFailure(409, "domain_already_claimed", "This domain is already linked to another workspace.")
		}
		return nil, 0, err
	}
	if d.LocalisationAuditID != nil {
		_, err = tx.Exec(r.Context(), `update localisation_audits set organization_id=$1,linked_domain_id=$2 where id=$3`, a.organizationID, id, *d.LocalisationAuditID)
		if err != nil {
			return nil, 0, err
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		return nil, 0, err
	}
	if autoCreatedProjectID != "" {
		api.recordProjectCreated(r.Context(), a, autoCreatedProjectID, d.DomainKey)
	}
	updated, err := api.load(r.Context(), a, id)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"linkedDomain": updated.public()}, 200, nil
}

func verifyLinkedDomain(ctx context.Context, d linkedDomainRow, method string) (bool, string, string) {
	if method == "dns_txt" {
		records, err := net.DefaultResolver.LookupTXT(ctx, "_hyperlocalise-verify."+d.DomainKey)
		if err != nil {
			return false, "verification_not_found", "DNS TXT record was not found."
		}
		for _, record := range records {
			v := strings.Trim(strings.TrimSpace(record), `"`)
			if v == d.VerificationToken || v == linkedDomainTokenPrefix+d.VerificationToken {
				return true, "", ""
			}
		}
		return false, "verification_mismatch", "DNS TXT record did not match the verification token."
	}
	target := d.SourceURL
	if method == "html_file" {
		u, _ := url.Parse(target)
		target = u.Scheme + "://" + u.Host + linkedDomainHTMLPath
	}
	body, err := fetchVerifiedPublicHTML(ctx, target)
	if err != nil {
		if errors.Is(err, errLinkedHTTPStatus) {
			if method == "html_file" {
				return false, "verification_not_found", "Verification file was not found."
			}
			return false, "verification_not_found", "Homepage was not reachable for meta verification."
		}
		return false, "verification_fetch_failed", "Could not fetch the verification page."
	}
	if method == "html_file" {
		if strings.TrimSpace(body) == d.VerificationToken {
			return true, "", ""
		}
		return false, "verification_mismatch", "Verification file contents did not match the token."
	}
	escaped := regexp.QuoteMeta(d.VerificationToken)
	p1 := regexp.MustCompile(`(?i)<meta\s+[^>]*name=["']` + linkedDomainMetaName + `["'][^>]*content=["']` + escaped + `["'][^>]*/?>`)
	p2 := regexp.MustCompile(`(?i)<meta\s+[^>]*content=["']` + escaped + `["'][^>]*name=["']` + linkedDomainMetaName + `["'][^>]*/?>`)
	if p1.MatchString(body) || p2.MatchString(body) {
		return true, "", ""
	}
	return false, "verification_mismatch", "Homepage meta tag did not match the verification token."
}

var errLinkedHTTPStatus = errors.New("linked_domain_http_status")

func fetchPublicPage(ctx context.Context, raw string) (string, string, int, error) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" {
		return "", "", 0, errors.New("invalid_public_url")
	}
	client := &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }, Transport: &http.Transport{DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, err
		}
		for _, ip := range ips {
			parsed, ok := netip.AddrFromSlice(ip.IP)
			if ok && isRoutableLinkedDomainIP(parsed) {
				return (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, network, net.JoinHostPort(parsed.String(), port))
			}
		}
		return nil, errors.New("non_public_address")
	}}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", "", 0, err
	}
	req.Header.Set("Accept", "text/html")
	resp, err := client.Do(req)
	if err != nil {
		return "", "", 0, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		return "", resp.Header.Get("Location"), resp.StatusCode, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", "", resp.StatusCode, errLinkedHTTPStatus
	}
	bytes, err := io.ReadAll(io.LimitReader(resp.Body, 256*1024+1))
	if err != nil || len(bytes) > 256*1024 {
		return "", "", resp.StatusCode, errors.New("response_limit")
	}
	return string(bytes), "", resp.StatusCode, nil
}

func fetchVerifiedPublicHTML(ctx context.Context, raw string) (string, error) {
	body, _, _, err := fetchPublicPage(ctx, raw)
	return body, err
}

func (api *linkedDomainAPI) assertAccessibleProject(ctx context.Context, db dictionaryDB, a workspaceActor, projectID string) error {
	var found string
	err := db.QueryRow(ctx, `
		select p.id from projects p
		where p.id=$1 and p.organization_id=$2 and `+formatQaProjectTeamAccessSQL(3, 4, 2),
		projectID, a.organizationID, a.orgWideProjectAccess(), a.userID,
	).Scan(&found)
	if isNoRows(err) {
		return workspaceFailure(404, "project_not_found", "Selected project was not found in this workspace.")
	}
	return err
}

func loadTakenProjectIdentifiers(ctx context.Context, db dictionaryDB, organizationID string) (map[string]struct{}, error) {
	taken := map[string]struct{}{}
	rows, err := db.Query(ctx, `select identifier from projects where organization_id=$1`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var identifier string
		if err := rows.Scan(&identifier); err != nil {
			return nil, err
		}
		taken[strings.ToUpper(strings.TrimSpace(identifier))] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	prefixRows, err := db.Query(ctx, `
		select distinct split_part(identifier, '-', 1) as prefix
		from issue_sheet_issues
		where organization_id=$1`, organizationID)
	if err != nil {
		return nil, err
	}
	defer prefixRows.Close()
	for prefixRows.Next() {
		var prefix string
		if err := prefixRows.Scan(&prefix); err != nil {
			return nil, err
		}
		prefix = strings.ToUpper(strings.TrimSpace(prefix))
		if prefix != "" {
			taken[prefix] = struct{}{}
		}
	}
	return taken, prefixRows.Err()
}

func linkedDomainProjectIdentifierCandidate(attempt int, base string) string {
	if attempt <= 1 {
		return base
	}
	suffix := fmt.Sprint(attempt)
	maxBase := 10 - len(suffix)
	if maxBase < 1 {
		maxBase = 1
	}
	if len(base) > maxBase {
		base = base[:maxBase]
	}
	return base + suffix
}

func deriveLinkedDomainProjectIdentifier(domainKey string) string {
	words := regexp.MustCompile(`[A-Za-z0-9]+`).FindAllString(domainKey, -1)
	identifier := "PROJ"
	if len(words) > 1 {
		identifier = strings.ToUpper(string(words[0][0]) + string(words[1][0]))
	} else if len(words) == 1 {
		identifier = strings.ToUpper(words[0][:min(3, len(words[0]))])
	}
	return identifier
}

func (api *linkedDomainAPI) recordProjectCreated(ctx context.Context, a workspaceActor, projectID, name string) {
	payload, err := json.Marshal(map[string]any{
		"name":       name,
		"resourceId": projectID,
		"source":     "native",
	})
	if err != nil {
		return
	}
	_, _ = api.workspace.pool.Exec(ctx, `
		insert into organization_activity_events (
			organization_id, actor_kind, actor_user_id, event_type, target_kind, target_id, payload
		) values ($1,'user',$2,'project_created','project',$3,$4::jsonb)`,
		a.organizationID, a.userID, projectID, payload,
	)
}

func (api *linkedDomainAPI) createLinkedDomainProject(ctx context.Context, tx dictionaryDB, a workspaceActor, d linkedDomainRow) (*string, error) {
	if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtextextended($1, 0))`, "workspace_resource_limit:"+a.organizationID+":projects"); err != nil {
		return nil, workspaceFailure(503, "project_limit_check_failed", "Unable to verify project limits. Try again later.")
	}
	var projectCount int
	if err := tx.QueryRow(ctx, `select count(*)::int from projects where organization_id=$1 and is_active=true`, a.organizationID).Scan(&projectCount); err != nil {
		return nil, workspaceFailure(503, "project_limit_check_failed", "Unable to verify project limits. Try again later.")
	}
	if api.autumn == nil {
		if projectCount >= 1 {
			return nil, workspaceFailure(409, "project_limit_reached", "Project limit reached for your current plan.")
		}
	} else {
		required := float64(projectCount + 1)
		limit, err := api.autumn.Check(ctx, autumn.CheckRequest{CustomerID: a.organizationID, FeatureID: "projects", RequiredBalance: &required, WithPreview: true})
		if err != nil {
			return nil, workspaceFailure(503, "project_limit_check_failed", "Unable to verify project limits. Try again later.")
		}
		if !limit.Allowed {
			return nil, workspaceFailure(409, "project_limit_reached", "Project limit reached for your current plan.")
		}
	}
	var teamID string
	err := tx.QueryRow(ctx, `insert into teams(organization_id,slug,name) values($1,'default','Default team') on conflict(organization_id,slug) do update set slug=excluded.slug returning id`, a.organizationID).Scan(&teamID)
	if err != nil {
		return nil, err
	}
	if a.role != "admin" && a.role != "localization_manager" {
		if _, err := tx.Exec(ctx, `insert into team_memberships(team_id,user_id,role) values($1,$2,'member') on conflict(team_id,user_id) do nothing`, teamID, a.userID); err != nil {
			return nil, err
		}
	}
	taken, err := loadTakenProjectIdentifiers(ctx, tx, a.organizationID)
	if err != nil {
		return nil, err
	}
	baseIdentifier := deriveLinkedDomainProjectIdentifier(d.DomainKey)
	projectID := "project_" + uuid.NewString()
	var createdID string
	for attempt := 1; attempt <= 100; attempt++ {
		candidate := linkedDomainProjectIdentifierCandidate(attempt, baseIdentifier)
		if _, exists := taken[candidate]; exists {
			continue
		}
		err = tx.QueryRow(ctx, `insert into projects(id,organization_id,team_id,created_by_user_id,name,identifier,description,source,source_locale,target_locales) values($1,$2,$3,$4,$5,$6,$7,'native','en-US','{}') on conflict(organization_id,identifier) do nothing returning id`, projectID, a.organizationID, teamID, a.userID, d.DomainKey, candidate, "Linked from localisation audit for "+d.DomainKey).Scan(&createdID)
		if err == nil {
			break
		}
		if !isNoRows(err) {
			return nil, err
		}
		taken[candidate] = struct{}{}
	}
	if createdID == "" {
		return nil, workspaceFailure(503, "project_create_failed", "Could not create the workspace project for this domain.")
	}
	var hasMemory bool
	if err := tx.QueryRow(ctx, `select exists(select 1 from project_memories where project_id=$1)`, createdID).Scan(&hasMemory); err != nil {
		return nil, err
	}
	if !hasMemory {
		var memoryID string
		memoryName := d.DomainKey
		if len(memoryName) > 200 {
			memoryName = memoryName[:200]
		}
		if err := tx.QueryRow(ctx, `insert into memories(organization_id,created_by_user_id,name,description,source) values($1,$2,$3,'','native') returning id`, a.organizationID, a.userID, memoryName).Scan(&memoryID); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `insert into project_memories(organization_id,project_id,memory_id,priority) values($1,$2,$3,0)`, a.organizationID, createdID, memoryID); err != nil {
			return nil, err
		}
	}
	return &createdID, nil
}

func (api *linkedDomainAPI) updateMarkets(r *http.Request, a workspaceActor) (any, int, error) {
	var body struct {
		MarketIDs []string `json:"marketIds"`
	}
	if decodeWorkspaceBody(r, &body) != nil {
		return nil, 0, workspaceFailure(400, "invalid_market_selection", "Select supported markets.")
	}
	markets := normalizedMarketIDs(body.MarketIDs)
	if !validResearchMarkets(markets) {
		return nil, 0, workspaceFailure(400, "invalid_market_selection", "Select supported markets.")
	}
	d, err := api.load(r.Context(), a, r.PathValue("linkedDomainId"))
	if err != nil {
		return nil, 0, err
	}
	if d.Status != "verified" {
		return nil, 0, workspaceFailure(400, "linked_domain_not_verified", "Only verified domains can update markets.")
	}
	if len(markets) == 0 && d.LocalisationAuditID == nil {
		return nil, 0, workspaceFailure(400, "invalid_market_selection", "Select supported markets.")
	}
	_, err = api.workspace.pool.Exec(r.Context(), `update linked_domains set market_ids=$2,updated_at=now() where id=$1`, d.ID, markets)
	if err != nil {
		return nil, 0, err
	}
	updated, err := api.load(r.Context(), a, d.ID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"linkedDomain": updated.public()}, 200, nil
}

func (api *linkedDomainAPI) updateProject(r *http.Request, a workspaceActor) (any, int, error) {
	var body struct {
		ProjectID *string `json:"projectId"`
	}
	if decodeWorkspaceBody(r, &body) != nil {
		return nil, 0, workspaceFailure(400, "invalid_linked_domain_project_payload", "Project assignment is invalid.")
	}
	d, err := api.load(r.Context(), a, r.PathValue("linkedDomainId"))
	if err != nil {
		return nil, 0, err
	}
	if d.Status != "verified" {
		return nil, 0, workspaceFailure(400, "linked_domain_not_verified", "Only verified domains can update their project assignment.")
	}
	if body.ProjectID != nil {
		if err := api.assertAccessibleProject(r.Context(), api.workspace.pool, a, *body.ProjectID); err != nil {
			return nil, 0, err
		}
	}
	_, err = api.workspace.pool.Exec(r.Context(), `update linked_domains set project_id=$2,updated_at=now() where id=$1`, d.ID, body.ProjectID)
	if err != nil {
		return nil, 0, err
	}
	updated, err := api.load(r.Context(), a, d.ID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"linkedDomain": updated.public()}, 200, nil
}

func (api *linkedDomainAPI) cancel(r *http.Request, a workspaceActor) (any, int, error) {
	d, err := api.load(r.Context(), a, r.PathValue("linkedDomainId"))
	if err != nil {
		return nil, 0, err
	}
	if d.Status != "pending_verification" {
		return nil, 0, workspaceFailure(400, "linked_domain_not_pending", "Only pending claims can be cancelled.")
	}
	tag, err := api.workspace.pool.Exec(r.Context(), `delete from linked_domains where id=$1 and organization_id=$2 and status='pending_verification'`, d.ID, a.organizationID)
	if err != nil {
		return nil, 0, err
	}
	if tag.RowsAffected() == 0 {
		return nil, 0, workspaceFailure(404, "linked_domain_not_found", "Linked domain was not found.")
	}
	return nil, http.StatusNoContent, nil
}

func (api *linkedDomainAPI) recommendMarkets(r *http.Request, a workspaceActor) (any, int, error) {
	var body struct {
		Method string `json:"method"`
	}
	if decodeWorkspaceBody(r, &body) != nil {
		return nil, 0, workspaceFailure(400, "invalid_market_recommendations_payload", "Market recommendation payload is invalid.")
	}
	if body.Method != "dns_txt" && body.Method != "html_file" && body.Method != "meta_tag" {
		return nil, 0, workspaceFailure(400, "invalid_market_recommendations_payload", "Verification method is required.")
	}
	d, err := api.load(r.Context(), a, r.PathValue("linkedDomainId"))
	if err != nil {
		return nil, 0, err
	}
	ok, code, msg := verifyLinkedDomain(r.Context(), d, body.Method)
	if !ok {
		return nil, 0, workspaceFailure(400, code, msg)
	}
	if api.research == nil {
		return nil, 0, workspaceFailure(503, "provider_not_configured", "DataForSEO is not configured.")
	}
	html, _ := fetchRecommendationHomepage(r.Context(), d.SourceURL)
	languages := map[string]bool{}
	if html != "" {
		for _, match := range regexp.MustCompile(`(?i)<html\b[^>]*\blang=["']([^"']+)`).FindAllStringSubmatch(html, -1) {
			if lang := localeLanguage(match[1]); lang != "" {
				languages[lang] = true
			}
		}
		for _, match := range regexp.MustCompile(`(?i)<meta\b[^>]*property=["']og:locale["'][^>]*content=["']([^"']+)`).FindAllStringSubmatch(html, -1) {
			if lang := localeLanguage(match[1]); lang != "" {
				languages[lang] = true
			}
		}
		for _, match := range regexp.MustCompile(`(?i)<link\b[^>]*hreflang=["']([^"']+)`).FindAllStringSubmatch(html, -1) {
			if lang := localeLanguage(match[1]); lang != "" {
				languages[lang] = true
			}
		}
	}
	ids := append([]string{}, defaultResearchMarketIDs...)
	for id, m := range researchMarkets {
		if languages[m.Language] && !containsString(ids, id) {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	type result struct {
		value researchMarketVisibilityResponse
		err   error
	}
	results := make([]result, len(ids))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 4)
	for i, id := range ids {
		m := researchMarkets[id]
		wg.Add(1)
		go func(i int, m researchMarket) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			results[i].value, results[i].err = api.researchMarket(r.Context(), d.DomainKey, m)
		}(i, m)
	}
	wg.Wait()
	candidates := []map[string]any{}
	for _, res := range results {
		if res.err == nil {
			candidates = append(candidates, map[string]any{"marketId": res.value.MarketID, "locationCode": res.value.LocationCode, "languageCode": res.value.LanguageCode, "organicCount": res.value.OrganicCount, "organicEtv": res.value.OrganicETV, "top10Count": res.value.Top10Count, "hasOrganicVisibility": res.value.HasOrganicVisibility})
		}
	}
	if len(candidates) == 0 {
		return nil, 0, workspaceFailure(503, "provider_failed", "Market research failed.")
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		a, _ := candidates[i]["organicEtv"].(float64)
		b, _ := candidates[j]["organicEtv"].(float64)
		if a == b {
			aa, _ := candidates[i]["organicCount"].(int)
			bb, _ := candidates[j]["organicCount"].(int)
			return aa > bb
		}
		return a > b
	})
	recommended := []map[string]any{}
	for _, item := range candidates {
		if item["hasOrganicVisibility"] == true {
			recommended = append(recommended, item)
		}
	}
	return map[string]any{"marketRecommendations": map[string]any{"candidates": candidates, "recommended": recommended}}, 200, nil
}

func (api *linkedDomainAPI) researchMarket(ctx context.Context, domain string, market researchMarket) (researchMarketVisibilityResponse, error) {
	return api.workspaceDomainVisibility(ctx, domain, market)
}

func (api *linkedDomainAPI) workspaceDomainVisibility(ctx context.Context, domain string, market researchMarket) (researchMarketVisibilityResponse, error) {
	response, err := api.research.DomainRankOverview(ctx, dataforseo.DomainRankOverviewInput{Target: domain, Market: dataforseo.MarketScope{LocationCode: market.LocationCode, LanguageCode: market.Language}})
	if err != nil {
		return researchMarketVisibilityResponse{}, err
	}
	count, etv, top10 := marketOrganicMetrics(response.Data)
	return researchMarketVisibilityResponse{MarketID: market.ID, LocationCode: market.LocationCode, LanguageCode: market.Language, OrganicCount: count, OrganicETV: etv, Top10Count: top10, HasOrganicVisibility: count > 0 || etv > 0 || top10 > 0, Billing: response.Billing}, nil
}

func localeLanguage(value string) string {
	value = strings.ToLower(strings.TrimSpace(strings.ReplaceAll(value, "_", "-")))
	if value == "" || value == "x-default" {
		return ""
	}
	part := strings.Split(value, "-")[0]
	if regexp.MustCompile(`^[a-z]{2,3}$`).MatchString(part) {
		return part
	}
	return ""
}

func fetchRecommendationHomepage(ctx context.Context, raw string) (string, error) {
	current := raw
	for i := 0; i <= 3; i++ {
		body, location, status, err := fetchPublicPage(ctx, current)
		if err != nil {
			return "", err
		}
		if status >= 300 && status < 400 {
			if location == "" || i == 3 {
				return "", errors.New("redirect_limit")
			}
			base, _ := url.Parse(current)
			next, err := base.Parse(location)
			if err != nil {
				return "", err
			}
			current = next.String()
			continue
		}
		if status < 200 || status >= 300 {
			return "", errLinkedHTTPStatus
		}
		return body, nil
	}
	return "", errors.New("redirect_limit")
}
