const STUDY_PROGRESS_VERSION = 1;

function readStorageItem(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorageItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

// A compact revision lets us discard old answers when a question's content changes.
function questionRevision(question) {
    const content = JSON.stringify([
        question.content,
        question.answersList.map(answer => [answer.id, answer.content, answer.is_correct]),
        question.explanation,
    ]);
    let hash = 2166136261;
    for (let i = 0; i < content.length; i++) {
        hash = Math.imul(hash ^ content.charCodeAt(i), 16777619);
    }
    return (hash >>> 0).toString(16);
}

function saveStudyProgress(path, progress) {
    return writeStorageItem(`beequiz-progress:${path}`, JSON.stringify({
        ...progress,
        version: STUDY_PROGRESS_VERSION,
    }));
}

function restoreItemOrder(ids, items) {
    const remaining = new Map(items.map(item => [String(item.id), item]));
    const ordered = [];
    for (const id of Array.isArray(ids) ? ids : []) {
        const item = remaining.get(String(id));
        if (!item) continue;
        ordered.push(item);
        remaining.delete(String(id));
    }
    return [...ordered, ...remaining.values()];
}

function isMultiAnswerQuestion(question) {
    return question.answersList.filter(answer => answer.is_correct).length > 1;
}

function getQuestionAnswerState(question, answerValue) {
    const value = arguments.length > 1
        ? answerValue
        : (typeof userAnswers === 'undefined' ? undefined : userAnswers[question.id]);
    const answerIds = new Set(question.answersList.map(answer => answer.id));
    const isRecord = value && typeof value === 'object' && !Array.isArray(value);
    const rawSelected = isRecord
        ? (Array.isArray(value.selectedAnswerIds) ? value.selectedAnswerIds : [])
        : (value === undefined || value === null ? [] : [value]);
    const selectedAnswerIds = [...new Set(rawSelected.filter(id => answerIds.has(id)))];
    const correctIds = question.answersList.filter(answer => answer.is_correct).map(answer => answer.id);
    const hasWrongSelection = selectedAnswerIds.some(id => !correctIds.includes(id));

    let status = 'unanswered';
    if (selectedAnswerIds.length) {
        if (isMultiAnswerQuestion(question)) {
            if ((isRecord && value.status === 'wrong') || hasWrongSelection) {
                status = 'wrong';
            } else if (correctIds.every(id => selectedAnswerIds.includes(id))) {
                status = 'correct';
            } else {
                status = 'in-progress';
            }
        } else {
            status = hasWrongSelection ? 'wrong' : 'correct';
        }
    }

    return {
        selectedAnswerIds,
        status,
        resolved: status === 'correct' || status === 'wrong',
        correct: status === 'correct',
        wrong: status === 'wrong',
    };
}

function restoreStoredSession(saved, questions, revisions, previousRevisions) {
    const previousAnswers = new Map(saved.userAnswers);
    const previousOrder = new Map(saved.answerOrder);
    const orderedQuestions = restoreItemOrder(saved.questionIds, questions);
    const answerOrder = new Map();
    const validAnswers = [];
    for (const question of orderedQuestions) {
        const id = String(question.id);
        if (previousRevisions.get(id) !== revisions.get(id)) continue;
        const savedAnswer = previousAnswers.get(id);
        const answerState = getQuestionAnswerState(question, savedAnswer);
        if (answerState.selectedAnswerIds.length) {
            if (isMultiAnswerQuestion(question)) {
                validAnswers.push([id, {
                    selectedAnswerIds: answerState.selectedAnswerIds,
                    status: answerState.status,
                }]);
            } else {
                validAnswers.push([id, answerState.selectedAnswerIds[0]]);
            }
        }
        if (Array.isArray(previousOrder.get(id))) {
            answerOrder.set(id, restoreItemOrder(previousOrder.get(id), question.answersList));
        }
    }

    const sameQuestions = new Set(saved.questionIds.map(String)).size === questions.length &&
        questions.every(question => previousRevisions.get(String(question.id)) === revisions.get(String(question.id)));
    return {
        orderedQuestions,
        answerOrder,
        userAnswers: Object.fromEntries(validAnswers),
        currentQuizIdx: Math.max(0, orderedQuestions.findIndex(question => question.id === saved.currentQuestionId)),
        completed: saved.completed === true && sameQuestions,
    };
}

function loadStudyProgress(path, questions, revisions) {
    try {
        const saved = JSON.parse(readStorageItem(`beequiz-progress:${path}`));
        if (!saved || saved.version !== STUDY_PROGRESS_VERSION || !Array.isArray(saved.questionIds)) return null;

        const previousRevisions = new Map(saved.questionRevisions);
        const main = restoreStoredSession(saved, questions, revisions, previousRevisions);
        let review = null;
        if (saved.review && ['wrong', 'starred'].includes(saved.review.mode) && Array.isArray(saved.review.questionIds)) {
            const reviewIds = new Set(saved.review.questionIds.map(String));
            const reviewQuestions = questions.filter(question => reviewIds.has(String(question.id)));
            if (reviewQuestions.length) {
                try {
                    review = { ...restoreStoredSession(saved.review, reviewQuestions, revisions, previousRevisions), mode: saved.review.mode };
                } catch {
                    // A damaged review must not discard the main session.
                }
            }
        }
        const bookmarkIds = new Set(Array.isArray(saved.bookmarks) ? saved.bookmarks.map(String) : []);
        return {
            ...main,
            bookmarks: new Set(questions.filter(question => bookmarkIds.has(String(question.id))).map(question => question.id)),
            activeView: saved.activeView === 'list' ? 'list' : 'quiz',
            review,
        };
    } catch {
        // Invalid JSON, unsupported storage or a malformed snapshot starts a fresh session.
        return null;
    }
}
