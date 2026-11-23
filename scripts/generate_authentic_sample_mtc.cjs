const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function generateAuthenticSampleMTC() {
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  for (let i = 1; i <= 2; i++) {
    const page = pdfDoc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();

    // Top Header Banner
    page.drawRectangle({
      x: 30,
      y: height - 115,
      width: width - 60,
      height: 85,
      borderColor: rgb(0.1, 0.2, 0.4),
      borderWidth: 2,
    });

    page.drawText('WMASS FLANGES & FORGINGS GMBH', {
      x: 45,
      y: height - 55,
      size: 15,
      font: fontBold,
      color: rgb(0.06, 0.16, 0.35),
    });

    page.drawText('INSPECTION CERTIFICATE EN 10204 3.1 / ISO 10474', {
      x: 45,
      y: height - 76,
      size: 10,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText(`Certificate Ref: WM-EN10204-3.1-68C01M040  |  Sheet ${i} of 2`, {
      x: 45,
      y: height - 96,
      size: 9,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.35),
    });

    // Material Specifications Box
    page.drawRectangle({
      x: 30,
      y: height - 250,
      width: width - 60,
      height: 120,
      borderColor: rgb(0.65, 0.65, 0.65),
      borderWidth: 1,
    });

    page.drawText('MATERIAL & TRACEABILITY SPECIFICATIONS', {
      x: 42,
      y: height - 145,
      size: 10,
      font: fontBold,
      color: rgb(0.06, 0.16, 0.35),
    });

    const specs = [
      'Standard Specification : ASME B16.9 / ASTM A234 WPB / WPL6 DUAL CERTIFIED',
      'Product Description    : 90 DEG LR ELBOW SCH 80 ASTM A234 WPB SEAMLESS',
      'Heat / Melt Number     : 68C01M040',
      'Year of Mfg (YOM)      : 2025',
      'Heat Treatment         : NORMALIZED @ 910 deg C & FORCED AIR COOLED',
      'Service Compliance     : NACE MR0175 / ISO 15156 SOUR SERVICE COMPLIANT',
    ];

    specs.forEach((line, idx) => {
      page.drawText(line, {
        x: 42,
        y: height - 165 - idx * 13,
        size: 8.5,
        font: fontMono,
        color: rgb(0.12, 0.12, 0.12),
      });
    });

    // Chemical Composition Box
    page.drawRectangle({
      x: 30,
      y: height - 425,
      width: width - 60,
      height: 160,
      borderColor: rgb(0.65, 0.65, 0.65),
      borderWidth: 1,
    });

    page.drawText('CHEMICAL ANALYSIS (wt %) - LADLE ANALYSIS', {
      x: 42,
      y: height - 275,
      size: 9.5,
      font: fontBold,
      color: rgb(0.06, 0.16, 0.35),
    });

    page.drawText('Element:    C%      Mn%     P%      S%      Si%     Cr%     Ni%     Mo%     CE(IIW)', {
      x: 42,
      y: height - 295,
      size: 8,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText('Actual:     0.18    1.12    0.014   0.003   0.24    0.08    0.05    0.02    0.38', {
      x: 42,
      y: height - 310,
      size: 8,
      font: fontMono,
      color: rgb(0.1, 0.1, 0.1),
    });

    page.drawText('Max Spec:   0.30    1.35    0.035   0.035   0.35    0.40    0.40    0.15    0.42', {
      x: 42,
      y: height - 325,
      size: 8,
      font: fontMono,
      color: rgb(0.4, 0.4, 0.4),
    });

    page.drawText('MECHANICAL PROPERTIES & HARDNESS TESTING', {
      x: 42,
      y: height - 355,
      size: 9.5,
      font: fontBold,
      color: rgb(0.06, 0.16, 0.35),
    });

    page.drawText('Tensile: 535 MPa (Min: 415 MPa)  |  Yield: 340 MPa (Min: 240 MPa)  |  Elongation: 32%', {
      x: 42,
      y: height - 375,
      size: 8,
      font: fontRegular,
      color: rgb(0.1, 0.1, 0.1),
    });

    page.drawText('Impact Charpy V-Notch @ -46 deg C: 48J, 52J, 50J (Avg: 50J)  |  Hardness: 162 HBW (Max: 197 HBW)', {
      x: 42,
      y: height - 392,
      size: 8,
      font: fontRegular,
      color: rgb(0.1, 0.1, 0.1),
    });

    page.drawText('NON-DESTRUCTIVE EXAMINATION & COMPLIANCE', {
      x: 42,
      y: height - 445,
      size: 9.5,
      font: fontBold,
      color: rgb(0.06, 0.16, 0.35),
    });

    page.drawRectangle({
      x: 30,
      y: height - 570,
      width: width - 60,
      height: 110,
      borderColor: rgb(0.65, 0.65, 0.65),
      borderWidth: 1,
    });

    const nde = [
      'Visual & Dimensional Examination : ACCORDING TO ASME B16.9 - ACCEPTABLE',
      'Positive Material ID (PMI)       : 100% SPECTRO VERIFIED GRADE WPB / WPL6',
      'Magnetic Particle / Ultrasonic   : ASTM A388 / EN 10228-3 - DEFECT FREE',
      'Hydrostatic Proof Test           : 350 BAR FOR 15 SECONDS - PASSED',
      'Radioactive Contamination        : FREE FROM CONTAMINATION (< 0.1 Bq/g)',
    ];

    nde.forEach((line, idx) => {
      page.drawText(line, {
        x: 42,
        y: height - 468 - idx * 13,
        size: 8,
        font: fontMono,
        color: rgb(0.12, 0.12, 0.12),
      });
    });

    // Mill Stamp and Sign Off Box
    page.drawRectangle({
      x: 360,
      y: height - 690,
      width: 205,
      height: 80,
      borderColor: rgb(0.1, 0.3, 0.6),
      borderWidth: 1.5,
      color: rgb(0.97, 0.98, 1.0),
    });

    page.drawText('MANUFACTURER INSPECTION SIGN-OFF', {
      x: 370,
      y: height - 630,
      size: 8,
      font: fontBold,
      color: rgb(0.1, 0.2, 0.5),
    });

    page.drawText('WMASS QA/QC DEPARTMENT', {
      x: 370,
      y: height - 648,
      size: 7.5,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText('We certify that the material supplied complies with the order requirements and EN 10204 3.1 standards.', {
      x: 42,
      y: height - 640,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText('Authorized Quality Representative', {
      x: 370,
      y: height - 665,
      size: 7,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText('Stamp & Signature: [VERIFIED QA-9182]', {
      x: 370,
      y: height - 680,
      size: 7,
      font: fontBold,
      color: rgb(0.1, 0.4, 0.1),
    });
  }

  const pdfBytes = await pdfDoc.save();
  const targetPath = path.resolve('public', 'sample-mtc.pdf');
  fs.writeFileSync(targetPath, pdfBytes);
  console.log(`Successfully generated authentic 2-page EN 10204 3.1 MTC at ${targetPath} (${pdfBytes.length} bytes)!`);
}

generateAuthenticSampleMTC().catch(err => {
  console.error('Error generating MTC:', err);
  process.exit(1);
});
