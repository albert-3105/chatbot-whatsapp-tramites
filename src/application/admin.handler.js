'use strict';

const repo     = require('../infrastructure/repository');
const excel    = require('../infrastructure/excel.service');
const advisor  = require('./advisor.service');
const reports  = require('./reports.service');
const msg      = require('./messages.service');
const { normalizeText, toWhatsAppChatId } = require('../shared/utils');

const _adminFocus = new Map(); // adminFromId → citizenPhone

// Frases naturales que el asesor puede escribir en modo foco para cerrar el caso.
const _CLOSE_CASE_PHRASES = [
  'resuelto', 'caso resuelto',
  'listo', 'caso listo',
  'finalizado', 'caso finalizado',
  'cerrado', 'caso cerrado', 'cerrar caso',
  'ya quedo', 'ya quedo resuelto',
];

const _resolveAdminCommand = (body) => {
  const clean = String(body || '').trim();
  const lower = normalizeText(clean);
if (['ayuda','como funciona','no se','?','help'].includes(lower)) return { action: 'help' };
if (lower.includes('cuantos') || lower.includes('cuántos') || lower.includes('hoy')) return { action: 'report', period: 'hoy' };
if (lower.includes('semana'))  return { action: 'report', period: 'semana' };
if (lower.includes('mes'))     return { action: 'report', period: 'mes' };
if (lower.includes('pendiente')) return { action: 'pending_cases' };
if (lower.includes('exportar') || lower.includes('excel') || lower.includes('descargar')) return { action: 'export_excel' };
if (lower.startsWith('buscar ')) return { action: 'search', query: clean.slice(7).trim() };
if (lower.startsWith('historial ')) return { action: 'history', query: clean.slice(10).trim() };
if (lower.startsWith('nota ')) {
  const parts = clean.split(/\s+/);
  return { action: 'add_note', id: parts[1], note: parts.slice(2).join(' ') };
}
  if (['#admin','#menu admin','#ayuda','admin'].includes(lower)) return { action: 'menu' };
  if (clean === '1' || lower === '#reporte hoy')     return { action: 'report', period: 'hoy' };
  if (clean === '2' || lower === '#reporte semana')  return { action: 'report', period: 'semana' };
  if (clean === '3' || lower === '#reporte mes')     return { action: 'report', period: 'mes' };
  if (clean === '4' || lower === '#casos pendientes') return { action: 'pending_cases' };
  // ── Cierre masivo de casos ────────────────────────────────
  if (lower === '5 todos' || lower === '#cerrar todos' || lower === 'cerrar todos') {
    return { action: 'close_all_cases' };
  }

  if (clean === '5') return { action: 'close_case_help' };
  if (clean === '6' || lower === '#exportar excel') return { action: 'export_excel' };
  if (clean === '7' || lower === '#ping')           return { action: 'ping' };
  if (clean === '8' || lower === '#reset datos')    return { action: 'reset_data' };
  if (clean === '9' || lower.includes('backup sheet') || lower.includes('backup a sheets') ||
      lower === 'sheets' || lower === 'backup') return { action: 'backup_sheets' };
  if (clean === '0' || lower === 'menu ciudadano')  return { action: 'citizen_menu' };

  return null;
};

const _resolveAdvisorReply = (body) => {
  const clean = String(body || '').trim();
  const lower = normalizeText(clean);

  const longMatch = clean.match(/^(?:responder?|resp?)\s+(\d{7,15})\s+(.+)$/i);
  if (longMatch) return { type: 'send', phone: longMatch[1], message: longMatch[2].trim() };

  const focusMatch = clean.match(/^(?:hablar con|chat con|foco)\s+(\d{7,15})$/i);
  if (focusMatch) return { type: 'set_focus', phone: focusMatch[1] };

  if (['salir','exit','cancelar foco','sin foco'].includes(lower)) return { type: 'clear_focus' };

  const liberarMatch = clean.match(/^(?:liberar|reactivar bot)\s+(\d{7,15})$/i);
  if (liberarMatch) return { type: 'liberar', phone: liberarMatch[1] };

  const estadoMatch = clean.match(/^(?:estado|status)\s+(\d{7,15})$/i);
  if (estadoMatch) return { type: 'estado', phone: estadoMatch[1] };

  return null;
};

const handleAdminMessage = async ({ adminId, body, reply, sendMessage, sendFile, botName }) => {
  // ── Comandos del panel ────────────────────────────────────
  const command = _resolveAdminCommand(body);
  if (command) {
    switch (command.action) {
      case 'menu':
        await reply(msg.adminPanel());
        return true;

      case 'report':
        await reply(reports.buildReport(command.period));
        await reply(msg.adminPanel());
        return true;

      case 'pending_cases':
        await reply(reports.buildPendingCasesText());
        await reply(msg.adminPanel());
        return true;

      case 'close_case_help':
        await reply(msg.closeCaseHelp());
        return true;

      // ── Cierre masivo de casos ────────────────────────────
      case 'close_all_cases': {
        const pending = repo.getAllCases().filter((c) => c.isPending());
        if (pending.length === 0) {
          await reply('ℹ️ No hay casos pendientes para cerrar.');
          await reply(msg.adminPanel());
          return true;
        }
        for (const c of pending) {
          c.close('Cierre masivo');
          repo.saveCase(c);
        }
        await reply(`✅ Se cerraron *${pending.length}* caso(s) masivamente.`);
        await reply(msg.adminPanel());
        return true;
      }

      case 'export_excel': {
        await reply('📁 Generando archivo Excel...');
        const filePath = await excel.exportToExcel();
        await sendFile(adminId, filePath, `📎 Reporte Excel generado por ${botName}`);
        await reply(msg.adminPanel());
        return true;
      }

      case 'backup_sheets': {
        await reply('☁️ Sincronizando datos con Google Sheets...');
        try {
          const sheets = require('../infrastructure/sheets.service');
          const ok = await sheets.syncDailySnapshot();
          if (ok) {
            await reply('✅ Backup a Google Sheets completado. El Sheet ya tiene el estado más reciente de usuarios y casos.');
          } else {
            await reply(
              '⚠️ El backup a Sheets no está configurado todavía.\n\n' +
              'Faltan estas variables en tu archivo *.env*:\n' +
              '• GOOGLE_SHEET_ID\n• GOOGLE_SERVICE_ACCOUNT_EMAIL\n• GOOGLE_PRIVATE_KEY\n\n' +
              'Avísale a quien administra el bot para configurarlas.'
            );
          }
        } catch (err) {
          console.error('[Admin] Error en backup a Sheets:', err.message);
          await reply('❌ Ocurrió un error al sincronizar con Google Sheets. Revisa la consola del bot para más detalles.');
        }
        await reply(msg.adminPanel());
        return true;
      }

      case 'ping':
        await reply('pong ✅ El bot está activo.');
        await reply(msg.adminPanel());
        return true;

      case 'reset_data':
        repo.resetAll();
        await reply('✅ Datos de prueba reiniciados.\n\nUsuarios: 0\nInteracciones: 0\nCasos: 0\n\nLa sesión de WhatsApp sigue vinculada.');
        await reply(msg.adminPanel());
        return true;

      case 'citizen_menu':
        await reply('🏠 *Menú ciudadano*\n\nEste menú es el que verá una persona normal.');
        await reply(msg.menu({ name: '' }));
        return true;
    }
  }

  // ── Respuesta directa a ciudadano ─────────────────────────
  const advisorCmd = _resolveAdvisorReply(body);
  if (advisorCmd) {
    switch (advisorCmd.type) {
      case 'set_focus': {
        _adminFocus.set(adminId, advisorCmd.phone);
        const chatId = toWhatsAppChatId(advisorCmd.phone);
        if (chatId) { advisor.activate(chatId); }
        const user   = repo.getAllUsers().find((u) => u.phone === advisorCmd.phone || u.fromId.includes(advisorCmd.phone));
        const nombre = (user && (user.name || user.whatsappName)) || advisorCmd.phone;
        await reply(`✅ Foco en *${nombre}* (${advisorCmd.phone}).\n\nBot silenciado. Escribe libremente.\nEscribe *salir* para terminar.`);
        return true;
      }

      case 'clear_focus': {
        const old = _adminFocus.get(adminId);
        _adminFocus.delete(adminId);
        if (old) {
          const chatId = toWhatsAppChatId(old);
          if (chatId) {
            advisor.deactivate(chatId);
            await sendMessage(chatId, '✅ La atención con el asesor ha finalizado.\n\nSi necesitas más ayuda escribe *hola* para volver al menú.');
          }
        }
        await reply('✅ Foco cancelado. Bot reactivado en ese chat.');
        await reply(msg.adminPanel());
        return true;
      }

      case 'send': {
        const chatId = toWhatsAppChatId(advisorCmd.phone);
        if (!chatId) { await reply('⚠️ Número inválido.'); return true; }
        advisor.activate(chatId);
        advisor.renew(chatId);
        await sendMessage(chatId, `👩‍💼 *Asesor ${botName}:*\n\n${advisorCmd.message}`);
        await reply(`✅ Enviado a *${advisorCmd.phone}*.\nPara chatear: *HABLAR CON ${advisorCmd.phone}*\nPara liberar: *LIBERAR ${advisorCmd.phone}*`);
        return true;
      }

      case 'liberar': {
        const chatId = toWhatsAppChatId(advisorCmd.phone);
        if (!chatId) { await reply('Número inválido.'); return true; }
        advisor.deactivate(chatId);
        await sendMessage(chatId, '✅ La atención con el asesor ha finalizado.\n\nSi necesitas más ayuda escribe *hola* para volver al menú.');
        await reply(`✅ Bot reactivado para *${advisorCmd.phone}*.`);
        return true;
      }

      case 'estado': {
        const chatId  = toWhatsAppChatId(advisorCmd.phone);
        const status  = chatId ? advisor.getStatus(chatId) : null;
        if (status) {
          await reply(`🟡 *Modo asesor ACTIVO* para ${advisorCmd.phone}\nActivado hace: ${status.elapsed} min\nSe desactiva en: ${status.remaining} min\n\nPara liberar: *LIBERAR ${advisorCmd.phone}*`);
        } else {
          await reply(`🟢 El bot está *ACTIVO* (modo normal) para ${advisorCmd.phone}`);
        }
        return true;
      }
    }
  }

  // ── Modo foco activo ──────────────────────────────────────
  const focusPhone = _adminFocus.get(adminId);
  if (focusPhone) {
    const chatId = toWhatsAppChatId(focusPhone);
    if (!chatId) { _adminFocus.delete(adminId); await reply('⚠️ Número inválido. Foco cancelado.'); return true; }

    // Cierre del caso escrito en lenguaje natural (ej. "resuelto", "listo").
    if (_CLOSE_CASE_PHRASES.includes(normalizeText(body))) {
      const pendingCase = repo.findPendingCase(chatId);
      if (pendingCase) {
        pendingCase.close('Cerrado por el asesor en modo foco');
        repo.saveCase(pendingCase);
      }
      advisor.deactivate(chatId);
      _adminFocus.delete(adminId);
      await sendMessage(chatId, msg.caseClosedForCitizen());
      await reply(pendingCase ? msg.caseClosedForAdvisor(pendingCase.id) : msg.caseClosedNoPendingCase());
      await reply(msg.adminPanel());
      return true;
    }

    advisor.renew(chatId);
    await sendMessage(chatId, `👩‍💼 *Asesor ${botName}:*\n\n${body}`);
    const user   = repo.getAllUsers().find((u) => u.phone === focusPhone || u.fromId.includes(focusPhone));
    const nombre = (user && (user.name || user.whatsappName)) || focusPhone;
    await reply(`✅ Enviado a *${nombre}*. Timer reiniciado. Escribe *salir* para terminar.`);
    return true;
  }

  return false;
};

module.exports = { handleAdminMessage };