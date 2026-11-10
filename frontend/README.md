# Gasora Frontend

Gasora is a web-based delivery planning and operational management system for an LPG (liquefied petroleum gas) cylinder distribution agency in Faisalabad, Pakistan.

The frontend is built with **React 19** and **Vite**, using clean vanilla CSS design tokens, responsive layout architecture (tested across 360px phones, 768px tablets, and 1280px+ desktop displays), and zero bulky UI component or icon dependencies.

---

## Quick Start

### 1. Run with the Real API
When running alongside the real FastAPI backend on port 8000:

```bash
# Terminal 1: Backend
cd backend
python -m uvicorn app:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```

The Vite dev server starts at `http://localhost:5173`. Requests made to `/api/*` are proxied directly to `http://127.0.0.1:8000` (see `vite.config.js`).

When `VITE_USE_MOCK` is not set or set to `false`, the frontend connects directly to the real backend. Any screen requesting an endpoint that is not yet implemented on the backend will gracefully display a `<NotReady />` banner naming the missing endpoint.

### 2. Run the Demo (No Backend Required)
To run the full application with a complete in-memory mock backend and persistent local database:

```bash
cd frontend
npm run demo
```

This starts Vite with `--mode demo`, activating `VITE_USE_MOCK=true`. All 18 application screens are fully functional, interactive, and populated with realistic data.

You can also build and preview the production demo bundle:
```bash
npm run build:demo
npm run preview
```

---

## Roles & Mock Logins

In demo mode (`npm run demo`), quick auto-fill login buttons appear directly on the login screen for each of the five system roles:

| Role | Username | Password | Screen & Capabilities |
|---|---|---|---|
| **Owner** | `owner` | `owner-demo-123` | Full access to dispatch map, solvers, cylinder lifecycle register, empty recovery, billing, immutable ledger, stock, expenses, reports, system audit, users & settings. |
| **Driver** | `driver1` | `driver-demo-123` | Standalone phone-first delivery checklist (`DriverView.jsx`). View assigned route stops, mark deliveries, exchange empty cylinders, report partial deliveries, and call customer. |
| **Manager** | `manager1` | `manager-demo-123` | Daily depot operations (`AppShell.jsx`). Manage customers, record sales, verify bulk refill purchase orders, track cylinder movements, record expenses, view stock alerts. |
| **Customer** | `customer1` | `customer-demo-123` | Standalone mobile-optimized customer portal (`CustomerApp.jsx`). Track expected delivery window, view consumption history, review monthly bills, and request emergency refills. |
| **CEO** | `ceo1` | `ceo-demo-123` | Standalone executive dashboard (`CeoView.jsx`). Real-time operations briefing, depot stock balances, revenue KPIs, delivery performance metrics, and immutable audit logs. |

---

## How Mock Mode Works

The application implements a zero-leak mock boundary:

1. **Centralized Boundary**: All network communication in the application passes through `src/api.js`. No page or UI component imports from `src/mock/`.
2. **Mock Router**: When `VITE_USE_MOCK=true` (in `src/config.js`), `src/api.js` delegates requests to `src/mock/router.js`.
3. **Realistic Latency**: Every mock request simulates network conditions with an asynchronous delay (150–400ms).
4. **Realistic Seed Data**: `src/mock/db.js` seeds 60 authentic Faisalabad customers distributed across 10 commercial and residential areas (D-Ground, Peoples Colony, Madina Town, Gulberg, Ghulam Muhammad Abad, etc.), realistic cylinder serial numbers, vehicles, delivery routes, and ledger entries.
5. **Persistence**: In demo mode, all mutations (creating customers, dispatching cylinders, recording sales, logging expenses, adding users) are persisted in `localStorage` under `gasora_mock_db_v1`. You can refresh the page without losing state, or click the **Reset Mock DB** button in the top bar to restore clean initial seed data.
6. **Authentication & Session Expiry**: Mock tokens simulate JWT Bearer authentication with role permissions and automatic 401 handling, returning to the login screen with `"Your session ended. Please sign in again."`.

---

## Application Structure

```
frontend/
├── .env.demo                     # Sets VITE_USE_MOCK=true for demo runs
├── .env.example                  # Template with VITE_USE_MOCK=false
├── MOCK_ENDPOINTS.md             # Complete specification of all mock endpoints for backend team
├── README.md                     # This frontend developer & handover guide
├── package.json                  # Scripts and dependencies (React 19, Leaflet, Recharts, Vite)
├── vite.config.js                # Vite development server and /api proxy configuration
└── src/
    ├── api.js                    # Central API client, 401 interception, and ApiError class
    ├── App.jsx                   # Root application shell, auth router, role routing, demo logins
    ├── colors.js                 # Risk bands, vehicle colors, and status tokens
    ├── config.js                 # USE_MOCK configuration switch (reads import.meta.env)
    ├── DriverView.jsx            # Standalone driver stop checklist screen (phone-first)
    ├── main.jsx                  # React application entrypoint
    ├── nav.js                    # Sidebar navigation hierarchy and role permissions
    ├── OwnerPanels.jsx           # Dispatch drawer panels (urgent requests, stop info, ETA)
    ├── OwnerView.jsx             # Dispatch planner, routes, solver controls, Leaflet map
    ├── PlanMap.jsx               # Interactive Leaflet map with depot, routes, and stops
    ├── RiskList.jsx              # Customer demand and risk ranking list
    ├── styles.css                # Global CSS design tokens, typography, dark/light themes
    ├── ui.jsx                    # Shared risk badges and urgent tags
    ├── components/               # Reusable design system components
    │   ├── AppShell.jsx          # Collapsible responsive sidebar, top navigation, theme toggle
    │   ├── ComingSoon.jsx        # Fallback screen for unassigned routes
    │   ├── components.css        # Styles for modals, tables, forms, toasts, tiles
    │   ├── DataTable.jsx         # Responsive table with search, sorting, and pagination
    │   ├── EmptyState.jsx        # Empty state illustration and call to action
    │   ├── FormField.jsx         # Form field label, helper text, and error wrapper
    │   ├── KpiTile.jsx           # Metric summary card with trends and indicators
    │   ├── Modal.jsx             # Accessible modal dialog with focus management & Esc support
    │   ├── NotReady.jsx          # Missing backend endpoint warning component
    │   ├── shell.css             # Styles for application shell, sidebar, and layout
    │   ├── Skeleton.jsx          # Pulse placeholder for loading states
    │   ├── Spinner.jsx           # Accessible loading indicator
    │   └── Toast.jsx             # Toast notification provider and hook
    ├── lib/                      # Core helpers
    │   ├── csv.js                # Browser CSV export utility
    │   ├── permissions.js        # System modules and role permission assignments
    │   └── useHashRoute.js       # Lightweight hash router hook (#/customers, etc.)
    ├── pages/                    # Application screens grouped by functional module
    │   ├── UiKit.jsx             # Design system showcase (`#/uikit`)
    │   ├── admin/                # Admin & settings screens
    │   │   ├── admin.css         # Styles for users, audit, settings, assistant
    │   │   ├── AssistantPage.jsx # Natural language AI assistant demo (`#/assistant`)
    │   │   ├── AuditPage.jsx     # SHA-256 verifiable tamper-evident audit log (`#/audit`)
    │   │   ├── SettingsPage.jsx  # System configurations & business parameters (`#/settings`)
    │   │   ├── UsersPage.jsx     # User management & granular permissions (`#/users`)
    │   │   └── UtilitiesPage.jsx # Dispatch notes & operations log (`#/utilities`)
    │   ├── billing/              # Money, billing, and ledger screens
    │   │   ├── billing.css       # Styles for invoices, ledger, payments, loans
    │   │   ├── BillsList.jsx     # Invoices and bills directory (`#/billing`)
    │   │   ├── CreateBillModal.jsx # New bill generation modal dialog
    │   │   ├── CustomerStatementModal.jsx # Printable customer statement of account
    │   │   ├── InvoiceView.jsx   # Printable invoice voucher (`#/billing/invoice/:id`)
    │   │   ├── LedgerCorrectionModal.jsx # Append-only correcting ledger entry dialog
    │   │   ├── LedgerPage.jsx    # Append-only multi-customer financial ledger (`#/ledger`)
    │   │   ├── LoansPage.jsx     # Customer debt and 30/60/90-day ageing (`#/billing/loans`)
    │   │   ├── PaymentsPage.jsx  # Customer payments and receipts (`#/billing/payments`)
    │   │   └── RecordSalePage.jsx# Direct cylinder sale & refill voucher (`#/billing/sale`)
    │   ├── ceo/                  # Executive oversight screens
    │   │   ├── ceo.css           # Styles for CEO executive view
    │   │   └── CeoView.jsx       # Read-only executive dashboard and audit briefing
    │   ├── customer/             # Customer portal screens
    │   │   ├── customer.css      # Styles for customer mobile portal
    │   │   ├── CustomerApp.jsx   # Customer self-service refill & billing app
    │   │   └── DeliveryStatusPage.jsx # Live order status tracker
    │   ├── customers/            # Customer directory screens
    │   │   ├── CustomerDeactivateModal.jsx # Soft-delete confirmation dialog
    │   │   ├── CustomerList.jsx  # Customer directory (`#/customers`)
    │   │   ├── CustomerModal.jsx # New customer registration dialog
    │   │   ├── CustomerProfile.jsx # Customer details, history, cylinder assets (`#/customers/:id`)
    │   │   └── customers.css     # Styles for customer management
    │   ├── cylinders/            # Cylinder lifecycle & empty recovery screens
    │   │   ├── AddCylinderModal.jsx # Cylinder asset registration dialog
    │   │   ├── CylinderDetailDrawer.jsx # Cylinder history and state transition drawer
    │   │   ├── CylinderRegister.jsx # Cylinder lifecycle register (`#/cylinders`)
    │   │   ├── CylinderSummaryStrip.jsx # 4-state lifecycle count pills
    │   │   ├── EmptyRecovery.jsx # Empty cylinder recovery & ageing analysis (`#/cylinders/recovery`)
    │   │   ├── HeldByCustomersTable.jsx # Breakdown of cylinders currently in customer custody
    │   │   └── cylinders.css     # Styles for cylinder management
    │   ├── dashboard/            # Operational analytics screens
    │   │   ├── dashboard.css     # Styles for operational dashboard
    │   │   └── DashboardPage.jsx # Daily operational KPIs and charts (`#/dashboard`)
    │   ├── evaluation/           # Route evaluation screens
    │   │   ├── evaluation.css    # Styles for solver evaluation
    │   │   └── EvaluationPage.jsx# Solver benchmark metrics & comparisons (`#/evaluation`)
    │   ├── expenses/             # Operating expense screens
    │   │   ├── AddExpenseModal.jsx # New expense entry dialog
    │   │   ├── expenses.css      # Styles for operating expenses
    │   │   └── ExpensesPage.jsx  # Operating expenses tracking & category charts (`#/expenses`)
    │   ├── reports/              # Executive reporting screens
    │   │   ├── reports.css       # Styles for executive reports
    │   │   └── ReportsPage.jsx   # Business summary reports and CSV export (`#/reports`)
    │   └── stock/                # Stock & procurement screens
    │       ├── AddPurchaseModal.jsx # Bulk purchase entry modal
    │       ├── PurchasesPage.jsx # Bulk LPG procurement and verification (`#/stock/purchases`)
    │       ├── stock.css         # Styles for stock and purchases
    │       ├── StockPage.jsx     # Depot inventory & low-stock alerts (`#/stock`)
    │       └── StockSettingsModal.jsx # Safety threshold configuration dialog
    └── mock/                     # Mock data engine (active only in demo mode)
        ├── assistant.js          # Client-side NLP assistant response engine
        ├── audit.js              # SHA-256 verifiable tamper-evident audit log
        ├── auth.js               # Mock JWT auth & credentials validator
        ├── billing.js            # Invoices, ledger, receipts, debt ageing
        ├── customerPortal.js     # Customer self-service endpoints
        ├── customers.js          # Customer directory handlers
        ├── cylinders.js          # 4-stage cylinder lifecycle state machine
        ├── dashboard.js          # Executive and operational KPI calculations
        ├── db.js                 # In-memory database with localStorage sync & event log
        ├── dispatch.js           # Vehicle routing solver simulation
        ├── evaluation.js         # Solver benchmark & efficiency simulation
        ├── notes.js              # Daily operations notes handlers
        ├── router.js             # Mock HTTP request router
        ├── seedBilling.js        # Seed invoices and ledger records
        ├── seedCustomers.js      # 60 realistic Faisalabad customers
        ├── seedCylinders.js      # Registered cylinder inventory
        ├── seedStockExpenses.js  # Seed purchases, stock, and expenses
        ├── settings.js           # System settings handlers
        ├── stockExpenses.js      # Stock, purchases, and operating expenses
        └── users.js              # User management & permission handlers
```

---

## Screens That Still Need Backend Endpoints

The core dispatch solver endpoints (`/plan/today`, `/plan/publish`, `/routes`, `/routes/{id}/assign`, `/my-routes`, `/route-stops/{id}/skip`, `/urgent`, `/paths`) are implemented in the existing FastAPI backend (`backend/app.py`).

All other screens currently use the mock layer. When running with the real backend (`npm run dev` with `VITE_USE_MOCK=false`), screens whose endpoints return 404 or 501 will display an informative `<NotReady endpoint="..." />` notice.

The table below summarizes each screen and the corresponding backend endpoints required. Complete request/response schemas, validation rules, and error codes are detailed in [`MOCK_ENDPOINTS.md`](./MOCK_ENDPOINTS.md).

| Screen | Route | Endpoints Required | Documentation |
|---|---|---|---|
| **Customers Directory** | `#/customers` | `GET /customers`, `POST /customers`, `PUT /customers/:id`, `DELETE /customers/:id` | [MOCK_ENDPOINTS.md § Customer Module](./MOCK_ENDPOINTS.md#customer-module-endpoints-module-2) |
| **Customer Profile** | `#/customers/:id` | `GET /customers/:id`, `GET /cylinders?customer_id=...`, `GET /customers/:id/deliveries`, `GET /customers/:id/ledger` | [MOCK_ENDPOINTS.md § Customer Module](./MOCK_ENDPOINTS.md#customer-module-endpoints-module-2) |
| **Cylinder Register** | `#/cylinders` | `GET /cylinders`, `POST /cylinders`, `GET /cylinders/:id`, `GET /cylinders/summary`, `POST /cylinders/:id/transition`, `GET /cylinders/:id/history` | [MOCK_ENDPOINTS.md § Cylinder Register](./MOCK_ENDPOINTS.md#cylinder-register--empty-recovery-endpoints-modules-3-4-13) |
| **Empty Recovery** | `#/cylinders/recovery` | `GET /recovery/ageing` | [MOCK_ENDPOINTS.md § Cylinder Register](./MOCK_ENDPOINTS.md#cylinder-register--empty-recovery-endpoints-modules-3-4-13) |
| **Driver Stop Tracking** | DriverView | `POST /route-stops/:id/deliver` *(extended with cylinder serials)* | [MOCK_ENDPOINTS.md § Dispatch Stops](./MOCK_ENDPOINTS.md#dispatch--driver-stop-actions-modules-9-11-18) |
| **Record Direct Sale** | `#/billing/sale` | `POST /sales` *(atomic sale, delivery & payment)* | [MOCK_ENDPOINTS.md § Billing & Ledger](./MOCK_ENDPOINTS.md#sales-billing-payments--ledger-endpoints-phase-f5---modules-5-14-15) |
| **Billing & Invoices** | `#/billing` | `GET /bills`, `POST /bills` | [MOCK_ENDPOINTS.md § Billing & Ledger](./MOCK_ENDPOINTS.md#sales-billing-payments--ledger-endpoints-phase-f5---modules-5-14-15) |
| **Invoice Voucher** | `#/billing/invoice/:id` | `GET /bills/:id` | [MOCK_ENDPOINTS.md § Billing & Ledger](./MOCK_ENDPOINTS.md#sales-billing-payments--ledger-endpoints-phase-f5---modules-5-14-15) |
| **Customer Payments** | `#/billing/payments` | `GET /payments`, `POST /payments` | [MOCK_ENDPOINTS.md § Billing & Ledger](./MOCK_ENDPOINTS.md#sales-billing-payments--ledger-endpoints-phase-f5---modules-5-14-15) |
| **Append-Only Ledger** | `#/ledger` | `GET /ledger`, `POST /ledger/correction` | [MOCK_ENDPOINTS.md § Billing & Ledger](./MOCK_ENDPOINTS.md#sales-billing-payments--ledger-endpoints-phase-f5---modules-5-14-15) |
| **Customer Debt Ageing** | `#/billing/loans` | `GET /billing/loans`, `GET /billing/statements/:id` | [MOCK_ENDPOINTS.md § Billing & Ledger](./MOCK_ENDPOINTS.md#sales-billing-payments--ledger-endpoints-phase-f5---modules-5-14-15) |
| **Stock & Safety Levels** | `#/stock` | `GET /stock/summary`, `GET /stock/movements`, `GET/PUT /settings/stock` | [MOCK_ENDPOINTS.md § Purchases & Stock](./MOCK_ENDPOINTS.md#purchases--stock-endpoints-phase-f6---module-12) |
| **Purchases & Orders** | `#/stock/purchases` | `GET /stock/purchases`, `POST /stock/purchases`, `PUT /stock/purchases/:id`, `POST /stock/purchases/:id/verify` | [MOCK_ENDPOINTS.md § Purchases & Stock](./MOCK_ENDPOINTS.md#purchases--stock-endpoints-phase-f6---module-12) |
| **Operating Expenses** | `#/expenses` | `GET /expenses`, `POST /expenses`, `DELETE /expenses/:id`, `GET /expenses/summary` | [MOCK_ENDPOINTS.md § Operating Expenses](./MOCK_ENDPOINTS.md#operating-expenses-endpoints-phase-f6---module-16) |
| **Operational Dashboard** | `#/dashboard` | `GET /dashboard/summary` | [MOCK_ENDPOINTS.md § Dashboards & Reports](./MOCK_ENDPOINTS.md#executive-dashboards-reporting--route-evaluation-phase-f7---modules-6-7-8-17) |
| **Business Reports** | `#/reports` | `GET /reports` | [MOCK_ENDPOINTS.md § Dashboards & Reports](./MOCK_ENDPOINTS.md#executive-dashboards-reporting--route-evaluation-phase-f7---modules-6-7-8-17) |
| **Route Evaluation** | `#/evaluation` | `GET /evaluation` | [MOCK_ENDPOINTS.md § Dashboards & Reports](./MOCK_ENDPOINTS.md#executive-dashboards-reporting--route-evaluation-phase-f7---modules-6-7-8-17) |
| **Users & Permissions** | `#/users` | `GET /users`, `POST /users`, `PUT /users/:id`, `DELETE /users/:id` | [MOCK_ENDPOINTS.md § Admin & Security](./MOCK_ENDPOINTS.md#admin-user-management-settings-audit--daily-notes-phase-f9---modules-10-19) |
| **System Audit Log** | `#/audit` | `GET /audit/verify` | [MOCK_ENDPOINTS.md § Admin & Security](./MOCK_ENDPOINTS.md#admin-user-management-settings-audit--daily-notes-phase-f9---modules-10-19) |
| **System Settings** | `#/settings` | `GET /settings`, `PUT /settings` | [MOCK_ENDPOINTS.md § Admin & Security](./MOCK_ENDPOINTS.md#admin-user-management-settings-audit--daily-notes-phase-f9---modules-10-19) |
| **Daily Dispatch Notes** | `#/utilities` | `GET /notes`, `POST /notes` | [MOCK_ENDPOINTS.md § Admin & Security](./MOCK_ENDPOINTS.md#admin-user-management-settings-audit--daily-notes-phase-f9---modules-10-19) |
| **AI Assistant (Demo)** | `#/assistant` | `POST /assistant/query` | [MOCK_ENDPOINTS.md § Admin & Security](./MOCK_ENDPOINTS.md#admin-user-management-settings-audit--daily-notes-phase-f9---modules-10-19) |
| **Customer Mobile App** | Customer role | `GET /my/balance`, `GET /my/deliveries`, `GET /my/bills`, `POST /my/refill-request` | [MOCK_ENDPOINTS.md § Customer Portal](./MOCK_ENDPOINTS.md#customer-self-service-portal-endpoints-module-10) |
| **CEO Executive View** | CEO role | `GET /dashboard/summary`, `GET /audit/verify` | [MOCK_ENDPOINTS.md § Dashboards & Reports](./MOCK_ENDPOINTS.md#executive-dashboards-reporting--route-evaluation-phase-f7---modules-6-7-8-17) |

---

## Verification & Build Commands

```bash
# Production build with real backend configuration:
npm run build

# Demo build with mock backend bundled:
npm run build:demo

# Local preview of the demo production bundle:
npm run preview
```
