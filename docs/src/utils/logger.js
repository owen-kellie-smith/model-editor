// logger.js

import { LOG_LEVEL } from "../../config.js"

export function logLogLevel() {
    log("info", `LOG_LEVEL: ${LOG_LEVEL}`);   
}

const order = { debug: 0, info: 1, warn: 2, error: 3 };

export function log(level, ...args) {
  if (order[level] < order[LOG_LEVEL]) return;
  const { functionName, location } = getCaller();
  console.log(`[${level}] [${functionName}] ${location}`, ...args);
}

function getCaller() {
  const stack = new Error().stack;
  if (!stack) return unknownCaller();

  for (const frame of getStackFrames(stack)) {
    if (isInternalLoggerFrame(frame)) continue;

    const caller =
      readBrowserCaller(frame) ||
      readNodeCaller(frame) ||
      readNodeTopLevelCaller(frame);

    if (caller) return caller;
  }

  return unknownCaller();
}

function unknownCaller() {
  return { functionName: "<unknown>", location: "unknown" };
}

function getStackFrames(stack) {
  return stack.split("\n").map(cleanFrame);
}

function cleanFrame(frame) {
  return frame.trim();
}

/**
 * We try hard not to depend on an exact filename.
 * Function names are preferred, filename is fallback safety.
 */
function isInternalLoggerFrame(frame) {
  return (
    frame.includes("getCaller") ||
    frame.includes("log@") ||
    frame.includes("log (") ||
    frame.match(/logger\.(js|ts)/)
  );
}

// Browser format: fn@file:line:col
function readBrowserCaller(frame) {
  if (!frame.includes("@")) return null;

  const [fn, loc] = frame.split("@");
  return {
    functionName: fn || "<top-level>",
    location: loc || "unknown",
  };
}

// Node format: at fn (file:line:col)
function readNodeCaller(frame) {
  const match = frame.match(/at (.+?) \((.+)\)/);
  if (!match) return null;

  return {
    functionName: match[1],
    location: match[2],
  };
}

// Node format: at file:line:col
function readNodeTopLevelCaller(frame) {
  const match = frame.match(/at (.+)/);
  if (!match) return null;

  return {
    functionName: "<top-level>",
    location: match[1],
  };
}



