import path from "path"

export function getFixture(name: string) {
  return path.join(__dirname, "..", "fixtures", name)
}

