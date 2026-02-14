/**
 * Default Semantic Configurations Loader
 * 
 * Provides access to built-in semantic configurations for common model types.
 */

/**
 * Get the default annuity/finance semantic configuration
 * 
 * @returns {Promise<string>} The XML configuration text
 */
export async function getDefaultAnnuityFinanceConfig() {
  const response = await fetch('./src/analysis/semantic-configs/annuity-finance-semantic-config.xml')
  if (!response.ok) {
    throw new Error(`Failed to load default semantic configuration: ${response.statusText}`)
  }
  return await response.text()
}

/**
 * List of available default configurations
 * 
 * @returns {Array<Object>} Array of configuration metadata
 */
export function getAvailableConfigs() {
  return [
    {
      id: 'annuity-finance',
      name: 'Annuity/Finance',
      description: 'Default configuration for annuity, pension, and financial models',
      loader: getDefaultAnnuityFinanceConfig
    }
  ]
}
