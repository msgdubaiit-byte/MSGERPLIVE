import fs from 'fs';
import { parseCustomerSOPDF } from './src/services/pdfEngine.ts';

async function test() {
  const buf = fs.readFileSync('C:/Users/Admin/.gemini/antigravity/brain/5071eec3-c7f2-4e0b-9bbe-868be8a229b9/.user_uploaded/media_1794882678026.pdf');
  const file = new File([buf], 'MSG-1126-2233-SO.pdf', { type: 'application/pdf' });
  const res = await parseCustomerSOPDF(file);
  console.log('Customer:', res.customerName);
  console.log('SO#:', res.soNumber);
  console.log('PO#:', res.poNumber);
  console.log('Items Count:', res.items.length);
  res.items.forEach((it, idx) => {
    console.log(`${idx + 1}: Pos=${it.position} ItemCode=${it.itemCode} Qty=${it.requiredQty} Heat=${it.heatNumber} Loc=${it.location} ClientPO=${it.clientPoItemNo} Desc=${it.itemDescription}`);
  });
}
test().catch(console.error);
