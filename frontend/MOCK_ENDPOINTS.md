# Gasora Mock Endpoints Specification

This document lists all frontend mock endpoints that are not yet implemented or have extended contracts in the real FastAPI backend. Backend developers can use this table and contract specification to build matching backend endpoints.

## Specification Rules
- All paths are relative to the `/api` prefix (e.g. `/customers` maps to `/api/customers`).
- Keys are formatted in `snake_case`.
- Dates and timestamps are ISO-8601 strings in UTC (`YYYY-MM-DDTHH:mm:ssZ`).
- Amounts and financial figures are stored as integers in Pakistani Rupees (PKR).
- Identifiers are positive integers.
- Authentication uses HTTP Bearer tokens (`Authorization: Bearer <token>`).
- Errors return standard status codes with `{ "detail": "error message" }`.

---

## Customer Module Endpoints (Module 2)

| Method | Path | Allowed Roles | Request Body | Response Shape | Description & Validation |
|---|---|---|---|---|---|
| `GET` | `/customers` | `owner`, `manager` | None | `[{ id, code, name, phone, address, area, lat, lon, demand, customer_type, cylinder_type, deposit, notes, is_active, created_at }]` | List all customer accounts. Returns both active and inactive customers with `is_active` flag. |
| `GET` | `/customers/{id}` | `owner`, `manager` | None | `{ id, code, name, phone, address, area, lat, lon, demand, customer_type, cylinder_type, deposit, notes, is_active, created_at }` | Retrieve single customer by ID. Returns 404 if customer does not exist. |
| `POST` | `/customers` | `owner`, `manager` | `{ name, phone, address?, area?, lat?, lon?, demand?, customer_type?, cylinder_type?, deposit?, notes?, is_active? }` | `{ id, code, name, phone, address, area, lat, lon, demand, customer_type, cylinder_type, deposit, notes, is_active, created_at }` | Register new customer. Auto-assigns formatted `code` (`C0001`...). Requires `name` and `phone` (422 if missing). Returns 201/200. |
| `PUT` | `/customers/{id}` | `owner`, `manager` | `{ name?, phone?, address?, area?, lat?, lon?, demand?, customer_type?, cylinder_type?, deposit?, notes?, is_active? }` | `{ id, code, name, phone, address, area, lat, lon, demand, customer_type, cylinder_type, deposit, notes, is_active, created_at }` | Partial update of customer. **Validation**: An explicit `null` is rejected with `422 Unprocessable Entity` for `name`, `lat`, `lon`, `demand`, `is_active`. Returns 404 if not found. |
| `DELETE` | `/customers/{id}` | `owner`, `manager` | None | `{ status: "ok", id, is_active: false }` | Soft delete customer (`is_active = false`). Row remains in database. Calling delete on an already deactivated customer is idempotent and emits no second audit event. |
| `GET` | `/cylinders?customer_id={id}` | `owner`, `manager` | Query: `customer_id` | `[{ id, serial_no, customer_id, customer_name, cylinder_type, state, owner, created_at }]` | List physical cylinders currently in customer possession. |
| `GET` | `/customers/{id}/deliveries` | `owner`, `manager` | None | `[{ id, customer_id, route_id, driver_name, vehicle_no, cylinder_type, cylinders_delivered, cylinders_collected, delivered_at, interval_days, status, notes }]` | Historical delivery and refill log for customer. |
| `GET` | `/customers/{id}/ledger` | `owner`, `manager`, `customer` | None | `[{ id, customer_id, entry_type, description, debit, credit, balance, created_at }]` | Customer running balance ledger (debits, credits, and deposits). |

---

## Cylinder Register & Empty Recovery Endpoints (Modules 3, 4, 13)

| Method | Path | Allowed Roles | Request Body | Response Shape | Description & Validation Rules |
|---|---|---|---|---|---|
| `GET` | `/cylinders` | `owner`, `manager`, `driver` | Query: `state?`, `owner?`, `customer_id?` | `[{ id, serial_no, cylinder_type, owner, state, customer_id, created_at }]` | Filterable list of registered cylinders. Supports filtering by lifecycle state (`Empty`, `Filled`, `Delivered`, `Recovered`), ownership (`Company`, `Customer`), and holder (`customer_id`). |
| `POST` | `/cylinders` | `owner` only | `{ serial_no, cylinder_type?, owner?, state? }` | `{ id, serial_no, cylinder_type, owner, state, customer_id, created_at }` | Register new cylinder asset. Duplicate serial numbers return `409 Conflict`. Non-owners receive `403 Forbidden`. Serial numbers are stored uppercase. Emits `cylinder_registered` event. |
| `GET` | `/cylinders/{id}` | `owner`, `manager`, `driver` | None | `{ id, serial_no, cylinder_type, owner, state, customer_id, created_at }` | Retrieve single cylinder details by ID. Returns `404 Not Found` if missing. |
| `GET` | `/cylinders/{id}/history` | `owner`, `manager`, `driver` | None | `[{ id, cylinder_id, txn_type, from_state, to_state, customer_id, delivery_id, actor, note, due_date, created_at, event_id }]` | Full chronological audit trail of state transitions, actors, return due dates, and associated delivery/event IDs. |
| `GET` | `/cylinders/summary` | `owner`, `manager` | None | `{ by_state: { Empty, Filled, Delivered, Recovered }, by_owner: { Company, Customer }, held_by_customers: [{ customer_id, name, cylinders }] }` | Four-step lifecycle counts, asset ownership distribution, and held-by-customers breakdown. |
| `POST` | `/cylinders/{id}/transition` | `owner`, `driver`, `manager` (restricted) | `{ to_state, customer_id?, due_date?, note?, delivery_id? }` | `{ id, serial_no, cylinder_type, owner, state, customer_id, created_at }` | Execute lifecycle state transition following `Empty ➔ Filled ➔ Delivered ➔ Recovered ➔ Empty`.<br>**Rules & Validations**:<br>• **Stock moves** (`Empty ➔ Filled`, `Recovered ➔ Empty`) are owner-only. Attempting by driver returns `403 Forbidden`.<br>• Transition to `Delivered`: requires `customer_id` (409 if missing, 404 if customer not found). Defaults `due_date` to today + 15 days; an explicit past date returns `422 Unprocessable Entity`.<br>• Transition to `Recovered`: uses real holder from `cylinder.customer_id`; if `customer_id` is passed and mismatches actual holder, returns `409 Conflict`. Clears `cylinder.customer_id = null`.<br>• Disallowed jumps return `409 Conflict`. Emits `cylinder_transition` audit event. |
| `GET` | `/recovery/ageing` | `owner`, `manager` | None | `{ total_delivered, buckets: { "0-14", "15-29", "30-59", "60-89", "90+" }, cylinders: [...], customers: [...], swap_candidates: [...] }` | **Module 13 Empty Recovery**: Ageing analysis for Delivered cylinders based on days held since delivery. Categorizes into 5 duration buckets, calculates customer security deposit coverage against pending empties, and identifies swap candidates (15+ days held). |

---

## Dispatch & Driver Stop Actions (Modules 9, 11, 18)

> **Note on Backend Alignment**:
> The core dispatch endpoints (`GET /plan/today`, `POST /plan/publish`, `GET /routes`, `PATCH /routes/{route_id}/assign`, `GET /my-routes`, `POST /route-stops/{stop_id}/skip`, `GET /urgent`, `POST /urgent`, and `POST /paths`) are **REAL backend endpoints** matching the FastAPI contracts in `backend/app.py` and `backend/services.py`.
>
> The entry below documents the **extended mock-only contract** for stop completion with physical cylinder tracking:

| Method | Path | Allowed Roles | Request Body | Response Shape | Description & Extended Validation Rules |
|---|---|---|---|---|---|
| `POST` | `/route-stops/{stop_id}/deliver` | `owner`, `driver`, `manager` | `{ cylinders?: int, delivered_cylinder_ids?: int[], empty_cylinder_ids?: int[] }` | `{ ok: true, cylinders_moved: int }` | **Stop Delivery with Cylinder Asset Tracking**:<br>• Accepts optional `delivered_cylinder_ids` and `empty_cylinder_ids`. If neither is provided, performs default stop delivery with `{ cylinders }`.<br>• **Atomic Validation**: Validates that every ID in `delivered_cylinder_ids` exists and is in `Filled` state (`409 Conflict` if invalid). Validates that every ID in `empty_cylinder_ids` exists, is in `Delivered` state, and is currently held by this stop's `customer_id` (`409 Conflict` if invalid). **Rejects entire operation** without moving any cylinders if a single ID is invalid.<br>• **Atomic Transition**: On success, transitions delivered cylinders (`Filled ➔ Delivered`, setting `customer_id`) and collected empties (`Delivered ➔ Recovered`, clearing `customer_id`), records transaction history and audit events, records delivery in deliveries ledger, and returns `cylinders_moved` count. |

---

## Sales, Billing, Payments & Ledger Endpoints (Phase F5 - Modules 5, 14, 15)

> **Money Rules from Proposal**:
> 1. **Append-Only Ledger**: The financial ledger is strictly immutable. No entry may be edited or deleted; errors and adjustments are reconciled strictly by posting an auditable correcting entry (`POST /ledger/correction`) with an explicit reason.
> 2. **Separate Payment at Delivery**: Payment collected upon delivery is recorded as an independent credit entry in the ledger with its own receipt number.
> 3. **Dynamic Running Balance**: Customer account balances are dynamically recomputed from all chronological debit and credit entries (`sum(debit) - sum(credit)`).
> 4. **Unique Invoice & Receipt Sequences**: Invoice numbers (`INV-YYYY-XXXX`) and receipt numbers (`REC-YYYY-XXXX`) are guaranteed unique across all records.
> 5. **Atomic Transactions**: Direct sales atomically update physical cylinders, stock, delivery records, bills, and ledger entries in one operation, rejecting everything if any validation fails.

| Method | Path | Allowed Roles | Request Body | Response Shape | Description & Validation Rules |
|---|---|---|---|---|---|
| `POST` | `/sales` | `owner`, `manager`, `driver` | `{ customer_id, cylinders_delivered, empties_received?, price_per_cylinder?, payment_at_delivery?, cylinder_type?, payment_method?, payment_reference?, notes?, delivered_cylinder_ids?, empty_cylinder_ids? }` | `{ ok, sale_id, invoice_no, customer_id, customer_name, cylinder_type, cylinders_delivered, empties_received, total_amount, payment_at_delivery, balance_due, customer_balance, bill, payment }` | **Atomic Direct Sale, Fill & Delivery Entry**:<br>• Validates customer existence, positive `cylinders_delivered`, and non-negative amounts.<br>• Validates filled stock (or explicit `delivered_cylinder_ids` in `Filled` state) and customer-held empties (or explicit `empty_cylinder_ids` in `Delivered` state).<br>• **Atomic update**: Transitions delivered cylinders (`Filled ➔ Delivered`), empties (`Delivered ➔ Recovered`), records delivery, generates unique `INV-YYYY-XXXX`, appends debit to ledger, and if `payment_at_delivery > 0`, issues receipt `REC-YYYY-XXXX` and appends separate credit entry to ledger.<br>• Rejects entire transaction without state mutation on any error. |
| `GET` | `/bills` *(alias: `/billing/invoices`)* | `owner`, `manager`, `customer` | Query: `customer_id?`, `month?` *(YYYY-MM)*, `status?` *('paid'\|'partial'\|'unpaid'\|'all')* | `[{ id, invoice_no, customer_id, customer_name, customer_code, customer_phone, customer_area, bill_type, items, subtotal, tax, total, paid_amount, balance_due, status, due_date, created_at, notes }]` | List billing invoices filtered by month, status, or customer account. Sorted newest first. Customers can only view their own bills. |
| `POST` | `/bills` *(alias: `/billing/invoices`)* | `owner`, `manager` | `{ customer_id, bill_type?, period_month?, period_start?, period_end?, items: [{ cylinder_type, quantity, unit_price }], paid_amount?, due_date?, notes? }` | `{ id, invoice_no, customer_id, customer_name, items, total, paid_amount, balance_due, status, due_date, created_at }` | **Issue Monthly / Custom Range Bill**:<br>• Validates customer and line items (quantities > 0, unit rates >= 0).<br>• Generates unique invoice number (`INV-2026-0001`).<br>• Appends Debit entry for full invoice amount to customer ledger.<br>• If initial payment provided, records payment and appends separate Credit entry. |
| `GET` | `/bills/{id}` *(alias: `/billing/invoices/{id}`)* | `owner`, `manager`, `customer` | None | `{ id, invoice_no, customer_id, customer_name, customer_phone, customer_area, items, subtotal, tax, total, paid_amount, balance_due, status, due_date, created_at, notes, payments: [...], customer_balance }` | Retrieve full printable invoice voucher details with line items, recorded receipt payments, and current account balance. |
| `GET` | `/payments` | `owner`, `manager`, `customer` | Query: `customer_id?`, `bill_id?` | `[{ id, receipt_no, bill_id, invoice_no, customer_id, customer_name, amount, payment_method, reference, notes, created_at, created_by }]` | List recorded payment receipts. Supports filtering by customer or bill ID. |
| `POST` | `/payments` | `owner`, `manager`, `driver` | `{ customer_id, bill_id?, amount, payment_method?, reference?, notes?, date? }` | `{ ok: true, payment: { id, receipt_no, ... }, receipt_no, bill, customer_balance }` | **Record Customer Payment**:<br>• Validates customer existence and `amount > 0`. Partial payments fully supported.<br>• If `bill_id` specified, updates bill `paid_amount`, `balance_due`, and `status` (`paid` or `partial`).<br>• Issues unique receipt number (`REC-2026-0001`).<br>• Appends separate Credit entry to immutable ledger.<br>• Recomputes running balance for customer account. |
| `GET` | `/ledger` | `owner`, `manager`, `customer` | Query: `customer_id?`, `entry_type?` *('invoice'\|'payment'\|'deposit'\|'correction')* | `[{ id, customer_id, customer_name, entry_type, reference_no, bill_id, description, reason?, debit, credit, balance, created_at, created_by }]` | **Append-Only Financial Ledger**:<br>• Returns chronological entries with dynamically calculated running balance column.<br>• If `customer_id` passed, returns customer statement ledger.<br>• If omitted, returns multi-customer ledger with per-customer running balance calculation. |
| `POST` | `/ledger/correction` | `owner`, `manager` | `{ customer_id, reason, correction_type: 'credit'\|'debit', amount, reference_no?, corrected_entry_id? }` | `{ ok: true, entry: { id, reference_no, ... }, reference_no, customer_balance }` | **Post Correcting Entry (Append-Only Reconcile)**:<br>• **Mandatory Rule**: `reason` string is strictly required for audit integrity (422 if empty).<br>• Never modifies or deletes any historical entry.<br>• Appends new line item (`entry_type: 'correction'`, ref `CORR-2026-0001`) with debit or credit amount.<br>• Recomputes customer balance dynamically. |
| `GET` | `/billing/loans` *(alias: `/billing/ageing`)* | `owner`, `manager`, `ceo` | Query: `include_all?` *(boolean)* | `{ summary: { total_receivables, debtor_count, overdue_30_days, overdue_60_days, overdue_90_days, unsecured_risk }, customers: [{ customer_id, code, name, phone, area, total_balance, deposit, unsecured_risk, ageing: { current, days_31_60, days_61_90, days_90_plus }, unpaid_bills_count, last_payment_date }] }` | **Customer Debt & Receivables Ageing**:<br>• Computes total outstanding debt across customers with breakdown into 4 ageing buckets (0-30d, 31-60d, 61-90d, 90+d).<br>• Calculates unsecured exposure (`total_balance - deposit`).<br>• Sorted highest outstanding balance first. |
| `GET` | `/billing/statements/{customer_id}` | `owner`, `manager`, `customer` | None | `{ customer, statement_date, deposit_held, current_balance, ledger: [...], unpaid_bills: [...] }` | **Printable Statement of Account**:<br>• Complete account statement with customer details, deposit held, chronological ledger entries with running balance, and unpaid invoices. Suitable for `window.print()` and WhatsApp sharing. |

---

## Purchases & Stock Endpoints (Phase F6 - Module 12)

> **Stock & Procurement Rules**:
> 1. **Automatic Stock Rise**: Saving a purchase (`POST /stock/purchases`) automatically rises available depot stock. Existing depot empties/recovered cylinders are transitioned to `Filled`. If the purchased quantity exceeds available empties, new `Filled` cylinder assets are automatically registered in `db.cylinders` so physical stock counts increment immediately.
> 2. **Manager / Owner Verification**: Only users with role `owner` or `manager` may verify a purchase order. Non-manager/owner roles receive `403 Forbidden`.
> 3. **Verification Edit Lock**: Once verified (`purchase.verified === true`), a purchase is permanently locked. Any subsequent edit attempt via `PUT /stock/purchases/{id}` is rejected with `409 Conflict`.
> 4. **Safety Stock Thresholds**: Depot stock levels are monitored against configurable low-stock thresholds per cylinder specification (`GET/PUT /settings/stock`), triggering visible low-stock alerts when `filled <= threshold`.

| Method | Path | Allowed Roles | Request Body | Response Shape | Description & Validation Rules |
|---|---|---|---|---|---|
| `GET` | `/stock/summary` | `owner`, `manager` | None | `{ by_type: { "11.8 kg": { filled, empty, delivered, total, low_stock, threshold }, ... }, total_filled, total_empty, total_delivered, total_cylinders, low_stock_count, low_stock_types, has_low_stock }` | **Depot Stock Summary & Health**:<br>• Returns aggregated cylinder inventory breakdown per specification across all lifecycle states.<br>• Compares `filled` stock against safety thresholds (`/settings/stock`).<br>• Flags `has_low_stock` and lists `low_stock_types` for warning banners. |
| `GET` | `/stock/movements` | `owner`, `manager` | Query: `limit?` *(default 50)*, `type?` | `[{ id, cylinder_id, serial_no, cylinder_type, txn_type, from_state, to_state, actor, note, created_at }]` | **Inventory Movement History**:<br>• Chronological audit log of physical stock movements, refill purchases, sales dispatches, and empty recoveries.<br>• Supports filtering by cylinder type. |
| `GET` | `/stock/purchases` *(alias: `/purchases`)* | `owner`, `manager` | Query: `search?`, `item?`, `verified?` *('all'\|'verified'\|'unverified')*, `vendor?` | `[{ id, vendor, item, cylinder_type, quantity, unit_cost, total_cost, date, invoice_no, verified, verified_by, verified_at, notes, created_at, created_by }]` | **Procurement History & Orders**:<br>• List bulk LPG purchase orders with vendor search and verification status filters.<br>• Sorted newest first. |
| `POST` | `/stock/purchases` *(alias: `/purchases`)* | `owner`, `manager` | `{ vendor, item, quantity, unit_cost, date?, invoice_no?, notes? }` | `{ id, vendor, item, cylinder_type, quantity, unit_cost, total_cost, date, invoice_no, verified: false, verified_by: null, verified_at: null, notes, created_at, created_by }` | **Record Purchase & Automatic Stock Rise**:<br>• Requires `vendor`, `item`, positive integer `quantity`, and non-negative `unit_cost` (422 if invalid).<br>• Computes `total_cost = quantity * unit_cost`.<br>• **Automatic Stock Rise**: Transitions depot `Empty` cylinders to `Filled`, or registers new `Filled` cylinder assets if purchase exceeds available empties.<br>• Logs `refill_purchase` audit history. Defaults `verified: false`. |
| `PUT` | `/stock/purchases/{id}` *(alias: `/purchases/{id}`)* | `owner`, `manager` | `{ vendor?, item?, quantity?, unit_cost?, date?, invoice_no?, notes? }` | `{ id, vendor, item, cylinder_type, quantity, unit_cost, total_cost, date, invoice_no, verified, verified_by, verified_at, notes, created_at, created_by }` | **Edit Unverified Purchase**:<br>• Updates purchase details and recalculates `total_cost`.<br>• **Lock Rule**: If `verified === true`, rejects with `409 Conflict` ("Verified purchases are locked and cannot be edited"). Returns 404 if not found. |
| `POST` | `/stock/purchases/{id}/verify` *(alias: `/purchases/{id}/verify`)* | `owner`, `manager` only | None | `{ ok: true, purchase: { id, verified: true, verified_by, verified_at, ... } }` | **Manager Verification Action**:<br>• Restricted strictly to `owner` and `manager` roles (`403 Forbidden` for drivers).<br>• Sets `verified = true`, stamps `verified_by` and `verified_at`.<br>• Permanently locks purchase against future modifications. |
| `GET` | `/settings/stock` | `owner`, `manager` | None | `{ thresholds: { "11.8 kg": int, "15 kg": int, "45.4 kg": int } }` | Retrieve low-stock safety threshold levels per cylinder specification. |
| `PUT` | `/settings/stock` | `owner`, `manager` | `{ thresholds: { "11.8 kg"?: int, "15 kg"?: int, "45.4 kg"?: int } }` | `{ ok: true, thresholds: { ... } }` | Update low-stock safety alert thresholds. Validates values are non-negative integers (422 if invalid). |

---

## Operating Expenses Endpoints (Phase F6 - Module 16)

> **Expense Management Rules**:
> 1. **Categorization**: All expenses must be categorized under one of the 5 canonical categories: `fuel`, `rent`, `repair`, `salary`, or `other`.
> 2. **Real-Time Aggregations**: `/expenses` returns both filtered expense logs and pre-calculated aggregations (category breakdown, daily totals, monthly totals) for instant Recharts bar chart rendering.
> 3. **Fuel Cost Benchmark (Modelled)**: `/expenses/fuel-estimate` computes benchmark diesel costs based on actual dispatch route kilometres (`route_km / 7.5 km/L * PKR 280/L`) and is clearly labelled with `is_estimate: true`, explicit estimate tagging, and variance comparison against actual fuel expenses.

| Method | Path | Allowed Roles | Request Body | Response Shape | Description & Validation Rules |
|---|---|---|---|---|---|
| `GET` | `/expenses` | `owner`, `manager` | Query: `category?` *('fuel'\|'rent'\|'repair'\|'salary'\|'other'\|'all')*, `from_date?`, `to_date?`, `search?` | `{ expenses: [{ id, category, amount, date, note, created_by, created_at }], totals: { total, by_category: { fuel, rent, repair, salary, other }, daily: { [date]: amount }, monthly: { [month]: amount } } }` | **Operating Expenses & Totals**:<br>• Returns filtered expense records sorted newest first.<br>• Includes calculated `totals` object with category subtotals, daily aggregates, and monthly aggregates. |
| `POST` | `/expenses` | `owner`, `manager` | `{ category, amount, date?, note? }` | `{ id, category, amount, date, note, created_by, created_at }` | **Log Operational Expense**:<br>• Validates category is one of `fuel`, `rent`, `repair`, `salary`, `other` (422 if invalid).<br>• Validates `amount > 0` (422 if missing or non-positive).<br>• Defaults `date` to current local date (`YYYY-MM-DD`). |
| `GET` | `/expenses/fuel-estimate` | `owner`, `manager` | None | `{ estimated_fuel_cost_pkr, total_route_km, active_routes_count, rate_per_liter_pkr, km_per_liter, actual_fuel_expenses_pkr, label, formula, is_estimate: true, disclaimer }` | **Modelled Route Fuel Benchmark (Clearly Labelled Estimate)**:<br>• Calculates total route kilometres from published delivery routes in dispatch module (falls back to 33.2 km baseline).<br>• Evaluates consumption at 7.5 km/L and PKR 280/L diesel rate.<br>• Explicitly identifies response as an estimate with disclaimer and compares against actual logged fuel expenses. |

---

## Executive Dashboard Endpoints (Phase F7 - Module 10)

> **Dashboard Integrity Rules**:
> 1. **Live Computed from Mock Tables**: All dashboard sales, expenses, net profit, loans/receivables, and cylinder stock counts are computed dynamically from `db.bills`, `db.expenses`, `db.customers`, and `db.cylinders` so numbers agree with other screens.
> 2. **Routific Logistics Benchmark**: Planned versus actual route execution minutes track driver schedule adherence, variance, and on-time percentages inspired by Routific analytics.
> 3. **Demo Data Tagging**: Engine indicators and simulated rates are explicitly flagged as demo placeholders.

| Method | Path | Allowed Roles | Request Body | Response Shape | Description & Validation Rules |
|---|---|---|---|---|---|
| `GET` | `/dashboard/summary` | `owner`, `manager`, `ceo` | None | `{ as_of, sales: { total, current_period, previous_period, change_pct, trend, total_paid }, expenses: { total, current_period, previous_period, change_pct, trend, by_category }, profit: { net_profit, current_period, previous_period, margin_pct, change_pct, trend }, loans: { total_receivables, debtor_count, overdue_30_days, overdue_60_days, overdue_90_days, unsecured_risk, ageing_breakdown }, stock: { total_cylinders, filled, empty, delivered, low_stock_count, has_low_stock, by_type }, risk: { counts, total_customers, top_risks }, runouts: { active_urgent, total_urgent, runouts_per_100_customer_months, disclaimer }, kilometres: { daily, total_km_30d, avg_km_per_day, trend }, planned_vs_actual: { summary, routes, daily_trends, design_reference }, financial_trends }` | **Executive Operations Dashboard Summary**:<br>• Dynamic computation of total sales, revenue collected, and period-over-period growth.<br>• Real-time operating expenses with category distribution.<br>• Net profit and operating profit margins.<br>• Customer receivables ageing and unsecured credit risk.<br>• Depot stock health across 3 cylinder specifications with low-stock warnings.<br>• Customer depletion risk profile (Normal, High, Critical, Urgent) with top risk list.<br>• 30-day fleet travel distance timeline.<br>• **Routific Design Reference**: Planned vs actual route minutes, net variance, and driver on-time rates. |

---

## Business Intelligence & Reports Endpoints (Phase F7 - Module 10)

> **Reporting Rules**:
> 1. **Six Canonical Reports**: Supports `sales`, `expenses`, `loans`, `stock`, `deliveries`, and `empties_ageing`.
> 2. **Date Range Filtering**: Invoices, expenses, and deliveries filter by `from_date` and `to_date`.
> 3. **Search & Aggregations**: Every report returns a pre-aggregated `summary` object alongside tabular `rows` for instant KPI tile preview, CSV export, and print formatting.

| Method | Path | Allowed Roles | Request Body | Response Shape | Description & Supported Reports |
|---|---|---|---|---|---|
| `GET` | `/reports/{type}` *(alias: `/reports?type={type}`)* | `owner`, `manager`, `ceo` | Query: `from_date?`, `to_date?`, `search?` | `{ type, title, rows: [...], summary: { ... } }` | **Multi-Domain Report Generation**:<br>• `type='sales'`: Sales and invoice records with quantities, totals, payments, and balances.<br>• `type='expenses'`: Operating expense logs categorized by fuel, rent, salary, repairs, other.<br>• `type='loans'`: Customer debt ageing (0-30d, 31-60d, 61-90d, 90+d) and deposit coverage.<br>• `type='stock'`: Depot cylinder inventory counts and safety stock alert status.<br>• `type='deliveries'`: Completed delivery and refill logs with interval days.<br>• `type='empties_ageing'`: Empty cylinder retention duration buckets (0-14, 15-29, 30-59, 60-89, 90+ days) and swap candidates. |

---

## Route Policy & Algorithm Evaluation Endpoints (Phase F7 - Module 17)

> **Evaluation Benchmarking Protocol**:
> 1. **Strictly Demo Data Placeholders**: Every figure is generated from synthetic simulation runs. It is explicitly labeled "Demo data" and never claims or guarantees real-world savings.
> 2. **Four Evaluated Policies**: Compares **P1 Reactive** (customer calls after running out), **P2 Average-Days** (fixed cyclic schedule), **P3 Gasora Risk** (Bayesian predictive risk + dynamic routing), and **Ablation** (routing only without risk uncertainty).
> 3. **Paired-Seeds Protocol**: Evaluated across 50 paired random simulation seeds over 180 simulated operating days in Faisalabad geography with identical customer demand sequences for fair comparison.

| Method | Path | Allowed Roles | Request Body | Response Shape | Description & Metrics |
|---|---|---|---|---|---|
| `GET` | `/evaluation/results` *(alias: `/evaluation`)* | `owner`, `ceo`, `manager` | None | `{ title, label: "Demo data", paired_seeds_explanation, disclaimer, simulation_parameters, policies: [{ id, code, name, category, badge, description, runouts_per_100_customer_months, km_per_delivery, total_km, early_deliveries_pct, customer_days_without_gas, interval_range, color, is_gasora }], chart_data }` | **Four-Policy Algorithm Evaluation Benchmark**:<br>• Returns comparative metrics for P1, P2, P3, and Ablation.<br>• **Metrics**: Run-outs per 100 customer-months, kilometres per delivery, total kilometres, early deliveries percentage, customer-days without gas, and interval ranges.<br>• Includes paired-seeds explanation line, simulation parameter metadata, and Recharts bar chart datasets.<br>• All figures explicitly marked `Demo data`. |

---

## Other Mock-Only Endpoints Table

| Method | Path | Allowed Roles | Request Body | Response Shape | Description |
|---|---|---|---|---|---|
| `GET` | `/settings` | `owner` | None | `{ depot: { lat, lon, name }, default_solver_seconds, cylinder_prices, sms_notifications }` | Agency configuration settings |
| `PUT` | `/settings` | `owner` | `{ depot?, default_solver_seconds?, cylinder_prices?, sms_notifications? }` | `{ status: "updated", settings: { ... } }` | Update agency configuration |
| `POST` | `/settings/reset-demo` | `owner` | None | `{ status: "reset_complete" }` | Reset mock database to seed state |
| `GET` | `/customer-portal/summary` | `customer` | None | `{ customer_id, name, balance_due, cylinders_held, last_delivery, pending_orders }` | Customer self-service home summary |
---

## Role-Based Customer App, Manager View & CEO View Endpoints (Phase F8 - Module 18, Roles in 6.3)

> **Role Isolation & Security Rules**:
> 1. **Customer Self-Service Isolation**: A customer can only read and write its own data. All customer operations use the `/me/*` namespace. Attempting to call non-customer administrative endpoints (such as `/customers`, `/cylinders`, `/routes`, `/sales`, `/stock/purchases`, `/expenses`, `/dashboard/summary`, `/users`, or `/settings`) returns `403 Forbidden`.
> 2. **Manager Scope Limits (Proposal 6.3)**: Manager endpoints reuse sales entry (`POST /sales`), purchases with verification (`GET/POST /stock/purchases`, `POST /stock/purchases/{id}/verify`), and operating expenses (`GET/POST /expenses`). Customer management is strictly **read-only** (`GET /customers`, `GET /customers/{id}`; attempts to call `POST/PUT/DELETE /customers` return `403 Forbidden`). System configuration (`/settings`, `/settings/stock`) and user access management (`/users`) return `403 Forbidden`.
> 3. **CEO Read-Only Governance**: The CEO role has read-only visibility over executive summaries (`GET /dashboard/summary`), multi-domain reports (`GET /reports/*`), and route algorithm evaluations (`GET /evaluation/results`). Mutating endpoints return `403 Forbidden`.
> 4. **Routific Customer Delivery Tracking Protocol**: Customer delivery status provides a 3-step progress model (Planned ➔ On the way ➔ Delivered) with exact stop sequence relative to preceding deliveries (e.g. "3 stops before you"). An honest disclaimer states that no live driver GPS location is tracked.
> 5. **Urgent Request Priority**: Customer refill requests marked as `urgent` are displayed in red in the UI with a mandatory line explaining that urgent requests are planned first by the OR-Tools routing engine, and are automatically queued with highest penalty in the planning solver.

### Customer Self-Service Endpoints (`/me/*`)

| Method | Path | Allowed Roles | Request Body | Response Shape | Description & Business Rules |
|---|---|---|---|---|---|
| `GET` | `/me/orders` | `customer` only | None | `[{ id, order_no, type: "normal"\|"urgent", cylinders, cylinder_type, status: "pending"\|"in_route"\|"delivered", note, created_at, delivered_at }]` | **Customer Order History**:<br>• Returns all past and active refill orders for the authenticated customer account.<br>• Non-customer roles receive `403 Forbidden`. Sorted newest first. |
| `GET` | `/me/bills` | `customer` only | None | `[{ id, invoice_no, customer_id, customer_name, bill_type, items: [{ cylinder_type, quantity, unit_price }], total, paid_amount, balance_due, status: "paid"\|"partial"\|"unpaid", due_date, created_at, notes }]` | **Customer Invoices**:<br>• Filtered strictly to invoices matching `user.customer_id`.<br>• Cannot view other accounts' billing documents. Sorted newest first. |
| `GET` | `/me/balance` | `customer` only | None | `{ customer_id, customer_code, customer_name, customer_type, cylinder_type, balance, deposit, total_invoiced, total_paid, unpaid_bills_count, last_payment: { receipt_no, amount, date } }` | **Customer Balance & Credit Overview**:<br>• Running balance dynamically computed from ledger debits and credits.<br>• Shows security deposit held for cylinder collateral and last receipt payment details. |
| `GET` | `/me/next-delivery` | `customer` only | None | `{ scheduled, is_today, expected_date, window, cylinders, cylinder_type, status, driver_name, driver_phone, vehicle_no, depletion_band, is_urgent }` | **Expected Next Refill**:<br>• Evaluates current day's active published routes for a scheduled stop.<br>• If not scheduled today, returns next planning cycle estimate and delivery window. |
| `GET` | `/me/delivery-status` | `customer` only | None | `{ has_active_delivery, status: "planned"\|"on_the_way"\|"delivered", step: 1\|2\|3, status_title, status_description, stops_before_you, position_text, stop_sequence, total_stops, driver_name, driver_phone, vehicle_no, cylinders, cylinder_type, delivery_address, area, is_urgent, has_live_location: false, live_location_note, timeline: [{ step, label, completed, current }] }` | **Routific Customer Delivery Tracking Page**:<br>• **3-Step Progress**: `1: Planned`, `2: On the way` (route published & driver assigned), `3: Delivered`.<br>• **Stop Position**: Calculates pending stops ahead on vehicle route (e.g. `"3 stops before you"`, `"1 stop before you"`, or `"You are the next stop!"`).<br>• **Honest Note**: `has_live_location: false` with explicit disclaimer that real-time GPS tracking is not broadcast and estimates update honestly as stops are completed. |
| `POST` | `/me/requests` | `customer` only | `{ request_type: "normal"\|"urgent", cylinders?: int, note?: string }` | `{ id, request_no, customer_id, customer_name, request_type, cylinders, cylinder_type, note, status: "pending", created_at, delivered_at: null }` | **Place Cylinder Refill Request**:<br>• Validates `request_type` in `['normal', 'urgent']` (defaults to normal).<br>• Quantities validated between 1 and 20 cylinders.<br>• **Urgent Priority**: When `request_type === 'urgent'`, adds to `urgent_requests` for high-penalty OR-Tools engine planning.<br>• Emits `customer.request_created` audit event. |

### Manager Role Endpoints & Limit Matrix

| Method | Path | Manager Access | Description & Limit Rules |
|---|---|---|---|
| `POST` | `/sales` | **Allowed** | Direct sales entry and delivery record creation. |
| `GET` | `/stock/purchases` | **Allowed** | View LPG procurement orders and batch history. |
| `POST` | `/stock/purchases` | **Allowed** | Record new bulk LPG purchase orders with automatic stock rise. |
| `POST` | `/stock/purchases/{id}/verify` | **Allowed** | Verify and permanently lock purchase batches. |
| `GET` | `/expenses` | **Allowed** | View operating expense records and category aggregations. |
| `POST` | `/expenses` | **Allowed** | Record daily operating expenses (fuel, rent, repair, salary, other). |
| `GET` | `/customers` | **Allowed (Read Only)** | Browse customer directory accounts and delivery profiles. |
| `GET` | `/customers/{id}` | **Allowed (Read Only)** | Inspect individual customer account, ledger, and cylinders. |
| `POST/PUT/DELETE` | `/customers` | **403 Forbidden** | Proposal limit: Manager cannot create, edit, or deactivate customer accounts. |
| `GET/PUT` | `/settings` | **403 Forbidden** | Proposal limit: Agency configuration settings are owner-only. |
| `GET/PUT` | `/settings/stock` | **403 Forbidden** | Proposal limit: Safety threshold settings are owner-only. |
| `GET/POST` | `/users` | **403 Forbidden** | Proposal limit: User account provisioning is owner-only. |

### CEO Role Endpoints & Limit Matrix

| Method | Path | CEO Access | Description & Read-Only Governance |
|---|---|---|---|
| `GET` | `/dashboard/summary` | **Allowed (Read Only)** | Phone-first executive dashboard: sales, net profit, stock health, and engine results. |
| `GET` | `/reports/{type}` | **Allowed (Read Only)** | Multi-domain reporting across sales, expenses, loans, stock, deliveries, and ageing. |
| `GET` | `/evaluation/results` | **Allowed (Read Only)** | Four-policy algorithm evaluation benchmark (P1, P2, P3, Ablation). |
| `POST/PUT/DELETE` | *All Mutating Endpoints* | **403 Forbidden** | CEO view is strictly read-only for audit and governance. No data mutation permitted. |
