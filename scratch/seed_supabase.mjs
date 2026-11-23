import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://snmafjucycnzikmtkrsr.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNubWFmanVjeWNuemlrbXRrcnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNTgxOTcsImV4cCI6MjExMDczNDE5N30.-ZpWWjEZZ-m7DqIwaKyp0yC8zTMOXjc5O-4LXtWH9Ss'

const client = createClient(SUPABASE_URL, SUPABASE_KEY)

async function main() {
  console.log('Connecting to Supabase...')

  const items = [
    { id: 'ITEM-001', item_code: 'WSO15150F316', item_description: '1/2" Flange SORF CL150 SS316/SS316L', material_grade: 'SS316/316L', specification: 'ASTM A182 / ASME B16.5', size: '1/2" #150', uom: 'PCS', unit_price_aed: 22.0, is_active: true },
    { id: 'ITEM-002', item_code: 'WSO20150F316', item_description: '3/4" Flange SORF CL150 SS316/SS316L', material_grade: 'SS316/316L', specification: 'ASTM A182 / ASME B16.5', size: '3/4" #150', uom: 'PCS', unit_price_aed: 32.0, is_active: true },
    { id: 'ITEM-003', item_code: 'WSO40150F316', item_description: '1 1/2" Flange SORF CL150 SS316/SS316L', material_grade: 'SS316/316L', specification: 'ASTM A182 / ASME B16.5', size: '1 1/2" #150', uom: 'PCS', unit_price_aed: 70.0, is_active: true },
    { id: 'ITEM-004', item_code: 'WSO30150F316', item_description: '1 1/4" Flange SORF CL150 SS316/SS316L', material_grade: 'SS316/316L', specification: 'ASTM A182 / ASME B16.5', size: '1 1/4" #150', uom: 'PCS', unit_price_aed: 70.0, is_active: true },
    { id: 'ITEM-005', item_code: 'EL9050S80WPBBENKAN-STOCK', item_description: 'ELBOW 2", 90DEG, SCH.80, LR, BW, SMLS, ASTM A234 WPB', material_grade: 'ASTM A234 WPB', specification: 'ASME B16.9', size: '2" Sch 80', uom: 'PCS', unit_price_aed: 26.0, is_active: true },
    { id: 'ITEM-006', item_code: 'EL9080S40WPBBENKAN-STOCK', item_description: 'ELBOW 3", 90DEG, SCH.40, LR, BW, SMLS, ASTM A234 WPB', material_grade: 'ASTM A234 WPB', specification: 'ASME B16.9', size: '3" Sch 40', uom: 'PCS', unit_price_aed: 48.0, is_active: true },
    { id: 'ITEM-007', item_code: 'WSO80150F316-LOC', item_description: '3" Flange SORF CL150 SS316/SS316L (Item #8 - Local Purchase)', material_grade: 'SS316/316L', specification: 'ASTM A182 / ASME B16.5', size: '3" #150', uom: 'PCS', unit_price_aed: 155.0, is_active: true },
    { id: 'ITEM-008', item_code: 'WSO100150F316-LOC', item_description: '4" Flange SORF CL150 SS316/SS316L (Item #9 - Local Purchase)', material_grade: 'SS316/316L', specification: 'ASTM A182 / ASME B16.5', size: '4" #150', uom: 'PCS', unit_price_aed: 195.0, is_active: true },
    { id: 'ITEM-009', item_code: 'WN15150S80RFA105SRI-STOCK', item_description: 'FLANGE 1/2", 150#, SCH.80, WNRF, SA105N, ASME B16.5', material_grade: 'ASTM A105N', specification: 'ASME B16.5', size: '1/2" #150', uom: 'PCS', unit_price_aed: 15.0, is_active: true },
    { id: 'ITEM-010', item_code: 'WN150150S80RFA105GB-STOCK', item_description: 'WNRF 6", 150#, SCH.80, ASTM A105N, ASME B16.5', material_grade: 'ASTM A105N', specification: 'ASME B16.5', size: '6" #150', uom: 'PCS', unit_price_aed: 180.0, is_active: true },
    { id: 'ITEM-011', item_code: 'CPL253KNPTA105GB-STOCK', item_description: 'FULL COUPLING 1", 3000#, NPT, A105N, ASME B16.11', material_grade: 'ASTM A105N', specification: 'ASME B16.11', size: '1" 3000#', uom: 'PCS', unit_price_aed: 10.0, is_active: true },
    { id: 'ITEM-012', item_code: 'WSW20150S40F316', item_description: '3/4" Flange SWRF CL150 Sch 40S SS316/SS316L', material_grade: 'SS316/316L', specification: 'ASTM A182 / ASME B16.5', size: '3/4" Sch 40', uom: 'PCS', unit_price_aed: 33.0, is_active: true }
  ]

  const { error: itmErr } = await client.from('items').upsert(items)
  console.log('Items:', itmErr ? itmErr.message : `OK (${items.length} items)`)

  const lots = [
    { id: 'LOT-001', item_id: 'ITEM-001', item_code: 'WSO15150F316', item_description: '1/2" Flange SORF CL150 SS316/SS316L', heat_number: '889', yom: 2024, original_qty: 50, received_qty: 50, purchase_type: 'regular', supplier_name: 'WMASS GERMANY', stock_receipt_date: '2024-03-15', warehouse_location: 'LN-EB1', mtc_ref: 'MTC-WMASS-889.pdf' },
    { id: 'LOT-002', item_id: 'ITEM-002', item_code: 'WSO20150F316', item_description: '3/4" Flange SORF CL150 SS316/SS316L', heat_number: 'A-2212', yom: 2025, original_qty: 50, received_qty: 50, purchase_type: 'regular', supplier_name: 'WMASS GERMANY', stock_receipt_date: '2025-01-20', warehouse_location: 'LN-EB1', mtc_ref: 'MTC-WMASS-A2212.pdf' },
    { id: 'LOT-003', item_id: 'ITEM-002', item_code: 'WSO20150F316', item_description: '3/4" Flange SORF CL150 SS316/SS316L', heat_number: 'A-2211', yom: 2024, original_qty: 25, received_qty: 25, purchase_type: 'regular', supplier_name: 'WMASS GERMANY', stock_receipt_date: '2024-06-10', warehouse_location: 'LN-EC2', mtc_ref: 'MTC-WMASS-A2211.pdf' },
    { id: 'LOT-004', item_id: 'ITEM-003', item_code: 'WSO40150F316', item_description: '1 1/2" Flange SORF CL150 SS316/SS316L', heat_number: 'A-2212', yom: 2025, original_qty: 50, received_qty: 50, purchase_type: 'regular', supplier_name: 'WMASS GERMANY', stock_receipt_date: '2025-02-14', warehouse_location: 'LN-EB1', mtc_ref: 'MTC-WMASS-A2212.pdf' },
    { id: 'LOT-005', item_id: 'ITEM-004', item_code: 'WSO30150F316', item_description: '1 1/4" Flange SORF CL150 SS316/SS316L', heat_number: '980', yom: 2023, original_qty: 25, received_qty: 25, purchase_type: 'regular', supplier_name: 'WMASS GERMANY', stock_receipt_date: '2023-11-05', warehouse_location: 'LN-EB2', mtc_ref: 'MTC-WMASS-980.pdf' },
    { id: 'LOT-006', item_id: 'ITEM-005', item_code: 'EL9050S80WPBBENKAN-STOCK', item_description: 'ELBOW 2", 90DEG, SCH.80, LR, BW, SMLS, ASTM A234 WPB', heat_number: '67C00M083', yom: 2024, original_qty: 210, received_qty: 210, purchase_type: 'regular', supplier_name: 'BENKAN THAILAND', stock_receipt_date: '2024-04-12', warehouse_location: 'LN-AC4', mtc_ref: 'MTC-BENKAN-67C00M083.pdf' },
    { id: 'LOT-007', item_id: 'ITEM-006', item_code: 'EL9080S40WPBBENKAN-STOCK', item_description: 'ELBOW 3", 90DEG, SCH.40, LR, BW, SMLS, ASTM A234 WPB', heat_number: '65P00M036', yom: 2023, original_qty: 27, received_qty: 27, purchase_type: 'regular', supplier_name: 'BENKAN THAILAND', stock_receipt_date: '2023-08-20', warehouse_location: 'LN-AC4', mtc_ref: 'MTC-BENKAN-65P00M036.pdf' },
    { id: 'LOT-008', item_id: 'ITEM-007', item_code: 'WSO80150F316-LOC', item_description: '3" Flange SORF CL150 SS316/SS316L (Item #8 - Local Purchase)', heat_number: 'LOC-A2212-LP', yom: 2026, original_qty: 10, received_qty: 10, purchase_type: 'local_purchase', supplier_name: 'SHREE OILFIELD SUPPLY LLC', l_code: 'L-WSO80150-08', stock_receipt_date: '2026-09-01', warehouse_location: 'LOCAL-BAY-01', mtc_ref: 'SUPPLIER_MTC_SHREE_LOC8.pdf' },
    { id: 'LOT-009', item_id: 'ITEM-008', item_code: 'WSO100150F316-LOC', item_description: '4" Flange SORF CL150 SS316/SS316L (Item #9 - Local Purchase)', heat_number: 'LOC-A2211-LP', yom: 2026, original_qty: 10, received_qty: 10, purchase_type: 'local_purchase', supplier_name: 'PROMAT BD MIDDLE EAST', l_code: 'L-WSO100150-09', stock_receipt_date: '2026-09-15', warehouse_location: 'LOCAL-BAY-02', mtc_ref: 'SUPPLIER_MTC_PROMAT_LOC9.pdf' },
    { id: 'LOT-010', item_id: 'ITEM-009', item_code: 'WN15150S80RFA105SRI-STOCK', item_description: 'FLANGE 1/2", 150#, SCH.80, WNRF, SA105N, ASME B16.5', heat_number: 'SRI2786', yom: 2024, original_qty: 141, received_qty: 141, purchase_type: 'regular', supplier_name: 'SRI FLANGES', stock_receipt_date: '2024-05-18', warehouse_location: 'LN-CB12', mtc_ref: 'MTC-SRI-2786.pdf' },
    { id: 'LOT-011', item_id: 'ITEM-010', item_code: 'WN150150S80RFA105GB-STOCK', item_description: 'WNRF 6", 150#, SCH.80, ASTM A105N, ASME B16.5', heat_number: 'ULMA-8841', yom: 2025, original_qty: 20, received_qty: 20, purchase_type: 'regular', supplier_name: 'ULMA-SPAIN', stock_receipt_date: '2025-03-22', warehouse_location: 'LN-GB04', mtc_ref: 'MTC-ULMA-8841.pdf' },
    { id: 'LOT-012', item_id: 'ITEM-011', item_code: 'CPL253KNPTA105GB-STOCK', item_description: 'FULL COUPLING 1", 3000#, NPT, A105N, ASME B16.11', heat_number: 'MG-9921B', yom: 2024, original_qty: 45, received_qty: 45, purchase_type: 'regular', supplier_name: 'MEGA-ITALY', stock_receipt_date: '2024-07-08', warehouse_location: 'LN-MB02', mtc_ref: 'MTC-MEGA-9921B.pdf' }
  ]

  const { error: lotErr } = await client.from('stock_lots').upsert(lots)
  console.log('Stock Lots:', lotErr ? lotErr.message : `OK (${lots.length} lots)`)

  const balances = [
    { id: 'BAL-001', stock_lot_id: 'LOT-001', physical_qty: 40, reserved_qty: 5, available_qty: 35, dispatched_qty: 10 },
    { id: 'BAL-002', stock_lot_id: 'LOT-002', physical_qty: 38, reserved_qty: 0, available_qty: 38, dispatched_qty: 12 },
    { id: 'BAL-003', stock_lot_id: 'LOT-003', physical_qty: 25, reserved_qty: 0, available_qty: 25, dispatched_qty: 0 },
    { id: 'BAL-004', stock_lot_id: 'LOT-004', physical_qty: 40, reserved_qty: 0, available_qty: 40, dispatched_qty: 10 },
    { id: 'BAL-005', stock_lot_id: 'LOT-005', physical_qty: 20, reserved_qty: 0, available_qty: 20, dispatched_qty: 5 },
    { id: 'BAL-006', stock_lot_id: 'LOT-006', physical_qty: 180, reserved_qty: 15, available_qty: 165, dispatched_qty: 30 },
    { id: 'BAL-007', stock_lot_id: 'LOT-007', physical_qty: 7, reserved_qty: 0, available_qty: 7, dispatched_qty: 20 },
    { id: 'BAL-008', stock_lot_id: 'LOT-008', physical_qty: 10, reserved_qty: 4, available_qty: 6, dispatched_qty: 0 },
    { id: 'BAL-009', stock_lot_id: 'LOT-009', physical_qty: 10, reserved_qty: 0, available_qty: 10, dispatched_qty: 0 },
    { id: 'BAL-010', stock_lot_id: 'LOT-010', physical_qty: 101, reserved_qty: 0, available_qty: 101, dispatched_qty: 40 },
    { id: 'BAL-011', stock_lot_id: 'LOT-011', physical_qty: 14, reserved_qty: 0, available_qty: 14, dispatched_qty: 6 },
    { id: 'BAL-012', stock_lot_id: 'LOT-012', physical_qty: 35, reserved_qty: 0, available_qty: 35, dispatched_qty: 10 }
  ]

  const { error: balErr } = await client.from('stock_balances').upsert(balances)
  console.log('Stock Balances:', balErr ? balErr.message : `OK (${balances.length} balances)`)

  const users = [
    { id: 'USR-001', employee_name: 'Alex Turner (IT Systems Engineer)', email: 'it.engineer@msgoilfield.ae', department: 'IT Systems & Architecture', role: 'it_engineer', account_status: 'Active', password: 'Pass@123', allowed_modules: [] },
    { id: 'USR-002', employee_name: 'Zaid Al-Mansoor (Super Administrator)', email: 'admin@msgoilfield.ae', department: 'Executive Management', role: 'super_admin', account_status: 'Active', password: 'Pass@123', allowed_modules: [] },
    { id: 'USR-003', employee_name: 'Farooq Siddiqui (Inventory Manager)', email: 'inventory@msgoilfield.ae', department: 'Inventory & Procurement', role: 'admin_inventory', account_status: 'Active', password: 'Pass@123', allowed_modules: [] },
    { id: 'USR-004', employee_name: 'Sarah Jenkins (Commercial Sales)', email: 'sales@msgoilfield.ae', department: 'Commercial Sales', role: 'sales_team', account_status: 'Active', password: 'Pass@123', allowed_modules: [] },
    { id: 'USR-005', employee_name: 'Tariq Al-Hashimi (Head Storekeeper)', email: 'store@msgoilfield.ae', department: 'Warehouse & Yard-1', role: 'storekeeper', account_status: 'Active', password: 'Pass@123', allowed_modules: [] },
    { id: 'USR-006', employee_name: 'Eng. Vikram Rao (QA/QC Materials)', email: 'mtc@msgoilfield.ae', department: 'QA/QC Inspection', role: 'mtc_controller', account_status: 'Active', password: 'Pass@123', allowed_modules: [] },
    { id: 'USR-007', employee_name: 'Bilal Qureshi (Dispatch & Fleet)', email: 'dispatch@msgoilfield.ae', department: 'Logistics', role: 'dispatch_team', account_status: 'Active', password: 'Pass@123', allowed_modules: [] }
  ]

  const { error: usrErr } = await client.from('user_profiles').upsert(users)
  console.log('User Profiles:', usrErr ? usrErr.message : `OK (${users.length} users)`)

  console.log('DONE!')
}

main().catch(console.error)
