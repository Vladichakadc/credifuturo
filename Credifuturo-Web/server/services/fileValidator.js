// A08 (Software and Data Integrity Failures): valida el tipo REAL del archivo
// subido leyendo los primeros bytes (magic numbers), NO el `mimetype` que
// declara el cliente — ese se puede mentir trivialmente.
//
// Uso: aplicar como middleware DESPUÉS de multer:
//   router.post('/x', upload.single('soporte'), verifyFileMagicBytes, handler);

const FileType = require('file-type');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

async function verifyFileMagicBytes(req, res, next) {
    if (!req.file || !req.file.buffer) return next();
    try {
        const detected = await FileType.fromBuffer(req.file.buffer);
        if (!detected) {
            return res.status(400).json({
                error: 'No se pudo determinar el tipo del archivo. Solo se permiten JPG, PNG, GIF, WEBP o PDF.'
            });
        }
        if (!ALLOWED_MIME.includes(detected.mime)) {
            return res.status(400).json({
                error: `Tipo de archivo no permitido: ${detected.mime}. Solo se permiten JPG, PNG, GIF, WEBP o PDF.`
            });
        }
        // El mimetype declarado puede ser mentira: usamos el detectado como autoridad.
        req.file.mimetype = detected.mime;
        next();
    } catch (e) {
        return res.status(400).json({ error: 'Error validando archivo: ' + e.message });
    }
}

// A05 (HTTP Response Header Injection / CWE-113): sanitiza el nombre original
// del archivo antes de meterlo en el header Content-Disposition. El nombre
// viene del cliente al subir, puede contener CRLF, comillas, etc.
function sanitizeFilename(name) {
    const fallback = 'soporte';
    if (!name || typeof name !== 'string') return fallback;
    // Quitar CR, LF, comillas dobles, backslash; limitar longitud.
    const cleaned = name.replace(/[\r\n"\\]/g, '').trim().substring(0, 200);
    return cleaned || fallback;
}

module.exports = { verifyFileMagicBytes, ALLOWED_MIME, sanitizeFilename };
