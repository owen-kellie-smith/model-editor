import fs from 'node:fs';
import '../runtime.js';
import { getFunctionsFromLanguage, validateModelCore } from '../../core/index.js';
import { loadXmlFromFile } from './xml.js';

export function validateCommandUsage() {
  return 'Usage: model-editor validate <model.xml> --language <language.xml>';
}

export function runValidate(args) {
  const { positional, options } = args;
  const modelPath = positional[0];
  const languagePath = options.language;

  if (!modelPath || !languagePath || languagePath === true) {
    throw new Error(validateCommandUsage());
  }

  const modelText = fs.readFileSync(modelPath, 'utf8');
  const languageXml = loadXmlFromFile(languagePath);
  const lang = getFunctionsFromLanguage(languageXml, languagePath);
  const result = validateModelCore(modelText, modelPath, lang);

  console.log(`Valid model: ${result.filename}`);
  console.log(`Variables: ${result.features.incoming.size}`);
  return result;
}
