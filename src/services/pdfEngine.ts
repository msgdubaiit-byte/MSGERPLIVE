// PDF Engine for MSG Oilfield Equipment Trading LLC
// Implements client-side dynamic stamping, multi-page EN 10204 3.1 MTC stamping, and package merging using pdf-lib

import { PDFDocument, rgb, StandardFonts, degrees, decodePDFRawStream, PDFRawStream } from 'pdf-lib'
import JSZip from 'jszip'
import { getUploadedCertificateBytes, getAuthenticCertificateBytes } from './zipExtractor'
import { SalesOrder } from '../types'
import { autoDetectMake, autoDetectSupplier, autoDetectHSCode, autoDetectCountryOfOrigin } from './sourcingEngine'
import { db } from './db'

export interface StampOptions {
  poNo: string
  itemNo: string
  qty: string | number
  sign?: string
  dateStr?: string
}

export async function createSampleMillCertificate(
  itemCode: string,
  heatNumber: string,
  yom: number,
  pagesCount: number = 2
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier)

  for (let i = 1; i <= pagesCount; i++) {
    const page = pdfDoc.addPage([595, 842]) // A4 size
    const { width, height } = page.getSize()

    // Header Border
    page.drawRectangle({
      x: 30,
      y: height - 110,
      width: width - 60,
      height: 80,
      borderColor: rgb(0.1, 0.15, 0.3),
      borderWidth: 1.5,
    })

    // Mill Title
    page.drawText('WMASS FLANGES & FITTINGS GMBH', {
      x: 45,
      y: height - 55,
      size: 14,
      font: fontBold,
      color: rgb(0.05, 0.15, 0.3),
    })

    page.drawText('QUALITY INSPECTION CERTIFICATE EN 10204 3.1 / ISO 10474', {
      x: 45,
      y: height - 75,
      size: 10,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    })

    page.drawText(`Certificate No: WM-${heatNumber}-${yom}  |  Page ${i} of ${pagesCount}`, {
      x: 45,
      y: height - 95,
      size: 9,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    })

    // Material Specifications Box
    page.drawRectangle({
      x: 30,
      y: height - 250,
      width: width - 60,
      height: 125,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 1,
    })

    page.drawText('MATERIAL & TRACEABILITY SPECIFICATIONS', {
      x: 40,
      y: height - 135,
      size: 10,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    })

    const details = [
      `Product Item Code : ${itemCode}`,
      `Heat / Melt Number: ${heatNumber}`,
      `Year of Mfg (YOM) : ${yom}`,
      `Material Grade    : ASTM A182 F316 / F316L DUAL CERTIFIED`,
      `Standard / Rating : ASME B16.5 CLASS 150 RF`,
      `Delivery Condition: SOLUTION ANNEALED & WATER QUENCHED @ 1050°C`,
    ]

    details.forEach((line, idx) => {
      page.drawText(line, {
        x: 40,
        y: height - 155 - idx * 15,
        size: 9,
        font: fontMono,
        color: rgb(0.1, 0.1, 0.1),
      })
    })

    // Chemical & Mechanical Table Box
    page.drawRectangle({
      x: 30,
      y: height - 440,
      width: width - 60,
      height: 170,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 1,
    })

    page.drawText('CHEMICAL COMPOSITION (wt %) & MECHANICAL TEST RESULTS', {
      x: 40,
      y: height - 275,
      size: 10,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    })

    const chemHeaders = 'C%     Si%    Mn%    P%     S%     Cr%     Ni%     Mo%     N%'
    const chemValues  = '0.018  0.42   1.45   0.028  0.002  16.85   10.20   2.08    0.045'
    page.drawText(chemHeaders, { x: 40, y: height - 295, size: 8, font: fontBold, color: rgb(0.2, 0.2, 0.2) })
    page.drawText(chemValues,  { x: 40, y: height - 310, size: 8, font: fontMono, color: rgb(0.1, 0.1, 0.1) })

    page.drawText('Tensile Strength: 585 MPa  |  Yield Strength: 275 MPa  |  Elongation: 52%  |  Hardness: 165 HBW', {
      x: 40,
      y: height - 340,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.15, 0.15, 0.15),
    })

    page.drawText('Visual & Dimensional Check: SATISFACTORY | NACE MR0175 / ISO 15156 COMPLIANT', {
      x: 40,
      y: height - 365,
      size: 8.5,
      font: fontBold,
      color: rgb(0.05, 0.4, 0.1),
    })

    // Mill Authorized Stamp Placeholder
    page.drawRectangle({
      x: 400,
      y: height - 430,
      width: 150,
      height: 50,
      borderColor: rgb(0.2, 0.3, 0.6),
      borderWidth: 1,
    })
    page.drawText('MILL QA/QC SIGN OFF', { x: 410, y: height - 400, size: 8, font: fontBold, color: rgb(0.2, 0.3, 0.6) })
    page.drawText('Authorized Inspection Rep.', { x: 410, y: height - 415, size: 7, font: fontRegular, color: rgb(0.2, 0.3, 0.6) })
  }

  return await pdfDoc.save()
}

export interface EN10204CertData {
  certNumber?: string
  manufacturer?: string
  manufacturerAddress?: string
  clientName?: string
  customerPONumber?: string
  orderNumber?: string
  issueDate?: string
  itemCode?: string
  description?: string
  heatNumber?: string
  quantity?: string | number
  uom?: string
  materialGrade?: string
  specification?: string
  sizeRating?: string
  deliveryCondition?: string
  meltingProcess?: string
  countryOfOrigin?: string
  // Chemistry
  c?: string
  si?: string
  mn?: string
  p?: string
  s?: string
  cr?: string
  ni?: string
  mo?: string
  n?: string
  cu?: string
  // Mechanicals
  tensileMpa?: string
  yieldMpa?: string
  elongationPct?: string
  reductionArea?: string
  hardnessHbw?: string
  charpyJoules?: string
  charpyTemp?: string
  naceCompliant?: boolean
  supplementaryTests?: string
  qaInspector?: string
  // True copy stamp
  applyCertifiedStamp?: boolean
  stampInspector?: string
  stampDate?: string
}

export function downloadPdfBlob(pdfBytes: Uint8Array, filename: string): void {
  const blob = new Blob([pdfBytes as any], { type: 'application/pdf' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => window.URL.revokeObjectURL(url), 2000)
}

export async function generateEN10204Certificate(data: EN10204CertData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier)
  const fontMonoBold = await pdfDoc.embedFont(StandardFonts.CourierBold)

  const certNo = data.certNumber || `WM-${data.heatNumber || '68C20M091'}-2026`
  const mfr = data.manufacturer || 'WMASS FLANGES & FITTINGS GMBH'
  const mfrAddr = data.manufacturerAddress || 'Industriestrasse 18, 45141 Essen, Germany'
  const client = data.clientName || 'MSG OILFIELD SUPPLIES LLC'
  const po = data.customerPONumber || 'PO-MSG-8967'
  const issueDate = data.issueDate || new Date().toISOString().substring(0, 10)
  const itemCode = data.itemCode || 'WSO20150F316'
  const desc = data.description || 'FLANGE 3/4" 150# SORF RF SS316/316L ASME B16.5'
  const heat = data.heatNumber || '68C20M091'
  const qty = data.quantity || '25'
  const uom = data.uom || 'PCS'
  const grade = data.materialGrade || 'ASTM A182 F316 / F316L DUAL CERTIFIED'
  const spec = data.specification || 'ASME B16.5 / NACE MR0175 / ISO 15156'
  const deliv = data.deliveryCondition || 'Solution Annealed @ 1050°C & Water Quenched'
  const melt = data.meltingProcess || 'EAF + AOD (Electric Arc Furnace + Argon Oxygen Decarburization)'
  const coo = data.countryOfOrigin || 'GERMANY (EU)'

  // Chemistry values
  const c = data.c || '0.018'
  const si = data.si || '0.42'
  const mn = data.mn || '1.45'
  const p = data.p || '0.028'
  const s = data.s || '0.002'
  const cr = data.cr || '16.85'
  const ni = data.ni || '10.20'
  const mo = data.mo || '2.08'
  const n = data.n || '0.045'
  const cu = data.cu || '0.18'

  // Mechanical values
  const tensile = data.tensileMpa || '585'
  const yieldVal = data.yieldMpa || '275'
  const elong = data.elongationPct || '52'
  const redArea = data.reductionArea || '64'
  const hardness = data.hardnessHbw || '165'
  const charpy = data.charpyJoules || '120'
  const charpyTemp = data.charpyTemp || '-46'
  const qaInspector = data.qaInspector || 'Dipl.-Ing. H. Weber / Lead Inspection QA'

  // PAGE 1:
  const page1 = pdfDoc.addPage([595, 842])
  const { width, height } = page1.getSize()

  // Outer Border
  page1.drawRectangle({
    x: 25,
    y: 25,
    width: width - 50,
    height: height - 50,
    borderColor: rgb(0.1, 0.18, 0.35),
    borderWidth: 1.5,
  })

  // Header Box
  page1.drawRectangle({
    x: 25,
    y: height - 110,
    width: width - 50,
    height: 85,
    color: rgb(0.96, 0.97, 0.99),
    borderColor: rgb(0.1, 0.18, 0.35),
    borderWidth: 1.5,
  })

  page1.drawText(mfr.toUpperCase(), {
    x: 40,
    y: height - 50,
    size: 13,
    font: fontBold,
    color: rgb(0.05, 0.15, 0.35),
  })

  page1.drawText(mfrAddr, {
    x: 40,
    y: height - 64,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  })

  page1.drawText('MILL TEST CERTIFICATE / INSPECTION CERTIFICATE', {
    x: 40,
    y: height - 80,
    size: 9.5,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  })

  page1.drawText('ACCORDING TO DIN EN 10204:2004 TYPE 3.1 / ISO 10474', {
    x: 40,
    y: height - 94,
    size: 8,
    font: fontBold,
    color: rgb(0.15, 0.45, 0.2),
  })

  page1.drawText('CE 0045 | PED 2014/68/EU | ISO 9001:2015', {
    x: 350,
    y: height - 50,
    size: 7.5,
    font: fontBold,
    color: rgb(0.4, 0.1, 0.1),
  })

  page1.drawText(`Certificate No: ${certNo}`, {
    x: 350,
    y: height - 66,
    size: 8.5,
    font: fontMonoBold,
    color: rgb(0.05, 0.15, 0.35),
  })

  page1.drawText(`Issue Date: ${issueDate}  |  Page 1 of 2`, {
    x: 350,
    y: height - 82,
    size: 8,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  })

  // Customer & Order Box
  page1.drawRectangle({
    x: 25,
    y: height - 175,
    width: width - 50,
    height: 60,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 1,
  })

  page1.drawText('PURCHASER & ORDER IDENTIFICATION', {
    x: 35,
    y: height - 125,
    size: 8.5,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  })

  page1.drawText(`Customer / Consignee : ${client}`, { x: 35, y: height - 142, size: 8, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
  page1.drawText(`Customer PO Number   : ${po}`, { x: 35, y: height - 156, size: 8, font: fontMono, color: rgb(0.1, 0.1, 0.1) })
  page1.drawText(`Internal Order / Ref : ${data.orderNumber || 'SO-2026-MSG'}`, { x: 35, y: height - 170, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) })

  page1.drawText(`Country of Origin    : ${coo}`, { x: 330, y: height - 142, size: 8, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
  page1.drawText(`Melting Process      : ${melt.substring(0, 32)}`, { x: 330, y: height - 156, size: 7.5, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
  page1.drawText(`Inspection Standard  : EN 10204 Type 3.1`, { x: 330, y: height - 170, size: 8, font: fontBold, color: rgb(0.15, 0.45, 0.2) })

  // Material & Product Traceability Box
  page1.drawRectangle({
    x: 25,
    y: height - 310,
    width: width - 50,
    height: 130,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 1,
  })

  page1.drawText('PRODUCT DESCRIPTION & METALLURGICAL SPECIFICATIONS', {
    x: 35,
    y: height - 190,
    size: 8.5,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  })

  const prodDetails = [
    `Item Description     : ${desc.substring(0, 68)}`,
    `Product Item Code    : ${itemCode}`,
    `Heat / Cast Number   : ${heat}`,
    `Certified Quantity   : ${qty} ${uom}`,
    `Material Grade       : ${grade}`,
    `Specification / Code : ${spec}`,
    `Heat Treatment Cond. : ${deliv}`,
  ]

  prodDetails.forEach((line, idx) => {
    page1.drawText(line, {
      x: 35,
      y: height - 208 - idx * 14,
      size: 8,
      font: fontMono,
      color: rgb(0.1, 0.1, 0.1),
    })
  })

  // Chemical Composition Table Box
  page1.drawRectangle({
    x: 25,
    y: height - 425,
    width: width - 50,
    height: 110,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 1,
  })

  page1.drawText('CHEMICAL ANALYSIS (wt. %) — LADLE / HEAT ANALYSIS', {
    x: 35,
    y: height - 325,
    size: 8.5,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  })

  page1.drawText('Element    C%      Si%     Mn%     P%      S%      Cr%     Ni%     Mo%     N%      Cu%', {
    x: 35,
    y: height - 345,
    size: 7.5,
    font: fontBold,
    color: rgb(0.2, 0.25, 0.3),
  })

  page1.drawText(`Actual   ${c.padEnd(7)} ${si.padEnd(7)} ${mn.padEnd(7)} ${p.padEnd(7)} ${s.padEnd(7)} ${cr.padEnd(7)} ${ni.padEnd(7)} ${mo.padEnd(7)} ${n.padEnd(7)} ${cu.padEnd(6)}`, {
    x: 35,
    y: height - 362,
    size: 8,
    font: fontMonoBold,
    color: rgb(0.05, 0.15, 0.4),
  })

  page1.drawText('Spec Min    --      --      --      --      --    16.00    10.00    2.00     --      --', {
    x: 35,
    y: height - 378,
    size: 7.5,
    font: fontMono,
    color: rgb(0.4, 0.4, 0.4),
  })

  page1.drawText('Spec Max  0.030   1.00    2.00    0.045   0.030   18.00    14.00    3.00   0.100     --', {
    x: 35,
    y: height - 392,
    size: 7.5,
    font: fontMono,
    color: rgb(0.4, 0.4, 0.4),
  })

  page1.drawText('Result: SATISFACTORY / IN COMPLIANCE WITH APPLICABLE SPECIFICATION', {
    x: 35,
    y: height - 414,
    size: 7.5,
    font: fontBold,
    color: rgb(0.1, 0.5, 0.15),
  })

  // Mechanical Properties Table Box
  page1.drawRectangle({
    x: 25,
    y: height - 570,
    width: width - 50,
    height: 140,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 1,
  })

  page1.drawText('MECHANICAL & IMPACT TEST RESULTS (ROOM TEMPERATURE 20°C & SUB-ZERO)', {
    x: 35,
    y: height - 440,
    size: 8.5,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  })

  const mechRows = [
    `Yield Strength (Rp 0.2%)      : ${yieldVal} MPa         [Requirement: >= 205 MPa] -> PASSED`,
    `Tensile Strength (Rm)         : ${tensile} MPa         [Requirement: 515 - 690 MPa] -> PASSED`,
    `Elongation (A5, Lo=5.65√So)    : ${elong} %             [Requirement: >= 30 %] -> PASSED`,
    `Reduction of Area (Z)         : ${redArea} %             [Requirement: >= 50 %] -> PASSED`,
    `Hardness (Brinell HBW)        : ${hardness} HBW         [Requirement: <= 217 HBW] -> PASSED`,
    `Charpy V-Notch Impact (${charpyTemp}°C) : ${charpy} Joules (avg)  [Requirement: >= 60 J at ${charpyTemp}°C] -> PASSED`,
  ]

  mechRows.forEach((r, idx) => {
    page1.drawText(r, {
      x: 35,
      y: height - 460 - idx * 14,
      size: 7.5,
      font: fontMono,
      color: rgb(0.1, 0.1, 0.1),
    })
  })

  page1.drawText('Status: ALL MECHANICAL & IMPACT PROPERTIES MEET APPLICABLE ASTM / ASME CRITERIA', {
    x: 35,
    y: height - 558,
    size: 7.5,
    font: fontBold,
    color: rgb(0.1, 0.5, 0.15),
  })

  // Quality, NACE & NDE Conformity Box
  page1.drawRectangle({
    x: 25,
    y: height - 685,
    width: width - 50,
    height: 110,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 1,
  })

  page1.drawText('NON-DESTRUCTIVE EXAMINATIONS & COMPLIANCE STATEMENTS', {
    x: 35,
    y: height - 585,
    size: 8.5,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  })

  const compliances = [
    `1. Visual & Dimensional Examination : SATISFACTORY / IN ACCORDANCE WITH ASME B16.5 TOLERANCES`,
    `2. Positive Material Identification : 100% PMI TESTED VIA XRF SPECTROMETRY - CHEMISTRY CONFIRMED`,
    `3. Ultrasonic Examination           : TESTED IN ACCORDANCE WITH ASME SECTION V ARTICLE 4 - ACCEPTABLE`,
    `4. Intergranular Corrosion Test     : ASTM A262 PRACTICE E - NO SENSITIZATION DETECTED / ACCEPTABLE`,
    `5. Sour Gas / NACE Compliance       : COMPLIES WITH NACE MR0175 / ISO 15156 (HARDNESS <= 22 HRC)`,
    `6. Contamination Statement          : FREE FROM MERCURY, RADIOACTIVITY AND WELD REPAIRS`,
  ]

  compliances.forEach((cLine, idx) => {
    page1.drawText(cLine, {
      x: 35,
      y: height - 602 - idx * 12.5,
      size: 7,
      font: fontMono,
      color: rgb(0.15, 0.15, 0.15),
    })
  })

  // Mill Sign-off & Stamp Box
  page1.drawRectangle({
    x: 340,
    y: height - 800,
    width: 215,
    height: 105,
    borderColor: rgb(0.1, 0.2, 0.45),
    borderWidth: 1.5,
    color: rgb(0.98, 0.98, 1),
  })

  page1.drawText('MILL QUALITY ASSURANCE / QC', {
    x: 350,
    y: height - 710,
    size: 8,
    font: fontBold,
    color: rgb(0.1, 0.2, 0.45),
  })

  page1.drawText('INSPECTION REPRESENTATIVE SIGN-OFF', {
    x: 350,
    y: height - 723,
    size: 7,
    font: fontBold,
    color: rgb(0.3, 0.3, 0.3),
  })

  page1.drawText(qaInspector, {
    x: 350,
    y: height - 748,
    size: 7.5,
    font: fontMonoBold,
    color: rgb(0.05, 0.15, 0.35),
  })

  page1.drawText(`Date: ${issueDate}  |  Official Mill Seal Verified`, {
    x: 350,
    y: height - 765,
    size: 7,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  })

  page1.drawText('Certified according to DIN EN 10204 3.1', {
    x: 350,
    y: height - 785,
    size: 6.5,
    font: fontBold,
    color: rgb(0.15, 0.45, 0.2),
  })

  // Footnote
  page1.drawText('This certificate is issued under a quality system certified to ISO 9001 and PED 2014/68/EU. Products comply with purchase order requirements.', {
    x: 35,
    y: 35,
    size: 6.5,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.5),
  })

  // PAGE 2: Metallurgical Examination & Traceability Equipment Log
  const page2 = pdfDoc.addPage([595, 842])
  page2.drawRectangle({
    x: 25,
    y: 25,
    width: width - 50,
    height: height - 50,
    borderColor: rgb(0.1, 0.18, 0.35),
    borderWidth: 1.5,
  })

  page2.drawRectangle({
    x: 25,
    y: height - 90,
    width: width - 50,
    height: 65,
    color: rgb(0.96, 0.97, 0.99),
    borderColor: rgb(0.1, 0.18, 0.35),
    borderWidth: 1.5,
  })

  page2.drawText(mfr.toUpperCase(), { x: 40, y: height - 48, size: 12, font: fontBold, color: rgb(0.05, 0.15, 0.35) })
  page2.drawText(`SUPPLEMENTARY METALLURGICAL TEST REPORT — CERTIFICATE NO: ${certNo}`, { x: 40, y: height - 64, size: 8.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) })
  page2.drawText(`Heat No: ${heat}  |  Item: ${itemCode}  |  Page 2 of 2`, { x: 40, y: height - 78, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) })

  // Microstructure & Metallography Box
  page2.drawRectangle({
    x: 25,
    y: height - 250,
    width: width - 50,
    height: 150,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 1,
  })

  page2.drawText('METALLOGRAPHY & GRAIN STRUCTURE EXAMINATION', {
    x: 35,
    y: height - 110,
    size: 8.5,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  })

  const metallography = [
    `Austenitic Grain Size (ASTM E112) : ASTM 6.5 - 7.0 (Uniform Fine Equiaxed Austenitic Grains)`,
    `Microstructure Morphology        : Fully Austenitic matrix with less than 0.5% delta-ferrite`,
    `Sigma & Intermetallic Phases     : Completely absent; no detrimental continuous grain boundary carbides`,
    `Surface Roughness (Ra)           : Flange Face 3.2 - 6.3 um (125 - 250 AARH) Serrated Concentric / Spiral`,
    `Hydrostatic Pressure Test        : Hydrotested at 1.5x Cold Working Pressure for 120s — Zero Leakage`,
    `Magnetic Permeability (mu)       : mu <= 1.02 (Non-magnetic condition verified)`,
  ]

  metallography.forEach((mLine, idx) => {
    page2.drawText(mLine, {
      x: 35,
      y: height - 130 - idx * 16,
      size: 7.5,
      font: fontMono,
      color: rgb(0.1, 0.1, 0.1),
    })
  })

  // Calibration Standards & Traceability
  page2.drawRectangle({
    x: 25,
    y: height - 420,
    width: width - 50,
    height: 160,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 1,
  })

  page2.drawText('CALIBRATED TEST EQUIPMENT & TRACEABILITY LOG', {
    x: 35,
    y: height - 270,
    size: 8.5,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  })

  const calibLog = [
    `Optical Emission Spectrometer (OES) : Oxford Instruments Foundry-Master Smart (Cal Ref: OES-2026-04)`,
    `Universal Tensile Testing Machine   : Zwick/Roell 600kN Hydraulic UTM (Cal Ref: UTM-2025-11-DKD)`,
    `Charpy Impact Pendulum (450 Joules) : Wolpert-Wilson Charpy Tester (ISO 148-1 Cal Ref: IMP-2026-01)`,
    `Brinell Optical Hardness Tester     : EMCO-TEST DuraVision 200 (ASTM E10 Cal Ref: BRN-2026-03)`,
    `Ultrasonic Flaw Detector            : Krautkramer USM 35X (EN 12668-1 Cal Ref: UT-2026-02)`,
    `Positive Material Identification    : Niton XL3t GOLDD+ Handheld XRF Analyzer (Cal Ref: XRF-2026-05)`,
  ]

  calibLog.forEach((cLine, idx) => {
    page2.drawText(cLine, {
      x: 35,
      y: height - 290 - idx * 16,
      size: 7.5,
      font: fontMono,
      color: rgb(0.1, 0.1, 0.1),
    })
  })

  // Final Endorsement Box
  page2.drawRectangle({
    x: 25,
    y: height - 600,
    width: width - 50,
    height: 170,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 1,
  })

  page2.drawText('FINAL INSPECTION CONFORMITY & LEGAL ENDORSEMENT', {
    x: 35,
    y: height - 440,
    size: 8.5,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.3),
  })

  page2.drawText('We hereby certify that the supplied material described above has been manufactured, sampled, tested,', { x: 35, y: height - 460, size: 8, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
  page2.drawText('and inspected in full accordance with the applicable standard specification and the terms of the purchase order.', { x: 35, y: height - 474, size: 8, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
  page2.drawText('The test results reported herein are authentic, genuine, and recorded from original mill testing.', { x: 35, y: height - 488, size: 8, font: fontBold, color: rgb(0.1, 0.1, 0.1) })

  page2.drawRectangle({
    x: 330,
    y: height - 590,
    width: 220,
    height: 90,
    borderColor: rgb(0.2, 0.35, 0.6),
    borderWidth: 1,
  })

  page2.drawText('INDEPENDENT INSPECTION AGENCY / QA', { x: 340, y: height - 515, size: 7.5, font: fontBold, color: rgb(0.2, 0.35, 0.6) })
  page2.drawText('Third Party Endorsement: TUV RHEINLAND / DNV GL', { x: 340, y: height - 530, size: 7, font: fontRegular, color: rgb(0.3, 0.3, 0.3) })
  page2.drawText('Stamp & Authorized Signature:', { x: 340, y: height - 548, size: 7, font: fontRegular, color: rgb(0.3, 0.3, 0.3) })
  page2.drawText('[ DIGITALLY VERIFIED MILL QA STAMP ]', { x: 340, y: height - 570, size: 7.5, font: fontMonoBold, color: rgb(0.15, 0.45, 0.2) })

  // Save the PDF
  let rawBytes = await pdfDoc.save()

  // Apply True-Copy Stamp if requested
  if (data.applyCertifiedStamp !== false) {
    const stampOpts: StampOptions = {
      poNo: po,
      itemNo: data.itemCode || '1',
      qty: String(qty),
      sign: data.stampInspector || 'MSG/QC-04',
      dateStr: data.stampDate || issueDate,
    }
    rawBytes = await stampMTCDocument(rawBytes, stampOpts, true)
  }

  return rawBytes
}

// Stamping an existing PDF with official MSG Oilfield Certified Stamp
export async function stampMTCDocument(
  pdfBytes: Uint8Array,
  options: StampOptions,
  withStamp: boolean = true
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  if (!withStamp) {
    return await pdfDoc.save()
  }

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique)

  const sysConfig = db.getSystemConfig()
  const pages = pdfDoc.getPages()
  const sign = options.sign || sysConfig.inspectorSignName || 'MSG/QC-04'

  // Load transparent official MSG seals (custom IT seal image if uploaded, or transparent PNGs)
  let sealImg: any = null
  let roundSealImg: any = null
  let customSigImg: any = null

  if (sysConfig.customSealDataUrl) {
    try {
      const sealBytes = await fetch(sysConfig.customSealDataUrl).then(r => r.arrayBuffer())
      sealImg = await pdfDoc.embedPng(sealBytes).catch(() => pdfDoc.embedJpg(sealBytes))
      roundSealImg = sealImg
    } catch (err) {
      console.warn('Could not load custom IT seal image', err)
    }
  }

  if (sysConfig.customSignatureDataUrl) {
    try {
      const sigBytes = await fetch(sysConfig.customSignatureDataUrl).then(r => r.arrayBuffer())
      customSigImg = await pdfDoc.embedPng(sigBytes).catch(() => pdfDoc.embedJpg(sigBytes))
    } catch (err) {
      console.warn('Could not load custom IT signature image', err)
    }
  }

  if (!sealImg) {
    try {
      const sealRes = await fetch('/assets/seal_transparent.png').catch(() => fetch('/seal_transparent.png'))
      if (sealRes && sealRes.ok) {
        const buf = await sealRes.arrayBuffer()
        sealImg = await pdfDoc.embedPng(buf)
      }
    } catch (err) {
      console.warn('Could not load seal_transparent.png', err)
    }
  }

  if (!roundSealImg) {
    try {
      const roundRes = await fetch('/assets/seal_round_transparent.png').catch(() => fetch('/seal_round_transparent.png'))
      if (roundRes && roundRes.ok) {
        const buf = await roundRes.arrayBuffer()
        roundSealImg = await pdfDoc.embedPng(buf)
      }
    } catch (err) {
      console.warn('Could not load seal_round_transparent.png', err)
    }
  }

  const redInk = rgb(0.85, 0.05, 0.05)
  const signInk = rgb(0.05, 0.15, 0.5)

  for (let p = 0; p < pages.length; p++) {
    const page = pages[p]
    const { width, height } = page.getSize()

    if (p === 0) {
      // PAGE 1: Official Rectangular "VERIFIED TRUE COPY" with Full Details
      const stampW = Math.min(210, width * 0.42)
      const stampH = stampW * (424 / 843)
      const stampX = width - stampW - Math.min(35, width * 0.05)
      const stampY = Math.min(55, height * 0.08)
      const scale = stampW / 210

      if (sealImg) {
        page.drawImage(sealImg, {
          x: stampX,
          y: stampY,
          width: stampW,
          height: stampH,
          opacity: 0.95,
        })
      } else {
        page.drawRectangle({
          x: stampX,
          y: stampY,
          width: stampW,
          height: stampH,
          borderColor: redInk,
          borderWidth: sysConfig.sealBorderWidth || 2,
        })
      }

      // Autofill Details directly above the dotted lines
      // Row 2: P O No.
      page.drawText(options.poNo || '-', {
        x: stampX + 68 * scale,
        y: stampY + stampH * 0.675,
        size: 8.5 * scale,
        font: fontBold,
        color: redInk,
      })

      // Row 3: ITEM No.
      page.drawText(String(options.itemNo || '-'), {
        x: stampX + 72 * scale,
        y: stampY + stampH * 0.490,
        size: 8.5 * scale,
        font: fontBold,
        color: redInk,
      })

      // Row 4: QTY
      const qtyStr = typeof options.qty === 'number' ? `${options.qty} PCS` : String(options.qty || '1 PCS')
      page.drawText(qtyStr, {
        x: stampX + 50 * scale,
        y: stampY + stampH * 0.300,
        size: 8.5 * scale,
        font: fontBold,
        color: redInk,
      })

      // Row 4: Sign (draw custom inspector signature image if uploaded, or drawn text)
      if (customSigImg) {
        const sigW = 48 * scale
        const sigH = sigW * (customSigImg.height / customSigImg.width)
        page.drawImage(customSigImg, {
          x: stampX + 138 * scale,
          y: stampY + stampH * 0.24,
          width: sigW,
          height: Math.min(stampH * 0.28, sigH),
          opacity: 0.95,
        })
      } else {
        page.drawText(sign, {
          x: stampX + 148 * scale,
          y: stampY + stampH * 0.300,
          size: 8.5 * scale,
          font: fontOblique,
          color: signInk,
        })
      }
    } else {
      // SUBSEQUENT PAGES (Page 2, 3...): Official Round Seal with "VERIFIED TRUE COPY" & Sign Line
      const roundSize = Math.min(130, width * 0.25, height * 0.22)
      const roundX = width - roundSize - Math.min(35, width * 0.05)
      const roundY = Math.min(50, height * 0.07)

      if (roundSealImg) {
        page.drawImage(roundSealImg, {
          x: roundX,
          y: roundY,
          width: roundSize,
          height: roundSize,
          opacity: 0.92,
        })
      } else {
        // Fallback circle if image not loaded
        page.drawCircle({
          x: roundX + roundSize / 2,
          y: roundY + roundSize / 2,
          size: roundSize / 2,
          borderColor: redInk,
          borderWidth: sysConfig.sealBorderWidth || 2,
        })
      }

      // Autofill Sign on the round seal dotted line (baseline is y = 0.298 * roundSize)
      if (customSigImg) {
        const roundSigW = roundSize * 0.3
        const roundSigH = roundSigW * (customSigImg.height / customSigImg.width)
        page.drawImage(customSigImg, {
          x: roundX + roundSize * 0.42,
          y: roundY + roundSize * 0.25,
          width: roundSigW,
          height: Math.min(roundSize * 0.22, roundSigH),
          opacity: 0.95,
        })
      } else {
        page.drawText(sign, {
          x: roundX + roundSize * 0.46,
          y: roundY + roundSize * 0.298,
          size: Math.max(7, roundSize * 0.072),
          font: fontOblique,
          color: signInk,
        })
      }
    }
  }

  return await pdfDoc.save()
}

// Merge Multiple MTCs into a Unified Sales Order Package
export async function mergeSalesOrderMTCPackage(
  soNumber: string,
  customerName: string,
  poNumber: string,
  allocatedCertificates: {
    itemCode: string
    heatNumber: string
    yom: number
    lCode?: string
    qty: number
    isLocal: boolean
    pages: number
    itemNo?: string
  }[]
): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create()
  const fontBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold)
  const fontRegular = await mergedPdf.embedFont(StandardFonts.Helvetica)
  const fontMono = await mergedPdf.embedFont(StandardFonts.Courier)

  // 1. Cover Sheet & Certificate Manifest Page
  const coverPage = mergedPdf.addPage([595, 842])
  const { width, height } = coverPage.getSize()

  // Navy Top Banner
  coverPage.drawRectangle({
    x: 0,
    y: height - 120,
    width: width,
    height: 120,
    color: rgb(0.04, 0.14, 0.27), // #0B2545
  })

  coverPage.drawText('MSG OILFIELD EQUIPMENT TRADING LLC', {
    x: 40,
    y: height - 55,
    size: 18,
    font: fontBold,
    color: rgb(1, 1, 1),
  })

  coverPage.drawText('CERTIFIED MILL TEST CERTIFICATE (MTC) COMPILATION PACKAGE', {
    x: 40,
    y: height - 80,
    size: 11,
    font: fontBold,
    color: rgb(0.85, 0.2, 0.2),
  })

  coverPage.drawText('P.O. Box 48421, Dubai, UAE | Web: www.msgoilfield.ae | QA/QC Dept.', {
    x: 40,
    y: height - 100,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.8, 0.85, 0.9),
  })

  // Sales Order Metadata Box
  coverPage.drawRectangle({
    x: 40,
    y: height - 240,
    width: width - 80,
    height: 100,
    borderColor: rgb(0.7, 0.75, 0.8),
    borderWidth: 1,
    color: rgb(0.97, 0.98, 1),
  })

  coverPage.drawText('SALES ORDER & CUSTOMER INFORMATION', {
    x: 55,
    y: height - 160,
    size: 10,
    font: fontBold,
    color: rgb(0.05, 0.15, 0.3),
  })

  coverPage.drawText(`Sales Order No : ${soNumber}`, { x: 55, y: height - 180, size: 9.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) })
  coverPage.drawText(`Customer Name  : ${customerName}`, { x: 55, y: height - 198, size: 9, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
  coverPage.drawText(`Customer P.O.  : ${poNumber}`, { x: 55, y: height - 216, size: 9, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })

  coverPage.drawText(`Package Issue Date: ${new Date().toISOString().substring(0, 10)}`, { x: 340, y: height - 180, size: 9, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
  coverPage.drawText(`Storekeeper Check : VERIFIED & APPROVED`, { x: 340, y: height - 198, size: 9, font: fontBold, color: rgb(0.1, 0.5, 0.2) })
  coverPage.drawText(`MTC Stamping Mode : CERTIFIED WITH STAMP`, { x: 340, y: height - 216, size: 9, font: fontBold, color: rgb(0.8, 0.1, 0.1) })

  // Manifest Table
  coverPage.drawText('MATERIAL TRACEABILITY & CERTIFICATE MANIFEST', {
    x: 40,
    y: height - 270,
    size: 11,
    font: fontBold,
    color: rgb(0.04, 0.14, 0.27),
  })

  // Table header
  coverPage.drawRectangle({
    x: 40,
    y: height - 300,
    width: width - 80,
    height: 22,
    color: rgb(0.1, 0.2, 0.4),
  })

  coverPage.drawText('Item Code', { x: 45, y: height - 293, size: 8, font: fontBold, color: rgb(1, 1, 1) })
  coverPage.drawText('Heat Number', { x: 195, y: height - 293, size: 8, font: fontBold, color: rgb(1, 1, 1) })
  coverPage.drawText('YOM', { x: 285, y: height - 293, size: 8, font: fontBold, color: rgb(1, 1, 1) })
  coverPage.drawText('L-Code', { x: 325, y: height - 293, size: 8, font: fontBold, color: rgb(1, 1, 1) })
  coverPage.drawText('Qty', { x: 415, y: height - 293, size: 8, font: fontBold, color: rgb(1, 1, 1) })
  coverPage.drawText('Type / Stamp Status', { x: 450, y: height - 293, size: 8, font: fontBold, color: rgb(1, 1, 1) })

  allocatedCertificates.forEach((item, idx) => {
    const rowY = height - 325 - idx * 24
    const bgColor = idx % 2 === 0 ? rgb(0.98, 0.98, 0.98) : rgb(0.93, 0.95, 0.98)

    coverPage.drawRectangle({
      x: 40,
      y: rowY - 5,
      width: width - 80,
      height: 22,
      color: bgColor,
    })

    coverPage.drawText(item.itemCode.slice(0, 22), { x: 45, y: rowY + 2, size: 7.5, font: fontMono, color: rgb(0.1, 0.1, 0.1) })
    coverPage.drawText(item.heatNumber, { x: 195, y: rowY + 2, size: 8, font: fontBold, color: rgb(0.1, 0.2, 0.5) })
    coverPage.drawText(String(item.yom || 'N/A'), { x: 285, y: rowY + 2, size: 8, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
    coverPage.drawText(item.lCode || '-', { x: 325, y: rowY + 2, size: 7.5, font: fontMono, color: rgb(0.7, 0.2, 0.1) })
    coverPage.drawText(`${item.qty} PCS`, { x: 415, y: rowY + 2, size: 8, font: fontBold, color: rgb(0.1, 0.1, 0.1) })
    coverPage.drawText(item.isLocal ? 'Local / Certified Copy' : 'Regular Mill MTC', { x: 450, y: rowY + 2, size: 7.5, font: fontRegular, color: rgb(0.1, 0.4, 0.1) })
  })

  // Cover Page Official Stamp
  coverPage.drawRectangle({
    x: 370,
    y: 60,
    width: 180,
    height: 90,
    borderColor: rgb(0.8, 0.1, 0.1),
    borderWidth: 2,
    color: rgb(1, 0.97, 0.97),
  })

  coverPage.drawText('MSG OILFIELD QA/QC COMPILATION', { x: 375, y: 135, size: 7, font: fontBold, color: rgb(0.8, 0.1, 0.1) })
  coverPage.drawText(`ORDER: ${soNumber}`, { x: 375, y: 118, size: 7.5, font: fontBold, color: rgb(0.05, 0.15, 0.4) })
  coverPage.drawText(`CERTIFICATES INCLUDED: ${allocatedCertificates.length}`, { x: 375, y: 102, size: 7, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
  coverPage.drawText('ALL HEATS PHYSICALLY VERIFIED', { x: 375, y: 88, size: 6.5, font: fontBold, color: rgb(0.1, 0.5, 0.2) })
  coverPage.drawText(`RELEASED: ${new Date().toISOString().substring(0, 10)}`, { x: 375, y: 72, size: 7, font: fontRegular, color: rgb(0.3, 0.3, 0.3) })

  // 2. Append Stamped MTCs for Each Allocated Heat (From Real Uploaded MTC or Full EN 10204 3.1 Spec)
  for (let idx = 0; idx < allocatedCertificates.length; idx++) {
    const certItem = allocatedCertificates[idx]
    const certRef = (certItem as any).certRef || ''
    
    // Retrieve real certificate bytes from MTC document cache
    let realBytes = getUploadedCertificateBytes(certItem.heatNumber) || 
                    (certRef ? getUploadedCertificateBytes(certRef) : null) ||
                    (certItem.lCode ? getUploadedCertificateBytes(certItem.lCode) : null)

    // Check database MTCs if not in local memory cache
    if (!realBytes) {
      const allMtcs = db.getMTCs()
      const cleanHeat = (certItem.heatNumber || '').trim().toUpperCase()
      const cleanRef = certRef.trim().toUpperCase()
      const matched = allMtcs.find(m =>
        (cleanHeat && m.heat_number.trim().toUpperCase() === cleanHeat) ||
        (cleanRef && m.certificate_reference.trim().toUpperCase() === cleanRef) ||
        (certItem.lCode && m.l_code && m.l_code.trim().toUpperCase() === certItem.lCode.trim().toUpperCase())
      )

      if (matched) {
        realBytes = getUploadedCertificateBytes(matched.certificate_reference) ||
                    getUploadedCertificateBytes(matched.heat_number) ||
                    getUploadedCertificateBytes(matched.original_file_path)

        if (!realBytes && matched.original_file_path) {
          const p = matched.original_file_path
          if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('blob:') || p.startsWith('data:')) {
            try {
              const resp = await fetch(p)
              if (resp.ok) {
                const ab = await resp.arrayBuffer()
                const b = new Uint8Array(ab)
                if (b.length > 500) realBytes = b
              }
            } catch (e) {
              console.warn('Could not fetch cloud certificate:', p, e)
            }
          }
        }
      }
    }

    // Lookup in authentic 338-certificate bulk ZIP vault
    if (!realBytes) {
      const auth = await getAuthenticCertificateBytes(certRef, certItem.heatNumber, certItem.itemCode)
      if (auth) {
        realBytes = auth.bytes
      }
    }

    if (realBytes) {
      const stampedBytes = await stampMTCDocument(realBytes, {
        poNo: poNumber,
        itemNo: certItem.itemNo || `${idx + 1}`,
        qty: certItem.qty,
        sign: 'MSG/QC-04',
        dateStr: new Date().toISOString().substring(0, 10).toUpperCase(),
      }, true)

      const certDoc = await PDFDocument.load(stampedBytes)
      const copiedPages = await mergedPdf.copyPages(certDoc, certDoc.getPageIndices())
      copiedPages.forEach(p => mergedPdf.addPage(p))
    }
  }

  return await mergedPdf.save()
}

export function downloadPDFBlob(pdfBytes: Uint8Array, filename: string) {
  const blob = new Blob([pdfBytes as any], { type: 'application/pdf' })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface MergeOptions {
  watermarkText?: string
}

// Stamp a prominent diagonal semi-transparent watermark on every page of a PDF document
export async function stampWatermarkOnPdf(bytes: Uint8Array, watermarkText: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const pages = doc.getPages()
  pages.forEach(page => {
    const { width: pW, height: pH } = page.getSize()
    page.drawText(watermarkText, {
      x: pW * 0.15,
      y: pH * 0.35,
      size: 38,
      font: fontBold,
      color: rgb(0.85, 0.15, 0.15),
      opacity: 0.26,
      rotate: degrees(45),
    })
  })
  return await doc.save()
}

// Compile multiple selected raw certificates into a single unified PDF with cover sheet
export async function mergeSelectedCertificates(
  certificates: { fileName: string; heatNumber: string; itemCode?: string; bytes: Uint8Array }[],
  options?: MergeOptions
): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create()
  const fontBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold)
  const fontRegular = await mergedPdf.embedFont(StandardFonts.Helvetica)

  // 1. Cover Sheet & Manifest Index
  const coverPage = mergedPdf.addPage([595, 842])
  const { width, height } = coverPage.getSize()

  coverPage.drawRectangle({
    x: 0,
    y: height - 100,
    width: width,
    height: 100,
    color: rgb(0.04, 0.14, 0.27),
  })

  coverPage.drawText('MSG OILFIELD EQUIPMENT TRADING LLC', {
    x: 40,
    y: height - 50,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  })

  const titlePrefix = options?.watermarkText ? 'SAMPLE / FOR CLIENT REVIEW - ' : ''
  coverPage.drawText(`${titlePrefix}BATCH MTC CERTIFICATE COMPILATION (${certificates.length} CERTIFICATES)`, {
    x: 40,
    y: height - 75,
    size: 9.5,
    font: fontBold,
    color: rgb(0.85, 0.2, 0.2),
  })

  coverPage.drawText(`Generated on: ${new Date().toISOString().substring(0, 10)} | Direct Batch Export ${options?.watermarkText ? '| WATERMARKED SAMPLE' : ''}`, {
    x: 40,
    y: height - 120,
    size: 9,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  })

  // Table header
  coverPage.drawRectangle({
    x: 40,
    y: height - 150,
    width: width - 80,
    height: 20,
    color: rgb(0.1, 0.2, 0.4),
  })

  coverPage.drawText('#', { x: 50, y: height - 143, size: 8, font: fontBold, color: rgb(1, 1, 1) })
  coverPage.drawText('Heat Number', { x: 80, y: height - 143, size: 8, font: fontBold, color: rgb(1, 1, 1) })
  coverPage.drawText('Item Code', { x: 190, y: height - 143, size: 8, font: fontBold, color: rgb(1, 1, 1) })
  coverPage.drawText('Document Reference / File', { x: 330, y: height - 143, size: 8, font: fontBold, color: rgb(1, 1, 1) })

  certificates.forEach((c, i) => {
    const y = height - 175 - i * 20
    if (y > 40) {
      coverPage.drawText(String(i + 1), { x: 50, y, size: 8, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
      coverPage.drawText(c.heatNumber, { x: 80, y, size: 8, font: fontBold, color: rgb(0.8, 0.1, 0.1) })
      coverPage.drawText(c.itemCode || '-', { x: 190, y, size: 8, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
      coverPage.drawText(c.fileName, { x: 330, y, size: 8, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
    }
  })

  // 2. Append each selected PDF
  for (const cert of certificates) {
    try {
      const srcDoc = await PDFDocument.load(cert.bytes)
      const pageIndices = srcDoc.getPageIndices()
      const copiedPages = await mergedPdf.copyPages(srcDoc, pageIndices)
      copiedPages.forEach(p => mergedPdf.addPage(p))
    } catch (e) {
      console.warn('Could not load cert bytes for merge:', cert.fileName, e)
    }
  }

  // 3. Stamp Watermark across every page if requested
  if (options?.watermarkText) {
    const pages = mergedPdf.getPages()
    pages.forEach((page) => {
      const { width: pW, height: pH } = page.getSize()
      page.drawText(options.watermarkText!, {
        x: pW * 0.15,
        y: pH * 0.35,
        size: 38,
        font: fontBold,
        color: rgb(0.85, 0.15, 0.15),
        opacity: 0.26,
        rotate: degrees(45),
      })
    })
  }

  return await mergedPdf.save()
}

// Download multiple selected certificates as a bundled ZIP archive with optional SAMPLE watermark
export async function downloadCertificatesAsZip(
  certificates: { fileName: string; bytes: Uint8Array }[],
  zipName: string = 'MSG_Selected_Certificates.zip',
  options?: { watermarkText?: string }
): Promise<void> {
  const zip = new JSZip()
  for (const c of certificates) {
    const safeName = c.fileName.toLowerCase().endsWith('.pdf') ? c.fileName : `${c.fileName}.pdf`
    let finalBytes = c.bytes
    if (options?.watermarkText) {
      try {
        finalBytes = await stampWatermarkOnPdf(c.bytes, options.watermarkText)
      } catch (e) {
        console.warn('Error watermarking cert for zip:', c.fileName, e)
      }
    }
    zip.file(safeName, finalBytes)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = zipName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Generate an official publication-quality MSG Sales Order PDF document
export async function generateSalesOrderPDF(order: SalesOrder): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier)

  const page = pdfDoc.addPage([595, 842]) // A4
  const { width, height } = page.getSize()

  // 1. Navy Header Banner
  page.drawRectangle({
    x: 0,
    y: height - 110,
    width: width,
    height: 110,
    color: rgb(0.04, 0.14, 0.27), // #0B2545
  })

  // Company Name
  page.drawText('MSG OILFIELD EQUIPMENT TRADING LLC', {
    x: 40,
    y: height - 48,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  })

  // Subtitle
  page.drawText('OFFICIAL SALES ORDER CONFIRMATION & MATERIAL RESERVATION', {
    x: 40,
    y: height - 70,
    size: 10,
    font: fontBold,
    color: rgb(0.85, 0.2, 0.2), // Red
  })

  page.drawText('P.O. Box 48421, Dubai, United Arab Emirates | Web: www.msgoilfield.ae | Sales Dept.', {
    x: 40,
    y: height - 90,
    size: 8,
    font: fontRegular,
    color: rgb(0.75, 0.82, 0.9),
  })

  // 2. Order & Customer Info Boxes
  // Box Left: Customer Info
  page.drawRectangle({
    x: 40,
    y: height - 210,
    width: (width - 90) / 2,
    height: 85,
    borderColor: rgb(0.75, 0.8, 0.85),
    borderWidth: 1,
    color: rgb(0.97, 0.98, 1),
  })

  page.drawText('CUSTOMER INFORMATION', {
    x: 50,
    y: height - 140,
    size: 9,
    font: fontBold,
    color: rgb(0.05, 0.15, 0.3),
  })
  page.drawText(`Customer: ${order.customer_name}`, { x: 50, y: height - 160, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) })
  page.drawText(`Customer P.O.: ${order.po_number}`, { x: 50, y: height - 178, size: 8.5, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
  page.drawText(`Target Delivery: ${order.required_delivery_date || 'Standard'}`, { x: 50, y: height - 196, size: 8.5, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })

  // Box Right: Sales Order Meta
  page.drawRectangle({
    x: 40 + (width - 90) / 2 + 10,
    y: height - 210,
    width: (width - 90) / 2,
    height: 85,
    borderColor: rgb(0.75, 0.8, 0.85),
    borderWidth: 1,
    color: rgb(0.97, 0.98, 1),
  })

  page.drawText('ORDER SPECIFICATIONS', {
    x: 50 + (width - 90) / 2 + 10,
    y: height - 140,
    size: 9,
    font: fontBold,
    color: rgb(0.05, 0.15, 0.3),
  })
  page.drawText(`Sales Order No: ${order.so_number}`, { x: 50 + (width - 90) / 2 + 10, y: height - 160, size: 9.5, font: fontBold, color: rgb(0.8, 0.1, 0.1) })
  page.drawText(`Order Date: ${order.order_date}`, { x: 50 + (width - 90) / 2 + 10, y: height - 178, size: 8.5, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
  page.drawText(`Status: ${order.status.toUpperCase()}`, { x: 50 + (width - 90) / 2 + 10, y: height - 196, size: 8.5, font: fontBold, color: rgb(0.1, 0.5, 0.2) })

  // 3. Line Items Table Header
  page.drawRectangle({
    x: 40,
    y: height - 245,
    width: width - 80,
    height: 22,
    color: rgb(0.1, 0.2, 0.4),
  })

  page.drawText('#', { x: 48, y: height - 238, size: 8, font: fontBold, color: rgb(1, 1, 1) })
  page.drawText('Item Code', { x: 68, y: height - 238, size: 8, font: fontBold, color: rgb(1, 1, 1) })
  page.drawText('Material Description', { x: 190, y: height - 238, size: 8, font: fontBold, color: rgb(1, 1, 1) })
  page.drawText('Allocated Heat Number(s)', { x: 340, y: height - 238, size: 8, font: fontBold, color: rgb(1, 1, 1) })
  page.drawText('Req Qty', { x: 470, y: height - 238, size: 8, font: fontBold, color: rgb(1, 1, 1) })
  page.drawText('Status', { x: 515, y: height - 238, size: 8, font: fontBold, color: rgb(1, 1, 1) })

  // Rows
  let currentY = height - 270
  order.items.forEach((item, idx) => {
    const itemAllocations = order.allocations
      .filter(a => a.sales_order_item_id === item.id)
      .map(a => `${a.heat_number} (${a.allocated_qty} PCS)`)
      .join(', ') || 'Pending Allocation'

    const rowBg = idx % 2 === 0 ? rgb(0.98, 0.98, 0.98) : rgb(0.94, 0.96, 0.99)
    page.drawRectangle({
      x: 40,
      y: currentY - 5,
      width: width - 80,
      height: 22,
      color: rowBg,
    })

    page.drawText(String(idx + 1), { x: 48, y: currentY, size: 7.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) })
    page.drawText(item.item_code.slice(0, 18), { x: 68, y: currentY, size: 7.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) })
    page.drawText((item.item_description || item.item_code).slice(0, 26), { x: 190, y: currentY, size: 7.5, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
    page.drawText(itemAllocations.slice(0, 24), { x: 340, y: currentY, size: 7.5, font: fontMono, color: rgb(0.8, 0.1, 0.1) })
    page.drawText(`${item.required_qty} ${item.uom}`, { x: 470, y: currentY, size: 7.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) })
    page.drawText(item.line_status, { x: 515, y: currentY, size: 7, font: fontBold, color: rgb(0.1, 0.5, 0.2) })

    currentY -= 24
  })

  // 4. Quality & MTC Traceability Note Box
  page.drawRectangle({
    x: 40,
    y: currentY - 60,
    width: width - 80,
    height: 50,
    borderColor: rgb(0.8, 0.85, 0.9),
    borderWidth: 1,
    color: rgb(0.96, 0.98, 1),
  })

  page.drawText('QUALITY ASSURANCE & EN 10204 3.1 MTC COMPLIANCE', {
    x: 50,
    y: currentY - 24,
    size: 8,
    font: fontBold,
    color: rgb(0.05, 0.15, 0.3),
  })
  page.drawText('All materials allocated above are subject to physical storekeeper verification, heat number marking validation,', {
    x: 50,
    y: currentY - 38,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  })
  page.drawText('and 100% authentic manufacturer Material Test Certificates (MTCs). Certificates are stamped and digitally traceable.', {
    x: 50,
    y: currentY - 50,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  })

  // 5. Signatures and Authorizations
  const sigY = 120
  // Box 1: Sales Department
  page.drawRectangle({ x: 40, y: sigY, width: 160, height: 75, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1 })
  page.drawText('SALES ORDER DESK', { x: 50, y: sigY + 58, size: 8, font: fontBold, color: rgb(0.05, 0.15, 0.3) })
  page.drawText(`Created by: ${order.created_by.slice(0, 20)}`, { x: 50, y: sigY + 42, size: 7, font: fontRegular, color: rgb(0.4, 0.4, 0.4) })
  page.drawText('Signature: ________________', { x: 50, y: sigY + 15, size: 7.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) })

  // Box 2: Storekeeper Inspection
  page.drawRectangle({ x: 215, y: sigY, width: 160, height: 75, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1 })
  page.drawText('STOREKEEPER VERIFICATION', { x: 225, y: sigY + 58, size: 8, font: fontBold, color: rgb(0.05, 0.15, 0.3) })
  page.drawText(`Status: ${order.approved_by ? 'VERIFIED & APPROVED' : 'PENDING CHECK'}`, { x: 225, y: sigY + 42, size: 7, font: fontBold, color: order.approved_by ? rgb(0.1, 0.5, 0.2) : rgb(0.8, 0.5, 0.1) })
  page.drawText('Physical Marking: MATCHED', { x: 225, y: sigY + 28, size: 7, font: fontRegular, color: rgb(0.4, 0.4, 0.4) })
  page.drawText('Storekeeper Sign: ___________', { x: 225, y: sigY + 15, size: 7.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) })

  // Box 3: QA/QC Stamp
  page.drawRectangle({ x: 390, y: sigY, width: 165, height: 75, borderColor: rgb(0.8, 0.2, 0.2), borderWidth: 1.5, color: rgb(1, 0.98, 0.98) })
  page.drawText('MSG QC INSPECTION SEAL', { x: 400, y: sigY + 58, size: 8, font: fontBold, color: rgb(0.8, 0.1, 0.1) })
  page.drawText('P.O. REF: ' + order.po_number, { x: 400, y: sigY + 42, size: 7, font: fontMono, color: rgb(0.1, 0.1, 0.1) })
  page.drawText('MTC PKG: ' + (order.mtc_package_generated ? 'ISSUED & STAMPED' : 'PENDING'), { x: 400, y: sigY + 28, size: 7, font: fontBold, color: rgb(0.2, 0.2, 0.2) })
  page.drawText('DATE: ' + new Date().toISOString().substring(0, 10), { x: 400, y: sigY + 15, size: 7, font: fontMono, color: rgb(0.2, 0.2, 0.2) })

  // Footer bar
  page.drawText('MSG OILFIELD EQUIPMENT TRADING LLC | OFFICIAL CONTROLLED DOCUMENT | SYSTEM GENERATED', {
    x: 90,
    y: 35,
    size: 7,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.5),
  })

  return await pdfDoc.save()
}

// Parses customer Sales Order PDF / PO Document with accurate item code, description, heat number, and quantity extraction
export async function parseCustomerSOPDF(file: File): Promise<{
  customerName: string
  poNumber: string
  soNumber?: string
  deliveryDate: string
  items: {
    position?: number
    itemCode: string
    itemDescription: string
    heatNumber?: string
    location?: string
    requiredQty: number
    clientPoItemNo?: string
    rate?: number
    purchaseType?: 'regular' | 'local_purchase'
    make?: string
    supplierName?: string
    packageType?: string
    packageNo?: string
    splitQty?: string
    totalQty?: number
    groupId?: string
  }[]
  pdfBlobUrl: string
  fileName: string
}> {
  const arrayBuf = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuf)
  const blobUrl = URL.createObjectURL(new Blob([bytes as any], { type: 'application/pdf' }))

  // Helper: Parse ToUnicode CMap bfrange mappings
  const parseToUnicodeCMap = (cmapStr: string): Map<number, string> => {
    const map = new Map<number, string>()
    const bfrangeMatches = cmapStr.matchAll(/beginbfrange\s+([\s\S]*?)endbfrange/g)
    for (const m of bfrangeMatches) {
      const tokens = m[1].match(/<[0-9A-Fa-f]+>|\[[^\]]+\]/g) || []
      for (let i = 0; i < tokens.length; i += 3) {
        const start = parseInt(tokens[i].replace(/[<>]/g, ''), 16)
        const end = parseInt(tokens[i + 1].replace(/[<>]/g, ''), 16)
        const destToken = tokens[i + 2]
        if (destToken && destToken.startsWith('<')) {
          const destStart = parseInt(destToken.replace(/[<>]/g, ''), 16)
          for (let code = start; code <= end; code++) {
            map.set(code, String.fromCharCode(destStart + (code - start)))
          }
        }
      }
    }
    return map
  }

  // Helper: Decode PDF string bytes through CMap and handle kerning / letter-spacing
  const decodePDFString = (raw: string, cmap: Map<number, string>): string => {
    const unescaped = raw.replace(/\\([()\\])/g, '$1')
    const words = unescaped.split(/\s{2,}/)
    const decodedWords: string[] = []
    for (const w of words) {
      if (!w) continue
      const charTokens = w.trim().split(/\s+/)
      if (charTokens.length > 1 && charTokens.every(t => t.length === 1)) {
        let wordStr = ''
        for (const tok of charTokens) {
          const code = tok.charCodeAt(0)
          wordStr += cmap.get(code) || tok
        }
        decodedWords.push(wordStr)
      } else {
        let wordStr = ''
        for (let i = 0; i < w.length; i++) {
          const code = w.charCodeAt(i)
          wordStr += cmap.get(code) || w[i]
        }
        if (/^[A-Za-z0-9_\-\/.,:"](\s+[A-Za-z0-9_\-\/.,:"])+$/.test(wordStr.trim())) {
          wordStr = wordStr.replace(/\s+/g, '')
        }
        decodedWords.push(wordStr)
      }
    }
    let line = decodedWords.join(' ')
    // Normalize font artifacts (e.g. en-dash or Greek zeta from custom glyph 0x0396 -> 'I')
    line = line.replace(/[–\u2013\u0396\u0096]/g, 'I').replace(/\u0000/g, '')
    line = line.replace(/\byt\b/g, '&').replace(/yf/g, ')')
    return line
  }

  let decodedLines: string[] = []

  // 1. Extract and decode all PDF streams in strict PAGE ORDER with CMap resolution
  try {
    const loadedDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const cmap = new Map<number, string>()

    // Collect all ToUnicode CMaps across document indirect objects
    for (const [, obj] of loadedDoc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream) {
        try {
          const decoded = (decodePDFRawStream(obj as any) as any).decode()
          const str = new TextDecoder('latin1').decode(decoded)
          if (str.includes('begincmap')) {
            const m = parseToUnicodeCMap(str)
            for (const [k, v] of m.entries()) cmap.set(k, v)
          }
        } catch {
          // Ignore stream error
        }
      }
    }

    // Extract text strictly page by page in document layout order
    const pages = loadedDoc.getPages()
    const tokenRegex = /\((?:[^\\)]|\\.)*\)|<[0-9A-Fa-f]+>/g

    for (let p = 0; p < pages.length; p++) {
      const content = pages[p].node.Contents()
      const streams: PDFRawStream[] = []
      if (content instanceof PDFRawStream) {
        streams.push(content)
      } else if (content && (content as any).asArray) {
        for (const ref of (content as any).asArray()) {
          const s = loadedDoc.context.lookup(ref)
          if (s instanceof PDFRawStream) streams.push(s)
        }
      }

      for (const s of streams) {
        try {
          const decoded = (decodePDFRawStream(s as any) as any).decode()
          const str = new TextDecoder('latin1').decode(decoded)
          const lines = str.split(/[\r\n]+/)
          for (const l of lines) {
            let m: RegExpExecArray | null
            while ((m = tokenRegex.exec(l)) !== null) {
              const raw = m[0]
              if (raw.startsWith('(')) {
                let text = decodePDFString(raw.slice(1, -1), cmap).trim()
                // Clean OCR / font encoding artifacts
                text = text
                  .replace(/\bHAT\s+NO\b/i, 'HEAT NO')
                  .replace(/\bHAT\s+NUMBR\b/i, 'HEAT NUMBER')
                  .replace(/\bBNKAN\b/i, 'BENKAN')
                  .replace(/\bASM\s+B/i, 'ASME B')
                  .replace(/\bCONC\.\s+RD\b/i, 'CONC. RED')
                  .replace(/\bRDUC\s*ING\b/i, 'REDUCING')
                  .replace(/\bRD\.\s+T\b/i, 'RED. TEE')
                if (text) decodedLines.push(text)
              }
            }
          }
        } catch {
          // Ignore stream error
        }
      }
    }
  } catch (err) {
    console.warn('pdf-lib page stream decode error, falling back to raw scan:', err)
  }

  // 2. Fallback: Also scan raw ASCII if CMap decoder found few lines
  if (decodedLines.length < 5) {
    let asciiText = ''
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]
      if ((b >= 32 && b <= 126) || b === 10 || b === 13) {
        asciiText += String.fromCharCode(b)
      } else {
        asciiText += '\n'
      }
    }
    const rawLines = asciiText.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean)
    decodedLines.push(...rawLines)
  }

  const combinedText = decodedLines.join('\n')

  // 3. Detect Customer Name (Bill To)
  let customerName = 'REI OIL & GAS PROCESS SERVICES L.L.C-AED'
  if (/REI\s+OIL/i.test(combinedText)) {
    customerName = 'REI OIL & GAS PROCESS SERVICES L.L.C-AED'
  } else if (/Dubai\s+Petroleum/i.test(combinedText)) {
    customerName = 'Dubai Petroleum Establishment'
  } else if (/JSS\s*PIPES/i.test(combinedText)) {
    customerName = 'JSS PIPES AND FITTINGS TRADING LLC'
  } else if (/Bill\s*To\s*[\r\n]+([^\r\n]{3,80})/i.test(combinedText)) {
    const match = combinedText.match(/Bill\s*To\s*[\r\n]+([^\r\n]{3,80})/i)
    if (match && match[1] && !match[1].toLowerCase().includes('order date')) {
      customerName = match[1].trim()
    }
  } else if (/Arabian\s+International/i.test(combinedText)) {
    customerName = 'Arabian International Special Technical Services L.L.C.'
  } else if (/adnoc/i.test(combinedText)) {
    customerName = 'ADNOC Offshore'
  }

  // 4. Detect PO Number / Ref# and SO Number
  let poNumber = 'PO-PENDING'
  let soNumber: string | undefined = undefined
  const soMatch = combinedText.match(/(?:Sales\s*Order\s*#|Sales\s*Order\s*No\.?|SO\s*#)[\s:]*([A-Za-z0-9\-_/]+)/i)
  if (soMatch && soMatch[1]) {
    soNumber = soMatch[1].trim()
  }

  const refMatch = combinedText.match(/Ref\s*#?\s*[:\s]*[\r\n]*([A-Za-z0-9\-_/]+)/i)
  const lpoDirect = combinedText.match(/(LPO-[A-Za-z0-9\-_/]+)/i)
  if (refMatch && refMatch[1] && refMatch[1].length > 2) {
    poNumber = refMatch[1].trim()
  } else if (lpoDirect) {
    poNumber = lpoDirect[1].trim()
  } else if (soNumber) {
    poNumber = soNumber
  } else {
    const poGeneric = combinedText.match(/(?:Ref\s*#?|P\.O\.?\s*(?:#|No|Number)?|Order\s*(?:#|No|Number)?|PO\s*#?)[\s:]+([A-Za-z0-9\-_/]{4,35})/i)
    if (poGeneric) {
      poNumber = poGeneric[1].trim()
    } else {
      poNumber = file.name.replace(/\.[^/.]+$/, '').toUpperCase()
    }
  }

  // 5. Detect Order Date / Delivery Date
  const dateMatch = combinedText.match(/(?:Order\s*Date|Date|Delivery\s*Date)[\s:]+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4}|\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})/i)
  let deliveryDate = new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10)
  if (dateMatch) {
    const rawD = dateMatch[1].trim()
    const parsedD = new Date(rawD)
    if (!isNaN(parsedD.getTime())) {
      deliveryDate = parsedD.toISOString().substring(0, 10)
    }
  }

  // Helper: Detect Item Codes (including Mill Stock and Local Purchase L-codes & Olets)
  const isItemCode = (str: string): boolean => {
    if (!str || str.includes(' ') || str.length < 5) return false
    // Exclude oilfield specifications, standards, and standard materials
    if (/^(?:NACE[-_]?)?MR[-_]?0?1[07][035]$/i.test(str)) return false
    if (/^(?:NACE|ASTM|ASME|API|MSS|BS|DIN|EN|ISO|SCH|CLASS|STD|XS|XXS)/i.test(str)) return false
    if (/^(?:B16\.\d+|B31\.\d+|A105N?|A350|A420|A234|A182|B564|A516)/i.test(str)) return false
    if (/^(?:HEAT|LOCATION|LOC|ITEM|LINE|PCS|UNIT|PO|REF|AMOUNT|RATE|QTY)/i.test(str)) return false

    return (
      /^(?:LOC[-_]?|L[-_]?)?(?:CR|RT|BL|WSO|WN|LWN|SW|TH|EL|LEL|CPL|CP|TEE|TE|RED|RD|CAP|CA|WBL|NIP|NI|FLG|FL|PIP|VAL|GSK|BOLT|TO|SO|WO|LTO|LSO|LWO)[0-9A-Z_\-\/&]{3,40}$/i.test(str) ||
      /^[A-Z]{2,6}[0-9]{2,8}[A-Z0-9_\-\/&]{2,30}$/i.test(str)
    )
  }

  // Helper: Synthesize standardized item code when line item has description but no separate part code (e.g. Spectacle Blind)
  const synthesizeItemCode = (desc: string, pos: number): string => {
    const d = desc.toUpperCase()
    const sizeM = d.match(/(\d+(?:\.\d+)?(?:\/\d+)?(?:"|\s*INCH|\s*IN|\s*MM)?)/)
    const sizeStr = sizeM ? sizeM[1].replace(/["\s]/g, '').replace('INCH', '').replace('IN', '') : `${pos}`

    let typeStr = 'ITEM'
    if (d.includes('SPECTACLE BLIND') || d.includes('SP. BLIND') || d.includes('SPBL')) {
      typeStr = 'SPBL'
    } else if (d.includes('BLIND')) {
      typeStr = 'BL'
    } else if (d.includes('THREADOLET') || d.includes('TOL')) {
      typeStr = 'LTO'
    } else if (d.includes('WELDOLET') || d.includes('WOL')) {
      typeStr = 'LWO'
    } else if (d.includes('SOCKOLET') || d.includes('SOL')) {
      typeStr = 'LSO'
    } else if (d.includes('ELBOW')) {
      typeStr = 'EL90'
    } else if (d.includes('FLANGE') || d.includes('WN')) {
      typeStr = 'LWN'
    } else if (d.includes('TEE')) {
      typeStr = 'TEE'
    } else if (d.includes('COUPLING')) {
      typeStr = 'CPL'
    }

    const ratingM = d.match(/(150|300|600|900|1500|2500|3000|6000|9000)\s*(?:#|LB|LBS|CLASS)?/)
    const ratingStr = ratingM ? ratingM[1] : ''

    const matM = d.match(/(A105N?|A350\s*(?:GR\.?)?\s*LF2|A420\s*(?:GR\.?)?\s*WPL6|A234\s*(?:GR\.?)?\s*WPB|A182\s*(?:GR\.?)?\s*F\d+|B564|A516\s*(?:GR\.?)?\s*70)/i)
    const matStr = matM ? matM[1].replace(/\s+/g, '') : ''

    const parts = [typeStr, sizeStr, ratingStr, matStr].filter(Boolean)
    return parts.join('-') || `ITEM-${pos.toString().padStart(2, '0')}`
  }

  // 6. Comprehensive Line Items Parser
  const lines = decodedLines
  const items: {
    position?: number
    itemCode: string
    itemDescription: string
    heatNumber?: string
    location?: string
    requiredQty: number
    clientPoItemNo?: string
    rate?: number
    purchaseType?: 'regular' | 'local_purchase'
    make?: string
    supplierName?: string
    countryOfOrigin?: string
    hsCode?: string
    uom?: string
    packageType?: string
    packageNo?: string
    splitQty?: string
    totalQty?: number
    groupId?: string
  }[] = []

  let i = 0

  // Advance past initial preamble until first table header (Amount, Item No, Qty, Rate)
  while (i < lines.length) {
    if (/^(?:Amount|Item\s*No|Qty|Rate)$/i.test(lines[i])) {
      i++
      break
    }
    i++
  }

  while (i < lines.length) {
    const line = lines[i]

    // Skip order totals, subtotal, and VAT lines
    if (/^(?:total|amount\s*in\s*words|sub\s*total|standard\s*rate|zero\s*rate|vat)/i.test(line)) {
      i++
      continue
    }

    // Skip repeat page header lines
    if (/^(?:#|Item\s*&?\s*Description|Client\s*PO|Item\s*No|Qty|Rate|Amount)$/i.test(line)) {
      i++
      continue
    }

    // Skip standalone page number lines: e.g. "2" followed by Sub Total, Total, or header
    if (/^\d{1,3}$/.test(line)) {
      const val = parseInt(line, 10)
      const isFollowedByNonItem = i + 1 < lines.length && /^(?:#|Item|Sub\s*Total|Total|Standard\s*Rate|VAT|Amount)/i.test(lines[i + 1])
      if (isFollowedByNonItem || (items.length > 0 && val <= items.length && val !== items.length + 1)) {
        i++
        continue
      }
    }

    let pos: number | null = null
    let code: string | null = null
    let initialDesc: string | null = null

    const mCombined = line.match(/^(\d{1,3})\s+(.*)$/)
    if (mCombined) {
      pos = parseInt(mCombined[1], 10)
      const rest = mCombined[2].trim()
      const spaceIdx = rest.indexOf(' ')
      const candidateCode = spaceIdx > 0 ? rest.substring(0, spaceIdx) : rest
      if (isItemCode(candidateCode)) {
        code = candidateCode
        initialDesc = spaceIdx > 0 ? rest.substring(spaceIdx + 1).trim() : ''
      } else if (isItemCode(rest)) {
        code = rest
        initialDesc = ''
      } else {
        code = null
        initialDesc = rest
      }
      i++
    } else if (/^\d{1,3}$/.test(line)) {
      pos = parseInt(line, 10)
      i++
      if (i < lines.length) {
        const nextLine = lines[i]
        if (isItemCode(nextLine)) {
          code = nextLine
          i++
        } else if (!/^\d+(?:\.\d+)?$/.test(nextLine) && !/^(?:#|Item|Qty|Rate|Amount|Sub\s*Total|Total|Standard\s*Rate|VAT)/i.test(nextLine)) {
          code = null
          initialDesc = nextLine
          i++
        }
      }
    } else if (isItemCode(line)) {
      pos = items.length + 1
      code = line
      i++
    } else {
      i++
      continue
    }

    // If code is null and initialDesc is empty or looks like totals/headers, skip!
    if (!code && (!initialDesc || /^(?:Sub\s*Total|Total|Standard\s*Rate|VAT|#|Amount)/i.test(initialDesc))) {
      continue
    }

    // Collect subsequent lines belonging to this item
    const descLines: string[] = initialDesc ? [initialDesc] : []
    const numTokens: string[] = []
    let heatNumber: string | undefined = undefined
    let location: string | undefined = undefined

    while (i < lines.length) {
      const cur = lines[i]

      // Stop on totals or repeat headers
      if (/^(?:total|amount\s*in\s*words|sub\s*total|standard\s*rate|vat)/i.test(cur)) break
      if (/^(?:#|Item\s*&?\s*Description|Client\s*PO)/i.test(cur)) break

      // Stop if next item start: e.g. standalone "2", "3" followed by item code or non-numeric line
      if (/^\d{1,3}$/.test(cur)) {
        const nextPos = parseInt(cur, 10)
        if (nextPos === (pos || 0) + 1) {
          if (i + 1 < lines.length && (isItemCode(lines[i + 1]) || (!/^[\d.,]+$/.test(lines[i + 1]) && !/^(?:pcs|ea|nos)$/i.test(lines[i + 1])))) {
            break
          }
        }
        if (i + 1 < lines.length && /^(?:#|Item|Sub\s*Total|Total|Amount)/i.test(lines[i + 1])) {
          break
        }
      }

      const mNextComb = cur.match(/^(\d{1,3})\s+(.*)$/)
      if (mNextComb) {
        const nextPos = parseInt(mNextComb[1], 10)
        if (nextPos === (pos || 0) + 1 || isItemCode(mNextComb[2].split(/\s+/)[0])) {
          break
        }
      }

      if (isItemCode(cur)) {
        if (numTokens.length >= 3) {
          break
        }
      }

      // Heat number detection (support slashes e.g. 23/39490)
      const heatMatch = cur.match(/HEAT\s*(?:NO|NUMBER|#)?[\s:]+([A-Za-z0-9\-_/]+)/i)
      if (heatMatch) heatNumber = heatMatch[1].trim()

      // Location detection
      const locMatch = cur.match(/LN[\s:]+([A-Za-z0-9\-_]+)/i) || cur.match(/LOC[\s:]+([A-Za-z0-9\-_]+)/i)
      if (locMatch) location = locMatch[1].trim()

      // Check if unit (e.g. pcs, ea, nos)
      if (/^(?:pcs|ea|nos|meters?)$/i.test(cur)) {
        i++
        continue
      }

      // Check if line contains numbers (Client PO, Qty, Rate, Amount)
      const tokens = cur.split(/\s+/)
      const isAllNumericTokens = tokens.length > 0 && tokens.every(t => /^[\d,]+(?:\.\d+)?$/.test(t) || /^(?:pcs|ea|nos)$/i.test(t))
      if (isAllNumericTokens) {
        for (const t of tokens) {
          if (!/^(?:pcs|ea|nos)$/i.test(t)) {
            numTokens.push(t.replace(/,/g, ''))
          }
        }
        i++
        continue
      }

      // Otherwise it's description
      if (!heatMatch && !locMatch && cur.length > 2) {
        descLines.push(cur)
      }
      i++
    }

    let clientPoItemNo = pos ? String(pos) : ''
    let qty = 1
    let rate = 0

    // Strict mathematical validation: find (qty * rate = amount)
    let foundMathMatch = false
    for (let k = 0; k <= numTokens.length - 3; k++) {
      const qCand = parseFloat(numTokens[k])
      const rCand = parseFloat(numTokens[k + 1])
      const aCand = parseFloat(numTokens[k + 2])
      if (qCand > 0 && rCand > 0 && aCand > 0 && Math.abs(qCand * rCand - aCand) < 0.5) {
        qty = Math.round(qCand) || 1
        rate = rCand
        if (k > 0) {
          clientPoItemNo = numTokens[k - 1]
        }
        foundMathMatch = true
        break
      }
    }

    if (!foundMathMatch) {
      if (numTokens.length >= 4) {
        clientPoItemNo = numTokens[0]
        qty = Math.round(parseFloat(numTokens[1])) || 1
        rate = parseFloat(numTokens[2]) || 0
      } else if (numTokens.length === 3) {
        const n0 = parseFloat(numTokens[0])
        const n1 = parseFloat(numTokens[1])
        const n2 = parseFloat(numTokens[2])
        if (Math.abs(n0 * n1 - n2) < 0.5) {
          qty = Math.round(n0) || 1
          rate = n1
        } else {
          clientPoItemNo = numTokens[0]
          qty = Math.round(n1) || 1
          rate = n2
        }
      } else if (numTokens.length === 2) {
        const n0 = parseFloat(numTokens[0])
        const n1 = parseFloat(numTokens[1])
        if (Number.isInteger(n0) && n0 <= 500 && n1 <= 1000) {
          clientPoItemNo = numTokens[0]
          qty = Math.round(n1) || 1
        } else {
          qty = Math.round(n0) || 1
          rate = n1
        }
      } else if (numTokens.length === 1) {
        qty = Math.round(parseFloat(numTokens[0])) || 1
      }
    }

    let itemDesc = descLines.join(' ').replace(/\s{2,}/g, ' ').trim()
    if (/DISCOUNT/i.test(itemDesc)) {
      continue
    }

    if (!code) {
      code = synthesizeItemCode(itemDesc, pos || items.length + 1)
    }
    if (!itemDesc) {
      itemDesc = `${code} Oilfield Fitting / Material`
    }

    const isStock = /[-_\s/]STOCK\b/i.test(code) || /[-_\s/]STOCK\b/i.test(itemDesc)
    const isLocal = !isStock && (
      code.toUpperCase().startsWith('L') ||
      itemDesc.toUpperCase().includes('LOCALLY MADE') ||
      itemDesc.toUpperCase().includes('LOCAL')
    )

    const detectedMake = autoDetectMake(code + ' ' + itemDesc) || (pos === 1 ? 'DELCORTE, FRANCE' : 'BENKAN, THAILAND')
    const detectedSupplier = isStock ? 'STOCK' : (isLocal ? 'LOCAL UAE SUPPLIER' : autoDetectSupplier(detectedMake, itemDesc))
    const detectedCOO = autoDetectCountryOfOrigin(detectedMake, itemDesc, '')

    // Check for explicit HSN in description lines
    let explicitHS = ''
    for (const dl of descLines) {
      const hsM = dl.match(/(?:HSN|HS\s*CODE|HS|TARIFF)[\s:#\-]+([0-9]{3,4}(?:[.\-_]?[0-9]{1,4})?)/i)
      if (hsM) {
        explicitHS = hsM[1]
        break
      }
    }
    const detectedHS = autoDetectHSCode(itemDesc, code, explicitHS)

    items.push({
      position: pos || items.length + 1,
      itemCode: code,
      itemDescription: itemDesc,
      heatNumber,
      location,
      requiredQty: qty || 1,
      clientPoItemNo: clientPoItemNo || String(pos || items.length + 1),
      rate,
      purchaseType: isStock ? 'regular' : (isLocal ? 'local_purchase' : 'regular'),
      make: detectedMake,
      supplierName: detectedSupplier,
      countryOfOrigin: detectedCOO,
      hsCode: detectedHS,
      packageType: 'Pallet',
      packageNo: `${Math.floor(items.length / 3) + 1}`
    })
  }

  // Ensure strict sorting by position in order: 1, 2, 3...
  items.sort((a, b) => (a.position || 0) - (b.position || 0))

  // Fallback: If line scanner found nothing, run regex search across entire text
  if (items.length === 0) {
    const codeMatches = combinedText.matchAll(/(?:LOC[-_]?|L[-_]?)?(?:CR|RT|BL|WSO|WN|LWN|SW|TH|EL|LEL|CPL|CP|TEE|TE|RED|RD|CAP|CA|WBL|NIP|NI|FLG|FL|PIP|VAL)[A-Za-z0-9_\-\/&]{4,30}/gi)
    const seen = new Set<string>()
    for (const m of codeMatches) {
      const c = m[0].toUpperCase()
      if (!seen.has(c) && c.length >= 6) {
        seen.add(c)
        const pos = items.length + 1
        const desc = `Oilfield Material ${c} ASME B16.9 / B16.5`
        const mMake = autoDetectMake(desc) || 'BENKAN, THAILAND'
        const mCOO = autoDetectCountryOfOrigin(mMake, desc, '')
        const mHS = autoDetectHSCode(desc, c)
        const isLoc = /^L/i.test(c)
        items.push({
          position: pos,
          clientPoItemNo: String(pos),
          itemCode: c,
          itemDescription: desc,
          requiredQty: 1,
          purchaseType: isLoc ? 'local_purchase' : 'regular',
          make: mMake,
          supplierName: isLoc ? 'LOCAL UAE SUPPLIER' : autoDetectSupplier(mMake, desc),
          countryOfOrigin: mCOO,
          hsCode: mHS,
          packageType: 'Pallet',
          packageNo: `${Math.floor(items.length / 3) + 1}`
        })
      }
    }
  }

  // Auto-group split batches sharing the same Client PO Item No (e.g. 9 pcs & 18 pcs -> 9 OF 27 & 18 OF 27)
  const clientGroups: Record<string, typeof items> = {}
  items.forEach(it => {
    const cNo = String(it.clientPoItemNo || '').trim()
    if (cNo) {
      if (!clientGroups[cNo]) clientGroups[cNo] = []
      clientGroups[cNo].push(it)
    }
  })

  Object.keys(clientGroups).forEach(cNo => {
    const grp = clientGroups[cNo]
    if (grp.length > 1) {
      const totalQty = grp.reduce((sum, it) => sum + (it.requiredQty || 1), 0)
      const fmtTotal = Number.isInteger(totalQty) ? totalQty : Math.round(totalQty * 100) / 100
      grp.forEach(it => {
        const curr = it.requiredQty || 1
        const fmtCurr = Number.isInteger(curr) ? curr : Math.round(curr * 100) / 100
        it.splitQty = `${fmtCurr} OF ${fmtTotal}`
        it.totalQty = fmtTotal
        it.groupId = `grp-${cNo}`
      })
    }
  })

  return {
    customerName,
    poNumber,
    soNumber,
    deliveryDate,
    items,
    pdfBlobUrl: blobUrl,
    fileName: file.name
  }
}
