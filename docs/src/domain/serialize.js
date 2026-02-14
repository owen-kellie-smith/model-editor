import { parseXmlOrThrow } from "../utils/helpers.js";

/**
 * Escapes special XML characters in text content and attribute values
 * @param {string} text - The text to escape
 * @returns {string} The escaped text
 */
function escapeXml(text) {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function serializeModel(obj) {
  return `<?xml version="1.0"?>\n` +
    buildNode(obj.model, "model", 0);
}

export function serializeLanguage(obj) {
  return `<?xml version="1.0"?>\n` +
         buildNode(obj.model, "language", 0);
}

export function buildNode(node, tagName, depth) {
  const indent = "  ".repeat(depth);
  const nl = "\n";

  if (node == null) return "";

  // primitive
  if (typeof node !== "object") {
    return `${indent}<${tagName}>${escapeXml(node)}</${tagName}>${nl}`;
  }

  // only text
  if ("#text" in node && Object.keys(node).length === 1) {
    return `${indent}<${tagName}>${escapeXml(node["#text"])}</${tagName}>${nl}`;
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
      attrs += ` ${key}="${escapeXml(value)}"`;
    }
  }

  const text = node["#text"] ?? "";

  if (!children && !text) {
    return `${indent}<${tagName}${attrs}></${tagName}>${nl}`;
  }

  return `${indent}<${tagName}${attrs}>${nl}` +
         (text ? `${indent}  ${escapeXml(text)}${nl}` : "") +
         children +
         `${indent}</${tagName}>${nl}`;
}

/**
 * Serializes a variable definition object to indented XML string
 * @param {Object} definition - The definition object to serialize
 * @returns {string} - The XML string representation
 */
export function serializeDefinition(definition) {
  if (!definition) {
    return "";
  }
  
  return buildNode(definition, "definition", 0).trim();
}

/**
 * Parses an XML string to extract a definition object
 * @param {string} xmlString - The XML string to parse (should be a <definition> element)
 * @returns {Object} - The definition object
 * @throws {Error} - If XML is invalid or doesn't contain a definition element
 */
export function parseDefinitionXml(xmlString) {
  if (!xmlString || !xmlString.trim()) {
    throw new Error("Definition XML cannot be empty");
  }
  
  const xml = parseXmlOrThrow(xmlString, "definition");
  const rootElement = xml.documentElement;
  
  if (rootElement.nodeName !== "definition") {
    throw new Error(`Expected <definition> element, got <${rootElement.nodeName}>`);
  }
  
  return buildDefinitionObject(rootElement);
}

/**
 * Builds a definition object from an XML element
 * @param {Element} node - The XML element
 * @returns {Object} - The definition object
 */
function buildDefinitionObject(node) {
  const result = {};
  
  // Copy attributes
  if (node.attributes) {
    for (const attr of Array.from(node.attributes)) {
      result[attr.name] = attr.value;
    }
  }
  
  // Process child nodes
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childObj = buildDefinitionObject(child);
      const childName = child.nodeName;
      
      if (!result[childName]) {
        result[childName] = childObj;
      } else if (Array.isArray(result[childName])) {
        result[childName].push(childObj);
      } else {
        result[childName] = [result[childName], childObj];
      }
    } else if (child.nodeType === Node.TEXT_NODE) {
      const text = child.nodeValue.trim();
      if (text) {
        result["#text"] = text;
      }
    }
  }
  
  return result;
}

