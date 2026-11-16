import http from "http"
import https from "https"
import fs from "fs"
import os from "os"
import path from "path"
import crypto from "crypto"
import { execFile, spawn } from "child_process"
import { promisify } from "util"
import { fileURLToPath } from "url"

const execFileAsync = promisify(execFile)
const root = path.dirname(fileURLToPath(import.meta.url))
const binDir = path.join(root, "bin")
const binaryName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
const binaryPath = path.join(binDir, binaryName)
const cookiesPath = path.join(root, "cookies.txt")
const clavePath = path.join(root, "clave.txt")
const port = Number(process.env.PORT || 3333)
const POT_PORT = 4416
const POT_VERSION = "2.0.2"
const IG_APP_ID = "936619743392459"
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

const HOSTS_OK = [
  "youtube.com", "www.youtube.com", "youtu.be", "www.youtu.be", "music.youtube.com",
  "tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com",
  "instagram.com", "www.instagram.com",
  "twitter.com", "www.twitter.com", "mobile.twitter.com", "x.com", "www.x.com", "mobile.x.com",
  "facebook.com", "www.facebook.com", "m.facebook.com", "fb.com", "www.fb.com", "fb.watch"
]

const CONTENT_TYPES = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".opus": "audio/ogg",
  ".ogg": "audio/ogg"
}

function log(message) {
  console.log(`[API] ${message}`)
}

function getClave() {
  try {
    const clave = fs.readFileSync(clavePath, "utf8").trim()
    return clave || null
  } catch {
    return null
  }
}

function crearClave() {
  const clave = crypto.randomBytes(12).toString("hex")
  fs.writeFileSync(clavePath, clave)
  return clave
}

function downloadBinary(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) {
      reject(new Error("demasiadas redirecciones"))
      return
    }
    https
      .get(url, { headers: { "User-Agent": "zenith-api/1.0" } }, (response) => {
        const status = response.statusCode || 0
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume()
          resolve(downloadBinary(new URL(response.headers.location, url).toString(), destination, redirects + 1))
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

function pickAsset() {
  if (process.platform === "win32") return "yt-dlp.exe"
  if (process.platform === "darwin") return "yt-dlp_macos"
  if (process.arch === "arm64") return "yt-dlp_linux_aarch64"
  if (process.arch === "arm") return "yt-dlp_linux_armv7l"
  return "yt-dlp_linux"
}

let systemYtDlpChecked = false
let systemYtDlpFound = false
async function findSystemYtDlp() {
  if (systemYtDlpChecked) return systemYtDlpFound
  systemYtDlpChecked = true
  try {
    await execFileAsync("yt-dlp", ["--version"], { timeout: 30000 })
    systemYtDlpFound = true
    log("usando yt-dlp del sistema")
  } catch {
    systemYtDlpFound = false
  }
  return systemYtDlpFound
}

let ytDlpPromise = null
function ensureYtDlp() {
  if (ytDlpPromise) return ytDlpPromise
  ytDlpPromise = (async () => {
    if (await findSystemYtDlp()) return "yt-dlp"
    if (fs.existsSync(binaryPath)) {
      try {
        await execFileAsync(binaryPath, ["--version"], { timeout: 30000 })
        return binaryPath
      } catch {}
    }
    fs.mkdirSync(binDir, { recursive: true })
    const asset = pickAsset()
    log(`descargando yt-dlp (${asset})...`)
    await downloadBinary(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`, binaryPath)
    try {
      fs.chmodSync(binaryPath, 0o755)
    } catch {}
    await execFileAsync(binaryPath, ["--version"], { timeout: 60000 })
    log("yt-dlp listo")
    return binaryPath
  })()
  return ytDlpPromise
}

function formatFor(mode) {
  if (mode === "audio") return "bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio/best[vcodec=none]/best[acodec!=none][vcodec=none]"
  return "best[ext=mp4][height<=720]/best[height<=720]/best"
}

function cleanDownloads(id) {
  try {
    for (const name of fs.readdirSync(root)) {
      if (name.startsWith(`api_dl_${id}`)) {
        try {
          fs.unlinkSync(path.join(root, name))
        } catch {}
      }
    }
  } catch {}
}

let jsRuntimeArgsPromise = null

function jsRuntimeArgs(binary) {
  if (!jsRuntimeArgsPromise) {
    jsRuntimeArgsPromise = (async () => {
      const flag = ["--js-runtimes", `node:${process.execPath}`]
      try {
        await execFileAsync(binary, [...flag, "--version"], { timeout: 30000 })
        return flag
      } catch {
        return []
      }
    })()
  }
  return jsRuntimeArgsPromise
}

async function runYtDlp(url, mode, id, client) {
  const binary = await ensureYtDlp()
  const args = [
    "--no-playlist", "--no-progress", "--no-warnings", "--no-mtime",
    "--geo-bypass", "--socket-timeout", "20", "--retries", "2",
    "--concurrent-fragments", "4",
    "-f", formatFor(mode),
    "-o", path.join(root, `api_dl_${id}.%(ext)s`)
  ]
  args.push(...(await jsRuntimeArgs(binary)))
  if (client) args.push("--extractor-args", `youtube:player_client=${client}`)
  if (fs.existsSync(cookiesPath)) args.push("--cookies", cookiesPath)
  args.push(url)
  await execFileAsync(binary, args, { timeout: 600000, maxBuffer: 1024 * 1024 * 8, cwd: root })
  const found = fs
    .readdirSync(root)
    .filter((name) => name.startsWith(`api_dl_${id}.`))
    .sort((a, b) => fs.statSync(path.join(root, b)).mtimeMs - fs.statSync(path.join(root, a)).mtimeMs)
  return found.length ? path.join(root, found[0]) : null
}

function potServerDir() {
  const sibling = path.join(root, "..", "pot_provider")
  if (fs.existsSync(path.join(sibling, "build", "main.js"))) return sibling
  const local = path.join(root, "pot_provider")
  if (fs.existsSync(path.join(local, "build", "main.js"))) return local
  return null
}

async function pingPotServer() {
  try {
    const response = await fetch(`http://127.0.0.1:${POT_PORT}/ping`, { signal: AbortSignal.timeout(3000) })
    return response.ok
  } catch {
    return false
  }
}

let potPromise = null

function ensurePotServer() {
  if (potPromise) return potPromise
  potPromise = (async () => {
    try {
      if (await pingPotServer()) {
        log("servidor PO Token ya está corriendo")
        return true
      }
      const potDir = potServerDir()
      if (!potDir) {
        log("pot_provider no encontrado junto a la API; PO Token omitido")
        return false
      }
      const pluginsDir = path.join(os.homedir(), ".config", "yt-dlp", "plugins")
      fs.mkdirSync(pluginsDir, { recursive: true })
      const pluginZip = path.join(pluginsDir, "bgutil-ytdlp-pot-provider.zip")
      if (!fs.existsSync(pluginZip)) {
        log("descargando plugin PO Token para yt-dlp...")
        await downloadBinary(
          `https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/${POT_VERSION}/bgutil-ytdlp-pot-provider.zip`,
          pluginZip
        )
      }
      if (!fs.existsSync(path.join(potDir, "node_modules", "express"))) {
        log("instalando dependencias del servidor PO Token (solo la primera vez)...")
        await execFileAsync("npm", ["install", "--no-save", "--no-audit", "--no-fund"], { cwd: potDir, timeout: 600000 })
      }
      const child = spawn(process.execPath, [path.join(potDir, "build", "main.js"), "--port", String(POT_PORT)], {
        cwd: potDir,
        detached: true,
        stdio: "ignore"
      })
      child.unref()
      for (let i = 0; i < 20; i++) {
        if (await pingPotServer()) {
          log(`servidor PO Token listo en 127.0.0.1:${POT_PORT}`)
          return true
        }
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }
      log("el servidor PO Token no respondió")
      return false
    } catch (e) {
      log(`PO Token no disponible: ${e?.message || e}`)
      return false
    }
  })()
  return potPromise
}

function igShortcode(target) {
  const match = target.match(/instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i)
  return match ? match[1] : null
}

function igMediaId(shortcode) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
  let id = 0n
  for (const character of shortcode) {
    const index = alphabet.indexOf(character)
    if (index < 0) return null
    id = id * 64n + BigInt(index)
  }
  return id.toString()
}

function httpsGet(url, headers, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers, timeout }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        httpsGet(new URL(response.headers.location, url).toString(), headers, timeout).then(resolve, reject)
        return
      }
      let data = ""
      response.setEncoding("utf8")
      response.on("data", (chunk) => { data += chunk })
      response.on("end", () => resolve({ status: response.statusCode, body: data }))
    })
    request.on("timeout", () => request.destroy(new Error("timeout")))
    request.on("error", reject)
  })
}

function downloadTo(url, destination, headers, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers, timeout }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        downloadTo(new URL(response.headers.location, url).toString(), destination, headers, timeout).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`HTTP ${response.statusCode}`))
        return
      }
      const writer = fs.createWriteStream(destination)
      response.pipe(writer)
      writer.on("finish", () => resolve(destination))
      writer.on("error", reject)
      response.on("error", reject)
    })
    request.on("timeout", () => request.destroy(new Error("timeout")))
    request.on("error", reject)
  })
}

const CRAWLER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"

async function instagramCrawler(target, id) {
  const shortcode = igShortcode(target)
  if (!shortcode) throw new Error("no pude leer el código del post de Instagram")
  const kind = /\/(?:reel|reels|tv)\//.test(target) ? "reel" : "p"
  const page = await httpsGet(`https://www.instagram.com/${kind}/${shortcode}/`, {
    "user-agent": CRAWLER_UA,
    accept: "text/html"
  })
  if (page.status !== 200) throw new Error(`Instagram respondió HTTP ${page.status}`)
  const marker = '"video_versions":'
  const start = page.body.indexOf(marker)
  if (start < 0) throw new Error("el post no tiene video descargable (¿son imágenes?)")
  let depth = 0
  let end = -1
  for (let i = start + marker.length; i < page.body.length; i++) {
    const c = page.body[i]
    if (c === "[") depth++
    else if (c === "]") {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end < 0) throw new Error("respuesta de Instagram ilegible")
  let versions
  try {
    versions = JSON.parse(page.body.slice(start + marker.length, end))
  } catch {
    throw new Error("respuesta de Instagram ilegible")
  }
  const video = versions[0]?.url
  if (!video) throw new Error("el post no tiene video descargable")
  const destination = path.join(root, `api_dl_${id}.mp4`)
  await downloadTo(video, destination, { "user-agent": BROWSER_UA, referer: "https://www.instagram.com/" })
  return destination
}

async function instagramMobile(target, id) {
  const shortcode = igShortcode(target)
  if (!shortcode) throw new Error("no pude leer el código del post de Instagram")
  const mediaId = igMediaId(shortcode)
  if (!mediaId) throw new Error("no pude interpretar el código del post")
  const headers = {
    "x-ig-app-id": IG_APP_ID,
    "user-agent": BROWSER_UA,
    accept: "*/*"
  }
  const { status, body } = await httpsGet(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, headers)
  if (status !== 200) throw new Error(`Instagram respondió HTTP ${status}`)
  let item
  try {
    item = JSON.parse(body)?.items?.[0]
  } catch {
    throw new Error("Instagram devolvió una respuesta ilegible")
  }
  if (!item) throw new Error("Instagram no devolvió datos del post")
  const video = (item.video_versions || [])[0]?.url
  if (!video) throw new Error("el post no tiene video descargable (¿son imágenes?)")
  const destination = path.join(root, `api_dl_${id}.mp4`)
  await downloadTo(video, destination, { "user-agent": BROWSER_UA, referer: "https://www.instagram.com/" })
  return destination
}

const NSFW_PATTERN = /\b(porn\w*|xxx|nsfw|hentai|onlyfans|redtube|xvideos|sexo|sexual|desnud[ao]s?|nudes?|naked|tetas|culo|culos|vagina|pene|anal|orgia|orgias|erotico|eroticas?|horny|gore|decapitacion|mutilacion|suicidio|violacion|violar|incesto|puta|putas|puto|putos|masturb\w*|18\+)\b/

function normalizeText(text) {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function isNsfw(text) {
  return NSFW_PATTERN.test(normalizeText(text))
}

const searchRate = new Map()

function absolutizeTikwmUrl(url) {
  if (!url) return ""
  if (url.startsWith("//")) return "https:" + url
  if (url.startsWith("/")) return "https://www.tikwm.com" + url
  return url
}

function tiktokLinkFrom(item) {
  const author = item?.author?.unique_id || item?.author?.uniqueId || ""
  const id = item?.video_id || item?.aweme_id || item?.id || ""
  if (author && id) return `https://www.tiktok.com/@${author}/video/${id}`
  const candidate = item?.web_url || item?.url || ""
  if (/^https?:\/\/([a-z0-9-]+\.)*tiktok\.com\//i.test(candidate)) return candidate
  return ""
}

async function tikwmSearch(query, host) {
  const url = `${host}/api/feed/search?` + new URLSearchParams({ keywords: query, count: "12" })
  const response = await fetch(url, {
    headers: { "user-agent": BROWSER_UA, accept: "application/json" },
    signal: AbortSignal.timeout(25000)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = await response.json()
  if (body?.code !== 0 || !Array.isArray(body?.data?.videos)) throw new Error(body?.msg || "el proveedor no devolvio videos")
  const results = []
  const seen = new Set()
  for (const item of body.data.videos) {
    const link = tiktokLinkFrom(item)
    if (!link || seen.has(link)) continue
    const title = String(item?.title || "").replace(/\s+/g, " ").trim()
    if (isNsfw(title) || isNsfw(item?.author?.nickname || "")) continue
    seen.add(link)
    const tags = (title.match(/#[\p{L}\p{N}_]+/gu) || []).slice(0, 5)
    results.push({
      title: title || (tags.length ? tags.join(" ") : "video de TikTok"),
      url: link,
      play: absolutizeTikwmUrl(item?.play),
      cover: absolutizeTikwmUrl(item?.origin_cover || item?.cover),
      author: item?.author?.nickname || ("@" + (item?.author?.unique_id || "")),
      duration: Number(item?.duration) || 0
    })
  }
  return results
}

function tiktokLinksFromHtml(html) {
  const found = new Set()
  for (const m of html.matchAll(/https?:\/\/(?:www\.)?tiktok\.com\/@[\w.\-]+\/video\/\d+/gi)) {
    found.add(m[0].replace(/[)?.,]+$/, ""))
  }
  for (const m of html.matchAll(/[?&]uddg=([^&"'\s]+)/gi)) {
    try {
      const decoded = decodeURIComponent(m[1])
      const hit = decoded.match(/https?:\/\/(?:www\.)?tiktok\.com\/@[\w.\-]+\/video\/\d+/i)
      if (hit) found.add(hit[0].replace(/[)?.,]+$/, ""))
    } catch {}
  }
  return [...found]
}

const MOBILE_UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"

function resultsFromLinks(links) {
  return [...new Set(links)].slice(0, 8).map((link) => {
    const handle = link.match(/tiktok\.com\/(@[\w.\-]+)\//i)?.[1] || ""
    return { title: `video de TikTok ${handle}`, url: link, play: "", cover: "", author: handle, duration: 0 }
  })
}

async function fetchEngine(searchUrl, options) {
  const response = await fetch(searchUrl, {
    method: options?.method || "GET",
    headers: { "accept-language": "es-ES,es;q=0.9", accept: "text/html", ...(options?.headers || {}) },
    body: options?.body,
    signal: AbortSignal.timeout(12000)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const html = await response.text()
  const links = tiktokLinksFromHtml(html)
  if (!links.length) throw new Error("sin enlaces de TikTok en la respuesta")
  return links
}

async function webSearchTiktok(query) {
  const variants = [`site:tiktok.com ${query}`, `${query} site:www.tiktok.com`, `${query} tiktok`]
  const attempts = []
  for (const v of variants) {
    const qs = new URLSearchParams({ q: v }).toString()
    attempts.push(["ddg html", "https://html.duckduckgo.com/html/?" + qs, { headers: { "user-agent": BROWSER_UA } }])
    attempts.push(["ddg html movil", "https://html.duckduckgo.com/html/?" + qs, { headers: { "user-agent": MOBILE_UA } }])
    attempts.push(["ddg lite", "https://lite.duckduckgo.com/lite/?" + qs, { headers: { "user-agent": BROWSER_UA } }])
    attempts.push(["ddg lite movil", "https://lite.duckduckgo.com/lite/?" + qs, { headers: { "user-agent": MOBILE_UA } }])
  }
  attempts.push(["bing", "https://www.bing.com/search?" + new URLSearchParams({ q: `site:tiktok.com ${query}` }), { headers: { "user-agent": BROWSER_UA } }])
  attempts.push(["google", "https://www.google.com/search?" + new URLSearchParams({ q: `site:tiktok.com ${query}`, gbv: "1", hl: "es" }), { headers: { "user-agent": BROWSER_UA } }])
  attempts.push(["mojeek", "https://www.mojeek.com/search?" + new URLSearchParams({ q: `site:tiktok.com ${query}` }), { headers: { "user-agent": BROWSER_UA } }])

  const collected = new Set()
  const errors = []
  const deadline = Date.now() + 70000
  for (const [name, url, options] of attempts) {
    if (Date.now() > deadline) {
      errors.push("tiempo de busqueda agotado")
      break
    }
    try {
      const links = await fetchEngine(url, options)
      links.forEach((l) => collected.add(l))
      if (collected.size >= 5) break
    } catch (e) {
      errors.push(`${name}: ${String(e?.message || e).slice(0, 80)}`)
    }
  }
  if (!collected.size) throw new Error(errors.slice(0, 5).join(" | ") || "sin resultados")
  return resultsFromLinks([...collected])
}

function deepFindItem(node) {
  if (!node || typeof node !== "object") return null
  if (node.video && node.desc !== undefined && node.id) return node
  for (const key of Object.keys(node)) {
    const found = deepFindItem(node[key])
    if (found) return found
  }
  return null
}

async function enrichTiktokResult(result) {
  try {
    const response = await fetch(result.url, {
      headers: { "user-agent": BROWSER_UA, "accept-language": "es-ES,es;q=0.9", referer: "https://www.tiktok.com/" },
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) return result
    const html = await response.text()
    const match = html.match(/__UNIVERSAL_DATA_FOR_REHYDRATION__[^>]*>([\s\S]*?)<\/script>/)
    if (!match) return result
    const data = JSON.parse(match[1])
    const item = deepFindItem(data?.__DEFAULT_SCOPE__ || data)
    if (!item) return result
    const desc = String(item.desc || "").replace(/\s+/g, " ").trim()
    if (desc) result.title = desc.slice(0, 200)
    const handle = item.author?.unique_id || item.author?.uniqueId || ""
    const nickname = item.author?.nickname || ""
    if (handle) result.author = "@" + handle + (nickname && nickname !== handle ? ` (${nickname})` : "")
    const tags = (result.title.match(/#[\p{L}\p{N}_]+/gu) || []).slice(0, 5)
    if (tags.length) result.tags = tags
    const cover = item.video?.cover || item.video?.originCover || item.video?.dynamicCover
    if (cover) result.cover = String(cover).replace(/\\u002F/gi, "/")
    const duration = Number(item.video?.duration) || 0
    if (duration) result.duration = duration
  } catch {}
  return result
}

async function enrichTiktokResults(results) {
  const settled = await Promise.allSettled(results.map((r) => enrichTiktokResult(r)))
  return settled.map((s) => (s.status === "fulfilled" ? s.value : null)).filter(Boolean)
}

async function tiktokSearch(query) {
  const providers = [
    ["tiktok search", () => tikwmSearch(query, "https://www.tikwm.com")],
    ["tiktok search (espejo)", () => tikwmSearch(query, "https://api.tikwm.com")],
    ["buscador web", () => webSearchTiktok(query)]
  ]
  const errors = []
  for (const [name, run] of providers) {
    try {
      const results = await run()
      if (results.length) return results
      errors.push(`${name}: sin resultados`)
    } catch (e) {
      errors.push(`${name}: ${String(e?.message || e).slice(0, 120)}`)
    }
  }
  throw new Error(errors.join(" | "))
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) })
  res.end(body)
}

const server = http.createServer(async (req, res) => {
  let parsed
  try {
    parsed = new URL(req.url, `http://localhost:${port}`)
  } catch {
    sendJson(res, 400, { error: "pedido inválido" })
    return
  }

  if (parsed.pathname === "/health") {
    const ytDlpReady = fs.existsSync(binaryPath) || (await findSystemYtDlp())
    sendJson(res, 200, { ok: true, ytDlp: ytDlpReady, clave: !!getClave(), pot: await pingPotServer() })
    return
  }

  if (parsed.pathname === "/search") {
    const clave = getClave()
    if (clave && parsed.searchParams.get("key") !== clave) {
      sendJson(res, 403, { error: "clave incorrecta" })
      return
    }
    const now = Date.now()
    const rateKey = clave || "anon"
    if (now - (searchRate.get(rateKey) || 0) < 4000) {
      sendJson(res, 200, { ok: false, error: "esper\u00e1 unos segundos entre b\u00fasquedas" })
      return
    }
    searchRate.set(rateKey, now)
    const query = (parsed.searchParams.get("q") || parsed.searchParams.get("keywords") || "").trim().slice(0, 100)
    if (!query) {
      sendJson(res, 200, { ok: false, error: "falta la b\u00fasqueda (?q=)" })
      return
    }
    if (isNsfw(query)) {
      log("b\u00fasqueda bloqueada por contenido no permitido")
      sendJson(res, 200, { ok: false, nsfw: true, error: "no puedo buscar contenido +18 o expl\u00edcito" })
      return
    }
    log(`b\u00fasqueda TikTok: ${query}`)
    tiktokSearch(query)
      .then(async (results) => {
        const enriched = await enrichTiktokResults(results)
        const safe = enriched.filter((r) => !isNsfw(r.title) && !isNsfw(r.author)).slice(0, 5)
        if (!safe.length) {
          sendJson(res, 200, { ok: false, error: "sin resultados" })
          return
        }
        sendJson(res, 200, { ok: true, query, results: safe })
      })
      .catch((e) => {
        sendJson(res, 200, { ok: false, error: String(e?.message || e).slice(0, 300) })
      })
    return
  }

  if (parsed.pathname !== "/download") {
    sendJson(res, 404, { error: "ruta desconocida" })
    return
  }

  const clave = getClave()
  if (clave && parsed.searchParams.get("key") !== clave) {
    sendJson(res, 403, { error: "clave incorrecta" })
    return
  }

  const target = parsed.searchParams.get("url") || ""
  const mode = parsed.searchParams.get("mode") === "audio" ? "audio" : "video"
  let hostname = ""
  try {
    hostname = new URL(target).hostname
  } catch {}
  if (!target.startsWith("http") || !HOSTS_OK.includes(hostname)) {
    sendJson(res, 400, { error: "url no permitida (solo YouTube, TikTok e Instagram)" })
    return
  }

  const id = crypto.randomBytes(4).toString("hex")
  log(`descarga pedida: ${mode} ${target}`)
  const isInstagram = /(^|\.)instagram\.com$/.test(hostname)
  const isYouTube = /(^|\.)youtube\.com$/.test(hostname) || hostname === "youtu.be" || hostname === "www.youtu.be"
  let chain
  if (isInstagram) {
    chain = instagramCrawler(target, id)
      .catch((crawlerError) => {
        log(`método Instagram crawler falló: ${String(crawlerError?.message || crawlerError).slice(0, 150)}`)
        return instagramMobile(target, id)
      })
      .catch((igError) => {
        log(`método Instagram sin login falló: ${String(igError?.message || igError).slice(0, 150)}`)
        return runYtDlp(target, mode, id)
      })
  } else if (isYouTube) {
    chain = ensurePotServer()
      .then(() => runYtDlp(target, mode, id, "tv_embedded"))
      .catch(async (firstError) => {
        const firstMessage = String(firstError?.stderr || firstError?.message || "")
        if (!/sign in to confirm|not a bot|login_required|403|requested format|needs to be reloaded|no video formats|unplayable/i.test(firstMessage)) throw firstError
        const firstLine = (lines) => (lines.find((l) => l.includes("ERROR")) || lines[0] || "").replace(/^ERROR:\s*/, "").trim().slice(0, 160)
        const errores = [firstLine(firstMessage.split("\n"))]
        for (const client of [null, "web_embedded", "android_vr", "ios"]) {
          try {
            log(`cliente tv_embedded falló; reintentando con cliente ${client || "default"}...`)
            return await runYtDlp(target, mode, id, client)
          } catch (clientError) {
            errores.push(firstLine(String(clientError?.stderr || clientError?.message || "").split("\n")))
          }
        }
        throw new Error(errores.filter(Boolean).join(" | "))
      })
  } else {
    chain = runYtDlp(target, mode, id)
  }
  chain
    .then((file) => {
      if (!file) {
        sendJson(res, 200, { ok: false, error: "yt-dlp no generó archivo" })
        return
      }
      const size = fs.statSync(file).size
      const extension = path.extname(file).toLowerCase()
      res.writeHead(200, {
        "Content-Type": CONTENT_TYPES[extension] || "application/octet-stream",
        "Content-Length": size,
        "Content-Disposition": `attachment; filename="zenith_${mode}${extension}"`
      })
      const stream = fs.createReadStream(file)
      stream.pipe(res)
      stream.on("error", () => res.destroy())
      res.on("close", () => cleanDownloads(id))
      log(`enviado: ${path.basename(file)} (${Math.round(size / 1024)} KB)`)
    })
    .catch((e) => {
      cleanDownloads(id)
      const stderr = String(e?.stderr || e?.message || e).trim().split("\n").filter(Boolean).pop() || "error desconocido"
      log(`falló: ${stderr.slice(0, 200)}`)
      sendJson(res, 200, { ok: false, error: stderr.slice(0, 300) })
    })
})

server.on("error", (e) => {
  if (e?.code === "EADDRINUSE") {
    log(`el puerto ${port} ya está ocupado: cerrá otra ventana de ZENITH API que esté abierta y volvé a iniciar`)
  } else {
    log(`error del servidor: ${e?.message || e}`)
  }
  process.exit(1)
})

ensureYtDlp()
  .then(() => {
    ensurePotServer()
    let clave = getClave()
    if (!clave) clave = crearClave()
    server.listen(port, () => {
      console.log("")
      console.log("========================================")
      console.log("  ZENITH API corriendo en esta PC")
      console.log(`  Puerto: ${port}`)
      console.log(`  Clave: ${clave}`)
      console.log("  Dejá esta ventana abierta mientras uses el bot.")
      console.log("========================================")
      console.log("")
    })
  })
  .catch((e) => {
    log(`no se pudo preparar yt-dlp: ${e?.message || e}`)
    process.exit(1)
  })
