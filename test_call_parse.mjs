import fs from 'fs';
// We can import parseCustomerSOPDF from built dist or compile ts
// Or let's test directly with node using tsx or a small test script
const fileBuffer = fs.readFileSync('C:/Users/Admin/.gemini/antigravity/brain/5071eec3-c7f2-4e0b-9bbe-868be8a229b9/.user_uploaded/media_1794391152612.pdf');
const fileObj = new File([fileBuffer], 'media_1794391152612.pdf', { type: 'application/pdf' });

console.log('File size:', fileBuffer.length);
