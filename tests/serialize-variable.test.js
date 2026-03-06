
import { describe, test, expect, beforeAll } from "vitest";

// ✅ mock the dependency so we control the parsed XML document
import { parseXmlOrThrow } from "../src/utils/helpers.js";
import { serializeVariable, parseVariableXml } from "../src/core/serialize.js";

import { vi } from "vitest";

vi.mock("../src/utils/helpers.js", () => ({
  parseXmlOrThrow: vi.fn(),
}));

beforeAll(() => {
  function NodeCtor() {}
  NodeCtor.ELEMENT_NODE = 1
  NodeCtor.TEXT_NODE = 3
  global.Node = NodeCtor
})

function el(name, { attrs = {}, children = [], text = "" } = {}) {
  const attributes = Object.entries(attrs).map(([k, v]) => ({ name: k, value: String(v) }));
  const childNodes = [];

  if (text) childNodes.push({ nodeType: Node.TEXT_NODE, nodeValue: text });

  for (const c of children) childNodes.push(c);

  return {
    nodeType: Node.ELEMENT_NODE,
    nodeName: name,
    attributes,
    childNodes,
  };
}

describe("serialize.js variable helpers", () => {
  test("serializeVariable builds <variable> xml", () => {
    const xml = serializeVariable({ id: "x", "#text": "Hello" });
    expect(xml).toContain('<variable id="x">');
    expect(xml).toContain("Hello");
    expect(xml).toContain("</variable>");
  });

  test("parseVariableXml throws on empty", () => {
    expect(() => parseVariableXml("")).toThrow(/cannot be empty/i);
  });

  test("parseVariableXml throws if root is not <variable>", () => {
    parseXmlOrThrow.mockReturnValueOnce({ documentElement: el("definition") });
    expect(() => parseVariableXml("<definition/>")).toThrow(/Expected <variable>/);
  });

  test("parseVariableXml builds object: attrs, repeated children->array, text-only->string, mixed->#text", () => {
    // <variable id="v1">
    //   <unit>GBP</unit>
    //   <tag>a</tag><tag>b</tag>
    //   <note kind="info"> hello <x>y</x></note>
    // </variable>
    const root = el("variable", {
      attrs: { id: "v1" },
      children: [
        el("unit", { text: "GBP" }),                        // text-only => "GBP"
        el("tag", { text: "a" }),
        el("tag", { text: "b" }),                           // repeated => array
        el("note", {
          attrs: { kind: "info" },
          text: "hello",
          children: [el("x", { text: "y" })],               // mixed => { kind, "#text", x: "y" }
        }),
      ],
    });

    parseXmlOrThrow.mockReturnValueOnce({ documentElement: root });

    const obj = parseVariableXml("<variable/>");

    expect(obj).toEqual({
      id: "v1",
      unit: "GBP",
      tag: ["a", "b"],
      note: { kind: "info", "#text": "hello", x: "y" },
    });
  });
});
