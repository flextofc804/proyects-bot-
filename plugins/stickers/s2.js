// ============================================================
// ErzaBot - .s2 : STICKER CON SONIDO (sound sticker de WhatsApp)
// Uso: responde a un video con .s2 -> sticker animado CON el
// audio de ese video escuchable al tocarlo (funcion liberada por
// WhatsApp el 24/11/2026).
//
// Protocolo real (WAProto nuevo):
//   Message.audioStickerMessage = campo 134 (FutureProofMessage)
//     -> message -> Message.stickerMessage (campo 26)
//       -> StickerMessage con oneof audio { AudioMessage = 26 } (el sonido)
//
// Baileys 6.7 es anterior a la funcion (no trae esos campos), asi que el
// plugin inyecta los campos nuevos parcheando los encoders protobuf en
// runtime - SIN agregar ni cambiar ninguna dependencia.
// .s sigue como siempre (case "s" en index.js); este es el nuevo con sonido
// ============================================================
import fs from "fs"
import path from "path"
import { execFile } from "child_process"
import crypto from "crypto"
import ffmpegBin from "ffmpeg-static"

const MAX_VIDEO_SEG = 8        // segundos del lado visual (sticker animado clasico)
const MAX_AUDIO_SEG = 10       // limite de audio de los sound stickers (10s oficial)
const MAX_WEBP_BYTES = 500 * 1024

// logger no-op compartido (Baileys llama logger.debug/info/warn sin verificar)
const noop = () => {}
const LOGGER_SILENT = { level: "silent", trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop, child() { return this } }

function tempFileS2(ext) {
  return path.join(process.cwd(), `tmp_s2_${Date.now()}_${Math.floor(Math.random() * 1000000)}.${ext}`)
}

function borrarS2(f) {
  try {
    if (fs.existsSync(f)) fs.unlinkSync(f)
  } catch {}
}

function ffmpegExe() {
  try {
    if (ffmpegBin && fs.existsSync(ffmpegBin)) return ffmpegBin
  } catch {}
  return "ffmpeg"
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegExe(),
      ["-y", "-loglevel", "error", ...args],
      { windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (!err) return resolve()
        // el error tiene que decir POR QUE fallo (sino en el host no se puede
        // diagnosticar: "Command failed" asecas). Incluimos la cola del stderr
        const cola = String(stderr || "").slice(-160).replace(/\s+/g, " ").trim()
        const motivo = err.killed ? "llego al timeout de 120s" : err.code !== undefined ? `salio con codigo ${err.code}` : "no se pudo ejecutar"
        reject(new Error(`ffmpeg ${motivo}${cola ? `: ${cola}` : ""}`))
      }
    )
  })
}

// ============================================================
// ffmpeg: video -> webp animado (visual) + ogg opus (audio a 10s max)
// ============================================================
// mismo filtro que usa .s (index.js); algunos builds de ffmpeg estaticos no
// reconocen "transparent" como color, por eso hay una variante hex-alfa
const BASE_WEBP = "scale=512:512:force_original_aspect_ratio=decrease"
const variantesWebp = (fps) => [
  `scale=512:512:force_original_aspect_ratio=decrease,fps=${fps},pad=512:512:(ow-iw)/2:(oh-ih)/2:color=transparent`,
  `scale=512:512:force_original_aspect_ratio=decrease,fps=${fps},pad=512:512:(ow-iw)/2:(oh-ih)/2:0x00000000,format=rgba`,
  `${BASE_WEBP},fps=${fps},pad=512:512:(ow-iw)/2:(oh-ih)/2:0x00000000,format=rgba`,
  // ultimo recurso: 256x256 a 10fps mas liviano (host con CPU debil)
  "scale=256:256:force_original_aspect_ratio=decrease,fps=10,pad=256:256:(ow-iw)/2:(oh-ih)/2:0x00000000,format=rgba"
]

async function crearWebp(inF, webpF, fps, calidad) {
  let ultimoError = null
  for (const filtro of variantesWebp(fps)) {
    try {
      await runFfmpeg([
        "-i", inF,
        "-t", String(MAX_VIDEO_SEG),
        "-vf", filtro,
        "-loop", "0",
        "-an",
        "-c:v", "libwebp",
        "-quality", String(calidad),
        "-compression_level", "4",
        webpF
      ])
      const webp = fs.readFileSync(webpF)
      if (webp.length) return webp
    } catch (e) {
      ultimoError = e
    }
  }
  throw ultimoError || new Error("ffmpeg no pudo crear el webp")
}

async function videoAStickerSonido(bufferVideo) {
  const inF = tempFileS2("s2in")
  const webpF = tempFileS2("s2.webp")
  const oggF = tempFileS2("s2.ogg")
  fs.writeFileSync(inF, bufferVideo)
  try {
    // 1) lado visual: WebP animado 512x512, 15fps, loop infinito, sin audio propio
    let webp = await crearWebp(inF, webpF, 15, 85)
    // si queda muy pesado (limite oficial ~500KB), segunda pasada mas comprimida
    if (webp.length > MAX_WEBP_BYTES) {
      webp = await crearWebp(inF, webpF, 10, 50)
    }
    // 2) lado sonoro: OGG Opus (mono 48k), primeros 10 segundos como WhatsApp.
    //    Si el video no tiene pista de audio, sigue sin sonido (sticker mudo)
    let ogg = Buffer.alloc(0)
    try {
      await runFfmpeg([
        "-i", inF,
        "-t", String(MAX_AUDIO_SEG),
        "-vn",
        "-ac", "1",
        "-ar", "48000",
        "-c:a", "libopus",
        "-b:a", "48k",
        oggF
      ])
      if (fs.existsSync(oggF)) ogg = fs.readFileSync(oggF)
    } catch {}
    return { webp, ogg }
  } finally {
    borrarS2(inF)
    borrarS2(webpF)
    borrarS2(oggF)
  }
}

// ============================================================
// Parche del protocolo: agrega los campos nuevos del sound sticker a
// los encoders protobuf de Baileys 6.7 en runtime (idempotente)
// ============================================================
let patchS2Listo = false

function concatU8(a, b) {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

function varint(n) {
  const out = []
  let v = n
  while (true) {
    let byte = v % 128
    v = Math.floor(v / 128)
    if (v) byte += 128
    out.push(byte)
    if (!v) break
  }
  return Uint8Array.from(out)
}

// campo len-delimited de protobuf: (numero<<3)|2 + largo + payload
function campoProto(numero, payload) {
  return concatU8(concatU8(varint((numero << 3) | 2), varint(payload.length)), payload)
}

// enmarca una cola del parche: { tag (ya con wire bits), bytes = payload crudo }
// -> varint(tag) + varint(largo) + payload (probibido doble-marquear: el patch
// escribe el marco en la ruta con writer Y en la sin writer)
function campoProtoTag(c) {
  return concatU8(concatU8(varint(c.tag), varint(c.bytes.length)), c.bytes)
}

async function listoProtoS2() {
  if (patchS2Listo) return true
  const baileys = await import("@whiskeysockets/baileys")
  const proto = baileys.proto
  const stickerCtor = proto?.Message?.StickerMessage
  if (!proto?.Message?.encode || !stickerCtor?.encode) return false
  // Baileys llama SIEMPRE encode(m).finish() con un solo argumento, asi que
  // el parche devuelve bytes finales con los campos nuevos APENDADOS al final
  // (protobuf valido: los campos pueden aparecer en cualquier orden)
  const patcheaEncoder = (ctor, claveCola) => {
    if (ctor.encode.__erzaS2) return
    const original = ctor.encode
    // Internamente protobufjs llama encode(obj, writer) cuando anida (fork/ldelim):
    // hay que respetar el writer externo o el contenido anidado se pierde/vacia
    // IMPORTANTE: las colas llevan SOLO el payload crudo (sin tag ni largo);
    // el marco (tag + largo + payload) lo escribe el parche en AMBAS rutas.
    // Si la cola viniera ya enmarcada (campoProto) la ruta con writer la
    // envolveria DOS veces -> protobuf invalido -> el server dropea el mensaje.
    ctor.encode = function patched(m, writer) {
      const colas = m && m[claveCola]
      const lista = Array.isArray(colas) ? colas : colas && colas.bytes ? [colas] : null
      if (!lista) return original(m, writer)
      if (writer) {
        const w = original(m, writer)
        for (const c of lista) {
          w.uint32(c.tag)
          w.bytes(c.bytes)
        }
        return w
      }
      let full = Uint8Array.from(original(m).finish())
      for (const c of lista) full = concatU8(full, campoProtoTag(c))
      return { finish: () => full }
    }
    ctor.encode.__erzaS2 = true
  }
  patcheaEncoder(stickerCtor, "__erzaAudio")
  patcheaEncoder(proto.Message, "__erzaAudioStickerTail")
  patchS2Listo = true
  return true
}

// ============================================================
// Arma y manda el sticker con sonido por relayMessage
// ============================================================
async function mandarS2(ctx, webp, ogg, msgOrigen) {
  await listoProtoS2()
  const { prepareWAMessageMedia, proto } = await import("@whiskeysockets/baileys")
  const loggerSilent = LOGGER_SILENT
  const upload = ctx.sock.waUploadToServer

  // subo las dos medias al server de WhatsApp (webp y ogg por separado)
  const prepSticker = await prepareWAMessageMedia({ sticker: webp }, { upload, logger: loggerSilent })
  const prepAudio = await prepareWAMessageMedia({ audio: ogg }, { upload, logger: loggerSilent })
  const stickerMsg = prepSticker.stickerMessage
  const audioMsg = prepAudio.audioMessage
  stickerMsg.mimetype = "image/webp"
  stickerMsg.isAnimated = true
  audioMsg.mimetype = "audio/ogg; codecs=opus"
  audioMsg.ptt = false

  // citar el video de origen (si existe): se agrega como campo 17 APENDADO a los
  // bytes finales del sticker (protobuf permite campos en cualquier orden), para
  // no meter el contextInfo dentro del objeto antes de codificar
  const colasSticker = []
  try {
    const keyOrigen = msgOrigen?.key || ctx.msg?.key
    if (keyOrigen?.id) {
      const contenidoCitado = msgOrigen?.videoMessage
        ? { videoMessage: msgOrigen.videoMessage }
        : msgOrigen?.documentMessage
          ? { documentMessage: msgOrigen.documentMessage }
          : null
      const ciObj = {
        stanzaId: keyOrigen.id,
        participant: keyOrigen.participant || ctx.sender || undefined,
        ...(contenidoCitado ? { quotedMessage: contenidoCitado } : {})
      }
      if (proto.ContextInfo?.encode) {
        const ciBytes = proto.ContextInfo.encode(ciObj).finish()
        // payload CRUDO: el marco (tag + largo) lo escribe el patcheaEncoder
        colasSticker.push({ tag: (17 << 3) | 2, bytes: Uint8Array.from(ciBytes) })
      }
    }
  } catch {}

  // bytes del audio (campo 26 del StickerMessage - el sonido nuevo)
  const audioBytes = proto.Message.AudioMessage.encode(audioMsg).finish()
  // payload CRUDO del audio: el marco lo agrega el patcheaEncoder en ambas rutas
  colasSticker.push({ tag: (26 << 3) | 2, bytes: Uint8Array.from(audioBytes) })
  stickerMsg.__erzaAudio = colasSticker

  // bytes del sticker completo
  const stickerBytes = proto.Message.StickerMessage.encode(stickerMsg).finish()

  // audioStickerMessage (134) -> FutureProofMessage{message(1) -> Message{stickerMessage(26)}}
  const innerBytes = campoProto(26, Uint8Array.from(stickerBytes))
  const fpmBytes = campoProto(1, innerBytes)
  // payload CRUDO del wrapper 134: el patcheaEncoder de proto.Message escribe
  // el marco (tag 134 + largo) tanto en la ruta con writer como sin writer
  const outer = proto.Message.create({})
  // CRITICO: el server de WhatsApp DROPEA silenciosamente el stanza de media
  // cuando el nodo enc no lleva el atributo mediatype (viene vacio = mensajes
  // que nunca llegan y sin ningun error). Baileys saca el mediatype mirando
  // SOLO las keys del nivel superior del Message (getMediaType en
  // messages-send.js): con solo audioStickerMessage nunca emite "sticker".
  // Al poner el sticker tambien como field 26 top-level, getMediaType()
  // ve stickerMessage -> enc lleva mediatype=sticker -> el mensaje SI viaja.
  // Ademas es el comportamiento documentado de WhatsApp: los clientes sin la
  // actualizacion ven el sticker mudo (field 26), y los clientes nuevos
  // desempaquetan el field 134 (audioStickerMessage) y leen el sonido.
  // El orden de campos en protobuf es libre: la cola 134 se apenda al final.
  outer.stickerMessage = stickerMsg
  outer.__erzaAudioStickerTail = { tag: (134 << 3) | 2, bytes: fpmBytes }

  const msgId = "3EB0" + crypto.randomBytes(10).toString("hex").toUpperCase()
  await ctx.sock.relayMessage(ctx.from, outer, { messageId: msgId })
  return msgId
}

// ============================================================
// Fuente del video: respuesta a un video/documento de video, video
// directo (renombrado a txt), o link: .s2 <link>
// ============================================================
function videoDeCtx(ctx) {
  const m = ctx.msg?.message || {}
  const q =
    m.extendedTextMessage?.contextInfo?.quotedMessage ||
    m.imageMessage?.contextInfo?.quotedMessage ||
    m.videoMessage?.contextInfo?.quotedMessage ||
    m.documentMessage?.contextInfo?.quotedMessage ||
    null
  const d = q || m
  // si viene citado, reconstruimos la key del mensaje citado desde el contextInfo
  const ci = q
    ? m.extendedTextMessage?.contextInfo ||
      m.imageMessage?.contextInfo ||
      m.videoMessage?.contextInfo ||
      m.documentMessage?.contextInfo
    : null
  const keyOrigen = ci?.stanzaId
    ? { id: ci.stanzaId, participant: ci.participant, remoteJid: ci.remoteJid || ctx.from }
    : ctx.msg?.key
  if (d.videoMessage) return { tipo: "video", media: d.videoMessage, key: keyOrigen }
  if (d.documentMessage) {
    // videos mandados como documento: "video/..." directo, con extension de video,
    // o renombrados a .txt (truco tipico para saltarse la restriccion de WhatsApp)
    const dm = d.documentMessage
    const mimeOk = String(dm.mimetype || "").startsWith("video/")
    const nombre = String(dm.fileName || "").toLowerCase()
    const nombreOk = /\.(mp4|mkv|webm|avi|mov|m4v|3gp|txt)$/.test(nombre)
    if (mimeOk || nombreOk) return { tipo: "document", media: dm, key: keyOrigen }
  }
  return null
}

const ES_URL = /^https?:\/\/\S+$/i

export default {
  comandos: ["s2"],
  ayuda: "s2 - sticker CON SONIDO (responde a un video; el audio se escucha al tocar el sticker)",
  secreto: false,
  ejecutar: async (ctx) => {
    try {
      const fuente = videoDeCtx(ctx)
      let bufferVideo = null
      let msgOrigen = null
      if (fuente) {
        const { downloadMediaMessage } = await import("@whiskeysockets/baileys")
        // downloadMediaMessage valida por el nombre real del campo del mensaje
        const keyMedia = fuente.tipo === "document" ? "documentMessage" : "videoMessage"
        bufferVideo = await downloadMediaMessage(
          { message: { [keyMedia]: fuente.media } },
          "buffer",
          {},
          { logger: LOGGER_SILENT, reuploadRequest: ctx.sock?.updateMediaMessage }
        )
        msgOrigen = {
          videoMessage: fuente.tipo === "video" ? fuente.media : undefined,
          documentMessage: fuente.tipo === "document" ? fuente.media : undefined,
          key: fuente.key
        }
      } else if (ctx.text && ES_URL.test(ctx.text.trim())) {
        const axios = (await import("axios")).default
        const resp = await axios.get(ctx.text.trim(), {
          responseType: "arraybuffer",
          timeout: 60000,
          maxContentLength: 100 * 1024 * 1024
        })
        bufferVideo = Buffer.from(resp.data)
      }
      if (!bufferVideo) {
        await ctx.reply("Responde a un *video* con *.s2* para crear un sticker con sonido 🔊\n(también podés mandar un link con .s2 <link>)")
        return
      }
      try { await ctx.reaccionar?.("🔊") } catch {}
      const { webp, ogg } = await videoAStickerSonido(bufferVideo)
      if (!webp?.length) {
        await ctx.reply("No pude convertir el video a sticker 😿 (probá con un video más corto)")
        return
      }
      if (!ogg?.length) {
        // sin pista de sonido en el video: sticker animado clásico (como .s) + aviso
        await ctx.sock.sendMessage(ctx.from, { sticker: webp }, { quoted: ctx.msg })
        await ctx.reply("⚠️ El video no tenía pista de sonido: salió sticker animado normal (sin 🔊)")
        return
      }
      try {
        await mandarS2(ctx, webp, ogg, msgOrigen)
      } catch (e) {
        // fallback seguro: sticker animado normal (como .s) si la parte con sonido falla
        await ctx.reply(`⚠️ El sticker con sonido falló (${String(e?.message || e).slice(0, 130)}), mando el sticker normal...`)
        await ctx.sock.sendMessage(ctx.from, { sticker: webp }, { quoted: ctx.msg })
      }
    } catch (e) {
      try {
        await ctx.reply(`Error creando el sticker con sonido: ${String(e?.message || e).slice(0, 160)}`)
      } catch {}
    }
  }
}
