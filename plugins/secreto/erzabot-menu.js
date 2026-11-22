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

const DIR = path.dirname(fileURLToPath(import.meta.url))
const BANNER_LOCAL = path.join(DIR, "erza-banner.jpg")
// Pegá acá el link de tu foto de Erza 16:9 (si lo dejas vacío usa la imagen local de arriba)
const BANNER_URL = "" // ej: "https://i.ibb.co/xxxx/erza.jpg"
// Botón de URL opcional dentro del Flow (dejá vacío para no mostrarlo)
const URL_EXTRA = ""

const PIEZO = "⚔️"
const CORAZON = "❤️‍🔥"
const ROJO = "🔴"

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
    }))
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
            footer: proto.Message.InteractiveMessage.Footer.create({ text: `${CORAZON} erza-menu privado ${ROJO} #E53935` }),
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

export default {
  comandos: ["erzabot"],
  ayuda: "erzabot - menú secreto de pruebas (solo owner)",
  secreto: true,
  ejecutar: async (ctx) => {
    // SEGURIDAD: solo el owner
    if (!ctx.isOwner) {
      await ctx.reply("*Este menú es privado* 🔒")
      return
    }
    const filtro = catDe(ctx.text)
    try {
      if (filtro) {
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
