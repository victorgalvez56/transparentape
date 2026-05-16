export interface Obra {
  id: number;
  ocid: string;
  source_year: number | null;
  country: string;
  city: string;

  buyer_id: string | null;
  buyer_name: string | null;
  buyer_region: string | null;
  buyer_locality: string | null;
  buyer_street: string | null;

  tender_id: string | null;
  tender_title: string | null;
  tender_description: string | null;
  item_classification: string | null;
  procurement_method: string | null;
  tender_amount: number | null;
  date_published: string | null;

  award_date: string | null;
  award_amount: number | null;

  supplier_id: string | null;
  supplier_name: string | null;
  supplier_ruc: string | null;

  contract_id: string | null;
  contract_start: string | null;
  contract_end: string | null;
  contract_amount: number | null;
  contract_status: string | null;
  n_amendments: number | null;

  is_lima: boolean | null;
  lat: number | null;
  lng: number | null;
  infobras_code: string | null;
  streetview_before: string | null;
  streetview_after: string | null;
  ai_score: number | null;
  ai_description: string | null;
  is_red_flag: boolean | null;
  red_flag_types: string[] | null;
}

export interface RedFlag {
  id: number;
  country: string;
  ruc: string;
  nombre: string | null;
  tipo: string;
  descripcion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  vigente: boolean | null;
  fuente: string | null;
}

export type RiesgoNivel = "alto" | "medio" | "bajo";

export function riesgoDeObra(o: Obra): RiesgoNivel {
  if (o.is_red_flag) return "alto";
  if ((o.ai_score ?? 0) >= 70) return "alto";
  if ((o.ai_score ?? 0) >= 40 || (o.n_amendments ?? 0) >= 2) return "medio";
  return "bajo";
}
