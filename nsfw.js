import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const ARCHIVO = path.join(AQUI, "nsfw.json")

let cache = null

// Lee nsfw.json una sola vez (todo el contenido +18 vive en el json, no en el codigo)
export function nsfwDB() {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(ARCHIVO, "utf-8"))
  } catch (e) {
    console.error("[NSFW] no se pudo leer nsfw.json:", e?.message || e)
    cache = { comandos: {} }
  }
  if (!cache || typeof cache !== "object") cache = { comandos: {} }
  if (!cache.comandos || typeof cache.comandos !== "object") cache.comandos = {}
  return cache
}

export function comandosNsfw() {
  return Object.keys(nsfwDB().comandos)
}

export function esComandoNsfw(comando) {
  return comandosNsfw().includes(String(comando || "").toLowerCase())
}

function tipoDeUrl(url) {
  const limpio = String(url || "").split("?")[0].toLowerCase()
  if (limpio.endsWith(".gif") || limpio.endsWith(".gifv")) return "gif"
  if (limpio.endsWith(".mp4") || limpio.endsWith(".webm") || limpio.endsWith(".mov")) return "video"
  return "foto"
}

// Junta gifs + mp4 + fotos del comando y devuelve uno al azar (10-20 distintos por comando)
export function mediaNsfw(comando) {
  const entrada = nsfwDB().comandos[String(comando || "").toLowerCase()]
  if (!entrada || typeof entrada !== "object") return null
  const fotos = Array.isArray(entrada.fotos) ? entrada.fotos : []
  const gifs = Array.isArray(entrada.gifs) ? entrada.gifs : []
  const mp4 = Array.isArray(entrada.mp4) ? entrada.mp4 : []
  const todos = [
    ...gifs.map((url) => ({ url, tipo: "gif" })),
    ...mp4.map((url) => ({ url, tipo: "video" })),
    ...fotos.map((url) => ({ url, tipo: "foto" }))
  ].filter((item) => typeof item.url === "string" && /^https?:\/\//i.test(item.url))
  if (!todos.length) return null
  const elegido = todos[Math.floor(Math.random() * todos.length)]
  return { ...elegido, total: todos.length }
}

// Manda el archivo +18 con caption y, si falla la descarga, cae al link en texto
export async function enviarNsfw({ sock, from, msg, reply, comando, caption, mentions = [] }) {
  const media = mediaNsfw(comando)
  if (!media) {
    await reply(`⚠️ *${comando}* todavía no tiene archivos en nsfw.json`)
    return false
  }
  const texto = String(caption || "🔥 EʀᴢᴀBᴏᴛ-MD/OFC +18")
  const extra = mentions.length ? { mentions } : {}
  const contenido =
    media.tipo === "video"
      ? { video: { url: media.url }, caption: texto, ...extra }
      : media.tipo === "gif"
        ? { video: { url: media.url }, gifPlayback: true, caption: texto, ...extra }
        : { image: { url: media.url }, caption: texto, ...extra }
  try {
    await sock.sendMessage(from, contenido, { quoted: msg })
    return true
  } catch (e) {
    console.error(`[NSFW] error enviando ${comando}:`, e?.message || e)
    try {
      await reply(`${texto}\n\n${media.url}`, mentions.length ? mentions : undefined)
    } catch {}
    return false
  }
}
