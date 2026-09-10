import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCache = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FFFDF5] text-[#121212] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border-[3px] border-[#121212] shadow-neo p-6 text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-[#FFE600] border-2 border-[#121212] shadow-neo flex items-center justify-center">
              <AlertTriangle size={32} className="text-[#121212]" />
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase text-[#121212] tracking-tight">
                Something went wrong
              </h2>
              <p className="text-xs font-semibold text-neutral-600 mt-1">
                {this.state.error?.message || 'An unexpected rendering error occurred.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full mt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 bg-[#FFE600] text-[#121212] font-black uppercase text-xs border-2 border-[#121212] shadow-neo-sm hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw size={14} /> Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleResetCache}
                className="flex-1 py-2.5 px-4 bg-white text-neutral-700 font-black uppercase text-xs border-2 border-neutral-300 hover:border-[#121212] hover:text-black transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 size={14} /> Reset Cache
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
