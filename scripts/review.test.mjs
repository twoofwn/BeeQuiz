import assert from 'node:assert/strict';
import test from 'node:test';
import { deck, visit } from './test-support.mjs';

test('empty reviews do nothing; bookmarking the active question enables starred review and persists', async () => {
    const app = visit();
    await app.start();
    const original = app.state();
    app.run('startReview("wrong"); startReview("starred")');
    assert.deepEqual(app.state(), original);
    assert.equal(app.node('review-wrong-btn').disabled, true);
    assert.equal(app.node('review-starred-btn').disabled, true);
    app.run('toggleCurrentBookmark()');
    assert.deepEqual(app.state().bookmarks, [0]);
    assert.equal(app.node('review-starred-btn').disabled, false);
    assert.match(app.node('quiz-bookmark-btn').innerHTML, /fa-solid/);
    const nextVisit = visit(app.storage);
    await nextVisit.start();
    assert.deepEqual(nextVisit.state().bookmarks, [0]);
    nextVisit.run('toggleCurrentBookmark()');
    assert.equal(nextVisit.node('review-starred-btn').disabled, true);
    assert.match(nextVisit.node('quiz-bookmark-btn').innerHTML, /fa-regular/);
});

test('wrong review during a quiz includes only incorrect answers and returns to the unchanged main session', async () => {
    const app = visit();
    await app.start();
    app.run('selectQuizAnswer(0, 1, false); navigateQuiz(1); selectQuizAnswer(1, 0, true); navigateQuiz(1)');
    const original = app.state();
    assert.equal(app.node('review-wrong-btn').textContent, 'Học các câu bị sai (1)');
    app.run('startReview("wrong")');
    assert.deepEqual(app.state().ids, [0]);
    assert.deepEqual(app.state().userAnswers, {});
    assert.equal(app.state().quizScore, 0);
    assert.equal(app.state().currentQuizIdx, 0);
    assert.ok(app.node('quiz-options').children.every(button => !button.disabled));
    assert.equal(app.node('return-main-btn').classList.contains('hidden'), false);
    app.press('a');
    app.press('Enter');
    assert.equal(app.state().quizScore, 1);
    assert.match(app.node('quiz-result-title').textContent, /câu sai/);
    app.run('returnToMainQuiz()');
    assert.deepEqual(app.state(), original);
    assert.equal(app.node('return-main-btn').classList.contains('hidden'), true);
});

test('starred review includes unanswered stars; un-starring does not skip the current review card', async () => {
    const app = visit();
    await app.start();
    app.run('toggleCurrentBookmark(); navigateQuiz(2); toggleCurrentBookmark(); startReview("starred")');
    assert.deepEqual(app.state().ids, [0, 2]);
    app.run('toggleCurrentBookmark()');
    assert.deepEqual(app.state().ids, [0, 2]);
    assert.deepEqual(app.state().bookmarks, [2]);
    assert.equal(app.node('review-starred-btn').textContent, 'Học câu gắn sao (1)');
    app.press('a');
    app.press('Enter');
    app.press('a');
    app.run('returnToMainQuiz()');
    assert.deepEqual(app.state().ids, [0, 1, 2, 3]);
    assert.deepEqual(app.state().userAnswers, {});
    assert.equal(app.state().currentQuizIdx, 2);
    assert.deepEqual(app.state().bookmarks, [2]);
    assert.equal(app.state().quizScore, 0);
});

test('re-reviewing remaining mistakes and changing review mode keeps only one original main session', async () => {
    const app = visit();
    await app.start();
    app.run('selectQuizAnswer(0, 1, false); navigateQuiz(1); selectQuizAnswer(1, 2, false); toggleBookmark(3)');
    const original = app.state();
    app.run('startReview("wrong"); selectQuizAnswer(0, 0, true); navigateQuiz(1); selectQuizAnswer(1, 1, false); startReview("wrong")');
    assert.deepEqual(app.state().ids, [1]);
    assert.deepEqual(app.state().userAnswers, {});
    app.run('startReview("starred")');
    assert.deepEqual(app.state().ids, [3]);
    app.run('returnToMainQuiz()');
    assert.deepEqual(app.state(), original);
});

test('a reload restores the review, answer order, main snapshot and independent score', async () => {
    const app = visit();
    await app.start();
    app.run('selectQuizAnswer(0, 1, false); navigateQuiz(2); selectQuizAnswer(2, 1, false)');
    const main = app.state();
    app.run('startReview("wrong"); shuffleCards()');
    app.press('a');
    app.press('Enter');
    const review = app.state();
    const snapshot = JSON.parse(app.storage.get('beequiz-progress:data/a.json'));
    assert.deepEqual(snapshot.questionIds, main.ids);
    assert.deepEqual(Object.fromEntries(snapshot.userAnswers), main.userAnswers);
    assert.deepEqual(snapshot.review.questionIds, review.ids);
    const nextVisit = visit(app.storage);
    await nextVisit.start();
    assert.deepEqual(nextVisit.state(), review);
    assert.equal(nextVisit.run('reviewMode'), 'wrong');
    assert.match(nextVisit.node('review-mode-label').textContent, /câu sai/);
    nextVisit.run('returnToMainQuiz()');
    assert.deepEqual(nextVisit.state(), main);
    const thirdVisit = visit(nextVisit.storage);
    await thirdVisit.start();
    assert.deepEqual(thirdVisit.state(), main);
    assert.equal(thirdVisit.run('reviewMode'), null);
});

test('review from a finished main quiz restores both result screens after reload and return', async () => {
    const app = visit();
    await app.start();
    app.run('selectQuizAnswer(0, 1, false); navigateQuiz(3); navigateQuiz(1)');
    const main = app.state();
    app.run('startReview("wrong")');
    app.press('a');
    app.press('Enter');
    const nextVisit = visit(app.storage);
    await nextVisit.start();
    assert.equal(nextVisit.state().quizCompleted, true);
    assert.match(nextVisit.node('quiz-result-title').textContent, /câu sai/);
    nextVisit.run('returnToMainQuiz()');
    assert.deepEqual(nextVisit.state(), main);
    assert.equal(nextVisit.node('quiz-result-title').textContent, 'Hoàn thành bài tập!');
    assert.equal(nextVisit.node('quiz-result-card').classList.contains('hidden'), false);
});

test('shuffle, restart, list view and keyboard selection in review cannot change the main deck', async () => {
    const app = visit();
    await app.start();
    app.run('shuffleCards(); selectQuizAnswer(1, 0, true); navigateQuiz(1); toggleBookmark(0); toggleBookmark(1); toggleBookmark(2)');
    const main = app.state();
    app.run('startReview("starred")');
    const currentId = app.state().ids[0];
    app.press('b');
    app.run('shuffleCards()');
    assert.equal(app.state().ids[0], currentId);
    assert.equal(Object.keys(app.state().userAnswers).length, 1);
    app.run('switchView("list")');
    assert.equal(app.node('list-count').textContent, 4);
    app.run('restartQuiz(); switchView("quiz")');
    assert.deepEqual(app.state().userAnswers, {});
    assert.equal(app.state().ids.length, 3);
    app.run('returnToMainQuiz()');
    assert.deepEqual(app.state(), main);
});

test('subject changes preserve review sessions separately without replacing the main sessions', async () => {
    const app = visit();
    await app.start();
    app.run('selectQuizAnswer(0, 1, false); startReview("wrong"); selectQuizAnswer(0, 0, true)');
    const review = app.state();
    await app.run('loadSelectedQuiz("data/b.json")');
    assert.equal(app.run('reviewMode'), null);
    app.run('toggleCurrentBookmark(); startReview("starred")');
    await app.run('loadSelectedQuiz("data/a.json")');
    assert.deepEqual(app.state(), review);
    assert.equal(app.run('reviewMode'), 'wrong');
    app.run('returnToMainQuiz()');
    assert.deepEqual(app.state().userAnswers, { 0: 1 });
    assert.equal(app.state().ids.length, 4);
});

test('deleted review cards or damaged review data fall back to the valid main progress', async () => {
    const app = visit();
    await app.start();
    app.run('selectQuizAnswer(0, 0, true); navigateQuiz(1); toggleBookmark(1); startReview("starred")');
    const key = 'beequiz-progress:data/a.json';
    const saved = app.storage.get(key);
    const updated = structuredClone(deck);
    updated.questionsList.splice(1, 1);
    const nextVisit = visit(new Map([[key, saved]]), { 'data/a.json': updated });
    await nextVisit.start();
    assert.equal(nextVisit.run('reviewMode'), null);
    assert.deepEqual(nextVisit.state().ids, [0, 2, 3]);
    assert.deepEqual(nextVisit.state().userAnswers, { 0: 0 });
    const damaged = JSON.parse(saved);
    damaged.review.userAnswers = [null];
    const fallback = visit(new Map([[key, JSON.stringify(damaged)]]));
    await fallback.start();
    assert.equal(fallback.run('reviewMode'), null);
    assert.deepEqual(fallback.state().userAnswers, { 0: 0 });
});
