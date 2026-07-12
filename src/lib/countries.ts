// Master country list. `slug` is the URL-safe name used in corridor paths.
// `demonym` is the adjective for its people ("Indian citizens") — used in
// headings/titles because that's how people actually search.
// Add more over time — the app only needs a country here to make its corridors work.

export interface Country {
  iso: string; // ISO 3166-1 alpha-2
  name: string;
  slug: string;
  flag: string; // emoji
  demonym: string; // "Indian", "American", "British"…
}

export const COUNTRIES: Country[] = [
  { iso: 'IN', name: 'India', slug: 'india', flag: '🇮🇳', demonym: 'Indian' },
  { iso: 'JP', name: 'Japan', slug: 'japan', flag: '🇯🇵', demonym: 'Japanese' },
  { iso: 'US', name: 'United States', slug: 'united-states', flag: '🇺🇸', demonym: 'American' },
  { iso: 'GB', name: 'United Kingdom', slug: 'united-kingdom', flag: '🇬🇧', demonym: 'British' },
  { iso: 'AE', name: 'United Arab Emirates', slug: 'united-arab-emirates', flag: '🇦🇪', demonym: 'Emirati' },
  { iso: 'TH', name: 'Thailand', slug: 'thailand', flag: '🇹🇭', demonym: 'Thai' },
  { iso: 'SG', name: 'Singapore', slug: 'singapore', flag: '🇸🇬', demonym: 'Singaporean' },
  { iso: 'MY', name: 'Malaysia', slug: 'malaysia', flag: '🇲🇾', demonym: 'Malaysian' },
  { iso: 'ID', name: 'Indonesia', slug: 'indonesia', flag: '🇮🇩', demonym: 'Indonesian' },
  { iso: 'VN', name: 'Vietnam', slug: 'vietnam', flag: '🇻🇳', demonym: 'Vietnamese' },
  { iso: 'LK', name: 'Sri Lanka', slug: 'sri-lanka', flag: '🇱🇰', demonym: 'Sri Lankan' },
  { iso: 'NP', name: 'Nepal', slug: 'nepal', flag: '🇳🇵', demonym: 'Nepali' },
  { iso: 'MV', name: 'Maldives', slug: 'maldives', flag: '🇲🇻', demonym: 'Maldivian' },
  { iso: 'TR', name: 'Turkey', slug: 'turkey', flag: '🇹🇷', demonym: 'Turkish' },
  { iso: 'SA', name: 'Saudi Arabia', slug: 'saudi-arabia', flag: '🇸🇦', demonym: 'Saudi' },
  { iso: 'QA', name: 'Qatar', slug: 'qatar', flag: '🇶🇦', demonym: 'Qatari' },
  { iso: 'FR', name: 'France', slug: 'france', flag: '🇫🇷', demonym: 'French' },
  { iso: 'DE', name: 'Germany', slug: 'germany', flag: '🇩🇪', demonym: 'German' },
  { iso: 'IT', name: 'Italy', slug: 'italy', flag: '🇮🇹', demonym: 'Italian' },
  { iso: 'ES', name: 'Spain', slug: 'spain', flag: '🇪🇸', demonym: 'Spanish' },
  { iso: 'CH', name: 'Switzerland', slug: 'switzerland', flag: '🇨🇭', demonym: 'Swiss' },
  { iso: 'NL', name: 'Netherlands', slug: 'netherlands', flag: '🇳🇱', demonym: 'Dutch' },
  { iso: 'CA', name: 'Canada', slug: 'canada', flag: '🇨🇦', demonym: 'Canadian' },
  { iso: 'AU', name: 'Australia', slug: 'australia', flag: '🇦🇺', demonym: 'Australian' },
  { iso: 'NZ', name: 'New Zealand', slug: 'new-zealand', flag: '🇳🇿', demonym: 'New Zealand' },
  { iso: 'CN', name: 'China', slug: 'china', flag: '🇨🇳', demonym: 'Chinese' },
  { iso: 'HK', name: 'Hong Kong', slug: 'hong-kong', flag: '🇭🇰', demonym: 'Hong Kong' },
  { iso: 'KR', name: 'South Korea', slug: 'south-korea', flag: '🇰🇷', demonym: 'South Korean' },
  { iso: 'PH', name: 'Philippines', slug: 'philippines', flag: '🇵🇭', demonym: 'Filipino' },
  { iso: 'EG', name: 'Egypt', slug: 'egypt', flag: '🇪🇬', demonym: 'Egyptian' },
  { iso: 'ZA', name: 'South Africa', slug: 'south-africa', flag: '🇿🇦', demonym: 'South African' },
  { iso: 'BR', name: 'Brazil', slug: 'brazil', flag: '🇧🇷', demonym: 'Brazilian' },
  { iso: 'MX', name: 'Mexico', slug: 'mexico', flag: '🇲🇽', demonym: 'Mexican' },
  { iso: 'RU', name: 'Russia', slug: 'russia', flag: '🇷🇺', demonym: 'Russian' },
  { iso: 'BD', name: 'Bangladesh', slug: 'bangladesh', flag: '🇧🇩', demonym: 'Bangladeshi' },
  { iso: 'PK', name: 'Pakistan', slug: 'pakistan', flag: '🇵🇰', demonym: 'Pakistani' },
];

const BY_SLUG = new Map(COUNTRIES.map((c) => [c.slug, c]));
const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]));

export const countryBySlug = (slug: string) => BY_SLUG.get(slug);
export const countryByIso = (iso: string) => BY_ISO.get(iso);
