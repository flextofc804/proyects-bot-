// CONFIGURACION PRINCIPAL DEL BOT - edita aca
// Numero del dueño (con codigo de pais, sin +): todos los comandos de owner usan este numero
export const OWNER_NUMERO = "5491127289595"
// JID completo de WhatsApp del dueño
export const OWNER_NUMERO_JID = `${String(OWNER_NUMERO).replace(/[^0-9]/g, "")}@s.whatsapp.net`
// Prefijo base del bot (el bot tambien acepta el resto de prefijos # $ % & / . ! ? ;)
export const PREFIJO = "#"
// Clave para emparejar el menú secreto .erzabot cuando WhatsApp solo manda @lid sin numero
// (si tu .erzabot dice "menú es privado", mandá .erzabot <clave> una vez y queda guardado)
export const ERZA_CLAVE_MENU = "erza-2026"

// Canal oficial de WhatsApp del bot
export const CANAL_JID = "120363432287163228@newsletter"
export const CANAL_NOMBRE = "Danielaa"

export default { OWNER_NUMERO, OWNER_NUMERO_JID, PREFIJO, ERZA_CLAVE_MENU, CANAL_JID, CANAL_NOMBRE }

