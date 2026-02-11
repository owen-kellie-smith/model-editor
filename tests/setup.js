import * as xmldom from "@xmldom/xmldom"
import { log } from "@/utils/logger.js"


log("debug","xmldom =", xmldom);

global.DOMParser = xmldom.DOMParser

global.Node = {
  ELEMENT_NODE: 1,
  TEXT_NODE: 3,
}

