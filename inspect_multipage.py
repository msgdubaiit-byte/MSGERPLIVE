import pypdf

reader = pypdf.PdfReader(r"C:\Users\Admin\.gemini\antigravity\brain\5071eec3-c7f2-4e0b-9bbe-868be8a229b9\.user_uploaded\media_1793556640574.pdf")
print(f"Total pages: {len(reader.pages)}")
for i, page in enumerate(reader.pages):
    print(f"=== PAGE {i+1} ===")
    lines = page.extract_text().splitlines()
    for l in lines[:25]:
        print("  ", l)
