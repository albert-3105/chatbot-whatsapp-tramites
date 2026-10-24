'use strict';

const fs   = require('fs');
const path = require('path');
const { User, AdvisorCase } = require('../domain/entities');
const { CASE_STATUS } = require('../domain/constants');
const { nowIso, colombiaDateString, getPhoneFromId } = require('../shared/utils');
const config = require('../config/app.config');

fs.mkdirSync(config.data.dir,     { recursive: true });
fs.mkdirSync(config.data.exports, { recursive: true });

const FILES = {
  users:        path.join(config.data.dir, 'usuarios.json'),
  interactions: path.join(config.data.dir, 'interacciones.json'),
  cases:        path.join(config.data.dir, 'casos_asesor.json'),
};

const _readJson = (file, fallback) => {
  try {
    if (!fs.existsSync(file)) return fallback;
    const text = fs.readFileSync(file, 'utf8');
    if (!text.trim()) return fallback;
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

const _writeJson = (file, data) => {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
};

// ── Estado en memoria ─────────────────────────────────────────
const _store = {
  users:        _readJson(FILES.users,        {}),
  interactions: _readJson(FILES.interactions, []),
  cases:        _readJson(FILES.cases,        []),
};

const saveAll = () => {
  _writeJson(FILES.users,        _store.users);
  _writeJson(FILES.interactions, _store.interactions);
  _writeJson(FILES.cases,        _store.cases);
};

// ── Usuarios ──────────────────────────────────────────────────
const findUser = (fromId) => {
  const raw = _store.users[fromId];
  return raw ? User.fromJSON(raw) : null;
};

const saveUser = (user) => {
  _store.users[user.fromId] = user.toJSON();
  saveAll();
};

const createUser = (fromId, contactName, requireConsent) => {
  const user = new User({
    fromId,
    phone:       getPhoneFromId(fromId),
    whatsappName: contactName || '',
    step: requireConsent ? 'awaiting_consent' : 'awaiting_name',
  });
  saveUser(user);
  return user;
};

const getAllUsers = () =>
  Object.values(_store.users).map((raw) => User.fromJSON(raw));

// ── Interacciones ─────────────────────────────────────────────
const logInteraction = ({ fromId, name, body, option, passedToAdvisor = false, optionTitle = '' }) => {
  const user = _store.users[fromId] || {};
  _store.interactions.push({
    id:               _store.interactions.length + 1,
    ts:               nowIso(),
    date_co:          colombiaDateString(),
    from_id:          fromId,
    phone:            getPhoneFromId(fromId),
    name:             name || user.name || user.whatsapp_name || '',
    document_number:  user.document_number || '',
    doc_type:         user.doc_type || '',
    body:             body || '',
    option_selected:  option || '',
    option_title:     optionTitle || '',
    passed_to_advisor: passedToAdvisor ? 'SI' : 'NO',
  });
  saveAll();
};

const getAllInteractions = () => [..._store.interactions];

// ── Casos ─────────────────────────────────────────────────────
const findPendingCase = (fromId) => {
  const raw = _store.cases.find(
    (c) => c.from_id === fromId && c.status === 'pendiente'
  );
  return raw ? AdvisorCase.fromJSON(raw) : null;
};

const createCase = (fromId, reason) => {
  const user   = _store.users[fromId] || {};
  const nextId = _store.cases.length === 0
    ? 1
    : Math.max(..._store.cases.map((c) => Number(c.id) || 0)) + 1;

  const newCase = new AdvisorCase({
    id:             nextId,
    fromId,
    phone:          getPhoneFromId(fromId),
    name:           user.name || user.whatsapp_name || '',
    docType:        user.doc_type || '',
    documentNumber: user.document_number || '',
    barrio:         user.barrio || '',
    comuna:         user.comuna || '',
    reason,
    dateCo:         colombiaDateString(),
  });

  _store.cases.push(newCase.toJSON());
  saveAll();
  return newCase;
};

const saveCase = (advisorCase) => {
  const idx = _store.cases.findIndex((c) => Number(c.id) === Number(advisorCase.id));
  if (idx !== -1) {
    _store.cases[idx] = advisorCase.toJSON();
    saveAll();
  }
};

const findCaseById = (id) => {
  const raw = _store.cases.find((c) => Number(c.id) === Number(id));
  return raw ? AdvisorCase.fromJSON(raw) : null;
};

const getAllCases = () => _store.cases.map((raw) => AdvisorCase.fromJSON(raw));

const countPendingCases = () =>
  _store.cases.filter((c) => c.status === CASE_STATUS.PENDING).length;

const resetAll = () => {
  _store.users        = {};
  _store.interactions = [];
  _store.cases        = [];
  saveAll();
};

module.exports = {
  findUser, saveUser, createUser, getAllUsers,
  logInteraction, getAllInteractions,
  findPendingCase, createCase, saveCase, findCaseById, getAllCases, countPendingCases,
  saveAll, resetAll,
};
