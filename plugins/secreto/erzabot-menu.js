// ============================================================
// ErzaBot - MENU SECRETO DE PRUEBAS (solo owner)
// Comando: .erzabot  (NO aparece en .menu ni en .help)
// Flow interactivo de WhatsApp (interactiveMessage + native flow)
// Tema Erza: rojo #E53935
// ============================================================
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { menuOrder, menuAliases, menuCategories } from "../../menus.js"
import { ERZA_CLAVE_MENU } from "../../config.js"

const DIR = path.dirname(fileURLToPath(import.meta.url))
const BANNER_LOCAL = path.join(DIR, "erza-banner.jpg")
// Pegá acá el link de tu foto de Erza 16:9 (si lo dejas vacío usa la imagen local de arriba)
const BANNER_URL = "" // ej: "https://i.ibb.co/xxxx/erza.jpg"
// Botón de URL opcional dentro del Flow (dejá vacío para no mostrarlo)
const URL_EXTRA = ""

const PIEZO = "⚔️"
const CORAZON = "❤️‍🔥"
const ROJO = "🔴"

// ============================================================
// MODO FLOW FULL-SCREEN (experimental, estilo WaBot de las capturas)
// La pantalla completa nativa (pestañas + buscador de WhatsApp Flows)
// renderiza un Flow publicado en una cuenta WhatsApp Business (WABA):
// un número MD normal no puede bajar esa pantalla por sí solo.
// Si tenés un Flow propio, poné su ID acá (modo published):
//   const ERZA_FLOW_ID = "1307913409923914"
// Vacío = payload comunitario de prueba (flow_id 1, mode draft) para
// TESTEAR si tu cliente de WhatsApp lo renderiza igual.
// ============================================================
const ERZA_FLOW_URL = ""
const ERZA_FLOW_ID = ""

// Pestañas del Flow (cada una abre una tarjeta aparte con sus comandos)
const TABS = [
  { key: "subbots", label: "⚔️ Subbots" },
  { key: "descargas", label: "📀 Descargas" },
  { key: "admin", label: "🛡️ Admin" },
  { key: "gacha", label: "🎠 Gacha" },
  { key: "utilidades", label: "🧷 Utilidades" }
]

// Acciones directas: cada botón ejecuta su comando normal
const ACCIONES = [
  { id: ".code", display_text: "🔗 Vincular SubBot" },
  { id: ".setprefix", display_text: "⚙️ Cambiar prefijo" },
  { id: ".bot", display_text: "🤖 Activar bot" },
  { id: ".play", display_text: "🎵 Descargar música" }
]

function bannerResuelto() {
  if (BANNER_URL && /^https?:\/\//i.test(BANNER_URL)) return BANNER_URL
  try {
    if (fs.existsSync(BANNER_LOCAL)) return BANNER_LOCAL
  } catch {}
  return ""
}

function catDe(nombre) {
  const alias = menuAliases[String(nombre || "").toLowerCase().trim()]
  if (menuCategories[alias]) return alias
  if (menuCategories[String(nombre || "").toLowerCase().trim()]) return String(nombre).toLowerCase().trim()
  return ""
}

function lineasCategoria(key) {
  const cat = menuCategories[key]
  const out = []
  for (const seccion of cat.sections || []) {
    out.push(`├「 ${seccion.title} 」`)
    for (const item of seccion.items || []) {
      out.push(`├ ${ROJO} ▸ *.${item.cmd}* ─ ${item.desc || ""}`)
    }
  }
  return out
}

function textoMenu() {
  const L = []
  L.push(`╭──「 ${PIEZO} *EʀᴢᴀBᴏᴛ* ‣ menú secreto 」──╮`)
  L.push("│")
  L.push(`│ ${CORAZON} *PANEL PRIVADO DE PRUEBAS*`)
  L.push(`│ ${ROJO} Solo el owner puede abrirlo`)
  L.push("│")
  L.push("│ Elige una categoría, busca o toca un comando...")
  L.push("│")
  L.push(`├ 🔍 *BUSCADOR* ─ tocá “Buscar comando...”`)
  L.push("│")
  for (const key of menuOrder) {
    const cat = menuCategories[key]
    const cmds = (cat.sections || []).flatMap((s) => (s.items || []).map((i) => `.${i.cmd}`)).join(" ")
    L.push(`├「 ${cat.emoji} *${cat.title}* 」`)
    L.push(`│ ${cmds}`)
    L.push("│")
  }
  L.push(`├ ${ROJO} ▸ *.erzabot <categoría>* ─ abrir una pestaña`)
  L.push(`╰──「 ${PIEZO} ErzaBot-MD/OFC ${ROJO} 」──╯`)
  return L.join("\n")
}

function textoCategoria(key) {
  const cat = menuCategories[key]
  const L = []
  L.push(`╭──「 ${cat.emoji} *${cat.title}* ─ ${PIEZO} 」╮`)
  L.push("│")
  L.push(...lineasCategoria(key))
  L.push("│")
  L.push(`├ ${ROJO} ▸ *.erzabot* ─ volver al inicio`)
  L.push(`╰──「 ${CODA()} 」──╯`)
  return L.join("\n")
}

function CODA() {
  return `${CORAZON} ErzaBot-MD/OFC`
}

// Secciones del buscador: cada categoría actúa como pestaña, cada fila ejecuta su comando
function seccionesBuscador() {
  return menuOrder.map((key) => {
    const cat = menuCategories[key]
    return {
      title: `${cat.emoji} ${cat.title}`,
      rows: (cat.sections || []).flatMap((seccion) =>
        (seccion.items || []).map((item) => ({
          id: `.${item.cmd}`,
          title: `.${item.cmd}`,
          description: item.desc || (seccion.title || "")
        }))
      )
    }
  })
}

// ============================================================
// FLOW FULL-SCREEN EXPERIMENTAL (botón galaxy_message)
// Manda los datos del menú (pestañas + comandos) como payload del Flow
// para testear si tu cliente de WhatsApp los renderiza en pantalla completa
// ============================================================
function datosGalaxy(key) {
  const cat = key && menuCategories[key] ? menuCategories[key] : null
  return {
    titulo: `${PIEZO} ErzaBot`,
    subtitulo: "Elige una categoría, busca o toca un comando para ver los detalles",
    color: "#E53935",
    activos: [".code", ".setprefix", ".bot", ".play"],
    categoria_actual: cat ? cat.title : "",
    pestañas: menuOrder.map((k) => ({
      id: `.erzabot ${k}`,
      label: `${menuCategories[k].emoji} ${menuCategories[k].title}`
    })),
    categorías: menuOrder.map((k) => ({
      key: k,
      emoji: menuCategories[k].emoji,
      title: menuCategories[k].title,
      comandos: (menuCategories[k].sections || []).flatMap((s) =>
        (s.items || []).map((i) => ({ cmd: `.${i.cmd}`, desc: i.desc || s.title || "" }))
      )
    })),
    accion_rapida: ACCIONES.map((a) => ({ id: a.id, texto: a.display_text }))
  }
}

function botonesGalaxy(key) {
  const galaxy = {
    mode: ERZA_FLOW_ID ? "published" : "draft",
    flow_message_version: "3",
    flow_token: `erza-test-${Date.now()}`,
    flow_id: ERZA_FLOW_ID || "1",
    flow_cta: `${PIEZO} Abrir menú ErzaBot`,
    flow_action: "navigate",
    flow_action_payload: {
      screen: key && menuCategories[key] ? `ERZA_${String(key).toUpperCase()}` : "ERZA_MENU",
      data: datosGalaxy(key)
    }
  }
  if (ERZA_FLOW_URL && /^https?:\/\//i.test(ERZA_FLOW_URL)) galaxy.flow_url = ERZA_FLOW_URL
  return [
    { name: "galaxy_message", buttonParamsJson: JSON.stringify(galaxy) },
    ...ACCIONES.map((a) => ({ name: "quick_reply", buttonParamsJson: JSON.stringify(a) })),
    { name: "quick_reply", buttonParamsJson: JSON.stringify({ id: ".erzabot", display_text: `${ROJO} ← Volver al inicio` }) }
  ]
}
async function mandarFlowGalaxy(ctx, key) {
  const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = await import("@whiskeysockets/baileys")
  const { sock, from, msg } = ctx
  const banner = bannerResuelto()
  let media = null
  if (banner) {
    try {
      media = await prepareWAMessageMedia({ image: { url: banner } }, { upload: sock.waUploadToServer })
    } catch {}
  }
  const cat = key && menuCategories[key] ? menuCategories[key] : null
  const texto = cat
    ? `${PIEZO} *EᴢᴀBᴏᴛ* \u0020• ${cat.emoji} ${cat.title}\n\nElige un comando, busca o volvé al inicio 👇`
    : `${PIEZO} *EᴢᴀBᴏᴛ*\n\nElige una categoría, busca o toca un comando...`
  const message = generateWAMessageFromContent(
    from,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            header: proto.Message.InteractiveMessage.Header.create({
              title: `${PIEZO} ErzaBot`,
              ...(media?.imageMessage ? { imageMessage: media.imageMessage } : {}),
              hasMediaAttachment: Boolean(media?.imageMessage)
            }),
            body: proto.Message.InteractiveMessage.Body.create({ text: texto }),
            footer: proto.Message.InteractiveMessage.Footer.create({ text: `${CORAZON} flow full-screen 🧪 ${ROJO} #E53935` }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
              buttons: botonesGalaxy(key),
              messageParamsJson: "{}"
            })
          })
        }
      }
    },
    { quoted: msg, userJid: sock.user?.id }
  )
  const nodes = [
    {
      tag: "biz",
      attrs: {},
      content: [
        {
          tag: "interactive",
          attrs: { type: "native_flow", v: "1" },
          content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }]
        }
      ]
    }
  ]
  if (!from.endsWith("@g.us")) nodes.push({ tag: "bot", attrs: { biz_bot: "1" } })
  await sock.relayMessage(from, message.message, { messageId: message.key.id, additionalNodes: nodes })
}

function botonesMain() {
  const botones = [
    {
      name: "single_select",
      buttonParamsJson: JSON.stringify({
        title: "🔍 Buscar comando...",
        sections: seccionesBuscador()
      })
    },
    ...TABS.map((t) => ({
      name: "quick_reply",
      buttonParamsJson: JSON.stringify({ id: `.erzabot ${t.key}`, display_text: t.label })
    })),
    {
      name: "quick_reply",
      buttonParamsJson: JSON.stringify({ id: ".erzabot flow", display_text: "🧪 Probar Flow full-screen" })
    }
  ]
  if (URL_EXTRA && /^https?:\/\//i.test(URL_EXTRA)) {
    botones.push({
      name: "cta_url",
      buttonParamsJson: JSON.stringify({ display_text: `${ROJO} Abre el Flow`, url: URL_EXTRA, merchant_url: URL_EXTRA })
    })
  }
  return botones
}

function botonesCategoria() {
  return [
    {
      name: "single_select",
      buttonParamsJson: JSON.stringify({
        title: "🔍 Buscar comando...",
        sections: seccionesBuscador()
      })
    },
    ...ACCIONES.map((a) => ({ name: "quick_reply", buttonParamsJson: JSON.stringify(a) })),
    {
      name: "quick_reply",
      buttonParamsJson: JSON.stringify({ id: ".erzabot flow", display_text: "🧪 Probar Flow full-screen" })
    },
    { name: "quick_reply", buttonParamsJson: JSON.stringify({ id: ".erzabot", display_text: `${ROJO} ← Volver al inicio` }) }
  ]
}

async function mandarFlow(ctx, texto, botones) {
  const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = await import("@whiskeysockets/baileys")
  const { sock, from, msg } = ctx
  const banner = bannerResuelto()
  let media = null
  if (banner) {
    try {
      media = await prepareWAMessageMedia({ image: { url: banner } }, { upload: sock.waUploadToServer })
    } catch {}
  }
  const message = generateWAMessageFromContent(
    from,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            header: proto.Message.InteractiveMessage.Header.create({
              title: `${PIEZO} ErzaBot`,
              ...(media?.imageMessage ? { imageMessage: media.imageMessage } : {}),
              hasMediaAttachment: Boolean(media?.imageMessage)
            }),
            body: proto.Message.InteractiveMessage.Body.create({ text: texto }),
            footer: proto.Message.InteractiveMessage.Footer.create({ text: `${CORAZON} erza-menu privado ${CORAZON} ${ROJO} #E53935` }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons: botones })
          })
        }
      }
    },
    { quoted: msg, userJid: sock.user?.id }
  )
  const nodes = [
    {
      tag: "biz",
      attrs: {},
      content: [
        {
          tag: "interactive",
          attrs: { type: "native_flow", v: "1" },
          content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }]
        }
      ]
    }
  ]
  if (!from.endsWith("@g.us")) nodes.push({ tag: "bot", attrs: { biz_bot: "1" } })
  await sock.relayMessage(from, message.message, { messageId: message.key.id, additionalNodes: nodes })
}

// ============================================================
// Lista de owner persistente del menú: Whatsapp a veces manda los
// mensajes del dueño como @lid SIN el numero real (en chat privado no
// siempre es resolvible) y el gate general no lo reconoce. Cuando el
// owner pasa el gate una vez (o empareja con la clave de config.js) se
// guardan sus numeros/lids en plugins/secreto/erzabot-owners.json
// ============================================================
const ARCHIVO_OWNERS = path.join(DIR, "erzabot-owners.json")

function leerOwners() {
  try {
    const raw = JSON.parse(fs.readFileSync(ARCHIVO_OWNERS, "utf8"))
    return Array.isArray(raw.owners) ? new Set(raw.owners) : new Set()
  } catch {
    return new Set()
  }
}

function guardarOwners(setOwners) {
  fs.writeFileSync(ARCHIVO_OWNERS, JSON.stringify({ owners: [...setOwners] }, null, 2))
}

function clavesOwnerDeCtx(ctx) {
  const claves = new Set()
  const sumar = (jid) => {
    const n = String(jid || "").split("@")[0].split(":")[0].replace(/[^0-9]/g, "")
    if (n) claves.add(n)
  }
  sumar(ctx.senderNumber)
  sumar(ctx.sender)
  const key = ctx.msg?.key || {}
  for (const jid of [key.participant, key.participantAlt, key.participantPn, key.remoteJid, key.remoteJidAlt]) sumar(jid)
  return claves
}

function esOwnerErza(ctx) {
  if (ctx.isOwner) {
    // aprendido: guardar todas las claves de esta sesión del owner
    const actuales = leerOwners()
    const claves = clavesOwnerDeCtx(ctx)
    const nuevas = [...claves].filter((c) => !actuales.has(c))
    if (nuevas.length) {
      for (const c of nuevas) actuales.add(c)
      try {
        guardarOwners(actuales)
      } catch {}
    }
    return true
  }
  const actuales = leerOwners()
  for (const c of clavesOwnerDeCtx(ctx)) if (actuales.has(c)) return true
  return false
}

export default {
  comandos: ["erzabot"],
  ayuda: "erzabot - menú secreto de pruebas (solo owner)",
  secreto: true,
  ejecutar: async (ctx) => {
    // SEGURIDAD: solo el owner (con emparejamiento de emergencia por clave)
    if (!esOwnerErza(ctx)) {
      const clave = String(ctx.text || "").trim()
      const claveOk = clave && ERZA_CLAVE_MENU && clave === ERZA_CLAVE_MENU
      if (!claveOk) {
        await ctx.reply("*Este menú es privado* 🔒")
        return
      }
      // emparejamiento: la clave coincide, se registran todos los numeros/lids de este chat
      const actuales = leerOwners()
      for (const c of clavesOwnerDeCtx(ctx)) actuales.add(c)
      try {
        guardarOwners(actuales)
      } catch {}
    }
    const pedido = String(ctx.text || "").trim()
    const pedidoFlow = /^(flow|pantalla|fullscreen|full\\s?screen|test)$/i.test(pedido)
    const pedidoFlowCat = /^(flow|pantalla|fullscreen|full\\s?screen|test)\s+(.+)$/i.exec(pedido)
    const filtro = pedidoFlowCat ? catDe(pedidoFlowCat[2]) : catDe(ctx.text)
    try {
      if (pedidoFlow || (filtro && pedidoFlowCat)) {
        // MODO EXPERIMENTAL: flow full-screen con galaxy_message
        await mandarFlowGalaxy(ctx, pedidoFlowCat ? filtro : null)
      } else if (filtro) {
        await mandarFlow(ctx, textoCategoria(filtro), botonesCategoria())
      } else {
        // Mensaje de invitación antes del Flow
        const banner = bannerResuelto()
        if (banner) {
          await ctx.sock.sendMessage(
            ctx.from,
            { image: { url: banner }, caption: `${PIEZO} *ErzaBot* ${ROJO}\n\nClick aquí para abrir el menú secreto 👇` },
            { quoted: ctx.msg }
          ).catch(() => {})
        } else {
          await ctx.reply(`${PIEZO} *ErzaBot* ${ROJO}\n\nClick aquí para abrir el menú secreto 👇`)
        }
        await mandarFlow(ctx, textoMenu(), botonesMain())
      }
    } catch (e) {
      // Sin soporte de Flow en ese chat: menú en texto
      try {
        await ctx.reply(filtro ? `${textoCategoria(filtro)}\n\n${ROJO} (sin botones: ${String(e?.message || e).slice(0, 60)})` : `${textoMenu()}\n\n${ROJO} (sin botones: ${String(e?.message || e).slice(0, 60)})`)
      } catch {}
    }
  }
}
