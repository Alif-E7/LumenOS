/**
 * Country label locations and visual centroids for 3D globe rendering.
 * Contains 197 sovereign entities (193 UN member states + observers + recognized territories).
 *
 * Importance tiers:
 *   1 = Major global powers / largest economies / top populations (visible at furthest zoom)
 *   2 = Medium nations / regional powers (visible at medium zoom)
 *   3 = Smaller nations, island nations, microstates (visible at closer zoom)
 */

export interface CountryLabel {
  name: string;
  lat: number;
  lon: number;
  importance: 1 | 2 | 3;
}

export const COUNTRY_LABELS: readonly CountryLabel[] = [
  // ==========================================
  // NORTH AMERICA
  // ==========================================
  { name: 'United States', lat: 37.0902, lon: -95.7129, importance: 1 },
  { name: 'Canada', lat: 56.1304, lon: -106.3468, importance: 1 },
  { name: 'Mexico', lat: 23.6345, lon: -102.5528, importance: 1 },

  // ==========================================
  // CENTRAL AMERICA & CARIBBEAN
  // ==========================================
  { name: 'Guatemala', lat: 15.7835, lon: -90.2308, importance: 2 },
  { name: 'Belize', lat: 17.1899, lon: -88.4976, importance: 3 },
  { name: 'El Salvador', lat: 13.7942, lon: -88.8965, importance: 3 },
  { name: 'Honduras', lat: 15.2000, lon: -86.2419, importance: 3 },
  { name: 'Nicaragua', lat: 12.8654, lon: -85.2072, importance: 3 },
  { name: 'Costa Rica', lat: 9.7489, lon: -83.7534, importance: 2 },
  { name: 'Panama', lat: 8.5380, lon: -80.7821, importance: 2 },
  { name: 'Cuba', lat: 21.5218, lon: -77.7812, importance: 2 },
  { name: 'Jamaica', lat: 18.1096, lon: -77.2975, importance: 3 },
  { name: 'Haiti', lat: 18.9712, lon: -72.2852, importance: 3 },
  { name: 'Dominican Republic', lat: 18.7357, lon: -70.1627, importance: 2 },
  { name: 'Bahamas', lat: 25.0343, lon: -77.3963, importance: 3 },
  { name: 'Trinidad and Tobago', lat: 10.6918, lon: -61.2225, importance: 3 },
  { name: 'Barbados', lat: 13.1939, lon: -59.5432, importance: 3 },
  { name: 'Saint Lucia', lat: 13.9094, lon: -60.9789, importance: 3 },
  { name: 'Saint Vincent and the Grenadines', lat: 12.9843, lon: -61.2872, importance: 3 },
  { name: 'Grenada', lat: 12.1165, lon: -61.6790, importance: 3 },
  { name: 'Antigua and Barbuda', lat: 17.0608, lon: -61.7964, importance: 3 },
  { name: 'Dominica', lat: 15.4150, lon: -61.3710, importance: 3 },
  { name: 'Saint Kitts and Nevis', lat: 17.3578, lon: -62.7830, importance: 3 },

  // ==========================================
  // SOUTH AMERICA
  // ==========================================
  { name: 'Brazil', lat: -14.2350, lon: -51.9253, importance: 1 },
  { name: 'Argentina', lat: -38.4161, lon: -63.6167, importance: 1 },
  { name: 'Colombia', lat: 4.5709, lon: -74.2973, importance: 2 },
  { name: 'Chile', lat: -35.6751, lon: -71.5430, importance: 2 },
  { name: 'Peru', lat: -9.1900, lon: -75.0152, importance: 2 },
  { name: 'Venezuela', lat: 6.4238, lon: -66.5897, importance: 2 },
  { name: 'Ecuador', lat: -1.8312, lon: -78.1834, importance: 2 },
  { name: 'Bolivia', lat: -16.2902, lon: -63.5887, importance: 2 },
  { name: 'Paraguay', lat: -23.4425, lon: -58.4438, importance: 3 },
  { name: 'Uruguay', lat: -32.5228, lon: -55.7658, importance: 2 },
  { name: 'Guyana', lat: 4.8604, lon: -58.9302, importance: 3 },
  { name: 'Suriname', lat: 3.9193, lon: -56.0278, importance: 3 },

  // ==========================================
  // EUROPE
  // ==========================================
  { name: 'United Kingdom', lat: 55.3781, lon: -3.4360, importance: 1 },
  { name: 'Germany', lat: 51.1657, lon: 10.4515, importance: 1 },
  { name: 'France', lat: 46.2276, lon: 2.2137, importance: 1 },
  { name: 'Italy', lat: 41.8719, lon: 12.5674, importance: 1 },
  { name: 'Spain', lat: 40.4637, lon: -3.7492, importance: 1 },
  { name: 'Russia', lat: 61.5240, lon: 105.3188, importance: 1 },
  { name: 'Ukraine', lat: 48.3794, lon: 31.1656, importance: 2 },
  { name: 'Poland', lat: 51.9194, lon: 19.1451, importance: 2 },
  { name: 'Netherlands', lat: 52.1326, lon: 5.2913, importance: 2 },
  { name: 'Belgium', lat: 50.5039, lon: 4.4699, importance: 2 },
  { name: 'Sweden', lat: 60.1282, lon: 18.6435, importance: 2 },
  { name: 'Norway', lat: 60.4720, lon: 8.4689, importance: 2 },
  { name: 'Switzerland', lat: 46.8182, lon: 8.2275, importance: 2 },
  { name: 'Austria', lat: 47.5162, lon: 14.5501, importance: 2 },
  { name: 'Portugal', lat: 39.3999, lon: -8.2245, importance: 2 },
  { name: 'Greece', lat: 39.0742, lon: 21.8243, importance: 2 },
  { name: 'Czech Republic', lat: 49.8175, lon: 15.4730, importance: 2 },
  { name: 'Romania', lat: 45.9432, lon: 24.9668, importance: 2 },
  { name: 'Hungary', lat: 47.1625, lon: 19.5033, importance: 2 },
  { name: 'Denmark', lat: 56.2639, lon: 9.5018, importance: 2 },
  { name: 'Finland', lat: 61.9241, lon: 25.7482, importance: 2 },
  { name: 'Ireland', lat: 53.4129, lon: -8.2439, importance: 2 },
  { name: 'Slovakia', lat: 48.6690, lon: 19.6990, importance: 3 },
  { name: 'Bulgaria', lat: 42.7339, lon: 25.4858, importance: 3 },
  { name: 'Croatia', lat: 45.1000, lon: 15.2000, importance: 3 },
  { name: 'Serbia', lat: 44.0165, lon: 21.0059, importance: 3 },
  { name: 'Bosnia and Herzegovina', lat: 43.9159, lon: 17.6791, importance: 3 },
  { name: 'Lithuania', lat: 55.1694, lon: 23.8813, importance: 3 },
  { name: 'Slovenia', lat: 46.1512, lon: 14.9955, importance: 3 },
  { name: 'Latvia', lat: 56.8796, lon: 24.6032, importance: 3 },
  { name: 'Estonia', lat: 58.5953, lon: 25.0136, importance: 3 },
  { name: 'Belarus', lat: 53.7098, lon: 27.9534, importance: 2 },
  { name: 'Moldova', lat: 47.4116, lon: 28.3699, importance: 3 },
  { name: 'Albania', lat: 41.1533, lon: 20.1683, importance: 3 },
  { name: 'North Macedonia', lat: 41.6086, lon: 21.7453, importance: 3 },
  { name: 'Montenegro', lat: 42.7087, lon: 19.3744, importance: 3 },
  { name: 'Luxembourg', lat: 49.8153, lon: 6.1296, importance: 3 },
  { name: 'Iceland', lat: 64.9631, lon: -19.0208, importance: 3 },
  { name: 'Malta', lat: 35.9375, lon: 14.3754, importance: 3 },
  { name: 'Cyprus', lat: 35.1264, lon: 33.4299, importance: 3 },
  { name: 'Andorra', lat: 42.5063, lon: 1.5218, importance: 3 },
  { name: 'Monaco', lat: 43.7384, lon: 7.4246, importance: 3 },
  { name: 'Liechtenstein', lat: 47.1660, lon: 9.5554, importance: 3 },
  { name: 'San Marino', lat: 43.9424, lon: 12.4578, importance: 3 },
  { name: 'Vatican City', lat: 41.9029, lon: 12.4534, importance: 3 },
  { name: 'Kosovo', lat: 42.6026, lon: 20.9030, importance: 3 },

  // ==========================================
  // MIDDLE EAST
  // ==========================================
  { name: 'Saudi Arabia', lat: 23.8859, lon: 45.0792, importance: 1 },
  { name: 'Turkey', lat: 38.9637, lon: 35.2433, importance: 1 },
  { name: 'Iran', lat: 32.4279, lon: 53.6880, importance: 2 },
  { name: 'Israel', lat: 31.0461, lon: 34.8516, importance: 2 },
  { name: 'United Arab Emirates', lat: 23.4241, lon: 53.8478, importance: 2 },
  { name: 'Iraq', lat: 33.2232, lon: 43.6793, importance: 2 },
  { name: 'Qatar', lat: 25.3548, lon: 51.1839, importance: 2 },
  { name: 'Kuwait', lat: 29.3117, lon: 47.4818, importance: 2 },
  { name: 'Oman', lat: 21.4735, lon: 55.9754, importance: 3 },
  { name: 'Jordan', lat: 30.5852, lon: 36.2384, importance: 3 },
  { name: 'Lebanon', lat: 33.8547, lon: 35.8623, importance: 3 },
  { name: 'Syria', lat: 34.8021, lon: 38.9968, importance: 3 },
  { name: 'Yemen', lat: 15.5527, lon: 48.5164, importance: 3 },
  { name: 'Bahrain', lat: 26.0667, lon: 50.5577, importance: 3 },
  { name: 'Palestine', lat: 31.9522, lon: 35.2332, importance: 3 },

  // ==========================================
  // ASIA
  // ==========================================
  { name: 'China', lat: 35.8617, lon: 104.1954, importance: 1 },
  { name: 'India', lat: 20.5937, lon: 78.9629, importance: 1 },
  { name: 'Japan', lat: 36.2048, lon: 138.2529, importance: 1 },
  { name: 'South Korea', lat: 35.9078, lon: 127.7669, importance: 1 },
  { name: 'Indonesia', lat: -0.7893, lon: 113.9213, importance: 1 },
  { name: 'Pakistan', lat: 30.3753, lon: 69.3451, importance: 1 },
  { name: 'Vietnam', lat: 14.0583, lon: 108.2772, importance: 2 },
  { name: 'Thailand', lat: 15.8700, lon: 100.9925, importance: 2 },
  { name: 'Philippines', lat: 12.8797, lon: 121.7740, importance: 2 },
  { name: 'Malaysia', lat: 4.2105, lon: 101.9758, importance: 2 },
  { name: 'Singapore', lat: 1.3521, lon: 103.8198, importance: 2 },
  { name: 'Bangladesh', lat: 23.6850, lon: 90.3563, importance: 2 },
  { name: 'Taiwan', lat: 23.6978, lon: 120.9605, importance: 2 },
  { name: 'Kazakhstan', lat: 48.0196, lon: 66.9237, importance: 2 },
  { name: 'Uzbekistan', lat: 41.3775, lon: 64.5853, importance: 3 },
  { name: 'North Korea', lat: 40.3399, lon: 127.5101, importance: 2 },
  { name: 'Myanmar', lat: 21.9162, lon: 95.9560, importance: 3 },
  { name: 'Sri Lanka', lat: 7.8731, lon: 80.7718, importance: 3 },
  { name: 'Nepal', lat: 28.3949, lon: 84.1240, importance: 3 },
  { name: 'Afghanistan', lat: 33.9391, lon: 67.7100, importance: 3 },
  { name: 'Cambodia', lat: 12.5657, lon: 104.9910, importance: 3 },
  { name: 'Laos', lat: 19.8563, lon: 102.4955, importance: 3 },
  { name: 'Mongolia', lat: 46.8625, lon: 103.8467, importance: 3 },
  { name: 'Azerbaijan', lat: 40.1431, lon: 47.5769, importance: 3 },
  { name: 'Georgia', lat: 42.3154, lon: 43.3569, importance: 3 },
  { name: 'Armenia', lat: 40.0691, lon: 45.0382, importance: 3 },
  { name: 'Turkmenistan', lat: 38.9697, lon: 59.5563, importance: 3 },
  { name: 'Kyrgyzstan', lat: 41.2044, lon: 74.7661, importance: 3 },
  { name: 'Tajikistan', lat: 38.8610, lon: 71.2761, importance: 3 },
  { name: 'Brunei', lat: 4.5353, lon: 114.7277, importance: 3 },
  { name: 'Bhutan', lat: 27.5142, lon: 90.4336, importance: 3 },
  { name: 'Maldives', lat: 3.2028, lon: 73.2207, importance: 3 },
  { name: 'Timor-Leste', lat: -8.8742, lon: 125.7275, importance: 3 },

  // ==========================================
  // AFRICA
  // ==========================================
  { name: 'Egypt', lat: 26.8206, lon: 30.8025, importance: 1 },
  { name: 'Nigeria', lat: 9.0820, lon: 8.6753, importance: 1 },
  { name: 'South Africa', lat: -30.5595, lon: 22.9375, importance: 1 },
  { name: 'Algeria', lat: 28.0339, lon: 1.6596, importance: 2 },
  { name: 'Morocco', lat: 31.7917, lon: -7.0926, importance: 2 },
  { name: 'Ethiopia', lat: 9.1450, lon: 40.4897, importance: 2 },
  { name: 'Kenya', lat: -0.0236, lon: 37.9062, importance: 2 },
  { name: 'Ghana', lat: 7.9465, lon: -1.0232, importance: 2 },
  { name: 'Tanzania', lat: -6.3690, lon: 34.8888, importance: 2 },
  { name: 'Angola', lat: -11.2027, lon: 17.8739, importance: 2 },
  { name: 'Democratic Republic of the Congo', lat: -4.0383, lon: 21.7587, importance: 2 },
  { name: 'Sudan', lat: 12.8628, lon: 30.2176, importance: 3 },
  { name: 'Tunisia', lat: 33.8869, lon: 9.5375, importance: 3 },
  { name: 'Libya', lat: 26.3351, lon: 17.2283, importance: 3 },
  { name: 'Uganda', lat: 1.3733, lon: 32.2903, importance: 3 },
  { name: 'Mozambique', lat: -18.6657, lon: 35.5296, importance: 3 },
  { name: 'Ivory Coast', lat: 7.5400, lon: -5.5471, importance: 3 },
  { name: 'Madagascar', lat: -18.7669, lon: 46.8691, importance: 3 },
  { name: 'Cameroon', lat: 7.3697, lon: 12.3547, importance: 3 },
  { name: 'Zambia', lat: -13.1339, lon: 27.8493, importance: 3 },
  { name: 'Senegal', lat: 14.4974, lon: -14.4524, importance: 3 },
  { name: 'Zimbabwe', lat: -19.0154, lon: 29.1549, importance: 3 },
  { name: 'Guinea', lat: 9.9456, lon: -9.6966, importance: 3 },
  { name: 'Rwanda', lat: -1.9403, lon: 29.8739, importance: 3 },
  { name: 'Benin', lat: 9.3077, lon: 2.3158, importance: 3 },
  { name: 'Burundi', lat: -3.3731, lon: 29.9189, importance: 3 },
  { name: 'South Sudan', lat: 6.8770, lon: 31.3070, importance: 3 },
  { name: 'Togo', lat: 8.6195, lon: 0.8248, importance: 3 },
  { name: 'Sierra Leone', lat: 8.4606, lon: -11.7799, importance: 3 },
  { name: 'Republic of the Congo', lat: -0.2280, lon: 15.8277, importance: 3 },
  { name: 'Liberia', lat: 6.4281, lon: -9.4295, importance: 3 },
  { name: 'Central African Republic', lat: 6.6111, lon: 20.9394, importance: 3 },
  { name: 'Mauritania', lat: 21.0079, lon: -10.9408, importance: 3 },
  { name: 'Namibia', lat: -22.9576, lon: 18.4904, importance: 3 },
  { name: 'Botswana', lat: -22.3285, lon: 24.6849, importance: 3 },
  { name: 'Gabon', lat: -0.8037, lon: 11.6094, importance: 3 },
  { name: 'Gambia', lat: 13.4432, lon: -15.3101, importance: 3 },
  { name: 'Mali', lat: 17.5707, lon: -3.9962, importance: 3 },
  { name: 'Burkina Faso', lat: 12.2383, lon: -1.5616, importance: 3 },
  { name: 'Malawi', lat: -13.2543, lon: 34.3015, importance: 3 },
  { name: 'Niger', lat: 17.6078, lon: 8.0817, importance: 3 },
  { name: 'Chad', lat: 15.4542, lon: 18.7322, importance: 3 },
  { name: 'Somalia', lat: 5.1521, lon: 46.1996, importance: 3 },
  { name: 'Guinea-Bissau', lat: 11.8037, lon: -15.1804, importance: 3 },
  { name: 'Lesotho', lat: -29.6099, lon: 28.2336, importance: 3 },
  { name: 'Equatorial Guinea', lat: 1.6508, lon: 10.2679, importance: 3 },
  { name: 'Mauritius', lat: -20.3484, lon: 57.5522, importance: 3 },
  { name: 'Eswatini', lat: -26.5225, lon: 31.4659, importance: 3 },
  { name: 'Djibouti', lat: 11.8251, lon: 42.5903, importance: 3 },
  { name: 'Comoros', lat: -11.8750, lon: 43.8722, importance: 3 },
  { name: 'Cabo Verde', lat: 16.5388, lon: -23.0418, importance: 3 },
  { name: 'Sao Tome and Principe', lat: 0.1864, lon: 6.6131, importance: 3 },
  { name: 'Seychelles', lat: -4.6796, lon: 55.4920, importance: 3 },
  { name: 'Eritrea', lat: 15.1794, lon: 39.7823, importance: 3 },

  // ==========================================
  // OCEANIA
  // ==========================================
  { name: 'Australia', lat: -25.2744, lon: 133.7751, importance: 1 },
  { name: 'New Zealand', lat: -40.9006, lon: 174.8860, importance: 2 },
  { name: 'Papua New Guinea', lat: -6.3150, lon: 143.9555, importance: 2 },
  { name: 'Fiji', lat: -17.7134, lon: 178.0650, importance: 3 },
  { name: 'Solomon Islands', lat: -9.6457, lon: 160.1562, importance: 3 },
  { name: 'Vanuatu', lat: -15.3767, lon: 166.9592, importance: 3 },
  { name: 'Samoa', lat: -13.7590, lon: -172.1046, importance: 3 },
  { name: 'Kiribati', lat: -3.3704, lon: -168.7340, importance: 3 },
  { name: 'Micronesia', lat: 7.4256, lon: 150.5508, importance: 3 },
  { name: 'Tonga', lat: -21.1790, lon: -175.1982, importance: 3 },
  { name: 'Marshall Islands', lat: 7.1315, lon: 171.1845, importance: 3 },
  { name: 'Palau', lat: 7.5150, lon: 134.5825, importance: 3 },
  { name: 'Tuvalu', lat: -7.1095, lon: 177.6493, importance: 3 },
  { name: 'Nauru', lat: -0.5228, lon: 166.9315, importance: 3 },
] as const;

/**
 * Filter countries by maximum importance tier (e.g. maxTier = 1 returns only major powers).
 */
export function getCountryLabelsByMaxTier(maxTier: 1 | 2 | 3): CountryLabel[] {
  return COUNTRY_LABELS.filter((c) => c.importance <= maxTier);
}

/**
 * Convert lat/lon in degrees to 3D spherical coordinates on a sphere of specified radius.
 * (lat = 0, lon = 0 aligns with +Z or +X depending on texture alignment; standard convention
 * matches Three.js standard UV sphere mappings).
 */
export function latLonToSpherePosition(
  lat: number,
  lon: number,
  radius: number
): [x: number, y: number, z: number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return [x, y, z];
}
