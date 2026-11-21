import sharp from "sharp"

const TRANSFORMACIONES = {
  "Naruto Uzumaki": { epico: "Modo Sabio", superEpico: "Modo Chakra de Kurama", legendario: "Modo Kurama completo, aura gigante de chakra", mitico: "Modo Sabio de los Seis Caminos, orbes de verdad flotando", divino: "Modo Sabio de los Seis Caminos con alas de chakra y halo de luz", final: "Modo Baryon, cuerpo incandescente, corona de chakra y trono del Hokage" },
  "Sasuke Uchiha": { epico: "Sello Maldito activado", superEpico: "Mangekyo Sharingan en los dos ojos", legendario: "Susano'o completo violeta", mitico: "Rinnegan despertado, portal dimensional abierto", divino: "Susano'o con Rinnegan, alas de chakra", final: "Indra renacido, corona de fuego negro y trono de Susano'o" },
  "Monkey D. Luffy": { epico: "Gear 2, cuerpo humeando", superEpico: "Gear 3, brazo gigante", legendario: "Gear 4 Boundman, cuerpo humeante y negro", mitico: "Awakening de la Goma, el entorno se vuelca como goma", divino: "Gear 4 Snakeman con alas de humo y halo", final: "Gear 5, Nika Dios del Sol, cabello blanco, risa total, trono de nubes" },
  "Roronoa Zoro": { epico: "Santoryu con Wado Ichimonji en la boca", superEpico: "Nitoryu + Armadura total", legendario: "Nueve Cuchillas de Asura, aura de tres cabezas", mitico: "Haoshoku envevoliendo cada espada", divino: "Asura dorado con halo de espadines", final: "El mejor espadachín del mundo, corona de sable, trono de espadas" },
  "Son Goku": { epico: "Super Saiyan, pelo dorado", superEpico: "Super Saiyan 3, melena larga y sin cejas", legendario: "Super Saiyan Blue, aura divina azul", mitico: "Ultra Instinto signo, pelo plateado", divino: "Ultra Instinto dominado, aura de dios y halo enfocado", final: "Forma final absoluta del Saiyan criado en la Tierra, trono y corona de ki" },
  "Vegeta": { epico: "Super Saiyan, aura dorada", superEpico: "Super Saiyan 2, chispas eléctricas", legendario: "Super Saiyan Blue Evolucionado, azul intenso", mitico: "Ultra Ego, pelo violeta y sonrisa de dios", divino: "Ultra Ego con halo divino y cuerpo de destrucción", final: "El príncipe Saiyan al poder absoluto, corona y trono de la destrucción" },
  "Tanjiro Kamado": { epico: "Marca del pilar difuminada en la cara", superEpico: "Aliento del Sol parcial, hoja roja", legendario: "Respiración Solar completa, aura de fuego solar", mitico: "Cabeza impenetrable + Sol total, hoja roja al máximo", divino: "Hinokami Kagura eterno, halo solar y alas de llama", final: "El cazador que cortó la oscuridad, corona de sol naciente y trono de llamas" },
  "Zenitsu Agatsuma": { epico: "Trueno Divino primera forma", superEpico: "Trueno Divino segunda forma (Seis Cortes)", legendario: "Trueno Divino séptima forma, Onda de Godspeed", mitico: "Variación plena, cuerpo de rayo puro", divino: "Tormenta divina con alas de relámpago y halo", final: "El rayo absoluto, trono de truenos y corona de centellas" },
  "Satoru Gojo": { epico: "Ojos descubiertos, Six Eyes al máximo", superEpico: "Infinito activo, nada lo toca", legendario: "Expansión de Dominio: Vacío Infinito púrpura", mitico: "Hollow Púrpura doble cargado, forma de dios", divino: "El hechicero más fuerte, alas de energía maldita invertida", final: "El dios del jujutsu moderno, trono de espacio plegado y corona de ceguera luminosa" },
  "Eren Yeager": { epico: "Titán de Ataque al descubierto", superEpico: "Titan Endurecido", legendario: "Titán Fundador con cadenas", mitico: "Titán Fundador con espinas de hueso gigantes", divino: "El Titán Fundador con alas de luz y halo de yugo", final: "El dios que aplastó el mundo, trono de hueso y corona de titán de origen" },
  "Levi Ackerman": { epico: "Giro de espadas imposible de ver", superEpico: "Hoja de Acero endurecida", legendario: "Despertar Ackerman, estela ondulante", mitico: "El soldado más fuerte de la humanidad al límite", divino: "Halo de ballesta y alas de liberación de gas", final: "El capitán inmortal, corona de asas y trono de elegidos" },
  "Izuku Midoriya": { epico: "Full Cowl 5%", superEpico: "Full Cowl 20%, ondas de aire", legendario: "Full Cowl 100%, cuerpo rojo fulgurante", mitico: "One For All completo con los seis vestigios", divino: "Los seis quirk al unísono, alas de aire comprimido", final: "El noveno heredero al límite absoluto, corona de One For All y trono de escombros" },
  "All Might": { epico: "Plus Ultra, músculo inflado", superEpico: "Detroit Smash, cuerpo humeante", legendario: "United States of Smash cargado", mitico: "One For All puro, cuerpo de oro", divino: "El símbolo de la paz eterno, halo de estrella", final: "El símbolo eterno, corona de heroísmo y trono de victorias" },
  "Ichigo Kurosaki": { epico: "Shikai de Zangetsu", superEpico: "Bankai, Tensa Zangetsu negro", legendario: "Vasto Lorde, máscara blanca y aura", mitico: "Mugetsu, cuerpo de sombra lunar", divino: "Hollow final con halo blanco y alas de sombra", final: "El Shinigami sustituto absoluto, trono lunar y corona de Getsuga" },
  "Saitama": { epico: "Cara seria, puño normal directo", superEpico: "Mirada seria bajo el capuchón", legendario: "Puño serio contra un meteorito", mitico: "Cara seria total, viento de ki invisible", divino: "Halo de broma y alas de capullo", final: "El golpe que nada aguanta, trono de ciudad limpia y corona de chiste eterno" },
  "Gon Freecss": { epico: "Jajanken cargado de piedra", superEpico: "Ren reforzado al máximo", legendario: "Contrato de sacrificio, cuerpo adulto transformado", mitico: "Aura de sacrificio en las nubes", divino: "Halo de piedra sagrada y alas de aura", final: "El cazador que apostó todo, corona de Jajanken y trono de rocas" },
  "Killua Zoldyck": { epico: "Ojos asesinos brillantes", superEpico: "Yo-yos eléctricos", legendario: "Kanmuru (Velocidad Divina), cuerpo azul eléctrico", mitico: "El asesino Zoldyck liberado, aura traviesa", divino: "Halo de relámpago y alas de chispa blanca", final: "El rayo asesino absoluto, trono de azúcar eléctrico y corona Zoldyck" },
  "Ken Kaneki": { epico: "Ojo Kakugan rojo", superEpico: "Máscara tapabocas negra", legendario: "Kagune Rinkaku gigante de tentáculos", mitico: "El Rey de Un Solo Ojo, kakuja completo", divino: "Halo blanco y alas de centipede", final: "El rey ghoul absoluto, trono de Tokyo en ruinas y corona de tentáculos" },
  "Denji": { epico: "Cordón en el pecho, dientes sierra parcial", superEpico: "Hombre motossierra completo", legendario: "Motosierra completa en frenesí, sangre voladora", mitico: "El demonio de las motosierras en forma divina", divino: "Halo de moto y alas de sangre", final: "El dios de la motosierra, trono de cadenas y corona de cuerda" },
  "Kyojuro Rengoku": { epico: "Aliento de Llamas (segunda forma)", superEpico: "Aliento de Llamas (quinta forma)", legendario: "Nueve Formas: Rengoku completo en llamas", mitico: "Fénix del bello sol, hoja roja eterna", divino: "Halo solar y alas de llama", final: "El guardián eterno del corazón ardiente, trono de fuego y corona de pilar" },
  "Shoyo Hinata": { epico: "Salto de 60cm extra", superEpico: "Ojos de halcón, quick con Kageyama", legendario: "Salto imparable pegado al bloqueo", mitico: "El forastero descarado, cuerpo en envíión divino", divino: "Halo de cancha y alas de envión", final: "El MAIN CHARACTER de la cancha, corona de rally y trono de voleados" },
  "Kaguya Shinomiya": { epico: "Ojo frío de estrategia", superEpico: "Ice Queen despierta", legendario: "Corazón loco de confesiones cruzadas", mitico: "Imperatriz de la noche, iglú divino", divino: "Halo de luna y alas de pluma blanca", final: "La diosa de la luna enamorada, corona lunar y trono de elegidos" },
  "Shanks": { epico: "Sable Gryphon afilado", superEpico: "Presencia de Haoshoku en la espada", legendario: "Corte divino que parte el cielo", mitico: "Haoshoku total, cuerpo de rey", divino: "Halo rojo y alas de emperador", final: "El emperador del nuevo mundo, corona de paja roja y trono marinero" },
  "Kaido": { epico: "Kanaba al rojo, golpe de dragón", superEpico: "Forma híbrida dragón-oni", legendario: "Dragón azul celeste gigante en el cielo", mitico: "Boro Breath a media ciudad", divino: "Halo de boro-boro y alas de dragón", final: "El rey de las bestias absoluto, trono de cielo y corona de cornamenta" },
  "Edward Elric": { epico: "Brazo de acero transmutado, hoja", superEpico: "Alquimia sin círculo al completo", legendario: "Hoja de transmutación al rojo viva", mitico: "Puerta de la Verdad abierta a sus espaldas", divino: "Halo de alquimia y alas de geometría", final: "El alquimista que derrotó a un dios, trono de verdad y corona de plata" },
  "Light Yagami": { epico: "El cuaderno comiendo página", superEpico: "Ojos de Kira, calculador", legendario: "Escena de dios en la lluvia", mitico: "El dios del nuevo mundo deificado", divino: "Halo de brote y alas de la muerte", final: "El dios del nuevo mundo en trono, corona de manzanas rojas" },
  "Sukuna": { epico: "Dos caras, cuatro brazos despertando", superEpico: "Fuga cortante extendida", legendario: "Maleficio Santuario, dominio en llamas", mitico: "Las veinte flechas del Rey de las Maldiciones", divino: "Halo de fuego negro y alas de maldición", final: "El Rey de las Maldiciones absoluto, trono de shibuya y corona de calaveras" },
  "Muzan Kibutsuji": { epico: "Forma de mujer elegante", superEpico: "Forma de niño británico", legendario: "Nueve Espinas rojas, forma demoníaca total", mitico: "El rey demonio al completo, tentáculos de sangre", divino: "Halo de sol temido y alas de espinas", final: "El demonio absoluto, trono de sangre y corona de sangre pura" },
  "Guts": { epico: "Esgrimista del anti-dragon", superEpico: "Armadura Berserker parcial", legendario: "Armadura Berserker completa, ojo rojo", mitico: "El forastero de la marca", divino: "Halo de sacrificio y alas de hierro", final: "El guerrero negro absoluto, trono de dragones caídos y corona de hierro" }
}

const fallback = {
  epico: (c) => `primera transformación: dominio total de ${c.poder}, aura encendida`,
  superEpico: (c) => `segunda transformación: ${c.poder} llevado al límite, cuerpo tensado`,
  legendario: (c) => `forma legendaria: ${c.poder} en estado puro, aura gigante y carta dorada`,
  mitico: (c) => `forma de dios: ${c.poder} divinizado, el cielo tiembla al volverlo a ver`,
  divino: (c) => `forma divina: ${c.poder} como poder celestial, alas de luz y halo`,
  final: (c) => `forma final absoluta:${c.poder} maximo con trono, corona y carta holográfica`
}

const DESCRIPCION = {
  "Basura": "normal, sin aura, fondo gris, como si no corriera nadie",
  "Común": "normal, tal cual es de la serie",
  "Poco Común": "normal con un brillito suave sobre el cuerpo",
  "Raro": "con aura azul chiquita alrededor",
  "Super Raro": "con aura mediana y pose de pelea",
  "Épico": null,
  "Super Épico": null,
  "Legendario": null,
  "Mítico": null,
  "Divino": null,
  "Cósmico": "con el cuerpo hecho de galaxia, estrellas girando adentro",
  "Eterno": "en su forma eterna, imposible de derrotar por.decadas",
  "Infinito": "en su forma infinita, rompiendo todo límite conocido",
  "Secreto": "en su forma secreta oscura, silueta tenebrosa y mirada roja",
  "Ultra Secreto": "mitad ángel mitad demonio, un lado luminoso y el otro oscuro",
  "Glitch": "todo glitcheado, rgb separado, pasando entre realities",
  "Dios": null
}

export function transformacionDe(nombre, tier, poder = "su poder") {
  const t = TRANSFORMACIONES[nombre] || {}
  const clave = tier.normalize("NFD").replace(/[\u0300-\u036f\s]/g, "").toLowerCase()
  const curada = t[clave === "dios" ? "final" : clave === "superepico" ? "superEpico" : clave]
  if (curada) return `${nombre} en ${curada}`
  const visual = {
    "\u00c9pico": `primera transformaci\u00f3n: dominio total de ${poder}, aura encendida, fondo rojo vivo`,
    "Super \u00c9pico": `segunda transformaci\u00f3n: ${poder} llevado al l\u00edmite, cuerpo tensado y aura doble`,
    "Legendario": `forma legendaria: ${poder} en estado puro, aura gigante y carta dorada`,
    "M\u00edtico": `forma de dios: ${poder} divinizado, el cielo tiembla al verlo`,
    "Divino": `forma divina: ${poder} como poder celestial, alas de luz y halo`,
    "Dios": `forma final absoluta: ${poder} sobrehumano con trono, corona y carta hologr\u00e1fica`,
    "Basura": "normal, sin aura, fondo gris, como si no corriera nada",
    "Com\u00fan": "normal, tal cual es de la serie",
    "Poco Com\u00fan": "normal con un brillito suave sobre el cuerpo",
    "Raro": "con aura azul chiquita alrededor",
    "Super Raro": "con aura mediana y pose de pelea",
    "C\u00f3smico": "con el cuerpo hecho de galaxia, estrellas girando adentro",
    "Eterno": "en su forma eterna, imposible de derrotar por d\u00e9cadas",
    "Infinito": "en su forma infinita, rompiendo todo l\u00edmite conocido",
    "Secreto": "en su forma secreta oscura, silueta tenebrosa y mirada roja",
    "Ultra Secreto": "mitad \u00e1ngel mitad demonio, un lado luminoso y el otro oscuro",
    "Glitch": "todo glitcheado, rgb separado, pasando entre realities"
  }
  return `${nombre} ${visual[tier] || "en forma especial"}`
}

export async function imagenTransformada(buffer, tier) {
  const W = 512
  const H = 512
  const base = sharp(buffer, { failOn: "none" }).resize(W, H, { fit: "cover" })

  switch (tier) {
    case "Basura":
      return base.grayscale().modulate({ brightness: 0.8, saturation: 0 }).png().toBuffer()
    case "Común":
      return base.png().toBuffer()
    case "Poco Común":
      return base.modulate({ brightness: 1.12, saturation: 1.05 }).png().toBuffer()
    case "Raro":
      return base.tint({ r: 130, g: 190, b: 255 }).modulate({ brightness: 1.05, saturation: 1.1 }).png().toBuffer()
    case "Super Raro":
      return base.tint({ r: 90, g: 160, b: 255 }).modulate({ brightness: 1.1, saturation: 1.25 }).png().toBuffer()
    case "Épico":
      return base.tint({ r: 255, g: 150, b: 60 }).modulate({ brightness: 1.1, saturation: 1.3 }).png().toBuffer()
    case "Super Épico":
      return base.tint({ r: 255, g: 95, b: 40 }).modulate({ brightness: 1.15, saturation: 1.45 }).png().toBuffer()
    case "Legendario":
      return base.tint({ r: 255, g: 210, b: 80 }).modulate({ brightness: 1.18, saturation: 1.35 }).png().toBuffer()
    case "Mítico":
      return base.tint({ r: 225, g: 232, b: 255 }).modulate({ brightness: 1.22, saturation: 1.1 }).png().toBuffer()
    case "Divino":
      return base.tint({ r: 240, g: 248, b: 255 }).modulate({ brightness: 1.3, saturation: 1.05 }).png().toBuffer()
    case "Cósmico":
      return base.tint({ r: 178, g: 88, b: 255 }).modulate({ brightness: 1.1, saturation: 1.6 }).png().toBuffer()
    case "Eterno":
      return base.tint({ r: 80, g: 255, b: 224 }).modulate({ brightness: 1.12, saturation: 1.3 }).png().toBuffer()
    case "Infinito":
      return base.tint({ r: 60, g: 95, b: 255 }).modulate({ brightness: 1.1, saturation: 1.5 }).png().toBuffer()
    case "Secreto":
      return base.tint({ r: 90, g: 45, b: 130 }).modulate({ brightness: 0.62, saturation: 1.2 }).png().toBuffer()
    case "Ultra Secreto": {
      const claro = await base.clone().modulate({ brightness: 1.3, saturation: 0.85 }).tint({ r: 205, g: 232, b: 255 }).png().toBuffer()
      const oscuro = await base.clone().grayscale().modulate({ brightness: 0.45 }).png().toBuffer()
      const mitad = await sharp(claro).extract({ left: 0, top: 0, width: Math.floor(W / 2), height: H }).toBuffer()
      return sharp(oscuro).composite([{ input: mitad, left: 0, top: 0 }]).png().toBuffer()
    }
    case "Glitch": {
      const fantasma1 = await base.clone().tint({ r: 255, g: 60, b: 60 }).extract({ left: 14, top: 0, width: W - 14, height: H }).png().toBuffer()
      const fantasma2 = await base.clone().tint({ r: 60, g: 255, b: 220 }).extract({ left: 0, top: 0, width: W - 14, height: H }).png().toBuffer()
      return sharp(await base.png().toBuffer()).composite([
        { input: fantasma2, left: 0, top: 0, blend: "screen" },
        { input: fantasma1, left: 14, top: 0, blend: "screen" }
      ]).modulate({ brightness: 1.05, saturation: 1.35 }).png().toBuffer()
    }
    case "Dios":
      return base.tint({ r: 255, g: 214, b: 60 }).modulate({ brightness: 1.28, saturation: 1.9 }).png().toBuffer()
    default:
      return base.png().toBuffer()
  }
}

export default { transformacionDe, imagenTransformada }
