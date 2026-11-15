import fs from "fs"
import os from "os"
import path from "path"
import axios from "axios"
import { exec, execFile } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

const TAG = "[ZENITH-PLAY]"
const ROOT = process.cwd()
const BIN_DIR = path.join(ROOT, "bin")
const WORK_DIR = path.join(ROOT, "tmp_media")
const COOKIES_FILE = path.join(ROOT, "cookies.txt")

const YTDLP_CLIENTS = ["android_vr", "tv_embedded", "web_embedded", "ios", "mweb", "android"]
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.private.coffee",
  "https://pipedapi.reallyaweso.me"
]

const log = (...args) => console.log(TAG, ...args)

const net = axios.create({
  timeout: 120000,
  maxRedirects: 10,
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
  }
})

const mediaCache = new Map()

function extractVideoId(input) {
  const raw = String(input || "").trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /\/shorts\/([a-zA-Z0-9_-]{11})/,
    /\/embed\/([a-zA-Z0-9_-]{11})/,
    /\/live\/([a-zA-Z0-9_-]{11})/
  ]
  for (const pattern of patterns) {
    const match = raw.match(pattern)
    if (match) return match[1]
  }
  return null
}

async function isWorkingBinary(command) {
  try {
    await execFileAsync(command, ["--version"], { timeout: 25000 })
    return true
  } catch {
    return false
  }
}

let ytDlpValue = null
let ytDlpPromise = null

async function ensureYtDlp() {
  if (ytDlpValue) return ytDlpValue
  if (ytDlpPromise) return ytDlpPromise
  ytDlpPromise = (async () => {
    try {
      fs.mkdirSync(BIN_DIR, { recursive: true })
    } catch {}

    const localName = os.platform() === "win32" ? "yt-dlp.exe" : "yt-dlp"
    const localPath = path.join(BIN_DIR, localName)

    if (fs.existsSync(localPath) && (await isWorkingBinary(localPath))) {
      ytDlpValue = localPath
      log("yt-dlp listo (local)")
      return ytDlpValue
    }
    if (await isWorkingBinary("yt-dlp")) {
      ytDlpValue = "yt-dlp"
      log("yt-dlp listo (sistema)")
      return ytDlpValue
    }

    const platform = os.platform()
    const arch = os.arch()
    let candidates = []
    if (platform === "linux") {
      candidates = arch === "arm64" ? ["yt-dlp_linux_aarch64", "yt-dlp"] : ["yt-dlp_linux", "yt-dlp"]
    } else if (platform === "win32") {
      candidates = ["yt-dlp.exe"]
    } else if (platform === "darwin") {
      candidates = ["yt-dlp_macos", "yt-dlp"]
    } else {
      candidates = ["yt-dlp"]
    }

    for (const candidate of candidates) {
      const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${candidate}`
      try {
        log(`descargando ${candidate}...`)
        const response = await net.get(url, { responseType: "arraybuffer", timeout: 180000 })
        const buffer = Buffer.from(response.data)
        if (buffer.length < 500000) throw new Error("descarga incompleta")
        fs.writeFileSync(localPath, buffer)
        try {
          fs.chmodSync(localPath, 0o755)
        } catch {}
        if (await isWorkingBinary(localPath)) {
          ytDlpValue = localPath
          log(`yt-dlp instalado (${candidate})`)
          return ytDlpValue
        }
      } catch (error) {
        log(`fallo al descargar ${candidate}: ${error.message}`)
      }
    }

    log("no se pudo instalar yt-dlp (se usará Piped)")
    return null
  })()
  return ytDlpPromise
}

let ffmpegValue = null
let ffmpegPromise = null

async function ensureFfmpeg() {
  if (ffmpegValue) return ffmpegValue
  if (ffmpegPromise) return ffmpegPromise
  ffmpegPromise = (async () => {
    if (await isWorkingBinary("ffmpeg")) {
      ffmpegValue = "ffmpeg"
      log("ffmpeg listo (sistema)")
      return ffmpegValue
    }
    try {
      const mod = await import("ffmpeg-static")
      const candidate = mod?.default || mod
      if (candidate && fs.existsSync(candidate)) {
        ffmpegValue = candidate
        log("ffmpeg listo (ffmpeg-static)")
        return ffmpegValue
      }
    } catch {}
    try {
      log("instalando ffmpeg-static...")
      await execAsync("npm install ffmpeg-static --no-save --no-audit --no-fund", {
        cwd: ROOT,
        timeout: 600000,
        maxBuffer: 1024 * 1024 * 16
      })
      const mod = await import("ffmpeg-static")
      const candidate = mod?.default || mod
      if (candidate && fs.existsSync(candidate)) {
        ffmpegValue = candidate
        log("ffmpeg-static instalado")
        return ffmpegValue
      }
    } catch (error) {
      log(`no se pudo instalar ffmpeg-static: ${error.message}`)
    }
    log("ffmpeg no disponible")
    return null
  })()
  return ffmpegPromise
}

function cookieArgs() {
  try {
    if (fs.existsSync(COOKIES_FILE)) return ["--cookies", COOKIES_FILE]
  } catch {}
  return []
}

function findOutput(token) {
  try {
    const files = fs.readdirSync(WORK_DIR).filter((name) => name.startsWith(`${token}.`))
    if (!files.length) return null
    let best = null
    for (const name of files) {
      const full = path.join(WORK_DIR, name)
      const size = fs.statSync(full).size
      if (!best || size > best.size) best = { file: full, size }
    }
    return best ? best.file : null
  } catch {
    return null
  }
}

async function convertToMp3(input, token) {
  const output = path.join(WORK_DIR, `${token}.mp3`)
  const ffmpeg = await ensureFfmpeg()
  if (!ffmpeg) return input
  try {
    await execFileAsync(
      ffmpeg,
      ["-y", "-i", input, "-vn", "-ar", "44100", "-ac", "2", "-b:a", "128k", output],
      { timeout: 300000, maxBuffer: 1024 * 1024 * 16 }
    )
    if (fs.existsSync(output) && fs.statSync(output).size > 2048) {
      try {
        if (path.resolve(input) !== path.resolve(output)) fs.unlinkSync(input)
      } catch {}
      return output
    }
  } catch (error) {
    log(`ffmpeg falló: ${error.message}`)
  }
  return input
}

async function ytDlpDownload(binary, videoUrl, kind, token) {
  fs.mkdirSync(WORK_DIR, { recursive: true })
  const pattern = path.join(WORK_DIR, `${token}.%(ext)s`)
  const formatAudio = "ba[ext=m4a]/ba/b"
  const formatVideo =
    "bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480][ext=mp4]/b[ext=mp4]/b"

  for (const client of YTDLP_CLIENTS) {
    const args = [
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "--geo-bypass",
      "--no-mtime",
      "--socket-timeout",
      "30",
      "--extractor-args",
      `youtube:player_client=${client}`,
      ...cookieArgs(),
      "-o",
      pattern
    ]
    if (kind === "mp3") {
      args.push("-f", formatAudio)
    } else {
      args.push("-f", formatVideo, "--merge-output-format", "mp4")
    }
    args.push(videoUrl)

    try {
      log(`yt-dlp audio/video intento con cliente ${client}`)
      await execFileAsync(binary, args, { timeout: 300000, maxBuffer: 1024 * 1024 * 32 })
      let file = findOutput(token)
      if (file && fs.statSync(file).size > 8192) {
        if (kind === "mp3") file = await convertToMp3(file, token)
        log(`yt-dlp OK (${client})`)
        return file
      }
    } catch (error) {
      log(`yt-dlp cliente ${client} falló: ${String(error.message).split("\n")[0]}`)
      try {
        const leftover = findOutput(token)
        if (leftover) fs.unlinkSync(leftover)
      } catch {}
    }
  }

  if (kind !== "mp3") {
    try {
      log("yt-dlp video: reintento progresivo 360p")
      await execFileAsync(
        binary,
        [
          "--no-playlist",
          "--no-warnings",
          "--no-progress",
          "--geo-bypass",
          ...cookieArgs(),
          "-f",
          "b[height<=360][ext=mp4]/b[ext=mp4]/b",
          "-o",
          pattern,
          videoUrl
        ],
        { timeout: 300000, maxBuffer: 1024 * 1024 * 32 }
      )
      const file = findOutput(token)
      if (file && fs.statSync(file).size > 8192) return file
    } catch (error) {
      log(`reintento 360p falló: ${String(error.message).split("\n")[0]}`)
    }
  }

  return null
}

async function pipedDownload(videoId, kind, token) {
  fs.mkdirSync(WORK_DIR, { recursive: true })
  for (const instance of PIPED_INSTANCES) {
    try {
      const info = await net.get(`${instance}/streams/${videoId}`, { timeout: 30000 })
      const json = info.data || {}
      const audioStreams = Array.isArray(json.audioStreams) ? json.audioStreams : []
      const videoStreams = Array.isArray(json.videoStreams) ? json.videoStreams : []

      let chosen = null
      const mimeOf = (s) => String(s?.mimeType || s?.format || "").toLowerCase()
      const bitrateOf = (s) => Number(s?.bitrate || s?.quality || 0)

      if (kind === "mp3") {
        const m4a = audioStreams.filter((s) => mimeOf(s).includes("mp4") || mimeOf(s).includes("m4a"))
        const pool = m4a.length ? m4a : audioStreams
        pool.sort((a, b) => bitrateOf(b) - bitrateOf(a))
        chosen = pool[0]
      } else {
        const progressive = videoStreams.filter((s) => s.videoOnly !== true && mimeOf(s).includes("mp4"))
        progressive.sort((a, b) => (Number(b.height || 0) || 0) - (Number(a.height || 0) || 0))
        chosen = progressive.find((s) => Number(s.height || 0) <= 480) || progressive[0]
        if (!chosen) {
          const any = videoStreams.filter((s) => mimeOf(s).includes("mp4"))
          any.sort((a, b) => (Number(a.height || 0) || 0) - (Number(b.height || 0) || 0))
          chosen = any[0]
        }
      }

      if (!chosen || !chosen.url) continue
      let ext = kind === "mp3" ? "m4a" : "mp4"
      if (kind === "mp3" && mimeOf(chosen).includes("webm")) ext = "webm"
      if (kind !== "mp3" && mimeOf(chosen).includes("webm")) ext = "webm"

      log(`piped ${instance} -> ${kind} ${ext}`)
      const media = await net.get(chosen.url, { responseType: "arraybuffer", timeout: 180000 })
      const buffer = Buffer.from(media.data)
      if (buffer.length < 8192) continue
      const output = path.join(WORK_DIR, `${token}.${ext}`)
      fs.writeFileSync(output, buffer)
      if (kind === "mp3") return await convertToMp3(output, token)
      return output
    } catch (error) {
      log(`piped ${instance} falló: ${String(error.message).split("\n")[0]}`)
    }
  }
  return null
}

async function prepareMedia(videoUrl, kind) {
  const videoId = extractVideoId(videoUrl)
  const token = `${kind === "mp3" ? "a" : "v"}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

  let file = null
  const binary = await ensureYtDlp()
  if (binary) file = await ytDlpDownload(binary, videoUrl, kind, token)
  if (!file && videoId) file = await pipedDownload(videoId, kind, token)
  if (!file) throw new Error("sin fuente disponible")

  const size = fs.statSync(file).size
  if (kind !== "mp3" && size > 64 * 1024 * 1024) {
    try {
      fs.unlinkSync(file)
    } catch {}
    throw new Error("video demasiado grande para WhatsApp")
  }

  mediaCache.set(token, { file, at: Date.now() })
  setTimeout(() => {
    try {
      const entry = mediaCache.get(token)
      if (entry) fs.unlinkSync(entry.file)
      mediaCache.delete(token)
    } catch {}
  }, 15 * 60 * 1000).unref?.()

  log(`media lista ${token} (${Math.round(size / 1024)} KB)`)
  return token
}

function buildResponse(config, data, headers) {
  return { data, status: 200, statusText: "OK", headers, config, request: {} }
}

const originalAdapter = axios.defaults.adapter

function passthrough(config) {
  if (typeof originalAdapter === "function") return originalAdapter(config)
  return net.request({ ...config, adapter: undefined })
}

axios.defaults.adapter = async function zenithAdapter(config) {
  try {
    const url = String(config?.url || "")
    const method = String(config?.method || "get").toLowerCase()

    if (method === "get" || method === "post") {
      const apiMatch = url.match(/siputzx\.my\.id\/api\/d\/yt(mp3|mp4)\b[^\s]*?[?&]url=([^&]+)/i)
      if (apiMatch) {
        const kind = apiMatch[1].toLowerCase()
        const target = decodeURIComponent(apiMatch[2])
        log(`pedido yt${kind} interceptado`)
        try {
          const token = await prepareMedia(target, kind)
          const fake = `https://zenith-media.local/${token}`
          return buildResponse(config, { data: { data: { dl: fake, download: fake, url: fake } } }, {
            "content-type": "application/json"
          })
        } catch (error) {
          log(`no se pudo preparar el medio: ${error.message}`)
          return buildResponse(config, { data: { data: {} } }, { "content-type": "application/json" })
        }
      }

      const localMatch = url.match(/^https?:\/\/zenith-media\.local\/([a-z0-9]+)$/i)
      if (localMatch) {
        const entry = mediaCache.get(localMatch[1])
        if (!entry || !fs.existsSync(entry.file)) {
          log("archivo local no encontrado")
          return buildResponse(config, Buffer.alloc(0), { "content-type": "application/octet-stream" })
        }
        const buffer = fs.readFileSync(entry.file)
        log(`entregando ${localMatch[1]} (${Math.round(buffer.length / 1024)} KB)`)
        return buildResponse(config, buffer, { "content-type": "application/octet-stream" })
      }
    }
  } catch (error) {
    log(`error en interceptor: ${error.message}`)
  }
  return passthrough(config)
}

log("parche #play/#mp4 activo (sin APIs, yt-dlp + piped)")

export { prepareMedia, ensureYtDlp, ensureFfmpeg }
