import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { loadXml } from './helpers/xml.js'
import { getFunctionsFromLanguage } from '@/domain/language.js'
import { validateModelCore } from '@/domain/model.js'

describe('New Example Models', () => {
  let languageObj

  beforeAll(() => {
    const languageXml = readFileSync('./docs/examples/language.xml', 'utf-8')
    const languageDoc = loadXml('./docs/examples/language.xml')
    languageObj = getFunctionsFromLanguage(languageDoc, 'language.xml')
  })

  describe('Restaurant Profitability Model', () => {
    it('should load and validate without errors', () => {
      const modelXml = readFileSync('./docs/examples/restaurant-model/model.xml', 'utf-8')
      
      expect(() => {
        validateModelCore(modelXml, 'restaurant-model/model.xml', languageObj)
      }).not.toThrow()
    })

    it('should have approximately 30 variables', () => {
      const modelXml = readFileSync('./docs/examples/restaurant-model/model.xml', 'utf-8')
      const variableCount = (modelXml.match(/<variable id="/g) || []).length
      
      expect(variableCount).toBeGreaterThanOrEqual(25)
      expect(variableCount).toBeLessThanOrEqual(40)
    })
  })

  describe('Airline Profitability Model', () => {
    it('should load and validate without errors', () => {
      const modelXml = readFileSync('./docs/examples/airline-model/model.xml', 'utf-8')
      
      expect(() => {
        validateModelCore(modelXml, 'airline-model/model.xml', languageObj)
      }).not.toThrow()
    })

    it('should have approximately 30 variables', () => {
      const modelXml = readFileSync('./docs/examples/airline-model/model.xml', 'utf-8')
      const variableCount = (modelXml.match(/<variable id="/g) || []).length
      
      expect(variableCount).toBeGreaterThanOrEqual(25)
      expect(variableCount).toBeLessThanOrEqual(50)
    })
  })
})
