// Data State
let quizData = null;
let orderedQuestions = [];
let answerOrder = new Map();
let activeView = "quiz";
let filteredQuestions = [];
let bookmarks = new Set();
let questionRevisions = new Map();

// Quiz View State
let currentQuizIdx = 0;
let quizScore = 0;
let userAnswers = {}; // { questionId: selectedAnswerId }
let quizCompleted = false;

// List View State
let currentPage = 1;
let itemsPerPage = 10;
let showAllAnswers = false;

// Server tự quét thư mục data/; không cần khai báo từng file JSON.
let quizCatalog = [];
let currentQuizPath = '';
let catalogFetchCounter = 0;
let quizFetchCounter = 0;

window.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    document.addEventListener('pointerdown', (event) => {
        if (!document.getElementById('subject-picker').contains(event.target)) closeSubjectDropdown();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeSubjectDropdown();
    });
    refreshSubjects();
});

function bindEvents() {
    document.addEventListener('keydown', handleQuizShortcut);
    const actions = {
        'toggle-subject': () => toggleSubjectDropdown(),
        'open-subject': () => toggleSubjectDropdown(true),
        'refresh-subjects': refreshSubjects,
        'show-quiz': () => switchView('quiz'),
        'show-list': () => switchView('list'),
        'shuffle': shuffleCards,
        'restart': restartQuiz,
        'shuffle-restart': shuffleAndRestart,
        'previous-question': () => navigateQuiz(-1),
        'next-question': () => navigateQuiz(1),
        'toggle-answers': toggleAllAnswers,
    };

    document.querySelectorAll('[data-action]').forEach(button => {
        button.addEventListener('click', actions[button.dataset.action]);
    });
    document.getElementById('subject-search').addEventListener('input', renderSubjectOptions);
    document.getElementById('subject-search').addEventListener('keydown', onSubjectSearchKeydown);
    document.getElementById('filter-search').addEventListener('input', applyFilters);
    document.getElementById('filter-bookmark').addEventListener('change', applyFilters);
    document.getElementById('items-per-page').addEventListener('change', event => {
        changeItemsPerPage(event.target.value);
    });
}

function handleQuizShortcut(event) {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!quizData || activeView !== 'quiz' || quizCompleted) return;
    if (document.getElementById('quiz-view').classList.contains('hidden') ||
        document.getElementById('quiz-active-card').classList.contains('hidden') ||
        !document.getElementById('subject-dropdown').classList.contains('hidden')) return;

    const target = event.target;
    if (target?.isContentEditable || target?.closest('input, textarea, select, [role="textbox"]')) return;
    // Preserve native Enter activation for controls such as Shuffle, Restart and tabs.
    if (event.key === 'Enter' && target?.closest('button, a, [role="button"]') && !target.closest('#quiz-options')) return;

    const answerIndex = ['a', 'b', 'c', 'd'].indexOf(event.key.toLowerCase());
    if (answerIndex >= 0) {
        const question = orderedQuestions[currentQuizIdx];
        if (!question || Object.prototype.hasOwnProperty.call(userAnswers, question.id)) return;
        // Resolve the visible order each time, including after shuffle or storage restore.
        const answer = getOrderedAnswers(question)[answerIndex];
        if (!answer) return;
        event.preventDefault();
        selectQuizAnswer(question.id, answer.id, answer.is_correct);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault();
        navigateQuiz(event.key === 'ArrowLeft' ? -1 : 1);
    }
}

function normalizedText(text) {
    return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function setCatalogNotice(title, message) {
    document.getElementById('catalog-notice-title').textContent = title;
    document.getElementById('catalog-notice-text').textContent = message;
    if (!quizData) showNotice(true);
}

async function getCatalog() {
    // GitHub Actions tạo danh mục này từ toàn bộ data/**/*.json khi deploy.
    const response = await fetch('data/index.json', {cache: 'no-store'});
    if (!response.ok) throw new Error('Không tìm thấy data/index.json; kiểm tra GitHub Actions hoặc chạy npm run build:catalog');
    const data = await response.json();
    const items = Array.isArray(data) ? data : data.quizzes;
    if (!Array.isArray(items)) throw new Error('Danh mục JSON không hợp lệ');
    return items;
}

async function refreshSubjects() {
    const requestId = ++catalogFetchCounter;
    const trigger = document.getElementById('selected-subject-name');
    if (!quizData) setCatalogNotice('Đang tải các bộ đề...', 'Đang tải danh sách môn học đã tạo tự động từ data/.');
    if (!quizData) trigger.textContent = 'Đang tải danh sách môn...';
    try {
        const records = await getCatalog();
        if (requestId !== catalogFetchCounter) return;
        quizCatalog = records.filter(item => item && typeof item.path === 'string' && item.path.startsWith('data/') && item.path.endsWith('.json'))
            .map(item => ({path: item.path, name: String(item.name || item.title || item.path.split('/').pop().replace(/\.json$/i, '')), count: item.count}));
        quizCatalog.sort((a, b) => a.name.localeCompare(b.name, 'vi', {numeric: true}));
        renderSubjectOptions();
        if (!quizCatalog.length) {
            if (!quizData) trigger.textContent = 'Chưa có môn học';
            setCatalogNotice('Chưa có bộ đề nào', 'Hãy thêm JSON hợp lệ vào data/ và push lên GitHub; Actions sẽ tự cập nhật danh sách.');
            return;
        }
        const stillAvailable = quizCatalog.some(item => item.path === currentQuizPath);
        const saved = readStorageItem('beequiz-last-subject');
        const preferred = stillAvailable ? currentQuizPath : (quizCatalog.find(item => item.path === saved)?.path || quizCatalog[0].path);
        if (!stillAvailable || !quizData) await loadSelectedQuiz(preferred);
        else updateSelectedSubject();
    } catch (err) {
        console.error('Không thể quét thư mục data:', err);
        if (!quizData) trigger.textContent = 'Không đọc được thư mục data';
        setCatalogNotice('Không tải được danh sách môn học', 'Chạy npm run build:catalog để thử local hoặc kiểm tra workflow Deploy BeeQuiz trên GitHub Actions.');
    }
}

function updateSelectedSubject() {
    const selected = quizCatalog.find(item => item.path === currentQuizPath);
    document.getElementById('selected-subject-name').textContent = selected?.name || 'Chọn môn học';
}

function toggleSubjectDropdown(forceOpen = false) {
    const dropdown = document.getElementById('subject-dropdown');
    const open = forceOpen || dropdown.classList.contains('hidden');
    if (!open) return closeSubjectDropdown();
    dropdown.classList.remove('hidden');
    document.getElementById('quiz-selector').setAttribute('aria-expanded', 'true');
    const input = document.getElementById('subject-search');
    input.value = '';
    renderSubjectOptions();
    input.focus();
}

function closeSubjectDropdown() {
    document.getElementById('subject-dropdown').classList.add('hidden');
    document.getElementById('quiz-selector').setAttribute('aria-expanded', 'false');
}

function renderSubjectOptions() {
    const search = normalizedText(document.getElementById('subject-search').value.trim());
    const visible = quizCatalog.filter(item => normalizedText(item.name + ' ' + item.path).includes(search));
    const box = document.getElementById('subject-options');
    box.replaceChildren();
    document.getElementById('subject-count').textContent = `${visible.length} / ${quizCatalog.length} bộ đề`;
    document.getElementById('subject-empty').classList.toggle('hidden', visible.length > 0);
    visible.forEach(item => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'subject-option';
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(item.path === currentQuizPath));
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-book text-brand';
        const label = document.createElement('span');
        label.className = 'flex-1 min-w-0';
        label.textContent = item.name;
        const count = document.createElement('span');
        count.className = 'text-muted text-xs whitespace-nowrap';
        count.textContent = Number.isInteger(item.count) ? `${item.count} câu` : '';
        option.append(icon, label, count);
        option.addEventListener('click', () => {closeSubjectDropdown(); loadSelectedQuiz(item.path);});
        box.append(option);
    });
}

function onSubjectSearchKeydown(event) {
    const options = [...document.querySelectorAll('#subject-options .subject-option')];
    if (!options.length) return;
    if (event.key === 'ArrowDown') {event.preventDefault(); options[0].focus();}
    else if (event.key === 'Enter') {event.preventDefault(); options[0].click();}
}
document.addEventListener('keydown', event => {
    if (!event.target.matches('#subject-options .subject-option')) return;
    const options = [...document.querySelectorAll('#subject-options .subject-option')];
    const position = options.indexOf(event.target);
    if (event.key === 'ArrowDown') {event.preventDefault(); options[Math.min(position + 1, options.length - 1)]?.focus();}
    if (event.key === 'ArrowUp') {event.preventDefault(); position ? options[position - 1].focus() : document.getElementById('subject-search').focus();}
});

async function loadSelectedQuiz(filePath) {
    if (!quizCatalog.some(item => item.path === filePath)) return;
    const requestId = ++quizFetchCounter;
    try {
        const response = await fetch(filePath.split('/').map(encodeURIComponent).join('/'), {cache: 'no-store'});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (requestId !== quizFetchCounter) return;
        if (!data || !Array.isArray(data.questionsList) || !data.questionsList.length) throw new Error('Thiếu questionsList hoặc danh sách rỗng');
        saveQuizProgress();
        currentQuizPath = filePath;
        writeStorageItem('beequiz-last-subject', filePath);
        updateSelectedSubject();
        initData(data);
        renderSubjectOptions();
    } catch (err) {
        console.error('Không thể tải bộ đề:', err);
        setCatalogNotice('Không tải được bộ đề', `Lỗi ở ${filePath}: ${err.message}`);
    }
}

// Khởi tạo Dữ liệu
function initData(data) {
    if (!data || !Array.isArray(data.questionsList) || data.questionsList.length === 0) {
        alert("Định dạng dữ liệu JSON không hợp lệ (Thiếu questionsList)!");
        return;
    }

    quizData = data;
    orderedQuestions = [...data.questionsList];
    answerOrder = new Map();
    bookmarks = new Set();
    questionRevisions = new Map(data.questionsList.map(question => [String(question.id), questionRevision(question)]));
    document.getElementById("app-title").textContent = data.name || "Hệ thống trắc nghiệm thông minh";

    // Start with defaults, then restore this subject's saved session.
    currentQuizIdx = 0;
    quizScore = 0;
    userAnswers = {};
    quizCompleted = false;
    activeView = 'quiz';
    const saved = loadStudyProgress(currentQuizPath, data.questionsList, questionRevisions);
    if (saved) {
        orderedQuestions = saved.orderedQuestions;
        answerOrder = saved.answerOrder;
        userAnswers = saved.userAnswers;
        bookmarks = saved.bookmarks;
        currentQuizIdx = saved.currentQuizIdx;
        quizCompleted = saved.completed;
        activeView = saved.activeView;
        // Recompute the score from the current answer key instead of trusting saved totals.
        quizScore = orderedQuestions.filter(question =>
            Object.prototype.hasOwnProperty.call(userAnswers, question.id) &&
            question.answersList.some(answer => answer.id === userAnswers[question.id] && answer.is_correct)
        ).length;
    }

    // Render cả 2 giao diện
    if (quizCompleted) showQuizResult();
    else loadQuizQuestion();
    applyFilters();
    showNotice(false);
}

function saveQuizProgress() {
    if (!quizData || !currentQuizPath) return;
    saveStudyProgress(currentQuizPath, {
        questionIds: orderedQuestions.map(question => question.id),
        questionRevisions: [...questionRevisions],
        answerOrder: [...answerOrder].map(([id, answers]) => [id, answers.map(answer => answer.id)]),
        userAnswers: Object.entries(userAnswers),
        bookmarks: [...bookmarks],
        currentQuestionId: orderedQuestions[currentQuizIdx]?.id,
        completed: quizCompleted,
        activeView,
    });
}

function showNotice(show) {
    const notice = document.getElementById("no-data-notice");
    const quizView = document.getElementById("quiz-view");
    const listView = document.getElementById("list-view");

    if (show) {
        notice.classList.remove("hidden");
        quizView.classList.add("hidden");
        listView.classList.add("hidden");
    } else {
        notice.classList.add("hidden");
        switchView(activeView);
    }
}

// Chuyển Tab Giao diện
function switchView(view) {
    if (!quizData) return;
    activeView = view;

    const tabQuiz = document.getElementById("tab-quiz");
    const tabList = document.getElementById("tab-list");
    const quizView = document.getElementById("quiz-view");
    const listView = document.getElementById("list-view");

    if (view === 'quiz') {
        tabQuiz.className = "px-3 py-1.5 rounded-md transition bg-brand text-white shadow";
        tabList.className = "px-3 py-1.5 rounded-md transition text-sky hover:text-white";
        quizView.classList.remove("hidden");
        listView.classList.add("hidden");
    } else {
        tabList.className = "px-3 py-1.5 rounded-md transition bg-brand text-white shadow";
        tabQuiz.className = "px-3 py-1.5 rounded-md transition text-sky hover:text-white";
        listView.classList.remove("hidden");
        quizView.classList.add("hidden");
    }
    saveQuizProgress();
}

/* ==================== QUIZ VIEW LOGIC ==================== */
function loadQuizQuestion() {
    if (!quizData || !orderedQuestions.length) return;
    quizCompleted = false;

    const total = orderedQuestions.length;
    const q = orderedQuestions[currentQuizIdx];

    document.getElementById("quiz-active-card").classList.remove("hidden");
    document.getElementById("quiz-result-card").classList.add("hidden");

    // UI Progress
    document.getElementById("quiz-progress-text").textContent = `Câu ${currentQuizIdx + 1} / ${total}`;
    document.getElementById("quiz-score-badge").textContent = `Điểm: ${quizScore}`;
    document.getElementById("quiz-progress-bar").style.width = `${((currentQuizIdx + 1) / total) * 100}%`;

    // Content
    document.getElementById("quiz-question-title").textContent = q.content;

    // Options
    const optionsBox = document.getElementById("quiz-options");
    optionsBox.innerHTML = "";

    const hasAnswered = Object.prototype.hasOwnProperty.call(userAnswers, q.id);
    const selectedAnsId = userAnswers[q.id];

    getOrderedAnswers(q).forEach((ans, index) => {
        const btn = document.createElement("button");
        const label = String.fromCharCode(65 + index);
        btn.type = 'button';
        if (index < 4) btn.setAttribute('aria-keyshortcuts', label);
        btn.className = "w-full text-left p-4 rounded-xl border transition flex items-start gap-3 font-medium text-sm text-ink ";

        if (!hasAnswered) {
            btn.className += "border-pale hover:bg-softcream hover:border-pale";
            btn.onclick = () => selectQuizAnswer(q.id, ans.id, ans.is_correct);
        } else {
            btn.disabled = true;
            if (ans.is_correct) {
                btn.className += "bg-sky-soft border-brand text-brand";
            } else if (ans.id === selectedAnsId && !ans.is_correct) {
                btn.className += "bg-pink-soft border-pink text-pink-dark";
            } else {
                btn.className += "border-pale opacity-60";
            }
        }

        btn.innerHTML = `
            <span class="w-6 h-6 rounded-full border flex items-center justify-center shrink-0 text-xs font-bold mt-0.5 ${hasAnswered && ans.is_correct ? 'bg-brand text-white border-emerald-600' : (hasAnswered && ans.id === selectedAnsId ? 'bg-pink text-white border-rose-600' : 'border-pale bg-white')}">
                ${label}
            </span>
            <span class="flex-grow leading-relaxed">${ans.content}</span>
            ${hasAnswered && ans.is_correct ? '<span aria-label="Đáp án đúng">✓</span>' : (hasAnswered && ans.id === selectedAnsId ? '<span aria-label="Đáp án sai">✕</span>' : '')}
        `;
        optionsBox.appendChild(btn);
    });

    // Explanation
    const expBox = document.getElementById("quiz-explanation-box");
    if (hasAnswered) {
        expBox.classList.remove("hidden");
        document.getElementById("quiz-explanation-text").textContent = q.explanation || "Không có giải thích chi tiết.";
    } else {
        expBox.classList.add("hidden");
    }

    // Buttons
    document.getElementById("quiz-prev-btn").disabled = currentQuizIdx === 0;
    const nextBtn = document.getElementById("quiz-next-btn");
    if (currentQuizIdx === total - 1) {
        nextBtn.innerHTML = `Hoàn thành <i class="fa-solid fa-check ml-1"></i>`;
    } else {
        nextBtn.innerHTML = `Câu tiếp theo <i class="fa-solid fa-arrow-right ml-1"></i>`;
    }
}

function selectQuizAnswer(questionId, answerId, isCorrect) {
    if (Object.prototype.hasOwnProperty.call(userAnswers, questionId)) return;
    userAnswers[questionId] = answerId;
    if (isCorrect) quizScore++;
    loadQuizQuestion();
    saveQuizProgress();
}

function showQuizResult() {
    document.getElementById("quiz-active-card").classList.add("hidden");
    document.getElementById("quiz-result-card").classList.remove("hidden");
    const total = orderedQuestions.length;
    document.getElementById("quiz-result-summary").textContent = `Bạn đã hoàn thành đúng ${quizScore} / ${total} câu hỏi (${Math.round((quizScore / total) * 100)}%).`;
}

function navigateQuiz(step) {
    const total = orderedQuestions.length;
    if (currentQuizIdx + step >= total) {
        quizCompleted = true;
        showQuizResult();
        saveQuizProgress();
        return;
    }
    currentQuizIdx = Math.max(0, currentQuizIdx + step);
    loadQuizQuestion();
    saveQuizProgress();
}

function restartQuiz() {
    currentQuizIdx = 0;
    quizScore = 0;
    userAnswers = {};
    quizCompleted = false;
    loadQuizQuestion();
    saveQuizProgress();
}

// Fisher–Yates returns a new array without mutating the source data.
function fisherYates(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function getOrderedAnswers(question) {
    return answerOrder.get(String(question.id)) || question.answersList;
}

function shuffleCards() {
    if (!quizData || orderedQuestions.length === 0) return;
    const hasAnswered = q => Object.prototype.hasOwnProperty.call(userAnswers, q.id);
    const unanswered = orderedQuestions.filter(q => !hasAnswered(q));
    const status = document.getElementById('shuffle-status');
    if (unanswered.length === 0) {
        status.textContent = 'Bạn đã trả lời tất cả câu hỏi. Chọn Làm lại để bắt đầu lượt mới.';
        return;
    }

    const shuffled = fisherYates(unanswered);
    if (unanswered.length > 1 && shuffled.every((q, index) => q === unanswered[index])) {
        // Rotate only unanswered cards if the random order is unchanged.
        shuffled.push(shuffled.shift());
    }
    let nextUnanswered = 0;
    // Keep answered cards in their slots, including any skipped questions between them.
    orderedQuestions = orderedQuestions.map(q => hasAnswered(q) ? q : shuffled[nextUnanswered++]);
    unanswered.forEach(q => {
        answerOrder.set(String(q.id), fisherYates(getOrderedAnswers(q)));
    });
    // Keep the current position and score; answered cards retain their choice order.
    loadQuizQuestion();
    applyFilters();
    status.textContent = `Đã trộn ${unanswered.length} câu chưa chọn đáp án. Tiến độ và các câu đã trả lời được giữ nguyên.`;
    saveQuizProgress();
}

function shuffleAndRestart() {
    restartQuiz();
    shuffleCards();
}

/* ==================== LIST VIEW & FILTER LOGIC ==================== */
function applyFilters() {
    if (!quizData) return;

    const searchQuery = document.getElementById("filter-search").value.toLowerCase().trim();
    const bookmarkFilter = document.getElementById("filter-bookmark").value;

    filteredQuestions = orderedQuestions.filter(q => {
        // Search filter
        const matchesSearch = q.content.toLowerCase().includes(searchQuery) ||
            q.answersList.some(a => a.content.toLowerCase().includes(searchQuery));

        // Bookmark filter
        const matchesBookmark = bookmarkFilter === 'all' || (bookmarkFilter === 'starred' && bookmarks.has(q.id));

        return matchesSearch && matchesBookmark;
    });

    currentPage = 1;
    renderQuestionList();
}

function renderQuestionList() {
    const container = document.getElementById("questions-list-container");
    container.innerHTML = "";

    const total = filteredQuestions.length;
    document.getElementById("filtered-count-text").textContent = `Hiển thị ${total} / ${orderedQuestions.length} câu hỏi`;
    document.getElementById("list-count").textContent = orderedQuestions.length;

    if (total === 0) {
        container.innerHTML = `
            <div class="bg-white rounded-xl p-8 text-center text-muted-light border border-pale">
                <i class="fa-solid fa-magnifying-glass-minus text-3xl mb-2"></i>
                <p>Không tìm thấy câu hỏi nào phù hợp với bộ lọc.</p>
            </div>`;
        document.getElementById("pagination-container").innerHTML = "";
        return;
    }

    // Pagination slice
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, total);
    const pageQuestions = filteredQuestions.slice(startIdx, endIdx);

    pageQuestions.forEach((q, index) => {
        const globalIndex = startIdx + index + 1;
        const isStarred = bookmarks.has(q.id);

        const card = document.createElement("div");
        card.className = "bg-white rounded-2xl shadow-sm border border-pale p-5 transition hover:shadow-md";

        card.innerHTML = `
            <div class="flex justify-between items-start gap-3 mb-3">
                <span class="bg-sky-soft text-brand font-semibold text-xs px-2.5 py-1 rounded-lg">Câu ${globalIndex}</span>
                <button class="bookmark-btn text-muted-light hover:text-pink text-lg transition ${isStarred ? 'text-pink' : ''}" title="Đánh dấu câu hỏi này">
                    <i class="${isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
                </button>
            </div>

            <h3 class="font-medium text-ink leading-relaxed mb-4 text-sm md:text-base">${q.content}</h3>

            <!-- Choices -->
            <div class="space-y-2 mb-3">
                ${getOrderedAnswers(q).map(a => `
                    <div class="p-3 rounded-xl text-sm flex items-start gap-2.5 border ${a.is_correct && showAllAnswers ? 'bg-sky-soft border-sky text-brand font-medium' : 'bg-softcream border-pale text-ink'}">
                        <span class="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs mt-0.5 ${a.is_correct && showAllAnswers ? 'bg-brand text-white' : 'border border-pale bg-white'}">
                            ${a.is_correct && showAllAnswers ? '✓' : ''}
                        </span>
                        <span>${a.content}</span>
                    </div>
                `).join('')}
            </div>

            <!-- Single Answer Accordion -->
            <div class="border-t border-pale pt-3 flex justify-between items-center text-xs">
                <span class="text-brand font-semibold">${showAllAnswers ? (q.explanation || 'Đáp án đúng đã được đánh dấu màu xanh') : ''}</span>
                <button class="single-answer-btn text-brand hover:text-brand font-medium flex items-center gap-1">
                    <span>${showAllAnswers ? 'Ẩn đáp án' : 'Xem đáp án'}</span>
                    <i class="fa-solid fa-chevron-down text-[10px]"></i>
                </button>
            </div>
            <div class="single-explanation hidden mt-3 p-3 bg-sky-soft/50 rounded-xl text-xs text-brand border border-sky">
                <strong>Đáp án chính xác:</strong> ${q.answersList.find(a => a.is_correct)?.content || ''}
                <br><span class="text-muted mt-1 block">${q.explanation || ''}</span>
            </div>
        `;

        card.querySelector('.bookmark-btn').onclick = () => toggleBookmark(q.id);
        const answerButton = card.querySelector('.single-answer-btn');
        answerButton.addEventListener('click', () => toggleSingleAnswer(answerButton));
        container.appendChild(card);
    });

    renderPagination(total);
}

function toggleBookmark(qId) {
    if (bookmarks.has(qId)) {
        bookmarks.delete(qId);
    } else {
        bookmarks.add(qId);
    }
    renderQuestionList();
    saveQuizProgress();
}

function toggleAllAnswers() {
    showAllAnswers = !showAllAnswers;
    const btnText = document.getElementById("toggle-all-text");
    btnText.textContent = showAllAnswers ? "Ẩn tất cả đáp án" : "Hiện tất cả đáp án";
    renderQuestionList();
}

function toggleSingleAnswer(btn) {
    const card = btn.closest('.bg-white');
    const expBox = card.querySelector('.single-explanation');
    const isHidden = expBox.classList.contains('hidden');

    if (isHidden) {
        expBox.classList.remove('hidden');
        btn.querySelector('span').textContent = 'Ẩn đáp án';
    } else {
        expBox.classList.add('hidden');
        btn.querySelector('span').textContent = 'Xem đáp án';
    }
}

function changeItemsPerPage(val) {
    itemsPerPage = parseInt(val);
    currentPage = 1;
    renderQuestionList();
}

function renderPagination(totalItems) {
    const container = document.getElementById("pagination-container");
    container.innerHTML = "";

    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) return;

    // Prev Button
    const prevBtn = document.createElement("button");
    prevBtn.className = "px-3 py-1.5 rounded-lg border text-xs font-medium bg-white text-muted hover:bg-softcream disabled:opacity-40";
    prevBtn.disabled = currentPage === 1;
    prevBtn.innerHTML = `<i class="fa-solid fa-chevron-left"></i>`;
    prevBtn.onclick = () => {currentPage--; renderQuestionList();};
    container.appendChild(prevBtn);

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            const pageBtn = document.createElement("button");
            pageBtn.className = `px-3 py-1.5 rounded-lg text-xs font-medium border ${i === currentPage ? 'bg-brand text-white border-brand' : 'bg-white text-muted hover:bg-softcream'}`;
            pageBtn.textContent = i;
            pageBtn.onclick = () => {currentPage = i; renderQuestionList();};
            container.appendChild(pageBtn);
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            const dots = document.createElement("span");
            dots.className = "text-muted-light text-xs px-1";
            dots.textContent = "...";
            container.appendChild(dots);
        }
    }

    // Next Button
    const nextBtn = document.createElement("button");
    nextBtn.className = "px-3 py-1.5 rounded-lg border text-xs font-medium bg-white text-muted hover:bg-softcream disabled:opacity-40";
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.innerHTML = `<i class="fa-solid fa-chevron-right"></i>`;
    nextBtn.onclick = () => {currentPage++; renderQuestionList();};
    container.appendChild(nextBtn);
}
