import React from 'react';

class GlobalErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) { fetch('/api/admin/log-crash', { method: 'POST', body: JSON.stringify({ error: error.message, stack: errorInfo.componentStack }), headers: { 'Content-Type': 'application/json' } }).catch(() => {});
        console.error("CRITICAL UI ERROR:", error.message);
        console.error("Component stack:", errorInfo.componentStack);
        this.setState({ hasError: true, error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            const { error, errorInfo } = this.state;
            return (
                <div style={{ padding: '2rem', backgroundColor: '#fee2e2', color: '#991b1b', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', fontFamily: 'sans-serif', overflowY: 'auto' }}>
                    <div style={{ maxWidth: '900px', width: '100%', marginTop: '4rem' }}>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>⚠️ Ocurrió un error inesperado</h1>
                        <p style={{ marginBottom: '1.5rem', color: '#7f1d1d' }}>Por favor recargue la página. Si el error persiste, contacte al administrador.</p>

                        {/* Error Message */}
                        <div style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' }}>
                            <strong style={{ display: 'block', marginBottom: '0.25rem', color: '#b91c1c' }}>Error:</strong>
                            <code style={{ fontSize: '0.875rem', color: '#7f1d1d', wordBreak: 'break-all' }}>
                                {error ? error.toString() : 'Unknown error'}
                            </code>
                        </div>

                        {/* Component Stack — only in dev */}
                        {import.meta.env.DEV && errorInfo && errorInfo.componentStack && (
                            <details style={{ marginBottom: '1.5rem' }}>
                                <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#991b1b', marginBottom: '0.5rem' }}>
                                    Ver pila de componentes (Component Stack)
                                </summary>
                                <pre style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: '0.5rem', padding: '1rem', fontSize: '0.75rem', overflowX: 'auto', whiteSpace: 'pre-wrap', color: '#7f1d1d' }}>
                                    {errorInfo.componentStack}
                                </pre>
                            </details>
                        )}

                        <button
                            onClick={() => window.location.reload()}
                            style={{ padding: '0.5rem 1.5rem', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '1rem', marginRight: '1rem' }}
                        >
                            Recargar
                        </button>
                        <button
                            onClick={() => { localStorage.removeItem('user'); localStorage.removeItem('token'); window.location.href = '/login'; }}
                            style={{ padding: '0.5rem 1.5rem', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '1rem' }}
                        >
                            Cerrar sesión y volver al inicio
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default GlobalErrorBoundary;
