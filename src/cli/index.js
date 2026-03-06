#!/usr/bin/env node
import { parseCliArgs } from './argParsing.js';
import { runValidate, validateCommandUsage } from './commands/validate.js';
import { runGraph, graphCommandUsage } from './commands/graph.js';

const [, , command, ...rest] = process.argv;

function printHelp() {
  console.log('model-editor commands:');
  console.log(`  ${validateCommandUsage()}`);
  console.log(`  ${graphCommandUsage()}`);
}

const commands = {
  validate: runValidate,
  graph: runGraph,
  help: () => printHelp(),
  '--help': () => printHelp(),
  '-h': () => printHelp(),
};

if (!command) {
  printHelp();
  process.exit(1);
}

const handler = commands[command];
if (!handler) {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

try {
  handler(parseCliArgs(rest));
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
=======

import { XMLSerializer as XmldomXMLSerializer } from "@xmldom/xmldom";

// Polyfill browser globals needed by the XML parsing utilities
if (typeof global.Node === "undefined") {
  global.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
}
if (typeof global.XMLSerializer === "undefined") {
  global.XMLSerializer = XmldomXMLSerializer;
}

import fs from "fs";
import path from "path";
import { getFunctionsFromLanguage } from "../core/language.js";
import { validateModelCore } from "../core/model.js";
import { renderModelAsPython } from "../core/pythonRenderer.js";
import { parseXmlOrThrow } from "../utils/helpers.js";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--model" && argv[i + 1]) {
      args.model = argv[++i];
    } else if (argv[i] === "--language" && argv[i + 1]) {
      args.language = argv[++i];
    } else if (argv[i] === "--format" && argv[i + 1]) {
      args.format = argv[++i];
    } else if (argv[i] === "--help" || argv[i] === "-h") {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`
model-editor CLI

Usage:
  model-editor --model <model.xml> [--language <language.xml>] [--format <summary|python>]

Options:
  --model <file>      Path to the model XML file (required)
  --language <file>   Path to the language XML file (optional)
  --format <type>     Output format: summary (default) or python
  --help, -h          Show this help message

Examples:
  model-editor --model docs/examples/annuity-model/vendor-format-model.xml
  model-editor --model docs/examples/annuity-model/vendor-format-model.xml --language docs/examples/language.xml --format python
`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    return;
  }

  if (!args.model) {
    printHelp();
    process.exit(1);
  }

  const modelPath = path.resolve(args.model);
  if (!fs.existsSync(modelPath)) {
    console.error(`Error: model file not found: ${modelPath}`);
    process.exit(1);
  }

  const modelText = fs.readFileSync(modelPath, "utf8");

  let languageEnv = { functions: new Map() };
  if (args.language) {
    const langPath = path.resolve(args.language);
    if (!fs.existsSync(langPath)) {
      console.error(`Error: language file not found: ${langPath}`);
      process.exit(1);
    }
    const langText = fs.readFileSync(langPath, "utf8");
    const langXml = parseXmlOrThrow(langText, langPath);
    languageEnv = getFunctionsFromLanguage(langXml, langPath);
  }

  try {
    const result = validateModelCore(modelText, modelPath, languageEnv);
    const format = args.format || "summary";

    if (format === "python") {
      const python = renderModelAsPython(result.obj, result.features);
      console.log(python);
    } else {
      const { features } = result;
      console.log("✔ Model is structurally valid");
      console.log(`\nIndex sets (${features.indexSets.length}):`);
      features.indexSets.forEach((s) => console.log(`  - ${s}`));
      console.log(`\nVariables (${features.variables.length}):`);
      features.variables.forEach((v) => console.log(`  - ${v}`));
    }
  } catch (err) {
    console.error("✖ Validation error:", err.message);
    if (err.context) {
      console.error("Context:", JSON.stringify(err.context, null, 2));
    }
    process.exit(1);
  }
}

main();
