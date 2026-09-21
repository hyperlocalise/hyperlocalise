# Go service deployment pipeline

## Status

Accepted

## Context

The infra repository provisions the immutable `hyperlocalise/go-svc` ECR
repository and a GitHub Actions OIDC role for the `hyperlocalise/hyperlocalise`
application repository. The application repository needs a deployment pipeline
that builds the Go service image and publishes it to ECR.

## Decision

Add a dedicated application-repository workflow at
`.github/workflows/go-svc-deploy.yml`.

- Run on changes to the Go service image inputs merged to `main`, or by manual
  dispatch from `main`.
- Authenticate with GitHub Actions OIDC and the existing
  `AWS_DEPLOY_ROLE_ARN` repository variable.
- Read the ECR repository name from its exact Parameter Store key with the AWS
  CLI.
- Build the repository-root `Dockerfile.vercel` for `linux/amd64`.
- Push an immutable tag containing the commit SHA, workflow run ID, and run
  attempt to `hyperlocalise/go-svc`.
- Use GitHub Actions Buildx cache and cancel superseded builds on the same ref.

## Configuration

The application repository must define these repository variables:

- `AWS_REGION`
- `AWS_DEPLOY_ROLE_ARN`

The infra role trust policy must continue to allow the `main` branch subject.
