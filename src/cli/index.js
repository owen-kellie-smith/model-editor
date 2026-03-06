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
