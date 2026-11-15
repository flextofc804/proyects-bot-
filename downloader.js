import fs from "fs"
import path from "path"
import https from "https"
import { fileURLToPath } from "url"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)
const root = path.dirname(fileURLToPath(import.meta.url))

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"

function log(tag, message) {
  console.log(`[${tag}] ${message}`)
}

function removeFile(file) {
  try {
    if (file && fs.existsSync(file)) fs.unlinkSync(file)
  } catch (e) {}
}

function uniqueName(kind, extension) {
  return path.join(root, `zenith_${kind}_${Date.now()}_${Math.floor(Math.random() * 100000)}.${extension}`)
}

function request(url, { method = "GET", headers = {}, body = null, redirects = 0, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) {
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
        timeout
      },
      (res) => {
        const status = res.statusCode || 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          resolve(
            request(new URL(res.headers.location, url).toString(), { method, headers, body, redirects: redirects + 1, timeout })
          )
          return
        }
        const chunks = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }))
      }
    )
    req.on("timeout", () => req.destroy(new Error("timeout")))
    req.on("error", reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function downloadToFile(url, destination, headers, minSize = 20000) {
  const { status, body } = await request(url, {
    headers,
    timeout: 120000,
    redirects: 8
  })
  if (status !== 200 && status !== 206) throw new Error(`descarga HTTP ${status}`)
  if (body.length < minSize) throw new Error(`archivo invalido (${body.length} bytes)`)
  const head = body.slice(0, 200).toString("utf8").trim()
  if (head.startsWith("<")) throw new Error("la respuesta no es un archivo de media")
  fs.writeFileSync(destination, body)
  return destination
}

async function resolveRedirect(url, headers) {
  try {
    const { status, headers: responseHeaders } = await request(url, { headers, timeout: 20000 })
    if (status >= 200 && status < 400 && responseHeaders.location) {
      return new URL(responseHeaders.location, url).toString()
    }
    if (status >= 200 && status < 400) return url
  } catch (e) {}
  return url
}

function deepFind(node, predicate, depth = 0) {
  if (!node || typeof node !== "object" || depth > 16) return null
  if (predicate(node)) return node
  const values = Array.isArray(node) ? node : Object.values(node)
  for (const value of values) {
    const found = deepFind(value, predicate, depth + 1)
    if (found) return found
  }
  return null
}

function deepCollect(node, predicate, results = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 16) return results
  if (predicate(node)) results.push(node)
  const values = Array.isArray(node) ? node : Object.values(node)
  for (const value of values) deepCollect(value, predicate, results, depth + 1)
  return results
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

async function ensureFfmpeg() {
  try {
    const mod = await import("ffmpeg-static")
    const candidate = mod.default || mod
    if (candidate && fs.existsSync(candidate)) {
      await execAsync(`"${candidate}" -version`, { timeout: 30000 })
      return candidate
    }
  } catch (e) {}
  try {
    await execAsync("command -v ffmpeg", { timeout: 15000 })
    return "ffmpeg"
  } catch (e) {}
  return null
}

async function normalizeAudio(input) {
  const extension = path.extname(input).toLowerCase()
  if (extension === ".mp3" || extension === ".m4a" || extension === ".mp4") return input
  const ffmpeg = await ensureFfmpeg()
  if (!ffmpeg) return input
  const output = uniqueName("audio", "mp3")
  const binary = ffmpeg === "ffmpeg" ? "ffmpeg" : `"${ffmpeg}"`
  try {
    await execAsync(`${binary} -y -i "${input}" -vn -ar 44100 -ac 2 -b:a 128k "${output}"`, {
      timeout: 180000,
      maxBuffer: 1024 * 1024 * 8
    })
    if (fs.existsSync(output) && fs.statSync(output).size > 2048) {
      removeFile(input)
      return output
    }
  } catch (e) {}
  removeFile(output)
  return input
}

async function tiktokItem(url) {
  const headers = {
    "User-Agent": DESKTOP_UA,
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    Referer: "https://www.tiktok.com/"
  }
  const page = await request(url, { headers, timeout: 30000 })
  if (page.status !== 200) throw new Error(`HTTP ${page.status}`)
  const html = page.body.toString("utf8")
  const cookies = (page.headers["set-cookie"] || [])
    .map((cookieHeader) => String(cookieHeader).split(";")[0])
    .filter(Boolean)
    .join("; ")

  const universal = extractJsonAfter(html, '__UNIVERSAL_DATA_FOR_REHYDRATION__')
  if (universal) {
    const item = deepFind(universal, (node) => node?.video && (node?.author || node?.id))
    if (item) return { item, cookies }
  }

  const sigi = extractJsonAfter(html, 'SIGI_STATE')
  if (sigi) {
    const items = deepCollect(sigi, (node) => node?.video)
    if (items.length > 0) return { item: items[0], cookies }
  }

  const playMatch = html.match(/"playAddr":"([^"]+)"/)
  if (playMatch) {
    return {
      item: {
        video: { playAddr: playMatch[1].replace(/\\u002F/g, "/").replace(/\\u0026/g, "&") },
        desc: (html.match(/"desc":"([^"]*)"/) || [])[1] || ""
      },
      cookies
    }
  }
  throw new Error("no se encontraron datos del video (puede ser privado)")
}

function decodeEscaped(value) {
  return String(value || "")
    .replace(/\\u002F/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
}

export async function tiktokDownload(url) {
  let target = String(url || "").trim()
  if (!/tiktok\.com/i.test(target)) throw new Error("no es un enlace de TikTok")
  if (/\/t\//i.test(target) || /vm\.tiktok\.com|vt\.tiktok\.com/i.test(target)) {
    target = await resolveRedirect(target, { "User-Agent": DESKTOP_UA })
  }
  const { item, cookies } = await tiktokItem(target)
  const cdnHeaders = {
    "User-Agent": DESKTOP_UA,
    Referer: "https://www.tiktok.com/",
    ...(cookies ? { Cookie: cookies } : {})
  }

  const images = deepCollect(item, (node) => typeof node?.imageURL?.urlList?.[0] === "string")
  if (images.length > 0) {
    const files = []
    for (const image of images.slice(0, 10)) {
      try {
        const destination = uniqueName("tiktok", "jpg")
        await downloadToFile(image.imageURL.urlList[0], destination, cdnHeaders, 3000)
        files.push(destination)
      } catch (e) {}
    }
    if (files.length > 0) return { type: "images", files, caption: String(item.desc || "") }
  }

  const video = item.video || {}
  const candidates = [video.playAddr, video.downloadAddr, video.playApi].filter(Boolean)
  if (candidates.length === 0) throw new Error("el video no tiene fuente descargable")

  const errors = []
  for (const source of candidates) {
    const mediaUrl = decodeEscaped(source)
    const destination = uniqueName("tiktok", "mp4")
    try {
      await downloadToFile(mediaUrl, destination, { ...cdnHeaders, Range: "bytes=0-" })
      return {
        type: "video",
        file: destination,
        caption: String(item.desc || ""),
        author: String(item.author?.uniqueId || item.author?.nickname || "")
      }
    } catch (e) {
      errors.push(e?.message || e)
      removeFile(destination)
    }
  }
  throw new Error(`no se pudo descargar el video (${errors.slice(0, 2).join(" | ")})`)
}

function instagramShortcode(url) {
  const match = String(url || "").match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)
  return match ? match[1] : null
}

async function instagramFromEmbed(shortcode) {
  const urls = [
    `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
    `https://www.instagram.com/reel/${shortcode}/embed/captioned/`
  ]
  for (const url of urls) {
    try {
      const page = await request(url, {
        headers: {
          "User-Agent": DESKTOP_UA,
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
          Referer: "https://www.instagram.com/"
        },
        timeout: 30000
      })
      if (page.status !== 200) continue
      const html = page.body.toString("utf8")

      const contextJson = extractJsonAfter(html, "contextJSON")
      if (contextJson) {
        const media = deepFind(contextJson, (node) => node?.videoUrl || node?.video_url || node?.displayUrl || node?.display_url)
        if (media) {
          const videoUrl = decodeEscaped(media.videoUrl || media.video_url || "")
          const imageUrl = decodeEscaped(media.displayUrl || media.display_url || "")
          if (videoUrl) return { type: "video", url: videoUrl }
          if (imageUrl) {
            const images = deepCollect(contextJson, (node) => typeof (node?.displayUrl || node?.display_url) === "string")
              .map((node) => decodeEscaped(node.displayUrl || node.display_url))
            return { type: "image", urls: [...new Set(images)].slice(0, 10) }
          }
        }
      }

      const videoMatch =
        html.match(/"video_url":"([^"]+)"/) ||
        html.match(/property="og:video" content="([^"]+)"/) ||
        html.match(/"videoUrl":"([^"]+)"/)
      if (videoMatch) {
        return { type: "video", url: decodeEscaped(videoMatch[1]) }
      }

      const imageMatch =
        html.match(/property="og:image" content="([^"]+)"/) ||
        html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/)
      if (imageMatch) {
        return { type: "image", urls: [decodeEscaped(imageMatch[1])] }
      }
    } catch (e) {}
  }
  return null
}

async function instagramFromGraphql(shortcode) {
  const lsd = "AVqbxe3J_YA"
  try {
    const response = await request("https://www.instagram.com/graphql/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": DESKTOP_UA,
        "X-IG-App-ID": "936619743392459",
        "X-FB-LSD": lsd,
        "X-ASBD-ID": "129477",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        Origin: "https://www.instagram.com",
        Referer: `https://www.instagram.com/p/${shortcode}/`
      },
      body: JSON.stringify({
        variables: JSON.stringify({
          shortcode,
          fetch_tagged_user_count: null,
          hoisted_comment_id: null,
          hoisted_reply_id: null
        }),
        doc_id: "8845758582119845",
        lsd
      }),
      timeout: 30000
    })
    if (response.status !== 200) return null
    const json = JSON.parse(response.body.toString("utf8"))
    const media = json?.data?.xdt_shortcode_media
    if (!media) return null

    if (media.video_url) return { type: "video", url: decodeEscaped(media.video_url) }

    const children = media.edge_sidecar_to_children?.edges || []
    const urls = children
      .map((edge) => edge?.node?.video_url || edge?.node?.display_url)
      .filter(Boolean)
      .map(decodeEscaped)
    if (urls.length > 0) {
      const hasVideo = children.some((edge) => edge?.node?.video_url)
      return { type: hasVideo ? "video" : "image", urls: [...new Set(urls)].slice(0, 10) }
    }
    if (media.display_url) return { type: "image", urls: [decodeEscaped(media.display_url)] }
  } catch (e) {}
  return null
}

async function instagramFromPage(url) {
  const headers = {
    "User-Agent": DESKTOP_UA,
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "X-IG-App-ID": "936619743392459",
    Referer: "https://www.instagram.com/"
  }
  try {
    const page = await request(url, { headers, timeout: 30000 })
    if (page.status !== 200) return null
    const html = page.body.toString("utf8")

    const ogVideo = html.match(/property="og:video" content="([^"]+)"/) || html.match(/"video_url":"([^"]+)"/)
    if (ogVideo) return { type: "video", url: decodeEscaped(ogVideo[1]) }

    const ogImage = html.match(/property="og:image" content="([^"]+)"/)
    if (ogImage) return { type: "image", urls: [decodeEscaped(ogImage[1])] }

    const displaySources = deepCollect(
      extractJsonAfter(html, "xdt_api__v1__media__shortcode__connection") || {},
      (node) => typeof node?.video_versions?.[0]?.url === "string" || typeof node?.image_versions2?.candidates?.[0]?.url === "string"
    )
    if (displaySources.length > 0) {
      const withVideo = displaySources.find((node) => node.video_versions?.[0]?.url)
      if (withVideo) {
        return { type: "video", url: decodeEscaped(withVideo.video_versions[0].url) }
      }
      const images = displaySources
        .map((node) => node.image_versions2?.candidates?.[0]?.url)
        .filter(Boolean)
        .map(decodeEscaped)
      if (images.length > 0) return { type: "image", urls: [...new Set(images)].slice(0, 10) }
    }
  } catch (e) {}
  return null
}

export async function instagramDownload(url) {
  let target = String(url || "").trim().split("?")[0]
  if (!/instagram\.com/i.test(target)) throw new Error("no es un enlace de Instagram")
  if (/instagram\.com\/share\//i.test(target) || /instagram\.com\/reels?\/?$/i.test(target)) {
    target = await resolveRedirect(target, { "User-Agent": DESKTOP_UA })
    target = target.split("?")[0]
  }
  const shortcode = instagramShortcode(target)
  if (!shortcode) throw new Error("no pude leer el código del post")

  const found =
    (await instagramFromGraphql(shortcode)) ||
    (await instagramFromEmbed(shortcode)) ||
    (await instagramFromPage(target))
  if (!found) throw new Error("no se encontró media (el post puede ser privado)")

  const headers = {
    "User-Agent": DESKTOP_UA,
    Referer: "https://www.instagram.com/",
    Accept: "*/*"
  }

  if (found.type === "video" && found.url) {
    const destination = uniqueName("instagram", "mp4")
    await downloadToFile(found.url, destination, headers)
    return { type: "video", file: destination }
  }

  const urls = found.urls || [found.url].filter(Boolean)
  const files = []
  for (const imageUrl of urls.slice(0, 10)) {
    try {
      const destination = uniqueName("instagram", "jpg")
      await downloadToFile(imageUrl, destination, headers, 3000)
      files.push(destination)
    } catch (e) {}
  }
  if (files.length === 0) throw new Error("no se pudo descargar la imagen")
  return { type: "images", files }
}

export { normalizeAudio, removeFile, uniqueName, tiktokItem, downloadToFile }
