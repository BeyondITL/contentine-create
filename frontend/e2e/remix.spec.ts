import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * R4 · F-9 — Content Remix Hub input surface (WS-8), the browser-native paths.
 *
 * The 7 SourceType values (text | url | youtube | tiktok | pdf | audio | video)
 * are exposed through 5 UI tabs (the URL tab auto-detects url/youtube/tiktok).
 * This spec proves the browser-side inputs end-to-end and the honest failure of
 * the backend-only URL path — with NO model and NO backend (the static export):
 *
 *   • all 5 tabs render as PLAIN buttons (no ARIA tab semantics);
 *   • URL auto-detection → a backend-down URL/YouTube produces the EXACT honest
 *     error string and creates NO source card (no fabricated success);
 *   • Paste Text → a real source card (type badge "text", live + persisted word
 *     count);
 *   • PDF upload → client-side pdfjs extraction → a real "text" source card;
 *   • the D-53 cap of 10 sources disables the add controls (not a toast).
 *
 * Audio/Video (on-device Whisper) live behind a model gate and are proven in
 * remix-transcribe.spec.ts (model lane).
 */

const REMIX = 'http://127.0.0.1:8321/remix/';

async function textTab(page: Page) {
  await page.getByRole('button', { name: 'Paste Text' }).click();
  return page.getByPlaceholder('Paste your content here');
}

test('5 input tabs are plain buttons; no ARIA tab semantics', async ({ page }) => {
  await page.goto(REMIX);
  await expect(page.getByRole('heading', { name: 'Content Remix Hub' })).toBeVisible({ timeout: 20_000 });
  for (const name of ['URL / Link', 'Paste Text', 'PDF', 'Audio', 'Video']) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
  expect(await page.getByRole('tab').count()).toBe(0);
  expect(await page.getByRole('tablist').count()).toBe(0);
});

test('URL tab: backend-down article + YouTube fail honestly with exact strings and no card', async ({
  page,
}) => {
  await page.goto(REMIX);
  await page.getByRole('button', { name: 'URL / Link' }).click();
  const urlInput = page.locator('input[type="url"]');

  // Generic article URL → detected type `url`.
  await urlInput.fill('https://example.com/some-article-to-remix');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(
    page.getByText(
      'Could not reach the extraction service. Copy the article text and add it with the "Paste Text" tab instead.',
    ),
  ).toBeVisible({ timeout: 30_000 });
  // Honest failure: NO source card was fabricated.
  expect(await page.getByText(/Sources \(\d+\/10\)/).count()).toBe(0);

  // A youtube.com link → detected type `youtube` (proves detectSourceType).
  await urlInput.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(
    page.getByText('Could not reach the extraction service to read this youtube. Check your connection and try again.'),
  ).toBeVisible({ timeout: 30_000 });
  expect(await page.getByText(/Sources \(\d+\/10\)/).count()).toBe(0);
});

test('Paste Text → a real "text" source card with a word count', async ({ page }) => {
  await page.goto(REMIX);
  const ta = await textTab(page);
  await ta.fill('Hello world foo bar baz'); // 5 words
  // Live pre-submit counter.
  await expect(page.getByText('5 words')).toBeVisible();
  await page.getByRole('button', { name: 'Add Source', exact: true }).click();

  await expect(page.getByText('Sources (1/10)')).toBeVisible();
  // Type badge renders the literal source type text "text".
  await expect(page.getByText('text', { exact: true })).toBeVisible();
  // Persisted card word count survives the textarea clearing.
  await expect(page.getByText('5 words')).toBeVisible();
});

test('PDF upload → client-side extraction → a real "text" source card', async ({ page }) => {
  await page.goto(REMIX);
  await page.getByRole('button', { name: 'PDF' }).click();

  const pdf = makeTextPdf('Contentine remix pdf extraction smoke test document sample content');
  await page.locator('input[accept=".pdf"]').setInputFiles({
    name: 'smoke.pdf',
    mimeType: 'application/pdf',
    buffer: pdf,
  });

  // pdfjs extracts client-side then routes through addTextSource → badge "text".
  await expect(page.getByText('Sources (1/10)')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('text', { exact: true })).toBeVisible();
  await expect(page.getByText(/\d+ words/)).toBeVisible();
});

test('D-53: the 10-source cap DISABLES the add controls (no toast)', async ({ page }) => {
  await page.goto(REMIX);
  const ta = await textTab(page);
  const addSource = page.getByRole('button', { name: 'Add Source', exact: true });
  for (let i = 1; i <= 10; i++) {
    await ta.fill(`Source number ${i} with several filler words here`);
    await addSource.click();
    await expect(page.getByText(`Sources (${i}/10)`)).toBeVisible();
  }
  // At the cap: header reads 10/10 and the text add control is disabled.
  await expect(page.getByText('Sources (10/10)')).toBeVisible();
  await ta.fill('an 11th source that must not be addable');
  await expect(addSource).toBeDisabled();
  // The URL tab's Add + input are disabled too (enforcement is disable, not toast).
  await page.getByRole('button', { name: 'URL / Link' }).click();
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  await expect(page.locator('input[type="url"]')).toBeDisabled();
});

/**
 * Minimal single-page PDF with Helvetica text pdfjs-dist can extract. Object
 * byte offsets are computed for a correct xref table.
 */
function makeTextPdf(text: string): Buffer {
  const header = '%PDF-1.4\n';
  const objs = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      '/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    (() => {
      const stream = `BT /F1 18 Tf 72 700 Td (${text}) Tj ET`;
      return `4 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`;
    })(),
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let body = header;
  const offsets: number[] = [];
  for (const o of objs) {
    offsets.push(Buffer.byteLength(body));
    body += o;
  }
  const xrefStart = Buffer.byteLength(body);
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  const trailer = `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body + xref + trailer, 'latin1');
}
