const nodemailer = require('nodemailer');

const ADMIN_EMAIL = 'vladichakadc@gmail.com';

// Dominio de correo auto-generado para socios sin email propio (ver
// generateUniqueEmail en routes/admin.js y el importador legacy en
// DataImportService.js). NO es un dominio real habilitado para recibir
// correo — cualquier envío a esta dirección rebota/queda en reintento
// indefinido en el buzón remitente. Los socios sin correo real solo se
// enteran por la notificación in-app (campana), que siempre se dispara
// en paralelo a estos envíos.
const DOMINIO_NO_HABILITADO = '@credifuturo.com';
const tieneCorreoReal = (email) => !!email && !email.toLowerCase().endsWith(DOMINIO_NO_HABILITADO);

function createTransport() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        }
    });
}

async function sendResetRequestNotification(socio) {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.warn('[EmailService] GMAIL_USER o GMAIL_APP_PASSWORD no configurados. Correo no enviado.');
        return;
    }
    const transporter = createTransport();
    const nombre = `${socio.name || ''} ${socio.surname1 || ''}`.trim() || socio.cedula || 'Socio';
    const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });

    await transporter.sendMail({
        from: `"Credifuturo Sistema" <${process.env.GMAIL_USER}>`,
        to: ADMIN_EMAIL,
        subject: `[Credifuturo] Solicitud de restablecimiento de contraseña – ${nombre}`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <div style="background:#166534;padding:20px 24px;">
                    <h2 style="color:#fff;margin:0;font-size:18px;">Credifuturo – Solicitud de Contraseña</h2>
                </div>
                <div style="padding:24px;">
                    <p style="color:#374151;margin:0 0 12px;">Se ha registrado una solicitud de restablecimiento de contraseña:</p>
                    <table style="width:100%;border-collapse:collapse;font-size:14px;">
                        <tr><td style="padding:6px 0;color:#6b7280;width:120px;">Socio:</td><td style="color:#111827;font-weight:600;">${nombre}</td></tr>
                        <tr><td style="padding:6px 0;color:#6b7280;">Cédula:</td><td style="color:#111827;">${socio.cedula || '—'}</td></tr>
                        <tr><td style="padding:6px 0;color:#6b7280;">Correo:</td><td style="color:#111827;">${socio.email || '—'}</td></tr>
                        <tr><td style="padding:6px 0;color:#6b7280;">Fecha:</td><td style="color:#111827;">${fecha}</td></tr>
                    </table>
                    <div style="margin-top:20px;padding:12px;background:#fef3c7;border-radius:6px;border-left:4px solid #fbbf24;">
                        <p style="margin:0;font-size:13px;color:#92400e;">Ingrese al panel de administración → Socios → Solicitudes para gestionar esta solicitud.</p>
                    </div>
                </div>
                <div style="padding:12px 24px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;">
                    Este es un mensaje automático del sistema Credifuturo.
                </div>
            </div>
        `
    });
}

const fmtCOP = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const fmtFechaCorta = (d) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
};

// Solicitud de préstamo enviada por un socio desde el simulador → notifica al gerente
async function sendLoanRequestNotification(socio, request) {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.warn('[EmailService] GMAIL_USER o GMAIL_APP_PASSWORD no configurados. Correo no enviado.');
        return;
    }
    const transporter = createTransport();
    const nombre = `${socio.name || ''} ${socio.surname1 || ''}`.trim() || socio.cedula || 'Socio';

    await transporter.sendMail({
        from: `"Credifuturo Sistema" <${process.env.GMAIL_USER}>`,
        to: ADMIN_EMAIL,
        subject: `[Credifuturo] Nueva solicitud de préstamo de ${nombre}`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <div style="background:#166534;padding:20px 24px;">
                    <h2 style="color:#fff;margin:0;font-size:18px;">Nueva solicitud de préstamo</h2>
                    <p style="color:#bbf7d0;margin:4px 0 0;font-size:13px;">${nombre} acaba de pedir un crédito desde el simulador.</p>
                </div>
                <div style="padding:24px;">
                    <table style="width:100%;border-collapse:collapse;font-size:14px;">
                        <tr><td style="padding:6px 0;color:#6b7280;width:140px;">Socio:</td><td style="color:#111827;font-weight:600;">${nombre}</td></tr>
                        <tr><td style="padding:6px 0;color:#6b7280;">Cédula:</td><td style="color:#111827;">${socio.cedula || '—'}</td></tr>
                        <tr><td style="padding:6px 0;color:#6b7280;">Monto solicitado:</td><td style="color:#111827;font-weight:700;">${fmtCOP(request.amount)}</td></tr>
                        <tr><td style="padding:6px 0;color:#6b7280;">Plazo:</td><td style="color:#111827;">${request.installments} cuota(s) mensuales</td></tr>
                        <tr><td style="padding:6px 0;color:#6b7280;">Tasa:</td><td style="color:#111827;">${Number(request.monthlyRate).toFixed(1)}% mensual</td></tr>
                        <tr><td style="padding:6px 0;color:#6b7280;">Primera cuota:</td><td style="color:#111827;">${fmtCOP(request.firstInstallment)}</td></tr>
                        <tr><td style="padding:6px 0;color:#6b7280;">Score crediticio:</td><td style="color:#111827;">${request.scoreAtRequest != null ? `${request.scoreAtRequest}/100` : '—'}</td></tr>
                    </table>
                    ${request.requiresVote ? `
                    <div style="margin-top:16px;padding:12px;background:#fef3c7;border-radius:6px;border-left:4px solid #f59e0b;">
                        <p style="margin:0;font-size:13px;color:#92400e;"><strong>Atención:</strong> el monto supera el cupo de aprobación directa (3× ahorro) de este socio. Revísalo con cuidado antes de decidir.</p>
                    </div>` : ''}
                    <div style="margin-top:16px;padding:12px;background:#f0fdf4;border-radius:6px;border-left:4px solid #166534;">
                        <p style="margin:0;font-size:13px;color:#166534;">Ingresa al panel de administración → Préstamos → Aprobaciones de Préstamos para ver su análisis de viabilidad completo y decidir.</p>
                    </div>
                </div>
                <div style="padding:12px 24px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;">
                    Este es un mensaje automático del sistema Credifuturo.
                </div>
            </div>
        `
    });
}

// Préstamo aprobado por el gerente → confirma al socio
async function sendLoanApprovalNotification(socio, request) {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.warn('[EmailService] GMAIL_USER o GMAIL_APP_PASSWORD no configurados. Correo no enviado.');
        return;
    }
    if (!tieneCorreoReal(socio.email)) {
        console.warn(`[EmailService] Socio sin correo real (${socio.email || 'ninguno'}) — se omite el email de aprobación; queda la notificación in-app.`);
        return;
    }
    const transporter = createTransport();
    const nombre = `${socio.name || ''} ${socio.surname1 || ''}`.trim() || socio.cedula || 'Socio';

    await transporter.sendMail({
        from: `"Credifuturo Sistema" <${process.env.GMAIL_USER}>`,
        to: socio.email,
        subject: `Tu préstamo fue aprobado, ${socio.name || nombre}`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <div style="background:#166534;padding:24px;text-align:center;">
                    <p style="color:#bbf7d0;margin:0 0 6px;font-size:13px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Crédito aprobado</p>
                    <h2 style="color:#fff;margin:0;font-size:22px;">Buenas noticias, ${socio.name || nombre}.</h2>
                </div>
                <div style="padding:24px;">
                    <p style="color:#374151;margin:0 0 16px;line-height:1.6;">
                        El comité revisó tu solicitud y aprobó tu préstamo. Estos son los términos con los que quedó:
                    </p>
                    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
                        <tr><td style="padding:6px 0;color:#6b7280;width:160px;">Monto aprobado:</td><td style="color:#111827;font-weight:700;">${fmtCOP(request.amount)}</td></tr>
                        <tr><td style="padding:6px 0;color:#6b7280;">Plazo:</td><td style="color:#111827;">${request.installments} cuota(s) mensuales</td></tr>
                        <tr><td style="padding:6px 0;color:#6b7280;">Tasa:</td><td style="color:#111827;">${Number(request.monthlyRate).toFixed(1)}% mensual</td></tr>
                        <tr><td style="padding:6px 0;color:#6b7280;">Primera cuota:</td><td style="color:#111827;">${fmtCOP(request.firstInstallment)}</td></tr>
                        <tr><td style="padding:6px 0;color:#6b7280;">Fecha estimada de pago final:</td><td style="color:#111827;">${fmtFechaCorta(request.estimatedEndDate)}</td></tr>
                    </table>
                    ${request.reviewNote ? `
                    <div style="padding:12px;background:#f9fafb;border-radius:6px;border-left:4px solid #d1d5db;margin-bottom:16px;">
                        <p style="margin:0;font-size:13px;color:#4b5563;"><strong>Nota del gerente:</strong> ${request.reviewNote}</p>
                    </div>` : ''}
                    <div style="padding:12px;background:#f0fdf4;border-radius:6px;border-left:4px solid #166534;">
                        <p style="margin:0;font-size:13px;color:#166534;">El gerente se pondrá en contacto contigo para coordinar el desembolso. Cualquier duda, puedes escribirle directamente.</p>
                    </div>
                </div>
                <div style="padding:12px 24px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;">
                    Fondo Familiar Credifuturo · Este es un mensaje automático del sistema.
                </div>
            </div>
        `
    });
}

// Préstamo rechazado por el gerente → informa al socio (tono respetuoso, sin la
// misma elaboración de la aprobación)
async function sendLoanRejectionNotification(socio, request) {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.warn('[EmailService] GMAIL_USER o GMAIL_APP_PASSWORD no configurados. Correo no enviado.');
        return;
    }
    if (!tieneCorreoReal(socio.email)) {
        console.warn(`[EmailService] Socio sin correo real (${socio.email || 'ninguno'}) — se omite el email de rechazo; queda la notificación in-app.`);
        return;
    }
    const transporter = createTransport();
    const nombre = `${socio.name || ''} ${socio.surname1 || ''}`.trim() || socio.cedula || 'Socio';

    await transporter.sendMail({
        from: `"Credifuturo Sistema" <${process.env.GMAIL_USER}>`,
        to: socio.email,
        subject: `Novedades sobre tu solicitud de préstamo`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <div style="background:#166534;padding:20px 24px;">
                    <h2 style="color:#fff;margin:0;font-size:18px;">Tu solicitud de préstamo</h2>
                </div>
                <div style="padding:24px;">
                    <p style="color:#374151;margin:0 0 12px;line-height:1.6;">
                        Hola ${socio.name || nombre}, revisamos tu solicitud de ${fmtCOP(request.amount)} a ${request.installments} cuota(s) y por ahora no fue posible aprobarla.
                    </p>
                    ${request.reviewNote ? `
                    <div style="padding:12px;background:#f9fafb;border-radius:6px;border-left:4px solid #d1d5db;margin-bottom:12px;">
                        <p style="margin:0;font-size:13px;color:#4b5563;"><strong>Motivo:</strong> ${request.reviewNote}</p>
                    </div>` : ''}
                    <p style="color:#374151;margin:0;line-height:1.6;">
                        Puedes volver a simular otro monto o plazo en cualquier momento desde el Simulador de Préstamo, o hablar directamente con el gerente si tienes preguntas.
                    </p>
                </div>
                <div style="padding:12px 24px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;">
                    Fondo Familiar Credifuturo · Este es un mensaje automático del sistema.
                </div>
            </div>
        `
    });
}

module.exports = {
    sendResetRequestNotification,
    sendLoanRequestNotification,
    sendLoanApprovalNotification,
    sendLoanRejectionNotification
};
