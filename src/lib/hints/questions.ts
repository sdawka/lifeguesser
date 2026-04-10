import {
  DIET_CATEGORIES,
  HABITAT_TAGS,
  CONTINENTS,
  type TaxonEnrichment,
  type DietCategory,
  type HabitatTag,
  type Continent,
  type IucnStatus,
} from '../enrichment/types';
import type { HintCategory } from './categories';
import {
  pickDistractors,
  pickMultiValueDistractors,
  pickAdjacentIucn,
} from './distractors';

export interface HintQuestion {
  category: HintCategory;
  prompt: string;
  choices: string[];
  /** Server-side only — handler MUST strip this before sending to client. */
  correctIndex: number;
}

const IUCN_LABELS: Record<IucnStatus, string> = {
  LC: 'Least Concern',
  NT: 'Near Threatened',
  VU: 'Vulnerable',
  EN: 'Endangered',
  CR: 'Critically Endangered',
  EW: 'Extinct in the Wild',
  EX: 'Extinct',
  DD: 'Data Deficient',
};

function titleCase(s: string): string {
  return s
    .split('_')
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

function labelFor(category: HintCategory, value: string): string {
  if (category === 'conservation') {
    return IUCN_LABELS[value as IucnStatus] ?? value;
  }
  return titleCase(value);
}

function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickOne<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function assemble(
  category: HintCategory,
  prompt: string,
  correctRaw: string,
  distractorsRaw: string[],
): HintQuestion {
  const correctLabel = labelFor(category, correctRaw);
  const labels = [correctLabel, ...distractorsRaw.map((d) => labelFor(category, d))];
  const shuffled = shuffle(labels);
  const correctIndex = shuffled.indexOf(correctLabel);
  return {
    category,
    prompt,
    choices: shuffled,
    correctIndex,
  };
}

/**
 * Build a multiple-choice HintQuestion for the given category using the
 * enrichment record. Returns null when the category has no data, or when
 * the category is a taxonomy category (which requires iNat ancestry not
 * stored on the enrichment record).
 */
export function buildQuestion(
  category: HintCategory,
  enrichment: TaxonEnrichment,
): HintQuestion | null {
  switch (category) {
    case 'diet': {
      const correct = enrichment.diet?.value;
      if (!correct) return null;
      const distractors = pickDistractors<DietCategory>(
        correct,
        DIET_CATEGORIES,
        2,
      );
      return assemble(
        'diet',
        'What does this animal eat?',
        correct,
        distractors,
      );
    }

    case 'habitat': {
      const set = enrichment.habitats?.value;
      if (!set || set.length === 0) return null;
      const correct = pickOne(set);
      const distractors = pickMultiValueDistractors<HabitatTag>(
        set,
        HABITAT_TAGS,
        3,
      );
      return assemble(
        'habitat',
        'Which habitat does this species prefer?',
        correct,
        distractors,
      );
    }

    case 'continent': {
      const set = enrichment.continents?.value;
      if (!set || set.length === 0) return null;
      const correct = pickOne(set);
      const distractors = pickMultiValueDistractors<Continent>(
        set,
        CONTINENTS,
        3,
      );
      return assemble(
        'continent',
        'Where does this species live?',
        correct,
        distractors,
      );
    }

    case 'conservation': {
      const correct = enrichment.iucnStatus?.value;
      if (!correct) return null;
      const distractors = pickAdjacentIucn(correct, 2);
      return assemble(
        'conservation',
        'What is its IUCN status?',
        correct,
        distractors,
      );
    }

    case 'taxonomy-class':
    case 'taxonomy-order': {
      // TODO: wire up in a later wave when the handler has access to the
      // iNat ancestry for the taxon. Taxonomy data is not stored on the
      // enrichment record, so this builder cannot produce a question yet.
      return null;
    }
  }
}
