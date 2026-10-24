'use strict';

// ─────────────────────────────────────────────────────────────
// Consulta del RUI (Registro Único de Ingresos) del Sisbén.
//
// ANTES: se abría un navegador (Puppeteer) y se llenaba el
//        formulario de la página web del Sisbén.
// AHORA: el DNP expone un endpoint HTTP directo que devuelve
//        el resultado en JSON, así que ya no hace falta
//        navegador ni automatización — solo una petición HTTP.
// ─────────────────────────────────────────────────────────────

const { wait } = require('../shared/utils');

const RUI_ENDPOINT    = 'https://ventanillasocial.dnp.gov.co/Home/ObtenerDatosRUI';
const SISBEN_ENDPOINT = 'https://ventanillasocial.dnp.gov.co/Home/ConsultarGrupoSisben';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const MAX_RETRIES    = 3;
const RETRY_DELAY_MS = 1500; // pausa entre reintentos, para no saturar el endpoint

// Mapa: tipo de documento interno del bot → código que espera el RUI
// (según el mapa entregado: CC→3, CE→4, PPT→9, SC→7, TI→2)
const RUI_DOC_TYPE_MAP = {
  CC:  3,
  CE:  4,
  PPT: 9,
  SC:  7,
  TI:  2,
};

const NO_APARECE = 'NO APARECE';

// ── Petición HTTP individual genérica (sin reintentos) ─────────
// endpoint: URL del recurso (RUI o Sisbén antiguo, ambos reciben los mismos parámetros)
const _fetchDnp = async (endpoint, numeroDocumento, tipoDocCodigo) => {
  const body = new URLSearchParams({
    pNumDoc: String(numeroDocumento),
    pTipDoc: String(tipoDocCodigo),
  }).toString();

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin':       'https://ventanillasocial.dnp.gov.co',
        'Referer':      'https://ventanillasocial.dnp.gov.co/',
        'User-Agent':   USER_AGENT,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
};

// Mantiene el nombre anterior para no tocar el resto del código.
const _fetchRui = (numeroDocumento, tipoDocCodigo) =>
  _fetchDnp(RUI_ENDPOINT, numeroDocumento, tipoDocCodigo);

const _fetchSisbenAntiguo = (numeroDocumento, tipoDocCodigo) =>
  _fetchDnp(SISBEN_ENDPOINT, numeroDocumento, tipoDocCodigo);

// ── Petición con reintentos + pausas (genérica) ────────────────
const _fetchWithRetries = async (fetchFn, label, numeroDocumento, tipoDocCodigo) => {
  let lastError = null;

  for (let intento = 1; intento <= MAX_RETRIES; intento++) {
    try {
      console.log(`[${label}] Intento ${intento}/${MAX_RETRIES} | Doc: ${numeroDocumento} | Tipo: ${tipoDocCodigo}`);
      const data = await fetchFn(numeroDocumento, tipoDocCodigo);
      return data;
    } catch (error) {
      lastError = error;
      console.warn(`[${label}] ⚠️ Intento ${intento} falló: ${error.message}`);
      if (intento < MAX_RETRIES) {
        await wait(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
};

const _fetchRuiWithRetries = (numeroDocumento, tipoDocCodigo) =>
  _fetchWithRetries(_fetchRui, 'RUI', numeroDocumento, tipoDocCodigo);

const _fetchSisbenAntiguoWithRetries = (numeroDocumento, tipoDocCodigo) =>
  _fetchWithRetries(_fetchSisbenAntiguo, 'SISBEN-ANTIGUO', numeroDocumento, tipoDocCodigo);

// El endpoint ConsultarGrupoSisben puede devolver el dato bajo distintos
// nombres de campo según el registro. Probamos las variantes más comunes
// para no depender de un único nombre exacto.
const _extraerPuntajeSisben = (data) => {
  if (!data) return null;
  const candidatos = [
    data.grupoSisben, data.grupo_sisben, data.grupo,
    data.puntajeSisben, data.puntaje_sisben, data.puntaje,
    data.nivelSisben, data.nivel_sisben, data.nivel,
    data.categoria, data.clasificacion,
  ];
  const valor = candidatos.find((v) => v !== undefined && v !== null && String(v).trim() !== '');
  return valor !== undefined ? valor : null;
};

// ── Función principal (mismo nombre/firma que antes) ──────────
// tipoDocumento: 'CC' | 'CE' | 'TI' | 'SC' | 'PPT' | ... (otros no soportados por el RUI)
// numeroDocumento: string con el número de documento
const consultarCategoriaSisben = async (tipoDocumento, numeroDocumento) => {
  const tipo = String(tipoDocumento || 'CC').trim().toUpperCase();
  const doc  = String(numeroDocumento || '').replace(/\D/g, '');

  console.log(`[RUI] Consulta | Tipo: ${tipo} | Doc: ${doc}`);

  const tipoDocCodigo = RUI_DOC_TYPE_MAP[tipo];
  if (!tipoDocCodigo) {
    console.warn(`[RUI] ⚠️ Tipo de documento "${tipo}" no soportado por el endpoint RUI.`);
    return 'No disponible';
  }

  if (!doc) {
    console.warn('[RUI] ⚠️ Número de documento vacío.');
    return NO_APARECE;
  }

  try {
    const data = await _fetchRuiWithRetries(doc, tipoDocCodigo);

    // Pequeña pausa después de cada consulta para evitar bloqueo por rate-limit
    await wait(500);

    if (!data || data.ok !== true || !data.nivelRui) {
      console.log(`[RUI] Sin datos para ${tipo} ${doc} → ${NO_APARECE}`);
      return NO_APARECE;
    }

    console.log(`[RUI] ✅ Nivel: ${data.nivelRui} (grupo ${data.grupRui || '?'}) | ${data.nombre || ''}`);
    return data.nivelRui;

  } catch (error) {
    console.error(`[RUI] ❌ Error tras ${MAX_RETRIES} intentos:`, error.message);
    return 'No disponible';
  }
};

// ── Consulta del puntaje del Sisbén ANTIGUO ────────────────────
// Usa el mismo mapa de tipo de documento y la misma lógica de
// reintentos que el RUI, pero contra el endpoint ConsultarGrupoSisben.
const consultarPuntajeSisbenAntiguo = async (tipoDocumento, numeroDocumento) => {
  const tipo = String(tipoDocumento || 'CC').trim().toUpperCase();
  const doc  = String(numeroDocumento || '').replace(/\D/g, '');

  console.log(`[SISBEN-ANTIGUO] Consulta | Tipo: ${tipo} | Doc: ${doc}`);

  const tipoDocCodigo = RUI_DOC_TYPE_MAP[tipo];
  if (!tipoDocCodigo) {
    console.warn(`[SISBEN-ANTIGUO] ⚠️ Tipo de documento "${tipo}" no soportado.`);
    return 'No disponible';
  }

  if (!doc) {
    console.warn('[SISBEN-ANTIGUO] ⚠️ Número de documento vacío.');
    return NO_APARECE;
  }

  try {
    const data = await _fetchSisbenAntiguoWithRetries(doc, tipoDocCodigo);

    // Pequeña pausa después de cada consulta para evitar bloqueo por rate-limit
    await wait(500);

    // Se registra la respuesta cruda una vez para poder verificar/ajustar
    // el nombre exacto del campo si _extraerPuntajeSisben no lo encuentra.
    console.log('[SISBEN-ANTIGUO] Respuesta cruda:', JSON.stringify(data));

    if (!data || data.ok === false) {
      console.log(`[SISBEN-ANTIGUO] Sin datos para ${tipo} ${doc} → ${NO_APARECE}`);
      return NO_APARECE;
    }

    const puntaje = _extraerPuntajeSisben(data);
    if (!puntaje) {
      console.log(`[SISBEN-ANTIGUO] No se encontró el campo de puntaje para ${tipo} ${doc} → ${NO_APARECE}`);
      return NO_APARECE;
    }

    console.log(`[SISBEN-ANTIGUO] ✅ Puntaje: ${puntaje} | ${data.nombre || ''}`);
    return puntaje;

  } catch (error) {
    console.error(`[SISBEN-ANTIGUO] ❌ Error tras ${MAX_RETRIES} intentos:`, error.message);
    return 'No disponible';
  }
};

module.exports = { consultarCategoriaSisben, consultarPuntajeSisbenAntiguo };
