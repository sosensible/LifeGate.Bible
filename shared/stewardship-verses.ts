// Scripture shown in the Stewardship header, rotating. KJV (public domain), to
// match the site's other Scripture callouts. Add verses to the end of the list.
export interface Verse {
  text: string
  ref: string
}

export const STEWARDSHIP_VERSES: Verse[] = [
  {
    text: 'Take therefore no thought for the morrow: for the morrow shall take thought for the things of itself. Sufficient unto the day is the evil thereof.',
    ref: 'Matthew 6:34',
  },
  {
    text: 'Go to the ant, thou sluggard; consider her ways, and be wise: which having no guide, overseer, or ruler, provideth her meat in the summer, and gathereth her food in the harvest.',
    ref: 'Proverbs 6:6–8',
  },
]
