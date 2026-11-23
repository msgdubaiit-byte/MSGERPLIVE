import fs from 'fs'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

async function testStamp() {
  const file = 'public/certificates/12-ELBOW 90 DEG 6 SCH.80, LR, BW, SMLS, ASTM  SA 234WPBSA420 WPL6 _68C01M040.pdf'
  const buf = fs.readFileSync(file)
  const doc = await PDFDocument.load(buf)
  const page = doc.getPages()[0]
  const { width, height } = page.getSize()

  console.log('Page Size:', width, height)

  const isLandscape = width > height
  const stampW = Math.min(210, width * 0.42)
  const stampH = stampW * (424 / 843)
  
  // Center-right positioning for Benkan
  const stampX = width - stampW - 45
  const stampY = isLandscape ? 295 : height * 0.48

  console.log('Calculated Stamp Position:', { stampX, stampY, stampW, stampH })
}

testStamp()
