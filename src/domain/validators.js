'use strict';

const { DOC_TYPE_MAP } = require('./constants');

const validateName = (text) => {
  const clean = String(text || '').trim();
  return clean.length >= 5 && /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(clean);
};

const validateDocument = (text) => {
  const clean = String(text || '').replace(/\s+/g, '');
  return /^\d{5,12}$/.test(clean);
};

const validateDocType = (text) => {
  return Object.keys(DOC_TYPE_MAP).includes(String(text || '').trim());
};

const validateFreeText = (text, minLength = 2) => {
  const clean = String(text || '').trim();
  return clean.length >= minLength;
};

module.exports = { validateName, validateDocument, validateDocType, validateFreeText };
