import fs from 'fs';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

function parseToUnicodeCMap(cmapStr) {
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
}

function decodePDFString(raw, cmap) {
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
  line = line.replace(/\byt\b/g, '&').replace(/yf/g, ')');
  return line;
}

export async function extractLinesFromDoc(bytes) {
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
    if (content instanceof PDFRawStream) streams.push(content);
    else if (content && content.asArray) {
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
  return decodedLines;
}

const isItemCode = (str) => {
  if (!str || str.includes(' ') || str.length < 5) return false;
  // Exclude oilfield specifications and standards
  if (/^(?:NACE[-_]?)?MR[-_]?0?1[07][035]$/i.test(str)) return false;
  if (/^(?:NACE|ASTM|ASME|API|MSS|BS|DIN|EN|ISO|SCH|CLASS|STD|XS|XXS)/i.test(str)) return false;
  if (/^(?:B16\.\d+|B31\.\d+|A105N?|A350|A420|A234|A182|B564|A516)/i.test(str)) return false;
  if (/^(?:HEAT|LOCATION|LOC|ITEM|LINE|PCS|UNIT|PO|REF|AMOUNT|RATE|QTY)/i.test(str)) return false;

  return (
    /^(?:LOC[-_]?|L[-_]?)?(?:CR|RT|BL|WSO|WN|LWN|SW|TH|EL|LEL|CPL|CP|TEE|TE|RED|RD|CAP|CA|WBL|NIP|NI|FLG|FL|PIP|VAL|GSK|BOLT|TO|SO|WO|LTO|LSO|LWO)[0-9A-Z_\-\/&]{3,40}$/i.test(str) ||
    /^[A-Z]{2,6}[0-9]{2,8}[A-Z0-9_\-\/&]{2,30}$/i.test(str)
  );
};

const synthesizeItemCode = (desc, pos) => {
  const d = desc.toUpperCase();
  const sizeM = d.match(/(\d+(?:\.\d+)?(?:\/\d+)?(?:"|\s*INCH|\s*IN|\s*MM)?)/);
  const sizeStr = sizeM ? sizeM[1].replace(/["\s]/g, '').replace('INCH', '').replace('IN', '') : `${pos}`;

  let typeStr = 'ITEM';
  if (d.includes('SPECTACLE BLIND') || d.includes('SP. BLIND') || d.includes('SPBL')) {
    typeStr = 'SPBL';
  } else if (d.includes('BLIND')) {
    typeStr = 'BL';
  } else if (d.includes('THREADOLET') || d.includes('TOL')) {
    typeStr = 'LTO';
  } else if (d.includes('WELDOLET') || d.includes('WOL')) {
    typeStr = 'LWO';
  } else if (d.includes('SOCKOLET') || d.includes('SOL')) {
    typeStr = 'LSO';
  } else if (d.includes('ELBOW')) {
    typeStr = 'EL90';
  } else if (d.includes('FLANGE') || d.includes('WN')) {
    typeStr = 'LWN';
  } else if (d.includes('TEE')) {
    typeStr = 'TEE';
  } else if (d.includes('COUPLING')) {
    typeStr = 'CPL';
  }

  const ratingM = d.match(/(150|300|600|900|1500|2500|3000|6000|9000)\s*(?:#|LB|LBS|CLASS)?/);
  const ratingStr = ratingM ? ratingM[1] : '';

  const matM = d.match(/(A105N?|A350\s*(?:GR\.?)?\s*LF2|A420\s*(?:GR\.?)?\s*WPL6|A234\s*(?:GR\.?)?\s*WPB|A182\s*(?:GR\.?)?\s*F\d+|B564|A516\s*(?:GR\.?)?\s*70)/i);
  const matStr = matM ? matM[1].replace(/\s+/g, '') : '';

  return [typeStr, sizeStr, ratingStr, matStr].filter(Boolean).join('-');
};

export function parseSOItems(lines) {
  const items = [];
  let i = 0;
  
  // Find where table header ends
  while (i < lines.length) {
    if (/^(?:Amount|Item No|Qty|Rate)$/i.test(lines[i])) {
      i++;
      break;
    }
    i++;
  }

  while (i < lines.length) {
    const line = lines[i];

    // Check if end of table / totals
    if (/^(?:total|amount\s*in\s*words|sub\s*total|standard\s*rate|vat)/i.test(line)) {
      i++;
      continue;
    }

    // Skip repeat page header lines
    if (/^(?:#|Item\s*&?\s*Description|Client\s*PO|Item\s*No|Qty|Rate|Amount)$/i.test(line)) {
      i++;
      continue;
    }

    // Check if line is a page number right before a table header: e.g. "2" followed by "#" or "Item"
    if (/^\d{1,3}$/.test(line) && i + 1 < lines.length && /^(?:#|Item)/i.test(lines[i + 1])) {
      i += 2;
      continue;
    }

    let pos = null;
    let code = null;
    let initialDesc = null;

    const mCombined = line.match(/^(\d{1,3})\s+(.*)$/);
    if (mCombined) {
      pos = parseInt(mCombined[1], 10);
      const rest = mCombined[2].trim();
      const spaceIdx = rest.indexOf(' ');
      const candidateCode = spaceIdx > 0 ? rest.substring(0, spaceIdx) : rest;
      if (isItemCode(candidateCode)) {
        code = candidateCode;
        initialDesc = spaceIdx > 0 ? rest.substring(spaceIdx + 1).trim() : '';
      } else if (isItemCode(rest)) {
        code = rest;
        initialDesc = '';
      } else {
        code = null;
        initialDesc = rest;
      }
      i++;
    } else if (/^\d{1,3}$/.test(line)) {
      pos = parseInt(line, 10);
      i++;
      if (i < lines.length) {
        const nextLine = lines[i];
        if (isItemCode(nextLine)) {
          code = nextLine;
          i++;
        } else if (!/^\d+(?:\.\d+)?$/.test(nextLine) && !/^(?:#|Item|Qty|Rate|Amount)/i.test(nextLine)) {
          code = null;
          initialDesc = nextLine;
          i++;
        }
      }
    } else if (isItemCode(line)) {
      pos = items.length + 1;
      code = line;
      i++;
    } else {
      i++;
      continue;
    }

    // Collect subsequent lines belonging to this item
    const descLines = initialDesc ? [initialDesc] : [];
    const numTokens = [];
    let unit = 'Ea';

    while (i < lines.length) {
      const cur = lines[i];

      // Stop on totals or headers
      if (/^(?:total|amount\s*in\s*words)/i.test(cur)) break;
      if (/^(?:sub\s*total|standard\s*rate|vat)/i.test(cur)) break;
      if (/^(?:#|Item\s*&?\s*Description|Client\s*PO)/i.test(cur)) break;

      // Stop if next item start: e.g. standalone "2", "3" or "2 Code"
      if (/^\d{1,3}$/.test(cur)) {
        const nextPos = parseInt(cur, 10);
        // Is it the next item position?
        if (nextPos === pos + 1) {
          break;
        }
        // Is it a page number followed by "#"?
        if (i + 1 < lines.length && /^(?:#|Item)/i.test(lines[i + 1])) {
          break;
        }
      }

      const mNextComb = cur.match(/^(\d{1,3})\s+(.*)$/);
      if (mNextComb) {
        const nextPos = parseInt(mNextComb[1], 10);
        if (nextPos === pos + 1 || isItemCode(mNextComb[2].split(/\s+/)[0])) {
          break;
        }
      }

      if (isItemCode(cur)) {
        if (numTokens.length >= 3) {
          break;
        }
      }

      // Check if unit (e.g. pcs, ea, nos)
      if (/^(?:pcs|ea|nos|meters?)$/i.test(cur)) {
        unit = cur;
        i++;
        continue;
      }

      // Check if line contains numbers (Client PO, Qty, Rate, Amount)
      // Line might have multiple space-separated numbers: "10000 3.00 150.00 450.00" or single "10000"
      const tokens = cur.split(/\s+/);
      const isAllNumericTokens = tokens.length > 0 && tokens.every(t => /^[\d,]+(?:\.\d+)?$/.test(t) || /^(?:pcs|ea|nos)$/i.test(t));
      if (isAllNumericTokens) {
        for (const t of tokens) {
          if (/^(?:pcs|ea|nos)$/i.test(t)) {
            unit = t;
          } else {
            numTokens.push(t.replace(/,/g, ''));
          }
        }
        i++;
        continue;
      }

      // Otherwise it's description
      descLines.push(cur);
      i++;
    }

    // Now resolve numTokens into (clientPoItemNo, qty, rate, amount)
    // Common cases:
    // [ClientPO, Qty, Rate, Amount] -> length 4
    // [ClientPO, Qty, Rate] -> length 3
    // [Qty, Rate, Amount] -> length 3
    // [ClientPO, Qty] -> length 2
    // [Qty] -> length 1
    let clientPoItemNo = String(pos);
    let qty = 1;
    let rate = 0;

    // Strict mathematical validation: find (qty * rate = amount)
    let foundMathMatch = false;
    for (let k = 0; k <= numTokens.length - 3; k++) {
      const qCand = parseFloat(numTokens[k]);
      const rCand = parseFloat(numTokens[k + 1]);
      const aCand = parseFloat(numTokens[k + 2]);
      if (qCand > 0 && rCand > 0 && aCand > 0 && Math.abs(qCand * rCand - aCand) < 0.5) {
        qty = Math.round(qCand) || 1;
        rate = rCand;
        if (k > 0) {
          clientPoItemNo = numTokens[k - 1];
        }
        foundMathMatch = true;
        break;
      }
    }

    if (!foundMathMatch) {
      if (numTokens.length >= 4) {
        clientPoItemNo = numTokens[0];
        qty = Math.round(parseFloat(numTokens[1])) || 1;
        rate = parseFloat(numTokens[2]) || 0;
      } else if (numTokens.length === 3) {
        const n0 = parseFloat(numTokens[0]);
        const n1 = parseFloat(numTokens[1]);
        const n2 = parseFloat(numTokens[2]);
        if (Math.abs(n0 * n1 - n2) < 0.5) {
          qty = Math.round(n0) || 1;
          rate = n1;
        } else {
          clientPoItemNo = numTokens[0];
          qty = Math.round(n1) || 1;
          rate = n2;
        }
      } else if (numTokens.length === 2) {
        const n0 = parseFloat(numTokens[0]);
        const n1 = parseFloat(numTokens[1]);
        if (Number.isInteger(n0) && n0 <= 500 && n1 <= 1000) {
          clientPoItemNo = numTokens[0];
          qty = Math.round(n1) || 1;
        } else {
          qty = Math.round(n0) || 1;
          rate = n1;
        }
      } else if (numTokens.length === 1) {
        qty = Math.round(parseFloat(numTokens[0])) || 1;
      }
    }

    const fullDesc = descLines.join(' ').replace(/\s{2,}/g, ' ').trim();
    const finalCode = code || synthesizeItemCode(fullDesc, pos);

    items.push({
      position: pos,
      itemCode: finalCode,
      itemDescription: fullDesc,
      clientPoItemNo,
      qty,
      unit,
      rate,
      purchaseType: fullDesc.toUpperCase().includes('LOCAL') || finalCode.startsWith('L') ? 'local_purchase' : 'mill_stock'
    });
  }

  return items;
}

async function run() {
  console.log("=== TEST 1: REI OIL & GAS (media_1794391152612.pdf) ===");
  const lines1 = await extractLinesFromDoc(fs.readFileSync('C:/Users/Admin/.gemini/antigravity/brain/5071eec3-c7f2-4e0b-9bbe-868be8a229b9/.user_uploaded/media_1794391152612.pdf'));
  const items1 = parseSOItems(lines1);
  console.log(`Parsed ${items1.length} items:`);
  items1.forEach(it => console.log(it));

  console.log("\n=== TEST 2: ARABIAN INTERNATIONAL (media_1793556640574.pdf) ===");
  const lines2 = await extractLinesFromDoc(fs.readFileSync('C:/Users/Admin/.gemini/antigravity/brain/5071eec3-c7f2-4e0b-9bbe-868be8a229b9/.user_uploaded/media_1793556640574.pdf'));
  console.log("\n=== TEST 3: CREST SOLUTIONS (media_1794882678026.pdf) ===");
  const lines3 = await extractLinesFromDoc(fs.readFileSync('C:/Users/Admin/.gemini/antigravity/brain/5071eec3-c7f2-4e0b-9bbe-868be8a229b9/.user_uploaded/media_1794882678026.pdf'));
  console.log("Lines sample:", lines3.slice(0, 50));
  const items3 = parseSOItems(lines3);
  console.log(`Parsed ${items3.length} items:`);
  items3.forEach((it, idx) => console.log(`#${idx + 1}: Pos=${it.position} Code=${it.itemCode} Qty=${it.qty} Rate=${it.rate} ClientPO=${it.clientPoItemNo} Desc=${it.itemDescription}`));
}

run();
