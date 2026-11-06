export default function Skeleton({
  variant = 'text',
  width = '100%',
  height,
  count = 1,
  className = '',
}) {
  const items = Array.from({ length: count })

  const getDefaultHeight = () => {
    if (height) return height
    if (variant === 'circle') return 40
    if (variant === 'card') return 120
    return 18
  }

  return (
    <div className={`skeleton-group ${className}`}>
      {items.map((_, i) => (
        <div
          key={i}
          className={`skeleton skeleton-${variant}`}
          style={{
            width: variant === 'circle' ? getDefaultHeight() : width,
            height: getDefaultHeight(),
          }}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}
