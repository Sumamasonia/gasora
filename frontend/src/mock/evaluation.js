import { requireAuth } from './auth.js'

/**
 * Handle GET /evaluation/results
 * Returns benchmark evaluation results comparing the four delivery policies:
 * - P1 Reactive (Customer-Initiated)
 * - P2 Average-Days (Periodic Schedule)
 * - P3 Gasora Risk (Our Proposed Policy)
 * - Ablation (Gasora without Risk Uncertainty / Routing Only)
 *
 * CRITICAL RULE:
 * Every figure is a synthetic demo placeholder from offline simulation runs.
 * Marked explicitly as "Demo data" throughout and never states guaranteed real-world savings.
 */
export function handleGetEvaluationResults(token) {
  requireAuth(token, ['owner', 'manager', 'ceo'])

  return {
    title: 'Multi-Policy Simulation & Benchmark Evaluation',
    label: 'Demo data (Offline Synthetic Simulation)',
    as_of: new Date().toISOString(),
    paired_seeds_explanation:
      'Evaluated across 50 paired random simulation seeds over 180 simulated operating days in Faisalabad delivery geography (identical customer demand sequences across all four policies for fair comparison). All figures are demo placeholders from synthetic benchmarking runs.',
    disclaimer:
      'Demo data only: These metrics represent synthetic simulation outputs under modeled Poisson consumption distributions in Faisalabad. They serve as comparative research placeholders and do not guarantee actual operational savings.',
    simulation_parameters: {
      duration_days: 180,
      paired_random_seeds: 50,
      simulated_customers: 100,
      fleet_vehicles: 2,
      vehicle_capacity: 40,
      base_geography: 'Faisalabad Municipal District',
      is_demo: true,
    },
    policies: [
      {
        id: 'P1',
        code: 'P1 Reactive',
        name: 'Reactive (Customer-Initiated)',
        category: 'Status Quo Baseline',
        badge: 'Baseline',
        description: 'Orders are dispatched strictly on-demand after customers report empty cylinders or complete pressure loss.',
        runouts_per_100_customer_months: 84.2, // demo data
        km_per_delivery: 9.8, // demo data
        total_km: 14210, // demo data
        early_deliveries_pct: 0.0, // demo data
        customer_days_without_gas: 342, // demo data
        interval_range: '1–45 days (erratic)',
        color: '#94a3b8',
        is_gasora: false,
      },
      {
        id: 'P2',
        code: 'P2 Average-Days',
        name: 'Periodic Schedule (Fixed Interval)',
        category: 'Heuristic Benchmark',
        badge: 'Fixed Cadence',
        description: 'Fixed cyclic refill dispatch (e.g. every 14 days) calculated from historical mean consumption without telemetry.',
        runouts_per_100_customer_months: 26.5, // demo data
        km_per_delivery: 6.4, // demo data
        total_km: 9280, // demo data
        early_deliveries_pct: 24.8, // demo data
        customer_days_without_gas: 78, // demo data
        interval_range: '14 days (fixed)',
        color: '#f59e0b',
        is_gasora: false,
      },
      {
        id: 'P3',
        code: 'P3 Gasora Risk',
        name: 'Gasora Risk-Based Dynamic',
        category: 'Proposed Policy',
        badge: 'Our Model',
        description: 'Bayesian predictive cylinder depletion model paired with dynamic vehicle routing and customer run-out risk scoring.',
        runouts_per_100_customer_months: 2.1, // demo data
        km_per_delivery: 4.1, // demo data
        total_km: 5945, // demo data
        early_deliveries_pct: 5.2, // demo data
        customer_days_without_gas: 4, // demo data
        interval_range: '11–19 days (adaptive)',
        color: '#2563eb',
        is_gasora: true,
      },
      {
        id: 'Ablation',
        code: 'Ablation (Routing Only)',
        name: 'Gasora without Risk Uncertainty',
        category: 'Ablation Baseline',
        badge: 'Ablation',
        description: 'Full multi-drop vehicle routing optimization enabled, but using deterministic mean interval without Bayesian uncertainty.',
        runouts_per_100_customer_months: 11.4, // demo data
        km_per_delivery: 5.2, // demo data
        total_km: 7540, // demo data
        early_deliveries_pct: 14.1, // demo data
        customer_days_without_gas: 36, // demo data
        interval_range: '10–22 days (deterministic)',
        color: '#8b5cf6',
        is_gasora: false,
      },
    ],
    chart_data: [
      {
        policy: 'P1 Reactive',
        runouts: 84.2,
        km_per_delivery: 9.8,
        total_km_k: 14.2,
        days_without_gas: 342,
        early_pct: 0.0,
      },
      {
        policy: 'P2 Average-Days',
        runouts: 26.5,
        km_per_delivery: 6.4,
        total_km_k: 9.3,
        days_without_gas: 78,
        early_pct: 24.8,
      },
      {
        policy: 'P3 Gasora Risk',
        runouts: 2.1,
        km_per_delivery: 4.1,
        total_km_k: 5.9,
        days_without_gas: 4,
        early_pct: 5.2,
      },
      {
        policy: 'Ablation (Routing Only)',
        runouts: 11.4,
        km_per_delivery: 5.2,
        total_km_k: 7.5,
        days_without_gas: 36,
        early_pct: 14.1,
      },
    ],
  }
}
