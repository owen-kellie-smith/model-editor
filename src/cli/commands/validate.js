import fs from 'node:fs';
import '../runtime.js';
import { validateModelCore } from '../../core/index.js';

export function validateCommandUsage() {
  return 'Usage: model-editor validate <model.xml>';
}

export function runValidate(args) {
  const { positional } = args;
  const modelPath = positional[0];

  if (!modelPath) {
    throw new Error(validateCommandUsage());
  }

  const modelText = fs.readFileSync(modelPath, 'utf8');
  const result = validateModelCore(modelText, modelPath);

  console.log(`Valid model: ${result.filename}`);
  console.log(`Variables: ${result.features.incoming.size}`);
  return result;
}
