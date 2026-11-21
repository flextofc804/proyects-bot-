import "./log-limpio.js"

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
          { cmd: "brat", desc: "sticker de texto estilo brat" },
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
          { cmd: "wr", desc: "tirar el gacha (personaje aleatorio)" },
          { cmd: "c", desc: "reclamar el personaje que salio" },
          { cmd: "gacha", desc: "gacha de 17 rarezas con suerte y pity" },
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
          { cmd: "reenviar", desc: "reenviar tu código de pairing" },
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

export { menuOrder, menuAliases, menuCategories }
