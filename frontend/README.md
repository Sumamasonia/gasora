# Gasora Frontend

Gasora is a web-based delivery planning and operational management system for an LPG (liquefied petroleum gas) cylinder distribution agency in Faisalabad, Pakistan.

The frontend is built with **React 19** and **Vite**, using clean vanilla CSS design tokens, responsive layout architecture, and zero bulky UI component or icon dependencies.

---

## Quick Start

### 1. Run with Real Backend
When running alongside the FastAPI backend running on port 8000:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server starts at `http://localhost:5173`. Requests made to `/api/*` are proxied directly to `http://127.0.0.1:8000`.

### 2. Run in Demo Mode (No Backend Required)
In demo mode, the frontend intercepts all API requests inside `src/api.js` using an in-memory mock router and persistence in `localStorage`:

```bash
cd frontend
npm run demo
```

You can also create a standalone production demo bundle:
```bash
npm run build:demo
npm run preview
```

---

## Demo Credentials (Demo Mode)

When running in demo mode (`npm run demo`), quick auto-fill buttons appear on the login screen:

| Role | Username | Password | Purpose |
|---|---|---|---|
| **Owner** | `owner` | `owner-demo-123` | Full access to dispatch map, solvers, cylinder lifecycle, money & admin |
| **Driver** | `driver1` | `driver-demo-123` | Standalone phone-first delivery stop list, one stop at a time |
| **Manager** | `manager1` | `manager-demo-123` | Daily operations, sales verification, cylinder movements, stock |
| **Customer** | `customer1` | `customer-demo-123` | Customer portal: refill requests, balance ledger, invoices |
| **CEO** | `ceo1` | `ceo-demo-123` | Read-only executive dashboards, performance metrics, and audit log |

---

## Project Structure

```
frontend/
├── .env.demo               # VITE_USE_MOCK=true for demo runs
├── .env.example            # VITE_USE_MOCK=false default template
├── MOCK_ENDPOINTS.md       # Specification of all mock-only endpoints for backend team
├── README.md               # Frontend developer guide
├── package.json            # Scripts and dependencies (React 19, Leaflet, Vite)
├── vite.config.js          # Vite config with /api proxy to FastAPI port 8000
└── src/
    ├── api.js              # Central API client and ApiError class
    ├── config.js           # USE_MOCK configuration switch
    ├── nav.js              # Role-based navigation groups
    ├── styles.css          # Design tokens, CSS variables, dark/light themes
    ├── ui.jsx              # Shared risk badges (Badge, UrgentTag)
    ├── colors.js           # Risk band and vehicle color palettes
    ├── App.jsx             # Authentication state, login screen, role routing
    ├── DriverView.jsx      # Driver mobile stop checklist
    ├── OwnerView.jsx       # Dispatcher plan review and interactive map
    ├── PlanMap.jsx         # Leaflet routing map
    ├── components/         # Reusable design system components
    │   ├── AppShell.jsx    # Sidebar navigation, top bar, theme switch
    │   ├── ComingSoon.jsx  # Friendly placeholder for upcoming phase screens
    │   ├── DataTable.jsx   # Searchable, sortable, responsive stacked table
    │   ├── EmptyState.jsx  # Empty state feedback illustration
    │   ├── FormField.jsx   # Accessible form label, control and error wrapper
    │   ├── KpiTile.jsx     # Overview metric card with trends and icons
    │   ├── Modal.jsx       # Accessible modal dialog with Esc key support
    │   ├── NotReady.jsx    # Missing backend endpoint warning component
    │   ├── Skeleton.jsx    # Loading pulse placeholder
    │   ├── Spinner.jsx     # Accessible SVG spinner
    │   ├── Toast.jsx       # Toast provider and useToast hook
    │   ├── components.css  # Styles for shared UI components
    │   └── shell.css       # Styles for AppShell and sidebar
    ├── lib/
    │   └── useHashRoute.js # Lightweight hash router hook (#/dispatch, etc.)
    ├── mock/               # Mock layer (active only when USE_MOCK=true)
    │   ├── auth.js         # Mock tokens and role permission checker
    │   ├── customers.js    # Customer handlers
    │   ├── db.js           # In-memory store with localStorage backup
    │   ├── router.js       # Mock route dispatcher with realistic 150-400ms latency
    │   ├── seedCustomers.js# 60 realistic Faisalabad customers across 10 areas
    │   └── users.js        # User management handlers
    └── pages/
        └── UiKit.jsx       # Hidden component showcase page (#/ui-kit)
```

---

## Design System & UI Kit

- **Design Inspiration**: Routific-style clean logistics interface with high-contrast data tables, timeline stops, and clear status badges.
- **Theme Support**: Built-in Light and Dark themes toggled via CSS variables and preserved in `localStorage` (`data-theme="dark"`).
- **Responsive Layout**: Tables automatically transform into stacked touch cards on screens narrower than `720px`.
- **UI Kit**: Navigate to `#/ui-kit` at any time to inspect and test all shared design components, modals, and toasts.
