CREATE TABLE taxon_enrichment (
  taxon_id          INTEGER PRIMARY KEY,
  taxon_name        TEXT NOT NULL,
  common_name       TEXT,

  -- Indexable structured traits (denormalized for cheap per-round reads
  -- and future queries like "random carnivore in Africa")
  diet              TEXT,        -- DietCategory
  diet_source       TEXT,
  habitats          TEXT,        -- JSON array of HabitatTag
  habitats_source   TEXT,
  continents        TEXT,        -- JSON array of Continent
  continents_source TEXT,
  iucn_status       TEXT,
  iucn_source       TEXT,
  body_mass_g       REAL,
  lifespan_years    REAL,
  locomotion        TEXT,
  locomotion_source TEXT,

  wikipedia_summary TEXT,

  enriched_at       INTEGER NOT NULL,
  sources_attempted TEXT NOT NULL,   -- JSON array
  retry_after       INTEGER,
  schema_version    INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_taxon_diet       ON taxon_enrichment(diet);
CREATE INDEX idx_taxon_iucn       ON taxon_enrichment(iucn_status);
CREATE INDEX idx_taxon_enriched_at ON taxon_enrichment(enriched_at);
