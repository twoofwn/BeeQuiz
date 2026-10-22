import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const scripts = ['storage.js', 'review.js', 'motion.js', 'header.js', 'app.js'].map(file => readFileSync(new URL(file, import.meta.url), 'utf8'));
export const deck = {
    name: 'Test subject',
    questionsList: Array.from({ length: 4 }, (_, id) => ({
        id,
        content: `Question ${id}`,
        explanation: `Explanation ${id}`,
        answersList: [
            { id: 0, content: 'Correct', is_correct: true },
            { id: 1, content: 'Wrong', is_correct: false },
            { id: 2, content: 'Also wrong', is_correct: false },
        ],
    })),
};

// Exercise the app's real initialization, rendering and mutation functions in a fresh
// JS context for each visit, sharing only the localStorage backing map between visits.
export function visit(storage = new Map(), decks = { 'data/a.json': deck, 'data/b.json': deck }, storageError = '') {
    function element() {
        const classes = new Set();
        const children = [];
        const selectors = new Map();
        return {
            value: '', textContent: '', style: {}, children,
            classList: {
                add: name => classes.add(name),
                remove: name => classes.delete(name),
                contains: name => classes.has(name),
                toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
            },
            set innerHTML(value) { this.markup = value; children.length = 0; selectors.clear(); },
            get innerHTML() { return this.markup; },
            appendChild(child) { children.push(child); },
            append(...items) { children.push(...items); },
            replaceChildren(...items) { children.splice(0, children.length, ...items); },
            querySelector(selector) {
                if (!selectors.has(selector)) selectors.set(selector, element());
                return selectors.get(selector);
            },
            setAttribute() {}, addEventListener() {},
        };
    }
    const nodes = new Map();
    const documentListeners = new Map();
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, element());
        return nodes.get(id);
    };
    node('filter-bookmark').value = 'all';
    node('subject-dropdown').classList.add('hidden');
    const context = vm.createContext({
        window: { addEventListener() {} },
        document: {
            addEventListener(type, listener) {
                if (!documentListeners.has(type)) documentListeners.set(type, []);
                documentListeners.get(type).push(listener);
            },
            getElementById: node,
            createElement: element, querySelectorAll: () => [],
        },
        localStorage: {
            getItem(key) {
                if (storageError === 'blocked') throw new Error('Storage blocked');
                return storage.get(key) ?? null;
            },
            setItem(key, value) {
                if (storageError) throw new Error('Storage unavailable');
                storage.set(key, value);
            },
        },
        fetch: async url => ({
            ok: true,
            json: async () => JSON.parse(JSON.stringify(url === 'data/index.json'
                ? { quizzes: Object.keys(decks).map(path => ({ path, name: path })) }
                : decks[decodeURIComponent(url)])),
        }),
        console,
        Math: Object.assign(Object.create(Math), { random: () => 0 }),
    });
    const run = code => vm.runInContext(code, context);
    scripts.forEach(run);
    const press = (key, overrides = {}) => {
        const event = {
            key, defaultPrevented: false,
            target: { closest: () => null, matches: () => false },
            preventDefault() { this.defaultPrevented = true; },
            ...overrides,
        };
        for (const listener of documentListeners.get('keydown') || []) listener(event);
        return event.defaultPrevented;
    };
    const state = () => JSON.parse(run(`JSON.stringify({
        path: currentQuizPath, ids: orderedQuestions.map(q => q.id),
        choices: orderedQuestions.map(q => [q.id, getOrderedAnswers(q).map(a => a.id)]),
        userAnswers, quizScore, currentQuizIdx, quizCompleted, activeView, bookmarks: [...bookmarks]
    })`));
    return { run, state, node, storage, press, start: () => run('bindEvents(); refreshSubjects()') };
}

