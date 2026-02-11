import { buildNode } from "../utils/helpers.js"

export function serializeModel(obj) {
  return `<?xml version="1.0"?>\n` +
         buildNode(obj.model, "model");
}



