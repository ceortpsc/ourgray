variable "subscription_id" {
  description = "Azure subscription ID used for deployment."
  type        = string
}

variable "tenant_id" {
  description = "Microsoft Entra tenant ID."
  type        = string
  default     = "eb6c9e4e-0943-4ada-b473-fbafda77eb27"
}

variable "location" {
  description = "Primary Azure region."
  type        = string
  default     = "eastus"
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "test", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, test, staging or prod."
  }
}

variable "organization_code" {
  description = "Short resource-name prefix."
  type        = string
  default     = "ggh"
}

variable "owner_email" {
  description = "Operational owner used in resource tags."
  type        = string
  default     = "CEO@ROSSTAXSOFTWARE.COM"
}

variable "cost_center" {
  description = "Cost-center tag value."
  type        = string
  default     = "GGH-PLATFORM"
}

variable "additional_tags" {
  description = "Additional deployment tags."
  type        = map(string)
  default     = {}
}

variable "log_retention_days" {
  description = "Log Analytics retention period."
  type        = number
  default     = 90

  validation {
    condition     = var.log_retention_days >= 30 && var.log_retention_days <= 730
    error_message = "Log retention must be between 30 and 730 days."
  }
}

variable "soft_delete_days" {
  description = "Storage soft-delete period."
  type        = number
  default     = 30

  validation {
    condition     = var.soft_delete_days >= 7 && var.soft_delete_days <= 365
    error_message = "Storage soft-delete days must be between 7 and 365."
  }
}

variable "key_vault_retention_days" {
  description = "Key Vault soft-delete retention period."
  type        = number
  default     = 90

  validation {
    condition     = var.key_vault_retention_days >= 7 && var.key_vault_retention_days <= 90
    error_message = "Key Vault retention must be between 7 and 90 days."
  }
}

variable "enable_purge_protection" {
  description = "Enable irreversible Key Vault purge protection. Recommended for staging and production."
  type        = bool
  default     = true
}

variable "allow_public_network_access" {
  description = "Permit public network endpoints. Set false after private endpoints and DNS are configured."
  type        = bool
  default     = true
}

variable "storage_replication_type" {
  description = "Storage account replication tier."
  type        = string
  default     = "LRS"

  validation {
    condition     = contains(["LRS", "ZRS", "GRS", "GZRS"], var.storage_replication_type)
    error_message = "Storage replication must be LRS, ZRS, GRS or GZRS."
  }
}

variable "service_bus_sku" {
  description = "Service Bus namespace SKU."
  type        = string
  default     = "Standard"

  validation {
    condition     = contains(["Standard", "Premium"], var.service_bus_sku)
    error_message = "Service Bus SKU must be Standard or Premium."
  }
}

variable "app_service_sku" {
  description = "Linux App Service plan SKU."
  type        = string
  default     = "B1"
}
