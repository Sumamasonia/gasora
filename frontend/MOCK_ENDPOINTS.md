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
| `GET` | `/cylinders?customer_id={id}` | `owner`, `manager` | Query: `customer_id` | `[{ id, serial_number, customer_id, customer_name, cylinder_type, status, delivered_at, days_held, tare_weight_kg, last_inspected }]` | List physical cylinders currently in customer possession. |
| `GET` | `/customers/{id}/deliveries` | `owner`, `manager` | None | `[{ id, customer_id, route_id, driver_name, vehicle_no, cylinder_type, cylinders_delivered, cylinders_collected, delivered_at, interval_days, status, notes }]` | Historical delivery and refill log for customer. |
| `GET` | `/customers/{id}/ledger` | `owner`, `manager`, `customer` | None | `[{ id, customer_id, entry_type, description, debit, credit, balance, created_at }]` | Customer running balance ledger (debits, credits, and deposits). |

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
