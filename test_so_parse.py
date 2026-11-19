import re

raw_ocr = """
1
Sub Total 8,400.00
Standard Rate (5%) 420.00
Total 8,820.00
Order Date : 22 Oct 2026
Expected Shipment 
Date : 05 Nov 2026
Ref# : 50309677
Delivery Method : Ex-works
MSG OILFIELD EQUIPMENT TRADING LLC
Dubai Industrial City(DIC) Phase-1
 Dubai 
United Arab Emirates
VAT No:100518964000003
SALES ORDER
Sales Order# MSG-1026-2208
Bill To
Dubai Petroleum Establishment
P.O. Box 2222, Dubai, United Arab Emirates
 Dubai
United Arab Emirates
TRN 100356248300003
# Item & Description Client PO 
Item No Qty Rate Amount
1 LEL9025SXXSWPB 
ELBOW 1", 90DEG, SCH.XXS, LR, BW, SMLS, A234 WPB 
1 1.00
pcs
135.00 135.00
2 LWN1001500SXXSRJ 
FLANGE 4", 1500#, SCH.XXS, WN RTJ, A105N , ASME B16.5 
2 19.00
pcs
435.00 8,265.00
"""

lines = [l.strip() for l in raw_ocr.split('\n') if l.strip()]

def is_item_code(s):
    if not s or ' ' in s or len(s) < 5:
        return False
    return bool(
        re.match(r'^(?:LOC[-_]?|L[-_]?)?(?:CR|RT|BL|WSO|WN|SW|TH|EL|CPL|CP|TEE|TE|RED|RD|CAP|CA|WBL|NIP|NI|FLG|FL|PIP|VAL|GSK|BOLT)[0-9A-Z_\-\/&]{3,40}$', s, re.I) or
        re.match(r'^[A-Z]{2,6}[0-9]{2,8}[A-Z0-9_\-\/]{2,30}$', s, re.I)
    )

items = []
seen_positions = set()
seen_keys = set()

for i, line in enumerate(lines):
    pos = None
    code = None
    initial_desc = None

    if is_item_code(line):
        code = line
        if i > 0 and re.match(r'^\d{1,3}$', lines[i - 1]):
            pos = int(lines[i - 1])
    else:
        # Check if line starts with position number and item code
        m_num = re.match(r'^(\d{1,3})\s+([A-Z0-9_\-\/&]{5,40})(?:\s+(.*))?$', line, re.I)
        if m_num and is_item_code(m_num.group(2)):
            pos = int(m_num.group(1))
            code = m_num.group(2).strip()
            if m_num.group(3):
                initial_desc = m_num.group(3).strip()

    if not code:
        continue

    desc_lines = [initial_desc] if initial_desc else []
    qty = 1
    rate = 0
    client_po_item_no = str(pos) if pos else ''

    for j in range(i + 1, min(i + 14, len(lines))):
        next_line = lines[j]

        # Stop if next item encountered
        if is_item_code(next_line):
            break
        m_next = re.match(r'^(\d{1,3})\s+([A-Z0-9_\-\/&]{5,40})', next_line, re.I)
        if m_next and is_item_code(m_next.group(2)):
            break

        # Check for qty line like "1 1.00" or "2 19.00"
        qm = re.match(r'^(\d{1,3})\s+(\d{1,4}(?:\.\d{1,2})?)$', next_line)
        if qm:
            if not client_po_item_no:
                client_po_item_no = qm.group(1)
            qty = round(float(qm.group(2)))
            continue

        # Check for single qty line e.g. "1.00 pcs" or "19.00"
        qm_single = re.match(r'^(\d{1,4}(?:\.\d{1,2})?)\s*(?:pcs|ea|nos)?$', next_line, re.I)
        if qm_single and qty == 1:
            qty = round(float(qm_single.group(1)))
            continue

        # Check for rate/amount line e.g. "135.00 135.00" or "435.00 8,265.00"
        m_rate = re.match(r'^([\d,]+(?:\.\d{2})?)\s+([\d,]+(?:\.\d{2})?)$', next_line)
        if m_rate:
            rate = float(m_rate.group(1).replace(',', ''))
            continue

        is_noise = bool(re.match(r'^(?:sub\s*total|total|standard\s*rate|amount|rate|pcs|ea|item\s*&|client\s*po|#\s*item)', next_line, re.I))
        is_price_or_rate = bool(re.match(r'^[\d\s,.\u0600-\u06FFAEDUS$€£\-\/]+$', next_line.strip()))

        if not is_noise and not is_price_or_rate and len(next_line) > 2:
            desc_lines.append(next_line)

    if not pos:
        pos = len(items) + 1
    if not client_po_item_no:
        client_po_item_no = str(pos)

    item_desc = ' '.join(desc_lines).strip() or f'{code} Oilfield Fitting / Flange'
    items.append({
        'position': pos,
        'itemCode': code,
        'itemDescription': item_desc,
        'requiredQty': qty,
        'rate': rate,
        'clientPoItemNo': client_po_item_no,
    })

print(f"Extracted {len(items)} items:")
for it in items:
    print(it)
