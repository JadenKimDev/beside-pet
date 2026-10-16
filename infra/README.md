# Infrastructure

Pulumi is the inventory and provisioning entry point for the active web product. The Flutter app and its GCP API are inactive under `archive/` and are outside this infrastructure project.

| Workload | Current hosting | Pulumi mode in checked-in stacks |
| --- | --- | --- |
| Chat web and API | AWS CloudFront → EC2; ECR images; RDS database | `external` |
| Landing site | Vercel, configured outside this repository | external |

`external` records outputs and creates no application infrastructure. `managed` creates protected ECR repositories for a **new** web environment. Existing CloudFront, EC2, RDS, IAM and Vercel resources are not silently adopted. Import each existing resource deliberately, using its cloud ID and a reviewed Pulumi preview, before changing its ownership.

## Local use

```bash
pnpm install --frozen-lockfile
pulumi login                         # choose a shared backend for team use
cd infra
pulumi stack select dev --create
pulumi preview
```

The checked-in `Pulumi.dev.yaml` and `Pulumi.prod.yaml` contain identifiers and defaults only. They do not contain credentials. A stack name is an environment, not an AWS account. Set cloud credentials and choose the Pulumi state backend for that environment before running `pulumi up`.

For a new managed AWS web environment:

```bash
pulumi stack init staging
pulumi config set awsWebOwnership managed
pulumi config set awsRegion ap-northeast-2
pulumi preview
```

This creates protected ECR repositories only. It does not create an EC2 host or CloudFront distribution; those require an explicit hosting decision and separate Pulumi modules. The current EC2 host is shared by the chat web and API, and its bootstrap script and RDS settings are outside this snapshot.

## Release contract

- Root CI checks the Node workspace and Pulumi source.
- `deploy-chat.yml` builds from the selected component directory and invokes the current EC2 `/opt/besidepet/deploy.sh` through SSM. GitHub environment `chat-prod` needs `AWS_DEPLOY_ROLE_ARN`, `AWS_ECR_REGISTRY`, `CHAT_INSTANCE_ID`, and `CHAT_URL` variables. The AWS OIDC role must trust the new monorepo identity and be allowed to push to ECR and send SSM commands.
- The checked-in workflows inside the chat app and API are historical references; only root `.github/workflows` files run in this repository.

Pulumi preview and `up` change infrastructure. GitHub deployment workflows change running application images.

## Existing resource adoption

Use the [Pulumi import workflow](https://www.pulumi.com/docs/iac/guides/migration/import/) to adopt a resource one at a time. Imported resources are protected by default. Compare the generated program with the live resource and keep `protect: true`; a resource name alone is not an import. Start with ECR, then the EC2/CloudFront/RDS group after their dependencies and ownership are documented. Do not switch `awsWebOwnership` to `managed` on `dev` simply to point it at the current ECR repositories: that mode declares new repositories with stack-specific names.
