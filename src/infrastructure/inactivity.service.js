'use strict';

/**
 * Cierra automáticamente la conversación de un ciudadano si lleva mucho
 * tiempo sin escribir, para que no se quede "atascado" en un paso a medias
 * (por ejemplo esperando que digite un documento) y la próxima vez que
 * escriba arranque limpio desde el menú.
 *
 * Sigue el mismo patrón que advisor.service.js (timer por usuario, se
 * reinicia con cada mensaje del ciudadano).
 *
 * Configuración (.env):
 *   CITIZEN_INACTIVITY_MS=1800000   → 30 min por defecto
 */

const repo = require('./repository');
const { USER_STEPS } = require('../domain/constants');

const TIMEOUT_MS = Number(process.env.CITIZEN_INACTIVITY_MS || 30 * 60 * 1000);

const _timers = new Map(); // fromId → timer
let _sendFn = null;        // inyectado desde whatsapp.client

const init = (sendMessageFn) => {
  _sendFn = sendMessageFn;
};

const _closeMessage =
  '👋 Como no hemos tenido actividad en un rato, cerré esta conversación.\n\n' +
  'Escribe *hola* cuando quieras y te muestro el menú de nuevo.';

const _closeSession = (fromId) => {
  _timers.delete(fromId);
  try {
    const user = repo.findUser(fromId);
    // Solo reinicia si el usuario quedó "a medias" en un flujo; si ya
    // estaba en 'ready' (registrado y sin flujo activo) no hace falta
    // avisar ni tocar nada.
    if (user && user.step && user.step !== USER_STEPS.READY) {
      user.step = USER_STEPS.READY;
      user.awaiting_submenu = '';
      repo.saveUser(user);
      if (_sendFn) _sendFn(fromId, _closeMessage).catch(() => {});
      console.log(`[Inactividad] Conversación cerrada por inactividad: ${fromId}`);
    }
  } catch (e) {
    console.error('[Inactividad] Error cerrando sesión:', e.message);
  }
};

/**
 * Llamar en cada mensaje entrante de un ciudadano (reinicia el contador).
 */
const touch = (fromId) => {
  const existing = _timers.get(fromId);
  if (existing) clearTimeout(existing);
  _timers.set(fromId, setTimeout(() => _closeSession(fromId), TIMEOUT_MS));
};

/**
 * Cancelar el temporizador (p. ej. si el caso pasó a asesor y ya no aplica
 * el cierre automático de flujo de menú).
 */
const clear = (fromId) => {
  const existing = _timers.get(fromId);
  if (existing) clearTimeout(existing);
  _timers.delete(fromId);
};

module.exports = { init, touch, clear };
