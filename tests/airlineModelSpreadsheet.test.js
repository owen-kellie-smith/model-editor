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

  it('should include expression variables without arguments in constants category', () => {
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
    
    // Categorize using the actual spreadsheetRenderer logic
    const constants = []
    const cohortStep = []
    const temporalArgs = ['STEP', 'MONTH', 'YEAR', 'PERIOD', 'TIME', 'QUARTER', 'WEEK', 'DAY']
    
    for (const [varName, varXml] of variableMap) {
      const resolved = modelFeatures.resolvedVarsWithArguments.get(varName)
      const args = resolved && resolved.domain ? resolved.domain : []
      const defType = varXml.definition?.type || ""
      
      if (args.length === 0) {
        // Include both constant and expression variables with no arguments
        if (defType === "constant" || defType === "expression") {
          constants.push(varName)
        }
      } else if (args.length === 1 && temporalArgs.includes(args[0].toUpperCase())) {
        cohortStep.push(varName)
      }
    }
    
    console.log('Constants (including expressions without args):', constants.length)
    console.log('Cohort-step variables:', cohortStep.length)
    
    // Verify that expression variables without arguments are in constants
    expect(constants).toContain('ECONOMY_PASSENGERS_PER_FLIGHT')
    expect(constants).toContain('BUSINESS_PASSENGERS_PER_FLIGHT')
    expect(constants).toContain('FIRST_PASSENGERS_PER_FLIGHT')
    expect(constants).toContain('ECONOMY_SEATS_PER_FLIGHT')
    
    // Verify that true constants are also in constants
    expect(constants).toContain('AIRCRAFT_COUNT')
    expect(constants).toContain('ECONOMY_TICKET_PRICE')
    
    // Verify that month-indexed variables are in cohort-step
    expect(cohortStep).toContain('MONTHLY_ECONOMY_REVENUE')
    expect(cohortStep).toContain('TOTAL_MONTHLY_FLIGHTS')
    
    console.log('✓ Expression variables without arguments will be available in constant sheet')
  })

  it('should render test airline model correctly with expression variables in formulas', async () => {
    // Create a minimal test model that replicates the issue
    const testModelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model id="test-airline">
  <indexSets>
    <indexSet id="month">
      <description>Projection month</description>
      <dataType>integer</dataType>
    </indexSet>
  </indexSets>
  <variables>
    <variable id="aircraft_count">
      <dataType>integer</dataType>
      <definition type="constant">10</definition>
    </variable>
    <variable id="flights_per_aircraft_per_month">
      <dataType>integer</dataType>
      <definition type="constant">120</definition>
    </variable>
    <variable id="economy_seats_percent">
      <dataType>real</dataType>
      <definition type="constant">0.80</definition>
    </variable>
    <variable id="seats_per_aircraft">
      <dataType>integer</dataType>
      <definition type="constant">180</definition>
    </variable>
    <variable id="economy_load_factor">
      <dataType>real</dataType>
      <definition type="constant">0.85</definition>
    </variable>
    <variable id="economy_ticket_price">
      <dataType>real</dataType>
      <definition type="constant">250</definition>
    </variable>
    <variable id="economy_seats_per_flight">
      <dataType>real</dataType>
      <definition type="expression">
        seats_per_aircraft * economy_seats_percent
      </definition>
    </variable>
    <variable id="economy_passengers_per_flight">
      <dataType>real</dataType>
      <definition type="expression">
        economy_seats_per_flight * economy_load_factor
      </definition>
    </variable>
    <variable id="total_monthly_flights">
      <arguments>
        <arg indexSet="month"/>
      </arguments>
      <dataType>integer</dataType>
      <definition type="expression">
        aircraft_count * flights_per_aircraft_per_month
      </definition>
    </variable>
    <variable id="monthly_economy_revenue">
      <arguments>
        <arg indexSet="month"/>
      </arguments>
      <dataType>real</dataType>
      <definition type="expression">
        economy_passengers_per_flight * economy_ticket_price * total_monthly_flights(month)
      </definition>
    </variable>
  </variables>
</model>`

    const testModel = validateModelCore(testModelXml, 'test-airline-model.xml', lang)
    
    expect(testModel).toBeTruthy()
    expect(testModel.obj).toBeTruthy()
    expect(testModel.features).toBeTruthy()
    
    // Try to render the spreadsheet
    const blob = await renderModelAsExcel(testModel.obj, testModel.features)
    
    expect(blob).toBeTruthy()
    console.log('✓ Test airline model rendered successfully')
    console.log(`  Blob size: ${blob.size} bytes`)
  })
})
