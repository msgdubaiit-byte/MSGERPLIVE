from PIL import Image, ImageDraw, ImageFont
import os

img = Image.open('public/seal_transparent.png').convert('RGBA')
w, h = img.size

# Make a white background copy to test readability
test_canvas = Image.new('RGBA', (w, h), (255, 255, 255, 255))
test_canvas.paste(img, (0, 0), img)

draw = ImageDraw.Draw(test_canvas)

# Let's test text positions on the 843 x 424 image:
# Row 2 (P O No. : ) is around y = 145
# Row 3 (ITEM No. : ) is around y = 225
# Row 4 (QTY: and Sign: ) is around y = 300

try:
    font = ImageFont.truetype("arialbd.ttf", 34)
    font_sign = ImageFont.truetype("ariali.ttf", 32)
except:
    font = ImageFont.load_default()
    font_sign = font

# Ink color: dark bold red (same as stamp) or navy blue
ink_color = (200, 10, 10, 255)

# P O No. after label (label ends around x = 280)
draw.text((290, 138), "BSTSPO260300029-Location-1", fill=ink_color, font=font)

# ITEM No. after label (label ends around x = 300)
draw.text((310, 218), "17", fill=ink_color, font=font)

# QTY after label (label ends around x = 200)
draw.text((210, 296), "8 Ea", fill=ink_color, font=font)

# Sign after label (Sign: label starts around x = 500, ends x = 600)
draw.text((615, 296), "MSG/QC-04", fill=(10, 40, 150, 255), font=font_sign)

test_canvas.save('test_stamped_seal.png')
print("Saved test_stamped_seal.png successfully!")
