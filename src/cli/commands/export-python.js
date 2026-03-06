import fs from 'node:fs';
import path from 'node:path';
import '../runtime.js';
import { getFunctionsFromLanguage, validateModelCore } from '../../core/index.js';
import { renderModelAsPython } from '../../core/pythonRenderer.js';
import { sanitizeFilename } from '../../utils/helpers.js';
import { loadXmlFromFile } from './xml.js';

export function exportPythonCommandUsage() {
  return 'Usage: model-editor export-python <model.xml> --language <language.xml> [--out <file.py>]';
}

export function runExportPython(args) {
  const { positional, options } = args;
  const modelPath = positional[0];
  const languagePath = options.language;

  if (!modelPath || !languagePath || languagePath === true) {
    throw new Error(exportPythonCommandUsage());
  }

  const modelText = fs.readFileSync(modelPath, 'utf8');
  const languageXml = loadXmlFromFile(languagePath);
  const lang = getFunctionsFromLanguage(languageXml, languagePath);
  const result = validateModelCore(modelText, modelPath, lang);

  const code = renderModelAsPython(result.obj, result.features);

  const defaultFilename = sanitizeFilename(result.obj?.model?.id) + '.py';
  const outPath = (options.out && options.out !== true) ? options.out : defaultFilename;

  fs.writeFileSync(outPath, code, 'utf8');
  console.log(`Exported Python script: ${path.resolve(outPath)}`);

  return { outPath };
}
