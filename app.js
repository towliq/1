const storageKey = 'nova-notes-state-v3';
const blankState = { users: [{ id: 'me', name: 'Я', color: '#1677ff' }], activeUserId: 'me', notes: [], tasks: [], collections: [], theme: 'light' };
const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const shortMonths = ['янв.', 'февр.', 'март', 'апр.', 'май', 'июнь', 'июль', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];

let state = loadState();
let currentView = 'overview';
let selectedTag = 'personal';
let activeFilter = 'all';
let overviewScope = 'personal';
let notesScope = 'personal';
let plannerScope = 'personal';
let modalScope = 'personal';
let searchQuery = '';
let editingNoteId = null;
let editingTaskId = null;
let selectedDateKey = dateKey(new Date());
let calendarCursor = new Date();
let calendarMode = 'month';
let toastTimer;

function $(selector) { return document.querySelector(selector); }
function $$(selector) { return [...document.querySelectorAll(selector)]; }
function normalizeScope(record = {}) {
  const raw = record.scope ?? record.visibility ?? record.shared ?? record.isShared;
  if (raw === true || raw === 'shared' || raw === 'common' || raw === 'общая' || raw === 'общее') return 'shared';
  return 'personal';
}
function recordScope(record) { return normalizeScope(record); }
function recordAuthorId(record, fallback) { return record.authorId || record.userId || record.createdBy || fallback; }
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const users = Array.isArray(saved.users) && saved.users.length ? saved.users : blankState.users;
    const activeUserId = users.some(user => user.id === saved.activeUserId) ? saved.activeUserId : users[0].id;
    const notes = Array.isArray(saved.notes) ? saved.notes.map(note => ({ ...note, authorId: recordAuthorId(note, activeUserId), scope: normalizeScope(note) })) : [];
    const tasks = Array.isArray(saved.tasks) ? saved.tasks.map(task => ({ ...task, authorId: recordAuthorId(task, activeUserId), scope: normalizeScope(task) })) : [];
    return { ...blankState, ...saved, users, activeUserId, notes, tasks, collections: Array.isArray(saved.collections) ? saved.collections : [] };
  } catch { return { ...blankState }; }
}
function saveState() { localStorage.setItem(storageKey, JSON.stringify(state)); }
function dateKey(value) { const date = value instanceof Date ? value : new Date(value); const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }
function dateFromKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
function todayKey() { return dateKey(new Date()); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function tagLabel(tag) { return ({ personal: 'Личное', work: 'Работа', ideas: 'Идеи' })[tag] || 'Личное'; }
function colorForTag(tag) { return ({ personal: 'orange', work: 'blue', ideas: 'purple' })[tag] || 'orange'; }
function formatLongDate(value) { return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(value); }
function formatShortDate(value) { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(value).replace(' г.', ''); }
function formatTime(value) { return value || 'Без времени'; }
function plural(n, one, few, many) { const m = n % 100; if (m >= 11 && m <= 14) return many; const x = n % 10; return x === 1 ? one : x >= 2 && x <= 4 ? few : many; }
function activeUser() { return state.users.find(user => user.id === state.activeUserId) || state.users[0]; }
function userName(id) { return state.users.find(user => user.id === id)?.name || 'Неизвестный'; }
function initials(name) { return String(name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(); }
function visibleRecords(records, scope) {
  const targetScope = scope === 'shared' ? 'shared' : 'personal';
  return records.filter(record => recordScope(record) === targetScope && (targetScope === 'shared' || recordAuthorId(record, '') === state.activeUserId));
}
function visibleNotes(scope = notesScope) { return visibleRecords(state.notes, scope); }
function visibleTasks(scope = plannerScope) { return visibleRecords(state.tasks, scope); }
function setWorkspaceScope(scope) {
  const nextScope = scope === 'shared' ? 'shared' : 'personal';
  overviewScope = nextScope;
  notesScope = nextScope;
  plannerScope = nextScope;
  return nextScope;
}
function setScopeButtons(scope, context) { const root = context === 'notes' ? '#notes-view' : context === 'planner' ? '#planner-view' : '#overview-view'; $(`${root} .scope-button`).forEach(button => button.classList.toggle('active', button.dataset.scope === scope)); }

function renderShell() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const user = activeUser();
  const hasContent = visibleNotes(overviewScope).length || visibleTasks(overviewScope).length;
  $('#overview-date').textContent = formatLongDate(now).toUpperCase();
  $('#overview-title').textContent = hasContent ? `${greeting}, ${user.name}` : `Добро пожаловать, ${user.name}`;
  $('#overview-copy').textContent = overviewScope === 'shared' ? 'Общие записи и планы вашей команды.' : 'Ваше личное пространство для мыслей и планов.';
  $('#notes-count').textContent = visibleNotes(notesScope).length || '';
  $('#planner-count').textContent = visibleTasks(plannerScope).length || '';
  $('#today-count').textContent = visibleTasks(overviewScope).filter(task => task.dateKey === todayKey() && !task.done).length || '';
  $('#user-avatar').textContent = initials(user.name);
  $('#user-avatar').style.background = user.color || '';
  $('#sync-state').classList.toggle('has-data', Boolean(state.notes.length || state.tasks.length));
  $('#sync-state span').textContent = state.notes.length || state.tasks.length ? `Пишет ${user.name}` : 'Локально';
  setScopeButtons(overviewScope, 'overview'); setScopeButtons(notesScope, 'notes'); setScopeButtons(plannerScope, 'planner');
  renderCollections();
}

function taskRow(task, compact = false) {
  const author = task.scope === 'shared' ? ` · ${userName(task.authorId)}` : '';
  return `<div class="task-row ${task.done ? 'done' : ''} ${compact ? 'compact-task' : ''}" data-task-id="${task.id}">
    <button class="task-check ${task.done ? 'done' : ''}" data-action="toggle-task" data-task-id="${task.id}" aria-label="${task.done ? 'Вернуть задачу' : 'Завершить задачу'}"></button>
    <span class="task-row-main"><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(formatTime(task.time))}${escapeHtml(author)}</small></span>
    <button class="task-edit" data-action="edit-task" data-task-id="${task.id}" aria-label="Редактировать задачу" title="Редактировать задачу">•••</button>
  </div>`;
}

function renderTasks() {
  const todayTasks = visibleTasks(overviewScope).filter(task => task.dateKey === todayKey()).sort((a, b) => Number(a.done) - Number(b.done) || (a.time || '').localeCompare(b.time || ''));
  $('#task-list').innerHTML = todayTasks.map(task => taskRow(task)).join('');
  $('#task-empty').classList.toggle('hidden', todayTasks.length > 0);
  const done = todayTasks.filter(task => task.done).length;
  $('#focus-title').textContent = todayTasks.length ? `Фокус · ${done}/${todayTasks.length}` : 'Фокус';
  $('#focus-title').classList.toggle('has-progress', todayTasks.length > 0);
  $('#day-title').textContent = formatShortDate(new Date());
  $('#day-summary').textContent = todayTasks.length ? `${todayTasks.length} ${plural(todayTasks.length, 'задача', 'задачи', 'задач')} на сегодня${done ? ` · ${done} завершено` : ''}.` : (overviewScope === 'shared' ? 'Общих планов на сегодня пока нет.' : 'Личных планов на сегодня пока нет.');
}

function noteCard(note) {
  const author = recordScope(note) === 'shared' ? `<span class="note-author">${escapeHtml(userName(note.authorId))}</span>` : '';
  return `<article class="note-card ${note.color || colorForTag(note.tag)}" data-note-id="${note.id}">
    <div class="note-card-head"><span class="note-tag">${tagLabel(note.tag)}</span><span class="note-card-author">${author}</span><button class="favorite-button ${note.favorite ? 'active' : ''}" data-action="toggle-favorite" data-note-id="${note.id}" aria-label="${note.favorite ? 'Убрать из избранного' : 'Добавить в избранное'}">${note.favorite ? '★' : '☆'}</button></div>
    <h3>${escapeHtml(note.title || 'Без названия')}</h3><p>${escapeHtml(note.body || '')}</p><footer><span>${escapeHtml(note.dateLabel || formatShortDate(new Date(note.updatedAt || Date.now())))}</span><button class="note-edit" data-action="edit-note" data-note-id="${note.id}" aria-label="Редактировать заметку" title="Редактировать заметку">↗</button></footer>
  </article>`;
}

function recentRow(note) { const author = recordScope(note) === 'shared' ? ` · ${userName(note.authorId)}` : ''; return `<button class="recent-row" data-action="edit-note" data-note-id="${note.id}"><span class="recent-mark ${note.color || colorForTag(note.tag)}"></span><span class="recent-copy"><strong>${escapeHtml(note.title || 'Без названия')}</strong><small>${escapeHtml(note.body || '')}</small></span><span class="recent-date">${escapeHtml(note.dateLabel || formatShortDate(new Date(note.updatedAt || Date.now())))}${escapeHtml(author)}</span></button>`; }

function renderNotes() {
  const query = (searchQuery || $('#notes-search')?.value || '').trim().toLowerCase();
  const filtered = visibleNotes(notesScope).filter(note => { const matchesQuery = !query || `${note.title} ${note.body} ${userName(note.authorId)}`.toLowerCase().includes(query); const matchesFilter = activeFilter === 'all' || (activeFilter === 'favorite' ? note.favorite : note.tag === activeFilter); return matchesQuery && matchesFilter; }).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  $('#notes-grid').innerHTML = filtered.map(noteCard).join('');
  $('#notes-grid').classList.toggle('hidden', filtered.length === 0);
  $('#notes-empty').classList.toggle('hidden', filtered.length > 0);
  const allVisible = visibleNotes(notesScope);
  $('#notes-meta').textContent = allVisible.length ? `${allVisible.length} ${plural(allVisible.length, 'заметка', 'заметки', 'заметок')}` : '0 заметок';
  $('#notes-view').querySelector('.empty-state h2').textContent = allVisible.length && (query || activeFilter !== 'all') ? 'Ничего не найдено' : 'Пока пусто';
  $('#notes-view').querySelector('.empty-state p').textContent = allVisible.length && (query || activeFilter !== 'all') ? 'Попробуйте изменить запрос или фильтр.' : (notesScope === 'shared' ? 'Общих заметок пока нет.' : 'Создайте первую заметку — она появится здесь.');
  const recent = visibleNotes(overviewScope).slice().sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 4);
  $('#recent-list').innerHTML = recent.map(recentRow).join('');
  $('#recent-list').classList.toggle('hidden', recent.length === 0);
  $('#recent-empty').classList.toggle('hidden', recent.length > 0);
  $('#recent-title').textContent = recent.length ? 'Недавние заметки' : 'Заметки';
}

function renderCollections() {
  const collections = state.collections || [];
  $('#collections').innerHTML = collections.map(item => `<button class="index-item collection-item" data-collection="${escapeHtml(item)}"><span class="collection-dot"></span><span>${escapeHtml(item)}</span></button>`).join('');
  $('#collections-empty').classList.toggle('hidden', collections.length > 0);
}

function renderPlanner() {
  const cursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
  $('#month-label').textContent = `${monthNames[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const plannerTasks = visibleTasks(plannerScope);
  const plannerNotes = visibleNotes(notesScope);
  $('#planner-meta').textContent = `${plannerTasks.length} ${plural(plannerTasks.length, 'задача', 'задачи', 'задач')} · ${plannerNotes.length} ${plural(plannerNotes.length, 'заметка', 'заметки', 'заметок')}`;
  const calendar = $('#planner-calendar');
  calendar.classList.toggle('week-mode', calendarMode === 'week');
  if (calendarMode === 'week') renderWeekCalendar(calendar); else renderMonthCalendar(calendar, cursor);
  renderSelectedDay();
}

function calendarDayCell(key, muted = false) {
  const date = dateFromKey(key); const count = visibleTasks(plannerScope).filter(task => task.dateKey === key).length; const selected = selectedDateKey === key; const today = key === todayKey();
  return `<button class="planner-day ${muted ? 'muted' : ''} ${selected ? 'selected' : ''} ${today ? 'today' : ''}" data-calendar-date="${key}"><span>${date.getDate()}</span>${count ? `<i>${count}</i>` : ''}</button>`;
}

function renderMonthCalendar(calendar, cursor) {
  const firstDay = (cursor.getDay() + 6) % 7; const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate(); const daysPrev = new Date(cursor.getFullYear(), cursor.getMonth(), 0).getDate();
  const cells = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => `<div class="planner-weekday">${day}</div>`);
  for (let i = firstDay - 1; i >= 0; i--) cells.push(calendarDayCell(dateKey(new Date(cursor.getFullYear(), cursor.getMonth() - 1, daysPrev - i)), true));
  for (let day = 1; day <= daysInMonth; day++) cells.push(calendarDayCell(dateKey(new Date(cursor.getFullYear(), cursor.getMonth(), day))));
  const total = Math.ceil(cells.length / 7) * 7; for (let i = 1; cells.length < total; i++) cells.push(calendarDayCell(dateKey(new Date(cursor.getFullYear(), cursor.getMonth() + 1, i)), true));
  calendar.innerHTML = cells.join('');
}

function renderWeekCalendar(calendar) {
  const selected = dateFromKey(selectedDateKey); const start = new Date(selected); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); const cells = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => `<div class="planner-weekday">${day}</div>`);
  for (let i = 0; i < 7; i++) { const date = new Date(start); date.setDate(start.getDate() + i); cells.push(calendarDayCell(dateKey(date))); }
  calendar.innerHTML = cells.join('');
}

function renderSelectedDay() {
  const selected = dateFromKey(selectedDateKey); const tasks = visibleTasks(plannerScope).filter(task => task.dateKey === selectedDateKey).sort((a, b) => Number(a.done) - Number(b.done));
  $('#selected-day-kicker').textContent = formatLongDate(selected).toUpperCase();
  $('#selected-day-title').textContent = `${selected.getDate()} ${shortMonths[selected.getMonth()]}`;
  $('#selected-task-list').innerHTML = tasks.map(task => taskRow(task, true)).join('');
  $('#selected-task-list').classList.toggle('hidden', tasks.length === 0);
  $('#selected-task-empty').classList.toggle('hidden', tasks.length > 0);
}

function renderAll() { renderShell(); renderTasks(); renderNotes(); renderPlanner(); }

function switchView(view) {
  currentView = view;
  $$('.view').forEach(section => section.classList.toggle('active', section.id === `${view}-view`));
  $$('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  if (view === 'notes') renderNotes(); if (view === 'planner') renderPlanner();
  $('.workspace').classList.remove('view-pulse'); void $('.workspace').offsetWidth; $('.workspace').classList.add('view-pulse');
}

function openNoteEditor(id = null) {
  editingNoteId = id; const note = state.notes.find(item => String(item.id) === String(id));
  modalScope = note ? recordScope(note) : (currentView === 'notes' ? notesScope : overviewScope);
  $('#note-modal').classList.remove('hidden'); $('#note-modal-kicker').textContent = note ? 'РЕДАКТИРОВАНИЕ' : 'НОВАЯ ЗАМЕТКА'; $('#note-modal-title').textContent = note ? 'Изменить заметку' : 'Сохранить мысль'; $('#note-title').value = note?.title || ''; $('#note-body').value = note?.body || ''; selectedTag = note?.tag || 'personal'; $$('.tag-selector').forEach(button => button.classList.toggle('active', button.dataset.tag === selectedTag)); $$('#note-modal [data-modal-scope]').forEach(button => button.classList.toggle('active', button.dataset.modalScope === modalScope)); $('[data-action="delete-note"]').classList.toggle('hidden', !note); $('#note-title').focus();
}
function closeNoteEditor() { $('#note-modal').classList.add('hidden'); editingNoteId = null; $('#note-title').value = ''; $('#note-body').value = ''; }
function saveNote(event) { event.preventDefault(); const title = $('#note-title').value.trim(); const body = $('#note-body').value.trim(); if (!title && !body) { showToast('Добавьте заголовок или текст'); return; } const now = Date.now(); const nextScope = modalScope === 'shared' ? 'shared' : 'personal'; if (editingNoteId) { const note = state.notes.find(item => String(item.id) === String(editingNoteId)); if (note) { note.title = title || 'Без названия'; note.body = body; note.tag = selectedTag; note.scope = nextScope; note.authorId = nextScope === 'shared' ? recordAuthorId(note, state.activeUserId) : state.activeUserId; note.color = colorForTag(selectedTag); note.updatedAt = now; note.dateLabel = 'Только что'; } showToast('Заметка обновлена'); } else { state.notes.unshift({ id: now, title: title || 'Без названия', body, tag: selectedTag, scope: nextScope, authorId: state.activeUserId, color: colorForTag(selectedTag), favorite: false, updatedAt: now, dateLabel: 'Только что' }); showToast(nextScope === 'shared' ? 'Общая заметка сохранена' : 'Заметка сохранена'); } saveState(); closeNoteEditor(); renderAll(); }
function deleteNote() { if (!editingNoteId || !confirm('Удалить эту заметку?')) return; state.notes = state.notes.filter(item => String(item.id) !== String(editingNoteId)); saveState(); closeNoteEditor(); renderAll(); showToast('Заметка удалена'); }
function toggleFavorite(id) { const note = state.notes.find(item => String(item.id) === String(id)); if (!note) return; note.favorite = !note.favorite; note.updatedAt = Date.now(); saveState(); renderNotes(); showToast(note.favorite ? 'Добавлено в избранное' : 'Убрано из избранного'); }

function openTaskEditor(id = null) {
  editingTaskId = id; const task = state.tasks.find(item => String(item.id) === String(id)); modalScope = task ? recordScope(task) : plannerScope; $('#task-modal').classList.remove('hidden'); $('#task-modal-kicker').textContent = task ? 'РЕДАКТИРОВАНИЕ' : 'НОВАЯ ЗАДАЧА'; $('#task-modal-title').textContent = task ? 'Изменить задачу' : 'Добавить в планер'; $('#task-title').value = task?.title || ''; $('#task-date').value = task?.dateKey || selectedDateKey; $('#task-time').value = task?.time || ''; $$('#task-modal [data-modal-scope]').forEach(button => button.classList.toggle('active', button.dataset.modalScope === modalScope)); $('[data-action="delete-task"]').classList.toggle('hidden', !task); $('#task-title').focus(); }
function closeTaskEditor() { $('#task-modal').classList.add('hidden'); editingTaskId = null; }
function saveTask(event) { event.preventDefault(); const title = $('#task-title').value.trim(); if (!title) { showToast('Введите название задачи'); return; } const nextScope = modalScope === 'shared' ? 'shared' : 'personal'; const payload = { title, dateKey: $('#task-date').value || todayKey(), time: $('#task-time').value || '', scope: nextScope }; if (editingTaskId) { const task = state.tasks.find(item => String(item.id) === String(editingTaskId)); if (task) Object.assign(task, payload, { authorId: nextScope === 'shared' ? recordAuthorId(task, state.activeUserId) : state.activeUserId }); showToast('Задача обновлена'); } else { state.tasks.push({ id: Date.now(), ...payload, authorId: state.activeUserId, done: false }); showToast(nextScope === 'shared' ? 'Общая задача добавлена' : 'Задача добавлена'); } selectedDateKey = payload.dateKey; calendarCursor = dateFromKey(selectedDateKey); saveState(); closeTaskEditor(); renderAll(); }
function deleteTask() { if (!editingTaskId || !confirm('Удалить эту задачу?')) return; state.tasks = state.tasks.filter(item => String(item.id) !== String(editingTaskId)); saveState(); closeTaskEditor(); renderAll(); showToast('Задача удалена'); }
function toggleTask(id) { const task = state.tasks.find(item => String(item.id) === String(id)); if (!task) return; task.done = !task.done; saveState(); renderAll(); }

function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2400); }
function openSearch() { switchView('notes'); $('#notes-search').focus(); }
function setTheme() { state.theme = state.theme === 'dark' ? 'light' : 'dark'; document.body.classList.toggle('dark', state.theme === 'dark'); saveState(); showToast(state.theme === 'dark' ? 'Тёмная тема включена' : 'Светлая тема включена'); }
function renderUserList() {
  $('#user-list').innerHTML = state.users.map(user => `<button class="user-option ${user.id === state.activeUserId ? 'active' : ''}" data-user-id="${escapeHtml(user.id)}"><span class="user-option-avatar" style="background:${escapeHtml(user.color || '#1677ff')}">${escapeHtml(initials(user.name))}</span><span><strong>${escapeHtml(user.name)}</strong><small>${user.id === state.activeUserId ? 'Сейчас выбран' : 'Выбрать профиль'}</small></span>${user.id === state.activeUserId ? '<i>✓</i>' : ''}</button>`).join('');
}
function openUserModal() { renderUserList(); $('#new-user-name').value = ''; $('#user-modal').classList.remove('hidden'); }
function closeUserModal() { $('#user-modal').classList.add('hidden'); }
function chooseUser(id) { if (!state.users.some(user => user.id === id)) return; state.activeUserId = id; sessionStorage.setItem('nova-user-picked', '1'); saveState(); closeUserModal(); renderAll(); showToast(`Сейчас пишет ${activeUser().name}`); }
function addUser() { const input = $('#new-user-name'); const name = input.value.trim(); if (!name) { showToast('Введите имя пользователя'); input.focus(); return; } const colors = ['#1677ff', '#f3973e', '#8068da', '#28b65b', '#d85e7b']; const user = { id: `user-${Date.now()}`, name, color: colors[state.users.length % colors.length] }; state.users.push(user); state.activeUserId = user.id; saveState(); input.value = ''; closeUserModal(); renderAll(); showToast(`Профиль ${name} добавлен`); }

document.addEventListener('click', event => {
  const view = event.target.closest('[data-view]')?.dataset.view; const actionNode = event.target.closest('[data-action]'); const action = actionNode?.dataset.action; const taskId = event.target.closest('[data-task-id]')?.dataset.taskId; const noteId = event.target.closest('[data-note-id]')?.dataset.noteId; const userId = event.target.closest('[data-user-id]')?.dataset.userId;
  if (view) switchView(view);
  if (event.target.closest('[data-scope]')) { const button = event.target.closest('[data-scope]'); const scope = setWorkspaceScope(button.dataset.scope); const context = button.closest('#notes-view') ? 'notes' : button.closest('#planner-view') ? 'planner' : 'overview'; if (context === 'notes') { activeFilter = 'all'; $$('#notes-view .segment[data-filter]').forEach(item => item.classList.toggle('active', item.dataset.filter === 'all')); } setScopeButtons(scope, 'overview'); setScopeButtons(scope, 'notes'); setScopeButtons(scope, 'planner'); renderShell(); renderTasks(); renderNotes(); renderPlanner(); return; }
  if (event.target.closest('[data-modal-scope]')) { modalScope = event.target.closest('[data-modal-scope]').dataset.modalScope; const modal = event.target.closest('.modal-card'); modal.querySelectorAll('[data-modal-scope]').forEach(button => button.classList.toggle('active', button.dataset.modalScope === modalScope)); return; }
  if (userId) { chooseUser(userId); return; }
  if (event.target.closest('[data-calendar-date]')) { selectedDateKey = event.target.closest('[data-calendar-date]').dataset.calendarDate; renderPlanner(); return; }
  if (event.target.closest('[data-filter]')) { activeFilter = event.target.closest('[data-filter]').dataset.filter; $$('.segment[data-filter]').forEach(button => button.classList.toggle('active', button.dataset.filter === activeFilter)); renderNotes(); return; }
  if (event.target.closest('[data-calendar-mode]')) { calendarMode = event.target.closest('[data-calendar-mode]').dataset.calendarMode; $$('.segment[data-calendar-mode]').forEach(button => button.classList.toggle('active', button.dataset.calendarMode === calendarMode)); renderPlanner(); return; }
  if (event.target.closest('[data-tag]')) { selectedTag = event.target.closest('[data-tag]').dataset.tag; $$('.tag-selector').forEach(button => button.classList.toggle('active', button.dataset.tag === selectedTag)); return; }
  if (noteId && !action) { openNoteEditor(noteId); return; }
  if (action === 'new-note') openNoteEditor();
  if (action === 'edit-note') openNoteEditor(noteId);
  if (action === 'toggle-favorite') toggleFavorite(noteId);
  if (action === 'close-note') closeNoteEditor();
  if (action === 'delete-note') deleteNote();
  if (action === 'new-task') openTaskEditor();
  if (action === 'edit-task') openTaskEditor(taskId);
  if (action === 'toggle-task') toggleTask(taskId);
  if (action === 'close-task') closeTaskEditor();
  if (action === 'delete-task') deleteTask();
  if (action === 'open-planner') switchView('planner');
  if (action === 'prev-month') { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1); renderPlanner(); }
  if (action === 'next-month') { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1); renderPlanner(); }
  if (action === 'today-date') { selectedDateKey = todayKey(); calendarCursor = new Date(); renderPlanner(); }
  if (action === 'search') openSearch();
  if (action === 'toggle-theme') setTheme();
  if (action === 'sync-now') { $('#sync-state span').textContent = 'Проверяю…'; setTimeout(() => { $('#sync-state span').textContent = state.notes.length || state.tasks.length ? 'На устройстве' : 'Локально'; showToast('Синхронизация ещё не подключена'); }, 650); }
  if (action === 'add-project') { const name = prompt('Название подборки'); if (name?.trim()) { state.collections.push(name.trim()); saveState(); renderCollections(); showToast('Подборка добавлена'); } }
  if (action === 'profile-menu') openUserModal();
  if (action === 'close-users') closeUserModal();
  if (action === 'add-user') addUser();
});

$('#note-form').addEventListener('submit', saveNote); $('#task-form').addEventListener('submit', saveTask);
$('#notes-search').addEventListener('input', event => { searchQuery = event.target.value; renderNotes(); });
$('#global-search').addEventListener('input', event => { searchQuery = event.target.value; switchView('notes'); $('#notes-search').value = searchQuery; renderNotes(); });
document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#global-search').focus(); } if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); openNoteEditor(); } if (event.key === 'Escape') { closeNoteEditor(); closeTaskEditor(); closeUserModal(); } });
document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) { if (backdrop.id === 'note-modal') closeNoteEditor(); else if (backdrop.id === 'task-modal') closeTaskEditor(); else closeUserModal(); } }));
$('#new-user-name').addEventListener('keydown', event => { if (event.key === 'Enter') addUser(); });

document.body.classList.toggle('dark', state.theme === 'dark'); renderAll();
if (state.users.length > 1 && !sessionStorage.getItem('nova-user-picked')) setTimeout(openUserModal, 180);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
