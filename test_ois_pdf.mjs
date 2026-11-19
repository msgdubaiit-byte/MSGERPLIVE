import fs from 'fs';
import { extractLinesFromDoc } from './test_full_parser.mjs';

const bytes = fs.readFileSync('C:/Users/Admin/.gemini/antigravity/brain/5071eec3-c7f2-4e0b-9bbe-868be8a229b9/.user_uploaded/media_1794391738233.pdf');
const lines = await extractLinesFromDoc(bytes);
const text = lines.join('\n');

const soMatch = text.match(/Sales\s*Order\s*#?\s*([A-Za-z0-9\-_/]+)/i);
const refMatch = text.match(/Ref\s*#?\s*[:\s]*[\r\n]*([A-Za-z0-9\-_/]+)/i);
const clientMatch = text.match(/Bill\s*To[\r\n]+([^\r\n]{3,80})/i);

console.log('soMatch:', soMatch ? soMatch[1] : 'NONE');
console.log('refMatch:', refMatch ? refMatch[1] : 'NONE');
console.log('clientMatch:', clientMatch ? clientMatch[1] : 'NONE');
console.log('Total extracted lines:', lines.length);
lines.slice(0, 30).forEach((l, idx) => console.log(`${idx}: ${l}`));
