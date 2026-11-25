package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// Gateway jobs are billed what AI Gateway charged us. Each Gateway response's generation id
// is looked up for its total_cost. When that has nothing (a response without a generation
// id, or a cost Gateway never recorded), the job is priced from Gateway's published model
// prices instead. Either way the dollars reach Autumn through one custom model priced at
// $1 per million output tokens, so one token is one micro-dollar and the AI credit system's
// markup applies as it does to every other charge.

const (
	defaultIrisUSDCreditModel = "custom/hyperlocalise-usd"
	irisMicroUSD              = 1_000_000

	irisCostSourceGateway    = "gateway"
	irisCostSourcePriceTable = "price_table"

	// Gateway ingests usage asynchronously, up to about 90 seconds after the request.
	irisGenerationLookupTimeout = 2 * time.Minute
	irisGenerationLookupDelay   = 5 * time.Second
	irisGatewayPricesTTL        = time.Hour
	irisGenerationIDPrefix      = "gen_"
)

// errIrisCostPending is a generation whose cost Gateway has not recorded yet.
var errIrisCostPending = errors.New("gateway cost not recorded yet")

// irisGatewayCosts reads what AI Gateway charged and what it publishes as its prices.
type irisGatewayCosts interface {
	GenerationCost(ctx context.Context, generationID string) (float64, error)
	ModelPricing(ctx context.Context, gatewayID string) (irisGatewayPricing, bool)
}

// irisPrice is a USD amount Gateway publishes as a decimal string.
type irisPrice float64

func (p *irisPrice) UnmarshalJSON(raw []byte) error {
	text := strings.Trim(string(raw), `"`)
	if text == "" || text == "null" {
		*p = 0
		return nil
	}
	value, err := strconv.ParseFloat(text, 64)
	if err != nil {
		return err
	}
	*p = irisPrice(value)
	return nil
}

// irisGatewayPricing is the part of a Gateway model's published pricing Iris jobs can be
// priced from.
type irisGatewayPricing struct {
	Image      irisPrice `json:"image"`
	ImageSizes []struct {
		Size    string    `json:"size"`
		Quality string    `json:"quality"`
		Cost    irisPrice `json:"cost"`
	} `json:"image_dimension_quality_pricing"`
	VideoDuration []struct {
		Resolution    string    `json:"resolution"`
		Audio         *bool     `json:"audio"`
		Mode          string    `json:"mode"`
		CostPerSecond irisPrice `json:"cost_per_second"`
	} `json:"video_duration_pricing"`
	SpeechInputCharacter irisPrice `json:"speech_input_character_cost"`
	SpeechOutputSecond   irisPrice `json:"speech_output_cost_per_second"`
	TranscriptionSecond  irisPrice `json:"transcription_duration_cost_per_second"`
}

// irisGatewayPrice is what Gateway's published prices say the job cost, or false when they
// do not price it (token-priced models, or a length the job does not know).
func irisGatewayPrice(pricing irisGatewayPricing, model irisModelInfo, job irisJobRecord) (float64, bool) {
	switch {
	case len(pricing.VideoDuration) > 0:
		perSecond, ok := irisVideoPricePerSecond(pricing, job.Request)
		return perSecond * float64(irisDurationSeconds(job)), ok
	case pricing.SpeechInputCharacter > 0 && model.Kind == irisKindVoice:
		chars := utf8.RuneCountInString(job.Request.prompt())
		return float64(pricing.SpeechInputCharacter) * float64(chars), chars > 0
	case pricing.SpeechOutputSecond > 0:
		return float64(pricing.SpeechOutputSecond) * float64(irisOutputAudioSeconds(job)), true
	case pricing.TranscriptionSecond > 0:
		seconds := job.Request.duration()
		return float64(pricing.TranscriptionSecond) * seconds, seconds > 0
	case pricing.Image > 0 || len(pricing.ImageSizes) > 0:
		perImage := irisImagePrice(pricing, job.Request.stringField("resolution"))
		return perImage * float64(irisImageCount(job)), perImage > 0
	default:
		return 0, false
	}
}

// irisVideoPricePerSecond picks the row for the requested resolution and audio. A choice the
// request leaves to the model takes the model's first listed resolution and, where audio is
// priced, audio on (Veo makes it by default); when rows still differ, the dearest is taken
// so a job is never billed less than it cost.
func irisVideoPricePerSecond(pricing irisGatewayPricing, req irisGenerateRequest) (float64, bool) {
	rows := pricing.VideoDuration
	resolution := strings.ToLower(req.stringField("resolution"))
	if resolution == "" {
		for _, row := range rows {
			if row.Resolution == "" {
				resolution = "*"
				break
			}
		}
		if resolution == "" {
			resolution = strings.ToLower(rows[0].Resolution)
		}
	}
	_, audioGiven := req["generateAudio"]
	wantAudio := !audioGiven || req.boolField("generateAudio")
	best, found := 0.0, false
	for _, row := range rows {
		if resolution == "*" && row.Resolution != "" {
			continue
		}
		if resolution != "*" && strings.ToLower(row.Resolution) != resolution {
			continue
		}
		if row.Audio != nil && *row.Audio != wantAudio {
			continue
		}
		if cost := float64(row.CostPerSecond); !found || cost > best {
			best, found = cost, true
		}
	}
	if !found {
		for _, row := range rows {
			if cost := float64(row.CostPerSecond); cost > best {
				best, found = cost, true
			}
		}
	}
	return best, found && best > 0
}

// irisImagePrice is the price of one image at the requested size ("1K", "2K", …), else the
// model's default size, else its flat price.
func irisImagePrice(pricing irisGatewayPricing, resolution string) float64 {
	var fallback float64
	for _, size := range pricing.ImageSizes {
		if size.Quality != "" {
			continue
		}
		if resolution != "" && strings.EqualFold(size.Size, resolution) {
			return float64(size.Cost)
		}
		if strings.EqualFold(size.Size, "default") {
			fallback = float64(size.Cost)
		}
	}
	if fallback > 0 {
		return fallback
	}
	return float64(pricing.Image)
}

// irisMicroDollars is a USD amount as tokens of the $1-per-million custom model, never zero
// for a charge above zero.
func irisMicroDollars(usd float64) int {
	if usd <= 0 {
		return 0
	}
	return max(int(math.Round(usd*irisMicroUSD)), 1)
}

// gatewayJobCost is the sum of what Gateway charged for the job's generations, waiting for
// Gateway to record them. False when the job has none or any one has no cost.
func (api *irisGenerationAPI) gatewayJobCost(ctx context.Context, job irisJobRecord) (float64, bool) {
	if api.gatewayCosts == nil || len(job.GatewayGenerations) == 0 {
		return 0, false
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), irisGenerationLookupTimeout)
	defer cancel()
	var total float64
	for _, id := range job.GatewayGenerations {
		cost, err := api.generationCost(ctx, id)
		if err != nil {
			slog.WarnContext(ctx, "iris_gateway_cost_unavailable", "organization_id", job.OrgID, "job_id", job.ID, "generation_id", id, "error", err)
			return 0, false
		}
		total += cost
	}
	return total, total > 0
}

func (api *irisGenerationAPI) generationCost(ctx context.Context, id string) (float64, error) {
	for {
		cost, err := api.gatewayCosts.GenerationCost(ctx, id)
		if !errors.Is(err, errIrisCostPending) {
			return cost, err
		}
		if err := api.wait(ctx, irisGenerationLookupDelay); err != nil {
			return 0, fmt.Errorf("%w: %w", errIrisCostPending, err)
		}
	}
}

func (api *irisGenerationAPI) wait(ctx context.Context, d time.Duration) error {
	if api.sleep != nil {
		return api.sleep(ctx, d)
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// priceTableCost is the job's cost by Gateway's published prices.
func (api *irisGenerationAPI) priceTableCost(ctx context.Context, job irisJobRecord, model irisModelInfo) (float64, bool) {
	if api.gatewayCosts == nil || strings.TrimSpace(model.GatewayID) == "" {
		return 0, false
	}
	pricing, ok := api.gatewayCosts.ModelPricing(ctx, model.GatewayID)
	if !ok {
		return 0, false
	}
	cost, ok := irisGatewayPrice(pricing, model, job)
	return cost, ok && cost > 0
}

// ---------------------------------------------------------------------------
// Generation ids

type irisGenerationCollectorKey struct{}

// irisGenerationCollector gathers the Gateway generation ids of one job's requests.
type irisGenerationCollector struct {
	mu  sync.Mutex
	ids []string
}

func (c *irisGenerationCollector) add(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, seen := range c.ids {
		if seen == id {
			return
		}
	}
	c.ids = append(c.ids, id)
}

func (c *irisGenerationCollector) list() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]string(nil), c.ids...)
}

// collectIrisGenerationIDs records the generation id a Gateway response carries: the body's
// id (chat completions, and other endpoints that answer with one) or a generation header.
func collectIrisGenerationIDs(ctx context.Context, header http.Header, body []byte) {
	collector, ok := ctx.Value(irisGenerationCollectorKey{}).(*irisGenerationCollector)
	if !ok {
		return
	}
	for name, values := range header {
		if !strings.Contains(strings.ToLower(name), "generation") {
			continue
		}
		for _, value := range values {
			if strings.HasPrefix(strings.TrimSpace(value), irisGenerationIDPrefix) {
				collector.add(strings.TrimSpace(value))
			}
		}
	}
	if len(body) == 0 || body[0] != '{' {
		return
	}
	var parsed struct {
		ID           string `json:"id"`
		GenerationID string `json:"generation_id"`
		Generation   string `json:"generationId"`
	}
	if json.Unmarshal(body, &parsed) != nil {
		return
	}
	for _, id := range []string{parsed.ID, parsed.GenerationID, parsed.Generation} {
		if strings.HasPrefix(id, irisGenerationIDPrefix) {
			collector.add(id)
		}
	}
}

// ---------------------------------------------------------------------------
// Gateway client

// GenerationCost is the USD Gateway debited for a generation, or errIrisCostPending while
// Gateway has not recorded it.
func (p *irisGatewayProvider) GenerationCost(ctx context.Context, generationID string) (float64, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, p.baseURL+"/generation?id="+url.QueryEscape(generationID), nil)
	if err != nil {
		return 0, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return 0, err
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return 0, err
	}
	if resp.StatusCode == http.StatusNotFound {
		return 0, errIrisCostPending
	}
	if resp.StatusCode >= 300 {
		return 0, fmt.Errorf("gateway generation lookup failed: %d %s", resp.StatusCode, truncate(string(body), 200))
	}
	var parsed struct {
		Data struct {
			TotalCost *irisPrice `json:"total_cost"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return 0, err
	}
	if parsed.Data.TotalCost == nil {
		return 0, errors.New("gateway generation has no total_cost")
	}
	return float64(*parsed.Data.TotalCost), nil
}

// ModelPricing is a model's published Gateway pricing, from the model list cached for an
// hour; a stale list is kept when a refresh fails.
func (p *irisGatewayProvider) ModelPricing(ctx context.Context, gatewayID string) (irisGatewayPricing, bool) {
	p.pricesMu.Lock()
	defer p.pricesMu.Unlock()
	if p.prices == nil || time.Since(p.pricesAt) > irisGatewayPricesTTL {
		if prices, err := p.fetchPrices(ctx); err == nil {
			p.prices, p.pricesAt = prices, time.Now()
		} else {
			slog.WarnContext(ctx, "iris_gateway_prices_failed", "error", err)
		}
	}
	pricing, ok := p.prices[gatewayID]
	return pricing, ok
}

func (p *irisGatewayProvider) fetchPrices(ctx context.Context) (map[string]irisGatewayPricing, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, p.baseURL+"/models", nil)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("gateway model list failed: %d", resp.StatusCode)
	}
	var parsed struct {
		Data []struct {
			ID      string          `json:"id"`
			Pricing json.RawMessage `json:"pricing"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 16<<20)).Decode(&parsed); err != nil {
		return nil, err
	}
	prices := make(map[string]irisGatewayPricing, len(parsed.Data))
	for _, model := range parsed.Data {
		var pricing irisGatewayPricing
		if len(model.Pricing) == 0 || json.Unmarshal(model.Pricing, &pricing) != nil {
			continue
		}
		prices[model.ID] = pricing
	}
	return prices, nil
}
