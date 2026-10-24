'use strict';

const config   = require('../config/app.config');
const { DOC_TYPE_LABELS } = require('../domain/constants');
const { getGreeting, getScheduleStatus } = require('../infrastructure/schedule.service');

const BOT      = config.bot.name;
const BOT_FULL = config.bot.fullName;

const consent = () => {
  const saludo = getGreeting();
  return (
    `${saludo} 👋 Soy *${BOT}*, el ${BOT_FULL}, un asistente virtual al servicio del Sisbén.\n\n` +
    `🤖 Estoy disponible las 24 horas, los 7 días de la semana para orientarte con tus trámites del Sisbén.\n\n` +
    `👩‍💼 Si necesitas atención personalizada con un asesor humano, puedes solicitarla en cualquier momento. ` +
    `Los asesores te atienden de lunes a viernes de 7:30 AM a 3:00 PM.\n\n` +
    `Para continuar, necesitamos que nos autorices a tratar tus datos personales.\n\n` +
    `Responde *SI* para autorizar y continuar.\nResponde *NO* si no autorizas.`
  );
};

const askTopic = () =>
  `Para orientarte mejor, cuéntame primero:\n\n` +
  `1️⃣ Mi consulta es sobre el *Sisbén* (el sistema anterior)\n` +
  `2️⃣ Mi consulta es sobre el *RUI* (el sistema actual)\n` +
  `3️⃣ Quiero descargar mi *certificado del RUI*\n\n` +
  `Responde solo con el número: *1*, *2* o *3*.`;

const certificadoInstrucciones = () =>
  `📄 *Descargar certificado del RUI*\n\n` +
  `1. Ingresa a la Ventanilla Social del DNP:\nhttps://ventanillasocial.dnp.gov.co/\n\n` +
  `2. Escribe tu tipo y número de documento.\n` +
  `3. Da clic en *Consultar*.\n` +
  `4. Descarga el certificado en PDF.\n\n` +
  `Este es el certificado oficial del DNP; nosotros no lo generamos aquí.\n\n` +
  `¿Necesitas algo más?\n1️⃣ Consulta sobre el Sisbén\n2️⃣ Consulta sobre el RUI`;

const topicExplainer = (topic) => {
  if (topic === 'SISBEN') {
    return (
      `📌 *Sobre el Sisbén*\n\n` +
      `El Sisbén ya no tiene una página propia para consultar el puntaje. ` +
      `Desde el 1 de agosto de 2026, esa consulta se hace a través del *RUI* ` +
      `(Registro Universal de Ingresos), el sistema que lo está reemplazando poco a poco.\n\n` +
      `✅ Tranquilo/a: tus subsidios actuales no se pierden por este cambio.\n\n` +
      `Te voy a ayudar a consultar tu nivel a través del RUI.`
    );
  }
  return (
    `📌 *Sobre el RUI*\n\n` +
    `El RUI (Registro Universal de Ingresos) es el sistema que está reemplazando ` +
    `poco a poco al Sisbén desde el 1 de agosto de 2026. Con él puedes consultar tu ` +
    `nivel de clasificación (por ejemplo *C07*) y hacer otros trámites.\n\n` +
    `Vamos a registrar tus datos para poder consultarlo.`
  );
};

const askName = () => 'Por favor escribe tu *nombre completo*.';

const askDocType = () =>
  `Ahora dinos tu *tipo de documento*.\n\nResponde solo con el número:\n\n` +
  `1️⃣ Registro Civil (RC)\n2️⃣ Tarjeta de Identidad (TI)\n3️⃣ Cédula de Ciudadanía (CC)\n` +
  `4️⃣ Cédula de Extranjería (CE)\n5️⃣ DNI / Pasaporte\n6️⃣ Salvoconducto para refugiado\n` +
  `7️⃣ Permiso Especial de Permanencia (PEP)\n8️⃣ Permiso Por Protección Temporal (PPT)`;

const askDocument = (docTypeKey = '') => {
  const label = DOC_TYPE_LABELS[docTypeKey] || '';
  const tipo  = label ? ` (${label})` : '';
  return `Ahora escribe tu *número de documento${tipo}*, sin puntos ni espacios.`;
};

const askBarrio = () => 'Ahora dinos el *barrio* desde el que te comunicas.';

const askComuna = () => 'Por último, dinos la *comuna* a la que pertenece ese barrio.';

const menu = (user) => {
  const saludo = user?.name ? `Hola *${user.name}* 👋` : 'Hola 👋';
  const asistenteDe = user?.topic === 'SISBEN' ? 'RUI (antes Sisbén)' : 'RUI';

  return (
    `${saludo} Soy *${BOT}*, tu asistente virtual del ${asistenteDe}.\n\n` +
    `${getScheduleStatus()}\n\n` +
    `Escribe el número de la opción: 👇\n\n` +
    `1️⃣ Consultar mi nivel\n` +
    `2️⃣ ¿Cómo me clasifican?\n` +
    `3️⃣ Actualizar datos\n` +
    `4️⃣ Documentos Para Solicitar encuesta\n` +
    `5️⃣ Requisitos\n` +
    `6️⃣ Hablar con un asesor\n` +
    `7️⃣ Puntos de atención\n` +
    `8️⃣ Preguntas sobre el RUI \n`+
    '*Nota: Todos los trámites se realizan presencialmente en los puntos de atención. No se realizan trámites virtuales.*'
    
    
  );
};

const navigation = () =>
  `Escribe el número de la opción: 👇\n\n0️⃣ Menú principal\n9️⃣ Volver atrás\n6️⃣ Hablar con un asesor`;

const _sinDato = (valor) => !valor || valor === 'No disponible' || valor === 'NO APARECE';

const welcomeWithCategory = (user, categoria, puntajeSisbenAntiguo) => {
  const saludo = getGreeting();
  const nombre = user.name || user.whatsappName || 'usuario';
  const header = `${saludo} *${nombre}* 👋\n\n`;
  if (_sinDato(categoria)) {
    return (
      header +
      `No fue posible consultar tu nivel del RUI automáticamente en este momento.\n\n` +
      `Puedes intentarlo directamente en:\nhttps://ventanillasocial.dnp.gov.co\n\n` +
      `O elige la opción *6* para hablar con un asesor.`
    );
  }

  const lineaRui    = `📊 Tu nivel en el RUI es: *${categoria}*\n`;
  const lineaSisben = _sinDato(puntajeSisbenAntiguo)
    ? ''
    : `Su puntaje del sisben antiguo es: *${puntajeSisbenAntiguo}*\n`;

  return header + lineaRui + lineaSisben + `\n¿En qué más puedo ayudarte?`;
};

const adminPanel = () =>
  `🛠️ *Panel administrador ${BOT}*\n\nElige una opción respondiendo solo con el número:\n\n` +
  `📊 *Reportes*\n1️⃣ Reporte de hoy\n2️⃣ Reporte de esta semana\n3️⃣ Reporte de este mes\n\n` +
  `👩‍💼 *Casos*\n4️⃣ Ver casos pendientes\n5️⃣ Cómo cerrar un caso\n\n` +
  `📁 *Exportación*\n6️⃣ Exportar Excel\n9️⃣ Backup a Google Sheets\n\n` +
  `🧪 *Pruebas*\n7️⃣ Probar si el bot responde\n8️⃣ Reiniciar datos de prueba\n\n` +
  `🏠 0️⃣ Ver menú ciudadano\n\n` +
  `━━━━━━━━━━━━━━━━━━━━━━\n💬 *Responder a un ciudadano*\n\n` +
  `Opción A — Mensaje único:\n*RESPONDER <número> <mensaje>*\n\n` +
  `Opción B — Modo chat (foco):\n*HABLAR CON <número>*\nLuego escribe libremente.\n\n` +
  `Para cerrar el caso, escribe *resuelto* (o *listo*, *finalizado*, *cerrado*).\n` +
  `Para salir sin cerrar el caso, escribe *salir*.\n` +
  `━━━━━━━━━━━━━━━━━━━━━━\n\nPara cerrar todos los pendientes de una vez:\n*5 todos*`;

const closeCaseHelp = () =>
  `Para cerrar el caso de un ciudadano, entra en modo chat y escríbelo directamente en la conversación:\n\n` +
  `1️⃣ *HABLAR CON <número>*\n2️⃣ Atiende al ciudadano\n3️⃣ Cuando termines, escribe: *resuelto* (o *listo*, *finalizado*, *cerrado*)\n\n` +
  `Eso cierra el caso, libera el foco y le avisa al ciudadano automáticamente.\n\n` +
  `━━━━━━━━━━━━━━━━━━━━━━\n🗂️ *Para cerrar TODOS los casos pendientes:*\n\n*5 todos*\nTambién puedes escribir:\n*#cerrar todos*`;

const caseClosedForCitizen = () =>
  `✅ Gracias por comunicarte con la oficina socioeconómica de caracterización del Sisbén de Cúcuta.`;

const caseClosedForAdvisor = (caseId) =>
  `✅ Caso #${caseId} cerrado y foco liberado.`;

const caseClosedNoPendingCase = () =>
  `✅ Foco liberado. No encontré un caso pendiente asociado a este número, así que no había nada que cerrar.`;

const OPTION_REPLIES = {
  '1': `📊 *Consulta tu nivel del RUI*\n\nEste es el resultado que tenemos registrado para ti.\n\nSi necesitas el certificado oficial para un trámite (salud, educación, subsidios), descárgalo directamente en:\nhttps://ventanillasocial.dnp.gov.co/\n\nSi no coincide con lo que esperabas o no aparece información, responde *6* para hablar con un asesor.`,
  '2': `📌 *¿Cómo funciona la clasificación del RUI?*\n\nEl RUI ya no usa un puntaje numérico (0 a 100) como antes. Ahora clasifica los hogares según sus ingresos y condiciones socioeconómicas, cruzando información de más de 40 entidades del Estado (DIAN, Registraduría, entre otras).\n\nLos grupos se mantienen:\n\n• *Grupo A:* pobreza extrema\n• *Grupo B:* pobreza moderada\n• *Grupo C:* vulnerable\n• *Grupo D:* no pobre ni vulnerable\n\nCada grupo tiene subniveles, por ejemplo *C07*.\n\n⚠️ *Importante:* pertenecer a un grupo no garantiza un subsidio; solo clasifica la información del hogar.\n\nResponde *1* para consultar tu nivel, o *6* para hablar con un asesor.`,
  '3': `📝 *Actualización de datos*\n\nLa actualización de datos no se realiza directamente por este chat.\n\nDebes solicitar actualización cuando necesites reportar cambios como:\n\n• Cambio de dirección\n• Cambio en los integrantes del hogar\n• Cambios en ingresos o información personal\n\n*Requisitos generales:*\n• Documento del jefe del hogar\n• Documento de las personas involucradas en el cambio\n• Soportes del cambio, si aplica\n\n📍 Puedes acercarte al punto de atención correspondiente.\n\nSi deseas orientación, responde *6* para hablar con un asesor.`,
  '4': `📋 *Solicitar encuesta*\n\nPara solicitar una encuesta debes tener a la mano:\n\n• Fotocopia del documento de identidad por ambos lados\n• Dirección actual (recibo de servicios públicos o recibo de luz)\n• Teléfono de contacto\n• Información de los integrantes del hogar\n\nSi necesitas apoyo con el proceso, responde *6* para hablar con un asesor.`,
  '5': `📎 *Requisitos generales*\n\nPara trámites del RUI normalmente necesitas:\n\n• Fotocopia del documento de identidad por ambos lados\n• Dirección actual (recibo de servicios públicos o recibo de luz)\n• Dirección actualizada\n• Soportes del cambio, si aplica\n\nSi no sabes qué documento necesitas, responde *6* para hablar con un asesor.`,
  '6': `Entiendo que necesitas ayuda 🙏\n\nTe voy a conectar con uno de nuestros asesores. En breve se comunicarán contigo.`,
  '7': `📍 *Puntos de Atención en Cúcuta*\n\n*Activos actualmente (7:30 a.m. a 1:00 p.m.):*\n\n🏢 *Sede Principal – Centro Comercial Las Mercedes*\n📌 Avenida 7 entre calles 5 y 6, Centro\n\n🛡️ *Cuidarte La Libertad*\n📌 Calle 13, Avenida 16AB, barrio La Libertad\n\n🕊️ *Centro Regional de Atención a Víctimas (CRAV Comuneros)*\n📌 Calle 0 N° 12-17, barrio Comuneros, junto a Bomberos Atalaya\n\n⚠️ Los demás puntos no están habilitados por el momento.\n\nSi tienes dudas sobre a qué punto acudir, responde *6* para hablar con un asesor.`,
  '8': `❓ *Preguntas frecuentes Sobre el RUI*\n\nResponde solo con el número de tu pregunta:\n\n1️⃣ ¿Perdí mi subsidio por el cambio al RUI?\n2️⃣ ¿Cómo descargo mi certificado?\n3️⃣ No estoy de acuerdo con mi nivel\n4️⃣ ¿Hasta cuándo puedo actualizar mis datos?`,
};

// Respuestas de las preguntas frecuentes del RUI (opción 8 del menú).
// El usuario responde solo con el número (1, 2, 3 o 4).
const RUI_FAQ_REPLIES = {
  '1': `🛡️ *¿Perdí mi subsidio por el cambio al RUI?*\n\nTranquilo/a, el cambio al RUI *no genera cortes automáticos ni inmediatos* de subsidios como Renta Ciudadana, Colombia Mayor o Renta Joven.\n\nTu clasificación se va actualizando gradualmente durante la transición (hasta el 31 de octubre de 2026). Si notas algo raro con tu subsidio, responde *6* para hablar con un asesor.`,
  '2': `📄 *Cómo descargar tu certificado del RUI*\n\n1. Entra a la Ventanilla Social y toca *Consulta RUI*.\n2. Elige tu tipo de documento, escribe el número y toca *Consultar*.\n3. Toca *Imprimir Reporte* para descargar tu certificado en PDF.\n\n🔗 https://ventanillasocial.dnp.gov.co/\n\nTe comparto el paso a paso en imágenes 👇`,
  '3': `⚖️ *No estoy de acuerdo con mi nivel del RUI*\n\nSi consideras que tu clasificación no refleja tu situación real, puedes solicitar una revisión en tu punto de atención más cercano.\n\nNecesitarás: documento de identidad y soportes de tu situación económica actual.\n\nResponde *6* para que un asesor te oriente con este trámite.`,
  '4': `🗓️ *¿Hasta cuándo puedo actualizar mis datos?*\n\nPuedes seguir actualizando tus datos con normalidad. El periodo de transición hacia el RUI va hasta el *31 de octubre de 2026*.\n\nResponde *3* si quieres iniciar la actualización de tus datos.`,
};

// Rutas de las imágenes con el paso a paso para descargar el certificado del RUI.
// Se envían junto con RUI_FAQ_REPLIES['2'].
const RUI_CERT_STEPS_IMAGES = [
  { path: 'assets/rui-certificado/paso1-consulta-rui.png',            caption: 'Paso 1: toca *Consulta RUI*' },
  { path: 'assets/rui-certificado/paso2-diligenciar-documento.png',    caption: 'Paso 2: escribe tu documento y toca *Consultar*' },
  { path: 'assets/rui-certificado/paso3-imprimir-reporte.png',         caption: 'Paso 3: toca *Imprimir Reporte* para descargarlo' },
];

module.exports = {
  consent, askTopic, topicExplainer, certificadoInstrucciones, askName, askDocType, askDocument, askBarrio, askComuna,
  menu, navigation, welcomeWithCategory,
  adminPanel, closeCaseHelp, caseClosedForCitizen, caseClosedForAdvisor, caseClosedNoPendingCase,
  OPTION_REPLIES, RUI_FAQ_REPLIES, RUI_CERT_STEPS_IMAGES,
};
