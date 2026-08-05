output "resource_group_name" {
  description = "Azure resource group containing the platform resources."
  value       = azurerm_resource_group.platform.name
}

output "api_hostname" {
  description = "Default API host name before custom-domain binding."
  value       = azurerm_linux_web_app.api.default_hostname
}

output "api_managed_identity_principal_id" {
  description = "Managed identity used for Azure data-plane access."
  value       = azurerm_linux_web_app.api.identity[0].principal_id
}

output "key_vault_uri" {
  description = "Key Vault URI for runtime secret references."
  value       = azurerm_key_vault.platform.vault_uri
}

output "service_bus_namespace" {
  description = "Workflow Service Bus namespace."
  value       = azurerm_servicebus_namespace.workflow.name
}

output "audit_storage_account" {
  description = "Storage account holding private evidence containers."
  value       = azurerm_storage_account.evidence.name
}

output "application_insights_connection_string" {
  description = "Application Insights connection string."
  value       = azurerm_application_insights.platform.connection_string
  sensitive   = true
}
