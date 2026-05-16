/**
 * Microcopy centralizado — Transparentape
 *
 * Reglas:
 * 1. Loss aversion: nombrar la pérdida ("lo que costó"), no el monto neutro.
 * 2. Labeling (Voss): nombrar la emoción del jurado antes de que la sienta.
 * 3. Concrete > abstract (Construal Level Theory): aterrizar lo abstracto.
 * 4. Nunca "Usuario" → "Ciudadano". Nunca "Eliminar" → "Archivar".
 * 5. Verbos en imperativo corto, sin signos de exclamación.
 */

export const COPY = {
  brand: {
    word: "Transparentape",
    tagline: "El billete deja huella.",
    sub: "Lo grabamos.",
    standfirst: "Acá la puedes leer.",
  },
  coldOpen: {
    kicker: "Soles fiscalizados en obras públicas · Perú · 2019–2026",
    headline: "El billete deja huella. Lo grabamos.",
    sub: "Acá la puedes leer.",
    skipHint: "ESC PARA SALTAR",
  },
  hud: {
    auditedSuffix: "contratos auditados",
    demoSuffix: "contratos demo",
    sourcesLine: "Fuente · OCDS / OECE / MEF",
    liveLabel: "Live data",
    demoLabel: "Demo data",
  },
  index: {
    kicker: "Edición",
    title: "Índice",
    standfirst:
      "Cada línea es un contrato público con coordenadas, plata y nombre y apellido.",
    emptySearch: "Ningún caso coincide con tu búsqueda.",
    searchPlaceholder: "Buscar obra, distrito, contratista, RUC…",
    filters: {
      todas: "Todas",
      alto: "Riesgo alto",
      medio: "Riesgo medio",
      bajo: "Riesgo bajo",
    },
  },
  panel: {
    kicker: "Caso",
    rastreoLabel: "Rastreo del billete",
    money: {
      referencial: "Lo que dijeron",
      adjudicado: "Lo que firmaron",
      contrato: "Lo que costó",
    },
    recipient: {
      label: "Quién recibió el billete",
      rucLabel: "RUC",
      antecedentesLabel: "Antecedentes",
      antecedentesFrase: "Figura en {tipos}.",
    },
    buyer: {
      label: "Quién pagó",
    },
    contract: {
      label: "Contrato",
      inicio: "Inicio",
      fin: "Fin",
      estado: "Estado",
      adendas: "Adendas",
      metodo: "Método",
    },
    ai: {
      label: "Análisis automático",
      scoreSuffix: "score {score}/100",
    },
    cta: {
      investigate: "Investigar este caso",
      share: "Compartir",
      open: "Abrir página pública",
    },
    riesgo: {
      alto: "Riesgo alto",
      medio: "Riesgo medio",
      bajo: "Sin alertas",
    },
  },
  forensics: {
    kicker: "Investigación",
    introTemplate:
      "{comprador} contrató a {contratista} por {monto}. Estos son los puntos que vale la pena mirar.",
    severidad: {
      alta: "Severidad alta",
      media: "Severidad media",
      info: "Contexto",
    },
    disclaimer:
      "Esta investigación es generada automáticamente sobre datos abiertos. No es una acusación.",
    cta: "Compartir el caso ↗",
  },
  share: {
    twitterTextDetalle:
      "{titulo} · {distrito} · {monto}. Transparentape.",
    twitterTextForensics:
      "Caso {titulo} · {monto} · {alertas} alertas. Transparentape.",
  },
  publicPage: {
    kickerCaso: "Caso",
    backToMap: "← Volver al mapa",
    intro: {
      pagoConnector: " pagó ",
      aConnector: " a ",
      enFechaConnector: " en ",
    },
    rastreoLabel: "Rastreo del billete",
    streetViewCaption: "Street View · Google · Coordenadas {lat}, {lng}",
    pullQuoteTemplate: "Este contratista figura en {tipos}.",
    pullQuoteSource: "Fuente · OECE datosabiertos · {año}",
    buyerLabel: "Quién pagó",
    recipientLabel: "Quién recibió",
    contractLabel: "Detalles del contrato",
    aiLabel: "Análisis automático",
    sources: "Datos · OCDS Open Contracting / OECE / MEF",
  },
  loading: "Cargando obras…",
} as const;
