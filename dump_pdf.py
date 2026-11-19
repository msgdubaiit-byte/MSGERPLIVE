import pypdf

reader = pypdf.PdfReader(r"C:\Users\Admin\.gemini\antigravity\brain\5071eec3-c7f2-4e0b-9bbe-868be8a229b9\.user_uploaded\media_1794391152612.pdf")
print("PAGE 1 FULL TEXT:")
txt = reader.pages[0].extract_text()
print(txt)
print("\n" + "="*50 + "\n")
print("PAGE 1 LINES:")
for i, line in enumerate(txt.splitlines()):
    print(f"{i}: {line}")
