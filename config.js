// CONFIGURACION PRINCIPAL DEL BOT - edita aca
// Numero del dueño (con codigo de pais, sin +): todos los comandos de owner usan este numero
export const OWNER_NUMERO = "5491127289595"
// JID completo de WhatsApp del dueño
export const OWNER_NUMERO_JID = `${String(OWNER_NUMERO).replace(/[^0-9]/g, "")}@s.whatsapp.net`
// Prefijo base del bot (el bot tambien acepta el resto de prefijos # $ % & / . ! ? ¡)
export const PREFIJO = "#"

export default { OWNER_NUMERO, OWNER_NUMERO_JID, PREFIJO }
