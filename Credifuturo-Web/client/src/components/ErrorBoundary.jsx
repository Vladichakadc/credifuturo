import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center my-4">
                    <h3 className="text-red-800 font-bold mb-2">⚠️ Error de Visualización</h3>
                    <p className="text-sm text-red-600 mb-4">
                        Hubo un problema al mostrar esta sección.
                        <br />
                        <span className="font-mono text-xs">{this.state.error && this.state.error.message}</span>
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false })}
                        className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded text-sm font-bold transition-colors"
                    >
                        Reintentar
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
