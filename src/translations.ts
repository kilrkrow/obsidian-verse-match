export interface TranslationDef {
  id: string;
  abbr: string;
  name: string;
}

/** Same HelloAO ids/abbreviations bible-verse uses for free-text translations. */
export const HELLOAO_TRANSLATIONS: TranslationDef[] = [
  { id: "eng_kjv", abbr: "KJV", name: "King James Version" },
  { id: "BSB", abbr: "BSB", name: "Berean Standard Bible" },
  { id: "eng_asv", abbr: "ASV", name: "American Standard Version" },
  { id: "eng_web", abbr: "WEB", name: "World English Bible" },
  { id: "eng_net", abbr: "NET", name: "NET Bible" },
  { id: "eng_dby", abbr: "DARBY", name: "Darby Translation" },
  { id: "eng_dra", abbr: "DRB", name: "Douay-Rheims 1899" },
  { id: "eng_rv5", abbr: "ERV", name: "Revised Version" },
  { id: "eng_ylt", abbr: "YLT", name: "Young's Literal Translation" },
  { id: "eng_bbe", abbr: "BBE", name: "Bible in Basic English" },
  { id: "eng_fbv", abbr: "FBV", name: "Free Bible Version" },
  { id: "eng_lsv", abbr: "LSV", name: "Literal Standard Version" },
  { id: "eng_msb", abbr: "MSB", name: "Majority Standard Bible" },
  { id: "eng_gnv", abbr: "GNV", name: "Geneva Bible 1599" },
  { id: "eng_ojb", abbr: "OJB", name: "Orthodox Jewish Bible" },
];

export const DEFAULT_TRANSLATION_ID = "eng_kjv";

export function abbrForId(id: string): string {
  return HELLOAO_TRANSLATIONS.find((t) => t.id === id)?.abbr ?? id.toUpperCase();
}
