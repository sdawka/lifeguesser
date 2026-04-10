import { iNatSource } from './inat';
import { eolSource } from './eol';
import { wikidataSource } from './wikidata';
import { wikipediaSource } from './wikipedia';
import type { EnrichmentSource } from '../types';

export const ALL_SOURCES: EnrichmentSource[] = [
  iNatSource,
  eolSource,
  wikidataSource,
  wikipediaSource,
];
