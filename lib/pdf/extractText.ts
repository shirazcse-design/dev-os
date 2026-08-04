import { PDFParse } from 'pdf-parse'

/**
 * Wraps pdf-parse's page-wise text extraction, inserting `[PAGE N]` markers
 * between page boundaries so the marker survives storage in contracts.contract_text
 * and can drive both PdfViewer/TextViewerFallback navigation and OpenAI page citations.
 */
export async function extractTextWithPageMarkers(
  buffer: Buffer
): Promise<{ text: string; pageCount: number }> {
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    const text = result.pages.map((page) => `[PAGE ${page.num}]\n${page.text}`).join('\n\n')
    return { text, pageCount: result.total }
  } finally {
    await parser.destroy()
  }
}
