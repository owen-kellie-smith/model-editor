import { exportFile } from "../docs/src/utils/export.js"
import { describe, test, expect, vi } from "vitest"

describe("exportFile", () => {
  test("creates download link", () => {
    const appendSpy = vi.spyOn(document.body, "appendChild")
    const removeSpy = vi.spyOn(document.body, "removeChild")

    exportFile("<xml></xml>", "test.xml")

    expect(appendSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalled()
  })

  test("returns if content is not string", () => {
    const result = exportFile(null, "test.xml")
    expect(result).toBeUndefined()
  })
})
