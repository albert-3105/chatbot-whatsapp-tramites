'use strict';

const path  = require('path');
const fs    = require('fs');
const excel = require('./excel.service');
const config = require('../config/app.config');

// Ruta de backups — crea la carpeta si no existe
const BACKUP_DIR = path.join(process.cwd(), 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// Archivo donde guardamos la fecha (Bogotá) del último backup exitoso,
// para poder detectar si el proceso estuvo apagado a la hora programada
// y "recuperar" el backup del día apenas el bot vuelva a estar en línea.
const LAST_RUN_FILE = path.join(BACKUP_DIR, '.last-backup-date');

const _bogotaNow = () =>
  new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));

const _bogotaDateStr = (d = _bogotaNow()) => {
  // YYYY-MM-DD en hora de Bogotá
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
};

const _getLastRunDate = () => {
  try { return fs.readFileSync(LAST_RUN_FILE, 'utf8').trim(); } catch (_) { return ''; }
};

const _setLastRunDate = (dateStr) => {
  try { fs.writeFileSync(LAST_RUN_FILE, dateStr); } catch (e) {
    console.error('[Backup] No se pudo guardar la fecha del último backup:', e.message);
  }
};

// Limpiar backups de más de 30 días
const _cleanOldBackups = () => {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const f of files) {
      if (f.startsWith('.')) continue; // no borrar el archivo de control
      const fp = path.join(BACKUP_DIR, f);
      if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
    }
  } catch (e) {
    console.error('[Backup] Error limpiando backups viejos:', e.message);
  }
};

let _running = false;

const runDailyBackup = async ({ silent = false } = {}) => {
  if (_running) return null; // evita ejecuciones simultáneas
  _running = true;
  try {
    const now = _bogotaNow();
    const dateStr = _bogotaDateStr(now);
    const timeStr = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;

    // Generar el Excel normal
    const sourcePath = await excel.exportToExcel();

    // Copiar a backups/ con timestamp
    const backupName = `backup_sisy_${dateStr}_${timeStr}.xlsx`;
    const backupPath = path.join(BACKUP_DIR, backupName);
    fs.copyFileSync(sourcePath, backupPath);

    _setLastRunDate(dateStr);
    console.log(`[Backup] ✅ Copia diaria guardada: ${backupName}`);
    _cleanOldBackups();

    // Subir el snapshot del día a Google Sheets (no interrumpe el backup si falla)
    try {
      const sheets = require('./sheets.service');
      await sheets.syncDailySnapshot();
    } catch (sheetsErr) {
      console.error('[Backup] ⚠️ No se pudo sincronizar con Google Sheets:', sheetsErr.message);
    }

    return backupPath;
  } catch (e) {
    console.error('[Backup] ❌ Error en copia diaria:', e.message);
    return null;
  } finally {
    _running = false;
  }
};

let _scheduled = false;

// Programado para las 11:59 PM hora Bogotá, con recuperación automática:
// si el bot estuvo apagado a esa hora (o se reinició), en cuanto vuelva a
// estar en línea revisa si ya se hizo el backup de hoy y, si no, lo genera.
const scheduleDailyBackup = () => {
  if (_scheduled) return; // evita duplicar el intervalo si 'ready' se dispara más de una vez
  _scheduled = true;

  const checkAndRunIfNeeded = () => {
    const now = _bogotaNow();
    const todayStr = _bogotaDateStr(now);
    if (_getLastRunDate() === todayStr) return; // ya se hizo hoy

    const isBackupTime = now.getHours() === 23 && now.getMinutes() >= 59;
    if (isBackupTime) runDailyBackup();
  };

  // Recuperación: si el bot arranca (o se reconecta) y todavía no hay un
  // backup registrado para el día de hoy —por ejemplo porque el proceso
  // estuvo apagado a las 11:59 PM—, se genera uno de inmediato en vez de
  // esperar silenciosamente hasta el día siguiente.
  const startupCheck = () => {
    const todayStr = _bogotaDateStr();
    if (_getLastRunDate() !== todayStr) {
      console.log('[Backup] No había backup registrado para hoy. Generando uno de recuperación...');
      runDailyBackup();
    }
  };
  startupCheck();

  // Revisar cada minuto
  setInterval(checkAndRunIfNeeded, 60 * 1000);
  console.log('[Backup] Programado backup diario a las 11:59 PM (Bogotá), con recuperación automática si el bot estuvo apagado.');
};

module.exports = { scheduleDailyBackup, runDailyBackup };