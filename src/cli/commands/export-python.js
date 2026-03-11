import fs from 'node:fs';
import path from 'node:path';
import '../runtime.js';
import { validateModelCore } from '../../core/index.js';
import { renderModelAsPython } from '../../core/pythonRenderer.js';
import { sanitizeFilename } from '../../utils/helpers.js';

export function exportPythonCommandUsage() {
  return 'Usage: model-editor export-python <model.xml> [--out <file.py>]';
}

export function runExportPython(args) {
  const { positional, options } = args;
  const modelPath = positional[0];

  if (!modelPath) {
    throw new Error(exportPythonCommandUsage());
  }

  const modelText = fs.readFileSync(modelPath, 'utf8');
  const result = validateModelCore(modelText, modelPath);

  const code = renderModelAsPython(result.obj, result.features);

  const defaultFilename = sanitizeFilename(result.obj?.model?.id) + '.py';
  const outPath = (options.out && options.out !== true) ? options.out : defaultFilename;

  fs.writeFileSync(outPath, code, 'utf8');
  console.log(`Exported Python script: ${path.resolve(outPath)}`);

  return { outPath };
}
