package main

import "testing"

func TestResearchMarketByID(t *testing.T) {
	market, ok := researchMarketByID("france-fr")
	if !ok {
		t.Fatal("expected france-fr")
	}
	if market.Location != "France" || market.Language != "fr" || market.LocationCode != 2250 {
		t.Fatalf("market = %+v", market)
	}
	if _, ok := researchMarketByID("missing"); ok {
		t.Fatal("expected unknown market to miss")
	}
	for _, id := range defaultResearchMarketIDs {
		if _, ok := researchMarketByID(id); !ok {
			t.Fatalf("default market %s missing", id)
		}
	}
	if len(researchMarkets) < len(defaultResearchMarketIDs) {
		t.Fatalf("catalog %d smaller than defaults", len(researchMarkets))
	}
}
