let DOMParserImpl = globalThis.DOMParser

export function createDOMParser() {
  return new DOMParserImpl()
}

