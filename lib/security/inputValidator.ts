export * from '@/lib/validation/schemas'

// Checked first, and rejected outright regardless of the allow-list below —
// a blocked extension is never valid even if a future allow-list addition
// would otherwise accept it.
const BLOCKED_EXTENSIONS = [
  '.exe', '.js', '.mjs', '.cjs', '.php', '.zip', '.sh', '.bat', '.cmd', '.py', '.rb', '.ps1',
]

// PDF-only: this codebase has no DOCX parser (lib/pdf/extractText.ts is
// PDF-specific), so accepting .docx here would let a file pass upload
// validation and then fail unpredictably at extraction instead of failing
// clearly at the upload boundary.
const ALLOWED_EXTENSIONS = ['.pdf']
const ALLOWED_MIME_TYPES = ['application/pdf']
const PDF_MAGIC_BYTES = Buffer.from('%PDF')

export interface FileValidationResult {
  valid: boolean
  code?: string
  message?: string
}

/**
 * Validates a file upload in order: blocklist → allowlist extension → MIME
 * type → size → magic bytes. The magic-byte check catches a file renamed to
 * `.pdf` with a spoofed Content-Type header, which extension/MIME checks
 * alone cannot.
 */
export async function validateFileUpload(file: File, maxSizeMB: number): Promise<FileValidationResult> {
  const name = file.name.toLowerCase()
  const dotIndex = name.lastIndexOf('.')
  const extension = dotIndex >= 0 ? name.slice(dotIndex) : ''

  if (BLOCKED_EXTENSIONS.includes(extension)) {
    return { valid: false, code: 'BLOCKED_FILE_TYPE', message: 'This file type is not allowed.' }
  }
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return { valid: false, code: 'INVALID_FILE_TYPE', message: 'Only PDF files are supported.' }
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, code: 'INVALID_FILE_TYPE', message: 'Only PDF files are supported.' }
  }
  if (file.size > maxSizeMB * 1024 * 1024) {
    return { valid: false, code: 'FILE_TOO_LARGE', message: `File must be under ${maxSizeMB}MB.` }
  }

  const header = Buffer.from(await file.slice(0, 4).arrayBuffer())
  if (!header.equals(PDF_MAGIC_BYTES)) {
    return {
      valid: false,
      code: 'INVALID_FILE_TYPE',
      message: 'This file does not appear to be a valid PDF.',
    }
  }

  return { valid: true }
}
