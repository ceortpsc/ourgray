# Great Gray Horizon Azure Platform Blueprint

This Terraform root provisions the private API and workflow foundation for The Great Gray Horizon Counseling Center. It intentionally does not create payment-provider credentials, OpenAI API keys, Microsoft Graph client secrets, Cloudflare credentials or learner accounts.

## Provisioned resources

- resource group and standardized tags;
- Log Analytics and Application Insights;
- private evidence and learner-document blob containers;
- Key Vault with RBAC and purge-protection controls;
- Service Bus queues for enrollment, identity and learning-workspace jobs;
- Linux App Service plan and API web app;
- system-assigned managed identity;
- data-plane RBAC for storage, Service Bus and Key Vault.

## Security position

1. Use Azure workload identity or managed identity rather than long-lived deployment secrets.
2. Keep Terraform state in a protected remote backend with encryption, locking and restricted access.
3. Do not place secrets in `.tfvars`, GitHub, Cloudflare Pages, browser code or Terraform outputs.
4. Set `allow_public_network_access=false` only after private endpoints, DNS and administrative access paths exist.
5. Purge protection is enabled by default and cannot be casually reversed after deployment.
6. The API managed identity still requires separately approved Microsoft Graph application permissions for directory provisioning.
7. Payment webhook verification and AI-provider requests remain server-side application responsibilities.

## Environment files

Create an untracked variables file for each environment:

```hcl
subscription_id             = "00000000-0000-0000-0000-000000000000"
tenant_id                   = "eb6c9e4e-0943-4ada-b473-fbafda77eb27"
environment                 = "dev"
location                    = "eastus"
owner_email                 = "CEO@ROSSTAXSOFTWARE.COM"
allow_public_network_access = true
```

Never commit that file when it contains non-public infrastructure identifiers or organization-specific configuration.

## Validation and deployment

```bash
cd infra/terraform/ggh-platform
terraform init
terraform fmt -check -recursive
terraform validate
terraform plan -var-file=dev.auto.tfvars
terraform apply -var-file=dev.auto.tfvars
```

Use a saved plan and an approval gate for staging and production:

```bash
terraform plan -var-file=prod.auto.tfvars -out=prod.tfplan
terraform show prod.tfplan
terraform apply prod.tfplan
```

## Required follow-on controls

Before production traffic:

- create private endpoints and private DNS zones;
- configure WAF or API gateway rate limiting;
- configure custom domains and managed certificates;
- assign least-privilege Microsoft Graph application permissions;
- bind Key Vault secret references in the application settings;
- add database resources and migration controls;
- configure malware scanning for uploaded files;
- configure immutable audit retention and legal-hold procedures;
- add backup, restore and disaster-recovery tests;
- enable deployment approvals and branch protections;
- perform accessibility, penetration and privacy testing.

## Cost boundary

These resources can create Azure charges. Run `terraform plan`, review the selected region and SKUs, and obtain financial approval before `terraform apply`.
