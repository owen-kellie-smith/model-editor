import { DOMParser } from "@xmldom/xmldom";
import xpath from "xpath";
import fs from "fs";
import { XMLSerializer } from "@xmldom/xmldom";

global.XMLSerializer = XMLSerializer;


export function loadXml(path) {
  const text = fs.readFileSync(path, "utf8");
  const doc = new DOMParser().parseFromString(text, "application/xml");

  // tiny shim
  doc.querySelectorAll = (q) => xpath.select("//" + q.replace(/>/g, "/"), doc);

  return doc;
}

