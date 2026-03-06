import fs from 'node:fs';
import xpath from 'xpath';

export function loadXmlFromFile(path) {
  const xmlText = fs.readFileSync(path, 'utf8');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  doc.querySelectorAll = (query) => xpath.select(`//${query.replace(/>/g, '/')}`, doc);
  return doc;
}
