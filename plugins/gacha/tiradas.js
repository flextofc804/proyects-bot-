import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { personajesGacha } from "./personajes.js"
import { imagenTransformada, transformacionDe } from "./transformaciones.js"

const ARCHIVO = path.join(path.dirname(fileURLToPath(import.meta.url)), "tiradas.json")

const RAREZAS = [
  { nombre: "Basura", peso: 30 },
  { nombre: "Común", peso: 25 },
  { nombre: "Poco Común", peso: 15 },
  { nombre: "Raro", peso: 10 },
  { nombre: "Super Raro", peso: 7 },
  { nombre: "Épico", peso: 5 },
  { nombre: "Super Épico", peso: 3 },
  { nombre: "Legendario", peso: 2 },
  { nombre: "Mítico", peso: 1 },
  { nombre: "Divino", peso: 0.7 },
  { nombre: "Cósmico", peso: 0.5 },
  { nombre: "Eterno", peso: 0.3 },
  { nombre: "Infinito", peso: 0.2 },
  { nombre: "Secreto", peso: 0.15 },
  { nombre: "Ultra Secreto", peso: 0.08 },
  { nombre: "Glitch", peso: 0.05 },
  { nombre: "Dios", peso: 0.02 }
]

const ID = Object.fromEntries(RAREZAS.map((r, i) => [r.nombre, i]))
const EPICO_MIN = ID["Épico"]
const ALTAS_MIN = ID["Raro"]
const SUMA_BASE = RAREZAS.reduce((a, r) => a + r.peso, 0)
const SUMA_ALTAS = RAREZAS.filter((_, i) => i >= ALTAS_MIN).reduce((a, r) => a + r.peso, 0)

const TIER_A_POOL = (i) => {
  if (i < ALTAS_MIN) return "Comun"
  if (i < ID["Épico"]) return "Raro"
  if (i < ID["Legendario"]) return "Epico"
  return "Legendario"
}

const PITY = [
  { key: "sinDios", objetivo: "Dios", idx: ID["Dios"], tiradas: 1000 },
  { key: "sinDivino", objetivo: "Divino", idx: ID["Divino"], tiradas: 250 },
  { key: "sinMitico", objetivo: "Mítico", idx: ID["Mítico"], tiradas: 100 },
  { key: "sinLegendario", objetivo: "Legendario", idx: ID["Legendario"], tiradas: 50 },
  { key: "sinEpico", objetivo: "Épico", idx: EPICO_MIN, tiradas: 20 }
]

let estadoGlobal = null
function estado() {
  if (estadoGlobal) return estadoGlobal
  try {
    estadoGlobal = JSON.parse(fs.readFileSync(ARCHIVO, "utf-8"))
  } catch {
    estadoGlobal = {}
  }
  return estadoGlobal
}

function usuario(jid) {
  const est = estado()
  if (!est[jid]) est[jid] = { tiradas: 0, sinEpico: 0, sinLegendario: 0, sinMitico: 0, sinDivino: 0, sinDios: 0 }
  return est[jid]
}

function guardar() {
  try {
    fs.writeFileSync(ARCHIVO, JSON.stringify(estadoGlobal, null, 2))
  } catch {}
}

function personajePara(tierIdx) {
  const pool = personajesGacha.filter(c => c.rareza === TIER_A_POOL(tierIdx))
  const base = pool.length > 0 ? pool : personajesGacha
  return base[Math.floor(Math.random() * base.length)]
}

export function tirar(jid, rand = Math.random) {
  const s = usuario(jid)
  s.tiradas++

  let pesos = RAREZAS.map(r => r.peso)

  const bloques = Math.floor(s.sinEpico / 10)
  if (bloques > 0) {
    const shift = Math.min(bloques * 2, 25)
    for (let i = ALTAS_MIN; i < RAREZAS.length; i++) pesos[i] += (shift * RAREZAS[i].peso) / SUMA_ALTAS
    pesos[0] = Math.max(0, pesos[0] - shift / 2)
    pesos[1] = Math.max(0, pesos[1] - shift / 2)
  }

  const suerte = rand() < 0.05
  if (suerte) for (let i = ALTAS_MIN; i < RAREZAS.length; i++) pesos[i] *= 2

  let idxPity = -1
  for (const p of PITY) {
    if (s[p.key] + 1 >= p.tiradas) { idxPity = p.idx; break }
  }
  if (idxPity >= 0) for (let i = 0; i < idxPity; i++) pesos[i] = 0

  const suma = pesos.reduce((a, b) => a + b, 0)
  const objetivo = rand() * suma
  let elegido = 0
  let acum = 0
  for (let i = 0; i < pesos.length; i++) {
    acum += pesos[i]
    if (objetivo <= acum) { elegido = i; break }
  }

  const personaje = personajePara(elegido)
  const probAhora = (pesos[elegido] / suma) * 100

  for (const p of PITY) {
    if (elegido >= p.idx) s[p.key] = 0
    else s[p.key]++
  }
  guardar()

  return {
    tirada: s.tiradas,
    personaje: personaje.nombre,
    pj: personaje,
    rareza: RAREZAS[elegido].nombre,
    suerte,
    probabilidad: probAhora,
    racha: s.sinEpico % 10
  }
}

export default {
  comandos: ["gacha"],
  ayuda: ".gacha — tira un personaje con el sistema de 17 rarezas",
  ejecutar: async (ctx) => {
    const r = tirar(ctx.sender || ctx.senderNumber || "anon")
    const caption =
      `🎲 Tirada #${r.tirada}\n` +
      `Personaje: ${r.pj.nombre}\n` +
      `Rareza: ${r.rareza}\n` +
      `¿Tirada de suerte?: ${r.suerte ? "Sí" : "No"}\n` +
      `Probabilidad actual de esa rareza: ${r.probabilidad.toFixed(2)}%\n` +
      `Racha mala: ${r.racha}/10 para subir la suerte\n` +
      `🖼️ Imagen: ${transformacionDe(r.pj.nombre, r.rareza, r.pj.poder)}`
    let imagenOk = false
    try {
      const resp = await fetch(r.pj.foto, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) })
      if (!resp.ok) throw new Error(`foto ${resp.status}`)
      const buf = await imagenTransformada(Buffer.from(await resp.arrayBuffer()), r.rareza)
      await ctx.sock.sendMessage(ctx.from, { image: buf, caption }, { quoted: ctx.msg })
      imagenOk = true
    } catch (e) {
      console.log(`[GACHA] imagen transformada falla: ${String(e?.message || e).slice(0, 80)}`)
    }
    if (!imagenOk) {
      try {
        await ctx.sock.sendMessage(ctx.from, { image: { url: r.pj.foto }, caption }, { quoted: ctx.msg })
      } catch (e2) {
        await ctx.reply(caption)
      }
    }
  }
}
