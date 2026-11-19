import re

lines = [
    'ELBOW 1", 90DEG, SCH.XXS, LR, BW, SMLS, A234 WPB',
    '1 1.00',
    'pcs',
    '135.00 135.00',
    'FLANGE 4", 1500#, SCH.XXS, WN RTJ, A105N , ASME B16.5',
    '2 19.00',
    'pcs',
    '435.00 8,265.00'
]

def is_price_line(s):
    # Matches lines that only contain numbers, decimals, commas, spaces, currency symbols
    return bool(re.match(r'^[\d\s,.\u0600-\u06FFAEDUS$€£\-\/]+$', s.strip()))

for l in lines:
    print(f"'{l}': is_price -> {is_price_line(l)}")
