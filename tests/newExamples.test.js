import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { loadXml } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.js'
import { getFunctionsFromLanguage } from '@/core/language.js'
import { validateModelCore } from '@/core/model.js'

describe('New Example Models', () => {
  let languageObj

  beforeAll(() => {
    const langFile = getFixture('exLanguage/language.xml')
    const languageXml = readFileSync(langFile, 'utf-8')
    const languageDoc = loadXml(langFile)
    languageObj = getFunctionsFromLanguage(languageDoc, 'language.xml')
  })

  describe('Restaurant Profitability Model', () => {
    it('should load and validate without errors', () => {
      const modelXml = readFileSync(getFixture('restaurant/model.xml'), 'utf-8')
      
      expect(() => {
        validateModelCore(modelXml, 'restaurant-model/model.xml', languageObj, { ignoreUnits: true })
      }).not.toThrow()
    })

    it('should have approximately 30 variables', () => {
      const modelXml = readFileSync(getFixture('restaurant/model.xml'), 'utf-8')
      const variableCount = (modelXml.match(/<variable id="/g) || []).length
      
      expect(variableCount).toBeGreaterThanOrEqual(25)
      expect(variableCount).toBeLessThanOrEqual(40)
    })
  })

  describe('Airline Profitability Model', () => {
    it('should load and validate without errors', () => {
      const modelXml = readFileSync(getFixture('airline/model.xml'), 'utf-8')
      
      expect(() => {
        validateModelCore(modelXml, 'airline-model/model.xml', languageObj, { ignoreUnits: true })
      }).not.toThrow()
    })

    it('should have approximately 30 variables', () => {
      const modelXml = readFileSync(getFixture('airline/model.xml'), 'utf-8')
      const variableCount = (modelXml.match(/<variable id="/g) || []).length
      
      expect(variableCount).toBeGreaterThanOrEqual(25)
      expect(variableCount).toBeLessThanOrEqual(50)
    })
  })
})
