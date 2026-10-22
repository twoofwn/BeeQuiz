function captureQuizSession() {
    return {
        orderedQuestions: [...orderedQuestions],
        answerOrder: new Map(answerOrder),
        userAnswers: { ...userAnswers },
        currentQuizIdx,
        completed: quizCompleted,
    };
}

function applyQuizSession(session) {
    orderedQuestions = session.orderedQuestions;
    answerOrder = session.answerOrder;
    userAnswers = session.userAnswers;
    currentQuizIdx = session.currentQuizIdx;
    quizCompleted = session.completed;
    quizScore = orderedQuestions.filter(question =>
        Object.prototype.hasOwnProperty.call(userAnswers, question.id) &&
        question.answersList.some(answer => answer.id === userAnswers[question.id] && answer.is_correct)
    ).length;
}

function serializeQuizSession(session) {
    return {
        questionIds: session.orderedQuestions.map(question => question.id),
        answerOrder: [...session.answerOrder].map(([id, answers]) => [id, answers.map(answer => answer.id)]),
        userAnswers: Object.entries(session.userAnswers),
        currentQuestionId: session.orderedQuestions[session.currentQuizIdx]?.id,
        completed: session.completed,
    };
}

function getAllQuestions() {
    return mainQuizSession?.orderedQuestions || orderedQuestions;
}

function getWrongQuestions() {
    return orderedQuestions.filter(question =>
        Object.prototype.hasOwnProperty.call(userAnswers, question.id) &&
        question.answersList.some(answer => answer.id === userAnswers[question.id] && !answer.is_correct)
    );
}

function startReview(mode) {
    if (!quizData || !['wrong', 'starred'].includes(mode)) return;
    const questions = mode === 'wrong' ? getWrongQuestions() : getAllQuestions().filter(question => bookmarks.has(question.id));
    if (!questions.length) return;

    const choices = new Map(questions.map(question => [String(question.id), [...getOrderedAnswers(question)]]));
    // Keep a single main session even when starting another review from a review.
    if (!mainQuizSession) mainQuizSession = captureQuizSession();
    reviewMode = mode;
    applyQuizSession({
        orderedQuestions: [...questions], answerOrder: choices,
        userAnswers: {}, currentQuizIdx: 0, completed: false,
    });
    loadQuizQuestion();
    applyFilters();
    switchView('quiz');
}

function returnToMainQuiz() {
    if (!mainQuizSession) return;
    applyQuizSession(mainQuizSession);
    mainQuizSession = null;
    reviewMode = null;
    if (quizCompleted) showQuizResult();
    else loadQuizQuestion();
    applyFilters();
    switchView('quiz');
}

function toggleCurrentBookmark() {
    const question = orderedQuestions[currentQuizIdx];
    if (question && !quizCompleted) toggleBookmark(question.id);
}

function updateReviewControls() {
    const wrongCount = getWrongQuestions().length;
    const starredCount = getAllQuestions().filter(question => bookmarks.has(question.id)).length;
    const wrongButton = document.getElementById('review-wrong-btn');
    wrongButton.textContent = `Học các câu sai (${wrongCount})`;
    wrongButton.disabled = wrongCount === 0;
    for (const id of ['review-starred-btn', 'list-review-starred-btn']) {
        const button = document.getElementById(id);
        button.textContent = `Hái sao (${starredCount})`;
        button.disabled = starredCount === 0;
    }
    document.getElementById('return-main-btn').classList.toggle('hidden', !reviewMode);

    const question = orderedQuestions[currentQuizIdx];
    const starred = Boolean(question && bookmarks.has(question.id));
    const bookmarkButton = document.getElementById('quiz-bookmark-btn');
    bookmarkButton.setAttribute('aria-pressed', String(starred));
    bookmarkButton.title = starred ? 'Bỏ gắn sao câu này' : 'Gắn sao câu này để học lại';
    bookmarkButton.innerHTML = `<i class="${starred ? 'fa-solid' : 'fa-regular'} fa-star" aria-hidden="true"></i>`;
}
