import { standardFunctionDescriptions } from '../../core/language.js';

export function functionsCommandUsage() {
  return 'Usage: model-editor functions';
}

/**
 * Lists all built-in standard functions with their signatures and descriptions.
 * Prints a neatly aligned table to stdout and returns the descriptions array.
 *
 * @returns {Array<{ name: string, signature: string, description: string }>}
 */
export function runFunctions() {
  const maxSig = Math.max(...standardFunctionDescriptions.map(f => f.signature.length));

  console.log('Built-in standard functions:');
  console.log('');
  for (const { signature, description } of standardFunctionDescriptions) {
    const pad = ' '.repeat(maxSig - signature.length + 2);
    console.log(`  ${signature}${pad}${description}`);
  }
  console.log('');
  console.log('These functions are always available in model expressions without any declaration.');

  return standardFunctionDescriptions;
}
