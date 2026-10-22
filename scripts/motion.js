const uiAnimations = new WeakMap();

// Animation never delays rendering, interaction or saving study progress.
function runUiMotion(element, keyframes, options = {}) {
    if (!element?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    uiAnimations.get(element)?.cancel();
    const animation = element.animate(keyframes, {
        duration: 240,
        easing: 'cubic-bezier(.22, 1, .36, 1)',
        ...options,
    });
    uiAnimations.set(element, animation);
    animation.finished.then(() => {
        if (uiAnimations.get(element) === animation) uiAnimations.delete(element);
    }).catch(() => {});
}

function animateQuestion(direction) {
    if (!direction) return;
    const offset = Math.sign(direction) * 14;
    const frames = [
        { opacity: 0, transform: `translateX(${offset}px)` },
        { opacity: 1, transform: 'translateX(0)' },
    ];
    runUiMotion(document.getElementById('quiz-question-title'), frames);
    runUiMotion(document.getElementById('quiz-options'), frames, { duration: 280 });
}

function animateAnswer(question, answerId, isCorrect) {
    const index = getOrderedAnswers(question).findIndex(answer => answer.id === answerId);
    const button = document.getElementById('quiz-options').children[index];
    runUiMotion(button, isCorrect ? [
        { transform: 'scale(1)' }, { transform: 'scale(1.015)' }, { transform: 'scale(1)' },
    ] : [
        { transform: 'translateX(0)' }, { transform: 'translateX(-3px)' },
        { transform: 'translateX(3px)' }, { transform: 'translateX(0)' },
    ], { duration: 280 });
    runUiMotion(document.getElementById('quiz-explanation-box'), [
        { opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' },
    ]);
    if (isCorrect) runUiMotion(document.getElementById('quiz-score-badge'), [
        { transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' },
    ], { duration: 300 });
}
