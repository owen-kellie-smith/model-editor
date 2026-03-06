export function createDOMParser() {
  if (typeof globalThis.DOMParser === "undefined") {
    throw new Error(
      "DOMParser is not available. In Node.js/CLI environments, ensure @xmldom/xmldom " +
      "is set up on globalThis before calling this function."
    );
  }

  const parser = new globalThis.DOMParser();

  // Shim querySelectorAll for environments where parsed documents lack it
  // (e.g. xmldom in Node.js / CLI). Supports simple patterns like "A",
  // "A > B" (direct child), and "A B" (descendant).
  const originalParseFromString = parser.parseFromString.bind(parser);
  parser.parseFromString = (text, mimeType) => {
    const doc = originalParseFromString(text, mimeType);
    if (doc && !doc.querySelectorAll) {
      doc.querySelectorAll = (selector) => shimQuerySelectorAll(doc, selector);
    }
    return doc;
  };

  return parser;
}

function shimQuerySelectorAll(context, selector) {
  // Handle "A > B" (direct child) and "A B" (descendant)
  const childMatch = selector.match(/^\s*(\S+)\s*>\s*(\S+)\s*$/);
  if (childMatch) {
    const parents = Array.from(context.getElementsByTagName(childMatch[1]));
    const results = [];
    for (const parent of parents) {
      for (const child of Array.from(parent.childNodes || [])) {
        if (child.nodeName === childMatch[2]) results.push(child);
      }
    }
    return results;
  }
  // Simple tag name
  return Array.from(context.getElementsByTagName(selector.trim()));
}

