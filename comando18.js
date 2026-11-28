// Prende / apaga los comandos +18 por grupo (estado persistido en la db)
export const COMANDOS_18 = ["comando+18", "comando18"]

export async function ejecutarComando18({ args = [], reply, isAdmin, isGroup, settings, guardar, pie = "" }) {
  if (!isGroup) {
    await reply("Este comando solo funciona en grupos")
    return false
  }
  if (!(await isAdmin())) {
    await reply(`Solo admin/owner pueden usar este comando${pie}`)
    return false
  }
  const sub = String(args[0] || "").toLowerCase()
  if (sub === "on") {
    settings.nsfwEnabled = true
    settings.nsfw = true // compatibilidad con el comando .nsfw de siempre
    if (typeof guardar === "function") guardar()
    await reply(`🔞 Comandos +18 ACTIVADOS en este grupo.\n> Usá *.comando+18 off* para apagarlos.${pie}`)
    return true
  }
  if (sub === "off") {
    settings.nsfwEnabled = false
    settings.nsfw = false
    if (typeof guardar === "function") guardar()
    await reply(`🔞 Comandos +18 DESACTIVADOS en este grupo.${pie}`)
    return true
  }
  await reply(`⚠️ Uso: *.comando+18 on* / *.comando+18 off*${pie}`)
  return false
}

export default {
  comandos: COMANDOS_18,
  categoria: "grupo",
  isAdmin: true,
  run: ejecutarComando18
}
