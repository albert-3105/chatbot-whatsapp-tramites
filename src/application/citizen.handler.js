'use strict';

const path      = require('path');
const repo      = require('../infrastructure/repository');
const sisben    = require('../infrastructure/sisben.service');
const schedule  = require('../infrastructure/schedule.service');
const advisor   = require('./advisor.service');
const msg       = require('./messages.service');
const { USER_STEPS, DOC_TYPE_MAP, DOC_TYPE_LABELS, MENU_OPTIONS,
        RUI_FAQ_OPTIONS, TOPIC_OPTIONS, HELP_PHRASES,
        NAV_KEYWORDS, HOME_KEYWORDS, BACK_KEYWORDS } = require('../domain/constants');
const { validateName, validateDocument, validateDocType, validateFreeText } = require('../domain/validators');
const { normalizeText } = require('../shared/utils');

// ── Resolución de selección del menú ─────────────────────────
// Distingue "0 / inicio" (siempre menú principal) de "9 / volver
// atrás" (depende de dónde estaba el usuario: si venía del submenú
// de preguntas frecuentes, vuelve ahí; si no, va al menú principal).
const resolveMenuOption = (body, lower) => {
  if (HOME_KEYWORDS.includes(lower)) return 'HOME';
  if (BACK_KEYWORDS.includes(lower)) return 'BACK';
  if (['1','2','3','4','5','6','7','8'].includes(body)) return body;

  const map = {
    'consultar mi nivel': '1', 'consultar puntaje': '1',
    'como me clasifican': '2', '¿como me clasifican?': '2', 'como me caracterizo': '2',
    'actualizar datos': '3', 'actualizar datos del sisben': '3',
    'solicitar encuesta': '4', 'requisitos': '5',
    'hablar con un asesor': '6', 'asesor': '6',
    'ubicaciones': '7', 'puntos de atencion': '7',
    'preguntas frecuentes': '8', 'preguntas frecuentes del rui': '8', 'faq': '8',
  };
  return map[normalizeText(body)] || '';
};

const isHelpRequest = (lower) =>
  HELP_PHRASES.some((phrase) => lower.includes(phrase));

// ── Handler principal ─────────────────────────────────────────
const handleCitizenMessage = async ({ fromId, body, lower, contactName, reply, sendMenu, sendWithNav, sendFile }) => {

  const ensureUser = () => {
    let user = repo.findUser(fromId);
    if (!user) user = repo.createUser(fromId, contactName, true);
    if (contactName && !user.whatsappName) {
      user.whatsappName = contactName;
      repo.saveUser(user);
    }
    return user;
  };

  const user = ensureUser();

  // Bot silenciado mientras atiende el asesor
  if (advisor.isActive(fromId)) return;

  // ── Paso 1: Consentimiento ────────────────────────────────
  if (user.step === USER_STEPS.AWAITING_CONSENT) {
    if (['si','sí','s','acepto','autorizo'].includes(lower)) {
      user.authorized = true;
      user.step       = USER_STEPS.AWAITING_TOPIC;
      repo.saveUser(user);
      await reply('✅ Gracias por autorizar el registro de tus datos.');
      await reply(msg.askTopic());
      return;
    }
    if (['no','n','no autorizo'].includes(lower)) {
      await reply('Entiendo. Sin autorización no puedo registrar tu solicitud.\n\nSi deseas continuar después, responde *SI*.');
      return;
    }
    await reply(msg.consent());
    return;
  }

  // ── Paso 2: Tema de la consulta (Sisbén / RUI / Certificado) ──
  if (user.step === USER_STEPS.AWAITING_TOPIC) {
    const chosenTopic = TOPIC_OPTIONS[body.trim()];
    if (!chosenTopic) {
      await reply(msg.askTopic());
      return;
    }
    if (chosenTopic === 'CERTIFICADO') {
      // No hace falta registrar nada para esto: solo mandamos las
      // instrucciones y dejamos al usuario en el mismo paso para
      // que elija 1 o 2 si quiere seguir con algo más.
      await reply(msg.certificadoInstrucciones());
      return;
    }
    user.topic = chosenTopic;
    user.step  = USER_STEPS.AWAITING_NAME;
    repo.saveUser(user);
    await reply(msg.topicExplainer(chosenTopic));
    await reply(msg.askName());
    return;
  }

  // ── Paso 3: Nombre ────────────────────────────────────────
  if (user.step === USER_STEPS.AWAITING_NAME || (!user.name && user.authorized)) {
    if (!validateName(body)) {
      await reply('Por favor escribe tu nombre completo. Ejemplo: *María Pérez Gómez*.');
      return;
    }
    user.name = body;
    user.step = USER_STEPS.AWAITING_DOC_TYPE;
    repo.saveUser(user);
    await reply(`Gracias, *${body}*.`);
    await reply(msg.askDocType());
    return;
  }

  // ── Paso 3: Tipo de documento ─────────────────────────────
  if (user.step === USER_STEPS.AWAITING_DOC_TYPE) {
    if (!validateDocType(body)) {
      await reply(`Por favor responde solo con el número (1 al 8).\n\n${msg.askDocType()}`);
      return;
    }
    const key   = body.trim();
    user.docType = DOC_TYPE_MAP[key];
    user.step    = USER_STEPS.AWAITING_DOCUMENT;
    repo.saveUser(user);
    await reply(`✅ Tipo de documento: *${DOC_TYPE_LABELS[key]}*`);
    await reply(msg.askDocument(key));
    return;
  }

  // ── Paso 4: Número de documento ────────────────────────────
  if (user.step === USER_STEPS.AWAITING_DOCUMENT || (!user.documentNumber && user.docType)) {
    const doc = body.replace(/\s+/g, '');
    if (!validateDocument(doc)) {
      await reply('El número debe ir solo con dígitos, sin puntos ni espacios. Inténtalo nuevamente.');
      return;
    }
    user.documentNumber = doc;
    user.step           = USER_STEPS.AWAITING_BARRIO;
    repo.saveUser(user);
    await reply(msg.askBarrio());
    return;
  }

  // ── Paso 5: Barrio ──────────────────────────────────────────
  if (user.step === USER_STEPS.AWAITING_BARRIO || (!user.barrio && user.documentNumber && user.step !== USER_STEPS.READY)) {
    if (!validateFreeText(body)) {
      await reply('Por favor escribe el nombre del barrio. Ejemplo: *La Libertad*.');
      return;
    }
    user.barrio = body.trim();
    user.step   = USER_STEPS.AWAITING_COMUNA;
    repo.saveUser(user);
    await reply(msg.askComuna());
    return;
  }

  // ── Paso 6: Comuna + consulta al RUI ───────────────────────
  if (user.step === USER_STEPS.AWAITING_COMUNA || (!user.comuna && user.barrio && user.step !== USER_STEPS.READY)) {
    if (!validateFreeText(body)) {
      await reply('Por favor escribe el nombre o número de la comuna. Ejemplo: *Comuna 6*.');
      return;
    }
    user.comuna = body.trim();
    user.step   = USER_STEPS.READY;
    repo.saveUser(user);

    await reply('✅ Datos registrados. Consultando tu categoría en el Rui...');
    const categoria = await sisben.consultarCategoriaSisben(user.docType || 'CC', user.documentNumber);
    const puntajeSisbenAntiguo = await sisben.consultarPuntajeSisbenAntiguo(user.docType || 'CC', user.documentNumber);
    user.sisbenCategory     = categoria;
    user.sisbenAntiguoScore = puntajeSisbenAntiguo;
    repo.saveUser(user);

    await reply(msg.welcomeWithCategory(user, categoria, puntajeSisbenAntiguo));
    await sendMenu(user);
    return;
  }

  // ── Compatibilidad: usuarios sin docType ─────────────────
  if (user.step === USER_STEPS.READY && !user.docType) {
    user.step = USER_STEPS.AWAITING_DOC_TYPE;
    repo.saveUser(user);
    await reply(`Hola *${user.name || user.whatsappName}* 👋. Necesitamos completar tu registro.\n\n${msg.askDocType()}`);
    return;
  }

  // ── Flujo normal: usuario registrado ─────────────────────
  if (HOME_KEYWORDS.includes(lower)) {
    if (user.awaitingSubmenu) { user.awaitingSubmenu = ''; user.lastMenu = ''; repo.saveUser(user); }
    await sendMenu(user);
    return;
  }

  // "Volver atrás": si el usuario venía del submenú de preguntas
  // frecuentes, lo regresamos ahí en vez de mandarlo al menú principal.
  if (BACK_KEYWORDS.includes(lower)) {
    if (user.lastMenu === 'FAQ') {
      user.awaitingSubmenu = 'RUI_FAQ';
      repo.saveUser(user);
      await reply(msg.OPTION_REPLIES['8']);
      return;
    }
    if (user.awaitingSubmenu) { user.awaitingSubmenu = ''; repo.saveUser(user); }
    await sendMenu(user);
    return;
  }

  // ── Submenú activo: preguntas frecuentes del RUI ──────────
  // Si el usuario acaba de ver la opción 8, en el siguiente mensaje
  // solo necesita escribir el número (1, 2, 3 o 4) — sin prefijos.
  if (user.awaitingSubmenu === 'RUI_FAQ') {
    const letra = body.trim();
    const texto = msg.RUI_FAQ_REPLIES[letra];
    user.awaitingSubmenu = '';
    // user.lastMenu se mantiene en 'FAQ' para que "volver atrás" regrese aquí
    repo.saveUser(user);

    if (texto) {
      repo.logInteraction({
        fromId, name: user.name || contactName, body,
        option: `8.${letra}`, passedToAdvisor: false,
        optionTitle: RUI_FAQ_OPTIONS[letra],
      });

      // Pregunta 2 (cómo descargar el certificado): texto + capturas del paso a paso
      if (letra === '2' && sendFile) {
        await reply(texto);
        for (const img of msg.RUI_CERT_STEPS_IMAGES) {
          const filePath = path.join(__dirname, '..', '..', img.path);
          await sendFile(filePath, img.caption);
        }
        await reply(msg.navigation());
        return;
      }

      await sendWithNav(texto);
      return;
    }
    // Si no escribió un número válido (1-4), seguimos con el flujo normal abajo
  }

  const option   = resolveMenuOption(body, lower);
  const optInfo  = MENU_OPTIONS[option];

  if (option === 'HOME') {
    if (user.awaitingSubmenu || user.lastMenu) { user.awaitingSubmenu = ''; user.lastMenu = ''; repo.saveUser(user); }
    await sendMenu(user);
    return;
  }

  if (option === 'BACK') {
    if (user.lastMenu === 'FAQ') {
      user.awaitingSubmenu = 'RUI_FAQ';
      repo.saveUser(user);
      await reply(msg.OPTION_REPLIES['8']);
      return;
    }
    await sendMenu(user);
    return;
  }

  // Opción 8: mostrar submenú y quedar a la espera del número
  if (option === '8') {
    repo.logInteraction({
      fromId, name: user.name || contactName, body: body || optInfo.title,
      option, passedToAdvisor: false, optionTitle: optInfo.title,
    });
    user.awaitingSubmenu = 'RUI_FAQ';
    user.lastMenu         = 'FAQ';
    repo.saveUser(user);
    await reply(msg.OPTION_REPLIES['8']);
    return;
  }

  // Frases libres de ayuda → conectar con asesor
  if (!optInfo && isHelpRequest(lower)) {
    const pending = repo.findPendingCase(fromId);
    const newCase = pending
      ? { ...pending.toJSON(), alreadyExists: true }
      : repo.createCase(fromId, `Mensaje libre: "${body.slice(0, 80)}"`);

    repo.logInteraction({
      fromId, name: user.name || contactName, body, option: '6',
      passedToAdvisor: true, optionTitle: 'Hablar con un asesor',
    });

    const horario = schedule.isWithinSchedule() ? '' : '\n\n' + schedule.getOutOfScheduleMessage();
    await reply(`Entiendo que necesitas ayuda 🙏\n\nTe voy a conectar con uno de nuestros asesores. En breve se comunicarán contigo.${horario}`);
    advisor.activate(fromId);
    return { notifyCase: newCase };
  }

  // Opción no reconocida
  if (!optInfo) {
    await reply('No entendí tu respuesta. Te muestro el menú nuevamente.');
    await sendMenu(user);
    return;
  }

  // Opción 6: asesor
  if (optInfo.advisor) {
    const pending = repo.findPendingCase(fromId);
    const newCase = pending
      ? { ...pending.toJSON(), alreadyExists: true }
      : repo.createCase(fromId, optInfo.title);

    repo.logInteraction({
      fromId, name: user.name || contactName, body: body || optInfo.title,
      option, passedToAdvisor: true, optionTitle: optInfo.title,
    });

    const horario  = schedule.isWithinSchedule() ? '' : '\n\n' + schedule.getOutOfScheduleMessage();
    const optReply = msg.OPTION_REPLIES[option] || '';
    await reply(`${optReply}${horario}`);
    advisor.activate(fromId);
    return { notifyCase: newCase };
  }

  // Opción 1: mostrar el nivel real del RUI ya consultado
  if (option === '1') {
    repo.logInteraction({
      fromId, name: user.name || contactName, body: body || optInfo.title,
      option, passedToAdvisor: false, optionTitle: optInfo.title,
    });
    const nivel   = user.sisbenCategory;
    const puntaje = user.sisbenAntiguoScore;
    const sinDato = (v) => !v || v === 'No disponible' || v === 'NO APARECE';
    const lineaSisben = sinDato(puntaje) ? '' : `Su puntaje del sisben antiguo es: *${puntaje}*\n`;
    const texto = !sinDato(nivel)
      ? `📊 *Tu nivel en el RUI*\n\nSegún nuestra última consulta, tu nivel es: *${nivel}*\n${lineaSisben}\n📄 Si necesitas el *certificado oficial* para un trámite, descárgalo en:\nhttps://ventanillasocial.dnp.gov.co/\n\nSi no coincide con lo que esperabas, responde *6* para hablar con un asesor.`
      : `📊 *Consulta tu nivel del RUI*\n\nNo tenemos un resultado guardado para tu documento en este momento.\n\nPuedes consultarlo directamente en:\nhttps://ventanillasocial.dnp.gov.co/\n\nSi necesitas ayuda, responde *6* para hablar con un asesor.`;
    await sendWithNav(texto);
    return;
  }

  // Opciones 2-5 y 7: respuesta informativa
  repo.logInteraction({
    fromId, name: user.name || contactName, body: body || optInfo.title,
    option, passedToAdvisor: false, optionTitle: optInfo.title,
  });
  await sendWithNav(msg.OPTION_REPLIES[option] || '');
};

module.exports = { handleCitizenMessage };
