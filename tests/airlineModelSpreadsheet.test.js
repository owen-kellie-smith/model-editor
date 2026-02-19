import { describe, it, expect, beforeAll } from 'vitest'
import { validateModelCore } from '@/domain/model.js'
import { renderModelAsExcel } from '@/domain/spreadsheetRenderer.js'
import { getFunctionsFromLanguage } from '@/domain/language.js'
import { loadXml } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.ts'
import fs from 'fs'
import path from 'path'

describe('Airline Model Spreadsheet Rendering', () => {
  let lang
  let airlineModel
  
  beforeAll(() => {
    // Load language
    const languageFixture = getFixture('language.xml')
    const languageXml = loadXml(languageFixture)
    lang = getFunctionsFromLanguage(languageXml, 'test')
    
    // Load airline model
    const airlineModelPath = path.join(process.cwd(), 'docs', 'examples', 'airline-model', 'model.xml')
    const airlineModelXml = fs.readFileSync(airlineModelPath, 'utf-8')
    airlineModel = validateModelCore(airlineModelXml, 'airline-model.xml', lang)
  })

  it('should categorize airline model variables correctly', () => {
    expect(airlineModel).toBeTruthy()
    expect(airlineModel.obj).toBeTruthy()
    expect(airlineModel.features).toBeTruthy()
    
    const modelObj = airlineModel.obj
    const modelFeatures = airlineModel.features
    
    // Get the variable map
    const variableMap = new Map()
    if (modelObj.model.variables && modelObj.model.variables.variable) {
      const vars = Array.isArray(modelObj.model.variables.variable) 
        ? modelObj.model.variables.variable 
        : [modelObj.model.variables.variable]
      
      for (const v of vars) {
        variableMap.set(v.id.toUpperCase(), v)
      }
    }
    
    // Check economy_passengers_per_flight variable
    const economyPassengersVar = variableMap.get('ECONOMY_PASSENGERS_PER_FLIGHT')
    expect(economyPassengersVar).toBeDefined()
    expect(economyPassengersVar.definition.type).toBe('expression')
    
    // Check if it has arguments
    const hasArguments = economyPassengersVar.arguments !== undefined
    console.log('economy_passengers_per_flight has arguments:', hasArguments)
    console.log('economy_passengers_per_flight definition type:', economyPassengersVar.definition.type)
    
    // Check monthly_economy_revenue variable
    const monthlyEconomyRevenueVar = variableMap.get('MONTHLY_ECONOMY_REVENUE')
    expect(monthlyEconomyRevenueVar).toBeDefined()
    expect(monthlyEconomyRevenueVar.definition.type).toBe('expression')
    
    const hasMonthArgument = monthlyEconomyRevenueVar.arguments !== undefined
    console.log('monthly_economy_revenue has arguments:', hasMonthArgument)
    
    const formulaText = monthlyEconomyRevenueVar.definition['#text']
    console.log('monthly_economy_revenue formula:', formulaText)
    
    // Check if economy_passengers_per_flight is in the formula
    expect(formulaText).toContain('economy_passengers_per_flight')
  })

  it('should identify variables that are expressions without arguments', () => {
    expect(airlineModel).toBeTruthy()
    expect(airlineModel.obj).toBeTruthy()
    
    const modelObj = airlineModel.obj
    
    // Get the variable map
    const variableMap = new Map()
    const expressionsWithoutArgs = []
    if (modelObj.model.variables && modelObj.model.variables.variable) {
      const vars = Array.isArray(modelObj.model.variables.variable) 
        ? modelObj.model.variables.variable 
        : [modelObj.model.variables.variable]
      
      for (const v of vars) {
        variableMap.set(v.id.toUpperCase(), v)
        
        // Check for expressions without arguments
        if (v.definition?.type === 'expression' && !v.arguments) {
          expressionsWithoutArgs.push(v.id)
        }
      }
    }
    
    console.log('Variables that are expressions without arguments:', expressionsWithoutArgs)
    
    // economy_passengers_per_flight should be in this list
    expect(expressionsWithoutArgs).toContain('economy_passengers_per_flight')
    
    // These are intermediate calculated variables that need to be available
    // in the spreadsheet when referenced by other variables
    expect(expressionsWithoutArgs.length).toBeGreaterThan(0)
  })
})
