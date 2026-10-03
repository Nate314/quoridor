import { useState, useEffect } from 'react';

const STORAGE_KEY = 'theme';

export default function ThemeToggle() {
  // index.html applies the saved theme before first paint; this keeps it in sync afterwards
  const [theme, setTheme] = useState(() => localStorage.getItem(STORAGE_KEY) || 'light');
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(nextTheme)}
      aria-label={`Switch to ${nextTheme} mode`}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
