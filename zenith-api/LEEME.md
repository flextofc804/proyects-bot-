# ZENITH API — tu propia API de descargas

Esta carpeta es una mini-API que corre en **tu PC** y hace las descargas de YouTube
con la IP de tu casa (que YouTube NO bloquea). El bot del hosting la usa cuando
está prendida, y si está apagada usa las otras formas automáticas.

---

## Paso 1 — Instalar Node.js en tu PC (una sola vez)

1. Entra a **https://nodejs.org**
2. Tocá el botón verde de descarga (versión LTS)
3. Instalá con "Siguiente, siguiente, terminar"

## Paso 2 — Arrancar tu API

1. Descargá esta carpeta `zenith-api` completa a tu PC
2. **Doble clic en `INICIAR-WINDOWS.bat`** (en Mac/Linux: `sh INICIAR-LINUX-MAC.sh`)
3. La primera vez descarga sola el programa de descargas (yt-dlp), esperá un poco
4. Cuando aparezca **"ZENITH API corriendo en esta PC"** con una **Clave**, dejá esa ventana abierta

> ⚠️ La ventana tiene que estar abierta para que las descargas funcionen.
> Si la cerrás, el bot sigue funcionando con las otras formas de descarga.

## Paso 3 — Hacer que el bot te encuentre (túnel)

El bot está en internet y tu PC no, así que necesitamos un "puente" gratuito:

1. Descargá **cloudflared** para Windows: https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
2. Renombralo a `cloudflared.exe` y ponelo en esta misma carpeta `zenith-api`
3. Abrí una ventana de comandos en esa carpeta (escribí `cmd` en la barra de dirección del explorador y Enter)
4. Poné: `cloudflared.exe tunnel --url http://localhost:3333`
5. Te va a aparecer una dirección tipo `https://palabra-palabra-palabra.trycloudflare.com` — **copiala**
6. (Opcional pero recomendado) Si querés que el puente quede fijo mientras la PC está prendida, dejá esa ventana abierta también

## Paso 4 — Conectar el bot con tu API

1. En la carpeta del **bot** (en el hosting), creá un archivo llamado **`api-propia.txt`**
2. Adentro poné 2 líneas:

```
https://la-direccion-que-te-dio-cloudflared.trycloudflare.com
la-clave-que-te-mostro-la-ventana-de-la-API
```

3. Reiniciá el bot. Listo — usá `#ytdebug` y te tiene que decir `API propia: OK`

---

## Preguntas frecuentes

**¿Tengo que hacer esto todos los días?**
No. Solo repetí el paso 3 (el puente) cada vez que prendas la PC, porque la
dirección cambia. El paso 1, 2 y 4 son una sola vez.

**¿Qué pasa si apago la PC?**
Nada grave: el bot automáticamente usa las otras formas de descarga (API
pública gratuita). Cuando prendas la PC de nuevo, vuelve a usar la tuya.

**¿Puedo poner mis cookies de YouTube?**
Sí, y hace que videos con restricción de edad funcionen: poné tu archivo
`cookies.txt` dentro de esta carpeta `zenith-api` (junto a `api.mjs`).

**¿Es segura?**
La API solo acepta pedidos con tu clave y solo de YouTube, TikTok e Instagram.
Nadie puede usar tu PC para otra cosa.
