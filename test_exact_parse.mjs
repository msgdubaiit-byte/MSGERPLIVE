import fs from 'fs';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

const bytes = fs.readFileSync('C:/Users/Admin/.gemini/antigravity/brain/5071eec3-c7f2-4e0b-9bbe-868be8a229b9/.user_uploaded/media_1794391152612.pdf');

const parseToUnicodeCMap = (cmapStr) => {
  const map = new Map();
  const bfrangeMatches = cmapStr.matchAll(/beginbfrange\s+([\s\S]*?)endbfrange/g);
  for (const m of bfrangeMatches) {
    const tokens = m[1].match(/<[0-9A-Fa-f]+>|\[[^\]]+\]/g) || [];
    for (let i = 0; i < tokens.length; i += 3) {
      const start = parseInt(tokens[i].replace(/[<>]/g, ''), 16);
      const end = parseInt(tokens[i + 1].replace(/[<>]/g, ''), 16);
      const destToken = tokens[i + 2];
      if (destToken && destToken.startsWith('<')) {
        const destStart = parseInt(destToken.replace(/[<>]/g, ''), 16);
        for (let code = start; code <= end; code++) {
          map.set(code, String.fromCharCode(destStart + (code - start)));
        }
      }
    }
  }
  return map;
};

const decodePDFString = (raw, cmap) => {
  const unescaped = raw.replace(/\\([()\\])/g, '$1');
  const words = unescaped.split(/\s{2,}/);
  const decodedWords = [];
  for (const w of words) {
    if (!w) continue;
    const charTokens = w.trim().split(/\s+/);
    if (charTokens.length > 1 && charTokens.every(t => t.length === 1)) {
      let wordStr = '';
      for (const tok of charTokens) {
        const code = tok.charCodeAt(0);
        wordStr += cmap.get(code) || tok;
      }
      decodedWords.push(wordStr);
    } else {
      let wordStr = '';
      for (let i = 0; i < w.length; i++) {
        const code = w.charCodeAt(i);
        wordStr += cmap.get(code) || w[i];
      }
      if (/^[A-Za-z0-9_\-\/.,:"](\s+[A-Za-z0-9_\-\/.,:"])+$/.test(wordStr.trim())) {
        wordStr = wordStr.replace(/\s+/g, '');
      }
      decodedWords.push(wordStr);
    }
  }
  let line = decodedWords.join(' ');
  line = line.replace(/[–\u2013\u0396\u0096]/g, 'I').replace(/\s*I\s*/g, 'I').replace(/\u0000/g, '');
  return line;
};

async function test() {
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
      } catch {}
    }
  }

  const pages = loadedDoc.getPages();
  const tokenRegex = /\((?:[^\\)]|\\.)*\)|<[0-9A-Fa-f]+>/g;
  let decodedLines = [];

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
            }
          }
        }
      } catch {}
    }
  }

  console.log('--- EXACT EXTRACTED LINES (Full) ---');
  decodedLines.forEach((l, i) => console.log(`${i}: "${l}"`));
}

test();
