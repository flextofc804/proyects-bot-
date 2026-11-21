import fs from "fs"
import path from "path"
import { fileURLToPath, pathToFileURL } from "url"

const RAIZ_PLUGINS = path.dirname(fileURLToPath(import.meta.url))

async function cargarPlugins() {
  const lista = []
  let carpetas = []
  try {
    carpetas = fs.readdirSync(RAIZ_PLUGINS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  } catch (e) {
    console.error(`[PLUGINS] no se pudo leer plugins/: ${String(e?.message || e)}`)
    return lista
  }
  for (const categoria of carpetas) {
    for (const nombre of fs.readdirSync(path.join(RAIZ_PLUGINS, categoria)).filter((f) => f.endsWith(".js")).sort()) {
      const archivo = path.join(RAIZ_PLUGINS, categoria, nombre)
      try {
        const mod = await import(pathToFileURL(archivo).href)
        const plugin = mod?.default
        if (!plugin) continue
        if (!Array.isArray(plugin.comandos) || !plugin.comandos.length || typeof plugin.ejecutar !== "function") {
          console.error(`[PLUGINS] ${categoria}/${nombre} ignorado (falta default con comandos[] y ejecutar())`)
          continue
        }
        lista.push({
          categoria,
          archivo: `${categoria}/${nombre}`,
          comandos: [...new Set(plugin.comandos.map((c) => String(c).toLowerCase().trim()))].filter(Boolean),
          ayuda: String(plugin.ayuda || ""),
          ejecutar: plugin.ejecutar
        })
        console.log(`[PLUGINS] cargado ${categoria}/${nombre}: ${lista[lista.length - 1].comandos.join(", ")}`)
      } catch (e) {
        console.error(`[PLUGINS] error cargando ${categoria}/${nombre}: ${String(e?.message || e)}`)
      }
    }
  }
  return lista
}

export const PLUGINS = await cargarPlugins()

export function comandosPlugins() {
  const setCmd = new Set()
  for (const p of PLUGINS) for (const c of p.comandos) setCmd.add(c)
  return setCmd
}

export async function ejecutarPlugin(ctx) {
  const comando = String(ctx?.command || "").toLowerCase()
  const plugin = PLUGINS.find((p) => p.comandos.includes(comando))
  if (!plugin) return false
  try {
    await plugin.ejecutar(ctx)
  } catch (e) {
    console.error(`[PLUGINS] error en ${plugin.archivo}: ${String(e?.message || e)}`)
    await ctx.reply(`❌ Error ejecutando ${comando}: ${String(e?.message || e).slice(0, 200)}`)
  }
  return true
}
