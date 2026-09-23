import React from 'react';
import { AlertTriangle, RefreshCcw, Terminal } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class DiagnosticErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.group('🚨 DIAGNÓSTICO DE ERRO');
    console.error('Mensagem:', error.message);
    console.error('Stack:', error.stack);
    console.error('Component Stack:', errorInfo.componentStack);
    console.groupEnd();
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    const host = window.location.hostname;
    const isPreview = window.self !== window.top
      || host.startsWith('id-preview--')
      || host.includes('-preview--')
      || host.includes('lovable.app')
      || host.endsWith('.lovableproject.com')
      || host.endsWith('.lovableproject-dev.com')
      || host.endsWith('.beta.lovable.dev');

    if (isPreview) {
      window.history.replaceState(window.history.state, '', window.location.href);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    }

    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-50 p-6 flex flex-col items-center justify-center font-mono">
          <div className="max-w-4xl w-full space-y-6">
            <div className="flex items-center gap-4 text-red-500 mb-2">
              <AlertTriangle className="h-10 w-10" />
              <h1 className="text-2xl font-bold">Erro Detectado no Preview</h1>
            </div>
            
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <div className="bg-slate-800 px-4 py-2 flex items-center justify-between border-b border-slate-700">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Terminal className="h-3 w-3" />
                  <span>RESUMO DO ERRO</span>
                </div>
              </div>
              <div className="p-4 text-red-400 text-sm">
                {this.state.error?.toString()}
              </div>
            </div>

            {this.state.errorInfo && (
              <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                <div className="bg-slate-800 px-4 py-2 flex items-center border-b border-slate-700">
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">Stack Trace</span>
                </div>
                <div className="p-4 text-[10px] sm:text-xs text-slate-300 overflow-auto max-h-[400px] whitespace-pre-wrap leading-relaxed">
                  {this.state.error?.stack}
                  <div className="mt-4 border-t border-slate-800 pt-4 text-slate-500 italic">
                    Component Stack:
                    {this.state.errorInfo.componentStack}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button 
                onClick={this.handleReset}
                className="bg-white text-black hover:bg-slate-200 flex items-center gap-2"
              >
                <RefreshCcw className="h-4 w-4" />
                Tentar Recarregar
              </Button>
              <Button 
                variant="outline" 
                onClick={this.handleGoHome}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Voltar ao Início
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default DiagnosticErrorBoundary;
