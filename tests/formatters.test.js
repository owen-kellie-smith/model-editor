
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// ✅ Update this path to your real file location
import {
  formatError,
  formatErrorNoStack,
  formatLanguageLoaded,
  formatModelResult,
} from "../src/utils/formatters.js";

// Mock helpers so tests are stable + not dependent on their internals
vi.mock("../src/utils/helpers.js", () => ({
  getStringfromObject: (o) => JSON.stringify(o, null, 2),
  getObjectFromMap: (m) => Object.fromEntries(m),
  getObjectFromMapOfSets: (m) =>
    Object.fromEntries([...m.entries()].map(([k, v]) => [k, [...v]])),
}));

vi.mock("../src/utils/logger.js", () => ({ log: () => {} }));

function makeMiniDom() {
  const createElement = (tag) => ({
    tag,
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
    },
    textContent: "",
    innerText: "",
  });

  return {
    createElement,
    body: createElement("body"),
  };
}

describe("formatters", () => {
  const realDocument = global.document;

  beforeEach(() => {
    global.document = makeMiniDom();
  });

  afterEach(() => {
    global.document = realDocument;
  });

  test("formatError includes message + stack + context", () => {
    const err = {
      message: "Bad thing",
      stack: "STACK",
      context: { a: 1 },
    };
    const out = formatError(err);
    expect(out).toContain("✖ Validation error:");
    expect(out).toContain("Bad thing in STACK");
    expect(out).toContain("Context:");
    expect(out).toContain('"a": 1');
  });

  test("formatErrorNoStack omits stack", () => {
    const err = { message: "No stack", context: { b: 2 } };
    const out = formatErrorNoStack(err);
    expect(out).toContain("No stack");
    expect(out).toContain('"b": 2');
  });

  test("formatLanguageLoaded prints functions from Map", () => {
    const lang = { functions: new Map([["f", { arity: 1 }]]) };
    const out = formatLanguageLoaded(lang);
    expect(out).toContain("Language loaded:");
    expect(out).toContain('"f"');
    expect(out).toContain('"arity"');
  });

  test("formatModelResult returns a DOM-like tree", () => {
    const features = {
      indexSets: ["I"],
      variables: ["x"],
      resolvedVarsWithArguments: new Map([["x", ["I"]]]),
      incoming: new Map([["x", new Set(["y"])]]),
      outgoing: new Map([["x", new Set(["z"])]]),
    };

    const node = formatModelResult({ features, obj: { hello: "world" }, filename: "m" });

    expect(node.tag).toBe("div");
    // first child is the <p> with success text
    expect(node.children[0].tag).toBe("p");
    expect(node.children[0].innerText).toContain("✔ Model is structurally valid");
  });
})

