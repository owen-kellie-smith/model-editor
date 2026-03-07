import { createDOMParser } from "./domParser.js"
import { log } from "../utils/logger.js"

/**
 * Sanitizes a string to be safe for use as a filename.
 * Replaces any character that is not alphanumeric, underscore, or hyphen with an underscore,
 * collapses consecutive underscores, and strips leading/trailing underscores.
 *
 * @param {string} name - The raw filename candidate
 * @returns {string} A sanitized filename string; falls back to "model" if the result is empty
 */
export function sanitizeFilename(name) {
  return String(name || "model")
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "model";
}


/**
 * Escapes HTML special characters in a string to prevent XSS when inserting into the DOM.
 *
 * @param {*} text - The value to escape; non-strings are converted via String()
 * @returns {string} HTML-escaped string, or an empty string if `text` is null/undefined
 */
export function escapeHtml(text) {
  if (text == null) {
    return '';
  }
  if (typeof text !== 'string') {
    text = String(text);
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Sets the content of a DOM element.
 * Accepts either an HTML string (set via innerHTML) or an Element (appended after clearing).
 *
 * @param {Element} ele - The target DOM element
 * @param {string|Element} content - The content to set
 * @returns {void}
 */
export function setElementContent(ele, content) {
  // If it's a string, set as HTML
  if (typeof content === 'string') {
    ele.innerHTML = content;
  } 
  // If it's an element, append it
  else if (content instanceof Element) {
    // Clear existing content
    ele.innerHTML = "";  
    ele.appendChild(content);
  }
}

/**
 * Normalises a value that may be a single item or an array into an array.
 * Returns an empty array for null/undefined, the original array if already an array,
 * or a single-element array wrapping any other value.
 *
 * @param {*} x - The value to normalise
 * @returns {Array} An array representation of `x`
 */
export function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

/**
 * Sets or clears the `disabled` property of a DOM element based on a qualifier.
 *
 * @param {Element} el - The DOM element to enable or disable
 * @param {boolean} qualifier - If truthy the element is enabled; if falsy it is disabled
 * @returns {void}
 */
export function enableElement(el, qualifier) {
  el.disabled = !qualifier;
}

/**
 * Serialises an object to a pretty-printed JSON string.
 * Returns `"{}"` if `obj` is null or undefined.
 *
 * @param {Object|null|undefined} obj - The object to serialise
 * @returns {string} JSON string with 2-space indentation
 */
export function getStringfromObject(obj) {
  return JSON.stringify(obj || {}, null, 2);
}

/**
 * Converts a Map to a plain object using Object.fromEntries.
 *
 * @param {Map} map - The map to convert
 * @returns {Object} A plain object with the same key/value pairs as the map
 */
export function getObjectFromMap(map) {
  return Object.fromEntries(map);
}

/**
 * Converts a Map whose values are Sets into a plain object whose values are Arrays.
 *
 * @param {Map<string, Set>} map - The map of sets to convert
 * @returns {Object<string, Array>} A plain object with array values
 */
export function getObjectFromMapOfSets(map) {
  const result = {};
  for (const [key, set] of map.entries()) {
    result[key] = Array.from(set);
  }
  return result;
}

/**
 * Removes all double-quoted string literals from an expression string.
 * Used before tokenising so that identifiers inside strings are not mistaken for variable references.
 *
 * @param {string} text - The expression text
 * @returns {string} The text with `"..."` substrings replaced by empty strings
 */
export function removeStringLiterals(text) {
  return text.replace(/"[^"]*"/g, "");
}

/**
 * Throws an Error with a structured context object attached.
 * Logs the message and context at debug level before throwing.
 *
 * @param {string} message - Human-readable error description
 * @param {Object} [context={}] - Additional key/value pairs to attach as `err.context`
 * @throws {Error} Always throws
 */
export function throwModelError(message, context = {}) {
  log("debug","About to throw:", message + "\n" + getStringfromObject(context));
  const err = new Error(message);
  err.context = context;
  throw err;
}

/**
 * Parses an XML string and returns the resulting Document.
 * Throws a descriptive error if the XML is malformed.
 *
 * @param {string} text - The XML string to parse
 * @param {string} label - A label used in the error message to identify the source
 * @returns {Document} The parsed XML Document
 * @throws {Error} If the XML contains a parser error
 */
export function parseXmlOrThrow(text, label) {
  log("debug","Parsing:", label, text?.slice(0, 200));

  const xml = createDOMParser().parseFromString(text, "application/xml");
  log("debug","ROOT:", xml?.documentElement?.nodeName);
  log("debug",
    "CHILDREN:",
    Array.from(xml?.documentElement?.childNodes ?? []).map(n => n.nodeName));

  const err = xml?.getElementsByTagName("parsererror")[0];
  if (err) throw new Error(`Invalid XML in ${label}`);
  return xml;
}


/**
 * Converts a parsed XML Document into a plain JavaScript object tree.
 * The root element is wrapped under a `model` key.
 *
 * @param {Document} xml - A parsed XML Document (from parseXmlOrThrow)
 * @returns {{ model: Object }} A plain object representation of the XML
 */
export function getObjectFromXML(xml) {
  return { model: buildNodeObject(xml?.documentElement) };
}

/**
 * Recursively converts an XML element into a plain JS object.
 * Attributes become string properties; child elements become nested objects
 * (or arrays when the same tag appears more than once); text nodes become `#text`.
 *
 * @param {Element} node - The XML element to convert
 * @returns {Object} A plain JS object representation of the element
 */
function buildNodeObject(node) {
  const result = {};

  copyAttributes(node, result);
  readChildren(node, result);

  return result;
}

/**
 * Copies all XML attributes from `node` into the plain object `result`.
 *
 * @param {Element} node - The XML element whose attributes to copy
 * @param {Object} result - The target plain object
 * @returns {void}
 */
function copyAttributes(node, result) {
  if (!node?.attributes) return;

  for (const attr of Array.from(node.attributes)) {
    result[attr.name] = attr.value;
  }
}

/**
 * Iterates over the child nodes of `node`, appending element children as nested
 * objects and trimmed text content as `#text` on `result`.
 *
 * @param {Element} node - The XML element whose children to process
 * @param {Object} result - The target plain object
 * @returns {void}
 */
function readChildren(node, result) {
  for (const child of Array.from(node?.childNodes || [])) {
    if (isElement(child)) {
      appendChildObject(result, child.nodeName, buildNodeObject(child));
    }

    if (isText(child)) {
      const text = child.nodeValue.trim();
      if (text) result["#text"] = text;
    }
  }
}

/**
 * Adds a child object to a result object under the given property name.
 * Converts the property to an array automatically when the same name appears more than once.
 *
 * @param {Object} result - The target plain object
 * @param {string} name - The property name to add the value under
 * @param {Object|string} value - The child object or string to add
 * @returns {void}
 */
function appendChildObject(result, name, value) {
  if (!result[name]) {
    result[name] = value;
    return;
  }

  if (!Array.isArray(result[name])) {
    result[name] = [result[name]];
  }

  result[name].push(value);
}

/**
 * Returns true if the given DOM node is an element node.
 *
 * @param {Node} node - The DOM node to check
 * @returns {boolean}
 */
function isElement(node) {
  return node.nodeType === Node.ELEMENT_NODE;
}

/**
 * Returns true if the given DOM node is a text node.
 *
 * @param {Node} node - The DOM node to check
 * @returns {boolean}
 */
function isText(node) {
  return node.nodeType === Node.TEXT_NODE;
}

