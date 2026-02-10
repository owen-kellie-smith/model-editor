// logger.js

import { LOG_LEVEL } from "../../config.js"

export function logLogLevel() {
    log("info", `LOG_LEVEL: ${LOG_LEVEL}`);   
}

const order = { debug: 0, info: 1, warn: 2, error: 3 };


/**
 * Find the first stack frame that is outside the logger itself.
 */
function getCaller() {
  const stack = new Error().stack;

  if (!stack) {
    return { functionName: "<unknown>", location: "unknown" };
  }

  const lines = stack.split("\n");

  for (const raw of lines) {
    const line = raw.trim();

    // skip logger internals
    if (
      line.includes("getCaller") ||
      line.includes("log@") ||
      line.includes("log (") ||
      line.includes("logger.js")
    ) {
      continue;
    }

    // =========================
    // Browser: fn@file:line:col
    // =========================
    if (line.includes("@")) {
      const [fn, loc] = line.split("@");
      return {
        functionName: fn || "<top-level>",
        location: loc || "unknown",
      };
    }

    // =========================
    // Node: at fn (file:line:col)
    // =========================
    let match = line.match(/at (.+?) \((.+)\)/);
    if (match) {
      return {
        functionName: match[1],
        location: match[2],
      };
    }

    // =========================
    // Node: at file:line:col
    // =========================
    match = line.match(/at (.+)/);
    if (match) {
      return {
        functionName: "<top-level>",
        location: match[1],
      };
    }
  }

  return { functionName: "<unknown>", location: "unknown" };
}


export function log(level, ...args) {
  if (order[level] < order[LOG_LEVEL]) return;

  const { functionName, location } = getCaller();

  console.log(`[${level}] [${functionName}] ${location}`, ...args);
}



