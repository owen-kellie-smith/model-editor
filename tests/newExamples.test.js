import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { getFixture } from './helpers/fixtures.js'
import { validateModelCore } from '@/core/model.js'

describe('New Example Models', () => {

  describe('Restaurant Profitability Model', () => {
    it('should load and validate without errors', () => {
      const modelXml = readFileSync(getFixture('restaurant/model.xml'), 'utf-8')
      
      expect(() => {
        validateModelCore(modelXml, 'restaurant-model/model.xml', null, { ignoreUnits: true })
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
        validateModelCore(modelXml, 'airline-model/model.xml', null, { ignoreUnits: true })
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
