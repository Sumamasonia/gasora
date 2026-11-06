export default function ComingSoon({ title = 'This Page', phase = 'F2+' }) {
  return (
    <div className="coming-soon card">
      <div className="coming-soon-icon" aria-hidden="true">🚧</div>
      <h2>{title}</h2>
      <p className="muted">Coming in a later phase ({phase})</p>
      <div className="coming-soon-detail">
        <p>This screen is planned in the Gasora development roadmap.</p>
        <p className="muted">
          All foundation layers, mock databases, and shared design tokens are active.
        </p>
      </div>
    </div>
  )
}
