import fs from "fs"
import os from "os"
import path from "path"
import https from "https"
import { exec, spawn } from "child_process"
import { promisify } from "util"
import { fileURLToPath } from "url"
import { Readable } from "stream"
import { pipeline } from "stream/promises"

const execAsync = promisify(exec)
const root = path.dirname(fileURLToPath(import.meta.url))
const binDir = path.join(root, "bin")
const realBinaryName = process.platform === "win32" ? "yt-dlp-bin.exe" : "yt-dlp-bin"
const realBinaryPath = path.join(binDir, realBinaryName)

const YT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"


let ytBlockUntil = 0

function customApiInfo() {
  try {
    const file = path.join(root, "api-propia.txt")
    if (!fs.existsSync(file)) return null
    const lines = fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    if (!lines[0] || !/^https?:\/\//.test(lines[0])) return null
    return { base: lines[0].replace(/\/+$/, ""), key: lines[1] || null }
  } catch {
    return null
  }
}

function log(message) {
  console.log(`[YT] ${message}`)
}

function removeFile(file) {
  try {
    if (file && fs.existsSync(file)) fs.unlinkSync(file)
  } catch (e) {}
}

async function commandExists(binary) {
  try {
    await execAsync(`command -v ${binary}`, { timeout: 15000 })
    return true
  } catch (e) {
    return false
  }
}

function addToPath(directory) {
  if (!directory) return
  const current = process.env.PATH || ""
  const parts = current.split(path.delimiter).filter(Boolean)
  if (!parts.includes(directory)) {
    process.env.PATH = [directory, ...parts].join(path.delimiter)
  }
}

function pickAsset() {
  if (process.platform === "win32") return "yt-dlp.exe"
  if (process.platform === "darwin") return "yt-dlp_macos"
  if (process.arch === "arm64") return "yt-dlp_linux_aarch64"
  if (process.arch === "arm") return "yt-dlp_linux_armv7l"
  return "yt-dlp_linux"
}

function writeWrapper() {
  if (process.platform === "win32") return
  const wrapper = `#!/bin/sh
BIN="$(dirname "$0")/${realBinaryName}"
if [ ! -x "$BIN" ]; then echo "yt-dlp no disponible" >&2; exit 127; fi
"$BIN" "$@"
`
  const wrapperPath = path.join(binDir, "yt-dlp")
  fs.writeFileSync(wrapperPath, wrapper)
  try {
    fs.chmodSync(wrapperPath, 0o755)
  } catch (e) {}
}

function downloadFile(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) {
      reject(new Error("demasiadas redirecciones"))
      return
    }
    https
      .get(url, { headers: { "User-Agent": "zenith-bot/1.0" } }, (response) => {
        const status = response.statusCode || 0
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume()
          resolve(downloadFile(new URL(response.headers.location, url).toString(), destination, redirects + 1))
          return
        }
        if (status !== 200) {
          response.resume()
          reject(new Error(`HTTP ${status}`))
          return
        }
        const writer = fs.createWriteStream(destination)
        response.pipe(writer)
        writer.on("finish", () => resolve(destination))
        writer.on("error", reject)
        response.on("error", reject)
      })
      .on("error", reject)
  })
}

async function downloadYtDlp() {
  fs.mkdirSync(binDir, { recursive: true })
  const asset = pickAsset()
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`
  log(`descargando ${asset}...`)
  await downloadFile(url, realBinaryPath)
  try {
    fs.chmodSync(realBinaryPath, 0o755)
  } catch (e) {}
  await execAsync(`"${realBinaryPath}" --version`, { timeout: 60000 })
  log("yt-dlp descargado")
  return realBinaryPath
}

let ytDlpPromise
function ensureYtDlp() {
  if (ytDlpPromise) return ytDlpPromise
  ytDlpPromise = (async () => {
    try {
      fs.mkdirSync(binDir, { recursive: true })
      const rootBinaryName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
      const rootBinaryPath = path.join(root, rootBinaryName)
      const candidates = [realBinaryPath, rootBinaryPath]
      for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) continue
        try {
          await execAsync(`"${candidate}" --version`, { timeout: 60000 })
          if (candidate === realBinaryPath) {
            writeWrapper()
            addToPath(binDir)
          }
          log(`yt-dlp OK (${candidate})`)
          return candidate
        } catch (e) {
          if (candidate === realBinaryPath) removeFile(realBinaryPath)
        }
      }
      const systemHasIt = await commandExists("yt-dlp")
      if (!systemHasIt) {
        try {
          await downloadYtDlp()
          writeWrapper()
          addToPath(binDir)
          return realBinaryPath
        } catch (e) {
          log(`no se pudo descargar yt-dlp (${e?.message || e})`)
        }
      }
      if (systemHasIt) {
        log("yt-dlp del sistema OK")
        return "yt-dlp"
      }
      return null
    } catch (e) {
      log(`error preparando yt-dlp: ${e?.message || e}`)
      return null
    }
  })()
  return ytDlpPromise
}

let ffmpegPromise
function ensureFfmpeg() {
  if (ffmpegPromise) return ffmpegPromise
  ffmpegPromise = (async () => {
    try {
      const mod = await import("ffmpeg-static")
      const candidate = mod.default || mod
      if (candidate && fs.existsSync(candidate)) {
        await execAsync(`"${candidate}" -version`, { timeout: 30000 })
        addToPath(path.dirname(candidate))
        log("ffmpeg OK (ffmpeg-static)")
        return candidate
      }
    } catch (e) {}
    if (await commandExists("ffmpeg")) {
      log("ffmpeg del sistema OK")
      return "ffmpeg"
    }
    log("ffmpeg no disponible")
    return null
  })()
  return ffmpegPromise
}

function extractVideoId(value) {
  const text = String(value || "")
  const match =
    text.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/) ||
    text.match(/^([A-Za-z0-9_-]{11})$/)
  return match ? match[1] : null
}

function readCookiesHeader() {
  const txtPath = path.join(root, "cookies.txt")
  const jsonPath = path.join(root, "cookies.json")
  try {
    if (fs.existsSync(txtPath)) {
      const lines = fs.readFileSync(txtPath, "utf8").split("\n")
      const pairs = []
      for (const line of lines) {
        if (!line || line.startsWith("#")) continue
        const parts = line.split("\t")
        if (parts.length >= 7) pairs.push(`${parts[5]}=${parts[6]}`)
      }
      if (pairs.length > 0) return pairs.join("; ")
    }
    if (fs.existsSync(jsonPath)) {
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"))
      const list = Array.isArray(data) ? data : Array.isArray(data?.cookies) ? data.cookies : []
      const pairs = list.filter((item) => item && item.name && item.value).map((item) => `${item.name}=${item.value}`)
      return pairs.join("; ")
    }
  } catch (e) {}
  return ""
}

function cookiesHeader() {
  const cookies = readCookiesHeader()
  return cookies ? `${cookies}; CONSENT=YES+cb; SOCS=CAI` : "CONSENT=YES+cb; SOCS=CAI"
}

function browserHeaders(extra = {}) {
  return {
    "User-Agent": YT_UA,
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    Cookie: cookiesHeader(),
    ...extra
  }
}

function request(url, { method = "GET", headers = {}, body = null, redirects = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) {
      reject(new Error("demasiadas redirecciones"))
      return
    }
    const target = new URL(url)
    const payload = body == null ? null : typeof body === "string" ? body : JSON.stringify(body)
    const req = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method,
        headers: {
          ...headers,
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
        },
        timeout: 30000
      },
      (res) => {
        const status = res.statusCode || 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          resolve(
            request(new URL(res.headers.location, url).toString(), { method, headers, body, redirects: redirects + 1 })
          )
          return
        }
        const chunks = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () =>
          resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") })
        )
      }
    )
    req.on("timeout", () => req.destroy(new Error("timeout")))
    req.on("error", reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function extractJsonAfter(source, marker) {
  const markerIndex = source.indexOf(marker)
  if (markerIndex === -1) return null
  const start = source.indexOf("{", markerIndex)
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < source.length; i++) {
    const char = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === "{") depth++
    else if (char === "}") {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, i + 1))
        } catch (e) {
          return null
        }
      }
    }
  }
  return null
}

const PLAYER_CLIENTS = [
  {
    name: "WEB_EMBEDDED_PLAYER",
    version: "1.20250310.01.00",
    id: 56,
    ua: YT_UA,
    extra: { clientScreen: "EMBED" },
    thirdParty: { embedUrl: "https://www.youtube.com/" }
  },
  {
    name: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    version: "2.0",
    id: 85,
    ua: YT_UA,
    extra: { clientScreen: "EMBED" },
    thirdParty: { embedUrl: "https://www.youtube.com/" }
  },
  {
    name: "ANDROID",
    version: "20.10.38",
    id: 3,
    ua: "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
    extra: { androidSdkVersion: 34 }
  },
  {
    name: "IOS",
    version: "20.10.4",
    id: 5,
    ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)",
    extra: { deviceModel: "iPhone16,2" }
  },
  { name: "MWEB", version: "2.20250310.01.00", id: 2, ua: MOBILE_UA },
  {
    name: "ANDROID_VR",
    version: "1.60.19",
    id: 28,
    ua: "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; es_ES) gzip",
    extra: { androidSdkVersion: 32, deviceMake: "Oculus", deviceModel: "Quest 3" }
  }
]

function hasPlayableFormats(player) {
  const streaming = player?.streamingData
  if (!streaming) return false
  const formats = [...(streaming.formats || []), ...(streaming.adaptiveFormats || [])]
  return formats.some((format) => typeof format?.url === "string" && format.url.length > 0)
}

const DEFAULT_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
let cachedApiKey = null
let cachedVisitorData = null

async function getClientConfig() {
  if (cachedApiKey && cachedVisitorData) return { apiKey: cachedApiKey, visitorData: cachedVisitorData }
  const urls = ["https://www.youtube.com/?hl=es&gl=ES", "https://m.youtube.com/?hl=es&gl=ES"]
  for (const url of urls) {
    try {
      const response = await request(url, { headers: browserHeaders() })
      if (response.status !== 200) continue
      const keyMatch = response.body.match(/"INNERTUBE_API_KEY":"([^"]+)"/)
      const visitorMatch = response.body.match(/"visitorData":"([^"]+)"/)
      if (keyMatch) cachedApiKey = keyMatch[1]
      if (visitorMatch) cachedVisitorData = visitorMatch[1]
      if (cachedApiKey && cachedVisitorData) break
    } catch (e) {}
  }
  if (!cachedApiKey) cachedApiKey = DEFAULT_API_KEY
  return { apiKey: cachedApiKey, visitorData: cachedVisitorData }
}

async function getApiKey() {
  const { apiKey } = await getClientConfig()
  return apiKey
}

async function playerFromEmbedPage(videoId) {
  const urls = [
    `https://www.youtube.com/embed/${videoId}?hl=es&gl=ES`,
    `https://www.youtube-nocookie.com/embed/${videoId}?hl=es&gl=ES`
  ]
  for (const url of urls) {
    try {
      const response = await request(url, { headers: browserHeaders() })
      if (response.status !== 200) continue
      let player = extractJsonAfter(response.body, "ytInitialPlayerResponse")
      if (hasPlayableFormats(player)) return player
      const match = response.body.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s)
      if (match) {
        try {
          const parsed = JSON.parse(match[1])
          if (hasPlayableFormats(parsed)) return parsed
        } catch (e) {}
      }
      if (player) return player
    } catch (e) {}
  }
  return null
}

async function playerFromWatchPage(videoId) {
  const urls = [
    `https://www.youtube.com/watch?v=${videoId}&bpctr=9999999999&has_verified=1&hl=es&gl=ES`,
    `https://m.youtube.com/watch?v=${videoId}&hl=es&gl=ES`
  ]
  let apiKey = null
  for (const url of urls) {
    const response = await request(url, { headers: browserHeaders() })
    if (response.status !== 200) continue
    const player = extractJsonAfter(response.body, "ytInitialPlayerResponse")
    if (!apiKey) {
      const keyMatch = response.body.match(/"INNERTUBE_API_KEY":"([^"]+)"/)
      apiKey = keyMatch ? keyMatch[1] : null
    }
    if (hasPlayableFormats(player)) return { player, apiKey }
    if (player) return { player, apiKey }
  }
  return { player: null, apiKey }
}

async function playerFromInnerTube(videoId, apiKey, client, visitorData) {
  if (!apiKey) throw new Error("sin innertube key")
  const body = {
    context: {
      client: {
        clientName: client.name,
        clientVersion: client.version,
        hl: "es",
        gl: "ES",
        ...(visitorData ? { visitorData } : {}),
        ...(client.extra || {})
      },
      ...(client.thirdParty ? { thirdParty: client.thirdParty } : {})
    },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true
  }
  const response = await request(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": client.ua,
      "X-YouTube-Client-Name": String(client.id),
      "X-YouTube-Client-Version": client.version,
      Origin: "https://www.youtube.com",
      Referer: `https://www.youtube.com/watch?v=${videoId}`,
      ...(visitorData ? { "X-Goog-Visitor-Id": visitorData } : {}),
      Cookie: cookiesHeader()
    },
    body
  })
  if (response.status !== 200) throw new Error(`innertube HTTP ${response.status}`)
  const json = JSON.parse(response.body)
  return json
}

let activeClientUa = YT_UA

async function fetchPlayerData(videoId) {
  try {
    const embedPlayer = await playerFromEmbedPage(videoId)
    if (hasPlayableFormats(embedPlayer)) {
      activeClientUa = YT_UA
      log("formatos vía página de Embed")
      return embedPlayer
    }
  } catch (e) {}

  const { apiKey, visitorData } = await getClientConfig()
  const attempts = []
  
  for (const client of PLAYER_CLIENTS) {
    try {
      const json = await playerFromInnerTube(videoId, apiKey, client, visitorData)
      if (hasPlayableFormats(json)) {
        activeClientUa = client.ua || YT_UA
        log(`formatos vía cliente ${client.name}`)
        return json
      }
      const status = json?.playabilityStatus?.status || "sin datos"
      const reason = json?.playabilityStatus?.reason || ""
      attempts.push(`${client.name}: ${status}${reason ? ` (${reason.slice(0, 40)})` : ""}`)
    } catch (e) {
      attempts.push(`${client.name}: ${e?.message || e}`)
    }
  }

  const { player } = await playerFromWatchPage(videoId)
  if (hasPlayableFormats(player)) {
    activeClientUa = YT_UA
    log("formatos vía página de YouTube Watch")
    return player
  }
  attempts.push(player ? "página: formatos firmados" : "página: sin player")

  const cookies = readCookiesHeader() ? "" : " · subí cookies.txt para saltar el bloqueo por IP"
  throw new Error(`YouTube bloqueó la descarga (${attempts.slice(0, 4).join(" | ")})${cookies}`)
}

function pickFormats(player, kind) {
  const streaming = player?.streamingData || {}
  const all = [...(streaming.formats || []), ...(streaming.adaptiveFormats || [])]
  const playable = all.filter((format) => typeof format?.url === "string" && format.url.length > 0)

  if (kind === "audio") {
    const audio = playable.filter((format) => String(format.mimeType || "").startsWith("audio/"))
    return [
      ...audio.filter((format) => format.itag === 140),
      ...audio.filter((format) => String(format.mimeType || "").includes("mp4a") && format.itag !== 140),
      ...audio.filter((format) => !String(format.mimeType || "").includes("mp4a"))
    ]
  }

  const videos = playable.filter((format) => String(format.mimeType || "").startsWith("video/"))
  const progressive = videos.filter((format) => format.audioQuality)
  const lowest = videos
    .filter((format) => (format.height || 999) <= 480)
    .sort((a, b) => (a.height || 0) - (b.height || 0))
  return [
    ...videos.filter((format) => format.itag === 18),
    ...progressive.filter((format) => (format.height || 999) <= 480),
    ...lowest,
    ...progressive,
    ...videos
  ]
}

function extensionFor(format, kind) {
  const mime = String(format?.mimeType || "")
  if (kind === "audio") return mime.includes("webm") ? "webm" : "m4a"
  return mime.includes("webm") ? "webm" : "mp4"
}

function downloadStream(url, destination, userAgent = activeClientUa) {
  return new Promise((resolve, reject) => {
    const follow = (target, redirects = 0) => {
      if (redirects > 8) {
        reject(new Error("demasiadas redirecciones"))
        return
      }
      https
        .get(
          target,
          {
            headers: {
              "User-Agent": userAgent || YT_UA,
              Accept: "*/*",
              "Accept-Language": "es-ES,es;q=0.9",
              Referer: "https://www.youtube.com/",
              Cookie: cookiesHeader(),
              Range: "bytes=0-"
            }
          },
          (response) => {
            const status = response.statusCode || 0
            if (status >= 300 && status < 400 && response.headers.location) {
              response.resume()
              follow(new URL(response.headers.location, target).toString(), redirects + 1)
              return
            }
            if (status !== 200 && status !== 206) {
              response.resume()
              reject(new Error(`descarga HTTP ${status}`))
              return
            }
            const writer = fs.createWriteStream(destination)
            response.pipe(writer)
            writer.on("finish", () => {
              const size = fs.existsSync(destination) ? fs.statSync(destination).size : 0
              if (size < 20000) {
                removeFile(destination)
                reject(new Error(`archivo invalido (${size} bytes)`))
                return
              }
              const fd = fs.openSync(destination, "r")
              const headBuffer = Buffer.alloc(200)
              const readBytes = fs.readSync(fd, headBuffer, 0, 200, 0)
              fs.closeSync(fd)
              const head = headBuffer.slice(0, readBytes).toString("utf8")
              if (head.trim().startsWith("<")) {
                removeFile(destination)
                reject(new Error("la respuesta no es un archivo de media"))
                return
              }
              resolve(destination)
            })
            writer.on("error", reject)
            response.on("error", reject)
          }
        )
        .on("error", reject)
    }
    follow(url)
  })
}

async function extractAudioFromVideo(videoPath, outputPath) {
  const ffmpeg = await ensureFfmpeg()
  if (!ffmpeg) throw new Error("ffmpeg no disponible")
  const binary = ffmpeg === "ffmpeg" ? "ffmpeg" : `"${ffmpeg}"`
  await execAsync(`${binary} -y -i "${videoPath}" -vn -c:a copy "${outputPath}"`, {
    timeout: 180000,
    maxBuffer: 1024 * 1024 * 8
  })
  removeFile(videoPath)
  return outputPath
}

async function mergeWithAudio(videoPath, audioPath, outputPath) {
  const ffmpeg = await ensureFfmpeg()
  if (!ffmpeg) throw new Error("ffmpeg no disponible")
  const binary = ffmpeg === "ffmpeg" ? "ffmpeg" : `"${ffmpeg}"`
  await execAsync(
    `${binary} -y -i "${videoPath}" -i "${audioPath}" -c copy -movflags +faststart "${outputPath}"`,
    { timeout: 180000, maxBuffer: 1024 * 1024 * 8 }
  )
  removeFile(videoPath)
  removeFile(audioPath)
  return outputPath
}

async function scraperDownload(videoId, kind, prefix) {
  const player = await fetchPlayerData(videoId)
  const formats = pickFormats(player, kind)
  if (formats.length === 0) throw new Error("scraping sin formato utilizable")

  const errors = []
  for (const format of formats.slice(0, 5)) {
    const destination = path.join(root, `${prefix}.${extensionFor(format, kind)}`)
    try {
      if (kind === "audio") {
        await downloadStream(format.url, destination)
        return destination
      }

      const videoOnly = !format.audioQuality
      if (!videoOnly) {
        await downloadStream(format.url, destination)
        return destination
      }

      const audioFormat = pickFormats(player, "audio")[0]
      if (!audioFormat) {
        await downloadStream(format.url, destination)
        return destination
      }

      const videoTmp = path.join(root, `${prefix}_v.${extensionFor(format, "video")}`)
      const audioTmp = path.join(root, `${prefix}_a.${extensionFor(audioFormat, "audio")}`)
      await downloadStream(format.url, videoTmp)
      await downloadStream(audioFormat.url, audioTmp)
      const merged = path.join(root, `${prefix}.mp4`)
      try {
        await mergeWithAudio(videoTmp, audioTmp, merged)
        return merged
      } catch (e) {
        fs.renameSync(videoTmp, destination)
        removeFile(audioTmp)
        return destination
      }
    } catch (e) {
      errors.push(`itag ${format.itag}: ${e?.message || e}`)
      removeFile(destination)
      removeFile(path.join(root, `${prefix}_v.${extensionFor(format, "video")}`))
      removeFile(path.join(root, `${prefix}_a.${extensionFor(format, "audio")}`))
    }
  }

  if (kind === "audio") {
    for (const videoFormat of pickFormats(player, "video").slice(0, 3)) {
      const source = path.join(root, `${prefix}_src.${extensionFor(videoFormat, "video")}`)
      try {
        await downloadStream(videoFormat.url, source)
        const output = path.join(root, `${prefix}.m4a`)
        await extractAudioFromVideo(source, output)
        log("audio extraído del video con ffmpeg")
        return output
      } catch (e) {
        errors.push(`audio desde video ${videoFormat.itag}: ${e?.message || e}`)
        removeFile(source)
      }
    }
  }

  throw new Error(errors.slice(0, 3).join(" | ") || "scraping no pudo descargar")
}

function formatFor(kind) {
  return kind === "audio" ? '-f "ba[ext=m4a]/ba/b"' : '-f "18/b[height<=480][ext=mp4]/b"'
}

function cookiesFlag() {
  const cookiesPath = path.join(root, "cookies.txt")
  return fs.existsSync(cookiesPath) ? `--cookies "${cookiesPath}"` : ""
}

const POT_VERSION = "2.0.2"
const POT_PORT = 4416
const potSetupPromise = { current: null }

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pingPotServer() {
  try {
    const response = await fetch(`http://127.0.0.1:${POT_PORT}/ping`, { signal: AbortSignal.timeout(3000) })
    return response.ok
  } catch (e) {
    return false
  }
}

function ytDlpPluginsDir() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "yt-dlp", "plugins")
  }
  return path.join(os.homedir(), ".config", "yt-dlp", "plugins")
}

async function setupPotProvider() {
  if (potSetupPromise.current) return potSetupPromise.current
  potSetupPromise.current = (async () => {
    try {
      if (await pingPotServer()) {
        log("servidor PO Token ya está corriendo")
        return true
      }

      const buildMain = path.join(root, "pot_provider", "build", "main.js")
      if (!fs.existsSync(buildMain)) {
        log("pot_provider/build no encontrado; capa PO Token omitida")
        return false
      }

      const pluginsDir = ytDlpPluginsDir()
      fs.mkdirSync(pluginsDir, { recursive: true })
      const pluginZip = path.join(pluginsDir, "bgutil-ytdlp-pot-provider.zip")
      if (!fs.existsSync(pluginZip)) {
        log("descargando plugin PO Token para yt-dlp...")
        await downloadFile(
          `https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/${POT_VERSION}/bgutil-ytdlp-pot-provider.zip`,
          pluginZip
        )
      }

      const potDir = path.join(root, "pot_provider")
      if (!fs.existsSync(path.join(potDir, "node_modules", "express"))) {
        log("instalando dependencias del servidor PO Token (solo la primera vez)...")
        await execAsync("npm install --no-save --no-audit --no-fund", { cwd: potDir, timeout: 600000, maxBuffer: 1024 * 1024 * 8 })
      }

      const child = spawn(process.execPath, [buildMain, "--port", String(POT_PORT)], {
        cwd: potDir,
        detached: true,
        stdio: "ignore"
      })
      child.unref()
      for (let i = 0; i < 20; i++) {
        if (await pingPotServer()) {
          log("servidor PO Token listo en 127.0.0.1:" + POT_PORT)
          return true
        }
        await sleepMs(1500)
      }
      log("el servidor PO Token no respondió")
      return false
    } catch (e) {
      log(`capa PO Token no disponible: ${e?.message || e}`)
      return false
    }
  })()
  return potSetupPromise.current
}

let jsRuntimeFlagPromise = null

function jsRuntimeFlag(binary) {
  if (!jsRuntimeFlagPromise) {
    jsRuntimeFlagPromise = (async () => {
      const flag = `--js-runtimes "node:${process.execPath}"`
      try {
        await execAsync(`"${binary}" ${flag} --version`, { timeout: 30000 })
        return flag
      } catch {
        return ""
      }
    })()
  }
  return jsRuntimeFlagPromise
}

async function ytDlpAttempt(binary, kind, videoId, filePrefix, output, cookies, ffmpegFlag, client) {
  const parts = [`"${binary}"`, formatFor(kind)]
  const jsFlag = await jsRuntimeFlag(binary)
  if (jsFlag) parts.push(jsFlag)
  if (client) parts.push(`--extractor-args "youtube:player_client=${client}"`)
  if (cookies) parts.push(cookies)
  if (ffmpegFlag) parts.push(ffmpegFlag)
  parts.push("--no-playlist --no-progress --no-warnings --geo-bypass --no-mtime --retries 2 --fragment-retries 2 --socket-timeout 20 --concurrent-fragments 4")
  parts.push(`-o "${output}" "https://www.youtube.com/watch?v=${videoId}"`)
  await execAsync(parts.join(" "), { timeout: 300000, maxBuffer: 1024 * 1024 * 16 })
  const nameMatch = fs
    .readdirSync(root)
    .filter((name) => name.startsWith(`${filePrefix}.`))
    .sort((a, b) => fs.statSync(path.join(root, b)).mtimeMs - fs.statSync(path.join(root, a)).mtimeMs)
  if (nameMatch.length > 0) return path.join(root, nameMatch[0])
  return null
}

async function ytDlpDownload(videoId, kind, prefix) {
  const binary = await ensureYtDlp()
  if (!binary) throw new Error("yt-dlp no disponible")
  const output = path.join(root, `${prefix}.%(ext)s`)
  const cookies = cookiesFlag()
  const ffmpeg = await ensureFfmpeg()
  const ffmpegFlag = ffmpeg && ffmpeg !== "ffmpeg" ? `--ffmpeg-location "${ffmpeg}"` : ""
  const clients = ["android_vr", "ios", "tv"]
  for (const client of clients) {
    try {
      const found = await ytDlpAttempt(binary, kind, videoId, prefix, output, cookies, ffmpegFlag, client)
      if (found) return found
    } catch {
    }
  }

  const potReady = await setupPotProvider()
  if (potReady) {
    for (const client of ["web", "mweb"]) {
      try {
        const found = await ytDlpAttempt(binary, kind, videoId, prefix, output, cookies, ffmpegFlag, client)
        if (found) {
          log(`descarga OK con PO Token (cliente ${client})`)
          return found
        }
      } catch {
      }
    }
  }

  throw new Error("yt-dlp no pudo descargar (YouTube pidió verificación)")
}

function cleanPrefix(prefix) {
  for (const name of fs.readdirSync(root)) {
    if (name.startsWith(prefix)) removeFile(path.join(root, name))
  }
}

function extensionFromType(type, kind) {
  if (/mpeg/.test(type)) return ".mp3"
  if (/audio\/mp4/.test(type)) return ".m4a"
  if (/video\/mp4/.test(type)) return ".mp4"
  if (/webm/.test(type)) return ".webm"
  if (/ogg/.test(type)) return ".opus"
  return kind === "audio" ? ".m4a" : ".mp4"
}

async function downloadApiFile(url, destination, kind, extraHeaders = {}) {
  const response = await fetch(url, {
    headers: { "User-Agent": "zenith-bot/1.0", "bypass-tunnel-reminder": "true", ...extraHeaders },
    signal: AbortSignal.timeout(900000)
  })
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const data = await response.json()
      message = data.error || message
    } catch {}
    throw new Error(message)
  }
  if (/json/i.test(response.headers.get("content-type") || "")) {
    let message = "error de la API propia"
    try {
      const data = await response.json()
      message = data.error || message
    } catch {}
    throw new Error(message)
  }
  const disposition = response.headers.get("content-disposition") || ""
  const nameMatch = disposition.match(/filename="?([^";]+)"?/i)
  const extension =
    nameMatch && /\.[a-z0-9]{2,4}$/i.test(nameMatch[1])
      ? path.extname(nameMatch[1]).toLowerCase()
      : extensionFromType(response.headers.get("content-type") || "", kind)
  const finalPath = destination.replace(/\.part$/, extension)
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(finalPath))
  return finalPath
}

async function customApiDownloadUrl(targetUrl, kind, prefix) {
  const api = customApiInfo()
  if (!api) throw new Error("no configurada")
  const params = new URLSearchParams({
    url: targetUrl,
    mode: kind === "audio" ? "audio" : "video"
  })
  if (api.key) params.set("key", api.key)
  const output = path.join(root, `${prefix}.part`)
  const file = await downloadApiFile(`${api.base}/download?${params.toString()}`, output, kind)
  if (fs.existsSync(file) && fs.statSync(file).size > 10240) {
    log(`descarga OK vía tu API propia (${api.base})`)
    return file
  }
  removeFile(file)
  throw new Error("archivo vacío")
}

async function customApiDownload(videoId, kind, prefix) {
  return customApiDownloadUrl(`https://www.youtube.com/watch?v=${videoId}`, kind, prefix)
}

function esErrorReintentable(msg) {
  const texto = String(msg || "")
  return texto.includes("IP_BLOQUEADA") || /restriccion de edad|inicio de sesion|anti-bot/i.test(texto)
}

async function zetaCoreDlRetry(query, kind, prefix, quality) {
  let lastError = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await zetaCoreDl(query, kind, prefix, quality)
    } catch (e) {
      lastError = e
      const msg = String(e?.message || e)
      if (msg.includes("falta la clave")) throw e
      // IP_BLOQUEADA: la API ahora falla rapido (<10s) y pide reintentar
      // porque Vercel rota la IP de salida en cada pedido nuevo.
      if (esErrorReintentable(msg)) {
        if (attempt < 3) await sleepMs(attempt === 1 ? 2000 : 4000)
        continue
      }
      // Otros fallos (sin media, login requerido, etc.): un solo reintento corto.
      if (attempt === 1) {
        await sleepMs(1500)
        continue
      }
      throw e
    }
  }
  throw lastError
}

const ZETA_CORE_DEFAULT = "https://zeta-core-api.vercel.app"

function zetaCoreConfig() {
  try {
    const file = path.join(root, "zeta-core.txt")
    if (fs.existsSync(file)) {
      const lines = fs
        .readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
      const base = lines[0] && /^https?:\/\//.test(lines[0]) ? lines[0].replace(/\/+$/, "") : ZETA_CORE_DEFAULT
      const segunda = lines[1] || ""
      const tercera = lines[2] || ""
      const pareceBypass = /^[a-zA-Z0-9]{25,}$/.test(segunda)
      return {
        base,
        bypass: pareceBypass ? segunda : null,
        dlKey: tercera || (!pareceBypass && segunda ? segunda : null)
      }
    }
  } catch {}
  return { base: ZETA_CORE_DEFAULT, bypass: null, dlKey: null }
}

function zetaCoreBase() {
  return zetaCoreConfig().base
}

async function zetaCoreJson(route, params, timeoutMs = 60000) {
  const config = zetaCoreConfig()
  const url = `${config.base}${route}?${params.toString()}`
  const headers = { "User-Agent": "zenith-bot/1.0", Accept: "application/json" }
  if (config.bypass) headers["x-vercel-protection-bypass"] = config.bypass
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs)
  })
  const contentType = response.headers.get("content-type") || ""
  if (!/json/i.test(contentType)) {
    throw new Error(`la API respondió HTML (HTTP ${response.status}); en Vercel: Settings → Deployment Protection → poner Disabled y redeploy`)
  }
  if (response.status === 401) {
    throw new Error(`Vercel bloqueó el pedido (401); en Vercel: Settings → Deployment Protection → poner Disabled y redeploy`)
  }
  const data = await response.json()
  if (!data || data.ok !== true) {
    const msg =
      data?.error?.message ||
      (typeof data?.error === "string" ? data.error : null) ||
      data?.message ||
      `HTTP ${response.status}`
    throw new Error(msg)
  }
  return data
}

async function zetaCoreSaveFile(directUrl, prefix, kind) {
  if (!directUrl || typeof directUrl !== "string") throw new Error("la API no devolvió enlace de descarga")
  const output = path.join(root, `${prefix}.part`)
  const file = await downloadApiFile(directUrl, output, kind)
  if (fs.existsSync(file) && fs.statSync(file).size > 10240) {
    log(`descarga OK vía ZETA-CORE`)
    return file
  }
  removeFile(file)
  throw new Error("archivo vacío de ZETA-CORE")
}

async function zetaCoreDl(query, kind, prefix, quality) {
  const config = zetaCoreConfig()
  if (!config.dlKey) throw new Error("falta la clave /dl en la línea 3 de zeta-core.txt")
  const params = new URLSearchParams({
    query: String(query),
    kind: ["audio", "video", "tiktok", "x", "instagram", "facebook"].includes(kind) ? kind : "video",
    key: config.dlKey
  })
  if (quality && (kind === "audio" || kind === "video")) params.set("quality", String(quality))
  const url = `${config.base}/dl?${params.toString()}`
  const output = path.join(root, `${prefix}.part`)
  const file = await downloadApiFile(
    url,
    output,
    kind,
    config.bypass ? { "x-vercel-protection-bypass": config.bypass } : {}
  )
  if (fs.existsSync(file) && fs.statSync(file).size > 10240) {
    log(`descarga OK vía ZETA-CORE /dl`)
    return file
  }
  removeFile(file)
  throw new Error("archivo vacío de ZETA-CORE /dl")
}

async function zetaCoreYt(query, kind, prefix) {
  const config = zetaCoreConfig()
  const params = new URLSearchParams({ query })
  if (config.dlKey) params.set("key", config.dlKey)
  if (kind !== "audio") params.set("quality", "720p")
  const data = await zetaCoreJsonReintentado(kind === "audio" ? "/ytmp3" : "/ytmp4", params)
  const duracion = Number(data?.duracion_segundos) || 0
  const dlQuality =
    kind === "video" ? (duracion > 1200 ? "360p" : duracion > 600 ? "480p" : "720p") : null
  try {
    return await zetaCoreDlRetry(data.videoId || query, kind, prefix, dlQuality)
  } catch (dlError) {
    const dlMsg = String(dlError?.message || dlError)
    log(`ZETA-CORE /dl falló (${dlMsg.slice(0, 80)}); probando enlace directo...`)
    const directo = String(data.descarga_directa || data.link || "")
    if (directo.includes("/dl?") && !config.dlKey && !/[?&]key=[^&\s]/.test(directo)) {
      // la API devuelve el /dl con key vacia: sin la clave guardada en zeta-core.txt no hay forma de descargar
      throw new Error("falta la clave /dl en la línea 3 de zeta-core.txt")
    }
    try {
      return await zetaCoreSaveFile(directo, prefix, kind)
    } catch (directError) {
      if (dlMsg.includes("falta la clave")) throw dlError
      throw directError
    }
  }
}

async function zetaCoreJsonReintentado(route, params) {
  let data = null
  let metaError = null
  for (let intentoMeta = 1; intentoMeta <= 3; intentoMeta++) {
    try {
      data = await zetaCoreJson(route, params)
      break
    } catch (e) {
      metaError = e
      if (!esErrorReintentable(e?.message || e)) throw e
      if (intentoMeta < 3) await sleepMs(intentoMeta === 1 ? 2000 : 4000)
    }
  }
  if (!data) throw metaError
  return data
}

async function zetaCoreMeta(query, kind) {
  const params = new URLSearchParams({ query: String(query) })
  if (kind !== "audio") params.set("quality", "720p")
  const data = await zetaCoreJsonReintentado(kind === "audio" ? "/ytmp3" : "/ytmp4", params)
  return {
    titulo: data?.titulo || data?.title || "",
    canal: data?.canal || data?.autor || data?.channel || "",
    visitas: data?.visitas ?? data?.views ?? null,
    duracion: Number(data?.duracion_segundos) || 0,
    videoId: data?.videoId || query,
    miniatura: data?.miniatura || data?.thumbnail || ""
  }
}

async function zetaCoreTiktok(url, prefix) {
  const data = await zetaCoreJson("/tiktok", new URLSearchParams({ query: url }))
  const links = data?.data?.links || {}
  const direct = links.hd || links.sd || links.wm || data?.data?.url || null
  if (!direct) throw new Error("el video no tiene fuente descargable")
  try {
    return await zetaCoreSaveFile(direct, prefix, "video")
  } catch (cdnError) {
    if (String(cdnError?.message || cdnError).includes("falta la clave")) throw cdnError
    return zetaCoreDlRetry(url, "tiktok", prefix)
  }
}

async function zetaCoreX(url, prefix) {
  const data = await zetaCoreJson("/xvideo", new URLSearchParams({ query: url }))
  const mp4s = (Array.isArray(data.videos) ? data.videos : [])
    .map((v) => String(v?.url || ""))
    .filter((u) => u && !/\.m3u8/i.test(u))
  const bestSinM3u8 = data.best && !/\.m3u8/i.test(String(data.best)) ? String(data.best) : null
  const direct = mp4s[mp4s.length - 1] || bestSinM3u8
  if (!direct) throw new Error("el tweet no tiene video descargable")
  return zetaCoreSaveFile(direct, prefix, "video")
}

function zetaCorePickMedia(data) {
  const links = Array.isArray(data?.links) ? data.links : []
  const fromLinks = links.map((l) => (typeof l === "string" ? l : l?.url)).filter((u) => /^https?:\/\//.test(String(u || "")))
  return data?.descarga_directa || data?.link || data?.url || fromLinks[0] || null
}

async function zetaCoreInstagram(url, prefix) {
  try {
    return await zetaCoreDlRetry(url, "instagram", prefix)
  } catch (dlError) {
    const dlMsg = String(dlError?.message || dlError)
    const data = await zetaCoreJson("/instagram", new URLSearchParams({ query: url }))
    const direct = zetaCorePickMedia(data)
    if (!direct) throw new Error("el post no tiene media descargable")
    try {
      return await zetaCoreSaveFile(String(direct), prefix, "video")
    } catch {
      if (dlMsg.includes("falta la clave")) throw dlError
      throw new Error("el post no tiene media descargable")
    }
  }
}

async function zetaCoreFacebook(url, prefix) {
  try {
    return await zetaCoreDlRetry(url, "facebook", prefix)
  } catch (dlError) {
    const dlMsg = String(dlError?.message || dlError)
    const data = await zetaCoreJson("/facebook", new URLSearchParams({ query: url }))
    const direct = zetaCorePickMedia(data)
    if (!direct) throw new Error("el video no tiene fuente descargable")
    try {
      return await zetaCoreSaveFile(String(direct), prefix, "video")
    } catch {
      if (dlMsg.includes("falta la clave")) throw dlError
      throw new Error("el video no tiene fuente descargable")
    }
  }
}

async function zetaCorePin(query, limit = 5) {
  const data = await zetaCoreJson("/pin", new URLSearchParams({ query, limit: String(limit) }), 20000)
  const results = (Array.isArray(data.results) ? data.results : [])
    .map((r) => ({
      titulo: String(r?.titulo || r?.title || r?.description || ""),
      imagen: String(r?.imagen || r?.image || r?.url || "")
    }))
    .filter((r) => /^https:\/\/i\.pinimg\.com\//.test(r.imagen))
    .slice(0, limit)
  if (!results.length) throw new Error("sin resultados")
  return results
}

async function zetaCoreTtSearch(query, limit = 5) {
  let lastError = null
  for (let intento = 1; intento <= 2; intento++) {
    try {
      return await zetaCoreTtSearchOnce(query, limit)
    } catch (e) {
      lastError = e
      const msg = String(e?.message || e)
      // BUSQUEDA_INESTABLE: la API avisa que es intermitente y pide reintentar.
      if (!(msg.includes("BUSQUEDA_INESTABLE") || msg.includes("fuentes de busqueda")) || intento >= 2) throw e
      await sleepMs(2500)
    }
  }
  throw lastError
}

async function zetaCoreTtSearchOnce(query, limit = 5) {
  const data = await zetaCoreJson("/ttsearch", new URLSearchParams({ query, limit: String(limit) }), 15000)
  const results = (Array.isArray(data.results) ? data.results : [])
    .filter((r) => r && /^\d{10,25}$/.test(String(r.videoId || "")) && /^https?:\/\//.test(String(r.url || "")))
    .slice(0, limit)
    .map((r) => ({
      title: String(r.title || ""),
      url: String(r.url),
      author: r.author?.username ? `@${r.author.username}` : String(r.author?.nickname || "")
    }))
  if (!results.length) throw new Error("sin resultados")
  return results
}

async function mediaFile(videoId, kind) {
  const prefix = `zenith_${kind}_${Date.now()}_${Math.floor(Math.random() * 100000)}`
  // YouTube se descarga EXCLUSIVAMENTE via ZETA-CORE (la web API propia del dueno).
  // Sin scraping local, sin yt-dlp, sin otras APIs ni fuentes: si ZETA-CORE no
  // puede, se informa rapido con el motivo real (IP_BLOQUEADA reintentable ya se
  // reintenta dentro de zetaCoreDlRetry aprovechando la rotacion de IP de Vercel).
  try {
    const file = await zetaCoreYt(videoId, kind, prefix)
    if (kind === "audio") {
      const extension = path.extname(file).toLowerCase()
      if (extension === ".webm" || extension === ".opus") {
        const converted = await convertAudioToMp3(file)
        if (converted) return converted
      }
    }
    return file
  } catch (e) {
    cleanPrefix(prefix)
    throw new Error(String(e?.message || e))
  }
}

async function convertAudioToMp3(input) {
  const ffmpeg = await ensureFfmpeg()
  if (!ffmpeg) return null
  const output = path.join(root, `zenith_audio_${Date.now()}_${Math.floor(Math.random() * 100000)}.mp3`)
  const binary = ffmpeg === "ffmpeg" ? "ffmpeg" : `"${ffmpeg}"`
  try {
    await execAsync(`${binary} -y -i "${input}" -vn -ar 44100 -ac 2 -b:a 128k "${output}"`, {
      timeout: 180000,
      maxBuffer: 1024 * 1024 * 8
    })
    if (fs.existsSync(output) && fs.statSync(output).size > 2048) {
      removeFile(input)
      log("audio webm convertido a mp3")
      return output
    }
  } catch (e) {}
  removeFile(output)
  return null
}

function deepFind(node, predicate, depth = 0) {
  if (!node || typeof node !== "object" || depth > 14) return null
  if (predicate(node)) return node
  const values = Array.isArray(node) ? node : Object.values(node)
  for (const value of values) {
    const found = deepFind(value, predicate, depth + 1)
    if (found) return found
  }
  return null
}

function collectVideos(node, results, depth = 0) {
  if (!node || typeof node !== "object" || depth > 16 || results.length >= 10) return
  const renderer = node.videoRenderer
  if (renderer?.videoId && renderer?.title) {
    const title = (renderer.title.runs || []).map((run) => run.text).join("") || renderer.title.simpleText || ""
    if (title && !results.find((item) => item.id === renderer.videoId)) {
      results.push({ id: renderer.videoId, title })
    }
  }
  const values = Array.isArray(node) ? node : Object.values(node)
  for (const value of values) collectVideos(value, results, depth + 1)
}

async function searchVideos(query, limit = 5) {
  const { apiKey, visitorData } = await getClientConfig()
  const results = []
  try {
    const response = await request(`https://www.youtube.com/youtubei/v1/search?key=${apiKey}&prettyPrint=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": YT_UA,
        "X-YouTube-Client-Name": "1",
        "X-YouTube-Client-Version": "2.20250310.01.00",
        ...(visitorData ? { "X-Goog-Visitor-Id": visitorData } : {}),
        Cookie: cookiesHeader(),
        Origin: "https://www.youtube.com"
      },
      body: {
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20250310.01.00",
            hl: "es",
            gl: "ES",
            ...(visitorData ? { visitorData } : {})
          }
        },
        query
      }
    })
    if (response.status === 200) {
      const json = JSON.parse(response.body)
      collectVideos(json, results)
    }
  } catch (e) {}

  if (results.length === 0) {
    for (const url of [
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=es&gl=ES`,
      `https://m.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=es&gl=ES`
    ]) {
      try {
        const response = await request(url, { headers: browserHeaders({ "User-Agent": MOBILE_UA }) })
        if (response.status !== 200) continue
        const data = extractJsonAfter(response.body, "ytInitialData")
        if (data) collectVideos(data, results)
        if (results.length > 0) break
      } catch (e) {}
    }
  }

  return results.slice(0, limit)
}

async function searchVideoId(query) {
  const apiKey = await getApiKey()
  try {
    const response = await request(`https://www.youtube.com/youtubei/v1/search?key=${apiKey}&prettyPrint=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": YT_UA,
        "X-YouTube-Client-Name": "1",
        "X-YouTube-Client-Version": "2.20250310.01.00",
        Origin: "https://www.youtube.com"
      },
      body: {
        context: { client: { clientName: "WEB", clientVersion: "2.20250310.01.00", hl: "es", gl: "ES" } },
        query
      }
    })
    if (response.status === 200) {
      const json = JSON.parse(response.body)
      const renderer = deepFind(json, (node) => node?.videoRenderer?.videoId)
      if (renderer?.videoRenderer?.videoId) return renderer.videoRenderer.videoId
      const match = response.body.match(/"videoId":"([A-Za-z0-9_-]{11})"/)
      if (match) return match[1]
    }
  } catch (e) {}

  const searchUrls = [
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=es&gl=ES`,
    `https://m.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=es&gl=ES`
  ]
  for (const url of searchUrls) {
    try {
      const response = await request(url, { headers: browserHeaders({ "User-Agent": MOBILE_UA }) })
      if (response.status !== 200) continue
      const data = extractJsonAfter(response.body, "ytInitialData")
      if (data) {
        const renderer = deepFind(data, (node) => node?.videoRenderer?.videoId)
        if (renderer?.videoRenderer?.videoId) return renderer.videoRenderer.videoId
      }
      const match = response.body.match(/"videoId":"([A-Za-z0-9_-]{11})"/)
      if (match) return match[1]
      const alt = response.body.match(/\/watch\?v=([A-Za-z0-9_-]{11})/)
      if (alt) return alt[1]
    } catch (e) {}
  }
  return null
}

async function resolveVideo(input) {
  const raw = String(input || "").trim()
  if (!raw) return null
  const direct = extractVideoId(raw)
  if (direct && /youtu/.test(raw)) return direct
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw

  const scraped = await searchVideoId(raw)
  if (scraped) return scraped

  const coreBusqueda = await zetaCoreJson("/ytsearch", new URLSearchParams({ query: raw, limit: "1" })).catch(() => null)
  const coreUrl = String(coreBusqueda?.resultados?.[0]?.url || "")
  const coreId = coreUrl ? extractVideoId(coreUrl) : null
  if (coreId) return coreId

  const binary = await ensureYtDlp()
  if (binary) {
    try {
      const { stdout } = await execAsync(
        `"${binary}" "ytsearch1:${raw.replace(/"/g, "")}" --flat-playlist --no-warnings --no-progress --print "%(id)s"`,
        { timeout: 90000, maxBuffer: 1024 * 1024 * 4 }
      )
      const found = String(stdout || "")
        .split("\n")
        .map((line) => line.trim())
        .find((line) => /^[A-Za-z0-9_-]{11}$/.test(line))
      if (found) return found
    } catch (e) {}
  }
  return null
}

let playDlModule
async function loadPlayDl() {
  if (playDlModule !== undefined) return playDlModule
  try {
    const mod = await import("play-dl")
    playDlModule = mod.default || mod
  } catch (e) {
    playDlModule = null
  }
  return playDlModule
}

async function patchedSearch(query, options = {}) {
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 1
  const id = await resolveVideo(query)
  if (!id) return []
  return [
    {
      url: `https://www.youtube.com/watch?v=${id}`,
      title: String(query),
      id,
      durationInSec: 0,
      thumbnails: []
    }
  ].slice(0, limit)
}

async function patchedStream(url, options = {}) {
  const videoId = extractVideoId(url) || (await resolveVideo(url))
  if (!videoId) throw new Error("video no encontrado")
  const kind = Number(options.quality) === 2 ? "audio" : "video"
  const file = await mediaFile(videoId, kind)
  const extension = path.extname(file).replace(".", "") || (kind === "audio" ? "m4a" : "mp4")
  const stream = fs.createReadStream(file)
  const cleanup = () => removeFile(file)
  stream.on("close", cleanup)
  stream.on("error", cleanup)
  return { stream, type: extension }
}

async function patchPlayDl() {
  const play = await loadPlayDl()
  if (!play || typeof play !== "object") {
    log("play-dl no está instalado; el parche queda inactivo")
    return false
  }
  try {
    if (typeof play.search === "function") play.search = patchedSearch
    if (typeof play.stream === "function") play.stream = patchedStream
    log("play-dl parcheado con scraping")
    return true
  } catch (e) {
    log(`no se pudo parchear play-dl: ${e?.message || e}`)
    return false
  }
}

async function checkCookiesSession() {
  const cookies = readCookiesHeader()
  if (!cookies) return { count: 0, loggedIn: false }
  const count = cookies.split(";").length
  try {
    const response = await request("https://www.youtube.com/?hl=es&gl=ES", {
      headers: browserHeaders(),
      timeout: 20000
    })
    if (response.status !== 200) return { count, loggedIn: null }
    const body = response.body.toString("utf8")
    if (body.includes('"loggedIn":true')) return { count, loggedIn: true }
    if (body.includes('"loggedIn":false') || body.includes("Iniciar sesión") || body.includes("Sign in")) {
      return { count, loggedIn: false }
    }
    return { count, loggedIn: null }
  } catch (e) {
    return { count, loggedIn: null }
  }
}

export async function diagnose() {
  const lines = []
  lines.push(`Node: ${process.version}`)

  const binary = await ensureYtDlp()
  if (binary) {
    try {
      const { stdout } = await execAsync(`"${binary}" --version`, { timeout: 30000 })
      lines.push(`yt-dlp: ${String(stdout).trim()} (${binary})`)
    } catch (e) {
      lines.push(`yt-dlp: presente pero falla al ejecutar (${binary})`)
    }
  } else {
    lines.push("yt-dlp: NO disponible")
  }

  const cookieCheck = await checkCookiesSession()
  const cookieState =
    cookieCheck.count === 0
      ? "NO presente"
      : cookieCheck.loggedIn === true
        ? `presente (${cookieCheck.count} cookies, sesión iniciada: SÍ)`
        : cookieCheck.loggedIn === false
          ? `presente (${cookieCheck.count} cookies, sesión iniciada: NO → cookies vencidas o mal exportadas)`
          : `presente (${cookieCheck.count} cookies, sesión iniciada: no se pudo verificar)`
  lines.push(`cookies.txt: ${cookieState}`)

  const potReady = await setupPotProvider()
  lines.push(`PO Token: ${potReady ? "servidor activo" : "no disponible (mirá los logs del servidor para el motivo)"}`)

  const customApi = customApiInfo()
  if (!customApi) {
    lines.push("API propia: no configurada (opcional; mirá la carpeta zenith-api)")
  } else {
    try {
      const healthResponse = await fetch(`${customApi.base}/health`, {
        headers: { Accept: "application/json", "bypass-tunnel-reminder": "true" },
        signal: AbortSignal.timeout(15000)
      })
      const healthData = await healthResponse.json().catch(() => null)
      lines.push(
        healthData?.ok
          ? `API propia: OK (${customApi.base})`
          : `API propia: respondió raro (HTTP ${healthResponse.status})`
      )
    } catch (e) {
      lines.push(`API propia: configurada pero NO responde (${String(e?.message || e).slice(0, 60)})`)
    }
  }

  try {
    const started = Date.now()
    const file = await mediaFile("jNQXAC9IVRw", "audio")
    const size = fs.existsSync(file) ? fs.statSync(file).size : 0
    lines.push(`descarga de prueba: OK (${Math.round(size / 1024)} KB en ${Math.round((Date.now() - started) / 1000)}s)`)
    removeFile(file)
  } catch (e) {
    lines.push(`descarga de prueba: FALLÓ → ${String(e?.message || e).slice(0, 350)}`)
  }

  return lines.join("\n")
}

export {
  ensureYtDlp,
  ensureFfmpeg,
  resolveVideo,
  searchVideos,
  mediaFile,
  patchPlayDl,
  patchedSearch,
  patchedStream,
  customApiInfo,
  customApiDownloadUrl,
  zetaCoreBase,
  zetaCoreYt,
  zetaCoreMeta,
  zetaCoreDl,
  zetaCoreTiktok,
  zetaCoreX,
  zetaCoreInstagram,
  zetaCoreFacebook,
  zetaCoreTtSearch,
  zetaCorePin
}

log(`cookies: ${readCookiesHeader() ? "sí" : "no (subí cookies.txt si YouTube bloquea la IP del servidor)"}`)

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  const query = process.argv.slice(2).join(" ").trim() || "hola remix"
  const id = await resolveVideo(query)
  if (!id) {
    console.log("No se encontró el video")
    process.exit(1)
  }
  const file = await mediaFile(id, "audio")
  console.log(`OK ${file}`)
}
