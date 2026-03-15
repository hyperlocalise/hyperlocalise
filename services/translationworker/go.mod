module github.com/quiet-circles/hyperlocalise/services/translationworker

go 1.26

require (
	github.com/quiet-circles/hyperlocalise v0.0.0
	github.com/quiet-circles/hyperlocalise/services/translationsvc v0.0.0
)

replace github.com/quiet-circles/hyperlocalise => ../..

replace github.com/quiet-circles/hyperlocalise/services/translationsvc => ../translationsvc
