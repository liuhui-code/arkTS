import path from 'node:path'

export async function removeIdenticalDeclarationCopies(
  primaryFiles: string[],
  secondaryFiles: string[],
  readFile: (file: string) => Promise<string>,
): Promise<string[]> {
  const primaryByBasename = new Map(primaryFiles.map(file => [path.basename(file), file]))
  const result: string[] = []

  for (const secondaryFile of secondaryFiles) {
    const primaryFile = primaryByBasename.get(path.basename(secondaryFile))
    if (!primaryFile || await readFile(primaryFile) !== await readFile(secondaryFile)) {
      result.push(secondaryFile)
    }
  }

  return result
}
