# S.I.S.I · Chatbot de WhatsApp para trámites

Chatbot que hice para el **Sisbén Cúcuta**: atiende por WhatsApp las 24 horas, orienta sobre trámites y pasa a un asesor humano lo que necesita una persona. Este repositorio es la **versión 2**, construida sobre `whatsapp-web.js`; la versión en producción migró después a la API oficial de WhatsApp de Meta.

## Flujo del ciudadano

1. Saludo y **autorización de tratamiento de datos** (sin autorización no continúa).
2. Registro: nombre, tipo de documento (8 tipos, incluidos PEP y PPT), número, barrio y comuna.
3. **Consulta** de su clasificación en el RUI y de su grupo en el Sisbén anterior, a partir de la consulta pública del DNP.
4. **Menú** con 8 opciones: consultar nivel, cómo me clasifican, actualizar datos, solicitar encuesta, requisitos, hablar con un asesor, puntos de atención y preguntas frecuentes. Incluye una guía con imágenes para descargar el certificado.
5. **Hablar con un asesor**: revisa el horario (lunes a viernes, 7:30 a. m. – 3:00 p. m.) y crea un caso.

## Panel de asesores (dentro de WhatsApp)

- El número administrador recibe cada **caso nuevo** con los datos del ciudadano.
- Comandos para responder (`RESPONDER <número> <mensaje>`), **modo chat** que silencia al bot mientras el asesor conversa, y cierre de casos.
- El ciudadano recibe las respuestas como "Asesor S.I.S.I".

## Cómo está hecho

Arquitectura por capas:

```
src/
├── domain/          entidades, constantes y validaciones
├── application/     flujo del ciudadano, panel admin, asesores, mensajes, reportes
├── infrastructure/  WhatsApp, consulta RUI, Google Sheets, respaldos en Drive,
│                    Excel, cola de envíos, inactividad y horario
├── config/          configuración desde .env
└── shared/          utilidades
```

- **Cola de mensajes salientes** con espera aleatoria y tope por hora para reducir el riesgo de bloqueo.
- **Cierre automático por inactividad** de las conversaciones.
- **Respaldos** diarios en Google Drive y exportes a Excel para control.
- Manejo de los identificadores `@lid` de WhatsApp para obtener el número real del ciudadano.

## Instalación

```bash
npm install
cp .env.example .env   # completa ADMIN_NUMBER y, si los usas, los datos de Google
npm start              # escanea el QR con el WhatsApp del bot
```

> `.env`, `data/`, `backups/` y cualquier `.json` de credenciales están en `.gitignore`: tienen claves y datos de ciudadanos.

---
Autor: [Albert Bermúdez](https://albert-3105.github.io)
