'use strict';

/**
 * Sincroniza un snapshot diario de Usuarios y Casos de asesor a un Google
 * Sheet en la nube, usando una cuenta de servicio de Google Cloud.
 *
 * Cada corrida SOBRESCRIBE el contenido de las pestañas "Usuarios" y
 * "Casos asesor" con el estado actual (no se acumulan filas día a día;
 * el backup .xlsx en /backups ya cumple ese rol histórico). Así el Sheet
 * siempre refleja el estado más reciente, actualizado automáticamente
 * cada día junto con el backup local.
 *
 * ── Configuración requerida (variables de entorno) ─────────────────
 *   GOOGLE_SHEET_ID               → ID de la hoja (está en la URL del Sheet)
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL  → email de la cuenta de servicio
 *   GOOGLE_PRIVATE_KEY            → llave privada de la cuenta de servicio
 *
 * Pasos para habilitarlo:
 *   1. Crear un proyecto en https://console.cloud.google.com/ y habilitar
 *      la API de Google Sheets.
 *   2. Crear una cuenta de servicio (Service Account) y descargar su JSON
 *      de credenciales.
 *   3. Copiar "client_email" → GOOGLE_SERVICE_ACCOUNT_EMAIL
 *      y "private_key" → GOOGLE_PRIVATE_KEY (dejar los \n tal cual, como
 *      texto, en el .env).
 *   4. Crear una hoja de cálculo en Google Sheets y compartirla con el
 *      email de la cuenta de servicio (permiso Editor).
 *   5. Copiar el ID del Sheet (el texto entre /d/ y /edit en la URL) →
 *      GOOGLE_SHEET_ID.
 *
 * Si estas variables no están configuradas, la sincronización simplemente
 * se omite (no rompe el backup local).
 */

const config = require('../config/app.config');
const repo   = require('./repository');

let _cachedDoc = null;

const _isConfigured = () =>
  Boolean(config.googleSheets.sheetId && config.googleSheets.clientEmail && config.googleSheets.privateKey);

const _getDoc = async () => {
  if (_cachedDoc) return _cachedDoc;

  // Import diferido: si el paquete no está instalado o no se usa esta
  // función, el resto del bot sigue funcionando sin problema.
  const { GoogleSpreadsheet } = require('google-spreadsheet');
  const { JWT } = require('google-auth-library');

  const auth = new JWT({
    email:  config.googleSheets.clientEmail,
    key:    config.googleSheets.privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(config.googleSheets.sheetId, auth);
  await doc.loadInfo();
  _cachedDoc = doc;
  return doc;
};

const _getOrCreateSheet = async (doc, title, headerValues) => {
  let sheet = doc.sheetsByTitle[title];
  if (!sheet) {
    sheet = await doc.addSheet({ title, headerValues });
  } else {
    await sheet.loadHeaderRow().catch(() => {}); // por si la hoja está vacía
    if (!sheet.headerValues || sheet.headerValues.length === 0) {
      await sheet.setHeaderRow(headerValues);
    }
  }
  return sheet;
};

const _replaceRows = async (sheet, headerValues, rows) => {
  await sheet.clear();
  await sheet.setHeaderRow(headerValues);
  if (rows.length) await sheet.addRows(rows);
};

const syncDailySnapshot = async () => {
  if (!_isConfigured()) {
    console.log('[Sheets] Sincronización con Google Sheets no configurada (revisa .env). Se omite.');
    return false;
  }

  const doc = await _getDoc();

  // ── Usuarios ──────────────────────────────────────────────
  const usuariosHeader = [
    'WhatsApp', 'Nombre WhatsApp', 'Nombre registrado', 'Tipo documento',
    'Documento', 'Barrio', 'Comuna', 'Categoría Sisbén', 'Autorizó datos',
    'Creado', 'Actualizado',
  ];
  const usuariosSheet = await _getOrCreateSheet(doc, 'Usuarios', usuariosHeader);
  const usuariosRows = repo.getAllUsers().map((u) => ({
    'WhatsApp': u.phone,
    'Nombre WhatsApp': u.whatsappName,
    'Nombre registrado': u.name,
    'Tipo documento': u.docType,
    'Documento': u.documentNumber,
    'Barrio': u.barrio,
    'Comuna': u.comuna,
    'Categoría Sisbén': u.sisbenCategory,
    'Autorizó datos': u.authorized ? 'SI' : 'NO',
    'Creado': u.createdAt,
    'Actualizado': u.updatedAt,
  }));
  await _replaceRows(usuariosSheet, usuariosHeader, usuariosRows);

  // ── Casos de asesor ───────────────────────────────────────
  const casosHeader = [
    'ID', 'Fecha/Hora', 'Fecha Colombia', 'WhatsApp', 'Nombre', 'Tipo Doc',
    'Documento', 'Barrio', 'Comuna', 'Motivo', 'Estado', 'Cerrado', 'Notas',
  ];
  const casosSheet = await _getOrCreateSheet(doc, 'Casos asesor', casosHeader);
  const casosRows = repo.getAllCases().map((c) => {
    const j = c.toJSON();
    return {
      'ID': j.id,
      'Fecha/Hora': j.ts,
      'Fecha Colombia': j.date_co,
      'WhatsApp': j.phone,
      'Nombre': j.name,
      'Tipo Doc': j.doc_type,
      'Documento': j.document_number,
      'Barrio': j.barrio,
      'Comuna': j.comuna,
      'Motivo': j.reason,
      'Estado': j.status,
      'Cerrado': j.closed_at,
      'Notas': j.notes,
    };
  });
  await _replaceRows(casosSheet, casosHeader, casosRows);

  console.log('[Sheets] ✅ Snapshot diario sincronizado con Google Sheets.');
  return true;
};

module.exports = { syncDailySnapshot };
