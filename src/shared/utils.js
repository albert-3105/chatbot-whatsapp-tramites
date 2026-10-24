'use strict';

const normalizeText = (text) =>
  String(text || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

const getPhoneFromId = (fromId) =>
  String(fromId || '').replace(/@(c\.us|lid|s\.whatsapp\.net)$/g, '');

const toWhatsAppChatId = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('@')) return raw;
  const digits = onlyDigits(raw);
  return digits ? `${digits}@c.us` : '';
};

const nowIso = () => new Date().toISOString();

const colombiaDateString = (date = new Date()) =>
  new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
};

module.exports = {
  normalizeText,
  onlyDigits,
  getPhoneFromId,
  toWhatsAppChatId,
  nowIso,
  colombiaDateString,
  wait,
  safeNumber,
};
