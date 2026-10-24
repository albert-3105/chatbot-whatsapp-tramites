'use strict';

require('dotenv').config();

// Convierte "\n" literal (como llega desde .env) en saltos de línea reales,
// que es lo que espera la librería de Google para la private key.
const _formatPrivateKey = (key) => (key ? key.replace(/\\n/g, '\n') : '');

const config = {
  bot: {
    name:               process.env.BOT_NAME              || 'S.I.S.I',
    fullName:           process.env.BOT_FULL_NAME         || 'Sistema de Información SISBEN Inteligente',
    adminNumber:        process.env.ADMIN_NUMBER           || '',
    requireDataConsent: String(process.env.REQUIRE_DATA_CONSENT || 'true').toLowerCase() === 'true',
    antiSpamDelayMs:    Number(process.env.ANTI_SPAM_DELAY_MS   || 1200),
    advisorTimeoutMs:   Number(process.env.ADVISOR_TIMEOUT_MS   || 15 * 60 * 1000),
    startedAtSeconds:   Math.floor(Date.now() / 1000),
  },
  schedule: {
    days:      [1, 2, 3, 4, 5],
    startHour: 7,
    startMin:  30,
    endHour:   15,
    endMin:    0,
  },
  data: {
    dir:     process.env.DATA_DIR || './data',
    exports: (process.env.DATA_DIR || './data') + '/exports',
  },
  sisben: {
    formUrl: 'https://territoriosisben.sisben.gov.co/Persona',
  },
  googleSheets: {
    // Sin valores por defecto embebidos: si falta algo en .env, queda
    // vacío y las funciones que lo usan (sheets/drive backup) lo detectan
    // y avisan en vez de fallar silenciosamente con datos de otro proyecto.
    sheetId:     process.env.GOOGLE_SHEET_ID              || '',
    clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL  || '',
    privateKey:  _formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY || ''),
  },
};

if (!config.bot.adminNumber) {
  console.warn('[Config] ⚠️ Falta ADMIN_NUMBER en .env — nadie podrá usar el panel admin.');
}

module.exports = config;
