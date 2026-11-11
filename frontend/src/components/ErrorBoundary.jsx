import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Gasora ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    if (this.props.onReset) {
      this.props.onReset()
    } else {
      window.location.hash = '#/dispatch'
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, maxWidth: 600, margin: '40px auto', textAlign: 'center' }}>
          <div className="card" style={{ padding: 28, borderRadius: 12 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ margin: '0 0 8px' }}>Something went wrong</h2>
            <p className="muted" style={{ fontSize: 14, margin: '0 0 16px' }}>
              An unexpected error occurred while loading this view.
            </p>
            {this.state.error?.message && (
              <pre
                style={{
                  background: 'var(--bg-subtle, #f1f5f9)',
                  padding: 12,
                  borderRadius: 6,
                  fontSize: 12,
                  textAlign: 'left',
                  overflowX: 'auto',
                  margin: '0 0 16px',
                  color: 'var(--color-danger, #dc2626)',
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button type="button" onClick={this.handleReset}>
                🔄 Retry / Return to Dispatch
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

