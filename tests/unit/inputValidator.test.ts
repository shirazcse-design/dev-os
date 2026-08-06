import { describe, expect, it } from 'vitest'
import { validateFileUpload } from '@/lib/security/inputValidator'

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF
const NOT_PDF_MAGIC = new Uint8Array([0x00, 0x00, 0x00, 0x00])

function makeFile(name: string, type: string, bytes: Uint8Array, sizeBytes?: number) {
  const content = sizeBytes ? new Uint8Array(sizeBytes) : bytes
  if (sizeBytes) content.set(bytes)
  return new File([Buffer.from(content)], name, { type })
}

describe('validateFileUpload', () => {
  it('accepts a real PDF', async () => {
    const file = makeFile('contract.pdf', 'application/pdf', PDF_MAGIC)
    const result = await validateFileUpload(file, 10)
    expect(result.valid).toBe(true)
  })

  it('rejects a blocked extension even with a spoofed pdf mime type', async () => {
    const file = makeFile('malware.exe', 'application/pdf', PDF_MAGIC)
    const result = await validateFileUpload(file, 10)
    expect(result.valid).toBe(false)
    expect(result.code).toBe('BLOCKED_FILE_TYPE')
  })

  it('rejects a non-allowed extension like .docx', async () => {
    const file = makeFile('contract.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', PDF_MAGIC)
    const result = await validateFileUpload(file, 10)
    expect(result.valid).toBe(false)
    expect(result.code).toBe('INVALID_FILE_TYPE')
  })

  it('rejects a .pdf extension with the wrong mime type', async () => {
    const file = makeFile('contract.pdf', 'text/plain', PDF_MAGIC)
    const result = await validateFileUpload(file, 10)
    expect(result.valid).toBe(false)
    expect(result.code).toBe('INVALID_FILE_TYPE')
  })

  it('rejects a file over the size limit', async () => {
    const file = makeFile('contract.pdf', 'application/pdf', PDF_MAGIC, 2 * 1024 * 1024)
    const result = await validateFileUpload(file, 1)
    expect(result.valid).toBe(false)
    expect(result.code).toBe('FILE_TOO_LARGE')
  })

  it('rejects a .pdf file with the correct mime type but a spoofed magic byte header', async () => {
    const file = makeFile('contract.pdf', 'application/pdf', NOT_PDF_MAGIC)
    const result = await validateFileUpload(file, 10)
    expect(result.valid).toBe(false)
    expect(result.code).toBe('INVALID_FILE_TYPE')
  })

  it('rejects a file with no extension', async () => {
    const file = makeFile('contract', 'application/pdf', PDF_MAGIC)
    const result = await validateFileUpload(file, 10)
    expect(result.valid).toBe(false)
    expect(result.code).toBe('INVALID_FILE_TYPE')
  })
})
