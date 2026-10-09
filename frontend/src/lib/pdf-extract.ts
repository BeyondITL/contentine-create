/**
 * Browser-side PDF text extraction using pdfjs-dist.
 * Dynamically imported to avoid bundling on pages that don't need it.
 */

/** Extract all text content from a PDF file. */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');

  // Use local worker file (downloaded by setup-assets.sh) — no CDN dependency
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/workers/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .filter((item) => 'str' in item && typeof (item as Record<string, unknown>).str === 'string')
      .map((item) => (item as Record<string, unknown>).str as string)
      .join(' ');
    pages.push(text);
  }

  return pages.join('\n\n');
}
