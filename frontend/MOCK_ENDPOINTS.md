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

## Other Mock-Only Endpoints Table

| Method | Path | Allowed Roles | Request Body | Response Shape | Description |
|---|---|---|---|---|---|
| `GET` | `/billing/invoices` | `owner`, `manager` | None | `[{ id, invoice_no, customer_id, customer_name, amount, tax, total, status, due_date, created_at }]` | List customer billing invoices |
| `POST` | `/billing/invoices` | `owner`, `manager` | `{ customer_id, items: [{ cylinder_type, quantity, unit_price }], due_date? }` | `{ id, invoice_no, customer_id, total, status, created_at }` | Generate a new billing invoice |
| `GET` | `/billing/invoices/{id}` | `owner`, `manager`, `customer` | None | `{ id, invoice_no, customer_id, customer_name, items, total, status, due_date, payments }` | Get full invoice details |
| `GET` | `/payments` | `owner`, `manager` | None | `[{ id, customer_id, customer_name, amount, payment_method, reference, created_at }]` | List recorded customer payments |
| `POST` | `/payments` | `owner`, `manager` | `{ customer_id, amount, payment_method, reference?, note? }` | `{ id, customer_id, amount, created_at }` | Record a customer payment |
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
