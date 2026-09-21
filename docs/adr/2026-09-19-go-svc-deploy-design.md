# Go service deployment pipeline

## Status

Accepted

## Context

The infra repository provisions the immutable `hyperlocalise/go-svc` ECR
repository, the production ECS cluster/service, task IAM roles, and a GitHub
Actions OIDC role for the `hyperlocalise/hyperlocalise` application
repository. The application repository needs a deployment pipeline that builds
the Go service image, publishes it to ECR, and rolls it out to ECS Fargate.

Infra is applied first: the ECR repository, ECS cluster/service, task
definition family, and the three SSM parameters below must exist, and the
deploy role needs `ssm:GetParameters` and ECR image permissions plus
`ecs:DescribeTaskDefinition`, `ecs:RegisterTaskDefinition`,
`ecs:UpdateService` / `ecs:DescribeServices`, and `iam:PassRole` for the task
roles before this workflow runs.

## Decision

Add a dedicated application-repository workflow at
`.github/workflows/go-svc-deploy.yml`.

- Run on changes to the Go service image inputs merged to `main`, or by manual
  dispatch from `main`.
- Authenticate with GitHub Actions OIDC and the existing
  `AWS_DEPLOY_ROLE_ARN` repository variable.
- Read and validate the three infra-published SSM parameters before building
  the image; any missing or empty parameter fails the workflow.
- Build the repository-root `Dockerfile.vercel` for `linux/amd64`.
- Push an immutable tag containing the commit SHA, workflow run ID, and run
  attempt to `hyperlocalise/go-svc`.
- Partial update: clone the live task definition, swap only the container
  image to the new SHA, register the new revision, and point the service at
  it. CPU, memory, roles, secrets, and port mapping carry over untouched, so
  the workflow never reconstructs the full task definition.
- Wait for `aws ecs wait services-stable` to gate the workflow on the rollout.
- Use a 20-minute job timeout and GitHub Actions Buildx cache, and cancel
  superseded builds on the same ref. Untuned ALB defaults cost ~2.5 min of
  health checks plus up to 5 min of deregistration drain per Qovery's ECS
  deployment guide, and the `services-stable` waiter polls for up to ~10 min;
  20 min covers the image build plus that rollout with headroom.

## Configuration

The application repository must define these repository variables:

- `AWS_REGION`
- `AWS_DEPLOY_ROLE_ARN`

The infra role trust policy must continue to allow the `main` branch subject.

### SSM contract (published by infra)

| Parameter | Content |
|-----------|---------|
| `/hyperlocalise/prod/ecr/go-svc/repository_name` | ECR repository name (`hyperlocalise/go-svc`) |
| `/hyperlocalise/prod/ecs/go-svc/cluster_name` | ECS cluster name |
| `/hyperlocalise/prod/ecs/go-svc/service_name` | ECS service name; also the task-definition family |

The workflow reads all three up front and fails fast if any is missing or
empty.

### ECS rollout

- Each deploy pushes an immutable `{sha}-{run_id}-{run_attempt}` image tag,
  then patches only the
  image field of the current task-definition revision (family == service
  name) and moves the service to the new revision. Infra keeps owning the
  target group (`/health` on port `8080`) and every other task setting.
- `wait services-stable` gates the workflow on the rollout.
- Rollback is a redeploy pointing at a previous SHA revision
  (`update-service --task-definition <family>:<revision>`).
