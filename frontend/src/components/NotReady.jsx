export default function NotReady({ endpoint = 'the required API endpoint' }) {
  return (
    <div className="not-ready card">
      <div className="not-ready-icon" aria-hidden="true">🛠️</div>
      <h2 className="not-ready-title">Backend Endpoint Pending</h2>
      <p className="not-ready-text">
        This screen needs the endpoint <code>{endpoint}</code>, which the backend does not have yet.
      </p>
      <div className="not-ready-hint">
        <p>To test this screen immediately with realistic data:</p>
        <pre className="command-box">npm run demo</pre>
      </div>
    </div>
  )
}
