import React from 'react';
import { PiggyBank, Database, BarChart3, TrendingUp, CheckCircle, Clock } from 'lucide-react';

// Helper to format currency
const fmt = (v) => `$${Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtDate = (d) => new Date(d).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

const AccountSummaryPDF = React.forwardRef(({ user, stats, charts, generationDate }, ref) => {
    return (
        // ⚠️ IMPORTANT: All layout uses INLINE styles instead of Tailwind classes.
        // This is critical: html2canvas does not reliably compute computed CSS from
        // Tailwind's utility classes, which causes chart overlapping. Inline styles
        // are always applied directly on the element and are read correctly.
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
                width: 220, height: 220,
                background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)',
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
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: '-0.5px' }}>Resumen Ejecutivo</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 6, fontSize: 10, color: '#6b7280', background: '#f9fafb', padding: '5px 10px', borderRadius: 6, border: '1px solid #e5e7eb' }}>
                        <Clock style={{ width: 12, height: 12, color: '#6366f1' }} />
                        Generado: {fmtDate(generationDate)} · {fmtTime(generationDate)}
                    </div>
                </div>
            </div>

            {/* ── User Info ─────────────────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', borderRadius: 12, padding: '16px 20px', border: '1px solid #e5e7eb', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 44, height: 44, background: 'rgba(99,102,241,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#4f46e5', flexShrink: 0 }}>
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
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#8b5cf6', borderRadius: '12px 0 0 12px' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingLeft: 8 }}>
                        <div style={{ padding: 7, background: '#f5f3ff', borderRadius: 8 }}>
                            <PiggyBank style={{ width: 16, height: 16, color: '#7c3aed' }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Total Ahorrado</span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.5px', paddingLeft: 8 }}>{fmt(stats.totalAhorradoGeneral)}</div>
                </div>
                {/* Capital Ahorrado */}
                <div style={{ flex: 1, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#10b981', borderRadius: '12px 0 0 12px' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingLeft: 8 }}>
                        <div style={{ padding: 7, background: '#ecfdf5', borderRadius: 8 }}>
                            <PiggyBank style={{ width: 16, height: 16, color: '#059669' }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Capital Ahorrado</span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.5px', paddingLeft: 8 }}>{fmt(stats.totalSavings)}</div>
                </div>
                {/* Aportes Iniciales */}
                <div style={{ flex: 1, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#f59e0b', borderRadius: '12px 0 0 12px' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingLeft: 8 }}>
                        <div style={{ padding: 7, background: '#fffbeb', borderRadius: 8 }}>
                            <Database style={{ width: 16, height: 16, color: '#d97706' }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Aportes Iniciales</span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.5px', paddingLeft: 8 }}>{fmt(stats.totalInitialContributions)}</div>
                </div>
            </div>

            {/* ── Charts Section ────────────────────────────────── */}
            {(charts?.summaryChart || charts?.trendChart) && (
                <div style={{ marginBottom: 24 }}>
                    {/* Section Title */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <div style={{ width: 4, height: 20, background: '#6366f1', borderRadius: 4 }} />
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Análisis Financiero</span>
                    </div>

                    {/* ⚠️ KEY FIX: Using display:flex with explicit width on each child.
                          This is what prevents the charts from overlapping in html2canvas.
                          CSS Grid can fail because html2canvas may not resolve grid-template-columns
                          from utility classes at capture time. */}
                    <div style={{ display: 'flex', flexDirection: 'row', gap: 14, width: '100%' }}>
                        {/* Chart 1 — Distribución */}
                        {charts.summaryChart && (
                            <div style={{ flex: '0 0 calc(50% - 7px)', width: 'calc(50% - 7px)', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', boxSizing: 'border-box' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12, fontWeight: 700, color: '#374151' }}>
                                    <BarChart3 style={{ width: 14, height: 14, color: '#6366f1' }} />
                                    Distribución Consolidada
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 180 }}>
                                    <img
                                        src={charts.summaryChart}
                                        alt="Resumen"
                                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.06))' }}
                                    />
                                </div>
                            </div>
                        )}
                        {/* Chart 2 — Tendencia */}
                        {charts.trendChart && (
                            <div style={{ flex: '0 0 calc(50% - 7px)', width: 'calc(50% - 7px)', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', boxSizing: 'border-box' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12, fontWeight: 700, color: '#374151' }}>
                                    <TrendingUp style={{ width: 14, height: 14, color: '#6366f1' }} />
                                    Tendencia Mensual
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 180 }}>
                                    <img
                                        src={charts.trendChart}
                                        alt="Tendencia"
                                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.06))' }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Footer (embedded in the image portion) ────────── */}
            <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid #f3f4f6', textAlign: 'center' }}>
                <div style={{ width: 48, height: 3, background: '#e5e7eb', borderRadius: 4, margin: '0 auto 10px' }} />
                <p style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 2 }}>
                    Documento Oficial · Uso Confidencial
                </p>
                <p style={{ fontSize: 9, color: '#9ca3af' }}>
                    La tabla de movimientos se muestra en la siguiente sección del documento.
                </p>
            </div>
        </div>
    );
});

AccountSummaryPDF.displayName = 'AccountSummaryPDF';
export default AccountSummaryPDF;