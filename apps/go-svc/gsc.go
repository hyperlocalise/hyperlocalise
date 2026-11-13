package main

import (
	"context"

	"github.com/hyperlocalise/hyperlocalise/internal/gsc"
	"golang.org/x/oauth2"
)

type gscService interface {
	ListSites(ctx context.Context, accessToken string) ([]gsc.Site, error)
	QuerySearchAnalytics(
		ctx context.Context,
		accessToken string,
		siteURL string,
		request gsc.SearchAnalyticsRequest,
	) ([]gsc.SearchAnalyticsRow, error)
	InspectURL(
		ctx context.Context,
		accessToken string,
		siteURL string,
		inspectionURL string,
		languageCode string,
	) (*gsc.URLInspectionResult, error)
}

type liveGscService struct{}

func newGscClient(accessToken string) (*gsc.Client, error) {
	return gsc.NewClient(gsc.Config{
		TokenSource: oauth2.StaticTokenSource(&oauth2.Token{AccessToken: accessToken}),
	})
}

func (liveGscService) ListSites(ctx context.Context, accessToken string) ([]gsc.Site, error) {
	client, err := newGscClient(accessToken)
	if err != nil {
		return nil, err
	}
	return client.ListSites(ctx)
}

func (liveGscService) QuerySearchAnalytics(
	ctx context.Context,
	accessToken string,
	siteURL string,
	request gsc.SearchAnalyticsRequest,
) ([]gsc.SearchAnalyticsRow, error) {
	client, err := newGscClient(accessToken)
	if err != nil {
		return nil, err
	}
	return client.QuerySearchAnalytics(ctx, siteURL, request)
}

func (liveGscService) InspectURL(
	ctx context.Context,
	accessToken string,
	siteURL string,
	inspectionURL string,
	languageCode string,
) (*gsc.URLInspectionResult, error) {
	client, err := newGscClient(accessToken)
	if err != nil {
		return nil, err
	}
	return client.InspectURL(ctx, siteURL, inspectionURL, languageCode)
}
