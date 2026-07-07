/** Pure request↔provider matching (MP-4/MP-5, docs/07). */

export interface MatchableProfile {
  category: string;
  services: string[];
  city: string | null;
}

export interface MatchableRequest {
  category: string;
  title: string;
  description: string;
  city: string | null;
  remoteOk: boolean;
}

/**
 * v1 scoring: same category is the strong signal; each offered service
 * that appears in the request text adds weight; local providers get a
 * nudge when the buyer wants local. 0 = no match.
 */
export function matchScore(profile: MatchableProfile, request: MatchableRequest): number {
  let score = 0;
  if (profile.category === request.category) score += 3;

  const text = `${request.title} ${request.description}`.toLowerCase();
  for (const service of profile.services) {
    if (service.length >= 3 && text.includes(service)) score += 1;
  }

  if (score === 0) return 0; // service/category relevance is mandatory
  if (
    !request.remoteOk &&
    request.city &&
    profile.city &&
    profile.city.toLowerCase() !== request.city.toLowerCase()
  ) {
    return 0; // buyer wants local; provider is elsewhere
  }
  if (request.city && profile.city && profile.city.toLowerCase() === request.city.toLowerCase()) {
    score += 1;
  }
  return score;
}
