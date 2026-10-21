import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const scripts = ['storage.js', 'app.js'].map(file => readFileSync(new URL(file, import.meta.url), 'utf8'));
const deck = {
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
function visit(storage = new Map(), decks = { 'data/a.json': deck, 'data/b.json': deck }, storageError = '') {
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
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, element());
        return nodes.get(id);
    };
    node('filter-bookmark').value = 'all';
    const context = vm.createContext({
        window: { addEventListener() {} },
        document: {
            addEventListener() {}, getElementById: node,
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
    const state = () => JSON.parse(run(`JSON.stringify({
        path: currentQuizPath, ids: orderedQuestions.map(q => q.id),
        choices: orderedQuestions.map(q => [q.id, getOrderedAnswers(q).map(a => a.id)]),
        userAnswers, quizScore, currentQuizIdx, quizCompleted, activeView, bookmarks: [...bookmarks]
    })`));
    return { run, state, node, storage, start: () => run('refreshSubjects()') };
}

test('a fresh visit resumes answers, score, position, shuffled choices, bookmarks and active view', async () => {
    const first = visit();
    await first.start();
    first.run('selectQuizAnswer(0, 0, true); navigateQuiz(1); navigateQuiz(1); selectQuizAnswer(2, 1, false); shuffleCards(); toggleBookmark(2); switchView("list")');
    const before = first.state();

    const second = visit(first.storage);
    await second.start();
    assert.deepEqual(second.state(), before);
    assert.equal(second.node('quiz-progress-text').textContent, 'Câu 3 / 4');
    assert.equal(second.node('quiz-score-badge').textContent, 'Điểm: 1');
    assert.equal(second.node('quiz-explanation-box').classList.contains('hidden'), false);
    assert.ok(second.node('quiz-options').children.every(button => button.disabled));
    assert.equal(second.node('list-view').classList.contains('hidden'), false);
    assert.equal(second.node('quiz-view').classList.contains('hidden'), true);
    second.run('selectQuizAnswer(2, 0, true)');
    assert.equal(second.state().quizScore, 1);
    assert.equal(second.state().userAnswers[2], 1);
});

test('switching subjects and reopening preserves independent sessions and the last selected subject', async () => {
    const first = visit();
    await first.start();
    first.run('selectQuizAnswer(0, 0, true); navigateQuiz(1)');
    const subjectA = first.state();
    await first.run('loadSelectedQuiz("data/b.json")');
    assert.deepEqual(first.state().userAnswers, {});
    first.run('navigateQuiz(1); selectQuizAnswer(1, 1, false); toggleBookmark(1)');
    const subjectB = first.state();
    const second = visit(first.storage);
    await second.start();
    assert.deepEqual(second.state(), subjectB);
    await second.run('loadSelectedQuiz("data/a.json")');
    assert.deepEqual(second.state(), subjectA);
});

test('completion remains visible after reload, including a result with skipped questions', async () => {
    const first = visit();
    await first.start();
    first.run('selectQuizAnswer(0, 0, true); navigateQuiz(3); navigateQuiz(1)');
    const second = visit(first.storage);
    await second.start();
    assert.equal(second.state().quizCompleted, true);
    assert.equal(second.node('quiz-result-card').classList.contains('hidden'), false);
    assert.equal(second.node('quiz-active-card').classList.contains('hidden'), true);
    assert.match(second.node('quiz-result-summary').textContent, /1 \/ 4/);
});

test('restart persists the new attempt, keeps bookmarks, and leaves another subject intact', async () => {
    const first = visit();
    await first.start();
    first.run('selectQuizAnswer(0, 0, true)');
    const subjectA = first.state();
    await first.run('loadSelectedQuiz("data/b.json")');
    first.run('selectQuizAnswer(0, 0, true); toggleBookmark(0); navigateQuiz(3); navigateQuiz(1); restartQuiz()');
    const second = visit(first.storage);
    await second.start();
    assert.equal(second.state().currentQuizIdx, 0);
    assert.equal(second.state().quizScore, 0);
    assert.equal(second.state().quizCompleted, false);
    assert.deepEqual(second.state().userAnswers, {});
    assert.deepEqual(second.state().bookmarks, [0]);
    await second.run('loadSelectedQuiz("data/a.json")');
    assert.deepEqual(second.state(), subjectA);
});

test('shuffle and restart saves its final shuffled state', async () => {
    const first = visit();
    await first.start();
    first.run('selectQuizAnswer(0, 0, true); shuffleAndRestart()');
    const second = visit(first.storage);
    await second.start();
    assert.deepEqual(second.state(), first.state());
    assert.notDeepEqual(second.state().ids, [0, 1, 2, 3]);
    assert.deepEqual(second.state().userAnswers, {});
});

test('updated decks retain valid answers, drop changed/deleted questions and include new ones', async () => {
    const first = visit();
    await first.start();
    first.run('selectQuizAnswer(0, 0, true); navigateQuiz(1); selectQuizAnswer(1, 0, true); navigateQuiz(1); selectQuizAnswer(2, 0, true); toggleBookmark(1); navigateQuiz(1); navigateQuiz(1)');
    const updated = structuredClone(deck);
    updated.questionsList[1].content = 'Updated question';
    updated.questionsList.splice(2, 1);
    updated.questionsList.push({ ...structuredClone(deck.questionsList[3]), id: 4 });
    const second = visit(first.storage, { 'data/a.json': updated });
    await second.start();
    assert.deepEqual(second.state().ids, [0, 1, 3, 4]);
    assert.deepEqual(second.state().userAnswers, { 0: 0 });
    assert.equal(second.state().quizScore, 1);
    assert.equal(second.state().quizCompleted, false);
    assert.deepEqual(second.state().bookmarks, [1]);
    assert.equal(second.state().ids[second.state().currentQuizIdx], 3);
});

test('invalid answer IDs, duplicate card IDs and saved totals cannot corrupt restored progress', async () => {
    const first = visit();
    await first.start();
    first.run('selectQuizAnswer(0, 0, true)');
    const key = 'beequiz-progress:data/a.json';
    const saved = JSON.parse(first.storage.get(key));
    saved.questionIds = [0, 0, 2, 99];
    saved.userAnswers.push(['1', 99], ['missing-question', 0]);
    saved.answerOrder = [['0', [2, 2, 99]]];
    saved.currentQuestionId = 99;
    saved.quizScore = 9999;
    first.storage.set(key, JSON.stringify(saved));
    const second = visit(first.storage);
    await second.start();
    assert.deepEqual(second.state().ids, [0, 2, 1, 3]);
    assert.deepEqual(second.state().choices[0], [0, [2, 0, 1]]);
    assert.deepEqual(second.state().userAnswers, { 0: 0 });
    assert.equal(second.state().quizScore, 1);
    assert.equal(second.state().currentQuizIdx, 0);
});

test('corrupt and unsupported snapshots fall back to a working fresh quiz', async () => {
    for (const snapshot of ['{broken', 'null', '{"version":999}', '{"version":1,"questionIds":[],"questionRevisions":[null]}']) {
        const app = visit(new Map([['beequiz-progress:data/a.json', snapshot]]));
        await app.start();
        assert.equal(app.state().path, 'data/a.json');
        assert.deepEqual(app.state().userAnswers, {});
        assert.equal(app.state().currentQuizIdx, 0);
        app.run('selectQuizAnswer(0, 0, true)');
        assert.equal(app.state().quizScore, 1);
    }
});

test('blocked storage or quota errors do not prevent loading and answering questions', async () => {
    for (const error of ['blocked', 'quota']) {
        const app = visit(new Map(), undefined, error);
        await app.start();
        assert.equal(app.state().path, 'data/a.json');
        app.run('selectQuizAnswer(0, 0, true); navigateQuiz(1); shuffleCards()');
        assert.equal(app.state().quizScore, 1);
        assert.equal(app.state().currentQuizIdx, 1);
    }
});
