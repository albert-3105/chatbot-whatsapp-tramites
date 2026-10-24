'use strict';

/**
 * Sube el archivo .xlsx del backup diario a una carpeta de Google Drive,
 * usando la misma cuenta de servicio que ya usan para Google Sheets
 * (google-auth-library ya está en package.json, no se agrega dependencia
 * nueva).
 *
 * ── IMPORTANTE sobre cuentas de servicio y Drive ────────────────────
 * Una cuenta de servicio NO tiene cuota de almacenamiento propia en "Mi
 * unidad". Para que esto funcione tienen que:
 *   1. Crear (o usar) una carpeta en el Google Drive de una cuenta real
 *      (la del proyecto/organización).
 *   2. Compartir esa carpeta con el email de la cuenta de servicio
 *      (tu-cuenta@tu-proyecto.iam.gserviceaccount.com) dándole permiso de "Editor".
 *   3. Copiar el ID de esa carpeta (está en la URL, después de
 *      /folders/) → variable GOOGLE_DRIVE_BACKUP_FOLDER_ID.
 * Si usan una carpeta normal de "Mi unidad" compartida, el espacio se
 * descuenta de la cuenta del dueño de la carpeta, no de la cuenta de
 * servicio (que no tiene espacio propio) — así que esto funciona bien.
 * Si en cambio ven un error de "storageQuotaExceeded" es porque la
 * carpeta no está realmente compartida como Editor con la cuenta de
 * servicio, o intentaron subir a la raíz de la cuenta de servicio.
 *
 * Configuración (.env):
 *   GOOGLE_DRIVE_BACKUP_FOLDER_ID=xxxxxxxxxxxxxxxxx
 *
 * Si la variable no está configurada, la subida simplemente se omite
 * (no rompe el backup local ni la sync a Sheets).
 */

const fs = require('fs');
const path = require('path');
const config = require('../config/app.config');

const FOLDER_ID = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID || '';

const _isConfigured = () =>
  Boolean(FOLDER_ID && config.googleSheets.clientEmail && config.googleSheets.privateKey);

let _cachedToken = null; // { token, expiresAt }

const _getAccessToken = async () => {
  if (_cachedToken && _cachedToken.expiresAt > Date.now() + 60_000) {
    return _cachedToken.token;
  }
  const { JWT } = require('google-auth-library');
  const auth = new JWT({
    email: config.googleSheets.clientEmail,
    key: config.googleSheets.privateKey,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  const credentials = await auth.authorize();
  _cachedToken = { token: credentials.access_token, expiresAt: Date.now() + 55 * 60 * 1000 };
  return _cachedToken.token;
};

/**
 * Sube (o reemplaza) el archivo de backup del día en la carpeta de Drive.
 * Si ya existe un archivo con el mismo nombre en la carpeta, lo sobrescribe
 * (evita ir acumulando copias infinitas allá arriba — la limpieza de
 * históricos ya la hace backup.service.js localmente).
 */
const uploadBackup = async (filePath) => {
  if (!_isConfigured()) {
    console.log('[Drive] Sin configurar (falta GOOGLE_DRIVE_BACKUP_FOLDER_ID) — se omite subida.');
    return null;
  }

  try {
    const token = await _getAccessToken();
    const fileName = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);

    // Buscar si ya existe un archivo con ese nombre en la carpeta.
    const searchUrl =
      `https://www.googleapis.com/drive/v3/files?q=` +
      encodeURIComponent(`name='${fileName}' and '${FOLDER_ID}' in parents and trashed=false`) +
      `&fields=files(id,name)`;
    const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${token}` } });
    const searchData = await searchRes.json();
    const existingId = searchData?.files?.[0]?.id || null;

    const metadata = existingId
      ? { name: fileName }
      : { name: fileName, parents: [FOLDER_ID] };

    const boundary = 'sisy-backup-boundary';
    const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    const multipartBody = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
      ),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const uploadUrl = existingId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

    const uploadRes = await fetch(uploadUrl, {
      method: existingId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      throw new Error(uploadData?.error?.message || `HTTP ${uploadRes.status}`);
    }

    console.log(`[Drive] ✅ Backup subido a Drive: ${fileName} (${existingId ? 'actualizado' : 'nuevo'})`);
    return uploadData;
  } catch (e) {
    console.error('[Drive] ❌ Error subiendo backup:', e.message);
    return null;
  }
};

module.exports = { uploadBackup };
