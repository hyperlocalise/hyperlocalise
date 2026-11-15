package main

import (
	"net/http"
	"strings"
	"time"
)

type publicOtaDistribution struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	PublicHash  string  `json:"publicHash"`
	BranchName  string  `json:"branchName"`
	Format      string  `json:"format"`
	ManifestURL *string `json:"manifestUrl"`
	RevokedAt   *string `json:"revokedAt"`
}

func publicOtaFormat(format string) string {
	switch strings.ReplaceAll(format, "_", "-") {
	case "android-xml":
		return "android-xml"
	case "ios-strings":
		return "ios-strings"
	default:
		return "json"
	}
}

func (s apiServer) projectOtaDistributions(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	p, ok := s.authenticate(w, r, "files:read")
	if !ok {
		return
	}
	if _, err := s.store.getProject(r.Context(), p, projectID); err != nil {
		writeStoreError(w, err, "get project")
		return
	}
	if s.pool == nil {
		writeError(w, http.StatusServiceUnavailable, "service_unavailable", "Resource storage is temporarily unavailable")
		return
	}
	rows, err := s.pool.Query(r.Context(), `
		select d.id, d.name, d.public_hash, d.branch_name, d.format, d.revoked_at
		from ota_distributions d
		where d.project_id=$1 and d.organization_id=$2
		order by d.created_at`, projectID, p.OrganizationID)
	if err != nil {
		writeStoreError(w, err, "list ota distributions")
		return
	}
	defer rows.Close()
	distributions := []publicOtaDistribution{}
	for rows.Next() {
		var item publicOtaDistribution
		var revokedAt *time.Time
		var format string
		if err := rows.Scan(&item.ID, &item.Name, &item.PublicHash, &item.BranchName, &format, &revokedAt); err != nil {
			writeStoreError(w, err, "list ota distributions")
			return
		}
		item.Format = publicOtaFormat(format)
		if revokedAt != nil {
			formatted := revokedAt.UTC().Format(time.RFC3339Nano)
			item.RevokedAt = &formatted
		} else {
			manifestURL := "https://public-api.hyperlocalise.com/ota/" + item.PublicHash + "/manifest.json"
			item.ManifestURL = &manifestURL
		}
		distributions = append(distributions, item)
	}
	if err := rows.Err(); err != nil {
		writeStoreError(w, err, "list ota distributions")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"distributions": distributions})
}
