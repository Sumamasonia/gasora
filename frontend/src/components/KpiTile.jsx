export default function KpiTile({ title, value, subtitle, trend, icon, onClick }) {
  return (
    <div
      className={`kpi-tile ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="kpi-header">
        <span className="kpi-title">{title}</span>
        {icon && <span className="kpi-icon">{icon}</span>}
      </div>
      <div className="kpi-value">{value}</div>
      {(subtitle || trend) && (
        <div className="kpi-footer">
          {trend && <span className={`kpi-trend ${trend.positive ? 'positive' : 'negative'}`}>{trend.label}</span>}
          {subtitle && <span className="kpi-subtitle">{subtitle}</span>}
        </div>
      )}
    </div>
  )
}
