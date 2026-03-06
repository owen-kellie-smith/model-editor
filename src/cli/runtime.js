import * as xmldom from '@xmldom/xmldom';
import ExcelJS from 'exceljs';

if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = xmldom.DOMParser;
}

if (typeof globalThis.XMLSerializer === 'undefined') {
  globalThis.XMLSerializer = xmldom.XMLSerializer;
}

if (typeof globalThis.Node === 'undefined') {
  globalThis.Node = function Node() {};
}

globalThis.Node.ELEMENT_NODE ??= 1;
globalThis.Node.TEXT_NODE ??= 3;

globalThis.ExcelJS = ExcelJS;
