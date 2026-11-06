export default function FormField({
  label,
  error,
  hint,
  required,
  id,
  children,
}) {
  return (
    <div className={`form-field ${error ? 'has-error' : ''}`}>
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
          {required && <span className="field-required" aria-hidden="true"> *</span>}
        </label>
      )}
      <div className="field-control">{children}</div>
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}
      {hint && !error && <div className="field-hint muted">{hint}</div>}
    </div>
  )
}
