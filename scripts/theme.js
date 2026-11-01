const THEME_STORAGE_KEY = 'beequiz-theme';
const THEME_MODES = ['system', 'light', 'dark'];
const THEME_LABELS = {
    system: { icon: 'fa-circle-half-stroke', text: 'Giao diện: theo hệ thống' },
    light: { icon: 'fa-sun', text: 'Giao diện: sáng' },
    dark: { icon: 'fa-moon', text: 'Giao diện: tối' },
};
const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function readThemeMode() {
    const saved = readStorageItem(THEME_STORAGE_KEY);
    return THEME_MODES.includes(saved) ? saved : 'system';
}

function applyTheme(mode) {
    const dark = mode === 'dark' || (mode === 'system' && systemDarkQuery.matches);
    const root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.themeMode = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1b2440' : '#425B9A');

    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    const { icon, text } = THEME_LABELS[mode];
    const next = THEME_LABELS[THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length]].text;
    toggle.querySelector('i').className = `fa-solid ${icon}`;
    toggle.setAttribute('aria-label', `${text}. Bấm để đổi sang ${next.replace('Giao diện: ', '')}`);
    toggle.title = text;
}

function cycleTheme() {
    const mode = THEME_MODES[(THEME_MODES.indexOf(readThemeMode()) + 1) % THEME_MODES.length];
    writeStorageItem(THEME_STORAGE_KEY, mode);
    applyTheme(mode);
}

applyTheme(readThemeMode());

systemDarkQuery.addEventListener('change', () => {
    if (readThemeMode() === 'system') applyTheme('system');
});

// Keep tabs in sync when the theme is changed elsewhere.
window.addEventListener('storage', event => {
    if (event.key === THEME_STORAGE_KEY) applyTheme(readThemeMode());
});

window.addEventListener('DOMContentLoaded', () => {
    applyTheme(readThemeMode());
    document.getElementById('theme-toggle').addEventListener('click', cycleTheme);
});
