package experiment

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
)

type evaluationCache interface {
	get(key string) (cachedEvaluation, bool)
	set(key string, value cachedEvaluation)
}

type cachedEvaluation struct {
	body []byte
	etag string
}

type OFREPHandler struct {
	store Store
	cache evaluationCache
	now   func() time.Time
}

func NewOFREPHandler(store Store) *OFREPHandler {
	return &OFREPHandler{
		store: store,
		cache: newTTLCache(60 * time.Second),
		now:   time.Now,
	}
}

type evaluationRequest struct {
	Context map[string]any `json:"context"`
}

func (h *OFREPHandler) Register(mux *http.ServeMux) {
	mux.Handle("POST /ofrep/v1/evaluate/flags/{key}", ofrepCORS(http.HandlerFunc(h.evaluateOne)))
	mux.Handle("POST /ofrep/v1/evaluate/flags", ofrepCORS(http.HandlerFunc(h.evaluateAll)))
	mux.Handle("OPTIONS /ofrep/v1/evaluate/flags/{key}", ofrepCORS(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})))
	mux.Handle("OPTIONS /ofrep/v1/evaluate/flags", ofrepCORS(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})))
}

func ofrepCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, X-API-Key, Content-Type, If-None-Match")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Expose-Headers", "ETag")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (h *OFREPHandler) evaluateOne(w http.ResponseWriter, r *http.Request) {
	organizationID, keyHash, ok := h.authorize(w, r)
	if !ok {
		return
	}
	req, targetingKey, attributes, ok := readEvaluationRequest(w, r)
	if !ok {
		_ = req
		return
	}
	flag, err := h.store.LoadFlag(r.Context(), organizationID, r.PathValue("key"))
	if err != nil {
		writeGeneralError(w, http.StatusInternalServerError)
		return
	}
	if flag == nil {
		writeJSON(w, http.StatusNotFound, map[string]any{
			"key":          r.PathValue("key"),
			"errorCode":    "FLAG_NOT_FOUND",
			"errorDetails": "Flag was not found",
		})
		return
	}
	resolutions, err := evaluateFlags(r.Context(), h.store, organizationID, []FlagRecord{*flag}, targetingKey, attributes)
	if err != nil {
		writeGeneralError(w, http.StatusInternalServerError)
		return
	}
	go h.store.TouchClientKey(context.WithoutCancel(r.Context()), keyHash)
	writeJSON(w, http.StatusOK, resolutionBody(resolutions[0]))
}

func (h *OFREPHandler) evaluateAll(w http.ResponseWriter, r *http.Request) {
	organizationID, keyHash, ok := h.authorize(w, r)
	if !ok {
		return
	}
	_, targetingKey, attributes, ok := readEvaluationRequest(w, r)
	if !ok {
		return
	}
	cacheKey := organizationID + ":" + targetingKey + ":" + hashAttributes(attributes)
	if cached, hit := h.cache.get(cacheKey); hit {
		if match := strings.Trim(r.Header.Get("If-None-Match"), `"`); match != "" && match == cached.etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("ETag", `"`+cached.etag+`"`)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(cached.body)
		return
	}

	flags, err := h.store.LoadFlags(r.Context(), organizationID)
	if err != nil {
		writeGeneralError(w, http.StatusInternalServerError)
		return
	}
	resolutions, err := evaluateFlags(r.Context(), h.store, organizationID, flags, targetingKey, attributes)
	if err != nil {
		writeGeneralError(w, http.StatusInternalServerError)
		return
	}
	payload := map[string]any{"flags": resolutionList(resolutions)}
	body, err := json.Marshal(payload)
	if err != nil {
		writeGeneralError(w, http.StatusInternalServerError)
		return
	}
	etag := hashBytes(body)
	h.cache.set(cacheKey, cachedEvaluation{body: body, etag: etag})
	go h.store.TouchClientKey(context.WithoutCancel(r.Context()), keyHash)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("ETag", `"`+etag+`"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (h *OFREPHandler) authorize(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	if h.store == nil {
		writeGeneralError(w, http.StatusInternalServerError)
		return "", "", false
	}
	token := extractClientKey(r)
	if token == "" {
		w.WriteHeader(http.StatusUnauthorized)
		return "", "", false
	}
	keyHash := HashClientKey(token)
	organizationID, err := h.store.LookupOrganizationID(r.Context(), keyHash)
	if err != nil {
		if errors.Is(err, errUnauthorized) {
			w.WriteHeader(http.StatusUnauthorized)
			return "", "", false
		}
		writeGeneralError(w, http.StatusInternalServerError)
		return "", "", false
	}
	return organizationID, keyHash, true
}

func extractClientKey(r *http.Request) string {
	if key := strings.TrimSpace(r.Header.Get("X-API-Key")); key != "" {
		return key
	}
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		return strings.TrimSpace(auth[7:])
	}
	return ""
}

func readEvaluationRequest(w http.ResponseWriter, r *http.Request) (evaluationRequest, string, map[string]any, bool) {
	var req evaluationRequest
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"errorCode":    "INVALID_CONTEXT",
			"errorDetails": "Request body could not be read",
		})
		return req, "", nil, false
	}
	if len(body) > 0 {
		if err := json.Unmarshal(body, &req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"errorCode":    "PARSE_ERROR",
				"errorDetails": "Request body is not valid JSON",
			})
			return req, "", nil, false
		}
	}
	if req.Context == nil {
		req.Context = map[string]any{}
	}
	targetingKey, _ := req.Context["targetingKey"].(string)
	if targetingKey == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"errorCode":    "TARGETING_KEY_MISSING",
			"errorDetails": "Context is missing required targetingKey property",
		})
		return req, "", nil, false
	}
	attributes := make(map[string]any, len(req.Context))
	for key, value := range req.Context {
		if key == "targetingKey" {
			continue
		}
		attributes[key] = value
	}
	return req, targetingKey, attributes, true
}

func resolutionBody(resolution Resolution) map[string]any {
	body := map[string]any{
		"key":    resolution.Key,
		"reason": resolution.Reason,
	}
	if resolution.Variant != "" {
		body["variant"] = resolution.Variant
	}
	if resolution.Error != "" {
		body["errorCode"] = resolution.Error
		return body
	}
	if resolution.Value != nil {
		body["value"] = resolution.Value
	}
	return body
}

func resolutionList(resolutions []Resolution) []map[string]any {
	out := make([]map[string]any, 0, len(resolutions))
	for _, resolution := range resolutions {
		out = append(out, resolutionBody(resolution))
	}
	return out
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeGeneralError(w http.ResponseWriter, status int) {
	writeJSON(w, status, map[string]any{"errorDetails": "An internal server error occurred while processing the request"})
}

func hashAttributes(attributes map[string]any) string {
	body, err := json.Marshal(attributes)
	if err != nil {
		return ""
	}
	return hashBytes(body)
}

func hashBytes(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:8])
}
