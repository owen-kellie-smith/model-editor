import { validateModelCore } from './docs/src/domain/model.js'
import { getFunctionsFromLanguage } from './docs/src/domain/language.js'
import { renderModelAsExcel } from './docs/src/domain/spreadsheetRenderer.js'
import { readFileSync, writeFileSync } from 'fs'

const langXml = readFileSync('./docs/examples/language.xml', 'utf-8')
const modelXml = readFileSync('./docs/examples/annuity-model/vendor-format-model.xml', 'utf-8')

const lang = getFunctionsFromLanguage(langXml, 'language.xml')
const model = validateModelCore(modelXml, 'vendor-format-model.xml', lang)

console.log('Model validated successfully')
console.log('Variables:', model.features.variables.slice(0, 10))
console.log('\nTotal variables:', model.features.variables.length)

// Now render
const blob = await renderModelAsExcel(model.obj, model.features)
const arrayBuffer = await blob.arrayBuffer()
const buffer = Buffer.from(arrayBuffer)
writeFileSync('/tmp/test_output.xml', buffer.toString('utf-8'))

console.log('\nFirst 3000 chars of output:')
console.log(buffer.toString('utf-8').substring(0, 3000))
console.log('\n\n... (output continues)')
console.log('\nLast 500 chars of output:')
console.log(buffer.toString('utf-8').substring(buffer.length - 500))
