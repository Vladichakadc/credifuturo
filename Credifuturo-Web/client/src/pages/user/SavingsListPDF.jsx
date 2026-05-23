import React from 'react';
import { PiggyBank, BarChart3, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

// Helpers
const fmt = (v) => `$${Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtDate = (d) => new Date(d).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

// ⚠️ All layout uses INLINE styles — not Tailwind classes.
// html2canvas does not reliably resolve Tailwind computed CSS at capture time,
// which causes grid/flex children to overlap or collapse. Inline styles are
// always applied directly to the element and are read correctly.
const SavingsListPDF = React.forwardRef(({ user, stats, chartImage, generationDate }, ref) => {
    return (
        <div ref={ref} style={{
            width: '794px', // 210mm at 96dpi — fixed pixel width for consistent capture
            backgroundColor: '#ffffff',
            fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
            padding: '40px',
            boxSizing: 'border-box',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Background Accent */}
            <div style={{
                position: 'absolute', top: 0, right: 0,
                width: 200, height: 200,
                background: 'radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 70%)',
                borderRadius: '0 0 0 100%',
                pointerEvents: 'none',
            }} />

            {/* ── Header ───────────────────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 20, borderBottom: '2px solid #e5e7eb', marginBottom: 28 }}>
                <div>
                    <div style={{ fontSize: 30, fontWeight: 900, color: '#4f46e5', letterSpacing: '-1px', lineHeight: 1 }}>Credifuturo</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 2, marginTop: 4 }}>
                        Cooperativa Familiar de Crédito y Ahorro Solidario
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', letterSpacing: '-0.5px' }}>Informe de Estado de Cuenta</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 6, fontSize: 10, color: '#6b7280', background: '#f9fafb', padding: '5px 10px', borderRadius: 6, border: '1px solid #e5e7eb' }}>
                        <Clock style={{ width: 12, height: 12, color: '#10b981' }} />
                        Generado: {fmtDate(generationDate)} · {fmtTime(generationDate)}
                    </div>
                </div>
            </div>

            {/* ── User Info ─────────────────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', borderRadius: 12, padding: '16px 20px', border: '1px solid #e5e7eb', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 44, height: 44, background: 'rgba(16,185,129,0.12)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#059669', flexShrink: 0 }}>
                        {user.name?.charAt(0)}{user.surname1?.charAt(0) || ''}
                    </div>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
                            {user.name} {user.surname1 || ''} {user.surname2 || ''}
                        </div>
                        <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                            <span style={{ fontSize: 12, color: '#6b7280' }}><strong style={{ color: '#374151' }}>C.C:</strong> {user.cedula}</span>
                            <span style={{ fontSize: 12, color: '#6b7280' }}><strong style={{ color: '#374151' }}>Código:</strong> {user.customerId}</span>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#ecfdf5', color: '#065f46', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid #a7f3d0' }}>
                    <CheckCircle style={{ width: 14, height: 14 }} />
                    Socio Activo
                </div>
            </div>

            {/* ── KPIs ──────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
                {/* Total Ahorrado */}
                <div style={{ flex: 1, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#10b981', borderRadius: '12px 0 0 12px' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingLeft: 8 }}>
                        <div style={{ padding: 7, background: '#ecfdf5', borderRadius: 8 }}>
                            <PiggyBank style={{ width: 16, height: 16, color: '#059669' }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Total Ahorrado</span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.5px', paddingLeft: 8 }}>{fmt(stats.totalAhorrado)}</div>
                </div>

                {/* # de Aportes */}
                <div style={{ flex: 1, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#3b82f6', borderRadius: '12px 0 0 12px' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingLeft: 8 }}>
                        <div style={{ padding: 7, background: '#eff6ff', borderRadius: 8 }}>
                            <BarChart3 style={{ width: 16, height: 16, color: '#2563eb' }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}># de Aportes</span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.5px', paddingLeft: 8 }}>{stats.numAportes}</div>
                </div>

                {/* Total Penalizado */}
                <div style={{ flex: 1, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#f97316', borderRadius: '12px 0 0 12px' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingLeft: 8 }}>
                        <div style={{ padding: 7, background: '#fff7ed', borderRadius: 8 }}>
                            <AlertTriangle style={{ width: 16, height: 16, color: '#ea580c' }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Total Penalizado</span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.5px', paddingLeft: 8 }}>{fmt(stats.totalPenalizado)}</div>
                </div>
            </div>

            {/* ── Chart ─────────────────────────────────────────── */}
            {chartImage && (
                <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                        <div style={{ width: 4, height: 20, background: '#10b981', borderRadius: 4 }} />
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Análisis Gráfico Anual</span>
                    </div>
                    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <img
                            src={chartImage}
                            alt="Gráfico de Ahorros Anuales"
                            style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain' }}
                        />
                    </div>
                </div>
            )}

            {/* ── Footer note ────────────────────────────────────── */}
            <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid #f3f4f6', textAlign: 'center' }}>
                <div style={{ width: 48, height: 3, background: '#e5e7eb', borderRadius: 4, margin: '0 auto 10px' }} />
                <p style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 2 }}>
                    Documento Oficial · Uso Confidencial
                </p>
                <p style={{ fontSize: 9, color: '#9ca3af' }}>
                    El detalle de movimientos se muestra a continuación en el documento.
                </p>
            </div>
        </div>
    );
});

SavingsListPDF.displayName = 'SavingsListPDF';
export default SavingsListPDF;