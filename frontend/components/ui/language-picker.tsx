import { bingoLanguages } from "@/lib/languages";

export function LanguagePicker({
  value,
  onChange,
  label = "Bingo languages",
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <fieldset className="language-picker" disabled={disabled}>
      <legend>{label}</legend>
      <div className="language-options">
        {bingoLanguages.map((language) => (
          <label key={language.code}>
            <input
              type="checkbox"
              checked={value.includes(language.code)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, language.code]
                    : value.filter((code) => code !== language.code),
                )
              }
            />
            <span aria-hidden="true">{language.flag}</span> {language.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
