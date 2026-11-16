package main

import (
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

var figmaAttachmentErrorResponses = []storeErrorResponse{
	{errFigmaAttachmentNotFound, http.StatusNotFound, "figma_attachment_not_found", "Figma attachment not found"},
	{errFigmaAttachmentInvalidURL, http.StatusBadRequest, "invalid_figma_url", "url must be an https figma.com link to a file, design, prototype, board, or slides"},
}

func writeFigmaAttachmentError(w http.ResponseWriter, err error, operation string) {
	for _, response := range figmaAttachmentErrorResponses {
		if errors.Is(err, response.err) {
			writeError(w, response.status, response.code, response.message)
			return
		}
	}
	writeKeyStoreError(w, err, operation)
}

// authenticateFigmaWrite checks the token may change a project's design context. A Figma
// attachment describes strings the way a design link does, so the same roles change it.
func (s apiServer) authenticateFigmaWrite(w http.ResponseWriter, r *http.Request) (principal, bool) {
	p, ok := s.authenticateWithStore(w, r, "strings:write")
	if !ok {
		return principal{}, false
	}
	if !canEditKeyDetails(p.Role) {
		writeError(w, http.StatusForbidden, "forbidden", "Only admins, localization managers and developers can change Figma attachments")
		return principal{}, false
	}
	return p, true
}

type figmaAttachmentResponse struct {
	FigmaAttachment figmaAttachment `json:"figmaAttachment"`
}

func (s apiServer) projectFigmaAttachments(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodPost) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	if r.Method == http.MethodPost {
		s.createFigmaAttachment(w, r, projectID)
		return
	}
	p, ok := s.authenticateWithStore(w, r, "strings:read")
	if !ok {
		return
	}
	values := r.URL.Query()
	page, valid := parsePagination(w, values, 50)
	if !valid {
		return
	}
	stringID := strings.TrimSpace(values.Get("stringId"))
	if stringID != "" {
		if _, err := uuid.Parse(stringID); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_query", "stringId must be a string id")
			return
		}
	}
	items, total, err := s.store.listFigmaAttachments(r.Context(), p, projectID, figmaAttachmentFilters{
		StringID: stringID, Limit: page.Limit, Offset: page.Offset,
	})
	if err != nil {
		writeFigmaAttachmentError(w, err, "list figma attachments")
		return
	}
	page.Total = total
	writeJSON(w, http.StatusOK, struct {
		FigmaAttachments []figmaAttachment `json:"figmaAttachments"`
		Pagination       pagination        `json:"pagination"`
	}{items, page})
}

func (s apiServer) createFigmaAttachment(w http.ResponseWriter, r *http.Request, projectID string) {
	p, ok := s.authenticateFigmaWrite(w, r)
	if !ok {
		return
	}
	var body struct {
		URL string `json:"url"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	item, err := s.store.createFigmaAttachment(r.Context(), p, projectID, strings.TrimSpace(body.URL))
	if err != nil {
		writeFigmaAttachmentError(w, err, "create figma attachment")
		return
	}
	writeJSON(w, http.StatusOK, figmaAttachmentResponse{item})
}

func (s apiServer) projectFigmaAttachment(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodDelete) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	attachmentID, ok := pathID(w, r, "attachmentId")
	if !ok {
		return
	}
	if r.Method == http.MethodDelete {
		p, ok := s.authenticateFigmaWrite(w, r)
		if !ok {
			return
		}
		if err := s.store.deleteFigmaAttachment(r.Context(), p, projectID, attachmentID); err != nil {
			writeFigmaAttachmentError(w, err, "delete figma attachment")
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	p, ok := s.authenticateWithStore(w, r, "strings:read")
	if !ok {
		return
	}
	item, err := s.store.getFigmaAttachment(r.Context(), p, projectID, attachmentID)
	if err != nil {
		writeFigmaAttachmentError(w, err, "get figma attachment")
		return
	}
	writeJSON(w, http.StatusOK, figmaAttachmentResponse{item})
}

func (s apiServer) projectFigmaAttachmentStrings(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodPost, http.MethodDelete) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	attachmentID, ok := pathID(w, r, "attachmentId")
	if !ok {
		return
	}
	if r.Method == http.MethodGet {
		p, ok := s.authenticateWithStore(w, r, "strings:read")
		if !ok {
			return
		}
		page, valid := parsePagination(w, r.URL.Query(), 50)
		if !valid {
			return
		}
		items, total, err := s.store.listFigmaAttachmentStrings(r.Context(), p, projectID, attachmentID, page.Limit, page.Offset)
		if err != nil {
			writeFigmaAttachmentError(w, err, "list figma attachment strings")
			return
		}
		page.Total = total
		writeJSON(w, http.StatusOK, struct {
			Strings    []figmaAttachmentString `json:"strings"`
			Pagination pagination              `json:"pagination"`
		}{items, page})
		return
	}
	p, ok := s.authenticateFigmaWrite(w, r)
	if !ok {
		return
	}
	var body selectorBody
	if !decodeJSONBodyLimit(w, r, &body, maxStringBatchBodyBytes) {
		return
	}
	sel, valid := body.selector(true)
	if !valid {
		writeError(w, http.StatusBadRequest, "invalid_body", selectorMessage)
		return
	}
	if r.Method == http.MethodPost {
		linked, err := s.store.linkFigmaAttachmentStrings(r.Context(), p, projectID, attachmentID, sel)
		if err != nil {
			writeFigmaAttachmentError(w, err, "link figma attachment strings")
			return
		}
		writeJSON(w, http.StatusOK, struct {
			Linked int `json:"linked"`
		}{linked})
		return
	}
	unlinked, err := s.store.unlinkFigmaAttachmentStrings(r.Context(), p, projectID, attachmentID, sel)
	if err != nil {
		writeFigmaAttachmentError(w, err, "unlink figma attachment strings")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Unlinked int `json:"unlinked"`
	}{unlinked})
}
