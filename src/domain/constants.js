'use strict';

const USER_STEPS = {
  AWAITING_CONSENT:   'awaiting_consent',
  AWAITING_TOPIC:      'awaiting_topic',
  AWAITING_NAME:      'awaiting_name',
  AWAITING_DOC_TYPE:  'awaiting_doc_type',
  AWAITING_DOCUMENT:  'awaiting_document',
  AWAITING_BARRIO:    'awaiting_barrio',
  AWAITING_COMUNA:    'awaiting_comuna',
  READY:              'ready',
};

const CASE_STATUS = {
  PENDING:   'pendiente',
  ATTENDED:  'atendido',
};

const DOC_TYPE_MAP = {
  '1': 'RC',
  '2': 'TI',
  '3': 'CC',
  '4': 'CE',
  '5': 'PA',
  '6': 'SC',
  '7': 'PEP',
  '8': 'PPT',
};

const DOC_TYPE_LABELS = {
  '1': 'Registro Civil (RC)',
  '2': 'Tarjeta de Identidad (TI)',
  '3': 'Cédula de Ciudadanía (CC)',
  '4': 'Cédula de Extranjería (CE)',
  '5': 'DNI / Pasaporte',
  '6': 'Salvoconducto para refugiado',
  '7': 'Permiso Especial de Permanencia (PEP)',
  '8': 'Permiso Por Protección Temporal (PPT)',
};

const DOC_SELECT_VALUES = {
  RC: '1', TI: '2', CC: '3', CE: '4',
  DNI: '5', PA: '6', SC: '7', PEP: '8', PPT: '9',
};

const DOC_SELECT_TEXTS = {
  RC:  ['registro civil'],
  TI:  ['tarjeta de identidad'],
  CC:  ['cedula de ciudadania', 'cédula de ciudadanía'],
  CE:  ['cedula de extranjeria', 'cédula de extranjería'],
  DNI: ['dni pais de origen'],
  PA:  ['dni pasaporte', 'pasaporte'],
  SC:  ['salvoconducto'],
  PEP: ['permiso especial de permanencia'],
  PPT: ['permiso por proteccion temporal', 'permiso por protección temporal'],
};

const HELP_PHRASES = [
  'tengo un problema', 'necesito ayuda', 'me pueden ayudar',
  'quiero hablar', 'necesito orientacion', 'tengo una pregunta',
  'quiero informacion', 'no entiendo', 'no se como', 'me ayudan',
  'auxilio', 'ayuda', 'problema', 'quiero saber', 'como hago',
  'que hago', 'donde voy', 'orientacion', 'informacion',
];

const MENU_OPTIONS = {
  '1': { title: 'Consultar mi nivel (RUI)',         advisor: false },
  '2': { title: '¿Cómo me clasifican?',             advisor: false },
  '3': { title: 'Actualizar datos',                 advisor: false },
  '4': { title: 'Solicitar encuesta',               advisor: false },
  '5': { title: 'Requisitos',                       advisor: false },
  '6': { title: 'Hablar con un asesor',             advisor: true  },
  '7': { title: 'Puntos de atención (Ubicaciones)', advisor: false },
  '8': { title: 'Preguntas frecuentes del RUI',     advisor: false },
};

// Preguntas frecuentes del RUI (opción 8 del menú).
// Ahora se seleccionan con un segundo paso: primero "8", y en el
// siguiente mensaje solo el número (1, 2, 3 o 4) — sin letras ni códigos.
const RUI_FAQ_OPTIONS = {
  '1': 'Perdí mi subsidio por el cambio al RUI',
  '2': 'Cómo descargo mi certificado del RUI',
  '3': 'No estoy de acuerdo con mi nivel del RUI',
  '4': 'Hasta cuándo puedo actualizar mis datos',
};

// Temas de consulta (pregunta previa al registro completo)
const TOPIC_OPTIONS = {
  '1': 'SISBEN',
  '2': 'RUI',
  '3': 'CERTIFICADO',
};

// Palabras que llevan siempre al menú principal (inicio "duro")
const HOME_KEYWORDS = ['menu','home','inicio','hola','buenas','buenos dias','buenas tardes','buenas noches','0'];

// Palabras que significan "volver a lo anterior" (depende del contexto)
const BACK_KEYWORDS = ['volver','atras','atrás','9'];

// Se mantiene por compatibilidad con código que aún use NAV_KEYWORDS
const NAV_KEYWORDS = [...HOME_KEYWORDS, ...BACK_KEYWORDS];

module.exports = {
  USER_STEPS,
  CASE_STATUS,
  DOC_TYPE_MAP,
  DOC_TYPE_LABELS,
  DOC_SELECT_VALUES,
  DOC_SELECT_TEXTS,
  HELP_PHRASES,
  MENU_OPTIONS,
  RUI_FAQ_OPTIONS,
  TOPIC_OPTIONS,
  NAV_KEYWORDS,
  HOME_KEYWORDS,
  BACK_KEYWORDS,
};
