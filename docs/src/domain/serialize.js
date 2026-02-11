export function serializeModel(obj) {
  return `<?xml version="1.0"?>\n` +
    buildNode(obj.model, "model", 0);
}

export function serializeLanguage(obj) {
  return `<?xml version="1.0"?>\n` +
         buildNode(obj.model, "language", 0);
}

function buildNode(node, tagName, depth) {
  const indent = "  ".repeat(depth);
  const nl = "\n";

  if (node == null) return "";

  // primitive
  if (typeof node !== "object") {
    return `${indent}<${tagName}>${node}</${tagName}>${nl}`;
  }

  // only text
  if ("#text" in node && Object.keys(node).length === 1) {
    return `${indent}<${tagName}>${node["#text"]}</${tagName}>${nl}`;
  }

  let attrs = "";
  let children = "";

  for (const [key, value] of Object.entries(node)) {
    if (key === "#text") continue;

    if (Array.isArray(value)) {
      for (const v of value) {
        children += buildNode(v, key, depth + 1);
      }
    } else if (typeof value === "object") {
      children += buildNode(value, key, depth + 1);
    } else {
      attrs += ` ${key}="${value}"`;
    }
  }

  const text = node["#text"] ?? "";

  if (!children && !text) {
    return `${indent}<${tagName}${attrs}></${tagName}>${nl}`;
  }

  return `${indent}<${tagName}${attrs}>${nl}` +
         (text ? `${indent}  ${text}${nl}` : "") +
         children +
         `${indent}</${tagName}>${nl}`;
}

