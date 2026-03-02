import type { Election, User } from "@shared/schema";

const REG_NO_PATTERN = /^([A-Z]{2})\d{2}\/PU\/\d{5}\/(\d{2})$/i;

export function parseRegistrationProfile(username: string) {
  const match = REG_NO_PATTERN.exec(username);
  if (!match) return null;

  const facultyCode = match[1].toUpperCase();
  const intakeShortYear = Number(match[2]);
  const currentShortYear = new Date().getFullYear() % 100;
  const yearLevel = Math.max(1, Math.min(6, currentShortYear - intakeShortYear + 1));

  return {
    facultyCode,
    intakeShortYear,
    yearLevel,
  };
}

function parseCsv(value: string | null | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function isUserEligibleForElection(user: Pick<User, "username">, election: Pick<Election, "eligibleFaculties" | "eligibleYearLevels">) {
  const profile = parseRegistrationProfile(user.username);
  if (!profile) return false;

  const facultyRules = parseCsv(election.eligibleFaculties).map((entry) => entry.toUpperCase());
  const yearRules = parseCsv(election.eligibleYearLevels).map((entry) => Number(entry));

  const facultyAllowed = facultyRules.length === 0 || facultyRules.includes(profile.facultyCode);
  const yearAllowed = yearRules.length === 0 || yearRules.includes(profile.yearLevel);

  return facultyAllowed && yearAllowed;
}

export function describeElectionEligibility(election: Pick<Election, "eligibleFaculties" | "eligibleYearLevels">) {
  const facultyRules = parseCsv(election.eligibleFaculties);
  const yearRules = parseCsv(election.eligibleYearLevels);

  return {
    facultyRules,
    yearRules,
  };
}

