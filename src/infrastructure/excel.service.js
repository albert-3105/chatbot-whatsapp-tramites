'use strict';

const path   = require('path');
const ExcelJS = require('exceljs');
const repo   = require('./repository');
const config = require('../config/app.config');
const { MENU_OPTIONS } = require('../domain/constants');
const { colombiaDateString } = require('../shared/utils');

const _freeze = (ws) => {
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = {
    from: 'A1',
    to:   `${String.fromCharCode(64 + ws.columnCount)}1`,
  };
};

const _statsForPeriod = (since) => {
  const sinceMs = since.getTime();
  const ints    = repo.getAllInteractions().filter((i) => {
    const t = new Date(i.ts).getTime();
    return !Number.isNaN(t) && t >= sinceMs && i.body && !i.body.startsWith('#');
  });
  const cases = repo.getAllCases().filter((c) => {
    const t = new Date(c.createdAt).getTime();
    return !Number.isNaN(t) && t >= sinceMs;
  });
  return {
    people:       new Set(ints.map((i) => i.from_id)).size,
    interactions: ints.length,
    advisor:      cases.length,
    pending:      cases.filter((c) => c.isPending()).length,
  };
};

const _startOfToday = () => {
  const d = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return new Date(`${d}T00:00:00-05:00`);
};
const _startOfWeek = () => {
  const t   = _startOfToday();
  const day = t.getDay();
  const s   = new Date(t);
  s.setDate(t.getDate() + (day === 0 ? -6 : 1 - day));
  return s;
};
const _startOfMonth = () => {
  const t = _startOfToday();
  return new Date(t.getFullYear(), t.getMonth(), 1);
};

const exportToExcel = async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = config.bot.name;
  workbook.created = new Date();

  const resumen       = workbook.addWorksheet('Resumen');
  const usuarios      = workbook.addWorksheet('Usuarios');
  const interacciones = workbook.addWorksheet('Interacciones');
  const casos         = workbook.addWorksheet('Casos asesor');

  // ── Hoja Resumen ──────────────────────────────────────────
  resumen.columns = [
    { header: 'Métrica', key: 'metric', width: 35 },
    { header: 'Hoy',     key: 'hoy',    width: 15 },
    { header: 'Semana',  key: 'semana', width: 15 },
    { header: 'Mes',     key: 'mes',    width: 15 },
  ];

  const td = _statsForPeriod(_startOfToday());
  const tw = _statsForPeriod(_startOfWeek());
  const tm = _statsForPeriod(_startOfMonth());

  resumen.addRows([
    { metric: 'Personas atendidas',   hoy: td.people,       semana: tw.people,       mes: tm.people },
    { metric: 'Interacciones reales', hoy: td.interactions, semana: tw.interactions, mes: tm.interactions },
    { metric: 'Casos con asesor',     hoy: td.advisor,      semana: tw.advisor,      mes: tm.advisor },
    { metric: 'Casos pendientes',     hoy: td.pending,      semana: tw.pending,      mes: tm.pending },
  ]);

  for (const key of Object.keys(MENU_OPTIONS)) {
    const count = (since) =>
      repo.getAllInteractions().filter((i) => {
        const t = new Date(i.ts).getTime();
        return !Number.isNaN(t) && t >= since.getTime() && i.option_selected === key;
      }).length;
    resumen.addRow({
      metric: `${key} - ${MENU_OPTIONS[key].title}`,
      hoy: count(_startOfToday()), semana: count(_startOfWeek()), mes: count(_startOfMonth()),
    });
  }

  // ── Hoja Usuarios ─────────────────────────────────────────
  usuarios.columns = [
    { header: 'WhatsApp',          key: 'phone',           width: 18 },
    { header: 'Nombre WhatsApp',   key: 'whatsapp_name',   width: 25 },
    { header: 'Nombre registrado', key: 'name',            width: 28 },
    { header: 'Tipo documento',    key: 'doc_type',        width: 18 },
    { header: 'Documento',         key: 'document_number', width: 18 },
    { header: 'Barrio',            key: 'barrio',          width: 22 },
    { header: 'Comuna',            key: 'comuna',          width: 18 },
    { header: 'Categoría Sisbén',  key: 'sisben_category', width: 18 },
    { header: 'Autorizó datos',    key: 'authorized',      width: 15 },
    { header: 'Creado',            key: 'created_at',      width: 25 },
    { header: 'Actualizado',       key: 'updated_at',      width: 25 },
  ];
  usuarios.addRows(repo.getAllUsers().map((u) => ({
    phone: u.phone, whatsapp_name: u.whatsappName, name: u.name,
    doc_type: u.docType, document_number: u.documentNumber,
    barrio: u.barrio, comuna: u.comuna,
    sisben_category: u.sisbenCategory, authorized: u.authorized ? 'SI' : 'NO',
    created_at: u.createdAt, updated_at: u.updatedAt,
  })));

  // ── Hoja Interacciones ────────────────────────────────────
  interacciones.columns = [
    { header: 'ID',               key: 'id',                width: 10 },
    { header: 'Fecha/Hora',       key: 'ts',                width: 25 },
    { header: 'Fecha Colombia',   key: 'date_co',           width: 16 },
    { header: 'WhatsApp',         key: 'phone',             width: 18 },
    { header: 'Nombre',           key: 'name',              width: 28 },
    { header: 'Tipo Doc',         key: 'doc_type',          width: 12 },
    { header: 'Documento',        key: 'document_number',   width: 18 },
    { header: 'Mensaje recibido', key: 'body',              width: 40 },
    { header: 'Opción',           key: 'option_selected',   width: 12 },
    { header: 'Título opción',    key: 'option_title',      width: 28 },
    { header: 'Pasó a asesor',    key: 'passed_to_advisor', width: 16 },
  ];
  interacciones.addRows(repo.getAllInteractions());

  // ── Hoja Casos ────────────────────────────────────────────
  casos.columns = [
    { header: 'ID',             key: 'id',              width: 10 },
    { header: 'Fecha/Hora',     key: 'ts',              width: 25 },
    { header: 'Fecha Colombia', key: 'date_co',         width: 16 },
    { header: 'WhatsApp',       key: 'phone',           width: 18 },
    { header: 'Nombre',         key: 'name',            width: 28 },
    { header: 'Tipo Doc',       key: 'doc_type',        width: 12 },
    { header: 'Documento',      key: 'document_number', width: 18 },
    { header: 'Barrio',         key: 'barrio',          width: 22 },
    { header: 'Comuna',         key: 'comuna',          width: 18 },
    { header: 'Motivo',         key: 'reason',          width: 28 },
    { header: 'Estado',         key: 'status',          width: 15 },
    { header: 'Cerrado',        key: 'closed_at',       width: 25 },
    { header: 'Notas',          key: 'notes',           width: 35 },
  ];
  casos.addRows(repo.getAllCases().map((c) => c.toJSON()));

  for (const ws of [resumen, usuarios, interacciones, casos]) _freeze(ws);

  const filename = `control_sisy_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const fullPath = path.join(config.data.exports, filename);
  await workbook.xlsx.writeFile(fullPath);
  return fullPath;
};

module.exports = { exportToExcel };
