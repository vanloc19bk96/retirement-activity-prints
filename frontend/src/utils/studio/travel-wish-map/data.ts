/**
 * Every destination a Travel Wish Map can print, bundled.
 *
 * Geography is never written by a model: a state, country or region either
 * appears here or it does not print. The lists are fixed facts, so they ship
 * with the app — no network call, no per-page cost, the same answer for every
 * seller.
 *
 * What is deliberately left out of the country pool, so a keepsake page never
 * has to take a side or date itself: places whose statehood is disputed, and
 * countries whose names a buyer would mostly read in the news rather than a
 * travel section. Nothing here makes a claim about visas, safety, prices or
 * how to get there — a name and room to dream is all the page prints.
 */

export interface TwmGroup {
  key: string
  /** Printed heading. */
  title: string
  names: readonly string[]
  /** How many a sampled list draws from this group. Fixed lists print every name. */
  quota?: number
}

/**
 * The 50 states under the U.S. Census Bureau's four regions — the official
 * grouping, so every state has exactly one home. Alphabetical within each.
 * (The District of Columbia is not a state and is not listed.)
 */
export const US_STATE_GROUPS: readonly TwmGroup[] = [
  {
    key: 'northeast',
    title: 'The Northeast',
    names: [
      'Connecticut',
      'Maine',
      'Massachusetts',
      'New Hampshire',
      'New Jersey',
      'New York',
      'Pennsylvania',
      'Rhode Island',
      'Vermont',
    ],
  },
  {
    key: 'midwest',
    title: 'The Midwest',
    names: [
      'Illinois',
      'Indiana',
      'Iowa',
      'Kansas',
      'Michigan',
      'Minnesota',
      'Missouri',
      'Nebraska',
      'North Dakota',
      'Ohio',
      'South Dakota',
      'Wisconsin',
    ],
  },
  {
    key: 'south',
    title: 'The South',
    names: [
      'Alabama',
      'Arkansas',
      'Delaware',
      'Florida',
      'Georgia',
      'Kentucky',
      'Louisiana',
      'Maryland',
      'Mississippi',
      'North Carolina',
      'Oklahoma',
      'South Carolina',
      'Tennessee',
      'Texas',
      'Virginia',
      'West Virginia',
    ],
  },
  {
    key: 'west',
    title: 'The West',
    names: [
      'Alaska',
      'Arizona',
      'California',
      'Colorado',
      'Hawaii',
      'Idaho',
      'Montana',
      'Nevada',
      'New Mexico',
      'Oregon',
      'Utah',
      'Washington',
      'Wyoming',
    ],
  },
]

/**
 * Broad areas of the world a reader can dream about without picking a
 * country. Each area sits under one continent heading and the areas do not
 * overlap one another (so no "Mediterranean" beside "Southern Europe").
 * Printed in a west-to-east reading order, not alphabetically.
 */
export const WORLD_REGION_GROUPS: readonly TwmGroup[] = [
  {
    key: 'europe',
    title: 'Europe',
    names: [
      'The British Isles',
      'The Nordic Countries',
      'Western Europe',
      'Central Europe',
      'Southern Europe',
      'Eastern Europe',
    ],
  },
  {
    key: 'americas',
    title: 'The Americas',
    names: ['Canada', 'The United States', 'Mexico', 'Central America', 'The Caribbean', 'South America'],
  },
  {
    key: 'asia',
    title: 'Asia & the Middle East',
    names: ['The Middle East', 'Central Asia', 'South Asia', 'Southeast Asia', 'East Asia'],
  },
  {
    key: 'africa',
    title: 'Africa',
    names: ['North Africa', 'West Africa', 'East Africa', 'Southern Africa'],
  },
  {
    key: 'oceania',
    title: 'Oceania & Antarctica',
    names: ['Australia', 'New Zealand', 'The Pacific Islands', 'Antarctica'],
  },
]

/**
 * Sovereign countries, each under the continent the UN geoscheme files it in
 * (Turkey with Western Asia, Egypt with Africa). Common English short names.
 * A list draws each group's quota, so every list spans the globe.
 */
export const COUNTRY_GROUPS: readonly TwmGroup[] = [
  {
    key: 'europe',
    title: 'Europe',
    quota: 9,
    names: [
      'Albania',
      'Andorra',
      'Austria',
      'Belgium',
      'Bulgaria',
      'Croatia',
      'Czech Republic',
      'Denmark',
      'Estonia',
      'Finland',
      'France',
      'Germany',
      'Greece',
      'Hungary',
      'Iceland',
      'Ireland',
      'Italy',
      'Latvia',
      'Liechtenstein',
      'Lithuania',
      'Luxembourg',
      'Malta',
      'Monaco',
      'Montenegro',
      'Netherlands',
      'Norway',
      'Poland',
      'Portugal',
      'Romania',
      'San Marino',
      'Slovakia',
      'Slovenia',
      'Spain',
      'Sweden',
      'Switzerland',
      'United Kingdom',
    ],
  },
  {
    key: 'americas',
    title: 'The Americas',
    quota: 7,
    names: [
      'Antigua and Barbuda',
      'Argentina',
      'Barbados',
      'Belize',
      'Bolivia',
      'Brazil',
      'Canada',
      'Chile',
      'Colombia',
      'Costa Rica',
      'Dominican Republic',
      'Ecuador',
      'Grenada',
      'Guatemala',
      'Jamaica',
      'Mexico',
      'Panama',
      'Peru',
      'Saint Lucia',
      'The Bahamas',
      'Trinidad and Tobago',
      'United States',
      'Uruguay',
    ],
  },
  {
    key: 'asia',
    title: 'Asia & the Middle East',
    quota: 7,
    names: [
      'Bhutan',
      'Cambodia',
      'China',
      'India',
      'Indonesia',
      'Japan',
      'Jordan',
      'Laos',
      'Malaysia',
      'Maldives',
      'Mongolia',
      'Nepal',
      'Oman',
      'Philippines',
      'Qatar',
      'Singapore',
      'South Korea',
      'Sri Lanka',
      'Thailand',
      'Turkey',
      'United Arab Emirates',
      'Uzbekistan',
      'Vietnam',
    ],
  },
  {
    key: 'africa',
    title: 'Africa',
    quota: 4,
    names: [
      'Botswana',
      'Egypt',
      'Ghana',
      'Kenya',
      'Madagascar',
      'Mauritius',
      'Morocco',
      'Namibia',
      'Rwanda',
      'Senegal',
      'Seychelles',
      'South Africa',
      'Tanzania',
      'Tunisia',
      'Uganda',
      'Zambia',
      'Zimbabwe',
    ],
  },
  {
    key: 'oceania',
    title: 'Oceania',
    quota: 3,
    names: ['Australia', 'Fiji', 'New Zealand', 'Palau', 'Papua New Guinea', 'Samoa', 'Tonga', 'Vanuatu'],
  },
]

/**
 * Kinds of places anyone can wish for, wherever they live and however they
 * travel: a national park, a harbor town, where an old friend lives, a café
 * with a view across town. No country, budget, car, flight, partner or
 * family is assumed — "where a relative lives" sits beside "a place I lived
 * years ago", and "close to home" is a whole heading of its own. No two
 * entries describe the same outing. Printed in this order within a heading.
 */
export const PLACE_GROUPS: readonly TwmGroup[] = [
  {
    key: 'nature',
    title: 'Nature & the Outdoors',
    quota: 4,
    names: [
      'A national park',
      'A waterfall',
      'A mountain view',
      'An old forest',
      'A desert landscape',
      'A canyon',
      'A botanical garden',
      'A wildlife reserve',
      'A dark sky for stargazing',
      'A valley in autumn colors',
      'A hot spring',
    ],
  },
  {
    key: 'water',
    title: 'By the Water',
    quota: 4,
    names: [
      'A quiet beach',
      'A lighthouse',
      'A harbor town',
      'An island',
      'A lakeside town',
      'A rocky coastline',
      'A river boat ride',
      'A fishing village',
      'A lake I’ve never seen',
      'A seaside promenade',
    ],
  },
  {
    key: 'towns',
    title: 'Towns & Cities',
    quota: 4,
    names: [
      'A big city I’ve never explored',
      'A capital city',
      'A historic old town',
      'A mountain village',
      'A town famous for its food',
      'A city skyline at night',
      'A neighborhood I’ve never walked',
      'A lively city market',
      'A town known for its crafts',
      'A college town',
    ],
  },
  {
    key: 'culture',
    title: 'History & Culture',
    quota: 4,
    names: [
      'A famous museum',
      'A castle',
      'An ancient ruin',
      'A historic house museum',
      'A grand old library',
      'A place from a favorite book',
      'A great art gallery',
      'A place known for its music',
      'A historic bridge',
      'A famous monument',
    ],
  },
  {
    key: 'people',
    title: 'People & Memories',
    quota: 4,
    names: [
      'My hometown',
      'A place I lived years ago',
      'Where an old friend lives',
      'Where a relative lives',
      'Where my family’s roots are',
      'A childhood vacation spot',
      'A place from an old photo',
      'Where I went to school',
      'A place a friend loves',
    ],
  },
  {
    key: 'near',
    title: 'Close to Home',
    quota: 4,
    names: [
      'A scenic train ride',
      'A day trip by train or bus',
      'A cozy country inn',
      'A weekend in a nearby town',
      'A landmark close to home',
      'A country farmers’ market',
      'A country fair',
      'A café with a view',
      'A park across town',
      'A local festival',
    ],
  },
]
