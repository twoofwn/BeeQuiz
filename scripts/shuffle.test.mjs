import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const script = readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function session({ answered = {}, index = 0, score = 0, random = 0 } = {}) {
    const status = { textContent: '' };
    const context = vm.createContext({
        window: { addEventListener() {} },
        document: { addEventListener() {}, getElementById: () => status },
        Math: Object.assign(Object.create(Math), { random: () => random }),
    });
    const run = code => vm.runInContext(code, context);
    run(script);
    run(`
        quizData = { questionsList: Array.from({ length: 5 }, (_, id) => ({
            id, content: 'Question ' + id,
            answersList: [
                { id: 0, content: 'Correct', is_correct: true },
                { id: 1, content: 'Wrong', is_correct: false },
                { id: 2, content: 'Also wrong', is_correct: false }
            ]
        })) };
        orderedQuestions = [...quizData.questionsList];
        answerOrder = new Map(orderedQuestions.map(q => [String(q.id), [...q.answersList].reverse()]));
        userAnswers = ${JSON.stringify(answered)};
        currentQuizIdx = ${index};
        quizScore = ${score};
        bookmarks = new Set([0, 4]);
        let renders = 0;
        let filterUpdates = 0;
        loadQuizQuestion = () => { renders++; };
        applyFilters = () => { filterUpdates++; };
        const originalData = JSON.stringify(quizData);
        const previousQuestions = [...orderedQuestions];
        const previousChoices = new Map(answerOrder);
    `);
    const state = () => JSON.parse(run(`JSON.stringify({
        ids: orderedQuestions.map(q => q.id),
        choices: orderedQuestions.map(q => [q.id, getOrderedAnswers(q).map(a => a.id)]),
        userAnswers, currentQuizIdx, quizScore, bookmarks: [...bookmarks], renders, filterUpdates
    })`));
    return { run, state, status };
}

test('only unanswered slots and choices change, including skipped questions', () => {
    const s = session({ answered: { 0: 0, 2: 1 }, index: 3, score: 1 });
    s.run('shuffleCards()');
    const state = s.state();
    assert.deepEqual(state.ids, [0, 3, 2, 4, 1]);
    assert.deepEqual(state.userAnswers, { 0: 0, 2: 1 });
    assert.equal(state.currentQuizIdx, 3);
    assert.equal(state.quizScore, 1);
    assert.deepEqual(state.bookmarks, [0, 4]);
    assert.equal(s.run('getOrderedAnswers(orderedQuestions[0]) === previousChoices.get("0")'), true);
    assert.equal(s.run('getOrderedAnswers(orderedQuestions[2]) === previousChoices.get("2")'), true);
    assert.equal(s.run('JSON.stringify(quizData) === originalData'), true);
    assert.equal(state.renders, 1);
    assert.equal(state.filterUpdates, 1);
});

test('current answered card retains its position and answer order across repeated shuffles', () => {
    const s = session({ answered: { 1: 0, 3: 1 }, index: 3, score: 1 });
    s.run('for (let i = 0; i < 20; i++) shuffleCards()');
    assert.equal(s.state().ids[3], 3);
    assert.equal(s.state().ids[1], 1);
    assert.equal(s.state().currentQuizIdx, 3);
    assert.equal(s.state().quizScore, 1);
    assert.equal(s.run('getOrderedAnswers(orderedQuestions[3]) === previousChoices.get("3")'), true);
    assert.deepEqual([...s.state().ids].sort(), [0, 1, 2, 3, 4]);
});

test('unchanged random order rotates only the unanswered slots', () => {
    const s = session({ answered: { 0: 0, 2: 1 }, random: 0.999 });
    s.run('shuffleCards()');
    assert.deepEqual(s.state().ids, [0, 3, 2, 4, 1]);
});

test('one unanswered question keeps all slots and shuffles only its choices', () => {
    const s = session({ answered: { 0: 0, 1: 1, 3: 0, 4: 1 }, index: 2, score: 2 });
    s.run('shuffleCards()');
    assert.deepEqual(s.state().ids, [0, 1, 2, 3, 4]);
    assert.deepEqual(s.state().choices[2], [2, [1, 0, 2]]);
    assert.equal(s.run('[0, 1, 3, 4].every(id => answerOrder.get(String(id)) === previousChoices.get(String(id)))'), true);
    assert.equal(s.state().currentQuizIdx, 2);
    assert.equal(s.state().quizScore, 2);
});

test('completed session is a no-op and does not reopen the quiz card', () => {
    const s = session({ answered: { 0: 0, 1: 1, 2: 0, 3: 1, 4: 0 }, index: 4, score: 3 });
    const before = s.state();
    s.run('shuffleCards()');
    assert.deepEqual(s.state(), before);
    assert.match(s.status.textContent, /đã trả lời tất cả/);
});

test('shuffle and restart clears progress before shuffling the entire completed deck', () => {
    const s = session({ answered: { 0: 0, 1: 1, 2: 0, 3: 1, 4: 0 }, index: 4, score: 3 });
    s.run('shuffleAndRestart()');
    assert.deepEqual(s.state().userAnswers, {});
    assert.equal(s.state().currentQuizIdx, 0);
    assert.equal(s.state().quizScore, 0);
    assert.deepEqual(s.state().ids, [1, 2, 3, 4, 0]);
    assert.equal(s.run('JSON.stringify(quizData) === originalData'), true);
});

test('unanswered deck shuffles completely without advancing progress', () => {
    const s = session();
    s.run('answerOrder.clear(); shuffleCards()');
    assert.deepEqual(s.state().ids, [1, 2, 3, 4, 0]);
    assert.deepEqual(s.state().userAnswers, {});
    assert.equal(s.state().currentQuizIdx, 0);
    assert.equal(s.state().quizScore, 0);
    assert.equal(s.run('JSON.stringify(quizData) === originalData'), true);
});

test('missing or empty deck does nothing', () => {
    const s = session();
    s.run('quizData = null; shuffleCards(); quizData = { questionsList: [] }; orderedQuestions = []; shuffleCards()');
    assert.equal(s.state().renders, 0);
    assert.equal(s.state().filterUpdates, 0);
});
