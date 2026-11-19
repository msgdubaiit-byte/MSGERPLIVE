import fs from 'fs';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

// Let's print the last 10 items of test 2
const bytes = fs.readFileSync('C:/Users/Admin/.gemini/antigravity/brain/5071eec3-c7f2-4e0b-9bbe-868be8a229b9/.user_uploaded/media_1793556640574.pdf');

// Let's see the last 100 lines of decodedLines
