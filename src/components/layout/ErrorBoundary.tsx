import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  /** When this value changes, the boundary clears any captured error and
   *  retries rendering — used to reset on route navigation. */
  resetKey?: unknown;
  children: ReactNode;
}
interface State {
  error: Error | null;
  prevResetKey: unknown;
}

/** Route-level error boundary: contains a render/runtime error to the current
 *  view instead of blanking the whole app, and offers a retry. React only
 *  supports class components as error boundaries. */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, prevResetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  // A new route (or other reset key) clears the error so the next view can
  // render — done here (not componentDidUpdate) to avoid an extra render pass.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.prevResetKey) {
      return { error: null, prevResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <AlertTriangle className="size-8 text-danger" />
          <p className="text-sm font-medium text-text">Ocurrió un error al mostrar esta vista.</p>
          <p className="max-w-md text-xs text-text-muted">{this.state.error.message}</p>
          <Button onClick={() => this.setState({ error: null })}>Reintentar</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
