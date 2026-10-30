const ASSET_ROOT = '/assets/dreamstarry';

export const CHAT_BACKGROUNDS = {
  original: '/assets/background.png',
  day: `${ASSET_ROOT}/background.webp`,
  night: `${ASSET_ROOT}/background_dark.webp`,
  room: `${ASSET_ROOT}/background_room.webp`,
};

export function getChatBackgroundPreset(config = {}) {
  if (['auto', 'original', 'day', 'night', 'room', 'custom'].includes(config.chatBackgroundPreset)) {
    return config.chatBackgroundPreset;
  }
  const source = config.chatBackgroundImage;
  // Existing default backgrounds gain day/night artwork. Uploaded backgrounds stay selected.
  if (!source || source === CHAT_BACKGROUNDS.original) return 'auto';
  return Object.keys(CHAT_BACKGROUNDS).find(key => CHAT_BACKGROUNDS[key] === source) || 'custom';
}

export function getChatBackgroundSource(config = {}, theme = 'light', mobile = false) {
  let preset = getChatBackgroundPreset(config);
  if (preset === 'auto') preset = theme === 'dark' ? 'night' : 'day';
  if (mobile && (preset === 'day' || preset === 'night')) {
    return `${ASSET_ROOT}/background_mobile${preset === 'night' ? '_dark' : ''}.webp`;
  }
  return preset === 'custom'
    ? config.chatBackgroundImage || CHAT_BACKGROUNDS.original
    : CHAT_BACKGROUNDS[preset];
}

export function selectChatBackground(config, preset) {
  return {
    ...config,
    chatBackgroundPreset: preset,
    chatBackgroundImage: CHAT_BACKGROUNDS[preset] || CHAT_BACKGROUNDS.day,
  };
}
