import { resolveLangCode } from './localize'

export const uiLanguages = [
  { code: 'zh-CN', label: '简体中文', short: '中文' },
  { code: 'en-US', label: 'English', short: 'EN' },
  { code: 'ja', label: '日本語', short: '日本語' },
]

export function activeUiLanguage(language) {
  const code = resolveLangCode(language)
  return uiLanguages.find(option => code.startsWith(option.code.split('-')[0])) ?? uiLanguages[1]
}
