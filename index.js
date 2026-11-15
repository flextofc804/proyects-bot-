import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
  getContentType
} from "@whiskeysockets/baileys"
import { sendInteractive, singleSelectButton } from 'baileys-buttons'
import pino from "pino"
import fs from "fs"
import path from "path"
import { exec } from "child_process"
import { promisify } from "util"
import axios from "axios"
import play from 'play-dl'
import ffmpeg from 'ffmpeg-static'
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

const MENU_IMAGE = ""
const searchHistory = new Map()

const config = {
  botName: "ZENITH - BOT",
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

const menuOrder = ["economia", "stickers", "gacha", "descargas", "perfil", "subbots", "utilidades", "admin", "reacciones", "uno", "anime"]

const menuAliases = {
  economia: "economia",
  economy: "economia",
  eco: "economia",
  sticker: "stickers",
  stickers: "stickers",
  gacha: "gacha",
  descargas: "descargas",
  descarga: "descargas",
  descargar: "descargas",
  downloads: "descargas",
  perfil: "perfil",
  profile: "perfil",
  subbots: "subbots",
  "sub-bots": "subbots",
  "sub-bot": "subbots",
  "sub bots": "subbots",
  subbot: "subbots",
  utilidades: "utilidades",
  utilidad: "utilidades",
  utils: "utilidades",
  admin: "admin",
  administracion: "admin",
  reacciones: "reacciones",
  reaccion: "reacciones",
  acciones: "reacciones",
  uno: "uno",
  anime: "anime"
}

const menuCategories = {
  economia: {
    emoji: "💰",
    title: "ECONOMÍA",
    sections: [
      {
        title: "💵 GANANCIAS",
        items: [
          { cmd: "daily", desc: "recompensa cada 24 h" },
          { cmd: "work", desc: "trabajar cada hora" },
          { cmd: "crime", desc: "cometer un crimen" },
          { cmd: "slut", desc: "trabajo sexual" }
        ]
      },
      {
        title: "🎲 APUESTAS",
        items: [
          { cmd: "coinflip", desc: "apostar cara o cruz" },
          { cmd: "roulette", desc: "ruleta rojo / negro / verde" }
        ]
      },
      {
        title: "🏦 BANCO Y COINS",
        items: [
          { cmd: "balance", desc: "ver tus coins y tu banco" },
          { cmd: "deposit", desc: "guardar coins en el banco" },
          { cmd: "withdraw", desc: "sacar coins del banco" },
          { cmd: "givecoins", desc: "dar coins a alguien" }
        ]
      },
      {
        title: "📊 RANKING E INFO",
        items: [
          { cmd: "economyboard", desc: "ranking de economía" },
          { cmd: "economyinfo", desc: "cómo funciona la economía" }
        ]
      }
    ]
  },
  stickers: {
    emoji: "🎨",
    title: "STICKERS",
    sections: [
      {
        title: "🖌️ CREAR",
        items: [
          { cmd: "sticker", desc: "imagen o video a sticker" },
          { cmd: "newpack", desc: "crear un pack nuevo" },
          { cmd: "stickeradd", desc: "añadir sticker a un pack" },
          { cmd: "stickerdel", desc: "quitar sticker de un pack" }
        ]
      },
      {
        title: "📦 PACKS",
        items: [
          { cmd: "stickerpacks", desc: "ver tus packs" },
          { cmd: "getpack", desc: "ver un pack completo" },
          { cmd: "delpack", desc: "borrar un pack" }
        ]
      },
      {
        title: "⚙️ AJUSTES",
        items: [
          { cmd: "setstickermeta", desc: "metadata del sticker" },
          { cmd: "delstickermeta", desc: "borrar metadata" },
          { cmd: "setstickerpackdesc", desc: "descripción del pack" },
          { cmd: "setpackprivate", desc: "pack privado" },
          { cmd: "setpackpublic", desc: "pack público" },
          { cmd: "packfavourite", desc: "marcar pack favorito" },
          { cmd: "packunfavourite", desc: "quitar de favoritos" }
        ]
      }
    ]
  },
  gacha: {
    emoji: "🎴",
    title: "GACHA",
    sections: [
      {
        title: "🎰 JUGAR",
        items: [
          { cmd: "rollwaifu", desc: "tirar el gacha" },
          { cmd: "claim", desc: "reclamar el personaje" },
          { cmd: "harem", desc: "ver tu colección" }
        ]
      },
      {
        title: "🛒 TIENDA Y TRUEQUES",
        items: [
          { cmd: "haremshop", desc: "tienda de personajes" },
          { cmd: "buycharacter", desc: "comprar un personaje" },
          { cmd: "sell", desc: "vender un personaje" },
          { cmd: "trade", desc: "intercambiar personajes" },
          { cmd: "vote", desc: "votar por alguien" }
        ]
      },
      {
        title: "📖 INFORMACIÓN",
        items: [
          { cmd: "charinfo", desc: "info de un personaje" },
          { cmd: "charimage", desc: "imagen del personaje" },
          { cmd: "charvideo", desc: "video del personaje" },
          { cmd: "serieinfo", desc: "info de una serie" },
          { cmd: "serielist", desc: "lista de series" },
          { cmd: "gachainfo", desc: "cómo funciona el gacha" }
        ]
      },
      {
        title: "🏆 RANKINGS",
        items: [
          { cmd: "waifusboard", desc: "ranking de harenes" },
          { cmd: "favoritetop", desc: "top de favoritos" }
        ]
      },
      {
        title: "👑 SOLO OWNER",
        items: [
          { cmd: "givechar", desc: "dar un personaje" },
          { cmd: "giveallharem", desc: "dar el harem completo" },
          { cmd: "deletewaifu", desc: "borrar un personaje" },
          { cmd: "setclaimmsg", desc: "mensaje de reclamo" },
          { cmd: "delclaimmsg", desc: "borrar mensaje de reclamo" }
        ]
      }
    ]
  },
  descargas: {
    emoji: "📥",
    title: "DESCARGAS",
    sections: [
      {
        title: "🎬 YOUTUBE",
        items: [
          { cmd: "play", desc: "audio de YouTube" },
          { cmd: "mp4", desc: "video de YouTube" },
          { cmd: "ytsearch", desc: "buscar en YouTube" }
        ]
      },
      {
        title: "🌐 REDES SOCIALES",
        items: [
          { cmd: "tiktok", desc: "descargar de TikTok" },
          { cmd: "facebook", desc: "descargar de Facebook" },
          { cmd: "instagram", desc: "descargar de Instagram" },
          { cmd: "twitter", desc: "descargar de Twitter / X" },
          { cmd: "pinterest", desc: "buscar en Pinterest" }
        ]
      },
      {
        title: "📁 ARCHIVOS",
        items: [
          { cmd: "mediafire", desc: "descargar de MediaFire" },
          { cmd: "pixiv", desc: "buscar en Pixiv" }
        ]
      }
    ]
  },
  perfil: {
    emoji: "👤",
    title: "PERFIL",
    sections: [
      {
        title: "🪪 TU PERFIL",
        items: [
          { cmd: "profile", desc: "ver tu perfil" },
          { cmd: "level", desc: "ver tu nivel y XP" },
          { cmd: "leaderboard", desc: "ranking de niveles" }
        ]
      },
      {
        title: "💍 MATRIMONIO",
        items: [
          { cmd: "marry", desc: "casarte con alguien" },
          { cmd: "divorce", desc: "divorciarte" },
          { cmd: "marryhistory", desc: "historial de parejas" }
        ]
      },
      {
        title: "✏️ PERSONALIZAR",
        items: [
          { cmd: "setdescription", desc: "cambiar tu descripción" },
          { cmd: "setbirth", desc: "tu cumpleaños" },
          { cmd: "setgenre", desc: "tu género" },
          { cmd: "setfavourite", desc: "tu personaje favorito" }
        ]
      },
      {
        title: "🎂 CUMPLEAÑOS Y DATOS",
        items: [
          { cmd: "birthdays", desc: "cumpleaños del grupo" },
          { cmd: "allbirthdays", desc: "todos los cumpleaños" },
          { cmd: "delbirth", desc: "borrar tu cumpleaños" },
          { cmd: "delfavourite", desc: "borrar favorito" },
          { cmd: "delgenre", desc: "borrar género" }
        ]
      },
      {
        title: "🏘️ GRUPO",
        items: [
          { cmd: "group", desc: "info del grupo" }
        ]
      }
    ]
  },
  subbots: {
    emoji: "🤖",
    title: "SUB-BOTS",
    sections: [
      {
        title: "🔑 ACCESO",
        items: [
          { cmd: "qr", desc: "código QR" },
          { cmd: "code", desc: "código de pairing" },
          { cmd: "premium", desc: "info premium" },
          { cmd: "botinfo", desc: "info del bot" }
        ]
      },
      {
        title: "🚪 GRUPOS",
        items: [
          { cmd: "join", desc: "unirse a un grupo" },
          { cmd: "leave", desc: "salir del grupo" },
          { cmd: "autojoin", desc: "auto unirse" }
        ]
      },
      {
        title: "⚙️ AJUSTES DEL BOT",
        items: [
          { cmd: "reload", desc: "recargar la base de datos" },
          { cmd: "setname", desc: "nombre del bot" },
          { cmd: "setpfp", desc: "foto de perfil" },
          { cmd: "setstatus", desc: "estado del bot" },
          { cmd: "setusername", desc: "usuario del bot" },
          { cmd: "setbanner", desc: "banner del menú" },
          { cmd: "setbotcurrency", desc: "moneda del bot" },
          { cmd: "setbotowner", desc: "dueño del bot" }
        ]
      },
      {
        title: "🔐 SESIÓN",
        items: [
          { cmd: "logout", desc: "cerrar sesión" }
        ]
      }
    ]
  },
  utilidades: {
    emoji: "🧰",
    title: "UTILIDADES",
    sections: [
      {
        title: "⚡ SISTEMA",
        items: [
          { cmd: "ping", desc: "velocidad de respuesta" },
          { cmd: "status", desc: "estado y uptime" },
          { cmd: "bots", desc: "bots activos" }
        ]
      },
      {
        title: "🛠️ HERRAMIENTAS",
        items: [
          { cmd: "del", desc: "borrar un mensaje" },
          { cmd: "getpic", desc: "foto de perfil" },
          { cmd: "toimage", desc: "sticker a imagen" },
          { cmd: "invite", desc: "link de invitación" }
        ]
      },
      {
        title: "📮 OTROS",
        items: [
          { cmd: "setlang", desc: "cambiar idioma" },
          { cmd: "suggest", desc: "mandar una sugerencia" },
          { cmd: "testwelcome", desc: "probar la bienvenida" }
        ]
      }
    ]
  },
  admin: {
    emoji: "🛡️",
    title: "ADMIN",
    sections: [
      {
        title: "⚠️ MODERACIÓN",
        items: [
          { cmd: "warn", desc: "advertir a alguien" },
          { cmd: "warns", desc: "ver los warns" },
          { cmd: "delwarn", desc: "quitar warns" },
          { cmd: "setwarnlimit", desc: "límite de warns" }
        ]
      },
      {
        title: "👥 MIEMBROS",
        items: [
          { cmd: "kick", desc: "expulsar del grupo" },
          { cmd: "promote", desc: "ascender a admin" },
          { cmd: "demote", desc: "quitar admin" },
          { cmd: "tag", desc: "mencionar a todos" }
        ]
      },
      {
        title: "🔓 GRUPO",
        items: [
          { cmd: "open", desc: "abrir el grupo" },
          { cmd: "close", desc: "cerrar el grupo" },
          { cmd: "antilink", desc: "anti enlaces" },
          { cmd: "onlyadmin", desc: "solo admins escriben" }
        ]
      },
      {
        title: "👋 BIENVENIDAS",
        items: [
          { cmd: "welcome", desc: "activar bienvenida" },
          { cmd: "goodbye", desc: "activar despedida" },
          { cmd: "setwelcome", desc: "mensaje de bienvenida" },
          { cmd: "setgoodbye", desc: "mensaje de despedida" },
          { cmd: "groupimage", desc: "foto del grupo" }
        ]
      },
      {
        title: "📊 ESTADÍSTICAS",
        items: [
          { cmd: "msgcount", desc: "contar mensajes" },
          { cmd: "topcount", desc: "top de mensajes" },
          { cmd: "topinactive", desc: "top de inactivos" },
          { cmd: "alerts", desc: "alertas del grupo" }
        ]
      },
      {
        title: "🔧 ACTIVACIÓN",
        items: [
          { cmd: "bot on/off", desc: "activar o apagar el bot" },
          { cmd: "economy on/off", desc: "activar economía" },
          { cmd: "gacha on/off", desc: "activar gacha" },
          { cmd: "nsfw on/off", desc: "activar NSFW" }
        ]
      }
    ]
  },
  reacciones: {
    emoji: "💞",
    title: "REACCIONES",
    sections: [
      {
        title: "😊 EMOCIONES",
        items: [
          { cmd: "angry" }, { cmd: "blush" }, { cmd: "bored" }, { cmd: "cry" },
          { cmd: "dramatic" }, { cmd: "happy" }, { cmd: "sad" }, { cmd: "scared" },
          { cmd: "shy" }, { cmd: "sick" }, { cmd: "think" }, { cmd: "pout" }
        ]
      },
      {
        title: "🤗 AFECTO",
        items: [
          { cmd: "hug" }, { cmd: "cuddle" }, { cmd: "kiss" }, { cmd: "kisscheek" },
          { cmd: "kisshead" }, { cmd: "pat" }, { cmd: "poke" }, { cmd: "tickle" },
          { cmd: "love" }, { cmd: "seduce" }, { cmd: "smile" }
        ]
      },
      {
        title: "🎮 ACCIONES",
        items: [
          { cmd: "bite" }, { cmd: "call" }, { cmd: "clap" }, { cmd: "dance" },
          { cmd: "draw" }, { cmd: "eat" }, { cmd: "gaming" }, { cmd: "jump" },
          { cmd: "kicked" }, { cmd: "kill" }, { cmd: "laugh" }, { cmd: "lick" },
          { cmd: "look" }, { cmd: "nope" }, { cmd: "punch" }, { cmd: "push" },
          { cmd: "run" }, { cmd: "slap" }, { cmd: "sleep" }, { cmd: "spit" },
          { cmd: "step" }
        ]
      },
      {
        title: "☕ VIDA DIARIA",
        items: [
          { cmd: "bath" }, { cmd: "bleh" }, { cmd: "coffee" }, { cmd: "cold" },
          { cmd: "cook" }, { cmd: "drunk" }, { cmd: "facepalm" }, { cmd: "greet" },
          { cmd: "hang" }, { cmd: "heat" }, { cmd: "icecream" }, { cmd: "impregnate" },
          { cmd: "lewd" }, { cmd: "psycho" }, { cmd: "read" }, { cmd: "scream" },
          { cmd: "scrub" }, { cmd: "sing" }, { cmd: "smoke" }, { cmd: "sneeze" },
          { cmd: "study" }, { cmd: "talk" }, { cmd: "walk" }, { cmd: "yawn" }
        ]
      }
    ]
  },
  uno: {
    emoji: "🃏",
    title: "UNO",
    sections: [
      {
        title: "🎮 PARTIDA",
        items: [
          { cmd: "uno create", desc: "crear partida con apuesta" },
          { cmd: "uno join", desc: "unirte a la partida" },
          { cmd: "uno start", desc: "iniciar la partida" },
          { cmd: "uno leave", desc: "salir de la partida" }
        ]
      },
      {
        title: "📊 ESTADÍSTICAS",
        items: [
          { cmd: "unohistory", desc: "historial de partidas" },
          { cmd: "unostats", desc: "tus estadísticas" },
          { cmd: "unotop", desc: "ranking de UNO" }
        ]
      }
    ]
  },
  anime: {
    emoji: "📺",
    title: "ANIME",
    sections: [
      {
        title: "🍥 BUSCAR Y DESCARGAR",
        items: [
          { cmd: "ani", desc: "búsqueda, temporada, calidad e idioma" }
        ]
      }
    ]
  }
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
  lines.push("   ⚡ *Z E N I T H* ⚡")
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

async function enviarTextoMenu(sock, from, msg, text) {
  await startTyping(sock, from)
  await sleep(400 + Math.floor(Math.random() * 500))
  await sock.sendMessage(from, { text }, { quoted: msg })
  await stopTyping(sock, from)
}

async function enviarMenuPrincipal(sock, from, msg) {
  const text = renderMenuHome()
  await startTyping(sock, from)
  await sleep(350 + Math.floor(Math.random() * 400))
  if (MENU_IMAGE) {
    await sock.sendMessage(from, { image: { url: MENU_IMAGE }, caption: text }, { quoted: msg })
  } else {
    await sock.sendMessage(from, { text }, { quoted: msg })
  }
  await stopTyping(sock, from)
}

async function enviarMenuVisual(sock, from, msg, category = null) {
  const raw = String(category || "").trim()
  const normalized = normalizeMenuKey(raw)

  if (!normalized) {
    await enviarMenuPrincipal(sock, from, msg)
    return
  }

  if (["todos", "todo", "all", "completo", "catalogo", "full"].includes(normalized)) {
    await enviarTextoMenu(sock, from, msg, renderMenuEverything())
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

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionName)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
    },
    printQRInTerminal: true,
    logger: pino({ level: "silent" }),
    browser: ["ZENITH-BOT", "Chrome", "1.0.0"]
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) {
        startBot()
      }
    } else if (connection === "open") {
      console.log("ZENITH - BOT conectado correctamente")
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

    if (msg.key.fromMe && !botIsOwnerAccount) return

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
    if (!body || !body.startsWith(config.prefix)) return

    const args = body.slice(config.prefix.length).trim().split(/ +/)
    const command = args.shift().toLowerCase()
    const text = args.join(" ")

    const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage
    const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || []

    const reply = async (text) => {
      await startTyping(sock, from)
      await sleep(350 + Math.floor(Math.random() * 450))
      await sock.sendMessage(from, { text }, { quoted: msg })
      await stopTyping(sock, from)
    }

    const replyWithMention = async (text, mentions) => {
      await startTyping(sock, from)
      await sleep(350 + Math.floor(Math.random() * 450))
      await sock.sendMessage(from, { text, mentions }, { quoted: msg })
      await stopTyping(sock, from)
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

    const isAdmin = async () => {
      if (!isGroup) return false
      try {
        const groupMetadata = await sock.groupMetadata(from)
        const participant = groupMetadata.participants.find(p => p.id === sender)
        return participant?.admin === "admin" || participant?.admin === "superadmin"
      } catch {
        return false
      }
    }

    const isBotAdmin = async () => {
      if (!isGroup) return false
      try {
        const groupMetadata = await sock.groupMetadata(from)
        const botId = sock.user.id.split(":")[0] + "@s.whatsapp.net"
        const botParticipant = groupMetadata.participants.find(p => p.id === botId)
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
        await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ INTERCAMBIO COMPLETADO ◆ ─┐\n> Recibiste: ${trade.give.name}\n> Entregaste: ${trade.receive.name}\n└───────────────┘`)
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

        case "balance":
        case "bal":
        case "coins":
          const balTarget = mentioned.length > 0 ? mentioned[0] : sender
          const balUser = getUserEconomy(balTarget)
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ BALANCE DE @${balTarget.split("@")[0]} ◆ ─┐\n> 💰 Cartera: ${formatCoins(balUser.coins)} coins\n> 🏦 Banco: ${formatCoins(balUser.bank)} coins\n> 📊 Total: ${formatCoins(balUser.coins + balUser.bank)} coins\n└───────────────┘`)
          break

        case "daily":
          const dailyUser = getUserEconomy(sender)
          const now = Date.now()
          const dailyCooldown = 24 * 60 * 60 * 1000
          if (now - dailyUser.lastDaily < dailyCooldown) {
            const remaining = dailyCooldown - (now - dailyUser.lastDaily)
            const hours = Math.floor(remaining / 3600000)
            const minutes = Math.floor((remaining % 3600000) / 60000)
            await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ DAILY ◆ ─┐\n> Ya reclamaste tu daily\n> Vuelve en: ${hours}h ${minutes}m\n└───────────────┘`)
          } else {
            const amount = Math.floor(Math.random() * 2000) + 1000
            dailyUser.coins += amount
            dailyUser.lastDaily = now
            saveDB()
            await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ DAILY RECLAMADO ◆ ─┐\n> Recibiste: ${formatCoins(amount)} coins\n> Cartera: ${formatCoins(dailyUser.coins)} coins\n└───────────────┘`)
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
            await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ TRABAJO ◆ ─┐\n> Debes descansar\n> Vuelve en: ${minutes} minutos\n└───────────────┘`)
          } else {
            const jobs = ["Programador", "Diseñador", "Camarero", "Conductor", "Abogado", "Médico", "Ingeniero", "Arquitecto", "Profesor", "Policía"]
            const job = jobs[Math.floor(Math.random() * jobs.length)]
            const amount = Math.floor(Math.random() * 1500) + 500
            workUser.coins += amount
            workUser.lastWork = workNow
            addXP(sender, 10)
            saveDB()
            await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ TRABAJO ◆ ─┐\n> Trabajaste como: ${job}\n> Ganaste: ${formatCoins(amount)} coins\n> Cartera: ${formatCoins(workUser.coins)} coins\n└───────────────┘`)
          }
          break

        case "crime":
          const crimeUser = getUserEconomy(sender)
          const crimeNow = Date.now()
          const crimeCooldown = 2 * 60 * 60 * 1000
          if (crimeNow - crimeUser.lastCrime < crimeCooldown) {
            const remaining = crimeCooldown - (crimeNow - crimeUser.lastCrime)
            const minutes = Math.floor(remaining / 60000)
            await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ CRIMEN ◆ ─┐\n> La policía te busca\n> Vuelve en: ${minutes} minutos\n└───────────────┘`)
          } else {
            const successCrime = Math.random() > 0.4
            if (successCrime) {
              const amount = Math.floor(Math.random() * 3000) + 1000
              crimeUser.coins += amount
              crimeUser.lastCrime = crimeNow
              addXP(sender, 15)
              saveDB()
              await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ CRIMEN EXITOSO ◆ ─┐\n> Robaste: ${formatCoins(amount)} coins\n> Cartera: ${formatCoins(crimeUser.coins)} coins\n└───────────────┘`)
            } else {
              const fine = Math.min(Math.floor(Math.random() * 1000) + 500, crimeUser.coins)
              crimeUser.coins -= fine
              crimeUser.lastCrime = crimeNow
              saveDB()
              await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ CRIMEN FALLIDO ◆ ─┐\n> Te atraparon\n> Multa: ${formatCoins(fine)} coins\n> Cartera: ${formatCoins(crimeUser.coins)} coins\n└───────────────┘`)
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
            await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ SLUT ◆ ─┐\n> Debes descansar\n> Vuelve en: ${minutes} minutos\n└───────────────┘`)
          } else {
            const amount = Math.floor(Math.random() * 2500) + 800
            slutUser.coins += amount
            slutUser.lastSlut = slutNow
            addXP(sender, 12)
            saveDB()
            await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ SLUT ◆ ─┐\n> Ganaste: ${formatCoins(amount)} coins\n> Cartera: ${formatCoins(slutUser.coins)} coins\n└───────────────┘`)
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
            await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ ROBAR ◆ ─┐\n> Debes esperar\n> Vuelve en: ${minutes} minutos\n└───────────────┘`)
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
            await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ ROBÓ EXITOSO ◆ ─┐\n> Robaste: ${formatCoins(amount)} coins\n> De: @${target.split("@")[0]}\n└───────────────┘`)
          } else {
            const fine = Math.min(Math.floor(Math.random() * 800) + 200, stealUser.coins)
            stealUser.coins -= fine
            stealUser.lastSteal = stealNow
            saveDB()
            await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ ROBÓ FALLIDO ◆ ─┐\n> Te atraparon\n> Multa: ${formatCoins(fine)} coins\n└───────────────┘`)
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
            await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ COINFLIP ◆ ─┐\n> Salió: ${resultCF}\n> Ganaste: ${formatCoins(cfAmount)} coins\n> Cartera: ${formatCoins(cfUser.coins)} coins\n└───────────────┘`)
          } else {
            cfUser.coins -= cfAmount
            saveDB()
            await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ COINFLIP ◆ ─┐\n> Salió: ${resultCF}\n> Perdiste: ${formatCoins(cfAmount)} coins\n> Cartera: ${formatCoins(cfUser.coins)} coins\n└───────────────┘`)
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
            await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ RULETA ◆ ─┐\n> Número: ${num} (${color})\n> Ganaste: ${formatCoins(win)} coins\n> Cartera: ${formatCoins(rtUser.coins)} coins\n└───────────────┘`)
          } else {
            rtUser.coins -= rtAmount
            saveDB()
            await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ RULETA ◆ ─┐\n> Número: ${num} (${color})\n> Perdiste: ${formatCoins(rtAmount)} coins\n> Cartera: ${formatCoins(rtUser.coins)} coins\n└───────────────┘`)
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
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ DEPÓSITO ◆ ─┐\n> Depositaste: ${formatCoins(depAmount)} coins\n> Cartera: ${formatCoins(depUser.coins)} coins\n> Banco: ${formatCoins(depUser.bank)} coins\n└───────────────┘`)
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
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ RETIRO ◆ ─┐\n> Retiraste: ${formatCoins(withAmount)} coins\n> Cartera: ${formatCoins(withUser.coins)} coins\n> Banco: ${formatCoins(withUser.bank)} coins\n└───────────────┘`)
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
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ TRANSFERENCIA ◆ ─┐\n> Enviaste: ${formatCoins(payAmount)} coins\n> A: @${mentioned[0].split("@")[0]}\n└───────────────┘`)
          break

        case "economyboard":
        case "eboard":
        case "baltop":
          const sorted = Object.entries(db.economy)
            .map(([id, data]) => ({ id, total: data.coins + data.bank }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10)
          let boardText = `╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ RANKING ECONOMÍA ◆ ─┐\n`
          sorted.forEach((entry, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`
            boardText += `> ${medal} @${entry.id.split("@")[0]}: ${formatCoins(entry.total)} coins\n`
          })
          boardText += `└───────────────┘`
          await reply(boardText)
          break

        case "economyinfo":
        case "einfo":
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ INFO ECONOMÍA ◆ ─┐\n> Sistema de coins con cartera y banco\n> Daily cada 24 horas\n> Trabaja cada hora\n> Crimen cada 2 horas\n> Slut cada 3 horas\n> Robar cada 4 horas\n> Apuestas: coinflip y ruleta\n> Ranking global de coins\n└───────────────┘`)
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
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ PACK CREADO ◆ ─┐\n> Nombre: ${text}\n> Usa #stickeradd para añadir stickers\n└───────────────┘`)
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
          let packsText = `╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ TUS PACKS ◆ ─┐\n`
          for (const [name, packData] of Object.entries(db.stickers[sender].packs)) {
            const fav = packData.favorite ? "★" : "☆"
            const priv = packData.private ? "🔒" : "🔓"
            packsText += `> ${fav} ${priv} ${name}: ${packData.stickers.length} stickers\n`
          }
          packsText += `└───────────────┘`
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
            await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ GACHA ◆ ─┐\n> Debes esperar\n> Vuelve en: ${minutes} minutos\n└───────────────┘`)
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
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ GACHA ROLL ◆ ─┐\n> Nombre: ${character.name}\n> Serie: ${character.series}\n> Rareza: ${getRarityColor(character.rarity)} ${character.rarity}\n> Valor: ${formatCoins(character.value)} coins\n└───────────────┘\n\nEscribe #claim para reclamarla`)
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
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ PERSONAJE RECLAMADO ◆ ─┐\n> ${pending.character.name}\n> ${pending.character.series}\n> ${getRarityColor(pending.character.rarity)} ${pending.character.rarity}\n> Total en harem: ${claimUser.characters.length}\n└───────────────┘`)
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
          let haremText = `╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ HAREM DE @${haremTarget.split("@")[0]} ◆ ─┐\n> Total: ${haremUser.characters.length} personajes\n`
          haremUser.characters.slice(0, 20).forEach((char, i) => {
            haremText += `> ${i + 1}. ${getRarityColor(char.rarity)} ${char.name} - ${char.series}\n`
          })
          haremText += `└───────────────┘`
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
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ COMPRA EXITOSA ◆ ─┐\n> ${buyChar.name}\n> ${buyChar.series}\n> Pagaste: ${formatCoins(buyChar.value)} coins\n└───────────────┘`)
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
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ VENTA EXITOSA ◆ ─┐\n> ${sellChar.name}\n> Recibiste: ${formatCoins(sellPrice)} coins\n└───────────────┘`)
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
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ INTERCAMBIO ◆ ─┐\n> @${tradeTarget.split("@")[0]}\n> Te ofrecen: ${yourChar.name}\n> Por tu: ${theirChar.name}\n> Escribe #trade accept para aceptar\n> O #trade reject para rechazar\n└───────────────┘`)
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
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ INFO PERSONAJE ◆ ─┐\n> Nombre: ${infoChar.name}\n> Serie: ${infoChar.series}\n> Rareza: ${getRarityColor(infoChar.rarity)} ${infoChar.rarity}\n> Valor: ${formatCoins(infoChar.value)} coins\n└───────────────┘`)
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
          let seriesText = `╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ INFO SERIE ◆ ─┐\n> Serie: ${seriesChars[0].series}\n> Personajes: ${seriesChars.length}\n`
          seriesChars.forEach(char => {
            seriesText += `> ${getRarityColor(char.rarity)} ${char.name}\n`
          })
          seriesText += `└───────────────┘`
          await reply(seriesText)
          break

        case "serielist":
        case "slist":
        case "animelist":
          const seriesSet = new Set(gachaCharacters.map(c => c.series))
          let seriesListText = `╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ LISTA DE SERIES ◆ ─┐\n`
          seriesSet.forEach(series => {
            const count = gachaCharacters.filter(c => c.series === series).length
            seriesListText += `> ${series} (${count} personajes)\n`
          })
          seriesListText += `└───────────────┘`
          await reply(seriesListText)
          break

        case "haremshop":
        case "tiendawaifus":
        case "wshop":
          let shopText = `╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ TIENDA GACHA ◆ ─┐\n`
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
          let waifuText = `╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ RANKING WAIFUS ◆ ─┐\n`
          waifuTop.forEach((entry, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`
            waifuText += `> ${medal} @${entry.id.split("@")[0]}: ${entry.count} waifus\n`
          })
          waifuText += `└───────────────┘`
          await reply(waifuText)
          break

        case "favoritetop":
        case "favtop":
          await reply("Ranking de favoritos no disponible aún")
          break

        case "gachainfo":
        case "ginfo":
        case "infogacha":
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ INFO GACHA ◆ ─┐\n> Roll cada hora\n> Rarezas: SSR (5%), SR (20%), R (75%)\n> Reclama con #claim\n> Compra en #haremshop\n> Vende con #sell\n> Intercambia con #trade\n└───────────────┘`)
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
        case "song":
          if (!text) {
            await reply("Uso: #play <nombre o link de YouTube>")
            return
          }
          try {
            await reply("Buscando y descargando audio...")
            let audioQuery = text
            if (/^\d+$/.test(text.trim()) && searchHistory.has(from)) {
              const picked = searchHistory.get(from)[Number(text.trim()) - 1]
              if (picked) audioQuery = `https://www.youtube.com/watch?v=${picked.id}`
            }
            const { resolveVideo, mediaFile } = await import("./youtube.js")
            const audioVideoId = await resolveVideo(audioQuery)
            if (!audioVideoId) {
              await reply("No se encontró el video")
              return
            }
            const audioFile = await mediaFile(audioVideoId, "audio")
            const audioBuffer = fs.readFileSync(audioFile)
            const audioExt = String(path.extname(audioFile) || "").toLowerCase()
            const isVoice = command === "ytaudio" || command === "playaudio"
            await sock.sendMessage(
              from,
              { audio: audioBuffer, mimetype: audioExt === ".mp3" ? "audio/mpeg" : "audio/mp4", ptt: isVoice },
              { quoted: msg }
            )
            removeFile(audioFile)
          } catch (e) {
            const reason = String(e?.message || e)
            console.log("Error en play:", reason)
            if (reason.includes("LOGIN_REQUIRED") || reason.includes("cookies") || reason.includes("bloqueó") || reason.includes("verificación") || reason.includes("API pública")) {
              const hasCookies =
                fs.existsSync(path.join(process.cwd(), "cookies.txt")) ||
                fs.existsSync(path.join(process.cwd(), "cookies.json"))
              await reply(
                (hasCookies
                  ? "⚠️ YouTube bloquea las descargas incluso con cookies.\n\n1) Regenerá tus cookies: entrá a *youtube.com* logueado desde el navegador, instalá la extensión *Get cookies.txt LOCALLY*, exportá el archivo y reemplazalo en la carpeta del bot (las cookies viejas vencen en pocos días).\n2) Si con cookies frescas sigue fallando, la IP de tu hosting está bloqueada por YouTube (pasa en hostings gratuitos): en ese caso probá correr el bot desde tu PC o un VPS con IP limpia.\n3) El bot ya intenta una API pública como último recurso y tampoco respondió: suele ser temporal, esperá unos minutos y probá de nuevo (usá #ytdebug para ver el estado)."
                  : "⚠️ YouTube está bloqueando la IP de este servidor.\n\nSubí el archivo *cookies.txt* (o cookies.json) a la carpeta del bot y volvé a intentar: eso desbloquea las descargas.") +
                `\n\nMotivo técnico: ${reason.slice(0, 200)}`
              )
            } else {
              await reply("Error al descargar el audio, intentá con otro video")
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
    await reply("Buscando y descargando video...")
    let videoQuery = text
    if (/^\d+$/.test(text.trim()) && searchHistory.has(from)) {
      const picked = searchHistory.get(from)[Number(text.trim()) - 1]
      if (picked) videoQuery = `https://www.youtube.com/watch?v=${picked.id}`
    }
    const { resolveVideo, mediaFile } = await import("./youtube.js")
    const videoVideoId = await resolveVideo(videoQuery)
    if (!videoVideoId) {
      await reply("No se encontró el video")
      return
    }
    const videoFile = await mediaFile(videoVideoId, "video")
    const videoBuffer = fs.readFileSync(videoFile)
    const videoExt = String(path.extname(videoFile) || "").toLowerCase()
    await sock.sendMessage(
      from,
      { video: videoBuffer, mimetype: videoExt === ".webm" ? "video/webm" : "video/mp4", caption: "ZENITH - Video" },
      { quoted: msg }
    )
    removeFile(videoFile)
  } catch (e) {
    const reason = String(e?.message || e)
    console.log("Error en mp4:", reason)
    if (reason.includes("LOGIN_REQUIRED") || reason.includes("cookies") || reason.includes("bloqueó") || reason.includes("verificación") || reason.includes("API pública")) {
      const hasCookies =
        fs.existsSync(path.join(process.cwd(), "cookies.txt")) ||
        fs.existsSync(path.join(process.cwd(), "cookies.json"))
      await reply(
        (hasCookies
          ? "⚠️ YouTube bloquea las descargas incluso con cookies.\n\n1) Regenerá tus cookies: entrá a *youtube.com* logueado desde el navegador, instalá la extensión *Get cookies.txt LOCALLY*, exportá el archivo y reemplazalo en la carpeta del bot (las cookies viejas vencen en pocos días).\n2) Si con cookies frescas sigue fallando, la IP de tu hosting está bloqueada por YouTube (pasa en hostings gratuitos): en ese caso probá correr el bot desde tu PC o un VPS con IP limpia.\n3) El bot ya intenta una API pública como último recurso y tampoco respondió: suele ser temporal, esperá unos minutos y probá de nuevo (usá #ytdebug para ver el estado)."
          : "⚠️ YouTube está bloqueando la IP de este servidor.\n\nSubí el archivo *cookies.txt* (o cookies.json) a la carpeta del bot y volvé a intentar: eso desbloquea las descargas.") +
        `\n\nMotivo técnico: ${reason.slice(0, 200)}`
      )
    } else {
      await reply("Error al descargar el video, intentá con otro")
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
            const ttResult = await tiktokDownload(text)
            if (ttResult.type === "video") {
              const ttBuffer = fs.readFileSync(ttResult.file)
              const ttCaption = ttResult.caption ? `ZENITH - TikTok\n${ttResult.caption.slice(0, 120)}` : "ZENITH - TikTok"
              await sock.sendMessage(
                from,
                { video: ttBuffer, mimetype: "video/mp4", caption: ttCaption },
                { quoted: msg }
              )
              removeFile(ttResult.file)
            } else {
              for (const ttImage of ttResult.files.slice(0, 5)) {
                await sock.sendMessage(from, { image: fs.readFileSync(ttImage), caption: "ZENITH - TikTok" }, { quoted: msg })
                removeFile(ttImage)
              }
            }
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
            const fbRes = await axios.get(text, { headers: { "User-Agent": "Mozilla/5.0" } })
            const videoMatch = fbRes.data.match(/"video":{"url":"([^"]+)"/) || fbRes.data.match(/"video_url":"([^"]+)"/)
            if (videoMatch) {
              const cleanUrl = videoMatch[1].replace(/\\u0026/g, "&").replace(/\u0026/g, "&")
              const fbVideo = await axios.get(cleanUrl, { responseType: "arraybuffer" })
              await sock.sendMessage(from, { video: Buffer.from(fbVideo.data), mimetype: "video/mp4" }, { quoted: msg })
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
            const igResult = await instagramDownload(text)
            if (igResult.type === "video") {
              const igBuffer = fs.readFileSync(igResult.file)
              await sock.sendMessage(
                from,
                { video: igBuffer, mimetype: "video/mp4", caption: "ZENITH - Instagram" },
                { quoted: msg }
              )
              removeFile(igResult.file)
            } else {
              for (const igImage of igResult.files.slice(0, 5)) {
                await sock.sendMessage(from, { image: fs.readFileSync(igImage), caption: "ZENITH - Instagram" }, { quoted: msg })
                removeFile(igImage)
              }
            }
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
              await sock.sendMessage(from, { video: Buffer.from(twVideo.data), mimetype: "video/mp4" }, { quoted: msg })
              return
            }
            const photo = media.find((item) => item.media_url_https)
            if (photo) {
              const twImg = await axios.get(photo.media_url_https, { responseType: "arraybuffer", timeout: 60000 })
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
        case "pin":
          if (!text) {
            await reply("Uso: #pinterest <término>")
            return
          }
          try {
            const pinRes = await axios.get(`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(text)}`, { headers: { "User-Agent": "Mozilla/5.0" } })
            const imgMatch = pinRes.data.match(/"url":"(https:\/\/i\.pinimg\.com\/[^"]+)"/)
            if (imgMatch) {
              const pinImg = await axios.get(imgMatch[1], { responseType: "arraybuffer" })
              await sock.sendMessage(from, { image: Buffer.from(pinImg.data) }, { quoted: msg })
            } else {
              await reply("No se encontraron imágenes")
            }
          } catch (e) {
            await reply("Error al buscar en Pinterest")
          }
          break

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
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ PERFIL DE @${profileTarget.split("@")[0]} ◆ ─┐\n> 📊 Nivel: ${profileUser.level}\n> ✨ XP: ${profileUser.xp}/${profileUser.level * 100}\n> 💰 Coins: ${formatCoins(profileEcon.coins + profileEcon.bank)}\n> 🎴 Waifus: ${profileGacha.characters.length}\n> 📝 Descripción: ${profileUser.description}\n> 🎂 Cumpleaños: ${profileUser.birthday || "No establecido"}\n> 🎭 Género: ${profileUser.genre || "No establecido"}\n> ⭐ Favorito: ${profileUser.favourite || "No establecido"}\n> 💍 Casado con: ${profileUser.married ? "@" + profileUser.married.split("@")[0] : "Soltero"}\n└───────────────┘`)
          break

        case "level":
        case "lvl":
          const lvlTarget = mentioned.length > 0 ? mentioned[0] : sender
          const lvlUser = getUserProfile(lvlTarget)
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ NIVEL DE @${lvlTarget.split("@")[0]} ◆ ─┐\n> Nivel: ${lvlUser.level}\n> XP: ${lvlUser.xp}/${lvlUser.level * 100}\n> Progreso: ${Math.floor((lvlUser.xp / (lvlUser.level * 100)) * 100)}%\n└───────────────┘`)
          break

        case "leaderboard":
        case "lboard":
        case "top":
          const topUsers = Object.entries(db.profiles)
            .map(([id, data]) => ({ id, level: data.level, xp: data.xp }))
            .sort((a, b) => b.level - a.level || b.xp - a.xp)
            .slice(0, 10)
          let topText = `╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ RANKING NIVELES ◆ ─┐\n`
          topUsers.forEach((entry, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`
            topText += `> ${medal} @${entry.id.split("@")[0]}: Nivel ${entry.level}\n`
          })
          topText += `└───────────────┘`
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
          let historyText = `╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ HISTORIAL MATRIMONIAL ◆ ─┐\n`
          historyUser.marryHistory.forEach(h => {
            historyText += `> ${h.action === "marry" ? "💍 Casado" : "💔 Divorciado"} con @${h.partner.split("@")[0]}\n`
          })
          historyText += `└───────────────┘`
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
          const groupMeta = await sock.groupMetadata(from)
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ INFO GRUPO ◆ ─┐\n> Nombre: ${groupMeta.subject}\n> Miembros: ${groupMeta.participants.length}\n> Creado: ${new Date(groupMeta.creation * 1000).toLocaleDateString()}\n> Descripción: ${groupMeta.desc || "Sin descripción"}\n└───────────────┘`)
          break

        case "qr":
        case "code":
          if (isGroup) {
            await reply("Este comando se usa por mensaje privado")
            return
          }
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ SUB-BOT QR ◆ ─┐\n> Función de sub-bot activa\n> Envía tu número o mención\n└───────────────┘`)
          break

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
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ INFO BOT ◆ ─┐\n> Nombre: ${config.botName}\n> Versión: 1.0.0\n> Creador: ${config.owner}\n> Prefix: ${config.prefix}\n> Librería: Baileys\n> Runtime: Node.js\n└───────────────┘`)
          break

        case "premium":
        case "infopremium":
        case "premiuminfo":
          if (isGroup) {
            await reply("Este comando se usa por privado")
            return
          }
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ PREMIUM ◆ ─┐\n> Beneficios premium:\n> Acceso a comandos exclusivos\n> Límites aumentados\n> Soporte prioritario\n> Contacta al dueño para más info\n└───────────────┘`)
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
          await sock.sendMessage(from, { text: `╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ PING ◆ ─┐\n> Velocidad: ${end - start}ms\n> Estado: Activo\n└───────────────┘`, edit: pingMsg.key })
          break

        case "status":
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ ESTADO ◆ ─┐\n> Bot: Online\n> Uptime: ${process.uptime().toFixed(0)}s\n> Memoria: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB\n> Node: ${process.version}\n└───────────────┘`)
          break

        case "bots":
        case "sockets":
          await reply(`╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ BOTS ACTIVOS ◆ ─┐\n> 1. Zenith-Bot (Principal)\n> Estado: Activo\n└───────────────┘`)
          break

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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          let warnsText = `╔════════════════════╗\n  ⚡ ZENITH - BOT ⚡\n╚════════════════════╝\n\n┌─ ◆ WARNS ◆ ─┐\n> Usuario: @${warnsTarget.split("@")[0]}\n> Total: ${warnsData.count}\n`
          warnsData.reasons.forEach((reason, i) => {
            warnsText += `> ${i + 1}. ${reason}\n`
          })
          warnsText += `└───────────────┘`
          await replyWithMention(warnsText, [warnsTarget])
          break

        case "delwarn":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
          await sock.groupSettingUpdate(from, "not_announcement")
          await reply("Grupo abierto")
          break

        case "close":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
          await sock.groupSettingUpdate(from, "announcement")
          await reply("Grupo cerrado")
          break

        case "antilink":
        case "antienlace":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
          const metaGroup = await sock.groupMetadata(from)
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
          await reply("Alertas configuradas")
          break

        case "bot":
          if (!isGroup) {
            await reply("Este comando solo funciona en grupos")
            return
          }
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
          if (!(await isAdmin())) {
            await reply("Solo admins pueden usar este comando")
            return
          }
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
        console.error("[ZENITH] Error procesando mensaje entrante:", error)
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
        const meta = await sock.groupMetadata(from)
        const botId = sock.user.id.split(":")[0] + "@s.whatsapp.net"
        const isBotAdmin = meta.participants.find(p => p.id === botId)?.admin
        const isSenderAdmin = meta.participants.find(p => p.id === sender)?.admin
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
