/**
 * Target-number locale resolution: NANP area code → US state + IANA zone →
 * callee-local wall-clock time. Static table, no network (R-7: local time is
 * resolved from the DESTINATION number, never the platform timezone).
 *
 * Area codes are grouped per state with the state's predominant zone; the
 * handful of codes whose region sits in a different zone than the rest of
 * their state (e.g. TX 915 El Paso) carry explicit overrides. A few NANP
 * regions straddle a zone boundary (e.g. FL 850 spans Central/Eastern) —
 * they map to the zone covering most of the code's population. Codes not in
 * the table resolve to `null` and the caller fails closed (R-6): the engine
 * then requires the quiet-hours window to hold in EVERY candidate US zone.
 */
import type { CalleeLocalTime, StateCode } from "./types.js";

export interface TargetLocale {
  state: StateCode | null;
  zone: string | null;
}

const EASTERN = "America/New_York";
const CENTRAL = "America/Chicago";
const MOUNTAIN = "America/Denver";
const ARIZONA = "America/Phoenix";
const PACIFIC = "America/Los_Angeles";
const ALASKA = "America/Anchorage";
const HAWAII = "Pacific/Honolulu";

/**
 * Candidate zones used when a number's area code is unknown: the full set of
 * zones a US number can live in (fail-closed quiet-hours check, R-6).
 */
export const US_CANDIDATE_ZONES: readonly string[] = [
  EASTERN,
  CENTRAL,
  MOUNTAIN,
  ARIZONA,
  PACIFIC,
  ALASKA,
  HAWAII,
];

type AreaCodeGroup = { zone: string; codes: number[] };

const STATE_AREA_CODES: Record<StateCode, AreaCodeGroup[]> = {
  AL: [{ zone: CENTRAL, codes: [205, 251, 256, 334, 659, 938] }],
  AK: [{ zone: ALASKA, codes: [907] }],
  AZ: [{ zone: ARIZONA, codes: [480, 520, 602, 623, 928] }],
  AR: [{ zone: CENTRAL, codes: [479, 501, 870] }],
  CA: [
    {
      zone: PACIFIC,
      codes: [
        209, 213, 279, 310, 323, 341, 350, 408, 415, 424, 442, 510, 530, 559,
        562, 619, 626, 628, 650, 657, 661, 669, 707, 714, 747, 760, 805, 818,
        820, 831, 840, 858, 909, 916, 925, 949, 951,
      ],
    },
  ],
  CO: [{ zone: MOUNTAIN, codes: [303, 719, 720, 970, 983] }],
  CT: [{ zone: EASTERN, codes: [203, 475, 860, 959] }],
  DE: [{ zone: EASTERN, codes: [302] }],
  DC: [{ zone: EASTERN, codes: [202, 771] }],
  FL: [
    {
      zone: EASTERN,
      codes: [
        239, 305, 321, 324, 352, 386, 407, 561, 645, 656, 689, 727, 728, 754,
        772, 786, 813, 863, 904, 941, 954,
      ],
    },
    // Panhandle (Pensacola/Panama City); 850/448 straddle into Eastern at
    // Tallahassee but are predominantly Central.
    { zone: CENTRAL, codes: [448, 850] },
  ],
  GA: [{ zone: EASTERN, codes: [229, 404, 470, 478, 678, 706, 762, 770, 912, 943] }],
  HI: [{ zone: HAWAII, codes: [808] }],
  ID: [{ zone: MOUNTAIN, codes: [208, 986] }],
  IL: [
    {
      zone: CENTRAL,
      codes: [217, 224, 309, 312, 331, 447, 618, 630, 708, 773, 779, 815, 847, 872],
    },
  ],
  IN: [
    { zone: EASTERN, codes: [260, 317, 463, 574, 765, 930] },
    // Northwest (Gary) and southwest (Evansville) corners run Central.
    { zone: CENTRAL, codes: [219, 812] },
  ],
  IA: [{ zone: CENTRAL, codes: [319, 515, 563, 641, 712] }],
  KS: [{ zone: CENTRAL, codes: [316, 620, 785, 913] }],
  KY: [
    { zone: EASTERN, codes: [502, 606, 859] },
    { zone: CENTRAL, codes: [270, 364] },
  ],
  LA: [{ zone: CENTRAL, codes: [225, 318, 337, 504, 985] }],
  ME: [{ zone: EASTERN, codes: [207] }],
  MD: [{ zone: EASTERN, codes: [240, 301, 410, 443, 667] }],
  MA: [{ zone: EASTERN, codes: [339, 351, 413, 508, 617, 774, 781, 857, 978] }],
  MI: [
    {
      zone: EASTERN,
      codes: [231, 248, 269, 313, 517, 586, 616, 679, 734, 810, 906, 947, 989],
    },
  ],
  MN: [{ zone: CENTRAL, codes: [218, 320, 507, 612, 651, 763, 924, 952] }],
  MS: [{ zone: CENTRAL, codes: [228, 601, 662, 769] }],
  MO: [{ zone: CENTRAL, codes: [235, 314, 417, 557, 573, 636, 660, 816] }],
  MT: [{ zone: MOUNTAIN, codes: [406] }],
  NE: [{ zone: CENTRAL, codes: [308, 402, 531] }],
  NV: [{ zone: PACIFIC, codes: [702, 725, 775] }],
  NH: [{ zone: EASTERN, codes: [603] }],
  NJ: [
    {
      zone: EASTERN,
      codes: [201, 551, 609, 640, 732, 848, 856, 862, 908, 973],
    },
  ],
  NM: [{ zone: MOUNTAIN, codes: [505, 575] }],
  NY: [
    {
      zone: EASTERN,
      codes: [
        212, 315, 329, 332, 347, 363, 516, 518, 585, 607, 624, 631, 646, 680,
        716, 718, 838, 845, 914, 917, 929, 934,
      ],
    },
  ],
  NC: [{ zone: EASTERN, codes: [252, 336, 472, 704, 743, 828, 910, 919, 980, 984] }],
  ND: [{ zone: CENTRAL, codes: [701] }],
  OH: [
    {
      zone: EASTERN,
      codes: [216, 220, 234, 283, 326, 330, 380, 419, 436, 440, 513, 567, 614, 740, 937],
    },
  ],
  OK: [{ zone: CENTRAL, codes: [405, 539, 572, 580, 918] }],
  OR: [{ zone: PACIFIC, codes: [458, 503, 541, 971] }],
  PA: [
    {
      zone: EASTERN,
      codes: [215, 223, 267, 272, 412, 445, 484, 570, 582, 610, 717, 724, 814, 835, 878],
    },
  ],
  RI: [{ zone: EASTERN, codes: [401] }],
  SC: [{ zone: EASTERN, codes: [803, 821, 839, 843, 854, 864] }],
  SD: [{ zone: CENTRAL, codes: [605] }],
  TN: [
    { zone: CENTRAL, codes: [615, 629, 731, 901, 931] },
    // Knoxville/Chattanooga run Eastern.
    { zone: EASTERN, codes: [423, 865] },
  ],
  TX: [
    {
      zone: CENTRAL,
      codes: [
        210, 214, 254, 281, 325, 346, 361, 409, 430, 432, 469, 512, 682, 713,
        726, 737, 806, 817, 830, 832, 903, 936, 940, 945, 956, 972, 979,
      ],
    },
    // El Paso runs Mountain.
    { zone: MOUNTAIN, codes: [915] },
  ],
  UT: [{ zone: MOUNTAIN, codes: [385, 435, 801] }],
  VT: [{ zone: EASTERN, codes: [802] }],
  VA: [{ zone: EASTERN, codes: [276, 434, 540, 571, 686, 703, 757, 804, 826, 948] }],
  WA: [{ zone: PACIFIC, codes: [206, 253, 360, 425, 509, 564] }],
  WV: [{ zone: EASTERN, codes: [304, 681] }],
  WI: [{ zone: CENTRAL, codes: [262, 274, 353, 414, 534, 608, 715, 920] }],
  WY: [{ zone: MOUNTAIN, codes: [307] }],
};

/** Inverted lookup: area code → {state, zone}. Built once at module load. */
const AREA_CODE_TABLE: ReadonlyMap<number, TargetLocale> = (() => {
  const table = new Map<number, TargetLocale>();
  for (const [state, groups] of Object.entries(STATE_AREA_CODES)) {
    for (const group of groups) {
      for (const code of group.codes) {
        table.set(code, { state: state as StateCode, zone: group.zone });
      }
    }
  }
  return table;
})();

const US_E164_REGEX = /^\+1(\d{3})\d{7}$/;

/**
 * Resolve a +1 E.164 number to its state + IANA zone via its area code.
 * Returns `{state: null, zone: null}` for non-US numbers or area codes not
 * in the table — callers must fail closed (R-6).
 */
export function resolveTargetLocale(e164Number: string): TargetLocale {
  const match = US_E164_REGEX.exec(e164Number.trim());
  if (!match) {
    return { state: null, zone: null };
  }
  const areaCode = Number(match[1]);
  return AREA_CODE_TABLE.get(areaCode) ?? { state: null, zone: null };
}

/** Wall-clock hour/minute of `at` in `zone` (DST handled by Intl). */
export function localTimeIn(zone: string, at: Date): CalleeLocalTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(at);
  const read = (type: "hour" | "minute"): number =>
    Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);
  return { zone, hour: read("hour"), minute: read("minute") };
}

/**
 * Callee-local time(s) for a target number at a UTC instant. One entry when
 * the area code resolves; otherwise every candidate US zone, so the
 * quiet-hours gate can require the window to hold in all of them (R-6).
 */
export function resolveCalleeLocalTimes(
  e164Number: string,
  at: Date,
): CalleeLocalTime[] {
  const locale = resolveTargetLocale(e164Number);
  if (locale.zone) {
    return [localTimeIn(locale.zone, at)];
  }
  return US_CANDIDATE_ZONES.map((zone) => localTimeIn(zone, at));
}
