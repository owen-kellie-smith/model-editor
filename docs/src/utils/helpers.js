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
  return Object.fromEntries(
    [...map.entries()].map(([k, v]) => [k, [...v]])
  );
}

export function removeStringLiterals(text) {
  return text.replace(/"[^"]*"/g, "");
}

export function throwModelError(message, context = {}) {
  const err = new Error(message);
  err.context = context;
  throw err;
}

export function parseXmlOrThrow(text, label) {
  log("debug","Parsing:", label, text?.slice(0, 200));

  const xml = createDOMParser().parseFromString(text, "application/xml");
  log("debug","ROOT:", xml.documentElement?.nodeName);
  log("debug",
    "CHILDREN:",
    Array.from(xml.documentElement?.childNodes ?? []).map(n => n.nodeName));

  const err = xml.getElementsByTagName("parsererror")[0];
  if (err) throw new Error(`Invalid XML in ${label}`);
  return xml;
}


export function getObjectFromXML(xml) {
  function getObjectFromNode(node) {
    const obj = {};

    if (node.attributes) {
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes.item(i);
        obj[attr.name] = attr.value;
      }
    }

    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const name = child.nodeName;
        const value = getObjectFromNode(child);

        if (obj[name]) {
          if (!Array.isArray(obj[name])) {
            obj[name] = [obj[name]];
          }
          obj[name].push(value);
        } else {
          obj[name] = value;
        }
      }

      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.nodeValue.trim();
        if (text) {
          obj["#text"] = text;
        }
      }
    }

    return obj;
  }

  return { model: getObjectFromNode(xml.documentElement) };
}

