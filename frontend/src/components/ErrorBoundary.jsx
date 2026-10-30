import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught error]', error, errorInfo);
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback({ error: this.state.error, reset: this.handleReset })
          : this.props.fallback;
      }

      return (
        <div className="my-2 rounded-xl border border-red-200/60 bg-red-50/50 p-4 text-xs text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
          <div className="font-semibold">{this.props.fallbackTitle || '组件渲染异常'}</div>
          <div className="mt-1 line-clamp-2 font-mono text-[11px] opacity-80">
            {this.state.error?.message || String(this.state.error)}
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-2.5 inline-flex items-center rounded-lg border border-red-300/60 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-red-700 shadow-sm transition-all hover:bg-red-50 dark:border-red-800 dark:bg-black/40 dark:text-red-300"
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
