// A07 (Identification and Authentication Failures): política de contraseñas centralizada.
// Reglas: ≥8 caracteres, al menos una mayúscula, una minúscula y un dígito.
//
// validatePassword(pwd) → null si es válida, string con error si no lo es.
// generateTempPassword() → contraseña aleatoria de 12 chars que cumple la política.

const crypto = require('crypto');

function validatePassword(pwd) {
    if (typeof pwd !== 'string') return 'La contraseña es obligatoria.';
    if (pwd.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (!/[A-Z]/.test(pwd)) return 'La contraseña debe contener al menos una mayúscula.';
    if (!/[a-z]/.test(pwd)) return 'La contraseña debe contener al menos una minúscula.';
    if (!/\d/.test(pwd)) return 'La contraseña debe contener al menos un número.';
    return null;
}

function generateTempPassword() {
    // 4 bytes hex (8 chars) + un par garantizado para cumplir mayúscula/minúscula/dígito
    const base = crypto.randomBytes(4).toString('hex'); // a-f0-9, 8 chars
    return `A${base}9z`; // 11 chars: 'A' + 8 hex + '9z' → cumple política
}

module.exports = { validatePassword, generateTempPassword };
