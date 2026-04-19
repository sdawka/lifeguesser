CREATE TABLE observations (
  id               INTEGER PRIMARY KEY,   -- iNat observation id
  taxon_id         INTEGER NOT NULL,
  taxon_name       TEXT NOT NULL,
  lat              REAL NOT NULL,
  lng              REAL NOT NULL,
  photo_urls       TEXT NOT NULL,         -- JSON array of URLs
  observer_login   TEXT NOT NULL,
  license          TEXT,
  observation_url  TEXT NOT NULL,
  ancestry         TEXT NOT NULL,         -- JSON array of {rank,name}
  category_id      INTEGER NOT NULL,      -- preset root taxon id (3=Birds, 40151=Mammals, ...)
  continent        TEXT NOT NULL,         -- NA|SA|EU|AF|AS|OC
  fetched_at       INTEGER NOT NULL
);

CREATE INDEX idx_obs_category_continent ON observations(category_id, continent);
CREATE INDEX idx_obs_taxon               ON observations(taxon_id);
