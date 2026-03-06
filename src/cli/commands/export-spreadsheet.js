import fs from 'node:fs';
import path from 'node:path';
import '../runtime.js';
import { getFunctionsFromLanguage, validateModelCore } from '../../core/index.js';
import { renderModelAsExcel } from '../../core/spreadsheetRenderer.js';
import { loadXmlFromFile } from './xml.js';

export function exportSpreadsheetCommandUsage() {
  return 'Usage: model-editor export-spreadsheet <model.xml> --language <language.xml> [--out <file.xlsx>]';
}

export async function runExportSpreadsheet(args) {
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

  const blob = await renderModelAsExcel(result.obj, result.features);
  const buffer = Buffer.from(await blob.arrayBuffer());

  const defaultFilename = 'model_spreadsheet.xlsx';
  const outPath = (options.out && options.out !== true) ? options.out : defaultFilename;

  fs.writeFileSync(outPath, buffer);
  console.log(`Exported spreadsheet: ${path.resolve(outPath)}`);

  return { outPath };
}
