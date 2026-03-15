projectname?=hyperlocalise
version?=$(shell git describe --abbrev=0 --tags 2>/dev/null || echo dev)
golangci_lint_version?=v2.10.1
gobin?=$(shell go env GOPATH)/bin
golangci_lint_bin?=$(gobin)/golangci-lint
fmt_go_files:=$(filter-out %.pb.go,$(shell rg --files -g '*.go'))
default: help

.PHONY: help
help: ## list makefile targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

.PHONY: bump
bump: ## update go dependencies
	go get -u ./...
	go mod tidy

.PHONY: check-build
check-build: ## check golang build
	@go build -ldflags "-X main.version=$(version)" -o /dev/null ./apps/cli

.PHONY: install
install: ## install golang binary
	@go install -ldflags "-X main.version=$(version)" ./apps/cli

.PHONY: run
run: ## run the app
	@go run -ldflags "-X main.version=$(version)" ./apps/cli

.PHONY: bootstrap
bootstrap: ## download tool and module dependencies
	go mod download
	go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$(golangci_lint_version)


.PHONY: test-root
test-root: clean ## run root-module tests with JSON output and coverage
	go test -cover -coverprofile=coverage.out ./...
	go tool cover -func=coverage.out | sort -rnk3

.PHONY: test-workspace
test-workspace: clean ## run workspace tests
	go test -cover -coverprofile=coverage.out ./...
	go tool cover -func=coverage.out | sort -rnk3

.PHONY: test
test: test-workspace ## run workspace-wide tests


.PHONY: bench-runsvc
bench-runsvc: ## run focused runsvc benchmarks
	go test -run '^$$' -bench 'Benchmark(PlanTasksSharedSourceMappings|ExactCacheKey|RunLargeBatch)' -benchmem -benchtime=20x ./apps/cli/internal/i18n/runsvc


.PHONY: bench-evalsvc
bench-evalsvc: ## run focused evalsvc benchmarks
	go test -run '^$$' -bench 'BenchmarkRunLargeBatch' -benchmem -benchtime=20x ./apps/cli/internal/i18n/evalsvc
	go test -run '^$$' -bench 'Benchmark(EvaluatorEvaluate|PlaceholderTokens|TokenF1|NormalizeText)' -benchmem -benchtime=20x ./apps/cli/internal/i18n/evalsvc/scoring


.PHONY: clean
clean: ## clean up environment
	@rm -rf coverage.out test-report.jsonl dist/ $(projectname)


.PHONY: cover
cover: ## display root-module test coverage
	go test -v -race $(shell go list ./... | grep -v /vendor/) -v -coverprofile=coverage.out
	go tool cover -func=coverage.out


.PHONY: fmt
fmt: ## format go files
	go tool gofumpt -w $(fmt_go_files)
	go tool gci write $(fmt_go_files)


.PHONY: lint
lint: ## lint go files
	$(golangci_lint_bin) run ./...


.PHONY: precommit
precommit: ## run local CI validation flow
	make clean
	make fmt
	git diff --exit-code
	make lint
	make test-workspace
	make check-build

.PHONY: staticcheck
staticcheck: ## run staticcheck directly
	go tool staticcheck ./...

.PHONY: bazel-build
bazel-build: ## build Bazel-scaffolded targets
	bazel build //:cli //apps/translation-service:translation-service

.PHONY: bazel-test
bazel-test: ## run Bazel-scaffolded tests
	bazel test //apps/cli/cmd:cmd_test
