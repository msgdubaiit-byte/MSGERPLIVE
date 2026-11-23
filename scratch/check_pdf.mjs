import fs from 'fs'
import { PDFDocument } from 'pdf-lib'

async function check() {
  const file = 'public/certificates/12-ELBOW 90 DEG 6 SCH.80, LR, BW, SMLS, ASTM  SA 234WPBSA420 WPL6 _68C01M040.pdf'
  const buf = fs.readFileSync(file)
  const doc = await PDFDocument.load(buf)
  const page = doc.getPages()[0]
  const size = page.getSize()
  console.log('Size:', size)
}

check()
