'use strict';

/**
 * Cola de mensajes salientes con espaciado humano entre envíos.
 *
 * Por qué existe: whatsapp-web.js es una librería NO oficial (simula un
 * navegador). WhatsApp puede bloquear la sesión si detecta patrones
 * automatizados: ráfagas de mensajes muy seguidos, el mismo texto enviado
 * a muchos números en poco tiempo, etc. Esta cola serializa TODOS los
 * envíos salientes (respuestas a ciudadanos, notificaciones a asesores,
 * resúmenes) para que nunca salgan dos mensajes al mismo tiempo, y le
 * mete una pausa aleatoria entre cada uno.
 *
 * No reemplaza el delay que ya tienen en whatsapp.client.js (_safeReply)
 * — ese simula "escribiendo…" antes de UNA respuesta. Esta cola evita que
 * varios envíos (p. ej. notificar a 2 admins + responder a un ciudadano)
 * salgan pegados uno del otro en el mismo segundo.
 *
 * Configuración (.env):
 *   QUEUE_MIN_DELAY_MS=1500   → pausa mínima entre mensajes salientes
 *   QUEUE_MAX_DELAY_MS=4000   → pausa máxima (se elige un valor random entre ambos)
 *   QUEUE_HOURLY_SOFT_CAP=120 → aviso en consola si se supera este envío/hora (0 = sin límite)
 */

const config = require('../config/app.config');

const MIN_DELAY = Number(process.env.QUEUE_MIN_DELAY_MS || 1500);
const MAX_DELAY = Number(process.env.QUEUE_MAX_DELAY_MS || 4000);
const HOURLY_SOFT_CAP = Number(process.env.QUEUE_HOURLY_SOFT_CAP || 120);

const _queue = [];
let _processing = false;

// Ventana deslizante de envíos en la última hora, para el aviso de "soft cap".
const _sentTimestamps = [];

const _randomDelay = () =>
  Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;

const _pruneOldTimestamps = () => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  while (_sentTimestamps.length && _sentTimestamps[0] < cutoff) {
    _sentTimestamps.shift();
  }
};

const _checkSoftCap = () => {
  if (!HOURLY_SOFT_CAP) return;
  _pruneOldTimestamps();
  if (_sentTimestamps.length === HOURLY_SOFT_CAP) {
    console.warn(
      `[Queue] ⚠️ Se superaron ${HOURLY_SOFT_CAP} mensajes salientes en la última hora. ` +
      `Esto por sí solo no significa riesgo de bloqueo, pero es buen momento para revisar ` +
      `si hay mensajes repetidos/idénticos saliendo a muchos números.`
    );
  }
};

const _processQueue = async () => {
  if (_processing) return;
  _processing = true;
  while (_queue.length) {
    const { task, resolve, reject } = _queue.shift();
    try {
      const result = await task();
      _sentTimestamps.push(Date.now());
      _checkSoftCap();
      resolve(result);
    } catch (e) {
      reject(e);
    }
    if (_queue.length) {
      await new Promise((r) => setTimeout(r, _randomDelay()));
    }
  }
  _processing = false;
};

/**
 * Encola una función que envía UN mensaje (debe devolver una promesa).
 * Ejemplo: enqueue(() => client.sendMessage(chatId, texto))
 */
const enqueue = (task) =>
  new Promise((resolve, reject) => {
    _queue.push({ task, resolve, reject });
    _processQueue();
  });

const getStats = () => {
  _pruneOldTimestamps();
  return { pendientesEnCola: _queue.length, enviadosUltimaHora: _sentTimestamps.length };
};

module.exports = { enqueue, getStats };
