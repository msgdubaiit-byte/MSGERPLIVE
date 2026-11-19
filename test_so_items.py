import re

def is_item_code(s):
    if not s or ' ' in s or len(s) < 5:
        return False
    return bool(
        re.match(r'^(?:LOC[-_]?|L[-_]?)?(?:CR|RT|BL|WSO|WN|LWN|SW|TH|EL|LEL|CPL|CP|TEE|TE|RED|RD|CAP|CA|WBL|NIP|NI|FLG|FL|PIP|VAL|GSK|BOLT|TO|SO|WO|LTO|LSO|LWO)[0-9A-Z_\-\/&]{3,40}$', s, re.I) or
        re.match(r'^[A-Z]{2,6}[0-9]{2,8}[A-Z0-9_\-\/]{2,30}$', s, re.I)
    )

def synthesize_item_code(desc, pos):
    d = desc.upper()
    size_m = re.search(r'(\d+(?:\.\d+)?(?:/\d+)?(?:"|\s*INCH|\s*IN|\s*MM)?)', d)
    size_str = size_m.group(1).replace('"', '').replace('INCH', '').replace('IN', '').strip() if size_m else f"{pos}"
    
    type_str = 'ITEM'
    if 'SPECTACLE BLIND' in d or 'SP. BLIND' in d:
        type_str = 'SPBL'
    elif 'BLIND' in d:
        type_str = 'BL'
    elif 'THREADOLET' in d or 'TOL' in d:
        type_str = 'LTO'
    elif 'WELDOLET' in d or 'WOL' in d:
        type_str = 'LWO'
    elif 'SOCKOLET' in d or 'SOL' in d:
        type_str = 'LSO'
    elif 'ELBOW' in d:
        type_str = 'EL90'
    elif 'FLANGE' in d or 'WN' in d:
        type_str = 'LWN'
    elif 'TEE' in d:
        type_str = 'TEE'
    elif 'COUPLING' in d:
        type_str = 'CPL'

    rating_m = re.search(r'(\d{3,4})#|\b(\d{3,4})\s*LB\b', d)
    rating_str = (rating_m.group(1) or rating_m.group(2)) if rating_m else ''

    mat_m = re.search(r'\b(A105N|A105|LF2|WPB|WPL6|SS316L|SS316|A350|A420|A516)\b', d)
    mat_str = mat_m.group(1) if mat_m else ''

    parts = [p for p in [type_str, size_str, rating_str, mat_str] if p]
    code = '-'.join(parts)
    return code or f"ITEM-{pos:02d}"

def parse_lines(raw_text):
    lines = [l.strip() for l in raw_text.split('\n') if l.strip()]
    items = []
    table_start = 0
    for idx, l in enumerate(lines):
        if re.search(r'#\s*item\s*&|item\s*no\s*qty', l, re.I):
            table_start = idx + 1

    i = table_start
    while i < len(lines):
        line = lines[i]
        if re.match(r'^(?:sub\s*total|total|standard\s*rate|vat|amount\s*in\s*words)', line, re.I):
            break

        m_row = re.match(r'^(\d{1,3})\s+(.*)$', line)
        pos = None
        first_token = None
        rest_text = None

        if m_row:
            pos = int(m_row.group(1))
            content = m_row.group(2).strip()
            tokens = content.split(None, 1)
            if len(tokens) > 1 and is_item_code(tokens[0]):
                first_token = tokens[0]
                rest_text = tokens[1]
            elif is_item_code(content):
                first_token = content
                rest_text = ''
            else:
                first_token = None
                rest_text = content
        elif is_item_code(line):
            pos = len(items) + 1
            first_token = line
            rest_text = ''
        elif re.match(r'^\d{1,3}$', line) and i + 1 < len(lines):
            pos = int(line)
            i += 1
            line = lines[i]
            if is_item_code(line):
                first_token = line
                rest_text = ''
            else:
                first_token = None
                rest_text = line
        else:
            i += 1
            continue

        code = first_token
        desc_lines = [rest_text] if rest_text else []
        qty = 1
        rate = 0
        client_po_item_no = str(pos)

        j = i + 1
        while j < len(lines):
            next_l = lines[j]
            if re.match(r'^(?:sub\s*total|total|standard\s*rate|vat|amount\s*in\s*words)', next_l, re.I):
                break
            m_next_row = re.match(r'^(\d{1,3})\s+(.*)$', next_l)
            if m_next_row:
                next_num = int(m_next_row.group(1))
                if next_num == pos + 1 or is_item_code(m_next_row.group(2).split()[0]) or not re.match(r'^[\d\s,.]+$', m_next_row.group(2)):
                    break
            if is_item_code(next_l):
                break

            m_full_num = re.match(r'^(\d{3,6})\s+(\d+(?:\.\d{1,2})?)\s+([\d,]+(?:\.\d{2})?)\s+([\d,]+(?:\.\d{2})?)$', next_l)
            if m_full_num:
                client_po_item_no = m_full_num.group(1)
                qty = round(float(m_full_num.group(2)))
                rate = float(m_full_num.group(3).replace(',', ''))
                j += 1
                continue

            m_po_qty = re.match(r'^(\d{1,6})\s+(\d+(?:\.\d{1,2})?)$', next_l)
            if m_po_qty:
                client_po_item_no = m_po_qty.group(1)
                qty = round(float(m_po_qty.group(2)))
                j += 1
                continue

            m_rate_amt = re.match(r'^([\d,]+(?:\.\d{2})?)\s+([\d,]+(?:\.\d{2})?)$', next_l)
            if m_rate_amt:
                rate = float(m_rate_amt.group(1).replace(',', ''))
                j += 1
                continue

            m_q = re.match(r'^(\d+(?:\.\d{1,2})?)\s*(?:pcs|ea|nos)?$', next_l, re.I)
            if m_q and qty == 1 and not ',' in next_l:
                qty = round(float(m_q.group(1)))
                j += 1
                continue

            is_noise = bool(re.match(r'^(?:pcs|ea|nos|set|rate|qty|amount)', next_l, re.I))
            is_pure_num = bool(re.match(r'^[\d\s,.\u0600-\u06FFAEDUS$€£\-\/]+$', next_l))

            if not is_noise and not is_pure_num and len(next_l) > 2:
                desc_lines.append(next_l)

            j += 1

        i = j
        item_desc = ' '.join(desc_lines).strip()
        if not code:
            code = synthesize_item_code(item_desc, pos)

        is_local = (
            code.upper().startswith('L') or
            'LOCALLY MADE' in item_desc.upper() or
            'LOCAL' in item_desc.upper()
        )

        items.append({
            'position': pos,
            'itemCode': code,
            'itemDescription': item_desc,
            'requiredQty': qty,
            'rate': rate,
            'clientPoItemNo': client_po_item_no,
            'purchaseType': 'local_purchase' if is_local else 'regular'
        })
    return items

# Test 1: REI Oil & Gas PDF
print("--- TEST 1: REI OIL & GAS ---")
items1 = parse_lines("""
# Item & Description Client PO 
Item No Qty Rate Amount
1 3/4", SPECTACLE BLIND, 300LB, RF, ASTM A350 Gr.LF2 CL.1, 
ASME B16.48
(LOCALLY MADE FROM A516 GR. 70 PLATE) 
10000 3.00 150.00 450.00
2 LTO156KA350LF2 
THREADOLET 1/2" X 3", 6000#, A350 GR. LF2 CL1, MSS SP-97 
20000 2.00
pcs
945.00 1,890.00
3 LTO156KA350LF2 
THREADOLET 1/2" X 2", 6000#, A350 GR. LF2 CL1, MSS SP-97 
30000 1.00
pcs
945.00 945.00
""")
for it in items1:
    print(it)

# Test 2: Dubai Petroleum Establishment PDF
print("\n--- TEST 2: DUBAI PETROLEUM ---")
items2 = parse_lines("""
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
""")
for it in items2:
    print(it)
