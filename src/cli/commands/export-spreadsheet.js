import fs from 'node:fs';
import path from 'node:path';
import '../runtime.js';
import { getFunctionsFromLanguage, validateModelCore } from '../../core/index.js';
import { renderModelAsCsv, makeRenderContext } from '../../core/spreadsheetLogic.js';
import { loadXmlFromFile } from './xml.js';

export function exportSpreadsheetCommandUsage() {
  return 'Usage: model-editor export-spreadsheet <model.xml> --language <language.xml> [--out <file.csv>]';
}

export function runExportSpreadsheet(args) {
  const { positional, options } = args;
  const modelPath = positional[0];
  const languagePath = options.language;

  if (!modelPath || !languagePath || languagePath === true) {
    throw new Error(exportSpreadsheetCommandUsage());
  }

  const modelText = fs.readFileSync(modelPath, 'utf8');
  const languageXml = loadXmlFromFile(languagePath);
  const lang = getFunctionsFromLanguage(languageXml, languagePath);
  const result = validateModelCore(modelText, modelPath, lang);

  const ctx = makeRenderContext();
  const csv = renderModelAsCsv(result.obj, result.features, ctx);

  const defaultFilename = 'model_spreadsheet.csv';
  const outPath = (options.out && options.out !== true) ? options.out : defaultFilename;

  fs.writeFileSync(outPath, csv, 'utf8');
  console.log(`Exported spreadsheet CSV: ${path.resolve(outPath)}`);

  return { outPath };
}
