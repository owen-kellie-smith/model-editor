import * as xmldom from "@xmldom/xmldom"
import { log } from "@/utils/logger.js"


log("debug","xmldom =", xmldom);

global.DOMParser = xmldom.DOMParser

// Set Node constants if not already defined
// Using a function to avoid breaking instanceof checks
if (typeof global.Node === 'undefined') {
  global.Node = function() {};
}
global.Node.ELEMENT_NODE = 1;
global.Node.TEXT_NODE = 3;

