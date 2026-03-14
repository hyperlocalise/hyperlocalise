package service

import platformconfig "github.com/quiet-circles/hyperlocalise/pkg/platform/config"

type Service struct {
	Config platformconfig.ServiceConfig
}

func New(cfg platformconfig.ServiceConfig) Service {
	return Service{Config: cfg}
}
