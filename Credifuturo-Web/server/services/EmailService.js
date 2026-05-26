const nodemailer = require('nodemailer');

const ADMIN_EMAIL = 'vladichakadc@gmail.com';

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

module.exports = { sendResetRequestNotification };
