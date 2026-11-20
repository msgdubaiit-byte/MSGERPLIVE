const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_BASE = path.join(__dirname, 'Software_Documentation', '05_Screenshots');

async function run() {
  console.log('Launching Microsoft Edge for Automated Screenshot Capture...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // 1. LOGIN SCREEN
  console.log('1. Capturing Login Screen...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));

  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '01_Login', 'Fig_1_1_Login_Screen.png'),
    fullPage: false
  });

  // 2. LOG IN AS SUPER ADMIN
  console.log('Logging in as Super Administrator...');
  // Find the quick login button for Super Admin or click it
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const adminBtn = btns.find(b => b.textContent && b.textContent.includes('Super Administrator'));
    if (adminBtn) adminBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Dismiss any welcome modal / onboarding guide if open
  await page.evaluate(() => {
    const closeBtns = Array.from(document.querySelectorAll('button'));
    const dismiss = closeBtns.find(b => b.textContent && (b.textContent.includes('Close') || b.textContent.includes('Got it') || b.textContent.includes('Start Working') || b.textContent.includes('Skip')));
    if (dismiss) dismiss.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // Helper to click sidebar tab
  async function selectTab(tabId) {
    await page.evaluate((id) => {
      // Look for button with data-tab or clicking sidebar item
      const navButtons = Array.from(document.querySelectorAll('nav button, aside button'));
      // Or trigger direct tab if there is a button matching id or label
      const target = navButtons.find(b => {
        const text = (b.textContent || '').toLowerCase();
        if (id === 'dashboard' && text.includes('kpi dashboard')) return true;
        if (id === 'solo_hub' && text.includes('centralized solo hub')) return true;
        if (id === 'orders' && text.includes('sales orders')) return true;
        if (id === 'stock' && text.includes('master stock')) return true;
        if (id === 'items' && text.includes('item master')) return true;
        if (id === 'traceability' && text.includes('heat traceability')) return true;
        if (id === 'allocation' && text.includes('stock allocation')) return true;
        if (id === 'sourcing' && text.includes('sourcing')) return true;
        if (id === 'stickers' && text.includes('sticker generator')) return true;
        if (id === 'loc' && text.includes('loc & material')) return true;
        if (id === 'approvals' && text.includes('storekeeper approvals')) return true;
        if (id === 'mtc' && text.includes('mtc management')) return true;
        if (id === 'local_purchase' && text.includes('local purchase')) return true;
        if (id === 'dispatch' && text.includes('dispatch management')) return true;
        if (id === 'movements' && text.includes('stock movements')) return true;
        if (id === 'returns' && text.includes('returns & adjustments')) return true;
        if (id === 'reports' && text.includes('reports & analytics')) return true;
        if (id === 'excel' && text.includes('excel studio')) return true;
        if (id === 'users' && text.includes('user management')) return true;
        if (id === 'audit' && text.includes('audit logs')) return true;
        if (id === 'settings' && text.includes('supabase & settings')) return true;
        if (id === 'it_console' && text.includes('it software config')) return true;
        return false;
      });
      if (target) {
        target.click();
      }
    }, tabId);
    await new Promise(r => setTimeout(r, 1200));
  }

  // 2. DASHBOARD
  console.log('2. Capturing KPI Dashboard...');
  await selectTab('dashboard');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '02_Dashboard', 'Fig_2_1_Executive_Dashboard.png')
  });

  // 3. SOLO HUB
  console.log('3. Capturing Centralized Solo Hub...');
  await selectTab('solo_hub');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '03_Solo_Hub', 'Fig_3_1_Centralized_Solo_Hub.png')
  });

  // Toggle Workers Away Mode on/off or capture HSN table
  console.log('3b. Capturing Solo Hub HSN Review Table...');
  await page.evaluate(() => {
    window.scrollBy(0, 450);
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '03_Solo_Hub', 'Fig_3_2_HSN_Tariff_Review_Table.png')
  });
  await page.evaluate(() => { window.scrollTo(0, 0); });

  // 4. SALES ORDERS
  console.log('4. Capturing Sales Orders...');
  await selectTab('orders');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '04_Sales_Orders', 'Fig_4_1_Sales_Order_Management.png')
  });

  // 5. MASTER STOCK & INVENTORY
  console.log('5. Capturing Master Stock...');
  await selectTab('stock');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '05_Stock_Inventory', 'Fig_5_1_Master_Stock_Inventory.png')
  });

  console.log('5b. Capturing Item Master...');
  await selectTab('items');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '05_Stock_Inventory', 'Fig_5_2_Item_Master_Catalog.png')
  });

  console.log('5c. Capturing Heat Traceability...');
  await selectTab('traceability');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '05_Stock_Inventory', 'Fig_5_3_Heat_Traceability_360.png')
  });

  // 6. ALLOCATION STUDIO
  console.log('6. Capturing Stock Allocation Studio...');
  await selectTab('allocation');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '06_Allocation_Studio', 'Fig_6_1_Stock_Allocation_Studio.png')
  });

  // 7. WAREHOUSE APPROVALS
  console.log('7. Capturing Storekeeper Approvals...');
  await selectTab('approvals');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '07_Warehouse_Approvals', 'Fig_7_1_Storekeeper_Approvals_Queue.png')
  });

  // 8. MTC DIGITAL VAULT
  console.log('8. Capturing MTC Management...');
  await selectTab('mtc');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '08_MTC_Vault', 'Fig_8_1_MTC_Digital_Vault.png')
  });

  // 9. SOURCING & CIPL
  console.log('9. Capturing Technical Sourcing & CIPL...');
  await selectTab('sourcing');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '09_Sourcing_CIPL', 'Fig_9_1_Sourcing_And_CIPL_Portal.png')
  });

  // 10. DISPATCH LOGISTICS
  console.log('10. Capturing Dispatch Management...');
  await selectTab('dispatch');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '10_Dispatch_Logistics', 'Fig_10_1_Dispatch_Management_Console.png')
  });

  // 11. STICKERS & LOC
  console.log('11. Capturing Sticker Generator...');
  await selectTab('stickers');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '11_Sticker_LOC', 'Fig_11_1_Thermal_Sticker_Generator.png')
  });

  console.log('11b. Capturing LOC Material Tags...');
  await selectTab('loc');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '11_Sticker_LOC', 'Fig_11_2_LOC_Material_Tags.png')
  });

  // 12. IT CONFIG & GOVERNANCE
  console.log('12. Capturing IT Software Config Console...');
  await selectTab('it_console');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '12_IT_Admin_Console', 'Fig_12_1_IT_Software_Config_Console.png')
  });

  console.log('12b. Capturing Supabase & Settings...');
  await selectTab('settings');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '12_IT_Admin_Console', 'Fig_12_2_Supabase_Cloud_Settings.png')
  });

  // 13. REPORTS & AUDIT
  console.log('13. Capturing Reports & Analytics...');
  await selectTab('reports');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '13_Reports_Audit', 'Fig_13_1_Reports_And_Analytics.png')
  });

  console.log('13b. Capturing Audit Logs...');
  await selectTab('audit');
  await page.screenshot({
    path: path.join(SCREENSHOT_BASE, '13_Reports_Audit', 'Fig_13_2_Audit_Logs_Ledger.png')
  });

  await browser.close();
  console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Error during screenshot capture:', err);
  process.exit(1);
});
