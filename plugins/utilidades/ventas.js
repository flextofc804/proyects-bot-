const MENU_VENTAS = `┌──「 ✦ VENTAS ✦ 」──
│
│  *୨୧* ErzaBot-MD/OFC *୨୧*
│
├──〔 🛒 PLANES 〕
│
│  1️⃣ BOT EN TU GRUPO
│  Mi bot entra a tu grupo
│  Vos sos admin, yo te lo activo
│  💲 Precio: $8.000 ARS / $5 USD
│
│  2️⃣ SERVIDOR PROPIO
│  Servidor solo para vos
│  Más rápido, sin caídas
│  Me pasás tu número y te lo conecto
│  💲 Precio: $24.000 ARS / $15 USD
│
├──〔 💳 PAGOS 〕
│  💳 PayPal Gmial » [vaselevichenzo410@gmail.com] - Pagás en USD
│  💳 Mercado Pago » Alias: enzo-vase - Pagás en ARS
│
└──〔 📩 COMPRAR 〕
   ✦ Escribí .comprar + 1 o 2
   ✦ Ejemplo: .comprar 1`

export default {
  categoria: "utilidades",
  comandos: ["ventas"],
  ayuda: "ventas - muestra los planes y formas de pago",
  ejecutar: async (ctx) => {
    await ctx.reply(MENU_VENTAS)
  }
}
