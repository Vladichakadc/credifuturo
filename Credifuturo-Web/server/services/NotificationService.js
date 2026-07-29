// Notificaciones en la app (campana). Nunca lanza — así los call sites pueden
// hacer await sin try/catch propio; un fallo aquí no debe romper la ruta que
// dispara el evento real (aprobar un préstamo, registrar un ahorro, etc).

const Notification = require('../models/Notification');
const Client = require('../models/Client');

async function createNotification({ clientId, type, title, message = null, link = null }) {
    try {
        return await Notification.create({ clientId, type, title, message, link });
    } catch (err) {
        console.error('[NotificationService] Error creando notificación:', err.message);
        return null;
    }
}

async function notifyAdmins({ type, title, message = null, link = null }) {
    try {
        const admins = await Client.findAll({ where: { role: 'admin' }, attributes: ['id'] });
        await Promise.all(admins.map(a => createNotification({ clientId: a.id, type, title, message, link })));
    } catch (err) {
        console.error('[NotificationService] Error notificando admins:', err.message);
    }
}

// Notifica a una lista arbitraria de clientId ya resuelta por el call site (ej. la
// Junta Administrativa, cuyos miembros exactos se calculan en admin.js).
async function notifyMany(clientIds, { type, title, message = null, link = null }) {
    try {
        await Promise.all((clientIds || []).map(id => createNotification({ clientId: id, type, title, message, link })));
    } catch (err) {
        console.error('[NotificationService] Error en notifyMany:', err.message);
    }
}

module.exports = { createNotification, notifyAdmins, notifyMany };
