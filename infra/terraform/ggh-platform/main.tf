terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
  tenant_id       = var.tenant_id
}

data "azurerm_client_config" "current" {}

locals {
  name_prefix = lower(replace("${var.organization_code}-${var.environment}", "_", "-"))
  common_tags = merge({
    Organization        = "Ross Tax Pro Software Co."
    Program             = "The Great Gray Horizon Counseling Center"
    Environment         = var.environment
    DataClassification  = "Confidential"
    ManagedBy           = "Terraform"
    CostCenter          = var.cost_center
    Owner               = var.owner_email
  }, var.additional_tags)
}

resource "random_string" "suffix" {
  length  = 6
  upper   = false
  special = false
}

resource "azurerm_resource_group" "platform" {
  name     = "rg-${local.name_prefix}"
  location = var.location
  tags     = local.common_tags
}

resource "azurerm_log_analytics_workspace" "platform" {
  name                = "log-${local.name_prefix}-${random_string.suffix.result}"
  location            = azurerm_resource_group.platform.location
  resource_group_name = azurerm_resource_group.platform.name
  sku                 = "PerGB2018"
  retention_in_days   = var.log_retention_days
  tags                = local.common_tags
}

resource "azurerm_application_insights" "platform" {
  name                = "appi-${local.name_prefix}-${random_string.suffix.result}"
  location            = azurerm_resource_group.platform.location
  resource_group_name = azurerm_resource_group.platform.name
  workspace_id        = azurerm_log_analytics_workspace.platform.id
  application_type    = "web"
  tags                = local.common_tags
}

resource "azurerm_storage_account" "evidence" {
  name                            = substr(replace("st${var.organization_code}${var.environment}${random_string.suffix.result}", "-", ""), 0, 24)
  resource_group_name             = azurerm_resource_group.platform.name
  location                        = azurerm_resource_group.platform.location
  account_tier                    = "Standard"
  account_replication_type        = var.storage_replication_type
  min_tls_version                 = "TLS1_2"
  public_network_access_enabled   = var.allow_public_network_access
  allow_nested_items_to_be_public = false
  shared_access_key_enabled       = false
  infrastructure_encryption_enabled = true
  tags                            = local.common_tags

  blob_properties {
    versioning_enabled  = true
    change_feed_enabled = true

    delete_retention_policy {
      days = var.soft_delete_days
    }

    container_delete_retention_policy {
      days = var.soft_delete_days
    }
  }
}

resource "azurerm_storage_container" "audit" {
  name                  = "audit-evidence"
  storage_account_id    = azurerm_storage_account.evidence.id
  container_access_type = "private"
}

resource "azurerm_storage_container" "documents" {
  name                  = "learner-documents"
  storage_account_id    = azurerm_storage_account.evidence.id
  container_access_type = "private"
}

resource "azurerm_key_vault" "platform" {
  name                          = "kv-${local.name_prefix}-${random_string.suffix.result}"
  location                      = azurerm_resource_group.platform.location
  resource_group_name           = azurerm_resource_group.platform.name
  tenant_id                     = var.tenant_id
  sku_name                      = "standard"
  enable_rbac_authorization     = true
  purge_protection_enabled      = var.enable_purge_protection
  soft_delete_retention_days    = var.key_vault_retention_days
  public_network_access_enabled = var.allow_public_network_access
  tags                          = local.common_tags
}

resource "azurerm_servicebus_namespace" "workflow" {
  name                = "sb-${local.name_prefix}-${random_string.suffix.result}"
  location            = azurerm_resource_group.platform.location
  resource_group_name = azurerm_resource_group.platform.name
  sku                 = var.service_bus_sku
  minimum_tls_version = "1.2"
  local_auth_enabled  = false
  tags                = local.common_tags
}

resource "azurerm_servicebus_queue" "enrollment" {
  name                                    = "enrollment-events"
  namespace_id                            = azurerm_servicebus_namespace.workflow.id
  lock_duration                           = "PT2M"
  max_delivery_count                      = 10
  dead_lettering_on_message_expiration    = true
  duplicate_detection_history_time_window = "PT10M"
  requires_duplicate_detection            = true
}

resource "azurerm_servicebus_queue" "identity" {
  name                                    = "identity-provisioning"
  namespace_id                            = azurerm_servicebus_namespace.workflow.id
  lock_duration                           = "PT2M"
  max_delivery_count                      = 10
  dead_lettering_on_message_expiration    = true
  duplicate_detection_history_time_window = "PT10M"
  requires_duplicate_detection            = true
}

resource "azurerm_servicebus_queue" "learning" {
  name                                    = "learning-workspace-provisioning"
  namespace_id                            = azurerm_servicebus_namespace.workflow.id
  lock_duration                           = "PT2M"
  max_delivery_count                      = 10
  dead_lettering_on_message_expiration    = true
  duplicate_detection_history_time_window = "PT10M"
  requires_duplicate_detection            = true
}

resource "azurerm_service_plan" "api" {
  name                = "asp-${local.name_prefix}"
  resource_group_name = azurerm_resource_group.platform.name
  location            = azurerm_resource_group.platform.location
  os_type             = "Linux"
  sku_name            = var.app_service_sku
  tags                = local.common_tags
}

resource "azurerm_linux_web_app" "api" {
  name                      = "api-${local.name_prefix}-${random_string.suffix.result}"
  resource_group_name       = azurerm_resource_group.platform.name
  location                  = azurerm_resource_group.platform.location
  service_plan_id           = azurerm_service_plan.api.id
  https_only                = true
  public_network_access_enabled = var.allow_public_network_access
  tags                      = local.common_tags

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on           = var.app_service_sku != "F1"
    ftps_state          = "Disabled"
    minimum_tls_version = "1.2"
    http2_enabled       = true

    application_stack {
      node_version = "20-lts"
    }
  }

  app_settings = {
    "APPLICATIONINSIGHTS_CONNECTION_STRING" = azurerm_application_insights.platform.connection_string
    "GGH_ENVIRONMENT"                       = var.environment
    "GGH_AUDIT_CONTAINER"                   = azurerm_storage_container.audit.name
    "GGH_DOCUMENT_CONTAINER"                = azurerm_storage_container.documents.name
    "GGH_SERVICEBUS_NAMESPACE"              = azurerm_servicebus_namespace.workflow.name
    "GGH_KEYVAULT_URI"                      = azurerm_key_vault.platform.vault_uri
    "WEBSITE_RUN_FROM_PACKAGE"              = "1"
  }
}

resource "azurerm_role_assignment" "api_storage_blob" {
  scope                = azurerm_storage_account.evidence.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_linux_web_app.api.identity[0].principal_id
}

resource "azurerm_role_assignment" "api_servicebus" {
  scope                = azurerm_servicebus_namespace.workflow.id
  role_definition_name = "Azure Service Bus Data Owner"
  principal_id         = azurerm_linux_web_app.api.identity[0].principal_id
}

resource "azurerm_role_assignment" "api_keyvault" {
  scope                = azurerm_key_vault.platform.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_web_app.api.identity[0].principal_id
}
