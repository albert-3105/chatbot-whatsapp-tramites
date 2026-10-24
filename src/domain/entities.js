'use strict';

const { USER_STEPS, CASE_STATUS } = require('./constants');

class User {
  constructor({
    fromId, phone, whatsappName = '', name = '', docType = '',
    documentNumber = '', sisbenCategory = '', sisbenAntiguoScore = '', authorized = false,
    topic = '', awaitingSubmenu = '', lastMenu = '', barrio = '', comuna = '',
    step, createdAt, updatedAt,
  }) {
    this.fromId             = fromId;
    this.phone              = phone;
    this.whatsappName       = whatsappName;
    this.name               = name;
    this.docType            = docType;
    this.documentNumber     = documentNumber;
    this.sisbenCategory     = sisbenCategory;      // nivel/grupo del RUI (sistema actual)
    this.sisbenAntiguoScore = sisbenAntiguoScore;  // puntaje del Sisbén antiguo
    this.authorized         = authorized;
    this.topic           = topic;            // 'SISBEN' | 'RUI'
    this.awaitingSubmenu = awaitingSubmenu;   // ej: 'RUI_FAQ'
    this.lastMenu        = lastMenu;          // ej: 'FAQ' — para "volver atrás"
    this.barrio          = barrio;
    this.comuna          = comuna;
    this.step            = step || USER_STEPS.AWAITING_CONSENT;
    this.createdAt       = createdAt || new Date().toISOString();
    this.updatedAt       = updatedAt || new Date().toISOString();
  }

  isRegistered()   { return this.step === USER_STEPS.READY; }
  hasConsented()   { return this.authorized; }
  isAwaitingName() { return this.step === USER_STEPS.AWAITING_NAME; }

  toJSON() {
    return {
      from_id:         this.fromId,
      phone:           this.phone,
      whatsapp_name:   this.whatsappName,
      name:            this.name,
      doc_type:        this.docType,
      document_number: this.documentNumber,
      sisben_category: this.sisbenCategory,
      sisben_antiguo_score: this.sisbenAntiguoScore,
      authorized:      this.authorized,
      topic:           this.topic,
      awaiting_submenu: this.awaitingSubmenu,
      last_menu:       this.lastMenu,
      barrio:          this.barrio,
      comuna:          this.comuna,
      step:            this.step,
      created_at:      this.createdAt,
      updated_at:      new Date().toISOString(),
    };
  }

  static fromJSON(data) {
    return new User({
      fromId:          data.from_id,
      phone:           data.phone,
      whatsappName:    data.whatsapp_name,
      name:            data.name,
      docType:         data.doc_type,
      documentNumber:  data.document_number,
      sisbenCategory:  data.sisben_category,
      sisbenAntiguoScore: data.sisben_antiguo_score,
      authorized:      data.authorized,
      topic:           data.topic,
      awaitingSubmenu: data.awaiting_submenu,
      lastMenu:        data.last_menu,
      barrio:          data.barrio,
      comuna:          data.comuna,
      step:            data.step,
      createdAt:       data.created_at,
      updatedAt:       data.updated_at,
    });
  }
}

class AdvisorCase {
  constructor({
    id, fromId, phone, name = '', docType = '', documentNumber = '',
    barrio = '', comuna = '',
    reason = '', status, closedAt = '', notes = '', createdAt, dateCo,
    alreadyExists = false,
  }) {
    this.id             = id;
    this.fromId         = fromId;
    this.phone          = phone;
    this.name           = name;
    this.docType        = docType;
    this.documentNumber = documentNumber;
    this.barrio         = barrio;
    this.comuna         = comuna;
    this.reason         = reason;
    this.status         = status || CASE_STATUS.PENDING;
    this.closedAt       = closedAt;
    this.notes          = notes;
    this.createdAt      = createdAt || new Date().toISOString();
    this.dateCo         = dateCo   || '';
    this.alreadyExists  = alreadyExists;
  }

  isPending()  { return this.status === CASE_STATUS.PENDING; }
  isAttended() { return this.status === CASE_STATUS.ATTENDED; }

  close(notes = '') {
    this.status   = CASE_STATUS.ATTENDED;
    this.closedAt = new Date().toISOString();
    this.notes    = notes || this.notes;
  }

  toJSON() {
    return {
      id:              this.id,
      ts:              this.createdAt,
      date_co:         this.dateCo,
      from_id:         this.fromId,
      phone:           this.phone,
      name:            this.name,
      document_number: this.documentNumber,
      doc_type:        this.docType,
      barrio:          this.barrio,
      comuna:          this.comuna,
      reason:          this.reason,
      status:          this.status,
      closed_at:       this.closedAt,
      notes:           this.notes,
    };
  }

  static fromJSON(data) {
    return new AdvisorCase({
      id:             data.id,
      fromId:         data.from_id,
      phone:          data.phone,
      name:           data.name,
      docType:        data.doc_type,
      documentNumber: data.document_number,
      barrio:         data.barrio,
      comuna:         data.comuna,
      reason:         data.reason,
      status:         data.status,
      closedAt:       data.closed_at,
      notes:          data.notes,
      createdAt:      data.ts,
      dateCo:         data.date_co,
    });
  }
}

module.exports = { User, AdvisorCase };
