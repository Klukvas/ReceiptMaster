import { Component, type ErrorInfo, type ReactNode } from "react";
import { claimChunkReload, isChunkLoadError } from "../../lib/chunk-load";
import { ErrorFallback } from "./ErrorFallback";
import { PageSpinner } from "./PageSpinner";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  isReloading: boolean;
}

/**
 * Keeps a render failure from blanking the app. A lazy route whose chunk is gone
 * recovers with one guarded reload, which fetches the new index.html; anything
 * else, or a chunk still missing after that, shows the fallback.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false, isReloading: false };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { hasError: true, isReloading: isChunkLoadError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Unhandled render error", error, info.componentStack);
    if (!isChunkLoadError(error)) return;
    if (claimChunkReload()) {
      window.location.reload();
    } else {
      this.setState({ isReloading: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return this.state.isReloading ? <PageSpinner /> : <ErrorFallback />;
  }
}
