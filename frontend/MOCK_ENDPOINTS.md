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

## Other Mock-Only Endpoints Table

| Method | Path | Allowed Roles | Request Body | Response Shape | Description |
|---|---|---|---|---|---|
| `GET` | `/stock/summary` | `owner`, `manager` | None | `{ by_type: { "11.8 kg": { empty, filled }, ... }, total_gas_kg, central_depot }` | Aggregated gas and cylinder stock |
| `GET` | `/stock/purchases` | `owner`, `manager` | None | `[{ id, supplier, cylinder_type, quantity, cost_per_unit, total_cost, invoice_no, created_at }]` | LPG bulk stock purchase records |
| `POST` | `/stock/purchases` | `owner`, `manager` | `{ supplier, cylinder_type, quantity, cost_per_unit, invoice_no? }` | `{ id, supplier, total_cost, created_at }` | Record LPG refill batch purchase |
| `GET` | `/expenses` | `owner`, `manager` | None | `[{ id, category, amount, description, vehicle_id?, actor, created_at }]` | Operational expenses list |
| `POST` | `/expenses` | `owner`, `manager` | `{ category, amount, description, vehicle_id? }` | `{ id, category, amount, created_at }` | Log daily expense (fuel, maintenance) |
| `GET` | `/dashboard/summary` | `owner`, `manager`, `ceo` | None | `{ today_deliveries: { completed, total }, active_cylinders, stock_levels, revenue_today, low_stock_warning }` | High-level operations dashboard KPIs |
| `GET` | `/reports/deliveries` | `owner`, `manager`, `ceo` | Query: `from_date`, `to_date` | `[{ date, completed_deliveries, skipped_deliveries, total_cylinders, total_km }]` | Delivery performance report |
| `GET` | `/reports/revenue` | `owner`, `manager`, `ceo` | Query: `from_date`, `to_date` | `[{ date, revenue_pkr, expenses_pkr, net_margin_pkr }]` | Financial summary report |
| `GET` | `/settings` | `owner` | None | `{ depot: { lat, lon, name }, default_solver_seconds, cylinder_prices, sms_notifications }` | Agency configuration settings |
| `PUT` | `/settings` | `owner` | `{ depot?, default_solver_seconds?, cylinder_prices?, sms_notifications? }` | `{ status: "updated", settings: { ... } }` | Update agency configuration |
| `POST` | `/settings/reset-demo` | `owner` | None | `{ status: "reset_complete" }` | Reset mock database to seed state |
| `GET` | `/customer-portal/summary` | `customer` | None | `{ customer_id, name, balance_due, cylinders_held, last_delivery, pending_orders }` | Customer self-service home summary |
