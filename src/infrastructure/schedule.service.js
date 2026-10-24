'use strict';

const config = require('../config/app.config');

const _bogotaNow = () =>
  new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));

const isWithinSchedule = () => {
  const now   = _bogotaNow();
  const min   = now.getHours() * 60 + now.getMinutes();
  const start = config.schedule.startHour * 60 + config.schedule.startMin;
  const end   = config.schedule.endHour   * 60 + config.schedule.endMin;
  return config.schedule.days.includes(now.getDay()) && min >= start && min < end;
};

const getOutOfScheduleMessage = () => {
  const days   = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const now    = _bogotaNow();
  const h      = now.getHours();
  const m      = String(now.getMinutes()).padStart(2, '0');
  const { startHour, startMin, endHour, endMin } = config.schedule;
  const startStr = `${startHour}:${String(startMin).padStart(2,'0')} AM`;
  const endStr   = `${endHour - 12}:${String(endMin).padStart(2,'0')} PM`;
  return (
    `⏰ Son las ${h}:${m} del ${days[now.getDay()]}.\n\n` +
    `Nuestro horario de atención con asesores es:\n` +
    `*Lunes a viernes de ${startStr} a ${endStr}*\n\n` +
    `Tu caso quedó registrado y un asesor te contactará en el próximo horario hábil.`
  );
};

const getGreeting = () => {
  const h = _bogotaNow().getHours();
  if (h >= 6 && h < 12)  return 'Buenos días';
  if (h >= 12 && h < 18) return 'Buenas tardes';
  return 'Buenas noches';
};

const getScheduleStatus = () =>
  isWithinSchedule()
    ? '🟢 Asesores disponibles ahora'
    : `🔴 Asesores fuera de horario (L-V ${config.schedule.startHour}:${String(config.schedule.startMin).padStart(2,'0')} AM–${config.schedule.endHour - 12}:${String(config.schedule.endMin).padStart(2,'0')} PM)`;

module.exports = { isWithinSchedule, getOutOfScheduleMessage, getGreeting, getScheduleStatus };
