import fs from "fs"
import os from "os"
import path from "path"
import axios from "axios"
import ffmpegStatic from "ffmpeg-static"
import { exec as execCb } from "child_process"
import { promisify } from "util"

const execAsync = promisify(execCb)

let sharpLib
async function loadSharp() {
  if (sharpLib !== undefined) return sharpLib
  try {
    sharpLib = (await import("sharp")).default
  } catch {
    sharpLib = null
  }
  return sharpLib
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

const GENERADORES = [(t) => `https://api.siputzx.my.id/api/m/brat?text=${encodeURIComponent(t)}`]

async function bajarBratPng(texto) {
  let ultimoError = null
  for (const armar of GENERADORES) {
    for (let intento = 1; intento <= 2; intento++) {
      try {
        const r = await axios.get(armar(texto), { responseType: "arraybuffer", timeout: 30000, headers: { "User-Agent": UA } })
        const buf = Buffer.from(r?.data || [])
        if (buf.length > 1000 && buf[0] === 0x89 && buf[1] === 0x50) return buf
        ultimoError = new Error(`respuesta invalida (${buf.length} bytes)`)
      } catch (e) {
        ultimoError = e
      }
    }
  }
  throw ultimoError || new Error("ningun generador respondio")
}

function binarioFfmpeg() {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic
  return "ffmpeg"
}

async function pngAStickerWebp(png) {
  const sharp = await loadSharp()
  if (sharp) {
    return await sharp(png)
      .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 95 })
      .toBuffer()
  }
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const inFile = path.join(os.tmpdir(), `brat-${token}-in.png`)
  const outFile = path.join(os.tmpdir(), `brat-${token}-out.webp`)
  fs.writeFileSync(inFile, png)
  try {
    await execAsync(
      `"${binarioFfmpeg()}" -y -i "${inFile}" -vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0" -frames:v 1 -an "${outFile}"`,
      { timeout: 30000 }
    )
    const webp = fs.readFileSync(outFile)
    if (!webp.length) throw new Error("ffmpeg devolvio un webp vacio")
    return webp
  } finally {
    try { fs.unlinkSync(inFile) } catch {}
    try { fs.unlinkSync(outFile) } catch {}
  }
}

export default {
  categoria: "stickers",
  comandos: ["brat"],
  ayuda: "brat <texto> - sticker de tu texto estilo brat",
  ejecutar: async (ctx) => {
    const texto = String(ctx.text || "").trim().slice(0, 300)
    if (!texto) {
      await ctx.reply([
        "✧﹒˚﹒﹒˚﹒✧",
        "✿ 𝘣𝘳𝘢𝘵 ✿",
        "escribe .brat + tu texto ✎",
        "✦ ejemplo: .brat ErzaBot-MD ✦",
        "✧﹒˚﹒﹒˚﹒✧"
      ].join("\n"))
      return
    }
    await ctx.reaccionar(["🖼️"])
    const png = await bajarBratPng(texto)
    const webp = await pngAStickerWebp(png)
    await ctx.sock.sendMessage(ctx.from, { sticker: webp }, { quoted: ctx.msg })
    await ctx.reaccionar(["✅"])
  }
}
