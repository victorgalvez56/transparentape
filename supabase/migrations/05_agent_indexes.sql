-- Indexes optimized for the WhatsApp agent query patterns on 65k+ rows.
-- Run after 01_obras.sql.

-- Filter by district (most frequent agent query)
CREATE INDEX IF NOT EXISTS idx_obras_buyer_locality  ON obras(buyer_locality);

-- Sort by contract amount
CREATE INDEX IF NOT EXISTS idx_obras_contract_amount ON obras(contract_amount DESC NULLS LAST);

-- Trigram text search on supplier name and tender description (ILIKE queries)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_obras_supplier_name_trgm ON obras USING gin(supplier_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_obras_tender_desc_trgm  ON obras USING gin(tender_description gin_trgm_ops);
