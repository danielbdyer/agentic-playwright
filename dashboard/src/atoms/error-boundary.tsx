/**
 * SceneErrorBoundary — catches Three.js render errors and shows recovery UI.
 *
 * React error boundaries must be class components. This wraps the R3F Canvas
 * so that WebGL context loss, malformed probe data, or shader errors don't
 * crash the entire dashboard to a white screen.
 *
 * Atom: pure boundary wrapper. No business logic.
 */

import { Component, type ReactNode } from 'react';

interface Props { readonly children: ReactNode; readonly fallback?: ReactNode }
interface State { readonly hasError: boolean; readonly error: Error | null }

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="empty" style={{ padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#f85149', fontSize: 14 }}>Scene error: {this.state.error?.message ?? 'Unknown'}</span>
          <button className="btn" onClick={() => this.setState({ hasError: false, error: null })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
