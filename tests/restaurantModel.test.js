import { describe, it, expect, beforeAll } from 'vitest'
import { validateModelCore } from '@/core/model.js'
import { getFunctionsFromLanguage } from '@/core/language.js'
import { loadXml } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.ts'
import fs from 'fs'
import path from 'path'

describe('Restaurant Model Spreadsheet Export', () => {
  let lang
  let restaurantModel
  
  beforeAll(() => {
    // Load language
    const languageFixture = getFixture('language.xml')
    const languageXml = loadXml(languageFixture)
    lang = getFunctionsFromLanguage(languageXml, 'test')
    
    // Load restaurant model
    const restaurantModelPath = getFixture( 'restaurant/model.xml')
    const restaurantModelXml = fs.readFileSync(restaurantModelPath, 'utf-8')
    restaurantModel = validateModelCore(restaurantModelXml, 'restaurant-model.xml', lang)
  })

  it('should load and validate the restaurant model', () => {
    expect(restaurantModel).toBeTruthy()
    expect(restaurantModel.obj).toBeTruthy()
    expect(restaurantModel.features).toBeTruthy()
    expect(restaurantModel.features.variables).toBeTruthy()
    expect(restaurantModel.features.variables.length).toBeGreaterThan(0)
  })

  it('should have no tables defined in restaurant model', () => {
    // The restaurant model should have NO tables section
    const hasTables = restaurantModel.obj.model.tables && restaurantModel.obj.model.tables.table
    expect(hasTables).toBeFalsy()
  })

  it('should categorize variables correctly including month-indexed variables', () => {
    const variables = restaurantModel.features.variables
    
    // Check that we have some constants (no arguments)
    const constants = variables.filter(varName => {
      const resolved = restaurantModel.features.resolvedVarsWithArguments.get(varName)
      const args = resolved && resolved.domain ? resolved.domain : []
      return args.length === 0
    })
    expect(constants.length).toBeGreaterThan(0)
    console.log('Constants found:', constants.length)
    
    // Check that we have some month-indexed variables (single temporal argument)
    const monthIndexed = variables.filter(varName => {
      const resolved = restaurantModel.features.resolvedVarsWithArguments.get(varName)
      const args = resolved && resolved.domain ? resolved.domain : []
      return args.length === 1 && args[0].toUpperCase() === 'MONTH'
    })
    expect(monthIndexed.length).toBeGreaterThan(0)
    console.log('Month-indexed variables found:', monthIndexed.length)
    console.log('Examples:', monthIndexed.slice(0, 5))
  })

  it('should have calculated variables with expressions', () => {
    const variableMap = new Map()
    if (restaurantModel.obj.model.variables && restaurantModel.obj.model.variables.variable) {
      const vars = Array.isArray(restaurantModel.obj.model.variables.variable) 
        ? restaurantModel.obj.model.variables.variable 
        : [restaurantModel.obj.model.variables.variable]
      
      for (const v of vars) {
        variableMap.set(v.id.toUpperCase(), v)
      }
    }
    
    // Check for a known calculated variable
    const monthlyFoodRevenue = variableMap.get('MONTHLY_FOOD_REVENUE')
    expect(monthlyFoodRevenue).toBeTruthy()
    expect(monthlyFoodRevenue.definition).toBeTruthy()
    expect(monthlyFoodRevenue.definition.type).toBe('expression')
    
    const expression = monthlyFoodRevenue.definition['#text'] || ''
    expect(expression).toBeTruthy()
    console.log('monthly_food_revenue expression:', expression.trim())
    
    // Check it has a month argument
    expect(monthlyFoodRevenue.arguments).toBeTruthy()
    expect(monthlyFoodRevenue.arguments.arg).toBeTruthy()
    const args = Array.isArray(monthlyFoodRevenue.arguments.arg)
      ? monthlyFoodRevenue.arguments.arg
      : [monthlyFoodRevenue.arguments.arg]
    expect(args.length).toBe(1)
    expect(args[0].indexSet).toBe('month')
  })
})
