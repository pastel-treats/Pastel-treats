import React from 'react'

// If any screen hits an unexpected error, show a friendly page instead of a blank screen.
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) {
    // a new version was published while this page was open → reload once to fetch it
    if (/dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(error?.message || '')) {
      try { if (!sessionStorage.getItem('pt-reloaded')) { sessionStorage.setItem('pt-reloaded', '1'); location.reload() } } catch { /* ignore */ }
    }
    console.error('[Pastel Treats]', error)
  }
  componentDidUpdate(prev) { if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false }) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="wrap" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '40px 16px' }}>
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: '3rem' }} aria-hidden="true">🧁</div>
          <h2 style={{ margin: '8px 0' }}>Oops — this page didn’t load properly</h2>
          <p className="muted">Your cart and orders are safe. Please reload the page{this.props.whatsapp ? ', or message us on WhatsApp if it keeps happening' : ''}.</p>
          <div className="row" style={{ gap: 8, justifyContent: 'center', marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => location.reload()}>Reload</button>
            <a className="btn btn-white" href="#/" onClick={() => this.setState({ failed: false })}>Go to home</a>
          </div>
        </div>
      </div>
    )
  }
}
