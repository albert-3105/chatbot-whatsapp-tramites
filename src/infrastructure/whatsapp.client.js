'use strict';

const qrcode  = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const config  = require('../config/app.config');
const advisor = require('../application/advisor.service');
const inactivity = require('./inactivity.service');
const citizen = require('../application/citizen.handler');
const admin   = require('../application/admin.handler');
const msg     = require('../application/messages.service');
const { exec } = require('child_process');
const { toWhatsAppChatId, normalizeText, getPhoneFromId, onlyDigits } = require('../shared/utils');
const repo = require('./repository');

const _processed = new Set();

// ─────────────────────────────────────────────────────────────
// Palabras que el asesor puede escribir para marcar el caso como
// resuelto cuando responde directo desde WhatsApp Web/celular del
// bot (sin pasar por el panel admin). No se cierra con el primer
// mensaje — solo con una de estas palabras.
// ─────────────────────────────────────────────────────────────
const CLOSE_KEYWORDS = [
  'listo', 'completado', 'resuelto', 'atendido',
  'terminado', 'finalizado', 'cerrado', 'caso cerrado',
  'listo gracias', 'quedo listo', 'quedó listo', 'ya quedo', 'ya quedó',
];

const _looksLikeCloseKeyword = (text) => {
  const clean = normalizeText(text).replace(/[.!¡✅👍]/g, '').trim();
  return CLOSE_KEYWORDS.includes(clean);
};

const _closeCaseByPhone = (toChatId) => {
  try {
    const citizenPhone = onlyDigits(getPhoneFromId(toChatId));
    if (!citizenPhone) return false;
    const pendingCase = repo.getAllCases().find(
      (c) => c.status === 'pendiente' && onlyDigits(c.phone) === citizenPhone
    );
    if (!pendingCase) return false;
    pendingCase.close('Cierre por palabra clave del asesor (WhatsApp Web)');
    repo.saveCase(pendingCase);
    console.log(`[AutoClose] ✅ Caso #${pendingCase.id} cerrado (palabra clave, ${citizenPhone})`);
    return true;
  } catch (e) {
    console.error('[AutoClose] Error cerrando caso:', e.message);
    return false;
  }
};

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'sisy', dataPath: '.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
  },
  takeoverOnConflict: false,
  restartOnAuthFail:  true,
});

// Inyectar función de envío en el servicio de asesor
advisor.init((to, text) => client.sendMessage(toWhatsAppChatId(to), text));

// Inyectar función de envío en el servicio de cierre por inactividad
inactivity.init((to, text) => client.sendMessage(toWhatsAppChatId(to), text));

// ─────────────────────────────────────────────────────────────
// Notificación de Windows al recibir un nuevo caso de asesor
// ─────────────────────────────────────────────────────────────
const _alertWindows = (caseName, pendingCount) => {
  const resumenPendientes = pendingCount === 1
    ? 'Tienes 1 caso de asesor pendiente'
    : `Tienes ${pendingCount} casos de asesor pendientes`;

  // El nombre viene de texto libre que escribe el ciudadano — nunca debe
  // llegar sin filtrar a un comando de shell. Solo se permiten letras
  // (con acentos/ñ), números, espacios y puntuación básica; todo lo demás
  // (&, |, ^, <, >, comillas, backticks, etc.) se elimina.
  const safeCaseName = String(caseName || 'Sin nombre')
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ .,'-]/g, '')
    .slice(0, 80)
    .trim() || 'Sin nombre';

  const texto = `Nuevo caso: ${safeCaseName}. ${resumenPendientes}.`.replace(/"/g, "'");
  // Popup de sistema con sonido (no requiere instalar nada).
  // Se usa vbCrLf (no un salto de línea literal) para no romper el comando de shell.
  exec(`mshta vbscript:Execute("CreateObject(""WScript.Shell"").Popup ""${texto}"",5,""SISY Bot - Caso nuevo"",64 : window.close")`);
  // Alternativa solo con sonido:
  // exec('powershell -c "[console]::beep(880,400)"');
};

// ─────────────────────────────────────────────────────────────
// Verificar si el mensaje viene de un administrador.
// Compara múltiples formatos del número para ser tolerante.
// ─────────────────────────────────────────────────────────────
const _isAdmin = (whatsappMsg, contact) => {
  if (!config.bot.adminNumber) return false;
  const admins = config.bot.adminNumber.split(',').map((s) => s.trim()).filter(Boolean);
  const candidates = [
    whatsappMsg.from, whatsappMsg.author,
    whatsappMsg._data?.from?._serialized, whatsappMsg._data?.id?.remote,
    contact?.id?._serialized, contact?.number, contact?.userid,
    getPhoneFromId(whatsappMsg.from), onlyDigits(whatsappMsg.from),
    onlyDigits(contact?.number),
  ].filter(Boolean);
  return admins.some((a) =>
    candidates.some((c) => {
      const ca = String(c || '').toLowerCase();
      const ra = String(a || '').toLowerCase();
      return ca === ra || ca === getPhoneFromId(ra) || onlyDigits(ca) === onlyDigits(ra);
    })
  );
};

// ─────────────────────────────────────────────────────────────
// Obtener el número real del ciudadano.
//
// WhatsApp usa dos tipos de IDs:
//   @c.us  → el número real directamente (ej: 573001234567@c.us)
//   @lid   → ID interno de Meta, NO es el número (ej: 100000000000000@lid)
//            contact.number en @lid devuelve el mismo ID largo (15 dígitos),
//            por eso hay que descartarlo explícitamente.
//
// Regla clave: un número de teléfono real (con indicativo) tiene máximo
// 13 dígitos (indicativo 1-3 dígitos + número hasta 10 dígitos).
// El @lid de Meta siempre tiene 15 dígitos → se descarta.
// ─────────────────────────────────────────────────────────────
const _isRealPhone = (digits) =>
  digits && digits.length >= 7 && digits.length <= 13;

// ─────────────────────────────────────────────────────────────
// Obtener el número real del ciudadano.
// Ahora incluye resolución activa de @lid via client.getContactById()
// ─────────────────────────────────────────────────────────────
const _extractRealPhone = async (whatsappMsg, contact) => {
  // 1. contact.number — válido solo si es un número real (≤ 13 dígitos)
  const contactNum = onlyDigits(contact?.number || '');
  if (_isRealPhone(contactNum)) {
    return '+' + contactNum;
  }

  // 2. Si es @c.us, el ID contiene el número directamente
  const fromId = String(whatsappMsg.from || '');
  if (fromId.endsWith('@c.us')) {
    const digits = onlyDigits(getPhoneFromId(fromId));
    if (_isRealPhone(digits)) {
      return '+' + digits;
    }
  }

  // 3. Es @lid → intentar resolución activa con getContactById
  if (fromId.endsWith('@lid')) {
    try {
      const resolved = await client.getContactById(fromId);
      const resolvedNum = onlyDigits(resolved?.number || '');
      if (_isRealPhone(resolvedNum)) {
        return '+' + resolvedNum;
      }
      // Algunos clientes exponen el número en id._serialized tras la resolución
      const serialized = resolved?.id?._serialized || '';
      if (serialized.endsWith('@c.us')) {
        const digits = onlyDigits(getPhoneFromId(serialized));
        if (_isRealPhone(digits)) {
          return '+' + digits;
        }
      }
    } catch (e) {
      console.warn('[Phone] No se pudo resolver @lid:', fromId, e.message);
    }
  }

  // 4. No resolvible
  return null;
};

// ─────────────────────────────────────────────────────────────
// Envío seguro con delay humano + indicador "escribiendo..."
// ─────────────────────────────────────────────────────────────
const _safeReply = async (whatsappMsg, text) => {
  if (!whatsappMsg || typeof whatsappMsg.getChat !== 'function') {
    console.error('[WhatsApp] _safeReply llamado sin un mensaje válido. Texto perdido:', text?.slice(0, 60));
    return null;
  }
  const delay = Math.floor(Math.random() * 2000) + 2000;
  await new Promise((r) => setTimeout(r, delay));
  try {
    const chat = await whatsappMsg.getChat();
    if (chat) {
      await chat.sendStateTyping();
      await new Promise((r) => setTimeout(r, 1500));
    }
    return await whatsappMsg.reply(text);
  } catch (e) {
    console.error('[WhatsApp] Error enviando mensaje:', e.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────
// Eventos del cliente WhatsApp
// ─────────────────────────────────────────────────────────────
client.on('qr', (qr) => {
  console.log('\nEscanea el QR con WhatsApp > Dispositivos vinculados:\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log(`${config.bot.name} bot listo ✅`);
  console.log('Admin: escribe #admin para abrir el panel.');
});

client.on('authenticated', () => console.log('WhatsApp autenticado ✅'));
client.on('auth_failure',  (e) => console.error('Error autenticación:', e));
client.on('disconnected',  (r) => {
  console.error('Bot desconectado:', r);
  process.exit(1);
});

// ─────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL DE MENSAJES
// ─────────────────────────────────────────────────────────────
client.on('message', async (whatsappMsg) => {
  try {

    // ── Anti-duplicados ───────────────────────────────────────
    const msgId = whatsappMsg.id?._serialized || '';
    if (msgId) {
      if (_processed.has(msgId)) return;
      _processed.add(msgId);
      if (_processed.size > 1000) {
        _processed.delete(_processed.values().next().value);
      }
    }

    const body  = String(whatsappMsg.body || '').trim();
    const lower = normalizeText(body);

    // ── Si el asesor escribe desde el teléfono del bot ────────
    // Activar modo asesor para ese chat del ciudadano, y si el
    // mensaje es una palabra de cierre (listo, resuelto, etc.),
    // cerrar el caso pendiente de ese ciudadano.
    if (whatsappMsg.fromMe) {
      if (whatsappMsg.to &&
          !whatsappMsg.to.includes('@g.us') &&
          !whatsappMsg.to.includes('status')) {
        if (_looksLikeCloseKeyword(whatsappMsg.body)) {
          const closed = _closeCaseByPhone(whatsappMsg.to);
          if (closed) {
            advisor.deactivate(whatsappMsg.to);
            try {
              await client.sendMessage(whatsappMsg.to, msg.caseClosedForCitizen());
            } catch (e) {
              console.error('[AutoClose] No se pudo avisar al ciudadano:', e.message);
            }
          }
        } else {
          advisor.activate(whatsappMsg.to);
          advisor.renew(whatsappMsg.to);
        }
      }
      return;
    }

    // ── Filtros básicos ───────────────────────────────────────
    if (!body) return;
    if (whatsappMsg.type && whatsappMsg.type !== 'chat') return;
    if (whatsappMsg.isStatus || whatsappMsg.from === 'status@broadcast') return;
    if (whatsappMsg.from.endsWith('@g.us') || whatsappMsg.from.includes('newsletter')) return;

    console.log('📩', { from: whatsappMsg.from, body, type: whatsappMsg.type });

    // ── Datos del contacto ────────────────────────────────────
    const contact     = await whatsappMsg.getContact().catch(() => null);
    const contactName = contact?.pushname || contact?.name || '';
    const isAdm       = _isAdmin(whatsappMsg, contact);

    // Número real del ciudadano (resuelve el problema del @lid)
    const realPhone = await _extractRealPhone(whatsappMsg, contact);
    console.log('[Phone]', {
      from:        whatsappMsg.from,
      contactNum:  contact?.number || '(vacío)',
      realPhone:   realPhone || '⚠️ No resuelto (@lid sin número)',
    });

    // ── Bloquear comandos # para no admins ───────────────────
    if (body.startsWith('#') && !isAdm) {
      if (lower === '#admin') {
        await _safeReply(whatsappMsg, '⛔ Este comando solo está disponible para el administrador autorizado.');
      }
      return;
    }

    // ── Funciones de envío ────────────────────────────────────
    const reply       = (text) => _safeReply(whatsappMsg, text);
    const sendMsg     = (to, text) => client.sendMessage(toWhatsAppChatId(to), text);
    const sendFile    = async (to, filePath, caption) =>
      client.sendMessage(to, MessageMedia.fromFilePath(filePath), { caption });
    const sendMenu    = (user) => reply(msg.menu(user));
    const sendWithNav = async (text) => { await reply(text); await reply(msg.navigation()); };

    // ── BLOQUE ADMIN ──────────────────────────────────────────
    if (isAdm) {
      const handled = await admin.handleAdminMessage({
        adminId: whatsappMsg.from, body,
        reply, sendMessage: sendMsg, sendFile,
        botName: config.bot.name,
      });
      if (handled) return;

      if (body.startsWith('#')) {
        await reply('Comando no reconocido. Escribe *#admin* para ver el panel.');
        return;
      }

      await reply(
        `No entendí ese mensaje.\n\nEscribe *#admin* para ver el panel.\n\n` +
        `Para responder a un ciudadano:\n*RESPONDER <número> <mensaje>*\nO: *HABLAR CON <número>*`
      );
      return;
    }

    // ── BLOQUE CIUDADANO ──────────────────────────────────────
    // Si el asesor tiene el chat en modo foco (advisor.isActive), NO
    // reiniciamos el temporizador de inactividad del flujo de menú —
    // ese caso ya lo maneja advisor.service.js con su propio timeout.
    if (!advisor.isActive(whatsappMsg.from)) {
      inactivity.touch(whatsappMsg.from);
    }

    const result = await citizen.handleCitizenMessage({
      fromId: whatsappMsg.from,
      body,
      lower,
      contactName,
      realPhone,
      reply,
      sendMenu,
      sendWithNav,
      sendFile: (filePath, caption) => sendFile(whatsappMsg.from, filePath, caption),
    });

    // ── Notificar a TODOS los admins cuando se crea un caso nuevo ───────
    if (result?.notifyCase && !result.notifyCase.alreadyExists) {
      const c            = result.notifyCase;
      const allAdmins    = config.bot.adminNumber.split(',').map((s) => s.trim()).filter(Boolean);
      const phoneDisplay = realPhone || '⚠️ No disponible (usuario con cuenta Meta @lid)';

      const notifyText =
        `🔔 *Nuevo caso para asesor*\n\n` +
        `Caso: #${c.id}\n` +
        `Nombre: ${c.name || 'No disponible'}\n` +
        `Tipo Doc: ${c.doc_type || c.docType || 'N/A'}\n` +
        `Documento: ${c.document_number || c.documentNumber || 'N/A'}\n` +
        `Barrio: ${c.barrio || 'No disponible'}\n` +
        `Comuna: ${c.comuna || 'No disponible'}\n` +
        `WhatsApp: ${phoneDisplay}\n` +
        `Motivo: ${c.reason}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💬 *Para responder:*\n\n` +
        (realPhone
          ? `Mensaje único:\n*RESPONDER ${realPhone} tu mensaje aquí*\n\n` +
            `Modo chat:\n*HABLAR CON ${realPhone}*\n\n`
          : `⚠️ El usuario usa cuenta Meta vinculada. Búscalo en tus chats por el nombre: *${c.name || 'No disponible'}*\n\n`) +
        `Cerrar caso:\nEn modo chat, escribe *resuelto* cuando termines de atenderlo.`;

      let anySent = false;

      for (const a of allAdmins) {
        const adminChatId = a.includes('@') ? a : onlyDigits(a) + '@c.us';
        console.log('[Notify] Enviando caso al admin:', adminChatId);
        try {
          await client.sendMessage(adminChatId, notifyText);
          console.log('[Notify] ✅ Caso enviado a', adminChatId);
          anySent = true;
        } catch (notifyErr) {
          console.error('[Notify] ❌ Error enviando caso a', adminChatId, ':', notifyErr.message);
        }
      }

      // ── Notificación de escritorio en Windows (siempre que se crea el caso) ──
      _alertWindows(c.name || 'Sin nombre', repo.countPendingCases());
      if (!anySent) {
        console.error('[Notify] ❌ No se pudo notificar a ningún admin por WhatsApp');
      }
    }

  } catch (error) {
    console.error('[Bot] Error procesando mensaje:', error);
    try {
      await whatsappMsg.reply('Tuvimos un inconveniente. Por favor intenta nuevamente.');
    } catch (_) {}
  }
});

module.exports = { client };