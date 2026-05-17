/**
 * Glosario cívico mínimo. Términos que un ciudadano peruano promedio
 * puede no entender al ver una respuesta del agente. Mantenido corto a
 * propósito — si crece más de 30 entries, mover a tabla `civic_glossary`.
 *
 * Las claves son ASCII-normalizadas (sin acentos, lowercase). El lookup
 * normaliza el input antes de buscar, así "Adjudicación Directa", "adj
 * directa", "ADJUDICACION DIRECTA" → todos resuelven la misma entrada.
 */

export interface Definition {
  term: string;
  short: string;        // 1 línea WhatsApp
  detail?: string;      // opcional — 2-3 líneas con ejemplo
  related?: string[];   // términos relacionados (sugerir al final)
}

const DEFINITIONS: Definition[] = [
  {
    term: "adjudicación directa",
    short: "Contratación sin concurso público — la entidad elige al proveedor directamente.",
    detail:
      "Legal solo bajo condiciones específicas: montos bajos, emergencia, proveedor único o convenios. Uso repetido por la misma entidad o el mismo contratista es una señal de riesgo de favoritismo.",
    related: ["licitación pública", "valor referencial"],
  },
  {
    term: "ocds",
    short: "Open Contracting Data Standard — esquema global para publicar datos de compras públicas.",
    detail:
      "Perú lo adoptó vía SEACE. Hace que las contrataciones sean comparables entre países y trazables por terceros (ciudadanos, periodistas, ONGs).",
    related: ["seace", "ocid"],
  },
  {
    term: "seace",
    short: "Sistema Electrónico de Contrataciones del Estado — donde el Perú publica todas las compras públicas.",
    related: ["ocds", "oece"],
  },
  {
    term: "oece",
    short: "Organismo Especializado para las Contrataciones del Estado (antes OSCE).",
    detail: "Sanciona contratistas que incumplen — inhabilitaciones, multas, suspensiones. Mantiene el registro nacional de inhabilitados.",
    related: ["inhabilitación", "contraloría"],
  },
  {
    term: "ocid",
    short: "Identificador único OCDS de un proceso de contratación.",
    detail: "Sirve para citar una obra de forma global e inequívoca. Aparece en transparentape.app/obras/{ocid}.",
    related: ["ocds"],
  },
  {
    term: "ruc",
    short: "Registro Único de Contribuyentes — ID tributario de empresa peruana, 11 dígitos.",
    related: ["razón social"],
  },
  {
    term: "red flag",
    short: "Señal automática de riesgo: contratista sancionado adjudicado, sobrecosto >10%, adjudicación directa repetida, etc.",
    detail: "No es prueba de delito — es un indicador para vigilar. Cada obra puede tener varios tipos de red flag.",
  },
  {
    term: "alerta",
    short: "Sinónimo coloquial de red flag — señal automática de riesgo detectada por el sistema.",
    related: ["red flag"],
  },
  {
    term: "contraloría",
    short: "Contraloría General de la República — entidad fiscalizadora del gasto público.",
    detail: "Audita ejecución de obras, emite informes de control. Distinta de OECE (que sanciona contratistas) y del Poder Judicial (que juzga delitos).",
    related: ["oece"],
  },
  {
    term: "valor referencial",
    short: "Monto estimado por la entidad antes del concurso.",
    detail: "Si el monto del contrato final supera el valor referencial en >10%, es señal de sobrecosto.",
    related: ["adjudicación directa", "sobrecosto"],
  },
  {
    term: "sobrecosto",
    short: "Diferencia entre el monto firmado del contrato y el valor referencial original.",
    detail: "Sobrecostos > 10% son señal de alerta. Pueden deberse a adendas, modificación de alcance, o adjudicación inflada.",
    related: ["adenda", "valor referencial"],
  },
  {
    term: "adenda",
    short: "Modificación oficial a un contrato firmado — cambia plazo, monto o alcance.",
    detail: "Múltiples adendas en una misma obra son patrón sospechoso (puede indicar mala planificación o uso indebido).",
    related: ["sobrecosto"],
  },
  {
    term: "expediente técnico",
    short: "Documento que contiene el diseño técnico completo de la obra (planos, especificaciones, presupuesto).",
    detail: "Es la base para el concurso. Cambios en el expediente después de adjudicar suelen generar adendas.",
  },
  {
    term: "consorcio",
    short: "Asociación temporal de dos o más empresas para postular juntas a una obra pública.",
    detail: "Legal y común. Sospechoso solo cuando los mismos miembros rotan entre consorcios para ganar siempre.",
  },
  {
    term: "licitación pública",
    short: "Concurso abierto donde cualquier empresa que cumpla requisitos puede postular.",
    detail: "Es la modalidad estándar para obras grandes. Distinta de adjudicación directa.",
    related: ["adjudicación directa"],
  },
  {
    term: "proceso de selección",
    short: "Procedimiento por el cual la entidad elige a un contratista (licitación, adjudicación, concurso, subasta).",
  },
  {
    term: "inhabilitación",
    short: "Sanción de OECE que prohíbe a una empresa contratar con el Estado por un período.",
    detail: "Puede ser temporal (meses) o definitiva. Una empresa inhabilitada vigente que sigue ganando obras = bandera roja institucional.",
    related: ["oece"],
  },
  {
    term: "penalidad",
    short: "Multa aplicada al contratista por incumplir el contrato (atraso, mala calidad, abandono).",
  },
  {
    term: "supervisor",
    short: "Tercero que vigila la ejecución de la obra y reporta avance a la entidad y a INFOBRAS.",
    detail: "Es una empresa o profesional contratado aparte. Conflicto de interés si el supervisor avala obras del mismo contratista repetidamente.",
  },
  {
    term: "infobras",
    short: "Sistema público que monitorea la ejecución física de las obras públicas en Perú.",
    detail: "Reporta avance físico %, fotos, plazos, supervisor. Solo cubre obras que han sido registradas — no todas.",
  },
  {
    term: "concurso público",
    short: "Modalidad de selección abierta similar a licitación, generalmente para servicios o consultoría.",
    related: ["licitación pública"],
  },
  {
    term: "transparentape",
    short: "Soy un agente de WhatsApp que vigila contratos de obras públicas en Latinoamérica.",
    detail: "Uso datos abiertos OCDS + OECE para ayudarte a identificar contratos sospechosos. Escribe *ayuda* para ver qué puedo hacer.",
  },
];

// Build lookup index (ASCII-normalized).
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const INDEX: Map<string, Definition> = new Map();
for (const d of DEFINITIONS) {
  INDEX.set(normalize(d.term), d);
}

// Some entries may be paraphrased by users. Add aliases.
const ALIASES: Record<string, string> = {
  "adj directa": "adjudicación directa",
  "adjudicacion": "adjudicación directa",
  "que es ocds": "ocds",
  "open contracting": "ocds",
  "osce": "oece",
  "registro nacional de proveedores": "oece",
  "red flags": "red flag",
  "bandera roja": "red flag",
  "señal de riesgo": "red flag",
  "registro tributario": "ruc",
  "contratista sancionado": "inhabilitación",
  "empresa sancionada": "inhabilitación",
  "obra adicional": "adenda",
  "modificacion contractual": "adenda",
  "presupuesto referencial": "valor referencial",
  "monto referencial": "valor referencial",
  "consorcios": "consorcio",
  "licitacion": "licitación pública",
};
for (const [alias, target] of Object.entries(ALIASES)) {
  const def = INDEX.get(normalize(target));
  if (def) INDEX.set(normalize(alias), def);
}

export function lookupDefinition(input: string): Definition | null {
  const norm = normalize(input);
  if (!norm) return null;
  // Exact match
  const direct = INDEX.get(norm);
  if (direct) return direct;
  // Substring fallback — try each indexed key as a substring of the input
  // and the input as substring of each key. Picks the longest match.
  let best: { key: string; def: Definition; score: number } | null = null;
  for (const [key, def] of INDEX) {
    if (key.length < 4) continue; // skip too-short keys to avoid junk
    if (norm.includes(key) || key.includes(norm)) {
      const score = Math.min(key.length, norm.length);
      if (!best || score > best.score) best = { key, def, score };
    }
  }
  return best?.def ?? null;
}

export function listKnownTerms(): string[] {
  return DEFINITIONS.map((d) => d.term);
}

export function fmtDefinition(d: Definition): string {
  const parts: string[] = [`📚 *${d.term}*`, "", d.short];
  if (d.detail) parts.push("", d.detail);
  if (d.related?.length) {
    parts.push("", `_Términos relacionados: ${d.related.join(", ")}._`);
  }
  return parts.join("\n");
}
