/**
 * Generate funny anonymous naturalist names
 */

const adjectives = [
  'Wandering', 'Curious', 'Sleepy', 'Eager', 'Mystified',
  'Bewildered', 'Tenacious', 'Hopeful', 'Caffeinated', 'Lost',
  'Ambitious', 'Pensive', 'Rogue', 'Intrepid', 'Befuddled',
  'Nocturnal', 'Migratory', 'Elusive', 'Verbose', 'Sneaky',
  'Forgetful', 'Optimistic', 'Squinting', 'Determined', 'Fuzzy',
];

const animals = [
  'Pangolin', 'Capybara', 'Axolotl', 'Quokka', 'Platypus',
  'Wombat', 'Narwhal', 'Sloth', 'Tapir', 'Okapi',
  'Lemur', 'Ocelot', 'Manatee', 'Echidna', 'Binturong',
  'Kakapo', 'Numbat', 'Dugong', 'Fossa', 'Tarsier',
  'Jerboa', 'Kinkajou', 'Blobfish', 'Shoebill', 'Dik-dik',
];

export function generateFunnyName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adj} ${animal}`;
}

export function generateFunnyNameFromId(id: string): string {
  // Deterministic name from user ID (so it's consistent)
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash = hash & hash;
  }
  const adjIndex = Math.abs(hash) % adjectives.length;
  const animalIndex = Math.abs(hash >> 8) % animals.length;
  return `${adjectives[adjIndex]} ${animals[animalIndex]}`;
}
