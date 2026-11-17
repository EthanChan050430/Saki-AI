import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, Eye, EyeOff, Lock } from 'lucide-react';
import { localizeWith } from '../utils/localize';
import {
  clearRememberedPassword,
  readRememberedPassword,
  verifyLoginPassword,
  writeRememberedPassword,
} from '../utils/loginAuth';

const DEFAULT_USER_AVATAR = '/assets/head_user.png';

/**
 * Full-screen liquid-glass lock screen shown on entry when a login password is enabled.
 */
export default function LoginScreen({ config, theme, backgroundUrl, onUnlock }) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const getLocalText = (zh, en, ja) => localizeWith(language, zh, en, ja);

  const [initialRemembered] = useState(() => readRememberedPassword());
  const [password, setPassword] = useState(initialRemembered.password);
  const [remember, setRemember] = useState(initialRemembered.remember);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const handleToggleRemember = (event) => {
    const nextRemember = event.target.checked;
    setRemember(nextRemember);
    if (!nextRemember) {
      clearRememberedPassword();
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!verifyLoginPassword(password, config)) {
      setError(getLocalText('密码不正确，请重试', 'Incorrect password, please try again', 'パスワードが正しくありません'));
      setShakeKey(prev => prev + 1);
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
      return;
    }
    setError('');
    writeRememberedPassword(config.loginPassword, remember);
    onUnlock?.();
  };

  return (
    <motion.div
      data-testid="saki-login-screen"
      role="dialog"
      aria-modal="true"
      aria-label={getLocalText('SAKI-AI 登录验证', 'SAKI-AI Login', 'SAKI-AI ログイン認証')}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] } }}
      className="fixed inset-0 z-[220] flex flex-col items-center justify-center px-5 select-none overflow-hidden"
    >
      {/* Frosted wallpaper & ambient aurora backdrop */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-105 transition-transform duration-700"
        style={backgroundUrl ? { backgroundImage: `url(${JSON.stringify(backgroundUrl)})` } : undefined}
      />
      <div
        className={`absolute inset-0 backdrop-blur-3xl saturate-150 transition-colors duration-300 ${
          theme === 'dark' ? 'bg-[#090a10]/62' : 'bg-white/38'
        }`}
      />
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[18%] left-[12%] w-[52%] h-[52%] rounded-full bg-gradient-to-br from-[#ff75ac]/28 via-[#ff9bc8]/14 to-transparent blur-3xl" />
        <div className="absolute bottom-[-16%] right-[10%] w-[50%] h-[50%] rounded-full bg-gradient-to-tl from-[#af52de]/22 via-[#38bdf8]/12 to-transparent blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex w-full max-w-md flex-col items-center"
      >
        {/* Avatar */}
        <div className="relative mb-5 flex items-center justify-center">
          <div className="absolute -inset-4 rounded-full bg-gradient-to-tr from-[#ff75ac]/40 via-[#f472b6]/20 to-[#38bdf8]/30 blur-2xl opacity-80" />
          <div className="saki-login-avatar-frame">
            <img
              src={config?.userAvatar || DEFAULT_USER_AVATAR}
              alt="User"
              onError={(event) => {
                if (event.currentTarget.getAttribute('src') !== DEFAULT_USER_AVATAR) {
                  event.currentTarget.src = DEFAULT_USER_AVATAR;
                }
              }}
              className="h-24 w-24 sm:h-28 sm:w-28 rounded-full object-cover block"
            />
          </div>
        </div>

        <h1 className="mb-6 text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-dark)] drop-shadow-sm">
          SAKI AI
        </h1>

        {/* Liquid Glass Capsule Form */}
        <motion.form
          key={shakeKey}
          onSubmit={handleSubmit}
          animate={shakeKey > 0 ? { x: [0, -10, 10, -7, 7, -3, 0] } : { x: 0 }}
          transition={{ duration: 0.38 }}
          className="w-full flex flex-col items-center"
        >
          <div className="saki-login-capsule w-full max-w-[360px] sm:max-w-[390px] h-14 sm:h-[58px] pl-5 pr-2 flex items-center gap-2.5">
            <Lock size={17} className="text-[#ff75ac] shrink-0 opacity-90" />
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError('');
              }}
              placeholder={getLocalText('输入登录密码…', 'Enter password…', 'パスワードを入力…')}
              aria-label={getLocalText('登录密码', 'Login password', 'ログインパスワード')}
              autoComplete="current-password"
              className="flex-1 min-w-0 bg-transparent text-sm sm:text-[15px] text-[var(--text-dark)] placeholder:text-[var(--text-secondary)]/80 outline-none focus:outline-none focus-visible:outline-none border-0"
            />
            <button
              type="button"
              onClick={() => setShowPassword(prev => !prev)}
              aria-label={showPassword
                ? getLocalText('隐藏密码', 'Hide password', 'パスワードを隠す')
                : getLocalText('显示密码', 'Show password', 'パスワードを表示')}
              className="p-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-dark)] hover:bg-white/30 dark:hover:bg-white/10 transition-colors shrink-0"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button
              type="submit"
              aria-label={getLocalText('解锁进入', 'Unlock', 'ロック解除')}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full saki-pink-gradient text-white flex items-center justify-center shadow-[0_6px_20px_rgba(255,117,172,0.42)] hover:scale-[1.04] active:scale-95 transition-all shrink-0"
            >
              <ArrowRight size={18} strokeWidth={2.2} />
            </button>
          </div>

          <AnimatePresence>
            {error && (
              <motion.p
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="mt-3 text-xs font-medium text-rose-500 dark:text-rose-400"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Remember password */}
          <label className="mt-4 inline-flex items-center gap-2 px-1 py-1 cursor-pointer text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-dark)] transition-colors active:scale-[0.98]">
            <input
              type="checkbox"
              checked={remember}
              onChange={handleToggleRemember}
              className="sr-only"
            />
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full border transition-all ${
                remember
                  ? 'border-[#ff75ac] bg-[#ff75ac] text-white shadow-[0_2px_8px_rgba(255,117,172,0.4)]'
                  : 'border-[var(--text-tertiary)]/60 bg-transparent text-transparent'
              }`}
              aria-hidden="true"
            >
              <Check size={11} strokeWidth={2.8} />
            </span>
            <span>{getLocalText('记住密码', 'Remember password', 'パスワードを記憶')}</span>
          </label>
        </motion.form>
      </motion.div>
    </motion.div>
  );
}
