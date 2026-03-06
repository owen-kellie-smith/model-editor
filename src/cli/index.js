#!/usr/bin/env node
import { parseCliArgs } from './argParsing.js';
import { runValidate, validateCommandUsage } from './commands/validate.js';
import { runGraph, graphCommandUsage } from './commands/graph.js';
import { runExportPython, exportPythonCommandUsage } from './commands/export-python.js';
import { runExportSpreadsheet, exportSpreadsheetCommandUsage } from './commands/export-spreadsheet.js';

const [, , command, ...rest] = process.argv;

function printHelp() {
  console.log('model-editor commands:');
  console.log(`  ${validateCommandUsage()}`);
  console.log(`  ${graphCommandUsage()}`);
  console.log(`  ${exportPythonCommandUsage()}`);
  console.log(`  ${exportSpreadsheetCommandUsage()}`);
}

const commands = {
  validate: runValidate,
  graph: runGraph,
  'export-python': runExportPython,
  'export-spreadsheet': runExportSpreadsheet,
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
  const result = handler(parseCliArgs(rest));
  if (result && typeof result.then === 'function') {
    result.catch(error => {
      console.error(error.message || String(error));
      process.exit(1);
    });
  }
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
