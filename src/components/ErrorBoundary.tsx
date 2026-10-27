import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State { error: Error | null }

/** Evita a tela em branco: mostra o erro e deixa tentar de novo. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro na tela:', error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="state error" role="alert">
        <strong>Esta tela encontrou um erro.</strong>
        <p className="muted">{this.state.error.message}</p>
        <p>
          <button className="btn" onClick={() => this.setState({ error: null })}>Tentar de novo</button>{' '}
          <button className="btn" onClick={() => window.location.reload()}>Recarregar a página</button>
        </p>
      </div>
    );
  }
}
