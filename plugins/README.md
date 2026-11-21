# plugins/

Comandos modulares del bot. Cada carpeta es una **categoría** (las mismas del menú: economia, stickers, gacha, descargas, perfil, subbots, utilidades, admin, reacciones, uno, anime) y cada `.js` dentro de ella es un **plugin**.

## Cómo se carga

`plugins/loader.js` escanea todas las categorías al arrancar y expone:

- `PLUGINS` — lista de plugins cargados (`{ categoria, archivo, comandos, ayuda, ejecutar }`).
- `comandosPlugins()` — Set con todos los aliases (se agrega a `COMANDOS_VALIDOS` en index.js para el filtro anti-bucle `fromMe`).
- `ejecutarPlugin(ctx)` — ejecuta el plugin que matchea `ctx.command`; devuelve `true` si lo manejó.

`index.js` consulta `ejecutarPlugin(ctx)` justo antes del switch de comandos: si un plugin atiende el comando, el switch no se evalúa.

## Plantilla de plugin

Archivo, por ejemplo, `plugins/<categoria>/mi-comando.js`:

```js
export default {
  categoria: "stickers",
  comandos: ["micomando", "alias"],
  ayuda: "micomando <algo> - que hace",
  ejecutar: async (ctx) => {
    // ctx = { sock, from, msg, command, text, args, reply, sender, senderNumber, isOwner, isGroup, reaccionar }
    await ctx.reply(`Escribiste: ${ctx.text}`)
  }
}
```

- `comandos`: nombre(es) del comando en minúscula (sin prefijo).
- `ejecutar(ctx)`: recibe el mismo contexto del handler de index.js.
- `ctx.reaccionar([emoji])`: reacciona al mensaje del comando.
- Los errores del plugin no tiran abajo al bot: el loader los reporta y responde al usuario.

## Plugins actuales

- `stickers/brat.js` → `.brat <texto>`: sticker estilo brat (generador verificado: api.siputzx.my.id).
