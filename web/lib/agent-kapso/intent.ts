import type { Country } from "./session";
import type { BuscarObrasFilters } from "./queries";

export type Intent =
  | "CAMBIAR_PAIS"
  | "BUSCAR_OBRAS"
  | "BUSCAR_CERCANOS"
  | "VER_DETALLE"
  | "CONTEXTO_DETALLE"
  | "STATS"
  | "MONTO_EN_RIESGO"
  | "RANKING_CONTRATISTAS"
  | "RANKING_ENTIDADES"
  | "ADJUDICACION_DIRECTA"
  | "INVESTIGAR_CONTRATISTA"
  | "INHABILITADOS"
  | "AYUDA"
  | "AGRADECIMIENTO"
  | "PREGUNTA_LIBRE";

export interface ParsedIntent {
  intent: Intent;
  country?: Country;
  filters?: BuscarObrasFilters;
  obraId?: number;
  contextPosition?: number; // 1-based index into session.lastResultIds; -1 = last
  contratista?: string;
  ruc?: string;
}

const ORDINAL_MAP: [RegExp, number][] = [
  [/\bel\s+primer[ao]?\b|\b#?1\b|\buno\b/i, 1],
  [/\bel\s+segund[ao]?\b|\b#?2\b|\bdos\b/i, 2],
  [/\bel\s+tercer[ao]?\b|\b#?3\b|\btres\b/i, 3],
  [/\bel\s+cuart[ao]?\b|\b#?4\b|\bcuatro\b/i, 4],
  [/\bel\s+quint[ao]?\b|\b#?5\b|\bcinco\b/i, 5],
  [/\b[uú]ltim[ao]\b/i, -1],
];

function extractContextPosition(text: string): number | null {
  for (const [re, pos] of ORDINAL_MAP) {
    if (re.test(text)) return pos;
  }
  return null;
}

const COUNTRY_PATTERNS: [RegExp, Country][] = [
  [/\bper[uú]\b/i, "PE"],
  [/\bchile\b|\bchileno\b/i, "CL"],
  [/\bcolombia\b/i, "CO"],
  [/\bm[eé]xico\b|\bmexicano\b/i, "MX"],
  [/\bargentina\b/i, "AR"],
  [/\bbrasil\b/i, "BR"],
];

export function detectCountry(text: string): Country | null {
  for (const [re, code] of COUNTRY_PATTERNS) {
    if (re.test(text)) return code;
  }
  return null;
}

const YEAR_RE = /\b(20\d{2})\b/;
const RUC_RE = /\b(\d{8,12})\b/;
const THIS_YEAR = new Date().getFullYear();

function extractYear(text: string): number | undefined {
  const m = text.match(YEAR_RE);
  if (m) return parseInt(m[1]);
  if (/\beste\s+año\b|\bdel\s+año\s+en\s+curso\b|\baño\s+actual\b|\bactual\b.*\baño\b/i.test(text)) return THIS_YEAR;
  if (/\baño\s+pasado\b|\bel\s+a[nñ]o\s+anterior\b|\bdel\s+a[nñ]o\s+pasado\b/i.test(text)) return THIS_YEAR - 1;
  return undefined;
}

const PE_DEPTS = [
  "amazonas","ancash","apurímac","apurimac","arequipa","ayacucho","cajamarca","callao",
  "cusco","huancavelica","huánuco","huanuco","ica","junín","junin","la libertad",
  "lambayeque","lima","loreto","madre de dios","moquegua","pasco","piura","puno",
  "san martín","san martin","tacna","tumbes","ucayali",
];
const CL_REGIONES = [
  "arica","tarapacá","tarapaca","antofagasta","atacama","coquimbo","valparaíso",
  "valparaiso","metropolitana","o'higgins","maule","ñuble","nuble","biobío","biobio",
  "araucanía","araucania","los ríos","los rios","los lagos","aysén","aysen","magallanes",
];
const PE_DISTRITOS = [
  "miraflores","san isidro","barranco","surco","surquillo","la molina","san borja",
  "jesus maria","lince","magdalena","pueblo libre","breña","rimac","san luis",
  "ate","vitarte","comas","villa el salvador","villa maria del triunfo",
  "san juan de lurigancho","san juan de miraflores","chorrillos","carabayllo",
  "independencia","los olivos","san martin de porres","puente piedra","lurigancho",
  "chaclacayo","cieneguilla","pachacamac","pucusana","santa maria del mar",
];

function extractRegion(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const r of [...PE_DEPTS, ...CL_REGIONES]) {
    if (lower.includes(r)) return r;
  }
  return undefined;
}

function extractLocalidad(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const d of PE_DISTRITOS) {
    if (lower.includes(d)) return d;
  }
  return undefined;
}

export function parseIntent(text: string, sessionCountry: Country): ParsedIntent {
  const t = text.trim();

  // Country switch
  const newCountry = detectCountry(t);
  if (
    newCountry &&
    /\bcambiar?\b|\bseleccionar?\b|\bquiero\b.*\bpai[s]?\b|\bpai[s]?\b.*\bcambiar?\b/i.test(t)
  ) {
    return { intent: "CAMBIAR_PAIS", country: newCountry };
  }
  // Message is only a country name → switch
  if (newCountry && t.split(/\s+/).length <= 3) {
    return { intent: "CAMBIAR_PAIS", country: newCountry };
  }

  const country: Country = newCountry ?? sessionCountry;

  // Gratitude / acknowledgement → deterministic short reply, no LLM
  if (/^\s*(gracias|thank|ok|okay|okey|dale|entendido|perfecto|listo|claro|genial|excelente|buenísimo|👍|🙏)\s*[!.?]*\s*$/i.test(t)) {
    return { intent: "AGRADECIMIENTO", country };
  }

  // Greetings and help — both standalone AND as opener ("Hola, ¿cómo funciona?")
  if (
    /^\s*(hola|holi|hey|hi|buenos?\s+d[ií]as?|buenas?\s+tardes?|buenas?\s+noches?|buenas?|saludos?|buen\s+d[ií]a|qué\s+tal|como\s+est[aá]s?|ayuda|comandos|\?{2,}|qu[eé]\s+puedes|qu[eé]\s+haces|qu[eé]\s+sabes|inicio|empezar|start|men[uú])\s*[!.?,]*\s*$/i.test(t)
  ) {
    return { intent: "AYUDA", country };
  }

  // Proximity search — "cerca de mí", "más cercana", "cerca de [lugar]"
  if (/\bcerca(n[ao]s?)?\b|\bpr[oó]xim[ao]s?\b|\bm[aá]s\s+cercana\b|\bm[ií]\s+ubicaci[oó]n\b|\bcercan[ií]a\b/i.test(t)) {
    return { intent: "BUSCAR_CERCANOS", country };
  }

  // Context: "el primero", "el segundo", "más detalle del 3"
  const contextRe = /\bel\s+(primer|segund|tercer|cuart|quint|[uú]ltim)[ao]?\b|\bm[aá]s\s+(detalle|info)\b/i;
  if (contextRe.test(t)) {
    const pos = extractContextPosition(t);
    if (pos !== null) return { intent: "CONTEXTO_DETALLE", country, contextPosition: pos };
  }

  // Detail by explicit ID
  const idMatch = t.match(/\b(?:detalle|ver|obra|id)\s*[:#]?\s*(\d+)\b/i);
  if (idMatch) {
    return { intent: "VER_DETALLE", country, obraId: parseInt(idMatch[1]) };
  }

  // Investigate contractor
  const rucMatch = t.match(RUC_RE);
  if (rucMatch && /\bcontratista\b|\bempresa\b|\bruc\b|\binvestigar?\b/i.test(t)) {
    return { intent: "INVESTIGAR_CONTRATISTA", country, ruc: rucMatch[1] };
  }
  if (/\binvestigar?\b|\bcontratista\b.*\bempresa\b/i.test(t)) {
    const nameMatch = t.match(/(?:investigar?|empresa|contratista)\s+(.+)/i);
    return {
      intent: "INVESTIGAR_CONTRATISTA",
      country,
      contratista: nameMatch?.[1]?.trim(),
    };
  }

  // Inhabilitados
  if (/\binhabilitad[oa]s?\b|\bsancionad[oa]s?\b|\bpenalidad\b/i.test(t)) {
    return { intent: "INHABILITADOS", country };
  }

  // Adjudicación directa con alertas
  if (/\badjudicaci[oó]n\s+direct[ao]\b|\bdirect[ao]\s+con\s+alert[ao]\b|\bcontrat[ao]s?\s+direct[ao]s?\b/i.test(t)) {
    return { intent: "ADJUDICACION_DIRECTA", country };
  }

  // Ranking entidades compradoras
  if (/\branking\s+entidades?\b|\bentidades?\s+compradoras?\b|\btop\s+entidades?\b|\bmayores?\s+compradores?\b/i.test(t)) {
    return { intent: "RANKING_ENTIDADES", country };
  }

  // Ranking contractors
  if (/\branking\b|\bmayores?\s+contratistas?\b|\btop\b.*\bcontratistas?\b/i.test(t)) {
    return { intent: "RANKING_CONTRATISTAS", country };
  }

  // Monto en riesgo
  if (/\bmonto\s+en\s+riesgo\b|\bcuanto\s+est[aá]\s+en\s+riesgo\b|\btotal\s+alertas?\b|\bdinero\s+en\s+riesgo\b/i.test(t)) {
    return { intent: "MONTO_EN_RIESGO", country };
  }

  // Stats
  if (/\bestad[ií]sticas?\b|\bresumen\b|\btotal\b|\bcuantas?\s+obras\b|\bpanorama\b/i.test(t)) {
    return { intent: "STATS", country };
  }

  // Search obras
  if (
    /\bobras?\b|\bproyecto\b|\bconcurso\b|\blicitaci[oó]n\b|\badjudicaci[oó]n\b|\bcontrato\b|\bconstrucci[oó]n\b/i.test(t) ||
    extractRegion(t) ||
    extractLocalidad(t) ||
    extractYear(t)
  ) {
    const filters: BuscarObrasFilters = { country };
    const year = extractYear(t);
    if (year) filters.year = year;
    const region = extractRegion(t);
    if (region) filters.region = region;
    else {
      const localidad = extractLocalidad(t);
      if (localidad) filters.localidad = localidad;
    }

    if (/\balerta[s]?\b|\brisk\b|\bflag\b|\bsospech[oa]\b/i.test(t)) {
      filters.red_flag = true;
    }
    if (/\bdirect[ao]?\b|\badjudicaci[oó]n\s+directa\b/i.test(t)) {
      filters.procurement_method = "direct";
    }

    if (!region && !extractLocalidad(t) && !year) {
      filters.q = t
        .replace(/\b(obras?|proyectos?|en|de|del|la|los|las|el|un|una|este|año)\b/gi, "")
        .trim()
        .slice(0, 60) || undefined;
    }

    return { intent: "BUSCAR_OBRAS", country, filters };
  }

  return { intent: "PREGUNTA_LIBRE", country };
}
