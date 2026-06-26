import type { CorridorData } from './corridor';

// Local demo data so the corridor page renders without Supabase/Gemini configured.
// Used ONLY as a fallback when no database is set up (see getCorridor).
// This is sample content for preview — not authoritative.
export const SEED: Record<string, CorridorData> = {
  'india-to-japan': {
    verdict: 'evisa',
    verdictHeadline: 'Indian citizens need an e-Visa before travelling to Japan.',
    summary:
      'Indian passport holders must obtain a visa in advance. The single-entry tourist e-Visa typically allows a stay of up to 90 days.',
    maxStayDays: 90,
    processingTime: '5–7 working days',
    officialSource: { label: 'mofa.go.jp', url: 'https://www.mofa.go.jp/j_info/visit/visa/index.html' },
    visaOptions: [
      {
        type: 'Tourist e-Visa (single entry)',
        validity: '90 days from issue',
        maxStay: '90 days',
        entries: 'Single',
        eligibility: 'Short tourism or visiting friends & relatives',
      },
      {
        type: 'Tourist visa (multiple entry)',
        validity: 'Up to 5 years',
        maxStay: '30 or 90 days per visit',
        entries: 'Multiple',
        eligibility: 'Frequent travellers with prior travel history',
      },
      {
        type: 'Transit visa',
        validity: 'Single use',
        maxStay: 'Up to 15 days',
        entries: 'Single',
        eligibility: 'Passing through Japan to a third country',
      },
      {
        type: 'Business / commercial visa',
        validity: 'Single or multiple',
        maxStay: '90 days',
        entries: 'Single / Multiple',
        eligibility: 'Meetings, conferences or commercial activities',
      },
      {
        type: 'Visiting relatives / acquaintances visa',
        validity: 'Single',
        maxStay: '90 days',
        entries: 'Single',
        eligibility: 'Staying with family or friends resident in Japan',
      },
    ],
    documents: [
      { label: 'Passport valid 6+ months beyond travel', note: 'At least 2 blank pages' },
      { label: 'Recent passport photo', note: 'White background, 45×45 mm' },
      { label: 'Confirmed return or onward flight ticket' },
      { label: 'Proof of accommodation', note: 'Hotel booking or invitation letter' },
      { label: 'Bank statement (last 3 months)', note: 'Proof of sufficient funds' },
    ],
    applySteps: [
      { text: 'Create an account on the official Japan e-Visa portal.', link: { label: 'evisa.mofa.go.jp', url: 'https://www.evisa.mofa.go.jp/' } },
      { text: 'Complete the application and upload your documents.' },
      { text: 'Pay the visa fee online (see the official portal for current fees).' },
      { text: 'Receive your e-Visa by email — print or save it for immigration.' },
    ],
    tips: [
      'Carry your passport at all times — it is required by law in Japan.',
      'Cash is widely preferred; many places do not accept cards.',
      'An IC card (Suica/Pasmo) makes city transport effortless.',
    ],
    bestTimeToVisit: 'Mar–May (cherry blossom) and Oct–Nov (autumn)',
    topPlaces: ['Tokyo', 'Kyoto', 'Osaka', 'Mt. Fuji'],
    faq: [
      { q: 'Can I extend my tourist e-Visa in Japan?', a: 'Tourist stays generally cannot be extended beyond the granted period. You would need to exit and re-apply.' },
      { q: 'Is a transit visa needed for a layover?', a: 'For short airside transits without leaving the airport, a visa is usually not required.' },
      { q: 'Can I work on a tourist e-Visa?', a: 'No. The tourist e-Visa does not permit any paid employment.' },
    ],
    sources: [
      { label: 'Ministry of Foreign Affairs of Japan', url: 'https://www.mofa.go.jp/j_info/visit/visa/index.html' },
      { label: 'Japan e-Visa portal', url: 'https://www.evisa.mofa.go.jp/' },
    ],
  },
};
