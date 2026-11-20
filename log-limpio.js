// Deja la consola del host limpia: oculta los volcados internos de libsignal/Baileys
// (sesiones, "Bad MAC", "Failed to decrypt...") y los avisos de arranque del bot,
// dejando pasar los errores reales (incluidos los de comandos).
//
// Niveles con la variable de entorno LOG_LEVEL:
//   quiet  (por defecto) -> solo errores
//   info                 -> errores + avisos del bot, sin volcados de sesiones
//   debug                -> todo tal cual (como antes)
//
// Este archivo se importa solo desde menus.js, que index.js carga al arrancar.

const NIVEL = String(process.env.LOG_LEVEL || "quiet").trim().toLowerCase()

// Frases que solo aparecen en los mensajes internos de libsignal / Baileys.
const RUIDO_SESION = [
  "closing session",
  "removing old closed session",
  "closing open session in favor",
  "opening session",
  "failed to decrypt message with any known session",
  "no matching sessions found for message",
  "session error",
  "bad mac",
  "messagecountererror",
  "key used already or never filled",
  "prekey bundle"
]

// Tokens exclusivos de los volcados de SessionEntry (objetos con claves de cifrado).
const TOKENS_VOLCADO = [
  "_chains:",
  "chainkey:",
  "registrationid:",
  "currentratchet:",
  "remoteidentitykey:",
  "pendingprekey:",
  "indexinfo:",
  "ephemeralkeypair:",
  "basekeytype:"
]

// Prefijos de los avisos informativos que imprime el propio bot.
const ETIQUETA_INFO = /^\[(YT|MENU|PORTADA|SUBBOT|INST|DL|SEARX|ZENITH|TTSEARCH|POT|ERZABOT|VIDEO|AUDIO)\]/i

// Si la linea suena a problema, se muestra aunque venga con etiqueta.
const PARECE_ERROR = /(error|fall[ao]|fall[oó]|no se pudo|no disponible|no soportad|bloque|fail|rechaz|inv[aá]lid|expirad|agot)/i

const ERROR_DESCIFRADO = /(bad mac|messagecounter|no matching sessions|failed to decrypt|session error)/i

function textoDe(args) {
  const primero = args[0]
  if (typeof primero === "string") return primero
  if (primero instanceof Error) return primero.message || String(primero)
  return ""
}

function esRuidoDeSesion(args) {
  const texto = textoDe(args).toLowerCase()
  if (!texto) return false
  if (RUIDO_SESION.some((pista) => texto.includes(pista))) return true
  return TOKENS_VOLCADO.some((token) => texto.includes(token))
}

function esAvisoInformativo(args) {
  const texto = textoDe(args)
  if (!texto || !ETIQUETA_INFO.test(texto)) return false
  return !PARECE_ERROR.test(texto)
}

function esErrorDeDescifrado(args) {
  return args.some((arg) => {
    const texto = typeof arg === "string" ? arg : (arg && arg.message) || ""
    return ERROR_DESCIFRADO.test(String(texto))
  })
}

let instalado = false

export function instalarLogLimpio() {
  if (instalado) return
  instalado = true

  const logOriginal = console.log.bind(console)
  const warnOriginal = console.warn.bind(console)
  const errorOriginal = console.error.bind(console)

  console.log = (...args) => {
    if (NIVEL !== "debug" && esRuidoDeSesion(args)) return
    if (NIVEL === "quiet" && esAvisoInformativo(args)) return
    logOriginal(...args)
  }

  console.warn = (...args) => {
    if (NIVEL !== "debug" && esRuidoDeSesion(args)) return
    warnOriginal(...args)
  }

  console.error = (...args) => {
    if (NIVEL !== "debug" && esErrorDeDescifrado(args)) return
    errorOriginal(...args)
  }
}

instalarLogLimpio()
