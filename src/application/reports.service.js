'use strict';

const repo   = require('../infrastructure/repository');
const { MENU_OPTIONS } = require('../domain/constants');

const _bogotaStart = (type) => {
  const d = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const today = new Date(`${d}T00:00:00-05:00`);
  if (type === 'week') {
    const day = today.getDay();
    today.setDate(today.getDate() + (day === 0 ? -6 : 1 - day));
  }
  if (type === 'month') return new Date(today.getFullYear(), today.getMonth(), 1);
  return today;
};

const _sinceMs = (type) => _bogotaStart(type).getTime();

const _filterInteractions = (sinceMs) =>
  repo.getAllInteractions().filter((i) => {
    const t = new Date(i.ts).getTime();
    return !Number.isNaN(t) && t >= sinceMs && i.body && !i.body.startsWith('#');
  });

const _filterCases = (sinceMs) =>
  repo.getAllCases().filter((c) => {
    const t = new Date(c.createdAt).getTime();
    return !Number.isNaN(t) && t >= sinceMs;
  });

const buildReport = (period) => {
  const labels     = { hoy: 'de hoy', semana: 'de esta semana', mes: 'de este mes' };
  const typeMap    = { hoy: 'today', semana: 'week', mes: 'month' };
  const sinceMs    = _sinceMs(typeMap[period] || 'today');
  const ints       = _filterInteractions(sinceMs);
  const cases      = _filterCases(sinceMs);
  const people     = new Set(ints.map((i) => i.from_id)).size;
  const counts     = {};
  for (const i of ints) {
    if (i.option_selected) counts[i.option_selected] = (counts[i.option_selected] || 0) + 1;
  }
  const pending = repo.getAllCases().filter((c) => c.isPending()).length;

  let text = `📊 *Reporte ${labels[period] || 'de hoy'}*\n\n`;
  text += `👥 Personas atendidas: *${people}*\n`;
  text += `👩‍💼 Casos con asesor: *${cases.length}*\n`;
  text += `📌 Interacciones reales: *${ints.length}*\n\n*Opciones elegidas:*\n`;
  for (const key of Object.keys(MENU_OPTIONS)) {
    text += `• ${key} - ${MENU_OPTIONS[key].title}: *${counts[key] || 0}*\n`;
  }
  text += `\n🟡 Casos pendientes totales: *${pending}*`;
  return text;
};

const buildPendingCasesText = () => {
  const pending = repo.getAllCases().filter((c) => c.isPending());
  if (!pending.length) return '✅ No hay casos pendientes con asesor.';
  let text = `🟡 *Casos pendientes con asesor*\n\n`;
  for (const c of pending.slice(0, 30)) {
    text += `#${c.id} - ${c.name || 'Sin nombre'}\n`;
    text += `Documento: ${c.docType || ''} ${c.documentNumber || 'Sin documento'}\n`;
    text += `WhatsApp: ${c.phone}\nMotivo: ${c.reason || 'No especificado'}\nFecha: ${c.dateCo}\n\n`;
  }
  if (pending.length > 30) text += `Mostrando 30 de ${pending.length} casos pendientes.`;
  return text.trim();
};

module.exports = { buildReport, buildPendingCasesText };
