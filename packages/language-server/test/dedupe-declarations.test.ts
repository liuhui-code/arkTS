import { describe, expect, it } from 'vite-plus/test'
import { removeIdenticalDeclarationCopies } from '../src/utils/dedupe-declarations'

describe('removeIdenticalDeclarationCopies', () => {
  it('removes only same-name declarations with identical content', async () => {
    const content = new Map([
      ['/component/button.d.ts', 'declare const Button: ButtonInterface'],
      ['/component/text.d.ts', 'declare const Text: TextInterface'],
      ['/declarations/button.d.ts', 'declare const Button: ButtonInterface'],
      ['/declarations/text.d.ts', 'declare const Text: NewTextInterface'],
      ['/declarations/global.d.ts', 'declare const AppStorage: object'],
    ])

    const result = await removeIdenticalDeclarationCopies(
      ['/component/button.d.ts', '/component/text.d.ts'],
      ['/declarations/button.d.ts', '/declarations/text.d.ts', '/declarations/global.d.ts'],
      async file => content.get(file)!,
    )

    expect(result).toEqual(['/declarations/text.d.ts', '/declarations/global.d.ts'])
  })
})
