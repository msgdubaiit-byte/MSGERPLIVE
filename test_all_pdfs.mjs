import fs from 'fs';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

// Test on media_1793800672740.pdf and media_1794390182902.pdf
import { extractLinesFromDoc, parseSOItems } from './test_full_parser.mjs';

// Let's run on all PDFs in .user_uploaded
const dir = 'C:/Users/Admin/.gemini/antigravity/brain/5071eec3-c7f2-4e0b-9bbe-868be8a229b9/.user_uploaded';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf'));

for (const f of files) {
  const bytes = fs.readFileSync(`${dir}/${f}`);
  const lines = await extractLinesFromDoc(bytes);
  const items = parseSOItems(lines);
  console.log(`\n=== FILE: ${f} ===`);
  console.log(`Extracted lines: ${lines.length}, Parsed items: ${items.length}`);
  items.slice(0, 5).forEach(it => console.log(`  Item ${it.position}: ${it.itemCode} | Qty: ${it.qty} | Rate: ${it.rate} | ClientPO: ${it.clientPoItemNo}`));
}
