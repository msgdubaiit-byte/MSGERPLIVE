import fs from 'fs';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

// Let's copy the exact text extraction logic from pdfEngine.ts and test it on media_1794391152612.pdf
const filePath = 'C:/Users/Admin/.gemini/antigravity/brain/5071eec3-c7f2-4e0b-9bbe-868be8a229b9/.user_uploaded/media_1794391152612.pdf';
const bytes = fs.readFileSync(filePath);

function parseToUnicodeCMap(cmapStr) {
  const map = new Map();
  const bfrangeRegex = /(\d+)\s+beginbfrange([\s\S]*?)endbfrange/g;
  let match;
  while ((match = bfrangeRegex.exec(cmapStr)) !== null) {
    const lines = match[2].trim().split(/[\r\n]+/);
    for (const l of lines) {
      const parts = l.trim().match(/<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/);
      if (parts) {
        const start = parseInt(parts[1], 16);
        const end = parseInt(parts[2], 16);
        let target = parseInt(parts[3], 16);
        for (let code = start; code <= end; code++) {
          map.set(code, String.fromCharCode(target));
          target++;
        }
      }
    }
  }
  const bfcharRegex = /(\d+)\s+beginbfchar([\s\S]*?)endbfchar/g;
  while ((match = bfcharRegex.exec(cmapStr)) !== null) {
    const lines = match[2].trim().split(/[\r\n]+/);
    for (const l of lines) {
      const parts = l.trim().match(/<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/);
      if (parts) {
        map.set(parseInt(parts[1], 16), String.fromCharCode(parseInt(parts[2], 16)));
      }
    }
  }
  return map;
}

function decodePDFString(s, cmap) {
  const words = s.split(/\s+/);
  const decodedWords = [];
  for (const w of words) {
    if (w) {
      let wordStr = '';
      for (let i = 0; i < w.length; i++) {
        const code = w.charCodeAt(i);
        wordStr += cmap.get(code) || w[i];
      }
      decodedWords.push(wordStr);
    }
  }
  return decodedWords.join(' ');
}

async function run() {
  const loadedDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const cmap = new Map();
  for (const [, obj] of loadedDoc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      try {
        const decoded = decodePDFRawStream(obj).decode();
        const str = new TextDecoder('latin1').decode(decoded);
        if (str.includes('begincmap')) {
          const m = parseToUnicodeCMap(str);
          for (const [k, v] of m.entries()) cmap.set(k, v);
        }
      } catch (e) {}
    }
  }

  console.log(`CMap size: ${cmap.size}`);

  const pages = loadedDoc.getPages();
  const tokenRegex = /\((?:[^\\)]|\\.)*\)|<[0-9A-Fa-f]+>/g;
  const decodedLines = [];

  for (let p = 0; p < pages.length; p++) {
    const content = pages[p].node.Contents();
    const streams = [];
    if (content instanceof PDFRawStream) {
      streams.push(content);
    } else if (content && content.asArray) {
      for (const ref of content.asArray()) {
        const s = loadedDoc.context.lookup(ref);
        if (s instanceof PDFRawStream) streams.push(s);
      }
    }

    for (const s of streams) {
      try {
        const decoded = decodePDFRawStream(s).decode();
        const str = new TextDecoder('latin1').decode(decoded);
        const lines = str.split(/[\r\n]+/);
        for (const l of lines) {
          let m;
          while ((m = tokenRegex.exec(l)) !== null) {
            const raw = m[0];
            if (raw.startsWith('(')) {
              let text = decodePDFString(raw.slice(1, -1), cmap).trim();
              if (text) decodedLines.push(text);
            } else if (raw.startsWith('<')) {
              // Hex string!
              console.log('Found hex string:', raw);
            }
          }
        }
      } catch (e) {}
    }
  }

  console.log(`Extracted lines count: ${decodedLines.length}`);
  console.log('--- ALL EXTRACTED LINES ---');
  decodedLines.forEach((l, idx) => console.log(`${idx}: ${l}`));
}

run();
