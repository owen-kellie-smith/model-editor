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

/**
 * Serialises a model object to a well-formed XML string.
 *
 * @param {{ model: Object }} obj - The model object (from validateModelCore or getObjectFromXML)
 * @returns {string} XML string beginning with an XML declaration
 */
export function serializeModel(obj) {
  return `<?xml version="1.0"?>\n` +
    buildNode(obj.model, "model", 0);
}

/**
 * Serialises a language object to a well-formed XML string.
 *
 * @param {{ model: Object }} obj - The language object (from getObjectFromXML applied to a language document)
 * @returns {string} XML string beginning with an XML declaration
 */
export function serializeLanguage(obj) {
  return `<?xml version="1.0"?>\n` +
         buildNode(obj.model, "language", 0);
}

/**
 * Recursively converts a plain JS object node into an indented XML string.
 * - Primitive values are serialised as text content.
 * - Object properties whose keys start with `#text` become text content.
 * - Other object properties become child elements; arrays produce repeated elements.
 * - Remaining scalar properties become XML attributes.
 *
 * @param {Object|string|number|null} node - The node to serialise
 * @param {string} tagName - The XML element tag name to use
 * @param {number} depth - Current indentation depth (0 = top level)
 * @returns {string} Indented XML string for this node and its descendants
 */
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

/**
 * Serializes a full <variable> object to indented XML string
 * @param {Object} variable - The variable object to serialize
 * @returns {string}
 */
export function serializeVariable(variable) {
  if (!variable) return "";
  // IMPORTANT: no <variables> wrapper, no regex extraction
  return buildNode(variable, "variable", 0).trim();
}

/**
 * Parses an XML string to extract a variable object
 * @param {string} xmlString - The XML string to parse (should be a <variable> element)
 * @returns {Object|string} - The variable object
 * @throws {Error}
 */
export function parseVariableXml(xmlString) {
  if (!xmlString || !xmlString.trim()) {
    throw new Error("Variable XML cannot be empty");
  }

  const xml = parseXmlOrThrow(xmlString, "variable");
  const rootElement = xml.documentElement;

  if (rootElement.nodeName !== "variable") {
    throw new Error(`Expected <variable> element, got <${rootElement.nodeName}>`);
  }

  const obj = buildElementObject(rootElement);

  // We expect a variable object (not a string)
  if (typeof obj !== "object" || obj == null) {
    throw new Error("Parsed variable XML did not produce an object");
  }

  return obj;
}

/**
 * Generic XML element -> JS object builder.
 * - Attributes become properties (e.g. id="x" -> { id: "x" })
 * - Child elements become properties (repeated tags become arrays)
 * - Pure text-only elements become strings (e.g. <unit>GBP</unit> -> "GBP")
 * - Mixed content uses { "#text": "..." } alongside other properties
 */
function buildElementObject(node) {
  const hasAttrs = node.attributes && node.attributes.length > 0;

  // Collect child element nodes
  const elementChildren = Array.from(node.childNodes).filter(
    (n) => n.nodeType === Node.ELEMENT_NODE
  );

  // Collect trimmed text content directly under this node
  const textParts = Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => (n.nodeValue ?? "").trim())
    .filter(Boolean);

  const text = textParts.join(" ").trim();

  // If it's a simple text-only element with no attrs and no element children, return string
  if (!hasAttrs && elementChildren.length === 0) {
    return text || "";
  }

  const result = {};

  // Attributes
  if (hasAttrs) {
    for (const attr of Array.from(node.attributes)) {
      result[attr.name] = attr.value;
    }
  }

  // Text (only keep #text when we also have attrs/children)
  if (text) {
    result["#text"] = text;
  }

  // Children
  for (const child of elementChildren) {
    const childName = child.nodeName;
    const childObj = buildElementObject(child);

    if (!(childName in result)) {
      result[childName] = childObj;
    } else if (Array.isArray(result[childName])) {
      result[childName].push(childObj);
    } else {
      result[childName] = [result[childName], childObj];
    }
  }

  return result;
}