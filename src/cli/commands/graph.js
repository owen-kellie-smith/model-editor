import fs from 'node:fs';
import '../runtime.js';
import { generateDot, getFunctionsFromLanguage, getGraphOfRelations, getGraphOfRelationsMulti, validateModelCore } from '../../core/index.js';
import { loadXmlFromFile } from './xml.js';

export function graphCommandUsage() {
  return 'Usage: model-editor graph <model.xml> --language <language.xml> --root <VARIABLE[,VARIABLE2,...]> [--depth <n>] [--out <file>]';
}

export function runGraph(args) {
  const { positional, options } = args;
  const modelPath = positional[0];
  const languagePath = options.language;
  const root = options.root;
  const depth = options.depth ? Number(options.depth) : 1;

  if (!modelPath || !languagePath || languagePath === true || !root || root === true) {
    throw new Error(graphCommandUsage());
  }
  if (!Number.isInteger(depth) || depth < 0) {
    throw new Error('--depth must be a non-negative integer');
  }

  const modelText = fs.readFileSync(modelPath, 'utf8');
  const languageXml = loadXmlFromFile(languagePath);
  const lang = getFunctionsFromLanguage(languageXml, languagePath);
  const model = validateModelCore(modelText, modelPath, lang);

  const roots = String(root).split(',').map((value) => value.trim()).filter(Boolean);
  if (roots.length === 0) {
    throw new Error(graphCommandUsage());
  }

  const graph = roots.length === 1
    ? getGraphOfRelations(model.features, roots[0], depth)
    : getGraphOfRelationsMulti(model.features, roots, depth);
  const dot = generateDot(graph, roots[0], new Set(roots));

  if (options.out && options.out !== true) {
    fs.writeFileSync(options.out, dot, 'utf8');
  } else {
    console.log(dot);
  }

  return { graph, dot };
}
