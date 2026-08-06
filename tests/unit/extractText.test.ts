import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractTextWithPageMarkers } from '@/lib/pdf/extractText'

const fixturePath = path.join(__dirname, '..', 'e2e', 'fixtures', 'e2e-nda.pdf')

describe('extractTextWithPageMarkers', () => {
  it('extracts text and page markers from a real PDF', async () => {
    const buffer = readFileSync(fixturePath)
    const { text, pageCount } = await extractTextWithPageMarkers(buffer)

    expect(pageCount).toBeGreaterThanOrEqual(1)
    expect(text).toContain('[PAGE 1]')
    expect(text).toContain('MUTUAL NON-DISCLOSURE AGREEMENT')
    expect(text).toContain('Acme Robotics')
  })

  it('rejects a buffer that is not a valid PDF', async () => {
    await expect(extractTextWithPageMarkers(Buffer.from('not a pdf'))).rejects.toThrow()
  })
})
