import DOMMatrixPolyfill from 'dommatrix'

// pdfjs-dist's Node ("legacy") build — which pdf-parse wraps — unconditionally
// constructs `new DOMMatrix()` at module scope, even for text-only extraction.
// It expects either a browser environment or @napi-rs/canvas's native binary to
// provide that global. @napi-rs/canvas ships per-platform prebuilt binaries and
// isn't available in Netlify's serverless function bundle, so without this
// polyfill every PDF upload fails in production with "ReferenceError: DOMMatrix
// is not defined" — even though it works locally (where the native binary for
// the local platform is present). `dommatrix` is a small, dependency-free, pure-JS
// shim, so it works identically on every platform. Must run before `pdf-parse` is
// ever imported, which is why that import below is dynamic, inside the function —
// a static top-level import would be hoisted and evaluated before this line runs.
if (!globalThis.DOMMatrix) {
  globalThis.DOMMatrix = DOMMatrixPolyfill as unknown as typeof globalThis.DOMMatrix
}

/**
 * Wraps pdf-parse's page-wise text extraction, inserting `[PAGE N]` markers
 * between page boundaries so the marker survives storage in contracts.contract_text
 * and can drive both PdfViewer/TextViewerFallback navigation and OpenAI page citations.
 */
export async function extractTextWithPageMarkers(
  buffer: Buffer
): Promise<{ text: string; pageCount: number }> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    const text = result.pages.map((page) => `[PAGE ${page.num}]\n${page.text}`).join('\n\n')
    return { text, pageCount: result.total }
  } finally {
    await parser.destroy()
  }
}
