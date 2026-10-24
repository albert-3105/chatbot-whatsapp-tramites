'use strict';

const config     = require('../config/app.config');
const inactivity = require('../infrastructure/inactivity.service');

const _sessions = new Map(); // fromId → { timer, activatedAt, lastAdvisorAt }
let   _sendFn   = null;      // inyectado desde whatsapp.client al iniciar

const init = (sendMessageFn) => { _sendFn = sendMessageFn; };

const _expireMessage =
  '⏱️ El tiempo de atención con el asesor ha finalizado.\n\nSi necesitas más ayuda, escribe *hola* para volver al menú.';

const _scheduleExpiry = (fromId) =>
  setTimeout(() => {
    _sessions.delete(fromId);
    console.log(`[Asesor] Expirado: ${fromId}`);
    if (_sendFn) _sendFn(fromId, _expireMessage).catch(() => {});
  }, config.bot.advisorTimeoutMs);

const activate = (fromId) => {
  // Mientras el asesor tiene el chat, el timeout de asesor manda —
  // se cancela el timer de "cierre por inactividad de menú" para que
  // no le reinicie el step al ciudadano en medio de la atención humana.
  inactivity.clear(fromId);

  const existing = _sessions.get(fromId);
  if (existing?.timer) clearTimeout(existing.timer);
  _sessions.set(fromId, {
    timer:         _scheduleExpiry(fromId),
    activatedAt:   Date.now(),
    lastAdvisorAt: Date.now(),
  });
  console.log(`[Asesor] Activado: ${fromId} — expira en ${config.bot.advisorTimeoutMs / 60000} min`);
};

const renew = (fromId) => {
  const session = _sessions.get(fromId);
  if (!session) return;
  clearTimeout(session.timer);
  session.timer         = _scheduleExpiry(fromId);
  session.lastAdvisorAt = Date.now();
  _sessions.set(fromId, session);
};

const deactivate = (fromId) => {
  const session = _sessions.get(fromId);
  if (session?.timer) clearTimeout(session.timer);
  _sessions.delete(fromId);
  console.log(`[Asesor] Desactivado: ${fromId}`);
};

const isActive = (fromId) => _sessions.has(fromId);

const getStatus = (fromId) => {
  const session = _sessions.get(fromId);
  if (!session) return null;
  const elapsed = Math.round((Date.now() - session.activatedAt) / 60000);
  const remaining = Math.max(
    0,
    Math.round((config.bot.advisorTimeoutMs - (Date.now() - session.lastAdvisorAt)) / 60000)
  );
  return { elapsed, remaining };
};

module.exports = { init, activate, renew, deactivate, isActive, getStatus };
