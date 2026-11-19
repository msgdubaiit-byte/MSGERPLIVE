import os
import pypdf

folder = r"C:\Users\Admin\.gemini\antigravity\brain\5071eec3-c7f2-4e0b-9bbe-868be8a229b9\.user_uploaded"
files = sorted(os.listdir(folder))
print("Files in .user_uploaded:")
for f in files:
    full = os.path.join(folder, f)
    size = os.path.getsize(full)
    print(f"  {f} ({size} bytes)")
    if f.endswith('.pdf'):
        try:
            reader = pypdf.PdfReader(full)
            print(f"    PDF Pages: {len(reader.pages)}")
            for idx, p in enumerate(reader.pages):
                txt = p.extract_text() or ""
                first_lines = "\n".join(txt.splitlines()[:15])
                print(f"    --- Page {idx+1} snippet ---")
                print(first_lines)
        except Exception as e:
            print("    PDF Read Error:", e)
