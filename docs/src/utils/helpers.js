import { createDOMParser } from "./domParser.js"
import { log } from "../utils/logger.js"

export function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

export function enableElement(el, qualifier) {
  el.disabled = !qualifier;
}

export function getStringfromObject(obj) {
  return JSON.stringify(obj || {}, null, 2);
}

export function getObjectFromMap(map) {
  return Object.fromEntries(map);
}

export function getObjectFromMapOfSets(map) {
  const result = {};
  for (const [key, set] of map.entries()) {
    result[key] = Array.from(set);
  }
  return result;
}

export function removeStringLiterals(text) {
  return text.replace(/"[^"]*"/g, "");
}

export function throwModelError(message, context = {}) {
  log("debug","About to throw:", message + "\n" + getStringfromObject(context));
  const err = new Error(message);
  err.context = context;
  throw err;
}

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


export function getObjectFromXML(xml) {
  return { model: buildNodeObject(xml?.documentElement) };
}

function buildNodeObject(node) {
  const result = {};

  copyAttributes(node, result);
  readChildren(node, result);

  return result;
}

function copyAttributes(node, result) {
  if (!node?.attributes) return;

  for (const attr of Array.from(node.attributes)) {
    result[attr.name] = attr.value;
  }
}

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

function isElement(node) {
  return node.nodeType === Node.ELEMENT_NODE;
}

function isText(node) {
  return node.nodeType === Node.TEXT_NODE;
}

export function buildNode(node, tagName) {
  if (node == null) return "";

  // primitive
  if (typeof node !== "object") {
    return `<${tagName}>${node}</${tagName}>`;
  }

  // text node
  if ("#text" in node && Object.keys(node).length === 1) {
    return `<${tagName}>${node["#text"]}</${tagName}>`;
  }

  let attrs = "";
  let children = "";

  for (const [key, value] of Object.entries(node)) {
    if (key === "#text") continue;

    if (Array.isArray(value)) {
      for (const v of value) {
        children += buildNode(v, key);
      }
    } else if (typeof value === "object") {
      children += buildNode(value, key);
    } else {
      // primitive → treat as attribute
      attrs += ` ${key}="${value}"`;
    }
  }

  const text = node["#text"] ?? "";

  return `<${tagName}${attrs}>${text}${children}</${tagName}>`;
}

