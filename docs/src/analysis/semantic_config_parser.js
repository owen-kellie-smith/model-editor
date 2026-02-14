/**
 * Semantic Configuration Parser
 * 
 * Parses XML-based semantic configurations for variable clustering.
 * These configurations define keywords, patterns, and domain mappings
 * that help the clustering algorithm group related variables semantically.
 */

import { DOMParser } from '@xmldom/xmldom'
import xpath from 'xpath'

/**
 * Parse semantic configuration from XML text
 * 
 * @param {string} xmlText - The XML configuration text
 * @returns {Object} Parsed configuration object with keywords, domains, and parameters
 * @throws {Error} If XML is malformed or configuration is invalid
 */
export function parseSemanticConfig(xmlText) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'text/xml')
  
  // Check for parsing errors
  const parserErrors = xpath.select('//parsererror', doc)
  if (parserErrors.length > 0) {
    throw new Error('Failed to parse semantic configuration XML: malformed XML')
  }
  
  const root = xpath.select1('/semanticConfig', doc)
  if (!root) {
    throw new Error('Invalid semantic configuration: missing <semanticConfig> root element')
  }
  
  // Parse keywords
  const keywords = parseKeywords(doc)
  
  // Parse domains
  const domains = parseDomains(doc, keywords)
  
  // Parse clustering parameters
  const parameters = parseParameters(doc)
  
  return {
    keywords,
    domains,
    parameters
  }
}

/**
 * Parse keyword definitions from the configuration
 * 
 * @param {Document} doc - The XML document
 * @returns {Map<string, Array<string>>} Map of keyword ID to array of patterns
 */
function parseKeywords(doc) {
  const keywords = new Map()
  const keywordNodes = xpath.select('/semanticConfig/keywords/keyword', doc)
  
  for (const keywordNode of keywordNodes) {
    const id = keywordNode.getAttribute('id')
    if (!id) {
      throw new Error('Keyword missing required "id" attribute')
    }
    
    const patterns = []
    const patternNodes = xpath.select('patterns/pattern', keywordNode)
    
    for (const patternNode of patternNodes) {
      const pattern = patternNode.textContent?.trim()
      if (pattern) {
        patterns.push(pattern.toLowerCase())
      }
    }
    
    if (patterns.length === 0) {
      throw new Error(`Keyword "${id}" has no patterns defined`)
    }
    
    keywords.set(id, patterns)
  }
  
  if (keywords.size === 0) {
    throw new Error('No keywords defined in semantic configuration')
  }
  
  return keywords
}

/**
 * Parse domain definitions from the configuration
 * 
 * @param {Document} doc - The XML document
 * @param {Map<string, Array<string>>} keywords - Parsed keywords map
 * @returns {Array<Object>} Array of domain objects
 */
function parseDomains(doc, keywords) {
  const domains = []
  const domainNodes = xpath.select('/semanticConfig/domains/domain', doc)
  
  for (const domainNode of domainNodes) {
    const keywordId = domainNode.getAttribute('keywordId')
    const displayName = domainNode.getAttribute('displayName')
    
    if (!keywordId) {
      throw new Error('Domain missing required "keywordId" attribute')
    }
    
    if (!displayName) {
      throw new Error('Domain missing required "displayName" attribute')
    }
    
    if (!keywords.has(keywordId)) {
      throw new Error(`Domain references unknown keyword ID: "${keywordId}"`)
    }
    
    domains.push({
      keywordId,
      displayName,
      patterns: keywords.get(keywordId)
    })
  }
  
  if (domains.length === 0) {
    throw new Error('No domains defined in semantic configuration')
  }
  
  return domains
}

/**
 * Parse clustering parameters from the configuration
 * 
 * @param {Document} doc - The XML document
 * @returns {Object} Clustering parameters with validated values
 */
function parseParameters(doc) {
  const params = {
    minClusterSize: 3,
    maxClusterSize: 50,
    semanticThreshold: 0.3
  }
  
  const paramsNode = xpath.select1('/semanticConfig/clusteringParameters', doc)
  if (!paramsNode) {
    return params // Return defaults if no parameters section
  }
  
  // Parse minClusterSize
  const minNode = xpath.select1('minClusterSize', paramsNode)
  if (minNode) {
    const value = parseInt(minNode.textContent?.trim() || '', 10)
    if (isNaN(value) || value < 1) {
      throw new Error('minClusterSize must be a positive integer')
    }
    params.minClusterSize = value
  }
  
  // Parse maxClusterSize
  const maxNode = xpath.select1('maxClusterSize', paramsNode)
  if (maxNode) {
    const value = parseInt(maxNode.textContent?.trim() || '', 10)
    if (isNaN(value) || value < 1) {
      throw new Error('maxClusterSize must be a positive integer')
    }
    params.maxClusterSize = value
  }
  
  // Parse semanticThreshold
  const thresholdNode = xpath.select1('semanticThreshold', paramsNode)
  if (thresholdNode) {
    const value = parseFloat(thresholdNode.textContent?.trim() || '')
    if (isNaN(value) || value < 0 || value > 1) {
      throw new Error('semanticThreshold must be a number between 0 and 1')
    }
    params.semanticThreshold = value
  }
  
  // Validate parameter relationships
  if (params.minClusterSize > params.maxClusterSize) {
    throw new Error('minClusterSize cannot be greater than maxClusterSize')
  }
  
  return params
}
