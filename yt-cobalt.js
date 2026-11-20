import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { Readable } from "stream"
import { pipeline } from "stream/promises"

const root = path.dirname(fileURLToPath(import.meta.url))

export const API_BASE_URL = "https://zeta-core-api.vercel.app"

const INTENTOS = 3
const ESPERA_MS = 2000

function log(mensaje) {
  console.log(`[YT-COBALT] ${mensaje}`)
}

export function videoIdDe(input) {
  const texto = String(input || "").trim()
  const m = texto.match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/)
  if (m) return m[1]
  if (/^[A-Za-z0-9_-]{11}$/.test(texto)) return texto
  return null
}

export function esErrorEdad(msg) {
  return /AGE_RESTRICTED|AGE_CHECK|restricci[oó]n de edad|restriccion de edad/i.test(String(msg || ""))
}

function mensajeDeErrorApi(data, status) {
  const code = typeof data?.code === "string" ? data.code : typeof data?.error?.code === "string" ? data.error.code : ""
  const texto =
    data?.message ||
    (typeof data?.error === "string" ? data.error : null) ||
    data?.error?.message ||
    code ||
    `HTTP ${status}`
  if (esErrorEdad(code) || esErrorEdad(texto)) return "AGE_RESTRICTED"
  return texto
}

function errorDesdeData(data, status) {
  const e = new Error(mensajeDeErrorApi(data, status))
  e.esDeLaApi = true
  if (data?.reintentar === false) e.reintentar = false
  return e
}

function zetaCoreDlKey() {
  try {
    const file = path.join(root, "zeta-core.txt")
    if (!fs.existsSync(file)) return null
    const lines = fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    const pareceBypass = /^[a-zA-Z0-9]{25,}$/.test(lines[1] || "")
    return lines[2] || (!pareceBypass && lines[1] ? lines[1] : null)
  } catch {
    return null
  }
}

export function urlConClave(downloadUrl) {
  const dlKey = zetaCoreDlKey()
  if (!dlKey) return downloadUrl
  try {
    const u = new URL(downloadUrl)
    if (u.searchParams.has("key") && !u.searchParams.get("key")) {
      u.searchParams.set("key", dlKey)
      return u.toString()
    }
  } catch {}
  return downloadUrl
}

export async function pedirDescarga(kind, input) {
  const id = videoIdDe(input)
  const texto = String(input || "").trim()
  const esLink = id && /youtu\.?be|youtube\.com/i.test(texto)
  const valorBuscado = esLink || id ? `https://www.youtube.com/watch?v=${id}` : texto
  const ruta = kind === "audio" ? "/ytmp3" : "/ytmp4"

  let ultimoError = null
  for (const modo of ["post", "get"]) {
    try {
      let data = null
      if (modo === "post") {
        const response = await fetch(`${API_BASE_URL}${ruta}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "zenith-bot/1.0" },
          body: JSON.stringify(esLink || id ? { url: valorBuscado } : { query: texto }),
          signal: AbortSignal.timeout(90000)
        })
        data = await response.json().catch(() => null)
        if (!response.ok) {
          if (response.status === 404 || response.status === 405) {
            const pareceErrorDeApi = data && (data.ok === false || data.code || data.message || data.error)
            if (pareceErrorDeApi) throw errorDesdeData(data, response.status)
            throw new Error("ruta POST no disponible")
          }
          throw errorDesdeData(data, response.status)
        }
      } else {
        const params = new URLSearchParams({ query: valorBuscado })
        const dlKey = zetaCoreDlKey()
        if (dlKey) params.set("key", dlKey)
        const response = await fetch(`${API_BASE_URL}${ruta}?${params.toString()}`, {
          headers: { Accept: "application/json", "User-Agent": "zenith-bot/1.0" },
          signal: AbortSignal.timeout(90000)
        })
        data = await response.json().catch(() => null)
        if (!response.ok) throw errorDesdeData(data, response.status)
      }
      const downloadUrl = urlConClave(String(data?.downloadUrl || data?.descarga_directa || ""))
      const title = String(data?.title || data?.titulo || "")
      if (!/^https?:\/\//.test(downloadUrl)) throw new Error("la API no devolvio downloadUrl valido")
      return { downloadUrl, title, videoId: id }
    } catch (e) {
      if (e?.message === "AGE_RESTRICTED" || e?.reintentar === false) throw e
      if (modo === "get") throw e
      ultimoError = e
    }
  }
  throw ultimoError || new Error("la API no devolvio downloadUrl valido")
}

function mimetypeDesdeTipo(contentType, extension, kind) {
  if (/mpeg|mp3/i.test(contentType) || extension === ".mp3") return "audio/mpeg"
  if (/audio\/mp4|mp4a|aac/i.test(contentType) || extension === ".m4a") return "audio/mp4"
  if (/webm/i.test(contentType) || extension === ".webm") return kind === "audio" ? "audio/webm" : "video/webm"
  if (/ogg|opus/i.test(contentType) || extension === ".opus") return "audio/ogg"
  if (/video\/mp4/i.test(contentType) || extension === ".mp4") return "video/mp4"
  if (/video\/quicktime/i.test(contentType) || extension === ".mov") return "video/quicktime"
  if (/matroska/i.test(contentType) || extension === ".mkv") return "video/x-matroska"
  return kind === "audio" ? "audio/mpeg" : "video/mp4"
}

export function mimetypeDe(contentType, file, kind) {
  const extension = String(path.extname(file || "") || "").toLowerCase()
  return mimetypeDesdeTipo(String(contentType || ""), extension, kind)
}

async function bajarArchivo(downloadUrl, destino, kind) {
  const response = await fetch(downloadUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "*/*"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(900000)
  })
  if (!response.ok) {
    let data = null
    try {
      data = await response.json()
    } catch {}
    throw new Error(mensajeDeErrorApi(data, response.status))
  }
  const contentType = response.headers.get("content-type") || ""
  if (/json/i.test(contentType)) {
    let data = null
    try {
      data = await response.json()
    } catch {}
    throw new Error(mensajeDeErrorApi(data, response.status))
  }
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destino))
  if (fs.existsSync(destino) && fs.statSync(destino).size > 10240) {
    return { file: destino, contentType }
  }
  try {
    fs.unlinkSync(destino)
  } catch {}
  throw new Error("archivo vacio de la API")
}

export async function descargarYtCobalt(kind, input, prefix) {
  const destino = path.join(root, `${prefix}.part`)
  let ultimoError = null
  for (let intento = 1; intento <= INTENTOS; intento++) {
    try {
      const { downloadUrl, title, videoId } = await pedirDescarga(kind, input)
      log(`descarga ${intento}/${INTENTOS} (${kind})`)
      const { file, contentType } = await bajarArchivo(downloadUrl, destino, kind)
      return { file, title, videoId, mimeType: mimetypeDe(contentType, file, kind) }
    } catch (e) {
      ultimoError = e
      if (String(e?.message || e) === "AGE_RESTRICTED" || e?.reintentar === false) throw e
      if (intento < INTENTOS) await new Promise((r) => setTimeout(r, ESPERA_MS))
    }
  }
  throw ultimoError || new Error("ERROR_DESCARGA")
}
