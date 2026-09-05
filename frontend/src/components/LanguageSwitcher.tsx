import { useLanguage } from "./LanguageProvider";

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();

  return <div className="language-switcher" role="group" aria-label={t("language.choose")}>
    <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
    <button type="button" aria-pressed={language === "zh-CN"} onClick={() => setLanguage("zh-CN")}>简中</button>
  </div>;
}
