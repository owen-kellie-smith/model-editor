import * as xmldom from "@xmldom/xmldom"

console.log("xmldom =", xmldom)

global.DOMParser = xmldom.DOMParser

global.Node = {
  ELEMENT_NODE: 1,
  TEXT_NODE: 3,
}

