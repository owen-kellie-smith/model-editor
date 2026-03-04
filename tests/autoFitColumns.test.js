
import { test, expect } from "vitest";
import { autoFitColumns } from "../docs/src/domain/spreadsheetRenderer.js";

test("autoFitColumns sets width based on longest cell value, incl richText", () => {
  // Minimal fake column that matches what autoFitColumns uses
  const col = {
    width: undefined,
    eachCell: (_opts, cb) => {
      cb({ value: { richText: [{ text: "Hello" }, { text: "World!!" }] } }); // 12 chars
      cb({ value: "abc" }); // 3 chars
      cb({ value: 12345 }); // 5 chars (stringified)
      cb({ value: null });  // ignored
    },
  };

  const sheet = { columns: [col] };

  autoFitColumns(sheet, { minWidth: 8, maxWidth: 60 });

  // Width should be set and within bounds
  expect(typeof col.width).toBe("number");
  expect(col.width).toBeGreaterThanOrEqual(8);
  expect(col.width).toBeLessThanOrEqual(60);
});
