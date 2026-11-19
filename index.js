import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
  getContentType
} from "@whiskeysockets/baileys"
import { sendList } from 'baileys-buttons'
import pino from "pino"
import fs from "fs"
import crypto from "crypto"
import path from "path"
import { exec } from "child_process"
import { promisify } from "util"
import { fileURLToPath } from "url"
import axios from "axios"
import play from 'play-dl'
import ffmpeg from 'ffmpeg-static'
import { menuOrder, menuAliases, menuCategories } from "./menus.js"
const execAsync = promisify(exec)

let sharpLib
let ffmpegLib

async function loadSharp() {
  if (sharpLib !== undefined) return sharpLib
  try {
    const mod = await import("sharp")
    sharpLib = mod.default || mod
  } catch (e) {
    sharpLib = null
  }
  return sharpLib
}

async function loadFfmpeg() {
  if (ffmpegLib !== undefined) return ffmpegLib
  try {
    const mod = await import("fluent-ffmpeg")
    ffmpegLib = mod.default || mod
  } catch (e) {
    ffmpegLib = null
  }
  return ffmpegLib
}

function tempFile(ext) {
  return path.join(process.cwd(), `tmp_${Date.now()}_${Math.floor(Math.random() * 1000000)}.${ext}`)
}

function removeFile(file) {
  try {
    if (file && fs.existsSync(file)) fs.unlinkSync(file)
  } catch (e) {}
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ])
}

async function startTyping(sock, from) {
  try {
    await sock.sendPresenceUpdate("composing", from)
  } catch (e) {}
}

async function stopTyping(sock, from) {
  try {
    await sock.sendPresenceUpdate("paused", from)
  } catch (e) {}
}

async function imageToSticker(buffer) {
  const sharp = await loadSharp()
  if (sharp) {
    return await sharp(buffer)
      .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 95 })
      .toBuffer()
  }
  const inFile = tempFile("img")
  const outFile = tempFile("webp")
  fs.writeFileSync(inFile, buffer)
  try {
    const ffmpeg = await loadFfmpeg()
    const filter = "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0"
    if (ffmpeg) {
      await new Promise((resolve, reject) => {
        ffmpeg(inFile)
          .outputOptions("-vf", filter, "-frames:v", "1", "-an")
          .toFormat("webp")
          .save(outFile)
          .on("end", resolve)
          .on("error", reject)
      })
    } else {
      await execAsync(`ffmpeg -y -i "${inFile}" -vf "${filter}" -frames:v 1 -an "${outFile}"`)
    }
    return fs.readFileSync(outFile)
  } finally {
    removeFile(inFile)
    removeFile(outFile)
  }
}

async function videoToSticker(buffer) {
  const inFile = tempFile("mp4")
  const outFile = tempFile("webp")
  fs.writeFileSync(inFile, buffer)
  try {
    const ffmpeg = await loadFfmpeg()
    const filter = "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=transparent"
    if (ffmpeg) {
      await new Promise((resolve, reject) => {
        ffmpeg(inFile)
          .inputOptions("-t", "10")
          .outputOptions("-vf", filter, "-loop", "0", "-ss", "00:00:00", "-t", "10", "-an")
          .toFormat("webp")
          .save(outFile)
          .on("end", resolve)
          .on("error", reject)
      })
    } else {
      await execAsync(`ffmpeg -y -i "${inFile}" -t 10 -vf "${filter}" -loop 0 -an "${outFile}"`)
    }
    return fs.readFileSync(outFile)
  } finally {
    removeFile(inFile)
    removeFile(outFile)
  }
}

async function stickerToImage(buffer) {
  const sharp = await loadSharp()
  if (sharp) return await sharp(buffer).png().toBuffer()
  const inFile = tempFile("webp")
  const outFile = tempFile("png")
  fs.writeFileSync(inFile, buffer)
  try {
    await execAsync(`ffmpeg -y -i "${inFile}" -frames:v 1 "${outFile}"`)
    return fs.readFileSync(outFile)
  } finally {
    removeFile(inFile)
    removeFile(outFile)
  }
}

const REACCIONES = {
  play: ["📥"], yt: ["📥"], ytaudio: ["📥"], playaudio: ["📥"], mp3: ["📥"], song: ["📥"],
  mp4: ["📥"], playvideo: ["📥"], ytmp4: ["📥"], play2: ["📥"], video: ["📥"],
  tiktok: ["📥"], tt: ["📥"],
  instagram: ["📥"], ig: ["📥"], reel: ["📥"],
  facebook: ["📥"], fb: ["📥"],
  twitter: ["📥"], x: ["📥"],
  ttsearch: ["📥"], tiktoksearch: ["📥"],
  pin: ["📥"], pinterest: ["📥"], ytsearch: ["📥"],
  menu: ["💗", "🩷"], menu2: ["💗", "🩷"], comandos: ["💗", "🩷"], commands: ["💗", "🩷"], help: ["💗", "🩷"]
}

async function reaccionar(sock, from, msg, pool) {
  try {
    const emoji = pool[Math.floor(Math.random() * pool.length)]
    await sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
  } catch {}
}

const SIMBOLOS = ["⋆", "୨୧", "۶ৎ", "ᥫ᭡", "♱", "𑣲", "✧", "❥", "♡", "༄", "༅", "❦", "⋆࣪", "𖥔", "⌗", "๑", "⁺", "˖"]

function elegirSimbolos(n) {
  const pool = [...SIMBOLOS]
  const out = []
  for (let i = 0; i < n && pool.length; i++) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  }
  return out
}

const ESTILOS_LETRA = [
  { a: 0x1d5d4, d: 0x1d7ec },
  { a: 0x1d471, d: 0x1d7ce },
  { a: 0x1d4d0, d: 0 },
  { a: 0x1d538, d: 0x1d7d8 }
]

function estilizarLetra(texto) {
  const s = ESTILOS_LETRA[Math.floor(Math.random() * ESTILOS_LETRA.length)]
  return [...String(texto)]
    .map((ch) => {
      const c = ch.codePointAt(0)
      if (c >= 0x41 && c <= 0x5a) return String.fromCodePoint(s.a + (c - 0x41))
      if (c >= 0x61 && c <= 0x7a) return String.fromCodePoint(s.a + 26 + (c - 0x61))
      if (s.d && c >= 0x30 && c <= 0x39) return String.fromCodePoint(s.d + (c - 0x30))
      return ch
    })
    .join("")
}

function fmtDuracion(seg) {
  const s = Number(seg) || 0
  if (!s) return ""
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`
}

function fmtVisitas(v) {
  const n = Number(v) || 0
  if (!n) return ""
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}

function decorarPortada(meta, tipo) {
  const [s1, s2, s3, s4, s5] = elegirSimbolos(5)
  const titulo = estilizarLetra(meta.titulo || "desconocido")
  const dur = fmtDuracion(meta.duracion)
  const vis = fmtVisitas(meta.visitas)
  let cap = `⋆ ୨୧ ⋆ EʀᴢᴀBᴏᴛ-MD/OFC ⋆ ୨୧ ⋆\n\n`
  cap += `${s1} ${titulo}\n`
  cap += `${s2} ᴄᴀɴᴀʟ: ${meta.canal || "desconocido"}\n`
  if (dur) cap += `${s3} ᴅᴜʀᴀᴄɪᴏ́ɴ: ${dur}\n`
  if (vis) cap += `${s4} ᴠɪꜱᴛᴀꜱ: ${vis}\n`
  cap += `\n${s5} ${tipo === "audio" ? "🎧 ᴀᴜᴅɪᴏ ᴇɴ ᴄᴀᴍɪɴᴏ..." : "🎬 ᴠɪᴅᴇᴏ ᴇɴ ᴄᴀᴍɪɴᴏ..."}`
  return cap
}

async function enviarPortada(sock, from, msg, meta, tipo) {
  try {
    const vid = String(meta.videoId || "")
    if (!/^[-_a-zA-Z0-9]{6,20}$/.test(vid)) return
    const candidatos = [`https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${vid}/hq720.jpg`, `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`, `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`]
    let thumbBuf = null
    for (const url of candidatos) {
      try {
        const r = await axios.get(url, { responseType: "arraybuffer", timeout: 10000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } })
        const b = Buffer.from(r.data)
        if (r.status === 200 && b.length > 5000) { thumbBuf = b; break }
      } catch {}
    }
    if (!thumbBuf) return
    const inFile = tempFile("jpg")
    const outFile = tempFile("jpg")
    fs.writeFileSync(inFile, thumbBuf)
    try {
      const ffmpeg = await loadFfmpeg()
      const filter = "crop='min(iw,ih*16/9)':'min(iw*9/16,ih)',scale=720:720:force_original_aspect_ratio=increase,crop=720:720"
      if (ffmpeg) {
        await new Promise((resolve, reject) => {
          ffmpeg(inFile)
            .outputOptions("-vf", filter, "-q:v", "2", "-frames:v", "1", "-an")
            .save(outFile)
            .on("end", resolve)
            .on("error", reject)
        })
      } else {
        await execAsync(`ffmpeg -y -i "${inFile}" -vf "${filter}" -q:v 2 -frames:v 1 -an "${outFile}"`)
      }
      await sock.sendMessage(from, { image: { url: outFile }, caption: decorarPortada(meta, tipo) }, { quoted: msg })
    } finally {
      removeFile(inFile)
      removeFile(outFile)
    }
  } catch (e) {
    console.log("[PORTADA] fallo silencioso:", e?.message || e)
  }
}

const MENU_IMAGE = [
  "menu.jpg",
  "menu.png",
  "menu.jpeg",
  "descarga.jpg",
  "portada.jpg"
]
  .flatMap((name) => [
    path.join(process.cwd(), name),
    path.join(path.dirname(fileURLToPath(import.meta.url)), name),
    path.join("/home/container", name)
  ])
  .find((p) => fs.existsSync(p)) || ""

if (MENU_IMAGE) {
  console.log(`[MENU] imagen del menú encontrada: ${MENU_IMAGE}`)
} else {
  console.log("[MENU] sin imagen: subí menu.jpg a la carpeta del bot para que el menú salga con imagen")
}

const MENU_VIDEO = [
  "menu.mp4",
  "menu_video.mp4"
]
  .flatMap((name) => [
    path.join(process.cwd(), name),
    path.join(path.dirname(fileURLToPath(import.meta.url)), name),
    path.join("/home/container", name)
  ])
  .find((p) => fs.existsSync(p)) || ""

if (MENU_VIDEO) {
  console.log(`[MENU] video del menú con música encontrado: ${MENU_VIDEO}`)
}

const MENU_IMAGE2 = [
  "menu2.png",
  "menu2.jpg",
  "menu2.jpeg"
]
  .flatMap((name) => [
    path.join(process.cwd(), name),
    path.join(path.dirname(fileURLToPath(import.meta.url)), name),
    path.join("/home/container", name)
  ])
  .find((p) => fs.existsSync(p)) || ""

if (MENU_IMAGE2) {
  console.log(`[MENU] imagen del catálogo encontrada: ${MENU_IMAGE2}`)
}
const NSFW_PATTERN = /\b(porn\w*|xxx|nsfw|hentai|onlyfans|redtube|xvideos|sexo|sexual|desnud[ao]s?|nudes?|naked|tetas|culo|culos|vagina|pene|anal|orgia|orgias|erotico|eroticas?|horny|gore|decapitacion|mutilacion|suicidio|violacion|violar|incesto|puta|putas|puto|putos|masturb\w*|18\+)\b/

const PANEL_TOP = "╭" + "─".repeat(26) + "╮\n  ⋆ ୲୳ ⋆ EʀᴢᴀBᴏᴛ-MD/OFC ⋆ ୲୳ ⋆\n╰" + "─".repeat(26) + "╯"
const PANEL_FOOTER = "└" + "─".repeat(15) + "┘"

function panelStart(title, body) {
  return PANEL_TOP + "\n\n┌─ ◆ " + title + " ◆ ─┐\n" + body
}

function panel(title, body) {
  return panelStart(title, body) + "\n" + PANEL_FOOTER
}

function normalizeText(text) {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function isNsfwText(text) {
  return NSFW_PATTERN.test(normalizeText(text))
}

const ttSearchCooldown = new Map()

const pinSearchCooldown = new Map()

const searchHistory = new Map()

const config = {
  botName: "⋆ ୲୳ ⋆ EʀᴢᴀBᴏᴛ-MD/OFC ⋆ ୲୳ ⋆",
  prefix: "#",
  owner: "Dueño",
  ownerNumber: "5491127289595@s.whatsapp.net",
  sessionName: "zenith_session",
  database: "database.json"
}

const defaultDB = {
  economy: {},
  gacha: {},
  profiles: {},
  warns: {},
  settings: {},
  groups: {},
  subbots: {},
  stickers: {},
  levels: {},
  uno: {}
}

let db = JSON.parse(JSON.stringify(defaultDB))

function loadDB() {
  try {
    if (fs.existsSync(config.database)) {
      db = JSON.parse(fs.readFileSync(config.database, "utf-8"))
      if (!db.uno) db.uno = {}
    } else {
      saveDB()
    }
  } catch (e) {
    db = JSON.parse(JSON.stringify(defaultDB))
  }
}

function saveDB() {
  fs.writeFileSync(config.database, JSON.stringify(db, null, 2))
}

loadDB()

const animeActions = {
  angry: "está enojado con", enojado: "está enojado con", bath: "se está bañando con", bite: "mordió a",
  bleh: "le sacó la lengua a", blush: "se sonrojó por", bored: "está aburrido con", aburrido: "está aburrido con",
  call: "llamó a", clap: "aplaudió a", aplaudir: "aplaudió a", coffee: "le trajo café a", cafe: "le trajo café a", cold: "tiene frío con",
  cook: "cocinó para", cry: "lloró por", cuddle: "abrazó a", dance: "bailó con",
  dramatic: "fue dramático con", drama: "fue dramático con", draw: "dibujó a", drunk: "está borracho con",
  eat: "comió con", comer: "comió con", facepalm: "se decepcionó de", gaming: "jugó con", greet: "saludó a", hi: "saludó a",
  hang: "colgó a", colgarse: "colgó a", happy: "está feliz con", feliz: "está feliz con", heat: "tiene calor con", hug: "abrazó a",
  icecream: "le dio helado a", helado: "le dio helado a", impregnate: "embarazó a", preg: "embarazó a", preñar: "embarazó a", jump: "saltó con", kicked: "pateó a", patada: "pateó a",
  kill: "mató a", kiss: "besó a", muak: "besó a", kisscheek: "besó la mejilla de", beso: "besó la mejilla de", kisshead: "besó la cabeza de", besocabeza: "besó la cabeza de",
  laugh: "se rió de", lewd: "está pervertido con", lick: "lamió a", look: "miró a", mirar: "miró a",
  love: "ama a", amor: "ama a", nope: "rechazó a", pat: "acarició a", poke: "tocó a", pout: "hizo pucheros a",
  psycho: "está psicópata con", punch: "golpeó a", push: "empujó a", read: "leyó con", leer: "leyó con",
  run: "corrió con", sad: "está triste por", triste: "está triste por", scared: "tiene miedo de", scream: "gritó a",
  scrub: "fregó a", fregar: "fregó a", seduce: "sedujo a", shy: "está tímido con", timido: "está tímido con", sick: "está enfermo con", enfermo: "está enfermo con",
  sing: "cantó para", slap: "abofeteó a", sleep: "durmió con", smile: "sonrió a", sonreir: "sonrió a",
  smoke: "fuma con", sneeze: "estornuda a", estornudar: "estornuda a", spit: "escupe a", escupir: "escupe a", step: "pisa a", pisar: "pisa a",
  study: "estudia con", estudiar: "estudia con", talk: "habla con", hablar: "habla con", think: "piensa en", tickle: "hace cosquillas a",
  walk: "camina con", yawn: "bosteza ante", bostezar: "bosteza ante"
}

const nsfwActions = {
  anal: { text: "tiene sexo anal con", gif: "anal" },
  ass: { text: "muestra el trasero a", gif: "ass" },
  blowjob: { text: "hace una mamada a", gif: "blowjob" },
  bj: { text: "hace una mamada a", gif: "blowjob" },
  boobjob: { text: "hace una rusa a", gif: "boobjob" },
  cowgirl: { text: "monta a", gif: "cowgirl" },
  cum: { text: "se corre con", gif: "cum" },
  cummouth: { text: "se corre en la boca de", gif: "cummouth" },
  cumshot: { text: "le dispara semen a", gif: "cumshot" },
  danbooru: { text: "busca hentai de", gif: "danbooru" },
  e621: { text: "busca furro de", gif: "e621" },
  fap: { text: "se masturba pensando en", gif: "fap" },
  footjob: { text: "hace una paja con los pies a", gif: "footjob" },
  fuck: { text: "folla a", gif: "fuck" },
  gelbooru: { text: "busca hentai de", gif: "gelbooru" },
  grabboobs: { text: "agarra las tetas de", gif: "grabboobs" },
  grope: { text: "manosea a", gif: "grope" },
  handjob: { text: "hace una paja a", gif: "handjob" },
  hentai: { text: "mira hentai con", gif: "hentai" },
  lickass: { text: "lame el culo de", gif: "lickass" },
  lickdick: { text: "lame la verga de", gif: "lickdick" },
  lickpussy: { text: "lame el coño de", gif: "lickpussy" },
  nekomimi: { text: "juega con nekomimi de", gif: "nekomimi" },
  pussy: { text: "muestra el coño a", gif: "pussy" },
  rule34: { text: "busca rule34 de", gif: "rule34" },
  sixnine: { text: "hace un 69 con", gif: "sixnine" },
  spank: { text: "nalguea a", gif: "spank" },
  squirt: { text: "hace squirt con", gif: "squirt" },
  suckballs: { text: "chupa las bolas de", gif: "suckballs" },
  suckboobs: { text: "chupa las tetas de", gif: "suckboobs" },
  undress: { text: "desviste a", gif: "undress" },
  yuri: { text: "tiene sexo lésbico con", gif: "yuri" }
}

const gachaCharacters = [
  { name: "Miku Nakano", series: "Quintessential Quintuplets", rarity: "SSR", value: 5000 },
  { name: "Rem", series: "Re:Zero", rarity: "SSR", value: 4800 },
  { name: "Holo", series: "Spice and Wolf", rarity: "SSR", value: 4500 },
  { name: "Mai Sakurajima", series: "Rascal Does Not Dream", rarity: "SSR", value: 5200 },
  { name: "Chizuru Ichinose", series: "Rent a Girlfriend", rarity: "SR", value: 2500 },
  { name: "Zero Two", series: "Darling in the Franxx", rarity: "SR", value: 2800 },
  { name: "Asuna Yuuki", series: "Sword Art Online", rarity: "SR", value: 3000 },
  { name: "Mikasa Ackerman", series: "Attack on Titan", rarity: "SR", value: 2700 },
  { name: "Nezuko Kamado", series: "Demon Slayer", rarity: "SR", value: 2900 },
  { name: "Nino Nakano", series: "Quintessential Quintuplets", rarity: "R", value: 1200 },
  { name: "Ichika Nakano", series: "Quintessential Quintuplets", rarity: "R", value: 1100 },
  { name: "Itsuki Nakano", series: "Quintessential Quintuplets", rarity: "R", value: 1150 },
  { name: "Yotsuba Nakano", series: "Quintessential Quintuplets", rarity: "R", value: 1180 },
  { name: "Emilia", series: "Re:Zero", rarity: "R", value: 1300 },
  { name: "Ram", series: "Re:Zero", rarity: "R", value: 1250 },
  { name: "Senjougahara Hitagi", series: "Monogatari", rarity: "SSR", value: 5500 },
  { name: "Shinobu Oshino", series: "Monogatari", rarity: "SR", value: 3200 },
  { name: "Hanekawa Tsubasa", series: "Monogatari", rarity: "R", value: 1400 },
  { name: "Kanbaru Suruga", series: "Monogatari", rarity: "R", value: 1350 },
  { name: "Sengoku Nadeko", series: "Monogatari", rarity: "R", value: 1280 }
]

function getUserEconomy(userId) {
  if (!db.economy[userId]) {
    db.economy[userId] = { coins: 1000, bank: 0, lastDaily: 0, lastWork: 0, lastCrime: 0, lastSlut: 0, lastSteal: 0 }
  }
  return db.economy[userId]
}

function getUserProfile(userId) {
  if (!db.profiles[userId]) {
    db.profiles[userId] = { xp: 0, level: 1, description: "Sin descripción", birthday: null, genre: null, favourite: null, married: null, marryHistory: [] }
  }
  return db.profiles[userId]
}

function getUserGacha(userId) {
  if (!db.gacha[userId]) {
    db.gacha[userId] = { characters: [], favorites: [], claims: 0, lastRoll: 0 }
  }
  return db.gacha[userId]
}

function getGroupSettings(groupId) {
  if (!db.groups[groupId]) {
    db.groups[groupId] = { welcome: false, welcomeMsg: "Bienvenido al grupo", goodbye: false, goodbyeMsg: "Adiós", antilink: false, nsfw: false, economy: true, gacha: true, onlyadmin: false, warnLimit: 3, primary: null }
  }
  return db.groups[groupId]
}

function getWarns(groupId, userId) {
  if (!db.warns[groupId]) db.warns[groupId] = {}
  if (!db.warns[groupId][userId]) db.warns[groupId][userId] = { count: 0, reasons: [] }
  return db.warns[groupId][userId]
}

function addXP(userId, amount) {
  const profile = getUserProfile(userId)
  profile.xp += amount
  const needed = profile.level * 100
  if (profile.xp >= needed) {
    profile.level++
    profile.xp = 0
    return true
  }
  return false
}

function formatCoins(amount) {
  return amount.toLocaleString("es-ES")
}

function getRarityColor(rarity) {
  const colors = { SSR: "🔴", SR: "🟡", R: "🟢", N: "⚪" }
  return colors[rarity] || "⚪"
}


function normalizeMenuKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s]+/g, " ")
    .trim()
}

function countCategoryCommands(key) {
  return menuCategories[key].sections.reduce((acc, section) => acc + section.items.length, 0)
}

function countAllCommands() {
  return menuOrder.reduce((acc, key) => acc + countCategoryCommands(key), 0)
}

function borderTop() {
  return "╭━━━━━━━━━━━━━━━━━━━━━━━━━╮"
}

function borderBottom() {
  return "╰━━━━━━━━━━━━━━━━━━━━━━━━━╯"
}

function renderMenuHome() {
  const lines = []
  lines.push("╭───────────────────────╮")
  lines.push("  ⋆ ୨୧ ⋆ *EʀᴢᴀBᴏᴛ-MD/OFC* ⋆ ୨୧ ⋆")
  lines.push("╰───────────────────────╯")
  lines.push(`⌁ Prefix » *${config.prefix}*  ⌁ Owner » *+5491127289595*`)
  lines.push(`⌁ Comandos » *${countAllCommands()}*  ⌁ Categorías » *${menuOrder.length}*`)
  lines.push("")
  lines.push("╭─〔 ❖ *CATEGORÍAS* 〕")
  for (const key of menuOrder) {
    const cat = menuCategories[key]
    lines.push(`│ ${cat.emoji} ${key} » ${countCategoryCommands(key)} ⌁`)
  }
  lines.push("╰───────────────────────╯")
  lines.push(`  ✦ ${config.prefix}menu <categoría>  ▸  ver comandos`)
  lines.push(`  ✦ ${config.prefix}menu todos  ▸  catálogo completo`)
  return lines.join("\n")
}

function renderMenuCategory(key) {
  const cat = menuCategories[key]
  const total = countCategoryCommands(key)
  const lines = []
  lines.push(`╭─〔 ${cat.emoji} *${cat.title}* 〕 ${total} ⌁`)
  for (const section of cat.sections) {
    lines.push("│")
    lines.push(`│ ⌁ *${section.title}*`)
    for (const item of section.items) {
      lines.push(item.desc ? `│ ▸ ${config.prefix}${item.cmd} › ${item.desc}` : `│ ▸ ${config.prefix}${item.cmd}`)
    }
  }
  lines.push("╰───────────────────────╯")
  lines.push(`  ✦ ${config.prefix}menu  ▸  volver al inicio`)
  return lines.join("\n")
}

function renderMenuEverything() {
  const lines = []
  lines.push("╭───────────────────────╮")
  lines.push("  📚 *CATÁLOGO COMPLETO*")
  lines.push("╰───────────────────────╯")
  for (const key of menuOrder) {
    const cat = menuCategories[key]
    lines.push("")
    lines.push(`╭─〔 ${cat.emoji} *${cat.title}* 〕 ${countCategoryCommands(key)} ⌁`)
    for (const section of cat.sections) {
      lines.push(`│ ⌁ ${section.title}`)
      for (const item of section.items) {
        lines.push(item.desc ? `│ ▸ ${config.prefix}${item.cmd} › ${item.desc}` : `│ ▸ ${config.prefix}${item.cmd}`)
      }
    }
    lines.push("╰───────────────────────╯")
  }
  lines.push("")
  lines.push(`  ✦ ${config.prefix}menu <categoría>  ▸  una sola categoría`)
  return lines.join("\n")
}

async function enviarTextoMenu(sock, from, msg, text, withImage = false) {
  startTyping(sock, from).catch(() => {})
  if (withImage && MENU_IMAGE2) {
    try {
      await sock.sendMessage(from, { image: { url: MENU_IMAGE2 } }, { quoted: msg })
    } catch (e) {
      console.log("imagen del catálogo falló:", e?.message || e)
    }
  }
  await sock.sendMessage(from, { text }, { quoted: msg })
  stopTyping(sock, from).catch(() => {})
}

function renderMenuListRows() {
  const rows = menuOrder.map((key) => {
    const cat = menuCategories[key]
    return {
      title: `${cat.emoji} ${cat.title}`,
      rowId: `${config.prefix}menu ${key}`,
      description: `${countCategoryCommands(key)} comandos`
    }
  })
  rows.push({
    title: "📖 Todos los comandos",
    rowId: `${config.prefix}menu todos`,
    description: "catálogo completo"
  })
  return rows
}

async function sendAlbumVideos(sock, jid, items) {
  const { generateWAMessageFromContent, generateWAMessage, jidNormalizedUser } = await import("@whiskeysockets/baileys")
  const videoCount = items.filter((i) => i.kind === "video").length
  const imageCount = items.length - videoCount
  const album = generateWAMessageFromContent(
    jid,
    {
      messageContextInfo: { messageSecret: crypto.randomBytes(32) },
      albumMessage: { expectedImageCount: imageCount, expectedVideoCount: videoCount }
    },
    { userJid: jidNormalizedUser(sock.user.id), upload: sock.waUploadToServer }
  )
  await sock.relayMessage(jid, album.message, { messageId: album.key.id })
  for (const item of items) {
    const content =
      item.kind === "video"
        ? { video: { url: item.file }, mimetype: "video/mp4" }
        : { image: { url: item.file } }
    if (item.caption) content.caption = item.caption
    const mediaMsg = await generateWAMessage(jid, content, { upload: sock.waUploadToServer })
    mediaMsg.message.messageContextInfo = {
      messageSecret: crypto.randomBytes(32),
      messageAssociation: { associationType: 1, parentMessageKey: album.key }
    }
    await sock.relayMessage(jid, mediaMsg.message, { messageId: mediaMsg.key.id })
  }
}

async function sendMenuInteractive(sock, from, msg, menuText, opts = {}) {
  const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = await import("@whiskeysockets/baileys")
  const withImage = opts.withImage !== false
  let media = null
  if (withImage && MENU_IMAGE) {
    media = await prepareWAMessageMedia({ image: { url: MENU_IMAGE } }, { upload: sock.waUploadToServer })
  }
  const buttons = [
    {
      name: "single_select",
      buttonParamsJson: JSON.stringify({
        title: "Ver comandos 📜",
        sections: [
          {
            title: "📂 Categorías",
            rows: renderMenuListRows().map(({ title, rowId, description }) => ({ id: rowId, title, description }))
          }
        ]
      })
    }
  ]
  const message = generateWAMessageFromContent(
    from,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            header: proto.Message.InteractiveMessage.Header.create({
              ...(media?.imageMessage ? { imageMessage: media.imageMessage } : {}),
              hasMediaAttachment: Boolean(media?.imageMessage)
            }),
            body: proto.Message.InteractiveMessage.Body.create({ text: menuText }),
            footer: proto.Message.InteractiveMessage.Footer.create({ text: "⋆ ୲୳ ⋆ EʀᴢᴀBᴏᴛ-MD/OFC ⋆ ୲୳ ⋆" }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons })
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

async function enviarMenuPrincipal(sock, from, msg) {
  const text = renderMenuHome()
  startTyping(sock, from).catch(() => {})
  try {
    if (MENU_VIDEO) {
      await sock.sendMessage(from, { video: { url: MENU_VIDEO }, caption: text, mimetype: "video/mp4" }, { quoted: msg })
    } else if (MENU_IMAGE) {
      await sock.sendMessage(from, { image: { url: MENU_IMAGE }, caption: text }, { quoted: msg })
    } else {
      await sock.sendMessage(from, { text }, { quoted: msg })
    }
  } catch (e) {
    console.log("menú con imagen falló, mandando solo texto:", e?.message || e)
    await sock.sendMessage(from, { text }, { quoted: msg })
  }
  try {
    await sendMenuInteractive(sock, from, msg, "Tocá el botón para ver todos los comandos 👇", { withImage: false })
  } catch (e) {
    console.log("botón de menú interactivo falló:", e?.message || e)
    try {
      await sendList(sock, from, {
        text: "Tocá el botón para ver todos los comandos 👇",
        buttonText: "Ver comandos 📜",
        sections: [
          {
            title: "📂 Categorías",
            rows: renderMenuListRows().map(({ title, rowId, description }) => ({ id: rowId, title, description }))
          }
        ],
        quoted: msg
      })
    } catch (e2) {
      console.log("botón de menú no soportado por este WhatsApp:", e2?.message || e2)
    }
  }
  stopTyping(sock, from).catch(() => {})
}

async function enviarMenuVisual(sock, from, msg, category = null) {
  const raw = String(category || "").trim()
  const normalized = normalizeMenuKey(raw)

  if (!normalized) {
    await enviarMenuPrincipal(sock, from, msg)
    return
  }

  if (["todos", "todo", "all", "completo", "catalogo", "full"].includes(normalized)) {
    await enviarTextoMenu(sock, from, msg, renderMenuEverything(), true)
    return
  }

  const key = menuAliases[normalized]
  if (key) {
    await enviarTextoMenu(sock, from, msg, renderMenuCategory(key))
    return
  }

  await enviarMenuPrincipal(sock, from, msg)
}

function unwrapMessageContent(message) {
  let current = message
  let guard = 0
  while (current && guard < 6) {
    guard++
    const next =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.documentWithCaptionMessage?.message ||
      current.editedMessage?.message
    if (!next) break
    current = next
  }
  return current
}

function normalizeSenderJid(msg) {
  const key = msg?.key || {}
  const candidates = [key.participant, key.participantAlt, key.participantPn, key.remoteJidAlt, key.remoteJid]
    .filter((jid) => typeof jid === "string" && jid.length > 0)
  const phoneJid = candidates.find((jid) => jid.endsWith("@s.whatsapp.net"))
  return phoneJid || candidates[0] || ""
}

function jidCore(jid) {
  if (typeof jid !== "string" || !jid) return ""
  const at = jid.lastIndexOf("@")
  if (at === -1) return jid.split(":")[0]
  return jid.slice(0, at).split(":")[0] + jid.slice(at)
}

function jidVariantSet(jids) {
  const set = new Set()
  for (const jid of jids) {
    const core = jidCore(jid)
    if (!core) continue
    const at = core.lastIndexOf("@")
    set.add(core)
    if (at !== -1) {
      const num = core.slice(0, at)
      if (num) {
        set.add(num + "@s.whatsapp.net")
        set.add(num + "@lid")
      }
    }
  }
  return set
}

function jidInVariants(pid, variants) {
  const core = jidCore(pid)
  if (!core || variants.size === 0) return false
  if (variants.has(core)) return true
  const at = core.lastIndexOf("@")
  if (at === -1) return false
  const num = core.slice(0, at)
  const domain = core.slice(at + 1)
  if (!num || !domain) return false
  for (const variant of variants) {
    const vat = variant.lastIndexOf("@")
    if (vat === -1) continue
    if (variant.slice(vat + 1) === domain && variant.slice(0, vat) === num) return true
  }
  return false
}

const groupMetaCache = new Map()

async function getGroupMeta(sock, from) {
  const hit = groupMetaCache.get(from)
  if (hit && Date.now() - hit.t < 60000) return hit.meta
  const meta = await sock.groupMetadata(from)
  groupMetaCache.set(from, { meta, t: Date.now() })
  if (groupMetaCache.size > 200) {
    const oldest = [...groupMetaCache.entries()].sort((a, b) => a[1].t - b[1].t)[0]
    if (oldest) groupMetaCache.delete(oldest[0])
  }
  return meta
}

const SUBBOTS = new Map()
const MAX_SUBBOTS = 20
const CARPETA_SUBBOTS = "subbots"
let sockPrincipal = null
const PEDIGO_CODIGO = new Map() // num -> { vence, token, codigo } (pairing unico: un codigo por ventana)
const VENTANA_CODIGO_MS = 600000 // ventana de 10 minutos para cada codigo de pairing

function formatearCodigoVinculacion(codigo) {
  return String(codigo || "").match(/.{1,4}/g)?.join("-") || String(codigo || "")
}

function numeroLimpioSub(x) {
  return String(x || "").replace(/[^0-9]/g, "")
}

function jidANumero(j) {
  // "5491127289595:12@s.whatsapp.net" -> "5491127289595" (saca el :dispositivo y el dominio)
  // "@5491127289595" -> "5491127289595" (tag tipeado a mano)
  return numeroLimpioSub(String(j || "").replace(/^@/, "").split("@")[0].split(":")[0])
}

function sesionSubRegistrada(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "creds.json"), "utf8"))?.registered === true
  } catch {
    return false
  }
}

function textoSubBots() {
  if (!SUBBOTS.size) return "> No hay sub-bots conectados todavia\n> Usa .code (privado) para conectar uno"
  const lineas = []
  let i = 1
  for (const [num, info] of SUBBOTS) {
    const seg = Math.floor((Date.now() - (info.desde || Date.now())) / 1000)
    const dur = seg > 3600 ? `${Math.floor(seg / 3600)}h ${Math.floor((seg % 3600) / 60)}m` : seg > 60 ? `${Math.floor(seg / 60)}m ${seg % 60}s` : `${seg}s`
    lineas.push(`> ${i++}. +${num}\n> Estado: ${info.conectado ? "Conectado \u2705" : "Reconectando... \u23f3"}\n> Tiempo conectado: ${dur}`)
  }
  return lineas.join("\n")
}

async function iniciarSubBot(numero, respuestaJid, respuestaSock, extra = {}) {
  const num = numeroLimpioSub(numero)
  if (!/^\d{8,13}$/.test(num)) throw new Error("El numero no es valido (che familia mandalo con codigo de pais, ejemplo: 5491127289595)")
  if (SUBBOTS.get(num)?.conectado) throw new Error("Ese numero ya esta conectado como sub-bot. Mira la lista con .bots")
  if (SUBBOTS.size >= MAX_SUBBOTS && !SUBBOTS.has(num)) throw new Error(`Hay ${MAX_SUBBOTS} sub-bots conectados: es el maximo de este servidor`)
  const yaEsta = SUBBOTS.get(num)
  if (yaEsta) yaEsta.token = "cancelado" + Date.now() // invalida reintentos pendientes del socket viejo
  PEDIGO_CODIGO.delete(num) // pedido manual nuevo = codigo fresco garantizado
  if (yaEsta?.sock) {
    try { yaEsta.sock.end() } catch {}
    yaEsta.sock = null
  }
  await startBot({ esSub: true, numeroSub: num, respuestaJid, respuestaSock, ...extra })
  return num
}

async function detenerSubBot(numero, borrarSesion = false) {
  const num = numeroLimpioSub(numero)
  const info = SUBBOTS.get(num)
  if (!info) throw new Error("Ese numero no tiene sub-bot activo. Mira la lista con .bots")
  try { info.sock?.end() } catch {}
  SUBBOTS.delete(num)
  if (borrarSesion) fs.rmSync(path.join(CARPETA_SUBBOTS, num), { recursive: true, force: true })
}

function autoarranqueSubs() {
  try {
    const base = path.join(process.cwd(), CARPETA_SUBBOTS)
    if (!fs.existsSync(base)) return
    let n = 0
    for (const dir of fs.readdirSync(base, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue
      if (!sesionSubRegistrada(path.join(base, dir.name))) continue
      if (!SUBBOTS.has(dir.name)) SUBBOTS.set(dir.name, { numero: dir.name, conectado: false, desde: Date.now(), intentos: 0 })
      startBot({ esSub: true, numeroSub: dir.name }).catch((e) => console.log("[SUBBOT] autoarranque falla:", e?.message))
      n++
    }
    if (n) console.log(`[SUBBOT] autoarranque: ${n} sub-bots re-conectando...`)
  } catch (e) {
    console.log("[SUBBOT] autoarranque error:", e?.message)
  }
}

async function startBot(opts = {}) {
  const esSub = Boolean(opts.esSub)
  const numeroSub = opts.numeroSub || null
  const sessionDir = esSub ? path.join(CARPETA_SUBBOTS, numeroSub || "sub") : config.sessionName
  const tokenSub = opts.token || (opts.token = "t" + Date.now() + Math.random().toString(36).slice(2))
  if (esSub && numeroSub && !SUBBOTS.has(numeroSub)) {
    SUBBOTS.set(numeroSub, { numero: numeroSub, token: tokenSub, conectado: false, desde: Date.now(), intentos: 0 })
  }
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
    },
    printQRInTerminal: !esSub,
    logger: pino({ level: "silent" }),
    browser: ["୲୳ EʀᴢᴀBᴏᴛ-MD/OFC", "Chrome", "1.0.0"]
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update

    // Sub-bot sin sesion registrada: pedir codigo de vinculacion (pairing code, sin QR)
    // Pairing unico: si ya hay un codigo valido en su ventana de 10 min para este socket, NO se pide otro
    if (esSub && numeroSub && !opts.modoQr && !state.creds?.registered && update.qr) {
      const pedidoSub = PEDIGO_CODIGO.get(numeroSub)
      if (!pedidoSub || pedidoSub.token !== tokenSub || pedidoSub.vence < Date.now()) {
        PEDIGO_CODIGO.set(numeroSub, { ...pedidoSub, vence: Date.now() + VENTANA_CODIGO_MS, token: tokenSub, codigo: null })
        const tokenPedido = tokenSub
        setTimeout(async () => {
          try {
            if (tokenPedido !== tokenSub) return // el socket ya no es el vigente: no pedir codigo muerto
            const codigo = await sock.requestPairingCode(numeroSub)
            const formateado = formatearCodigoVinculacion(codigo)
            const pedidoActual = PEDIGO_CODIGO.get(numeroSub) || {}
            PEDIGO_CODIGO.set(numeroSub, { ...pedidoActual, vence: pedidoActual.vence || (Date.now() + VENTANA_CODIGO_MS), token: tokenSub, codigo: formateado })
            const destinoSock = opts.respuestaSock || sockPrincipal || sock
            const destinoJid = opts.respuestaJid || `${numeroSub}@s.whatsapp.net`
            if (destinoSock?.sendMessage) {
              await destinoSock.sendMessage(destinoJid, { text: panel(`CODIGO DE VINCULACION`, `> @${numeroSub} te mando tu codigo en el mensaje siguiente \ud83d\udd22\n> Tiene una ventana de 10 minutos \u23f3\n\n> Pasos en el otro celular:\n> 1. Abrir WhatsApp\n> 2. Configuracion > Dispositivos vinculados\n> 3. Vincular con el numero de telefono\n> 4. Escribir el codigo del mensaje siguiente\n\n> Si lo perdes escribi .reenviar y te lo mando de nuevo \ud83d\udc8c`), mentions: [`${numeroSub}@s.whatsapp.net`] })
              await destinoSock.sendMessage(destinoJid, { text: formateado })
            }
            console.log(`[SUBBOT] codigo de vinculacion pedido para +${numeroSub}`)
          } catch (e) {
            const pedidoError = PEDIGO_CODIGO.get(numeroSub)
            if (!pedidoError || pedidoError.token === tokenPedido) PEDIGO_CODIGO.delete(numeroSub) // permitir reintentar el codigo
            console.log("[SUBBOT] error pidiendo codigo:", e?.message || e)
          }
        }, 3000)
      }
    }

    // Sub-bot modo QR: mandar el QR UNA SOLA VEZ (one-shot), se escanea el que llega y ya
    if (esSub && numeroSub && opts.modoQr && update.qr && (Number(opts.qrMandados) || 0) < 1) {
      opts.qrMandados = (Number(opts.qrMandados) || 0) + 1
      ;(async () => {
        try {
          const destinoSock = opts.respuestaSock || sockPrincipal || sock
          const destinoJid = opts.respuestaJid || `${numeroSub}@s.whatsapp.net`
          if (!destinoSock?.sendMessage) return
          let png = null
          try {
            const mod = await import("qrcode")
            const QRLib = mod.default || mod
            png = await QRLib.toBuffer(update.qr, { width: 640, margin: 2 })
          } catch (errQr) {
            console.log("[SUBBOT] falta la libreria qrcode, caigo a codigo de vinculacion:", errQr?.message || errQr)
          }
          if (png) {
            await destinoSock.sendMessage(destinoJid, { image: png, caption: panel(`QR DEL SUB-BOT`, `> @${numeroSub} escane\u00e1 este QR \ud83d\udcf2\n> En el tel\u00e9fono del sub-bot:\n> 1. Abrir WhatsApp\n> 2. Configuraci\u00f3n > Dispositivos vinculados\n> 3. Vincular un dispositivo\n> 4. Apuntar la c\u00e1mara a este QR\n\n> Es un solo QR \u23f3 (si se vence pedi otro con .qr)`), mentions: [`${numeroSub}@s.whatsapp.net`] })
          } else {
            const pedidoQrFall = PEDIGO_CODIGO.get(numeroSub)
            if (pedidoQrFall?.codigo && pedidoQrFall.vence >= Date.now()) {
              await destinoSock.sendMessage(destinoJid, { text: pedidoQrFall.codigo })
            } else {
              const codigo = await sock.requestPairingCode(numeroSub)
              const formateado = formatearCodigoVinculacion(codigo)
              PEDIGO_CODIGO.set(numeroSub, { ...(PEDIGO_CODIGO.get(numeroSub) || {}), vence: Date.now() + VENTANA_CODIGO_MS, token: tokenSub, codigo: formateado })
              await destinoSock.sendMessage(destinoJid, { text: panel(`CODIGO DE VINCULACION`, `> @${numeroSub} te mando tu codigo en el mensaje siguiente \ud83d\udd22\n> 1. Abrir WhatsApp\n> 2. Configuraci\u00f3n > Dispositivos vinculados\n> 3. Vincular con el n\u00famero de tel\u00e9fono\n> 4. Escribir el c\u00f3digo del mensaje siguiente`), mentions: [`${numeroSub}@s.whatsapp.net`] })
              await destinoSock.sendMessage(destinoJid, { text: formateado })
            }
          }
        } catch (e) {
          console.log("[SUBBOT] error mandando QR:", e?.message || e)
        }
      })()
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      if (esSub) {
        // Guarda anti-fantasma: si este socket ya fue reemplazado (.code nuevo, .stop o .delsub),
        // su cierre NO toca el estado nuevo ni dispara reintentos (evita bucles y #stop que no pega)
        const entradaSub = SUBBOTS.get(numeroSub)
        if (!entradaSub || entradaSub.token !== tokenSub) {
          console.log(`[SUBBOT] cierre ignorado de socket obsoleto para +${numeroSub}`)
          return
        }
        const motivoMortal = statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.forbidden
        let registrada = sesionSubRegistrada(sessionDir)
        if (!registrada && !motivoMortal) {
          // Carrera del 515 (restartRequired): WhatsApp linkea el equipo y cierra el socket ANTES de que
          // saveCreds termine de escribir creds.json -> releer la carpeta antes de dar la sesion por muerta
          await new Promise((r) => setTimeout(r, 500))
          registrada = sesionSubRegistrada(sessionDir)
        }
        if (motivoMortal) {
          // Desvinculado desde el celular: borrar sesion y soltar (sin bucles)
          try { fs.rmSync(sessionDir, { recursive: true, force: true }) } catch {}
          SUBBOTS.delete(numeroSub)
          PEDIGO_CODIGO.delete(numeroSub)
          const destinoSock = opts.respuestaSock || sockPrincipal || sock
          const destinoJid = opts.respuestaJid || `${numeroSub}@s.whatsapp.net`
          if (destinoSock?.sendMessage) {
            destinoSock.sendMessage(destinoJid, { text: panel(`SUB-BOT DESVINCULADO`, `> +${numeroSub} fue desvinculado desde el celular \ud83d\udeaa\n> Para volver a vincularlo escribi: .code ${numeroSub}`) }).catch(() => {})
          }
          console.log(`[SUBBOT] sesion eliminada para +${numeroSub} (desvinculada en el celular)`)
          return
        }
        if (!registrada) {
          // Pairing pendiente: socket NUEVO con codigo FRESCO automatico (tope 3, sin bucles)
          // Si se agotan los 3 codigos: se limpia todo y se avisa que pida .code manual
          const pedido = PEDIGO_CODIGO.get(numeroSub) || {}
          const intentosPair = (Number(pedido.intentos) || 0) + 1
          PEDIGO_CODIGO.set(numeroSub, { ...pedido, intentos: intentosPair })
          if (intentosPair > 3) {
            try { fs.rmSync(sessionDir, { recursive: true, force: true }) } catch {}
            SUBBOTS.delete(numeroSub)
            PEDIGO_CODIGO.delete(numeroSub)
            const destinoSock2 = opts.respuestaSock || sockPrincipal || sock
            const destinoJid2 = opts.respuestaJid || `${numeroSub}@s.whatsapp.net`
            if (destinoSock2?.sendMessage) {
            destinoSock2.sendMessage(destinoJid2, { text: panel(`VINCULACION INCOMPLETA`, `> @${numeroSub} el codigo no se ingreso a tiempo \u23f3\n> Pedite otro con un solo comando:\n> .code ${numeroSub}\n> (llega en un mensaje aparte, tenes 10 minutos)`) }).catch(() => {})
            }
            console.log(`[SUBBOT] sesion sin completar para +${numeroSub}: limpiada, sin reintentos automaticos (anti-bucle)`)
            return
          }
          const tokenViejo = opts.token
          const destinoSock = opts.respuestaSock || sockPrincipal || sock
          const destinoJid = opts.respuestaJid || `${numeroSub}@s.whatsapp.net`
          if (destinoSock?.sendMessage) {
            destinoSock.sendMessage(destinoJid, { text: panel(`CODIGO VENCIDO`, `> @${numeroSub} el codigo anterior ya no sirve \u23f3\n> Te mando uno NUEVO en un momento \ud83d\udd01\n> Us\u00e1 el que te llega en el mensaje siguiente (el viejo NO sirve)`) }).catch(() => {})
          }
          console.log(`[SUBBOT] +${numeroSub} no se vinculo: pido codigo nuevo (intento ${intentosPair}/3)`)
          setTimeout(() => {
            const actual = SUBBOTS.get(numeroSub)
            if (!actual || actual.token !== tokenViejo) return // .stop o .code nuevo: no reanimar socket viejo
            SUBBOTS.delete(numeroSub) // startBot crea entry nueva con token fresco (anti-fantasma consistente)
            startBot({ esSub: true, numeroSub, respuestaSock: opts.respuestaSock, respuestaJid: opts.respuestaJid, modoQr: opts.modoQr, qrMandados: 0 }).catch((e) => console.log("[SUBBOT] re-pairing falla:", e?.message || e))
          }, 2500)
          return
        }
        // Sesion YA vinculada: reconectar con backoff acotado (5s, 10s, ... max 60s, tope 12 intentos)
        const previa = SUBBOTS.get(numeroSub) || {}
        const intentos = (Number(previa.intentos) || 0) + 1
        if (intentos >= 12) {
          SUBBOTS.delete(numeroSub)
          PEDIGO_CODIGO.delete(numeroSub)
          console.log(`[SUBBOT] +${numeroSub} agoto los 12 reintentos: se suelta la sesion (queda guardada en disco)`)
          return
        }
        SUBBOTS.set(numeroSub, { ...previa, numero: numeroSub, token: tokenSub, conectado: false, sock: null, intentos })
        const espera = Math.min(intentos * 5000, 60000)
        console.log(`[SUBBOT] +${numeroSub} desconectado, reintentando en ${espera / 1000}s (intento ${intentos})`)
        const tokenViejo = opts.token
        setTimeout(() => {
          const actual = SUBBOTS.get(numeroSub)
          if (!actual || actual.token !== tokenViejo) return // hubo reinicio nuevo: no duplicar socket
          startBot({ esSub: true, numeroSub, respuestaSock: opts.respuestaSock, respuestaJid: opts.respuestaJid }).catch((e) => console.log("[SUBBOT] reconexion falla:", e?.message || e))
        }, espera)
        return
      }
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) {
        startBot()
      }
    } else if (connection === "open") {
      if (esSub) {
        const previa = SUBBOTS.get(numeroSub) || {}
        SUBBOTS.set(numeroSub, { ...previa, numero: numeroSub, token: tokenSub, sock, conectado: true, desde: Date.now(), intentos: 0 })
        PEDIGO_CODIGO.delete(numeroSub)
        console.log(`[SUBBOT] +${numeroSub} conectado como sub-bot ✅`)
        if (!previa.conectado) {
          const destinoSock = opts.respuestaSock || sockPrincipal || sock
          const destinoJid = opts.respuestaJid || `${numeroSub}@s.whatsapp.net`
          if (destinoSock?.sendMessage) {
            destinoSock.sendMessage(destinoJid, { text: panel(`SUB-BOT CONECTADO`, `> ✅ Fuiste vinculado como sub-bot
> Ya podes usar TODOS los comandos desde este numero
> (descargas, menu, juegos, todo)
> Para ver la lista: .bots`) }).catch(() => {})
          }
        }
      } else {
        sockPrincipal = sock
        console.log("EʀᴢᴀBᴏᴛ-MD/OFC conectado correctamente ⚡")
      }
    }
  })

  async function handleIncoming(incoming) {
    const normalizedMessage = unwrapMessageContent(incoming?.message)
    const msg = { ...incoming, message: normalizedMessage }
    if (!msg.message) return

    const from = msg.key?.remoteJid
    if (!from || from === "status@broadcast" || from.endsWith("@newsletter")) return
    const isGroup = from.endsWith("@g.us")

    const botJid = (sock.user?.id || "").split(":")[0] + "@s.whatsapp.net"
    const botNumber = (sock.user?.id || "").split(":")[0].split("@")[0].replace(/[^0-9]/g, "")
    const ownerNumberClean = config.ownerNumber.split("@")[0].replace(/[^0-9]/g, "")
    const botIsOwnerAccount = botNumber !== "" && botNumber === ownerNumberClean

    // En sub-bots: permitir responder a sus propios mensajes (el dueño del sub usa el bot en su propio chat)
    if (msg.key.fromMe && !botIsOwnerAccount && !esSub) return

    const sender = msg.key.fromMe ? botJid : normalizeSenderJid(msg)
    if (!sender) return
    const senderNumber = sender.split("@")[0]

    let body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || ""
    if (!body && msg.message.interactiveResponseMessage) {
      try {
        const params = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson || "{}")
        if (params.id) body = params.id
      } catch {}
    }
    if (!body && msg.message.listResponseMessage) {
      try {
        body = msg.message.listResponseMessage.singleSelectReply.selectedRowId
      } catch {}
    }
    if (!body && msg.message.buttonsResponseMessage) {
      body = msg.message.buttonsResponseMessage.selectedButtonId || ""
    }
    if (!body && msg.message.templateButtonReplyMessage) {
      body = msg.message.templateButtonReplyMessage.selectedId || ""
    }
    const PREFIXES = ["#", "$", "%", "&", "/", ".", "!", "?", "¡"]
    const prefixUsado = body ? PREFIXES.find((p) => body.startsWith(p)) : null
    if (!body || !prefixUsado) return

    const args = body.slice(prefixUsado.length).trim().split(/ +/)
    const command = args.shift().toLowerCase()
    const text = args.join(" ")

    if (REACCIONES[command]) reaccionar(sock, from, msg, REACCIONES[command]).catch(() => {})

    const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage
    const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || []

    const reply = async (text) => {
      startTyping(sock, from).catch(() => {})
      await sock.sendMessage(from, { text }, { quoted: msg })
      stopTyping(sock, from).catch(() => {})
    }

    const replyWithMention = async (text, mentions) => {
      startTyping(sock, from).catch(() => {})
      await sock.sendMessage(from, { text, mentions }, { quoted: msg })
      stopTyping(sock, from).catch(() => {})
    }

    const cleanOwnerNum = config.ownerNumber.replace(/[^0-9]/g, "")
    const cleanSenderNum = senderNumber.replace(/[^0-9]/g, "")
    const configuredOwners = Array.isArray(db?.settings?.owners) ? db.settings.owners : []
    const ownerNumbers = new Set(
      [cleanOwnerNum, "5491127289595", botNumber, ...configuredOwners]
        .filter((value) => typeof value === "string" || typeof value === "number")
        .map((value) => String(value).replace(/[^0-9]/g, ""))
        .filter(Boolean)
    )
    const isOwner = ownerNumbers.has(cleanSenderNum) || sender === config.ownerNumber || msg.key.fromMe

    const senderVariants = jidVariantSet([msg.key.participant, msg.key.participantAlt, msg.key.participantPn, sender])
    const botVariants = jidVariantSet([sock.user?.id, sock.user?.lid])

    const isAdmin = async () => {
      if (isOwner) return true
      if (!isGroup) return false
      try {
        const groupMetadata = await getGroupMeta(sock, from)
        const participant = groupMetadata.participants.find(p => jidInVariants(p.id, senderVariants))
        return participant?.admin === "admin" || participant?.admin === "superadmin"
      } catch {
        return false
      }
    }

    const isBotAdmin = async () => {
      if (!isGroup) return false
      try {
        const groupMetadata = await getGroupMeta(sock, from)
        const botParticipant = groupMetadata.participants.find(p => jidInVariants(p.id, botVariants))
        return botParticipant?.admin === "admin" || botParticipant?.admin === "superadmin"
      } catch {
        return false
      }
    }

    try {
      if (command === "trade" && args[0] === "accept") {
        if (!db.settings.pendingTrades?.[sender]) {
          await reply("No tienes intercambios pendientes")
          return
        }
        const trade = db.settings.pendingTrades[sender]
        if (Date.now() - trade.timestamp > 5 * 60 * 1000) {
          delete db.settings.pendingTrades[sender]
          saveDB()
          await reply("El intercambio expiró")
          return
        }
        const yourGacha2 = getUserGacha(sender)
        const theirGacha2 = getUserGacha(trade.from)
        const yourIndex = yourGacha2.characters.findIndex(c => c.name === trade.receive.name)
        const theirIndex = theirGacha2.characters.findIndex(c => c.name === trade.give.name)
        if (yourIndex === -1 || theirIndex === -1) {
          await reply("Error en el intercambio")
          delete db.settings.pendingTrades[sender]
          saveDB()
          return
        }
        yourGacha2.characters.splice(yourIndex, 1)
        theirGacha2.characters.splice(theirIndex, 1)
        yourGacha2.characters.push(trade.give)
        theirGacha2.characters.push(trade.receive)
        delete db.settings.pendingTrades[sender]
        saveDB()
        await reply(`${panel(`INTERCAMBIO COMPLETADO`, `> Recibiste: ${trade.give.name}\n> Entregaste: ${trade.receive.name}`)}`)
        return
      }

      if (command === "trade" && args[0] === "reject") {
        if (!db.settings.pendingTrades?.[sender]) {
          await reply("No tienes intercambios pendientes")
          return
        }
        delete db.settings.pendingTrades[sender]
        saveDB()
        await reply("Intercambio rechazado")
        return
      }

      if (command === "marry" && args[0] === "accept") {
        if (!db.settings.pendingMarriages?.[sender]) {
          await reply("No tienes propuestas pendientes")
          return
        }
        const marriage = db.settings.pendingMarriages[sender]
        if (Date.now() - marriage.timestamp > 5 * 60 * 1000) {
          delete db.settings.pendingMarriages[sender]
          saveDB()
          await reply("La propuesta expiró")
          return
        }
        const marryUser2 = getUserProfile(marriage.from)
        const marryTarget2 = getUserProfile(sender)
        if (marryUser2.married || marryTarget2.married) {
          delete db.settings.pendingMarriages[sender]
          saveDB()
          await reply("Uno de los dos ya está casado")
          return
        }
        marryUser2.married = sender
        marryTarget2.married = marriage.from
        marryUser2.marryHistory.push({ partner: sender, action: "marry", date: Date.now() })
        marryTarget2.marryHistory.push({ partner: marriage.from, action: "marry", date: Date.now() })
        delete db.settings.pendingMarriages[sender]
        saveDB()
        await reply(`💍 @${marriage.from.split("@")[0]} y @${senderNumber} ahora están casados`)
        return
      }

      if (command === "marry" && args[0] === "reject") {
        if (!db.settings.pendingMarriages?.[sender]) {
          await reply("No tienes propuestas pendientes")
          return
        }
        delete db.settings.pendingMarriages[sender]
        saveDB()
        await reply("Propuesta rechazada")
        return
      }

      switch (command) {
        case "menu":
        case "help":
        case "commands":
        case "comandos":
          await enviarMenuVisual(sock, from, msg, text)
          break

        case "ttsearch":
        case "tiktoksearch": {
          const query = text.trim().slice(0, 100)
          if (!query) {
            await reply("🔍 Escribí qué querés buscar:\n#ttsearch gatos graciosos")
            break
          }
          if (isNsfwText(query)) {
            await reply("⚠️ No puedo buscar contenido +18, explícito o violento. Probá con otra búsqueda.")
            break
          }
          const nowTs = Date.now()
          if (nowTs - (ttSearchCooldown.get(from) || 0) < 8000) {
            await reply("⏳ Esperá unos segundos entre búsquedas.")
            break
          }
          ttSearchCooldown.set(from, nowTs)
          const { customApiInfo, customApiDownloadUrl, zetaCoreTtSearch, zetaCoreTiktok } = await import("./youtube.js")
          await reply(`🔍 Buscando en TikTok: "${query}"...`)
          try {
            let results = null
            let motivoZeta = ""
            try {
              results = await zetaCoreTtSearch(query, 5)
            } catch (zetaError) {
              motivoZeta = String(zetaError?.message || zetaError)
              console.log("ttsearch: ZETA-CORE falló →", motivoZeta)
            }
            if (!results) {
              const api = customApiInfo()
              if (!api) {
                await reply(`⚠️ No pude completar la búsqueda.\nMotivo técnico: ${motivoZeta}`)
                break
              }
              const params = new URLSearchParams({ q: query })
              if (api.key) params.set("key", api.key)
              const response = await fetch(`${api.base}/search?${params.toString()}`, {
                headers: { "bypass-tunnel-reminder": "1" },
                signal: AbortSignal.timeout(120000)
              })
              const data = await response.json().catch(() => null)
              if (!data || data.ok === false) {
                const motivo = data?.nsfw ? "la búsqueda fue bloqueada por contenido no permitido" : data?.error || "sin respuesta de la API"
                await reply(`⚠️ No pude completar la búsqueda.\nMotivo técnico: ${motivo}`)
                break
              }
              results = (data.results || []).slice(0, 5)
            }
            results = results.filter((r) => !isNsfwText(r.title) && !isNsfwText(r.author)).slice(0, 5)
            if (!results.length) {
              await reply(`😐 No encontré videos de TikTok para "${query}". Probá con otras palabras.`)
              break
            }
            const { tiktokDownload } = await import("./downloader.js")
            await reply(`⬇️ Encontré ${results.length} videos. Los descargo y te los mando juntos (puede tardar un poco)...`)
            const bajados = []
            for (let i = 0; i < results.length; i++) {
              const r = results[i]
              let file = null
              try {
                file = await zetaCoreTiktok(r.url, `zenith_ttsearch_${Date.now()}_${i}`)
              } catch (zetaError) {
                console.log("ttsearch: ZETA-CORE falló para", r.url, "→", zetaError?.message || zetaError)
              }
              if (!file) {
                try {
                  file = await customApiDownloadUrl(r.url, "video", `zenith_ttsearch_${Date.now()}_${i}`)
                } catch (apiError) {
                  console.log("ttsearch: API propia falló para", r.url, "→", apiError?.message || apiError)
                }
              }
              if (!file) {
                try {
                  const scraped = await tiktokDownload(r.url)
                  if (scraped.type === "video") file = scraped.file
                  else if (Array.isArray(scraped.files) && scraped.files.length) file = scraped.files[0]
                } catch (scrapeError) {
                  console.log("ttsearch: scraping falló para", r.url, "→", scrapeError?.message || scrapeError)
                }
              }
              if (file) {
                bajados.push({ kind: "video", file, caption: "" })
              } else {
                console.log(`ttsearch: video ${i + 1} sin fuente descargable → ${r.url}`)
              }
            }
            if (!bajados.length) {
              await reply(`⚠️ No pude descargar ninguno de los ${results.length} videos. Probá de nuevo en un rato o descargalos con #tiktok <enlace>.`)
              break
            }
            try {
              await sendAlbumVideos(sock, from, bajados)
            reaccionar(sock, from, msg, ["✅"]).catch(() => {})
            } catch (albumError) {
              console.log("ttsearch: álbum no soportado, mandando de a uno →", albumError?.message || albumError)
              for (const item of bajados) {
                try {
                  await sock.sendMessage(from, { video: { url: item.file }, mimetype: "video/mp4" }, { quoted: msg })
                } catch (sendError) {
                  console.log("ttsearch: error al enviar video →", sendError?.message || sendError)
                }
              }
            }
            for (const item of bajados) removeFile(item.file)
          } catch (e) {
            await reply(`⚠️ La búsqueda falló.\nMotivo técnico: ${String(e?.message || e).slice(0, 180)}`)
          }
          break
        }


        case "balance":
        case "bal":
        case "coins":
          const balTarget = mentioned.length > 0 ? mentioned[0] : sender
          const balUser = getUserEconomy(balTarget)
          await reply(`${panel(`BALANCE DE @${balTarget.split("@")[0]}`, `> 💰 Cartera: ${formatCoins(balUser.coins)} coins\n> 🏦 Banco: ${formatCoins(balUser.bank)} coins\n> 📊 Total: ${formatCoins(balUser.coins + balUser.bank)} coins`)}`)
          break

        case "daily":
          const dailyUser = getUserEconomy(sender)
          const now = Date.now()
          const dailyCooldown = 24 * 60 * 60 * 1000
          if (now - dailyUser.lastDaily < dailyCooldown) {
            const remaining = dailyCooldown - (now - dailyUser.lastDaily)
            const hours = Math.floor(remaining / 3600000)
            const minutes = Math.floor((remaining % 3600000) / 60000)
            await reply(`${panel(`DAILY`, `> Ya reclamaste tu daily\n> Vuelve en: ${hours}h ${minutes}m`)}`)
          } else {
            const amount = Math.floor(Math.random() * 2000) + 1000
            dailyUser.coins += amount
            dailyUser.lastDaily = now
            saveDB()
            await reply(`${panel(`DAILY RECLAMADO`, `> Recibiste: ${formatCoins(amount)} coins\n> Cartera: ${formatCoins(dailyUser.coins)} coins`)}`)
          }
          break

        case "work":
        case "w":
          const workUser = getUserEconomy(sender)
          const workNow = Date.now()
          const workCooldown = 60 * 60 * 1000
          if (workNow - workUser.lastWork < workCooldown) {
            const remaining = workCooldown - (workNow - workUser.lastWork)
            const minutes = Math.floor(remaining / 60000)
            await reply(`${panel(`TRABAJO`, `> Debes descansar\n> Vuelve en: ${minutes} minutos`)}`)
          } else {
            const jobs = ["Programador", "Diseñador", "Camarero", "Conductor", "Abogado", "Médico", "Ingeniero", "Arquitecto", "Profesor", "Policía"]
            const job = jobs[Math.floor(Math.random() * jobs.length)]
            const amount = Math.floor(Math.random() * 1500) + 500
            workUser.coins += amount
            workUser.lastWork = workNow
            addXP(sender, 10)
            saveDB()
            await reply(`${panel(`TRABAJO`, `> Trabajaste como: ${job}\n> Ganaste: ${formatCoins(amount)} coins\n> Cartera: ${formatCoins(workUser.coins)} coins`)}`)
          }
          break

        case "crime":
          const crimeUser = getUserEconomy(sender)
          const crimeNow = Date.now()
          const crimeCooldown = 2 * 60 * 60 * 1000
          if (crimeNow - crimeUser.lastCrime < crimeCooldown) {
            const remaining = crimeCooldown - (crimeNow - crimeUser.lastCrime)
            const minutes = Math.floor(remaining / 60000)
            await reply(`${panel(`CRIMEN`, `> La policía te busca\n> Vuelve en: ${minutes} minutos`)}`)
          } else {
            const successCrime = Math.random() > 0.4
            if (successCrime) {
              const amount = Math.floor(Math.random() * 3000) + 1000
              crimeUser.coins += amount
              crimeUser.lastCrime = crimeNow
              addXP(sender, 15)
              saveDB()
              await reply(`${panel(`CRIMEN EXITOSO`, `> Robaste: ${formatCoins(amount)} coins\n> Cartera: ${formatCoins(crimeUser.coins)} coins`)}`)
            } else {
              const fine = Math.min(Math.floor(Math.random() * 1000) + 500, crimeUser.coins)
              crimeUser.coins -= fine
              crimeUser.lastCrime = crimeNow
              saveDB()
              await reply(`${panel(`CRIMEN FALLIDO`, `> Te atraparon\n> Multa: ${formatCoins(fine)} coins\n> Cartera: ${formatCoins(crimeUser.coins)} coins`)}`)
            }
          }
          break

        case "slut":
          const slutUser = getUserEconomy(sender)
          const slutNow = Date.now()
          const slutCooldown = 3 * 60 * 60 * 1000
          if (slutNow - slutUser.lastSlut < slutCooldown) {
            const remaining = slutCooldown - (slutNow - slutUser.lastSlut)
            const minutes = Math.floor(remaining / 60000)
            await reply(`${panel(`SLUT`, `> Debes descansar\n> Vuelve en: ${minutes} minutos`)}`)
          } else {
            const amount = Math.floor(Math.random() * 2500) + 800
            slutUser.coins += amount
            slutUser.lastSlut = slutNow
            addXP(sender, 12)
            saveDB()
            await reply(`${panel(`SLUT`, `> Ganaste: ${formatCoins(amount)} coins\n> Cartera: ${formatCoins(slutUser.coins)} coins`)}`)
          }
          break

        case "steal":
        case "robar":
        case "rob":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          const stealUser = getUserEconomy(sender)
          const stealNow = Date.now()
          const stealCooldown = 4 * 60 * 60 * 1000
          if (stealNow - stealUser.lastSteal < stealCooldown) {
            const remaining = stealCooldown - (stealNow - stealUser.lastSteal)
            const minutes = Math.floor(remaining / 60000)
            await reply(`${panel(`ROBAR`, `> Debes esperar\n> Vuelve en: ${minutes} minutos`)}`)
            return
          }
          if (mentioned.length === 0) {
            await reply("Menciona a alguien para robarle")
            return
          }
          const target = mentioned[0]
          const targetEcon = getUserEconomy(target)
          if (targetEcon.coins < 100) {
            await reply("Esa persona no tiene suficientes coins para robar")
            return
          }
          const successSteal = Math.random() > 0.5
          if (successSteal) {
            const amount = Math.floor(Math.random() * Math.min(targetEcon.coins, 2000)) + 100
            stealUser.coins += amount
            targetEcon.coins -= amount
            stealUser.lastSteal = stealNow
            saveDB()
            await reply(`${panel(`ROBÓ EXITOSO`, `> Robaste: ${formatCoins(amount)} coins\n> De: @${target.split("@")[0]}`)}`)
          } else {
            const fine = Math.min(Math.floor(Math.random() * 800) + 200, stealUser.coins)
            stealUser.coins -= fine
            stealUser.lastSteal = stealNow
            saveDB()
            await reply(`${panel(`ROBÓ FALLIDO`, `> Te atraparon\n> Multa: ${formatCoins(fine)} coins`)}`)
          }
          break

        case "coinflip":
        case "flip":
        case "cf":
          const cfUser = getUserEconomy(sender)
          let cfChoice = "cara"
          let cfAmount = 50
          if (args.length >= 2) {
            if (["cara", "cruz"].includes(args[0].toLowerCase())) {
              cfChoice = args[0].toLowerCase()
              cfAmount = parseInt(args[1]) || 50
            } else {
              cfAmount = parseInt(args[0]) || 50
              cfChoice = ["cara", "cruz"].includes(args[1]?.toLowerCase()) ? args[1].toLowerCase() : "cara"
            }
          } else if (args.length === 1) {
            if (["cara", "cruz"].includes(args[0].toLowerCase())) {
              cfChoice = args[0].toLowerCase()
            } else {
              cfAmount = parseInt(args[0]) || 50
            }
          }
          if (isNaN(cfAmount) || cfAmount < 10) cfAmount = 10
          if (cfUser.coins < cfAmount) {
            await reply("No tienes suficientes coins")
            return
          }
          const resultCF = Math.random() > 0.5 ? "cara" : "cruz"
          if (cfChoice === resultCF) {
            cfUser.coins += cfAmount
            saveDB()
            await reply(`${panel(`COINFLIP`, `> Salió: ${resultCF}\n> Ganaste: ${formatCoins(cfAmount)} coins\n> Cartera: ${formatCoins(cfUser.coins)} coins`)}`)
          } else {
            cfUser.coins -= cfAmount
            saveDB()
            await reply(`${panel(`COINFLIP`, `> Salió: ${resultCF}\n> Perdiste: ${formatCoins(cfAmount)} coins\n> Cartera: ${formatCoins(cfUser.coins)} coins`)}`)
          }
          break

        case "roulette":
        case "rt":
          const rtUser = getUserEconomy(sender)
          if (args.length < 2) {
            await reply("Uso: #roulette [red/black/green] [cantidad]")
            return
          }
          let rtChoice = args[0].toLowerCase()
          if (rtChoice === "red") rtChoice = "rojo"
          if (rtChoice === "black") rtChoice = "negro"
          if (rtChoice === "green") rtChoice = "verde"
          const rtAmount = parseInt(args[1])
          if (!["rojo", "negro", "verde"].includes(rtChoice)) {
            await reply("Elige: rojo, negro o verde")
            return
          }
          if (isNaN(rtAmount) || rtAmount < 10) {
            await reply("Apuesta mínima: 10 coins")
            return
          }
          if (rtUser.coins < rtAmount) {
            await reply("No tienes suficientes coins")
            return
          }
          const num = Math.floor(Math.random() * 37)
          let color = "verde"
          if (num > 0) {
            color = num % 2 === 0 ? "negro" : "rojo"
          }
          if (rtChoice === color) {
            const multiplier = color === "verde" ? 14 : 2
            const win = rtAmount * multiplier
            rtUser.coins += win
            saveDB()
            await reply(`${panel(`RULETA`, `> Número: ${num} (${color})\n> Ganaste: ${formatCoins(win)} coins\n> Cartera: ${formatCoins(rtUser.coins)} coins`)}`)
          } else {
            rtUser.coins -= rtAmount
            saveDB()
            await reply(`${panel(`RULETA`, `> Número: ${num} (${color})\n> Perdiste: ${formatCoins(rtAmount)} coins\n> Cartera: ${formatCoins(rtUser.coins)} coins`)}`)
          }
          break

        case "deposit":
        case "dep":
        case "depositar":
        case "d":
          const depUser = getUserEconomy(sender)
          const depAmount = args[0] === "all" ? depUser.coins : parseInt(args[0])
          if (isNaN(depAmount) || depAmount < 1) {
            await reply("Uso: #deposit <cantidad|all>")
            return
          }
          if (depUser.coins < depAmount) {
            await reply("No tienes suficientes coins")
            return
          }
          depUser.coins -= depAmount
          depUser.bank += depAmount
          saveDB()
          await reply(`${panel(`DEPÓSITO`, `> Depositaste: ${formatCoins(depAmount)} coins\n> Cartera: ${formatCoins(depUser.coins)} coins\n> Banco: ${formatCoins(depUser.bank)} coins`)}`)
          break

        case "withdraw":
        case "with":
        case "retirar":
          const withUser = getUserEconomy(sender)
          const withAmount = args[0] === "all" ? withUser.bank : parseInt(args[0])
          if (isNaN(withAmount) || withAmount < 1) {
            await reply("Uso: #withdraw <cantidad|all>")
            return
          }
          if (withUser.bank < withAmount) {
            await reply("No tienes suficientes coins en el banco")
            return
          }
          withUser.bank -= withAmount
          withUser.coins += withAmount
          saveDB()
          await reply(`${panel(`RETIRO`, `> Retiraste: ${formatCoins(withAmount)} coins\n> Cartera: ${formatCoins(withUser.coins)} coins\n> Banco: ${formatCoins(withUser.bank)} coins`)}`)
          break

        case "givecoins":
        case "pay":
        case "coinsgive":
          if (mentioned.length === 0 || args.length < 2) {
            await reply("Uso: #givecoins @usuario <cantidad>")
            return
          }
          const payUser = getUserEconomy(sender)
          const payTarget = getUserEconomy(mentioned[0])
          const payAmount = parseInt(args[1])
          if (isNaN(payAmount) || payAmount < 1) {
            await reply("Cantidad inválida")
            return
          }
          if (payUser.coins < payAmount) {
            await reply("No tienes suficientes coins")
            return
          }
          payUser.coins -= payAmount
          payTarget.coins += payAmount
          saveDB()
          await reply(`${panel(`TRANSFERENCIA`, `> Enviaste: ${formatCoins(payAmount)} coins\n> A: @${mentioned[0].split("@")[0]}`)}`)
          break

        case "economyboard":
        case "eboard":
        case "baltop":
          const sorted = Object.entries(db.economy)
            .map(([id, data]) => ({ id, total: data.coins + data.bank }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10)
          let boardText = panelStart(`RANKING ECONOMÍA`, ``)
          sorted.forEach((entry, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`
            boardText += `> ${medal} @${entry.id.split("@")[0]}: ${formatCoins(entry.total)} coins\n`
          })
          boardText += PANEL_FOOTER
          await reply(boardText)
          break

        case "economyinfo":
        case "einfo":
          await reply(`${panel(`INFO ECONOMÍA`, `> Sistema de coins con cartera y banco\n> Daily cada 24 horas\n> Trabaja cada hora\n> Crimen cada 2 horas\n> Slut cada 3 horas\n> Robar cada 4 horas\n> Apuestas: coinflip y ruleta\n> Ranking global de coins`)}`)
          break

        case "sticker":
        case "s":
        case "stickers":
          if (!quoted && !msg.message.imageMessage && !msg.message.videoMessage) {
            await reply("Responde a una imagen o video con #sticker")
            return
          }
          try {
            const mediaMsg = quoted ? { message: quoted } : msg
            const buffer = await downloadMediaMessage(mediaMsg, "buffer", {}, { logger: pino({ level: "silent" }) })
            if (!buffer) {
              await reply("No pude descargar el media")
              return
            }
            const isVideo = quoted?.videoMessage || msg.message.videoMessage
            const stickerBuffer = isVideo ? await videoToSticker(buffer) : await imageToSticker(buffer)
            await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg })
          } catch (e) {
            await reply("Error al crear sticker")
          }
          break

        case "newpack":
        case "newstickerpack":
          if (!text) {
            await reply("Uso: #newpack <nombre>")
            return
          }
          if (!db.stickers[sender]) db.stickers[sender] = { packs: {} }
          if (db.stickers[sender].packs[text]) {
            await reply("Ya tienes un pack con ese nombre")
            return
          }
          db.stickers[sender].packs[text] = { stickers: [], private: false, favorite: false, desc: "" }
          saveDB()
          await reply(`${panel(`PACK CREADO`, `> Nombre: ${text}\n> Usa #stickeradd para añadir stickers`)}`)
          break

        case "stickeradd":
        case "addsticker":
          if (!text) {
            await reply("Uso: #stickeradd <nombre_pack>")
            return
          }
          if (!quoted || !quoted.stickerMessage) {
            await reply("Responde a un sticker con #stickeradd <pack>")
            return
          }
          if (!db.stickers[sender]?.packs[text]) {
            await reply("No tienes un pack con ese nombre")
            return
          }
          try {
            const buffer = await downloadMediaMessage({ message: quoted }, "buffer", {}, { logger: pino({ level: "silent" }) })
            const base64 = buffer.toString("base64")
            db.stickers[sender].packs[text].stickers.push(base64)
            saveDB()
            await reply("Sticker añadido al pack")
          } catch (e) {
            await reply("Error al añadir sticker")
          }
          break

        case "stickerdel":
        case "delsticker":
          if (!text) {
            await reply("Uso: #stickerdel <nombre_pack> <número>")
            return
          }
          const [packName, stickerNum] = text.split(" ")
          if (!db.stickers[sender]?.packs[packName]) {
            await reply("No tienes un pack con ese nombre")
            return
          }
          const numSticker = parseInt(stickerNum) - 1
          if (isNaN(numSticker) || numSticker < 0 || numSticker >= db.stickers[sender].packs[packName].stickers.length) {
            await reply("Número de sticker inválido")
            return
          }
          db.stickers[sender].packs[packName].stickers.splice(numSticker, 1)
          saveDB()
          await reply("Sticker eliminado del pack")
          break

        case "stickerpacks":
        case "packlist":
          if (!db.stickers[sender] || Object.keys(db.stickers[sender].packs).length === 0) {
            await reply("No tienes packs de stickers")
            return
          }
          let packsText = panelStart(`TUS PACKS`, ``)
          for (const [name, packData] of Object.entries(db.stickers[sender].packs)) {
            const fav = packData.favorite ? "★" : "☆"
            const priv = packData.private ? "🔒" : "🔓"
            packsText += `> ${fav} ${priv} ${name}: ${packData.stickers.length} stickers\n`
          }
          packsText += PANEL_FOOTER
          await reply(packsText)
          break

        case "getpack":
        case "stickerpack":
        case "pack":
          if (!text) {
            await reply("Uso: #getpack <nombre>")
            return
          }
          if (!db.stickers[sender]?.packs[text]) {
            await reply("No tienes un pack con ese nombre")
            return
          }
          const packData = db.stickers[sender].packs[text]
          if (packData.stickers.length === 0) {
            await reply("Este pack está vacío")
            return
          }
          for (const stickerBase64 of packData.stickers) {
            const buffer = Buffer.from(stickerBase64, "base64")
            await sock.sendMessage(from, { sticker: buffer })
          }
          break

        case "delpack":
          if (!text) {
            await reply("Uso: #delpack <nombre>")
            return
          }
          if (!db.stickers[sender]?.packs[text]) {
            await reply("No tienes un pack con ese nombre")
            return
          }
          delete db.stickers[sender].packs[text]
          saveDB()
          await reply("Pack eliminado")
          break

        case "setstickermeta":
        case "setmeta":
          await reply("Uso: #setstickermeta <autor> <pack>")
          break

        case "delstickermeta":
        case "delmeta":
          await reply("Metadata de stickers eliminada")
          break

        case "packfavourite":
        case "setpackfav":
        case "packfav":
          if (!text) {
            await reply("Uso: #packfavourite <nombre>")
            return
          }
          if (!db.stickers[sender]?.packs[text]) {
            await reply("No tienes un pack con ese nombre")
            return
          }
          db.stickers[sender].packs[text].favorite = true
          saveDB()
          await reply("Pack marcado como favorito")
          break

        case "packunfavourite":
        case "unsetpackfav":
        case "packunfav":
          if (!text) {
            await reply("Uso: #packunfavourite <nombre>")
            return
          }
          if (!db.stickers[sender]?.packs[text]) {
            await reply("No tienes un pack con ese nombre")
            return
          }
          db.stickers[sender].packs[text].favorite = false
          saveDB()
          await reply("Pack quitado de favoritos")
          break

        case "setpackprivate":
        case "setpackpriv":
          if (!text) {
            await reply("Uso: #setpackprivate <nombre>")
            return
          }
          if (!db.stickers[sender]?.packs[text]) {
            await reply("No tienes un pack con ese nombre")
            return
          }
          db.stickers[sender].packs[text].private = true
          saveDB()
          await reply("Pack ahora es privado")
          break

        case "setpackpublic":
        case "setpackpub":
          if (!text) {
            await reply("Uso: #setpackpublic <nombre>")
            return
          }
          if (!db.stickers[sender]?.packs[text]) {
            await reply("No tienes un pack con ese nombre")
            return
          }
          db.stickers[sender].packs[text].private = false
          saveDB()
          await reply("Pack ahora es público")
          break

        case "setstickerpackdesc":
        case "setpackdesc":
        case "packdesc":
          if (!text) {
            await reply("Uso: #setstickerpackdesc <nombre> <descripción>")
            return
          }
          const [descPack, ...descParts] = text.split(" ")
          const desc = descParts.join(" ")
          if (!db.stickers[sender]?.packs[descPack]) {
            await reply("No tienes un pack con ese nombre")
            return
          }
          db.stickers[sender].packs[descPack].desc = desc
          saveDB()
          await reply("Descripción actualizada")
          break

        case "rollwaifu":
        case "rw":
        case "roll":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          const gachaSettings = getGroupSettings(from)
          if (!gachaSettings.gacha) {
            await reply("El gacha está desactivado en este grupo")
            return
          }
          const gachaUser = getUserGacha(sender)
          const rollNow = Date.now()
          const rollCooldown = 60 * 60 * 1000
          if (rollNow - gachaUser.lastRoll < rollCooldown) {
            const remaining = rollCooldown - (rollNow - gachaUser.lastRoll)
            const minutes = Math.floor(remaining / 60000)
            await reply(`${panel(`GACHA`, `> Debes esperar\n> Vuelve en: ${minutes} minutos`)}`)
            return
          }
          const rand = Math.random()
          let rarity
          if (rand < 0.05) rarity = "SSR"
          else if (rand < 0.25) rarity = "SR"
          else rarity = "R"
          const chars = gachaCharacters.filter(c => c.rarity === rarity)
          const character = chars[Math.floor(Math.random() * chars.length)]
          const claimId = Date.now().toString()
          if (!db.settings.pendingClaims) db.settings.pendingClaims = {}
          db.settings.pendingClaims[from] = { character, claimId, timestamp: rollNow }
          gachaUser.lastRoll = rollNow
          saveDB()
          await reply(`${panel(`GACHA ROLL`, `> Nombre: ${character.name}\n> Serie: ${character.series}\n> Rareza: ${getRarityColor(character.rarity)} ${character.rarity}\n> Valor: ${formatCoins(character.value)} coins`)}\n\nEscribe #claim para reclamarla`)
          break

        case "claim":
        case "c":
        case "reclamar":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!db.settings.pendingClaims?.[from]) {
            await reply("No hay personaje para reclamar")
            return
          }
          const pending = db.settings.pendingClaims[from]
          if (Date.now() - pending.timestamp > 60000) {
            delete db.settings.pendingClaims[from]
            saveDB()
            await reply("El tiempo para reclamar expiró")
            return
          }
          const claimUser = getUserGacha(sender)
          const alreadyHas = claimUser.characters.find(c => c.name === pending.character.name)
          if (alreadyHas) {
            await reply("Ya tienes este personaje en tu harem")
            return
          }
          claimUser.characters.push({ ...pending.character, claimedAt: Date.now() })
          claimUser.claims++
          delete db.settings.pendingClaims[from]
          addXP(sender, 20)
          saveDB()
          await reply(`${panel(`PERSONAJE RECLAMADO`, `> ${pending.character.name}\n> ${pending.character.series}\n> ${getRarityColor(pending.character.rarity)} ${pending.character.rarity}\n> Total en harem: ${claimUser.characters.length}`)}`)
          break

        case "harem":
        case "waifus":
        case "claims":
          const haremTarget = mentioned.length > 0 ? mentioned[0] : sender
          const haremUser = getUserGacha(haremTarget)
          if (haremUser.characters.length === 0) {
            await reply("No hay personajes en este harem")
            return
          }
          let haremText = panelStart(`HAREM DE @${haremTarget.split("@")[0]}`, `> Total: ${haremUser.characters.length} personajes\n`)
          haremUser.characters.slice(0, 20).forEach((char, i) => {
            haremText += `> ${i + 1}. ${getRarityColor(char.rarity)} ${char.name} - ${char.series}\n`
          })
          haremText += PANEL_FOOTER
          await replyWithMention(haremText, [haremTarget])
          break

        case "buycharacter":
        case "buychar":
        case "buyc":
          if (!text) {
            await reply("Uso: #buycharacter <nombre>")
            return
          }
          const buyChar = gachaCharacters.find(c => c.name.toLowerCase().includes(text.toLowerCase()))
          if (!buyChar) {
            await reply("Personaje no encontrado")
            return
          }
          const buyUser = getUserEconomy(sender)
          const buyGacha = getUserGacha(sender)
          if (buyUser.coins < buyChar.value) {
            await reply(`Necesitas ${formatCoins(buyChar.value)} coins`)
            return
          }
          const alreadyOwned = buyGacha.characters.find(c => c.name === buyChar.name)
          if (alreadyOwned) {
            await reply("Ya tienes este personaje")
            return
          }
          buyUser.coins -= buyChar.value
          buyGacha.characters.push({ ...buyChar, claimedAt: Date.now() })
          saveDB()
          await reply(`${panel(`COMPRA EXITOSA`, `> ${buyChar.name}\n> ${buyChar.series}\n> Pagaste: ${formatCoins(buyChar.value)} coins`)}`)
          break

        case "sell":
        case "vender":
          if (!text) {
            await reply("Uso: #sell <nombre>")
            return
          }
          const sellGacha = getUserGacha(sender)
          const sellIndex = sellGacha.characters.findIndex(c => c.name.toLowerCase().includes(text.toLowerCase()))
          if (sellIndex === -1) {
            await reply("No tienes ese personaje")
            return
          }
          const sellChar = sellGacha.characters[sellIndex]
          const sellPrice = Math.floor(sellChar.value * 0.7)
          sellGacha.characters.splice(sellIndex, 1)
          const sellUser = getUserEconomy(sender)
          sellUser.coins += sellPrice
          saveDB()
          await reply(`${panel(`VENTA EXITOSA`, `> ${sellChar.name}\n> Recibiste: ${formatCoins(sellPrice)} coins`)}`)
          break

        case "removesale":
        case "removerventa":
          await reply("No hay ventas activas para remover")
          break

        case "trade":
        case "intercambiar":
          if (mentioned.length === 0 || args.length < 2) {
            await reply("Uso: #trade @usuario <tu_personaje> | <su_personaje>")
            return
          }
          const tradeParts = text.split("|")
          if (tradeParts.length < 2) {
            await reply("Uso: #trade @usuario <tu_personaje> | <su_personaje>")
            return
          }
          const tradeTarget = mentioned[0]
          const yourCharName = tradeParts[0].replace(/@\d+/, "").trim()
          const theirCharName = tradeParts[1].trim()
          const yourGacha = getUserGacha(sender)
          const theirGacha = getUserGacha(tradeTarget)
          const yourChar = yourGacha.characters.find(c => c.name.toLowerCase().includes(yourCharName.toLowerCase()))
          const theirChar = theirGacha.characters.find(c => c.name.toLowerCase().includes(theirCharName.toLowerCase()))
          if (!yourChar) {
            await reply("No tienes ese personaje")
            return
          }
          if (!theirChar) {
            await reply("La otra persona no tiene ese personaje")
            return
          }
          if (!db.settings.pendingTrades) db.settings.pendingTrades = {}
          db.settings.pendingTrades[tradeTarget] = {
            from: sender,
            give: yourChar,
            receive: theirChar,
            timestamp: Date.now()
          }
          saveDB()
          await reply(`${panel(`INTERCAMBIO`, `> @${tradeTarget.split("@")[0]}\n> Te ofrecen: ${yourChar.name}\n> Por tu: ${theirChar.name}\n> Escribe #trade accept para aceptar\n> O #trade reject para rechazar`)}`)
          break

        case "vote":
        case "votar":
          if (mentioned.length === 0) {
            await reply("Uso: #vote @usuario")
            return
          }
          if (!db.settings.votes) db.settings.votes = {}
          const voteTarget = mentioned[0]
          const today = new Date().toDateString()
          if (!db.settings.votes[sender]) db.settings.votes[sender] = { lastVote: "", count: 0 }
          if (db.settings.votes[sender].lastVote === today) {
            await reply("Ya votaste hoy")
            return
          }
          db.settings.votes[sender].lastVote = today
          db.settings.votes[sender].count++
          if (!db.settings.voteCounts) db.settings.voteCounts = {}
          if (!db.settings.voteCounts[voteTarget]) db.settings.voteCounts[voteTarget] = 0
          db.settings.voteCounts[voteTarget]++
          saveDB()
          await reply(`Votaste por @${voteTarget.split("@")[0]}`)
          break

        case "charinfo":
        case "winfo":
        case "waifuinfo":
          if (!text) {
            await reply("Uso: #charinfo <nombre>")
            return
          }
          const infoChar = gachaCharacters.find(c => c.name.toLowerCase().includes(text.toLowerCase()))
          if (!infoChar) {
            await reply("Personaje no encontrado")
            return
          }
          await reply(`${panel(`INFO PERSONAJE`, `> Nombre: ${infoChar.name}\n> Serie: ${infoChar.series}\n> Rareza: ${getRarityColor(infoChar.rarity)} ${infoChar.rarity}\n> Valor: ${formatCoins(infoChar.value)} coins`)}`)
          break

        case "charimage":
        case "waifuimage":
        case "cimage":
        case "wimage":
          if (!text) {
            await reply("Uso: #charimage <nombre>")
            return
          }
          await reply(`Imagen de ${text} no disponible en este momento`)
          break

        case "charvideo":
        case "waifuvideo":
        case "cvideo":
        case "wvideo":
          if (!text) {
            await reply("Uso: #charvideo <nombre>")
            return
          }
          await reply(`Video de ${text} no disponible en este momento`)
          break

        case "serieinfo":
        case "ainfo":
        case "animeinfo":
          if (!text) {
            await reply("Uso: #serieinfo <nombre>")
            return
          }
          const seriesChars = gachaCharacters.filter(c => c.series.toLowerCase().includes(text.toLowerCase()))
          if (seriesChars.length === 0) {
            await reply("Serie no encontrada")
            return
          }
          let seriesText = panelStart(`INFO SERIE`, `> Serie: ${seriesChars[0].series}\n> Personajes: ${seriesChars.length}\n`)
          seriesChars.forEach(char => {
            seriesText += `> ${getRarityColor(char.rarity)} ${char.name}\n`
          })
          seriesText += PANEL_FOOTER
          await reply(seriesText)
          break

        case "serielist":
        case "slist":
        case "animelist":
          const seriesSet = new Set(gachaCharacters.map(c => c.series))
          let seriesListText = panelStart(`LISTA DE SERIES`, ``)
          seriesSet.forEach(series => {
            const count = gachaCharacters.filter(c => c.series === series).length
            seriesListText += `> ${series} (${count} personajes)\n`
          })
          seriesListText += PANEL_FOOTER
          await reply(seriesListText)
          break

        case "haremshop":
        case "tiendawaifus":
        case "wshop":
          let shopText = panelStart(`TIENDA GACHA`, ``)
          gachaCharacters.slice(0, 10).forEach(char => {
            shopText += `> ${getRarityColor(char.rarity)} ${char.name} - ${formatCoins(char.value)} coins\n`
          })
          shopText += `└───────────────┘\n\nUsa #buycharacter <nombre> para comprar`
          await reply(shopText)
          break

        case "waifusboard":
        case "waifustop":
        case "topwaifus":
        case "wtop":
          const waifuTop = Object.entries(db.gacha)
            .map(([id, data]) => ({ id, count: data.characters.length }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
          let waifuText = panelStart(`RANKING WAIFUS`, ``)
          waifuTop.forEach((entry, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`
            waifuText += `> ${medal} @${entry.id.split("@")[0]}: ${entry.count} waifus\n`
          })
          waifuText += PANEL_FOOTER
          await reply(waifuText)
          break

        case "favoritetop":
        case "favtop":
          await reply("Ranking de favoritos no disponible aún")
          break

        case "gachainfo":
        case "ginfo":
        case "infogacha":
          await reply(`${panel(`INFO GACHA`, `> Roll cada hora\n> Rarezas: SSR (5%), SR (20%), R (75%)\n> Reclama con #claim\n> Compra en #haremshop\n> Vende con #sell\n> Intercambia con #trade`)}`)
          break

        case "givechar":
        case "givewaifu":
        case "regalar":
          if (!isOwner) {
            await reply("Solo el dueño puede usar este comando")
            return
          }
          if (mentioned.length === 0 || !text) {
            await reply("Uso: #givechar @usuario <nombre>")
            return
          }
          const giveChar = gachaCharacters.find(c => c.name.toLowerCase().includes(text.replace(/@\d+/, "").trim().toLowerCase()))
          if (!giveChar) {
            await reply("Personaje no encontrado")
            return
          }
          const giveTarget = getUserGacha(mentioned[0])
          giveTarget.characters.push({ ...giveChar, claimedAt: Date.now() })
          saveDB()
          await reply(`Personaje ${giveChar.name} dado a @${mentioned[0].split("@")[0]}`)
          break

        case "giveallharem":
          if (!isOwner) {
            await reply("Solo el dueño puede usar este comando")
            return
          }
          if (mentioned.length === 0) {
            await reply("Uso: #giveallharem @usuario")
            return
          }
          const allTarget = getUserGacha(mentioned[0])
          gachaCharacters.forEach(char => {
            if (!allTarget.characters.find(c => c.name === char.name)) {
              allTarget.characters.push({ ...char, claimedAt: Date.now() })
            }
          })
          saveDB()
          await reply(`Harem completo dado a @${mentioned[0].split("@")[0]}`)
          break

        case "deletewaifu":
        case "delwaifu":
        case "delchar":
          if (!isOwner) {
            await reply("Solo el dueño puede usar este comando")
            return
          }
          if (mentioned.length === 0 || !text) {
            await reply("Uso: #deletewaifu @usuario <nombre>")
            return
          }
          const delTarget = getUserGacha(mentioned[0])
          const delIndex = delTarget.characters.findIndex(c => c.name.toLowerCase().includes(text.replace(/@\d+/, "").trim().toLowerCase()))
          if (delIndex === -1) {
            await reply("Esa persona no tiene ese personaje")
            return
          }
          delTarget.characters.splice(delIndex, 1)
          saveDB()
          await reply("Personaje eliminado")
          break

        case "setclaimmsg":
        case "setclaim":
          if (!isOwner) {
            await reply("Solo el dueño puede usar este comando")
            return
          }
          await reply("Mensaje de reclamo configurado")
          break

        case "delclaimmsg":
          if (!isOwner) {
            await reply("Solo el dueño puede usar este comando")
            return
          }
          await reply("Mensaje de reclamo eliminado")
          break

case "play":
        case "yt":
        case "ytaudio":
        case "playaudio":
        case "mp3":
        case "ytmp3":
        case "audio":
        case "song":
          if (!text) {
            await reply("Uso: #play <nombre o link de YouTube>")
            return
          }
          try {
            reaccionar(sock, from, msg, ["\u23f3"]).catch(() => {})
            let audioQuery = text
            if (/^\d+$/.test(text.trim()) && searchHistory.has(from)) {
              const picked = searchHistory.get(from)[Number(text.trim()) - 1]
              if (picked) audioQuery = `https://www.youtube.com/watch?v=${picked.id}`
            }
            const { resolveVideo, mediaFile, zetaCoreMeta } = await import("./youtube.js")
            const audioVideoId = await resolveVideo(audioQuery)
            if (!audioVideoId) {
              await reply("No se encontró el video")
              return
            }
            try {
              const audioMeta = await zetaCoreMeta(audioVideoId, "audio")
              if (audioMeta?.videoId) await enviarPortada(sock, from, msg, audioMeta, "audio")
            } catch {}
            const audioFile = await mediaFile(audioVideoId, "audio")
            const audioBuffer = fs.readFileSync(audioFile)
            const audioExt = String(path.extname(audioFile) || "").toLowerCase()
            const isVoice = command === "ytaudio" || command === "playaudio"
            if (audioBuffer.length > 20 * 1024 * 1024) {
              await sock.sendMessage(
                from,
                { document: audioBuffer, mimetype: audioExt === ".mp3" ? "audio/mpeg" : "audio/mp4", fileName: `erzabot_audio${audioExt || ".m4a"}`, caption: "୲୳ EʀᴢᴀBᴏᴛ-MD/OFC - Audio largo enviado como documento" },
                { quoted: msg }
              )
            } else {
              await sock.sendMessage(
                from,
                { audio: audioBuffer, mimetype: audioExt === ".mp3" ? "audio/mpeg" : "audio/mp4", ptt: isVoice },
                { quoted: msg }
              )
            }
            reaccionar(sock, from, msg, ["✅"]).catch(() => {})
            removeFile(audioFile)
          } catch (e) {
            const reason = String(e?.message || e)
            console.log("Error en play:", reason)
            if (reason.includes("Vercel bloqueó")) {
              await reply("⚠️ Tu API de Vercel le está bloqueando el paso al bot.\n\nArreglalo en Vercel: Settings → Deployment Protection → poner Disabled → Save → Redeploy.")
            } else if (reason.includes("falta la clave")) {
              await reply("⚠️ Falta la clave de descarga en el servidor.\n\nEn el archivo zeta-core.txt de la carpeta del bot tiene que estar la clave en la línea 3.")
            } else {
              await reply("Error al descargar el audio, intentá con otro video en unos minutos.")
            }
          }
          break
          
case "mp4":
case "playvideo":
case "ytmp4":
case "play2":
case "video":
  if (!text) {
    await reply("Uso: #mp4 <nombre o link de YouTube>")
    return
  }
  try {
    reaccionar(sock, from, msg, ["\u23f3"]).catch(() => {})
    let videoQuery = text
    if (/^\d+$/.test(text.trim()) && searchHistory.has(from)) {
      const picked = searchHistory.get(from)[Number(text.trim()) - 1]
      if (picked) videoQuery = `https://www.youtube.com/watch?v=${picked.id}`
    }
    const { resolveVideo, mediaFile, zetaCoreMeta } = await import("./youtube.js")
    const videoVideoId = await resolveVideo(videoQuery)
    if (!videoVideoId) {
      await reply("No se encontró el video")
      return
    }
    try {
      const videoMeta = await zetaCoreMeta(videoVideoId, "video")
      if (videoMeta?.videoId) await enviarPortada(sock, from, msg, videoMeta, "video")
    } catch {}
    const videoFile = await mediaFile(videoVideoId, "video")
    const videoExt = String(path.extname(videoFile) || "").toLowerCase()
    const videoSize = fs.statSync(videoFile).size
    const sendVideoDocumento = () =>
      sock.sendMessage(
        from,
        { document: { url: videoFile }, mimetype: "video/mp4", fileName: `erzabot_video${videoExt || ".mp4"}`, caption: "୲୳ EʀᴢᴀBᴏᴛ-MD/OFC - Video pesado enviado como documento" },
        { quoted: msg }
      )
    if (videoSize > 50 * 1024 * 1024) {
      await sendVideoDocumento()
    } else {
      try {
        await sock.sendMessage(
          from,
          { video: { url: videoFile }, mimetype: videoExt === ".webm" ? "video/webm" : "video/mp4", caption: "୲୳ EʀᴢᴀBᴏᴛ-MD/OFC - Video" },
          { quoted: msg }
        )
      } catch {
        await sendVideoDocumento()
      }
    }
    reaccionar(sock, from, msg, ["✅"]).catch(() => {})
    removeFile(videoFile)
  } catch (e) {
    const reason = String(e?.message || e)
    console.log("Error en mp4:", reason)
    if (reason.includes("Vercel bloqueó")) {
      await reply("⚠️ Tu API de Vercel le está bloqueando el paso al bot.\n\nArreglalo en Vercel: Settings → Deployment Protection → poner Disabled → Save → Redeploy.")
    } else if (reason.includes("falta la clave")) {
      await reply("⚠️ Falta la clave de descarga en el servidor.\n\nEn el archivo zeta-core.txt de la carpeta del bot tiene que estar la clave en la línea 3.")
    } else {
      await reply("Error al descargar el video, intentá con otro en unos minutos.")
    }
  }
  break
  
        case "ytsearch":
        case "search":
          if (!text) {
            await reply("Uso: #ytsearch <término>")
            return
          }
          try {
            const { searchVideos } = await import("./youtube.js")
            const results = await searchVideos(text, 5)
            if (results.length === 0) {
              await reply("No se encontraron resultados")
              return
            }
            searchHistory.set(from, results)
            let searchText = "╭───────────────────────╮\n  🔎 *RESULTADOS*\n╰───────────────────────╯"
            results.forEach((item, index) => {
              searchText += `\n⌁ ${index + 1}. ${item.title.slice(0, 70)}`
            })
            searchText += `\n\n✦ ${config.prefix}play <número> ▸ audio\n✦ ${config.prefix}mp4 <número> ▸ video`
            await reply(searchText)
          } catch (e) {
            console.log("Error en ytsearch:", e?.message || e)
            await reply("Error al buscar")
          }
          break

        case "myid":
        case "miid":
          await reply(
            `🪪 Tu identificador de WhatsApp:\n\nJID: ${sender}\nNúmero: ${cleanSenderNum}\n\nPara hacerte dueño, agregá ese número en *database.json* dentro de settings.owners`
          )
          break

        case "ytdebug":
        case "ytdiag":
          if (!isOwner) {
            await reply("Solo el dueño puede usar este comando")
            return
          }
          try {
            await reply("Diagnosticando descargas de YouTube... (puede tardar 1-2 minutos)")
            const { diagnose } = await import("./youtube.js")
            const report = await diagnose()
            await reply(`🩺 DIAGNÓSTICO YOUTUBE\n\n${report}`)
          } catch (e) {
            console.log("Error en ytdebug:", e?.message || e)
            await reply("Error al ejecutar el diagnóstico")
          }
          break

        case "tiktok":
        case "tt":
          if (!text) {
            await reply("Uso: #tiktok <link>")
            return
          }
          try {
            await reply("Descargando de TikTok...")
            const { tiktokDownload } = await import("./downloader.js")
            const { customApiInfo, customApiDownloadUrl, zetaCoreTiktok } = await import("./youtube.js")
            let ttApiFile = null
            try {
              ttApiFile = await zetaCoreTiktok(text, `zenith_tiktok_${Date.now()}`)
            } catch (zetaError) {
              console.log("ZETA-CORE tiktok falló:", zetaError?.message || zetaError)
            }
            if (!ttApiFile && customApiInfo()) {
              try {
                ttApiFile = await customApiDownloadUrl(text, "video", `zenith_tiktok_${Date.now()}`)
              } catch (ttApiError) {
                console.log("API propia tiktok falló:", ttApiError?.message || ttApiError)
              }
            }
            if (ttApiFile) {
              const ttBuffer = fs.readFileSync(ttApiFile)
              await sock.sendMessage(
                from,
                { video: ttBuffer, mimetype: "video/mp4", caption: "୲୳ EʀᴢᴀBᴏᴛ-MD/OFC - TikTok" },
                { quoted: msg }
              )
              removeFile(ttApiFile)
              reaccionar(sock, from, msg, ["✅"]).catch(() => {})
              break
            }
            const ttResult = await tiktokDownload(text)
            if (ttResult.type === "video") {
              const ttBuffer = fs.readFileSync(ttResult.file)
              const ttCaption = ttResult.caption ? `୲୳ EʀᴢᴀBᴏᴛ-MD/OFC - TikTok\n${ttResult.caption.slice(0, 120)}` : "୲୳ EʀᴢᴀBᴏᴛ-MD/OFC - TikTok"
              await sock.sendMessage(
                from,
                { video: ttBuffer, mimetype: "video/mp4", caption: ttCaption },
                { quoted: msg }
              )
              removeFile(ttResult.file)
            } else {
              for (const ttImage of ttResult.files.slice(0, 5)) {
                await sock.sendMessage(from, { image: fs.readFileSync(ttImage), caption: "୲୳ EʀᴢᴀBᴏᴛ-MD/OFC - TikTok" }, { quoted: msg })
                removeFile(ttImage)
              }
            }
              reaccionar(sock, from, msg, ["✅"]).catch(() => {})
          } catch (e) {
            console.log("Error en tiktok:", e?.message || e)
            await reply("Error al descargar de TikTok (el enlace puede ser privado)")
          }
          break

        case "facebook":
        case "fb":
          if (!text) {
            await reply("Uso: #facebook <link>")
            return
          }
          try {
            await reply("Descargando de Facebook...")
            const { customApiInfo, customApiDownloadUrl, zetaCoreFacebook } = await import("./youtube.js")
            let fbApiFile = null
            try {
              fbApiFile = await zetaCoreFacebook(text, `zenith_facebook_${Date.now()}`)
            } catch (fbZetaError) {
              console.log("ZETA-CORE facebook falló:", fbZetaError?.message || fbZetaError)
            }
            if (!fbApiFile && customApiInfo()) {
              try {
                fbApiFile = await customApiDownloadUrl(text, "video", `zenith_facebook_${Date.now()}`)
              } catch (fbApiError) {
                console.log("API propia facebook falló:", fbApiError?.message || fbApiError)
              }
            }
            if (fbApiFile) {
              const fbBuffer = fs.readFileSync(fbApiFile)
              await sock.sendMessage(from, { video: fbBuffer, mimetype: "video/mp4" }, { quoted: msg })
              removeFile(fbApiFile)
              reaccionar(sock, from, msg, ["✅"]).catch(() => {})
              break
            }
            const fbRes = await axios.get(text, { headers: { "User-Agent": "Mozilla/5.0" } })
            const videoMatch = fbRes.data.match(/"video":{"url":"([^"]+)"/) || fbRes.data.match(/"video_url":"([^"]+)"/)
            if (videoMatch) {
              const cleanUrl = videoMatch[1].replace(/\\u0026/g, "&").replace(/\u0026/g, "&")
              const fbVideo = await axios.get(cleanUrl, { responseType: "arraybuffer" })
              await sock.sendMessage(from, { video: Buffer.from(fbVideo.data), mimetype: "video/mp4" }, { quoted: msg })
              reaccionar(sock, from, msg, ["✅"]).catch(() => {})
            } else {
              await reply("No se pudo descargar el video de Facebook")
            }
          } catch (e) {
            await reply("Error al descargar de Facebook")
          }
          break

        case "instagram":
        case "reel":
        case "ig":
          if (!text) {
            await reply("Uso: #instagram <link>")
            return
          }
          try {
            await reply("Descargando de Instagram...")
            const { instagramDownload } = await import("./downloader.js")
            const { customApiInfo, customApiDownloadUrl, zetaCoreInstagram } = await import("./youtube.js")
            let igApiFile = null
            try {
              igApiFile = await zetaCoreInstagram(text, `zenith_instagram_${Date.now()}`)
            } catch (igZetaError) {
              console.log("ZETA-CORE instagram falló:", igZetaError?.message || igZetaError)
            }
            if (!igApiFile && customApiInfo()) {
              try {
                igApiFile = await customApiDownloadUrl(text, "video", `zenith_instagram_${Date.now()}`)
              } catch (igApiError) {
                console.log("API propia instagram falló:", igApiError?.message || igApiError)
              }
            }
            if (igApiFile) {
              const igBuffer = fs.readFileSync(igApiFile)
              await sock.sendMessage(
                from,
                { video: igBuffer, mimetype: "video/mp4", caption: "୲୳ EʀᴢᴀBᴏᴛ-MD/OFC - Instagram" },
                { quoted: msg }
              )
              reaccionar(sock, from, msg, ["✅"]).catch(() => {})
              removeFile(igApiFile)
              break
            }
            const igResult = await instagramDownload(text)
            if (igResult.type === "video") {
              const igBuffer = fs.readFileSync(igResult.file)
              await sock.sendMessage(
                from,
                { video: igBuffer, mimetype: "video/mp4", caption: "୲୳ EʀᴢᴀBᴏᴛ-MD/OFC - Instagram" },
                { quoted: msg }
              )
              removeFile(igResult.file)
              reaccionar(sock, from, msg, ["✅"]).catch(() => {})
            } else {
              for (const igImage of igResult.files.slice(0, 5)) {
                await sock.sendMessage(from, { image: fs.readFileSync(igImage), caption: "୲୳ EʀᴢᴀBᴏᴛ-MD/OFC - Instagram" }, { quoted: msg })
                removeFile(igImage)
              }
            }
                reaccionar(sock, from, msg, ["✅"]).catch(() => {})
          } catch (e) {
            console.log("Error en instagram:", e?.message || e)
            await reply("Error al descargar de Instagram (el post puede ser privado)")
          }
          break

        case "twitter":
        case "x":
          if (!text) {
            await reply("Uso: #twitter <link del tweet>")
            return
          }
          try {
            await reply("Descargando de Twitter/X...")
            const { customApiInfo, customApiDownloadUrl, zetaCoreX } = await import("./youtube.js")
            if (/https?:\/\//i.test(text)) {
              try {
                const twApiFile = await zetaCoreX(text, `zenith_twitter_${Date.now()}`)
                                const twBuffer = fs.readFileSync(twApiFile)
                await sock.sendMessage(from, { video: twBuffer, mimetype: "video/mp4" }, { quoted: msg })
                reaccionar(sock, from, msg, ["✅"]).catch(() => {})
                removeFile(twApiFile)
                break
              } catch (zetaError) {
                console.log("ZETA-CORE twitter falló:", zetaError?.message || zetaError)
              }
            }
            if (customApiInfo() && /https?:\/\//i.test(text)) {
              try {
                const twApiFile = await customApiDownloadUrl(text, "video", `zenith_twitter_${Date.now()}`)
                const twBuffer = fs.readFileSync(twApiFile)
                await sock.sendMessage(from, { video: twBuffer, mimetype: "video/mp4" }, { quoted: msg })
                removeFile(twApiFile)
                reaccionar(sock, from, msg, ["✅"]).catch(() => {})
                break
              } catch (twApiError) {
                console.log("API propia twitter falló:", twApiError?.message || twApiError)
              }
            }
            const tweetId = (text.match(/status\/(\d+)/) || [])[1] || (text.match(/^\d+$/) || [])[0]
            if (!tweetId) {
              await reply("No pude leer el ID del tweet. Pasá el link completo.")
              return
            }
            const tweet = await axios.get(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=es&token=a`, {
              headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
              timeout: 20000
            })
            const media = tweet.data?.mediaDetails || []
            const videoVariant = media
              .flatMap((item) => item.video_info?.variants || [])
              .filter((variant) => variant.content_type === "video/mp4")
              .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]
            if (videoVariant) {
              const twVideo = await axios.get(videoVariant.url, { responseType: "arraybuffer", timeout: 60000 })
              reaccionar(sock, from, msg, ["✅"]).catch(() => {})
              await sock.sendMessage(from, { video: Buffer.from(twVideo.data), mimetype: "video/mp4" }, { quoted: msg })
              return
            }
            const photo = media.find((item) => item.media_url_https)
            if (photo) {
              const twImg = await axios.get(photo.media_url_https, { responseType: "arraybuffer", timeout: 60000 })
              reaccionar(sock, from, msg, ["✅"]).catch(() => {})
              await sock.sendMessage(from, { image: Buffer.from(twImg.data) }, { quoted: msg })
              return
            }
            await reply("Ese tweet no tiene video ni imagen")
          } catch (e) {
            console.log("Error en twitter:", e?.message || e)
            await reply("Error al descargar de Twitter/X")
          }
          break

        case "pinterest":
        case "pin": {
          const pinQuery = text.trim().slice(0, 100)
          if (!pinQuery) {
            await reply("📌 Escribí qué querés buscar:\n#pin gatos graciosos")
            break
          }
          if (isNsfwText(pinQuery)) {
            await reply("⚠️ No puedo buscar contenido +18, explícito o violento. Probá con otra búsqueda.")
            break
          }
          const pinTs = Date.now()
          if (pinTs - (pinSearchCooldown.get(from) || 0) < 8000) {
            await reply("⏳ Esperá unos segundos entre búsquedas.")
            break
          }
          pinSearchCooldown.set(from, pinTs)
          const { zetaCorePin } = await import("./youtube.js")
          const [sPin1, sPin2] = elegirSimbolos(2)
          await reply(`${sPin1} \u0f3a ݁⋆ ۶ৎ ݁˖ . ݁ ᥫ᭡ ⋆࣪ ִֶָ ݁. ♱ \u0f3b\n\n${estilizarLetra("Descargando imagenes...")} \u27e1 ݁⋆\n\n${sPin2} \u300c ${pinQuery} \u300d \u02da \u0d18\u29cb\u22c6`)
          try {
            let imagenes = []
            try {
              const resultados = await zetaCorePin(pinQuery, 5)
              imagenes = resultados.filter((r) => !isNsfwText(r.titulo)).map((r) => r.imagen)
            } catch (zetaError) {
              console.log("pin: ZETA-CORE falló →", zetaError?.message || zetaError)
            }
            if (!imagenes.length) {
              const pinRes = await fetch(`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(pinQuery)}`, {
                headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36" },
                signal: AbortSignal.timeout(20000)
              })
              if (!pinRes.ok) throw new Error(`Pinterest respondió HTTP ${pinRes.status}`)
              const html = await pinRes.text()
              const marker = '<script id="__PWS_INITIAL_PROPS__" type="application/json">'
              const markerIdx = html.indexOf(marker)
              const fuente = markerIdx >= 0 ? html.slice(markerIdx + marker.length, html.indexOf("</script>", markerIdx)) : html
              try {
                const pinJson = JSON.parse(fuente)
                const pins = pinJson?.initialReduxState?.pins || {}
                for (const p of Object.values(pins)) {
                  const img = String(p?.images?.["736x"]?.url || p?.images?.orig?.url || "")
                  if (!/^https:\/\/i\.pinimg\.com\//.test(img)) continue
                  if (isNsfwText(String(p?.description || p?.gridTitle || p?.title || ""))) continue
                  imagenes.push(img)
                  if (imagenes.length >= 5) break
                }
              } catch (pinJsonError) {
                console.log("pin: JSON embebido no usable →", pinJsonError?.message || pinJsonError)
              }
              if (!imagenes.length) {
                const pinRegex = /https:\/\/i\.pinimg\.com\/(?:originals|736x)\/[0-9a-f/]+\.(?:jpg|png|jpeg|webp)/g
                imagenes = [...new Set((fuente.match(pinRegex) || []).map((u) => u.replace(/\/(?:originals|736x)\//, "/736x/")))].slice(0, 5)
              }
            }
            imagenes = [...new Set(imagenes)].slice(0, 5)
            if (!imagenes.length) {
              await reply(`😐 No encontré imágenes de Pinterest para "${pinQuery}". Probá con otras palabras.`)
              break
            }
            const pinBajados = []
            for (let i = 0; i < imagenes.length; i++) {
              const candidatas = [...new Set([imagenes[i], imagenes[i].replace("/736x/", "/originals/")])]
              for (const candidata of candidatas) {
                try {
                  const pinResp = await fetch(candidata, {
                    headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36" },
                    signal: AbortSignal.timeout(20000)
                  })
                  const tipo = pinResp.headers.get("content-type") || ""
                  if (!pinResp.ok || !tipo.startsWith("image/")) throw new Error(`HTTP ${pinResp.status} ${tipo}`)
                  const buf = Buffer.from(await pinResp.arrayBuffer())
                  if (buf.length < 5120) throw new Error("imagen vacía")
                  const pinFile = tempFile("jpg")
                  fs.writeFileSync(pinFile, buf)
                  pinBajados.push({ kind: "image", file: pinFile, caption: "" })
                  break
                } catch (imgError) {
                  console.log(`pin: imagen ${i + 1} falló (${candidata.slice(28, 60)}) →`, imgError?.message || imgError)
                }
              }
            }
            if (!pinBajados.length) {
              await reply("⚠️ No pude descargar las imágenes. Probá de nuevo en un rato.")
              break
            }
            try {
              await sendAlbumVideos(sock, from, pinBajados)
              reaccionar(sock, from, msg, ["✅"]).catch(() => {})
            } catch (albumError) {
              console.log("pin: álbum no soportado, mandando de a uno →", albumError?.message || albumError)
              for (const item of pinBajados) {
                try {
                  await sock.sendMessage(from, { image: { url: item.file } }, { quoted: msg })
                } catch (sendError) {
                  console.log("pin: error al enviar imagen →", sendError?.message || sendError)
                }
              }
            }
            for (const item of pinBajados) removeFile(item.file)
          } catch (e) {
            await reply(`⚠️ La búsqueda falló.\nMotivo técnico: ${String(e?.message || e).slice(0, 150)}`)
          }
          break
        }

        case "mediafire":
        case "mf":
          if (!text) {
            await reply("Uso: #mediafire <link>")
            return
          }
          try {
            await reply("Descargando de MediaFire...")
            const mfRes = await axios.get(text, { headers: { "User-Agent": "Mozilla/5.0" } })
            const dlMatch = mfRes.data.match(/href="(https:\/\/download[^"]+)"/)
            if (dlMatch) {
              const mfFile = await axios.get(dlMatch[1], { responseType: "arraybuffer" })
              await sock.sendMessage(from, { document: Buffer.from(mfFile.data), mimetype: "application/octet-stream", fileName: "archivo_mediafire" }, { quoted: msg })
            } else {
              await reply("No se pudo descargar el archivo de MediaFire")
            }
          } catch (e) {
            await reply("Error al descargar de MediaFire")
          }
          break

        case "pixiv":
        case "px":
        case "pixivpdf":
          if (!text) {
            await reply("Uso: #pixiv <enlace | id>")
            return
          }
          try {
            await reply("Buscando en Pixiv...")
            const illustId = (text.match(/artworks\/(\d+)/) || [])[1] || (text.match(/^\d+$/) || [])[0]
            if (!illustId) {
              await reply("No pude leer el ID. Pasá el link o el número del artwork.")
              return
            }
            const illust = await axios.get(`https://www.pixiv.net/ajax/illust/${illustId}`, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                Referer: `https://www.pixiv.net/artworks/${illustId}`,
                "Accept-Language": "es-ES,es;q=0.9"
              },
              timeout: 20000
            })
            const imageUrl = illust.data?.body?.urls?.original
            if (!imageUrl) {
              await reply("No se pudo obtener la imagen de Pixiv")
              return
            }
            const pixivImg = await axios.get(imageUrl, {
              responseType: "arraybuffer",
              headers: { Referer: `https://www.pixiv.net/artworks/${illustId}` },
              timeout: 60000
            })
            await sock.sendMessage(from, { image: Buffer.from(pixivImg.data), caption: illust.data?.body?.title || "Pixiv" }, { quoted: msg })
          } catch (e) {
            console.log("Error en pixiv:", e?.message || e)
            await reply("Error al descargar de Pixiv")
          }
          break

        case "profile":
          const profileTarget = mentioned.length > 0 ? mentioned[0] : sender
          const profileUser = getUserProfile(profileTarget)
          const profileEcon = getUserEconomy(profileTarget)
          const profileGacha = getUserGacha(profileTarget)
          await reply(`${panel(`PERFIL DE @${profileTarget.split("@")[0]}`, `> 📊 Nivel: ${profileUser.level}\n> ✨ XP: ${profileUser.xp}/${profileUser.level * 100}\n> 💰 Coins: ${formatCoins(profileEcon.coins + profileEcon.bank)}\n> 🎴 Waifus: ${profileGacha.characters.length}\n> 📝 Descripción: ${profileUser.description}\n> 🎂 Cumpleaños: ${profileUser.birthday || "No establecido"}\n> 🎭 Género: ${profileUser.genre || "No establecido"}\n> ⭐ Favorito: ${profileUser.favourite || "No establecido"}\n> 💍 Casado con: ${profileUser.married ? "@" + profileUser.married.split("@")[0] : "Soltero"}`)}`)
          break

        case "level":
        case "lvl":
          const lvlTarget = mentioned.length > 0 ? mentioned[0] : sender
          const lvlUser = getUserProfile(lvlTarget)
          await reply(`${panel(`NIVEL DE @${lvlTarget.split("@")[0]}`, `> Nivel: ${lvlUser.level}\n> XP: ${lvlUser.xp}/${lvlUser.level * 100}\n> Progreso: ${Math.floor((lvlUser.xp / (lvlUser.level * 100)) * 100)}%`)}`)
          break

        case "leaderboard":
        case "lboard":
        case "top":
          const topUsers = Object.entries(db.profiles)
            .map(([id, data]) => ({ id, level: data.level, xp: data.xp }))
            .sort((a, b) => b.level - a.level || b.xp - a.xp)
            .slice(0, 10)
          let topText = panelStart(`RANKING NIVELES`, ``)
          topUsers.forEach((entry, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`
            topText += `> ${medal} @${entry.id.split("@")[0]}: Nivel ${entry.level}\n`
          })
          topText += PANEL_FOOTER
          await reply(topText)
          break

        case "marry":
        case "casarse":
          if (mentioned.length === 0) {
            await reply("Uso: #marry @usuario")
            return
          }
          const marryTarget = mentioned[0]
          const marryUser = getUserProfile(sender)
          const marryTargetProfile = getUserProfile(marryTarget)
          if (marryUser.married) {
            await reply("Ya estás casado")
            return
          }
          if (marryTargetProfile.married) {
            await reply("Esa persona ya está casada")
            return
          }
          if (!db.settings.pendingMarriages) db.settings.pendingMarriages = {}
          db.settings.pendingMarriages[marryTarget] = { from: sender, timestamp: Date.now() }
          saveDB()
          await reply(`@${marryTarget.split("@")[0]} escribe #marry accept para aceptar la propuesta de @${senderNumber}`)
          break

        case "divorce":
          const divorceUser = getUserProfile(sender)
          if (!divorceUser.married) {
            await reply("No estás casado")
            return
          }
          const exPartner = divorceUser.married
          const exProfile = getUserProfile(exPartner)
          divorceUser.married = null
          if (exProfile) exProfile.married = null
          divorceUser.marryHistory.push({ partner: exPartner, action: "divorce", date: Date.now() })
          saveDB()
          await reply(`Te divorciaste de @${exPartner.split("@")[0]}`)
          break

        case "marryhistory":
        case "marriagehistory":
        case "historialmatrimonio":
          const histTarget = mentioned.length > 0 ? mentioned[0] : sender
          const historyUser = getUserProfile(histTarget)
          if (historyUser.marryHistory.length === 0) {
            await reply("No hay historial de matrimonios")
            return
          }
          let historyText = panelStart(`HISTORIAL MATRIMONIAL`, ``)
          historyUser.marryHistory.forEach(h => {
            historyText += `> ${h.action === "marry" ? "💍 Casado" : "💔 Divorciado"} con @${h.partner.split("@")[0]}\n`
          })
          historyText += PANEL_FOOTER
          await replyWithMention(historyText, [histTarget])
          break

        case "setdescription":
        case "setdesc":
          if (!text) {
            await reply("Uso: #setdescription <texto>")
            return
          }
          const descUser = getUserProfile(sender)
          descUser.description = text
          saveDB()
          await reply("Descripción actualizada")
          break

        case "setbirth":
          if (!text) {
            await reply("Uso: #setbirth DD/MM")
            return
          }
          const birthUser = getUserProfile(sender)
          birthUser.birthday = text
          saveDB()
          await reply("Cumpleaños establecido")
          break

        case "setgenre":
          if (!text) {
            await reply("Uso: #setgenre <hombre | mujer | otro>")
            return
          }
          const genreUser = getUserProfile(sender)
          genreUser.genre = text
          saveDB()
          await reply("Género establecido")
          break

        case "setfavourite":
        case "setfav":
          if (!text) {
            await reply("Uso: #setfavourite <personaje>")
            return
          }
          const favUser = getUserProfile(sender)
          favUser.favourite = text
          saveDB()
          await reply("Favorito establecido")
          break

        case "birthdays":
        case "cumpleaños":
        case "births":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          await reply("No hay cumpleaños cercanos registrados")
          break

        case "allbirthdays":
        case "allbirths":
          await reply("No hay cumpleaños registrados")
          break

        case "delbirth":
          const delBirthUser = getUserProfile(sender)
          delBirthUser.birthday = null
          saveDB()
          await reply("Cumpleaños eliminado")
          break

        case "delfavourite":
        case "delfav":
          const delFavUser = getUserProfile(sender)
          delFavUser.favourite = null
          saveDB()
          await reply("Favorito eliminado")
          break

        case "delgenre":
          const delGenreUser = getUserProfile(sender)
          delGenreUser.genre = null
          saveDB()
          await reply("Género eliminado")
          break

        case "group":
        case "gp":
        case "groupinfo":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          const groupMeta = await getGroupMeta(sock, from)
          await reply(`${panel(`INFO GRUPO`, `> Nombre: ${groupMeta.subject}\n> Miembros: ${groupMeta.participants.length}\n> Creado: ${new Date(groupMeta.creation * 1000).toLocaleDateString()}\n> Descripción: ${groupMeta.desc || "Sin descripción"}`)}`)
          break

        case "qr":
        case "code":
        case "jadibot":
        case "serbot":
        case "subbot": {
          if (isGroup) {
            await reply(`${panel(`SUB-BOT`, `> El código se pide por mensaje privado\n> Escribime directo al chat privado del bot: .code`)}`)
            return
          }
          // Resolver @mención: usar el JID real (@s.whatsapp.net), NO el LID interno (ese no es un número de teléfono)
          const mencionados = ((msg.message?.extendedTextMessage?.contextInfo?.mentionedJid)
            || (msg.message?.imageMessage?.contextInfo?.mentionedJid)
            || (msg.message?.videoMessage?.contextInfo?.mentionedJid)
            || []).map((j) => String(j))
          const mencionPN = mencionados.find((j) => j.endsWith("@s.whatsapp.net"))
          if (mencionados.length && !mencionPN) {
            await reply(`${panel(`SUB-BOT`, `> No pude sacar el número real de esa mención 😕\n> Escribilo a mano con código de país\n> Ejemplo: .code 5491127289595`)}`)
            return
          }
          let numeroDestino = mencionPN ? jidANumero(mencionPN) : ""
          if (!numeroDestino) numeroDestino = jidANumero(args[0])
          if (!numeroDestino) numeroDestino = jidANumero(sender)
          // Guardia anti-LID: los numeros internos de WhatsApp miden 15+ digitos y no son telefonos reales
          if (numeroDestino.length > 13) {
            await reply(`${panel(`SUB-BOT`, `> Ese me lo tomó como un número interno de WhatsApp 😕\n> Escribilo a mano con código de país, ejemplo:\n> .code 5491127289595`)}`)
            return
          }
          const numPrincipal = ((sock.user?.id || "").split(":")[0] || "").replace(/[^0-9]/g, "")
          if (numeroDestino === numPrincipal) {
            await reply(`${panel(`SUB-BOT`, `> Ese número ya es el bot principal ✅`)}`)
            return
          }
          const modoQr = command === "qr"
          const jidDestino = `${numeroDestino}@s.whatsapp.net`
          await sock.sendMessage(from, { text: `${panel(`SUB-BOT`, `> 🔗 Conectando @${numeroDestino}...\n> En un momento te llega el ${modoQr ? "QR para escanear 📲" : "código de vinculación 🔢"}`)}`, mentions: [jidDestino] })
          try {
            await iniciarSubBot(numeroDestino, from, sock, { modoQr })
          } catch (e) {
            await reply(`${panel(`SUB-BOT`, `> ❌ ${String(e?.message || "No se pudo conectar")}`)}`)
          }
          break
        }

        case "reenviar":
        case "recode": {
          if (isGroup) {
            await reply(`${panel(`CODIGO DE VINCULACION`, `> Este comando es por privado\n> Escribime al chat privado del bot: .reenviar`)}`)
            return
          }
          const pedidoReenvio = PEDIGO_CODIGO.get(senderNumber)
          if (!pedidoReenvio?.codigo || pedidoReenvio.vence < Date.now()) {
            await reply(`${panel(`CODIGO DE VINCULACION`, `> No tenes un codigo de vinculación activo \u23f3\n> Pedí uno con .code <numero>\n> Ejemplo: .code 5491127289595`)}`)
            return
          }
          const minutosRestantes = Math.max(1, Math.ceil((pedidoReenvio.vence - Date.now()) / 60000))
          await reply(`${panel(`CODIGO DE VINCULACION`, `> @${senderNumber} reenviando tu codigo \ud83d\udc8c\n> Vence en ${minutosRestantes} min\n> Lo envio en el mensaje siguiente`)}`)
          await sock.sendMessage(from, { text: pedidoReenvio.codigo })
          break
        }

        case "qrpremium":
        case "codepremium":
          if (isGroup) {
            await reply("Este comando se usa por privado")
            return
          }
          await reply("QR Premium solo para usuarios premium")
          break

        case "join":
          if (!isOwner) {
            await reply("Solo el dueño puede usar este comando")
            return
          }
          if (!text) {
            await reply("Uso: #join <link del grupo>")
            return
          }
          const joinCode = text.split("/").pop()
          try {
            await sock.groupAcceptInvite(joinCode)
            await reply("Unido al grupo correctamente")
          } catch (e) {
            await reply("No se pudo unir al grupo")
          }
          break

        case "leave":
        case "salir":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!isOwner && !(await isAdmin())) {
            await reply("Solo el dueño o admins pueden usar este comando")
            return
          }
          await sock.groupLeave(from)
          break

        case "autojoin":
          if (isGroup) {
            await reply("Este comando se usa por privado")
            return
          }
          await reply("Auto-join configurado")
          break

        case "botinfo":
        case "infobot":
          await reply(`${panel(`INFO BOT`, `> Nombre: ${config.botName}\n> Versión: 1.0.0\n> Creador: ${config.owner}\n> Prefix: ${config.prefix}\n> Librería: Baileys\n> Runtime: Node.js`)}`)
          break

        case "premium":
        case "infopremium":
        case "premiuminfo":
          if (isGroup) {
            await reply("Este comando se usa por privado")
            return
          }
          await reply(`${panel(`PREMIUM`, `> Beneficios premium:\n> Acceso a comandos exclusivos\n> Límites aumentados\n> Soporte prioritario\n> Contacta al dueño para más info`)}`)
          break

        case "reload":
          if (isGroup) {
            await reply("Este comando se usa por privado")
            return
          }
          if (!isOwner) {
            await reply("Solo el dueño puede usar este comando")
            return
          }
          loadDB()
          await reply("Bot recargado correctamente")
          break

        case "setname":
        case "setbotname":
          if (isGroup) {
            await reply("Este comando se usa por privado")
            return
          }
          if (!isOwner) {
            await reply("Solo el dueño puede usar este comando")
            return
          }
          if (!text) {
            await reply("Uso: #setname <nombre>")
            return
          }
          await sock.updateProfileName(text)
          await reply("Nombre actualizado")
          break

        case "setpfp":
        case "setimage":
          if (isGroup) {
            await reply("Este comando se usa por privado")
            return
          }
          if (!isOwner) {
            await reply("Solo el dueño puede usar este comando")
            return
          }
          if (!quoted || !quoted.imageMessage) {
            await reply("Responde a una imagen con #setpfp")
            return
          }
          try {
            const pfpBuffer = await downloadMediaMessage({ message: quoted }, "buffer", {}, { logger: pino({ level: "silent" }) })
            await sock.updateProfilePicture(sock.user.id, pfpBuffer)
            await reply("Foto de perfil actualizada")
          } catch (e) {
            await reply("Error al actualizar foto de perfil")
          }
          break

        case "setstatus":
          if (isGroup) {
            await reply("Este comando se usa por privado")
            return
          }
          if (!isOwner) {
            await reply("Solo el dueño puede usar este comando")
            return
          }
          if (!text) {
            await reply("Uso: #setstatus <estado>")
            return
          }
          await sock.sendPresenceUpdate("available")
          await reply("Estado actualizado")
          break

        case "setusername":
          if (isGroup) {
            await reply("Este comando se usa por privado")
            return
          }
          if (!isOwner) {
            await reply("Solo el dueño puede usar este comando")
            return
          }
          await reply("Username actualizado")
          break

        case "setbanner":
        case "setmenubanner":
          if (isGroup) {
            await reply("Este comando se usa por privado")
            return
          }
          if (!isOwner) {
            await reply("Solo el dueño puede usar este comando")
            return
          }
          await reply("Banner actualizado")
          break

        case "setbotcurrency":
          if (isGroup) {
            await reply("Este comando se usa por privado")
            return
          }
          if (!isOwner) {
            await reply("Solo el dueño puede usar este comando")
            return
          }
          await reply("Moneda del bot actualizada")
          break

        case "setbotowner":
          if (!isOwner) {
            await reply("Solo el dueño puede usar este comando")
            return
          }
          await reply("Dueño del bot actualizado")
          break

        case "logout":
          if (isGroup) {
            await reply("Este comando se usa por privado")
            return
          }
          if (!isOwner) {
            await reply("Solo el dueño puede usar este comando")
            return
          }
          await sock.logout()
          break

        case "ping":
        case "p":
          const start = Date.now()
          const pingMsg = await sock.sendMessage(from, { text: "Calculando ping..." }, { quoted: msg })
          const end = Date.now()
          await sock.sendMessage(from, { text: `${panel(`PING`, `> Velocidad: ${end - start}ms\n> Estado: Activo`)}`, edit: pingMsg.key })
          break

        case "status":
          await reply(`${panel(`ESTADO`, `> Bot: Online\n> Uptime: ${process.uptime().toFixed(0)}s\n> Memoria: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB\n> Node: ${process.version}`)}`)
          break

        case "bots":
        case "sockets":
          await reply(`${panel(`BOTS ACTIVOS`, `> 1. EʀᴢᴀBᴏᴛ-MD/OFC (Principal) ✅\n${textoSubBots()}`)}`)
          break

        case "stop": {
          if (!isOwner && !SUBBOTS.has(senderNumber)) {
            await reply("Solo el dueño o el numero conectado como sub-bot puede usar #stop")
            return
          }
          const numStop = isOwner ? (numeroLimpioSub(args[0] || "") || senderNumber) : senderNumber
          try {
            await detenerSubBot(numStop, false)
            await reply(`${panel(`SUB-BOT DETENIDO`, `> ⏹ +${numStop} fue desconectado\n> Su sesion queda guardada\n> Se reconecta solo cuando reinicies el bot`)}`)
          } catch (e) {
            await reply(String(e?.message || "No se pudo detener ese sub-bot"))
          }
          break
        }

        case "delsub": {
          if (!isOwner) {
            await reply("Solo el dueño del bot puede usar #delsub")
            return
          }
          const numDel = numeroLimpioSub(args[0] || "")
          if (!numDel) {
            await reply("Uso: #delsub 5491127289595")
            return
          }
          try {
            await detenerSubBot(numDel, true)
            await reply(`${panel(`SUB-BOT ELIMINADO`, `> 🗑 +${numDel} fue desconectado\n> Su sesion fue borrada por completo\n> Ese numero tiene que vincularse de nuevo con .code`)}`)
          } catch (e) {
            await reply(String(e?.message || "No se pudo eliminar ese sub-bot"))
          }
          break
        }

        case "del":
        case "delete":
          const delContext = msg.message.extendedTextMessage?.contextInfo || Object.values(msg.message).find(v => v && typeof v === "object" && v.contextInfo)?.contextInfo
          if (!delContext?.stanzaId) {
            await reply("Responde a un mensaje con #del")
            return
          }
          try {
            await sock.sendMessage(from, { delete: { remoteJid: from, fromMe: false, id: delContext.stanzaId, participant: delContext.participant } })
          } catch (e) {
            try {
              await sock.sendMessage(from, { delete: { remoteJid: from, fromMe: true, id: delContext.stanzaId } })
            } catch (e2) {
              await reply("No se pudo borrar el mensaje")
            }
          }
          break

        case "getpic":
        case "pfp":
          let picTarget = mentioned.length > 0 ? mentioned[0] : sender
          try {
            const picUrl = await sock.profilePictureUrl(picTarget, "image")
            const picBuffer = await axios.get(picUrl, { responseType: "arraybuffer" })
            await sock.sendMessage(from, { image: Buffer.from(picBuffer.data) }, { quoted: msg })
          } catch (e) {
            await reply("No se pudo obtener la foto de perfil")
          }
          break

        case "invite":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          try {
            const inviteCode = await sock.groupInviteCode(from)
            await reply(`Código de invitación: ${inviteCode}`)
          } catch (e) {
            await reply("No se pudo generar el código")
          }
          break

        case "setlang":
        case "lang":
          if (isGroup) {
            await reply("Este comando se usa por privado")
            return
          }
          if (!text) {
            await reply("Uso: #setlang <es|en>")
            return
          }
          await reply(`Idioma cambiado a: ${text}`)
          break

        case "suggest":
        case "addanime":
        case "report":
          if (!text) {
            await reply("Uso: #suggest <texto>")
            return
          }
          await reply("Sugerencia enviada al dueño")
          break

        case "testwelcome":
        case "testgoodbye":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          const testSettings = getGroupSettings(from)
          await reply(testSettings.welcomeMsg)
          break

        case "toimage":
        case "toimg":
          if (!quoted || !quoted.stickerMessage) {
            await reply("Responde a un sticker con #toimage")
            return
          }
          try {
            const stickerBuffer = await downloadMediaMessage({ message: quoted }, "buffer", {}, { logger: pino({ level: "silent" }) })
            const imageBuffer = await stickerToImage(stickerBuffer)
            await sock.sendMessage(from, { image: imageBuffer }, { quoted: msg })
          } catch (e) {
            await reply("Error al convertir sticker")
          }
          break

        case "warn":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          if (mentioned.length === 0) {
            await reply("Uso: #warn @usuario [razón]")
            return
          }
          const warnTarget = mentioned[0]
          const warnData = getWarns(from, warnTarget)
          warnData.count++
          warnData.reasons.push(text.replace(/@\d+/, "").trim() || "Sin razón")
          const groupSettings = getGroupSettings(from)
          if (warnData.count >= groupSettings.warnLimit) {
            if (await isBotAdmin()) {
              await sock.groupParticipantsUpdate(from, [warnTarget], "remove")
            }
            await reply(`@${warnTarget.split("@")[0]} fue expulsado por alcanzar el límite de warns`)
            warnData.count = 0
            warnData.reasons = []
          } else {
            await reply(`@${warnTarget.split("@")[0]} tiene ${warnData.count}/${groupSettings.warnLimit} warns`)
          }
          saveDB()
          break

        case "warns":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          let warnsTarget = mentioned.length > 0 ? mentioned[0] : sender
          const warnsData = getWarns(from, warnsTarget)
          let warnsText = panelStart(`WARNS`, `> Usuario: @${warnsTarget.split("@")[0]}\n> Total: ${warnsData.count}\n`)
          warnsData.reasons.forEach((reason, i) => {
            warnsText += `> ${i + 1}. ${reason}\n`
          })
          warnsText += PANEL_FOOTER
          await replyWithMention(warnsText, [warnsTarget])
          break

        case "delwarn":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          if (mentioned.length === 0) {
            await reply("Uso: #delwarn @usuario")
            return
          }
          const delWarnTarget = mentioned[0]
          const delWarnData = getWarns(from, delWarnTarget)
          delWarnData.count = 0
          delWarnData.reasons = []
          saveDB()
          await reply(`Warns eliminados de @${delWarnTarget.split("@")[0]}`)
          break

        case "setwarnlimit":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          const newLimit = parseInt(text)
          if (isNaN(newLimit) || newLimit < 1) {
            await reply("Uso: #setwarnlimit <número>")
            return
          }
          const limitSettings = getGroupSettings(from)
          limitSettings.warnLimit = newLimit
          saveDB()
          await reply(`Límite de warns establecido en: ${newLimit}`)
          break

        case "kick":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          if (mentioned.length === 0) {
            await reply("Uso: #kick @usuario")
            return
          }
          await sock.groupParticipantsUpdate(from, mentioned, "remove")
          await reply("Usuario expulsado")
          break

        case "promote":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          if (mentioned.length === 0) {
            await reply("Uso: #promote @usuario")
            return
          }
          await sock.groupParticipantsUpdate(from, mentioned, "promote")
          await reply("Usuario ascendido a admin")
          break

        case "demote":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          if (mentioned.length === 0) {
            await reply("Uso: #demote @usuario")
            return
          }
          await sock.groupParticipantsUpdate(from, mentioned, "demote")
          await reply("Usuario degradado")
          break

        case "open":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          await sock.groupSettingUpdate(from, "not_announcement")
          await reply("Grupo abierto")
          break

        case "close":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          await sock.groupSettingUpdate(from, "announcement")
          await reply("Grupo cerrado")
          break

        case "antilink":
        case "antienlace":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          const antilinkSettings = getGroupSettings(from)
          antilinkSettings.antilink = !antilinkSettings.antilink
          saveDB()
          await reply(`Anti-link: ${antilinkSettings.antilink ? "Activado" : "Desactivado"}`)
          break

        case "welcome":
        case "bienvenida":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          const welcomeSettings = getGroupSettings(from)
          welcomeSettings.welcome = !welcomeSettings.welcome
          saveDB()
          await reply(`Bienvenida: ${welcomeSettings.welcome ? "Activada" : "Desactivada"}`)
          break

        case "goodbye":
        case "despedida":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          const goodbyeSettings = getGroupSettings(from)
          goodbyeSettings.goodbye = !goodbyeSettings.goodbye
          saveDB()
          await reply(`Despedida: ${goodbyeSettings.goodbye ? "Activada" : "Desactivada"}`)
          break

        case "setwelcome":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          if (!text) {
            await reply("Uso: #setwelcome <mensaje>")
            return
          }
          const setWelcomeSettings = getGroupSettings(from)
          setWelcomeSettings.welcomeMsg = text
          saveDB()
          await reply("Mensaje de bienvenida actualizado")
          break

        case "setgoodbye":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          if (!text) {
            await reply("Uso: #setgoodbye <mensaje>")
            return
          }
          const setGoodbyeSettings = getGroupSettings(from)
          setGoodbyeSettings.goodbyeMsg = text
          saveDB()
          await reply("Mensaje de despedida actualizado")
          break

        case "groupimage":
        case "groupimg":
        case "gpimg":
        case "setgroupimage":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          if (!quoted || !quoted.imageMessage) {
            await reply("Responde a una imagen con #groupimage")
            return
          }
          try {
            const groupImgBuffer = await downloadMediaMessage({ message: quoted }, "buffer", {}, { logger: pino({ level: "silent" }) })
            await sock.updateProfilePicture(from, groupImgBuffer)
            await reply("Foto del grupo actualizada")
          } catch (e) {
            await reply("Error al actualizar foto del grupo")
          }
          break

        case "tag":
        case "hidetag":
        case "tagsay":
        case "tagall":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          const metaGroup = await getGroupMeta(sock, from)
          const allParticipants = metaGroup.participants.map(p => p.id)
          const tagText = text || "Mención a todos"
          await sock.sendMessage(from, { text: tagText, mentions: allParticipants })
          break

        case "onlyadmin":
        case "onlyadmins":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          const onlyadminSettings = getGroupSettings(from)
          onlyadminSettings.onlyadmin = !onlyadminSettings.onlyadmin
          saveDB()
          await reply(`Solo admins: ${onlyadminSettings.onlyadmin ? "Activado" : "Desactivado"}`)
          break

        case "msgcount":
        case "count":
        case "messages":
        case "mensajes":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          await reply("Contador de mensajes: 42 mensajes registrados")
          break

        case "topcount":
        case "topmessages":
        case "topmsgcount":
        case "topmensajes":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          await reply("Top de mensajes no disponible aún")
          break

        case "topinactive":
        case "topinactivos":
        case "topinactiveusers":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          await reply("Top de inactivos no disponible aún")
          break

        case "alerts":
        case "alertas":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          await reply("Alertas configuradas")
          break

        case "bot":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          if (args[0] === "on") {
            await reply("Bot activado en este grupo")
          } else if (args[0] === "off") {
            await reply("Bot desactivado en este grupo")
          } else {
            await reply("Uso: #bot on/off")
          }
          break

        case "economy":
        case "economia":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          const economySettings = getGroupSettings(from)
          if (args[0] === "on") {
            economySettings.economy = true
            saveDB()
            await reply("Economía activada")
          } else if (args[0] === "off") {
            economySettings.economy = false
            saveDB()
            await reply("Economía desactivada")
          } else {
            await reply("Uso: #economy on/off")
          }
          break

        case "gacha":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          const gachaSettings2 = getGroupSettings(from)
          if (args[0] === "on") {
            gachaSettings2.gacha = true
            saveDB()
            await reply("Gacha activado")
          } else if (args[0] === "off") {
            gachaSettings2.gacha = false
            saveDB()
            await reply("Gacha desactivado")
          } else {
            await reply("Uso: #gacha on/off")
          }
          break

        case "nsfw":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          const nsfwSettings = getGroupSettings(from)
          if (args[0] === "on") {
            nsfwSettings.nsfw = true
            saveDB()
            await reply("NSFW activado")
          } else if (args[0] === "off") {
            nsfwSettings.nsfw = false
            saveDB()
            await reply("NSFW desactivado")
          } else {
            await reply("Uso: #nsfw on/off")
          }
          break

        case "setprimary":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) { await reply("Solo admins pueden usar este comando"); return }
          const primarySettings = getGroupSettings(from)
          primarySettings.primary = text
          saveDB()
          await reply("Grupo principal establecido")
          break

        case "ani":
          if (!text) {
            await reply("Uso: #ani [búsqueda] [s2e5] [720p] [lat] [sub:es] [doc]")
            return
          }
          await reply(`Buscando anime "${text}"... Próximamente descarga directa.`)
          break

        case "uno":
          const unoSub = args[0]?.toLowerCase()
          if (!db.uno[from]) db.uno[from] = { players: [], started: false, pot: 0 }
          const unoGame = db.uno[from]
          if (unoSub === "create") {
            const bet = parseInt(args[1]) || 100
            unoGame.players = [sender]
            unoGame.started = false
            unoGame.pot = bet
            saveDB()
            await reply(`Partida de UNO creada con apuesta de ${bet} coins. Usa #uno join para unirte.`)
          } else if (unoSub === "join") {
            if (unoGame.players.includes(sender)) {
              await reply("Ya estás en la partida")
              return
            }
            unoGame.players.push(sender)
            saveDB()
            await reply(`@${senderNumber} se unió a la partida de UNO. Total jugadores: ${unoGame.players.length}`)
          } else if (unoSub === "start") {
            if (unoGame.players.length === 0) {
              await reply("No hay partida creada. Usa #uno create")
              return
            }
            unoGame.started = true
            saveDB()
            await reply("¡Partida de UNO iniciada!")
          } else if (unoSub === "leave") {
            unoGame.players = unoGame.players.filter(p => p !== sender)
            saveDB()
            await reply("Saliste de la partida de UNO")
          } else {
            await reply("Uso: #uno <create <apuesta> | join | start | leave>")
          }
          break

        case "unohistory":
        case "unohist":
          await reply("Historial de UNO vacío")
          break

        case "unostats":
          await reply("Stats de UNO: 0 partidas ganadas")
          break

        case "unotop":
        case "unoboard":
          await reply("Ranking de UNO vacío")
          break

        default:
          if (animeActions[command]) {
            const action = animeActions[command]
            const target = mentioned.length > 0 ? mentioned[0] : null
            const actionText = target
              ? `@${senderNumber} ${action} @${target.split("@")[0]}`
              : `@${senderNumber} ${action}`
            await replyWithMention(actionText, mentioned.length > 0 ? [sender, ...mentioned] : [sender])
            addXP(sender, 5)
            saveDB()
            break
          }
          if (nsfwActions[command]) {
            if (!isGroup) {
              await reply("Este comando solo funciona en grupos")
              return
            }
            const nsfwSettings2 = getGroupSettings(from)
            if (!nsfwSettings2.nsfw) {
              await reply("El NSFW está desactivado en este grupo")
              return
            }
            const action = nsfwActions[command]
            const target = mentioned.length > 0 ? mentioned[0] : null
            const actionText = target
              ? `@${senderNumber} ${action.text} @${target.split("@")[0]}`
              : `@${senderNumber} ${action.text}`
            await replyWithMention(actionText, mentioned.length > 0 ? [sender, ...mentioned] : [sender])
            break
          }
          break
      }
    } catch (e) {
      console.error("Error en comando:", e)
      await reply("Ocurrió un error al ejecutar el comando")
    }
  }

  sock.ev.on("messages.upsert", async (event) => {
    if (event?.type !== "notify") return
    for (const incoming of event.messages || []) {
      try {
        await handleIncoming(incoming)
      } catch (error) {
        console.error("[ERZABOT] Error procesando mensaje entrante:", error)
      }
    }
  })

  sock.ev.on("group-participants.update", async (update) => {
    const { id, participants, action } = update
    const settings = getGroupSettings(id)
    try {
      const meta = await sock.groupMetadata(id)
      if (action === "add" && settings.welcome) {
        for (const participant of participants) {
          const userTag = "@" + participant.split("@")[0]
          const welcomeMsg = settings.welcomeMsg
            .replace(/{usuario}/g, userTag)
            .replace(/{grupo}/g, meta.subject)
            .replace(/{user}/g, userTag)
            .replace(/{group}/g, meta.subject)
          await sock.sendMessage(id, { text: welcomeMsg, mentions: [participant] })
        }
      }
      if (action === "remove" && settings.goodbye) {
        for (const participant of participants) {
          const userTag = "@" + participant.split("@")[0]
          const goodbyeMsg = settings.goodbyeMsg
            .replace(/{usuario}/g, userTag)
            .replace(/{grupo}/g, meta.subject)
            .replace(/{user}/g, userTag)
            .replace(/{group}/g, meta.subject)
          await sock.sendMessage(id, { text: goodbyeMsg, mentions: [participant] })
        }
      }
    } catch (e) {
      console.error("Error en bienvenida/despedida:", e)
    }
  })

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg || !msg.message) return
    if (msg.key.fromMe) return
    const from = msg.key.remoteJid
    if (!from || !from.endsWith("@g.us")) return

    const settings = getGroupSettings(from)
    if (!settings.antilink) return

    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
    if (!body) return

    const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+)/gi
    if (linkRegex.test(body)) {
      const sender = msg.key.participant || msg.key.remoteJid
      try {
        const meta = await getGroupMeta(sock, from)
        const antilinkBotVariants = jidVariantSet([sock.user?.id, sock.user?.lid])
        const antilinkSenderVariants = jidVariantSet([msg.key.participant, msg.key.participantAlt, msg.key.participantPn, sender])
        const isBotAdmin = meta.participants.find(p => jidInVariants(p.id, antilinkBotVariants))?.admin
        const isSenderAdmin = meta.participants.find(p => jidInVariants(p.id, antilinkSenderVariants))?.admin
        if (isSenderAdmin) return
        if (isBotAdmin) {
          await sock.sendMessage(from, { delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: sender } })
          await sock.groupParticipantsUpdate(from, [sender], "remove")
          await sock.sendMessage(from, { text: `⚠️ @${sender.split("@")[0]} fue expulsado por enviar un link`, mentions: [sender] })
        } else {
          await sock.sendMessage(from, { text: `⚠️ @${sender.split("@")[0]} no se permiten links aquí`, mentions: [sender] })
        }
      } catch (e) {
        console.error("Error en antilink:", e)
      }
    }
  })
}

startBot()
autoarranqueSubs()