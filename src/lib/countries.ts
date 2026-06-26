// Master country list. `slug` is the URL-safe name used in corridor paths.
// Add more over time — the app only needs a country here to make its corridors work.

export interface Country {
  iso: string; // ISO 3166-1 alpha-2
  name: string;
  slug: string;
  flag: string; // emoji
}

export const COUNTRIES: Country[] = [
  { iso: 'IN', name: 'India', slug: 'india', flag: '🇮🇳' },
  { iso: 'JP', name: 'Japan', slug: 'japan', flag: '🇯🇵' },
  { iso: 'US', name: 'United States', slug: 'united-states', flag: '🇺🇸' },
  { iso: 'GB', name: 'United Kingdom', slug: 'united-kingdom', flag: '🇬🇧' },
  { iso: 'AE', name: 'United Arab Emirates', slug: 'united-arab-emirates', flag: '🇦🇪' },
  { iso: 'TH', name: 'Thailand', slug: 'thailand', flag: '🇹🇭' },
  { iso: 'SG', name: 'Singapore', slug: 'singapore', flag: '🇸🇬' },
  { iso: 'MY', name: 'Malaysia', slug: 'malaysia', flag: '🇲🇾' },
  { iso: 'ID', name: 'Indonesia', slug: 'indonesia', flag: '🇮🇩' },
  { iso: 'VN', name: 'Vietnam', slug: 'vietnam', flag: '🇻🇳' },
  { iso: 'LK', name: 'Sri Lanka', slug: 'sri-lanka', flag: '🇱🇰' },
  { iso: 'NP', name: 'Nepal', slug: 'nepal', flag: '🇳🇵' },
  { iso: 'MV', name: 'Maldives', slug: 'maldives', flag: '🇲🇻' },
  { iso: 'TR', name: 'Turkey', slug: 'turkey', flag: '🇹🇷' },
  { iso: 'SA', name: 'Saudi Arabia', slug: 'saudi-arabia', flag: '🇸🇦' },
  { iso: 'QA', name: 'Qatar', slug: 'qatar', flag: '🇶🇦' },
  { iso: 'FR', name: 'France', slug: 'france', flag: '🇫🇷' },
  { iso: 'DE', name: 'Germany', slug: 'germany', flag: '🇩🇪' },
  { iso: 'IT', name: 'Italy', slug: 'italy', flag: '🇮🇹' },
  { iso: 'ES', name: 'Spain', slug: 'spain', flag: '🇪🇸' },
  { iso: 'CH', name: 'Switzerland', slug: 'switzerland', flag: '🇨🇭' },
  { iso: 'NL', name: 'Netherlands', slug: 'netherlands', flag: '🇳🇱' },
  { iso: 'CA', name: 'Canada', slug: 'canada', flag: '🇨🇦' },
  { iso: 'AU', name: 'Australia', slug: 'australia', flag: '🇦🇺' },
  { iso: 'NZ', name: 'New Zealand', slug: 'new-zealand', flag: '🇳🇿' },
  { iso: 'CN', name: 'China', slug: 'china', flag: '🇨🇳' },
  { iso: 'HK', name: 'Hong Kong', slug: 'hong-kong', flag: '🇭🇰' },
  { iso: 'KR', name: 'South Korea', slug: 'south-korea', flag: '🇰🇷' },
  { iso: 'PH', name: 'Philippines', slug: 'philippines', flag: '🇵🇭' },
  { iso: 'EG', name: 'Egypt', slug: 'egypt', flag: '🇪🇬' },
  { iso: 'ZA', name: 'South Africa', slug: 'south-africa', flag: '🇿🇦' },
  { iso: 'BR', name: 'Brazil', slug: 'brazil', flag: '🇧🇷' },
  { iso: 'MX', name: 'Mexico', slug: 'mexico', flag: '🇲🇽' },
  { iso: 'RU', name: 'Russia', slug: 'russia', flag: '🇷🇺' },
  { iso: 'BD', name: 'Bangladesh', slug: 'bangladesh', flag: '🇧🇩' },
  { iso: 'PK', name: 'Pakistan', slug: 'pakistan', flag: '🇵🇰' },
];

const BY_SLUG = new Map(COUNTRIES.map((c) => [c.slug, c]));
const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]));

export const countryBySlug = (slug: string) => BY_SLUG.get(slug);
export const countryByIso = (iso: string) => BY_ISO.get(iso);
