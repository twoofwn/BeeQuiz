function updateHeaderHeight() {
    const header = document.getElementById('app-header');
    header.style.setProperty('--header-height', `${header.getBoundingClientRect().height}px`);
}

function setHeaderCollapsed(collapsed, persist = true) {
    const header = document.getElementById('app-header');
    const content = document.getElementById('header-content');
    const toggle = document.getElementById('header-toggle');
    updateHeaderHeight();
    if (collapsed) {
        closeSubjectDropdown();
        if (content.contains(document.activeElement)) toggle.focus({ preventScroll: true });
    }
    header.classList.toggle('is-collapsed', collapsed);
    content.inert = collapsed;
    content.setAttribute('aria-hidden', String(collapsed));
    toggle.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Mở thanh điều hướng' : 'Thu gọn thanh điều hướng';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    if (persist) writeStorageItem('beequiz-header-collapsed', String(collapsed));
}

function toggleHeader() {
    const collapsed = document.getElementById('app-header').classList.contains('is-collapsed');
    setHeaderCollapsed(!collapsed);
}

function initHeader() {
    setHeaderCollapsed(readStorageItem('beequiz-header-collapsed') === 'true', false);
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(updateHeaderHeight).observe(document.getElementById('header-content'));
    } else {
        window.addEventListener('resize', updateHeaderHeight);
    }
}
