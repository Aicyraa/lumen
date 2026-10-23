import { Component, type ReactNode } from "react";

// Last line of defence: one crashing component must never blank the whole site.
// The fallback shows no error text or stack, and nothing is logged here.
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="fatal">
        <h1 className="h2s">Something went wrong</h1>
        <p className="body muted-2">The page hit an unexpected problem. Reloading usually fixes it.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
