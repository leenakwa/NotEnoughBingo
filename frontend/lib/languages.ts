export const bingoLanguages = [
  { code: "en", flag: "🇬🇧", name: "English" },
  { code: "ru", flag: "🇷🇺", name: "Russian" },
  { code: "uk", flag: "🇺🇦", name: "Ukrainian" },
  { code: "es", flag: "🇪🇸", name: "Spanish" },
  { code: "fr", flag: "🇫🇷", name: "French" },
  { code: "de", flag: "🇩🇪", name: "German" },
  { code: "pt", flag: "🇵🇹", name: "Portuguese" },
  { code: "it", flag: "🇮🇹", name: "Italian" },
  { code: "pl", flag: "🇵🇱", name: "Polish" },
  { code: "tr", flag: "🇹🇷", name: "Turkish" },
  { code: "ar", flag: "🇸🇦", name: "Arabic" },
  { code: "hi", flag: "🇮🇳", name: "Hindi" },
  { code: "ja", flag: "🇯🇵", name: "Japanese" },
  { code: "ko", flag: "🇰🇷", name: "Korean" },
  { code: "zh", flag: "🇨🇳", name: "Chinese" },
] as const;

export type BingoLanguage = (typeof bingoLanguages)[number]["code"];

export function languageLabel(code: string): string {
  const language = bingoLanguages.find((item) => item.code === code);
  return language ? `${language.flag} ${language.name}` : "🌐 Unspecified";
}
