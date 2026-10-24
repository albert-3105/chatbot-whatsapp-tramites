'use strict';

const { client } = require('./src/infrastructure/whatsapp.client');
const repo       = require('./src/infrastructure/repository');
const config      = require('./src/config/app.config');
const reports     = require('./src/application/reports.service');
const backup      = require('./src/infrastructure/backup.service');

const startBot = async () => {
  try {
    await client.initialize();
  } catch (error) {
    console.error('Error iniciando el bot:', error.message || error);
    console.log('Reintentando en 10 segundos...');
    setTimeout(startBot, 10000);
  }
};

client.on('ready', () => {
  console.log(`${config.bot.name} bot listo ✅`);
  
  // Iniciar backup diario automático
  backup.scheduleDailyBackup();
  
  // Resumen matutino a las 8:00 AM
  setInterval(() => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    if (now.getHours() === 8 && now.getMinutes() === 0) {
      const firstAdmin = config.bot.adminNumber.split(',')[0]?.trim();
      if (!firstAdmin) {
        console.warn('[Resumen] No hay ADMIN_NUMBER configurado, se omite el resumen matutino.');
        return;
      }
      const adminId = firstAdmin.includes('@') ? firstAdmin : firstAdmin + '@c.us';
      const resumen = reports.buildReport('hoy');
      client.sendMessage(adminId, `☀️ *Buenos días!*\n\nAquí está el resumen de casos:\n\n${resumen}`);
    }
  }, 60 * 1000);
});

let shuttingDown = false;

const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\nCerrando bot...');
  repo.saveAll();
  try { await client.destroy(); } catch (_) {}
  process.exit(0);
};

process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (e) => console.error('Promesa rechazada:', e.message || e));
process.on('uncaughtException',  (e) => { console.error('Error no controlado:', e.message || e); repo.saveAll(); process.exit(1); });

startBot();
