(() => {
  const cfg = window.APP_CONFIG || {};
  const isSupabaseConfigured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const sb = isSupabaseConfigured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  const DEMO_KEY = "physics_platform_demo_v1";
  const DEMO_TEACHER_KEY = "physics_platform_demo_teacher";

  const state = {
    isTeacher: false,
    userEmail: null,
    activeView: "lessons",
    activeLessonId: null,
    reviewTab: "submissions",
    lessons: [],
    homeworks: [],
    submissions: [],
    tests: [],
    testResults: []
  };

  // ---------- Utilities ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2, 11);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("ru-RU", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
      });
    } catch {
      return iso;
    }
  }

  function toast(msg) {
    const box = $("#toastContainer");
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function renderMath(target = document.body) {
    if (typeof window.renderMathInElement === "function") {
      try {
        window.renderMathInElement(target, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false }
          ],
          throwOnError: false
        });
      } catch (_) {}
    }
  }

  // ---------- Demo Seed Data ----------
  function getDefaultDemoData() {
    const l1 = uid();
    const l2 = uid();
    const hw1 = uid();
    const t1 = uid();
    return {
      lessons: [
        {
          id: l1,
          title: "Урок 1: Кинематика",
          subtitle: "Равномерное и равноускоренное движение",
          theory:
            "Основные формулы кинематики:\n• Скорость при равноускоренном движении: $v = v_0 + at$\n• Перемещение: $S = v_0 t + \\frac{at^2}{2}$\n• Связь скорости и перемещения без времени: $v^2 - v_0^2 = 2aS$",
          sort_order: 1,
          created_at: new Date().toISOString()
        },
        {
          id: l2,
          title: "Урок 2: Законы Ньютона",
          subtitle: "Динамика материальной точки",
          theory:
            "Второй закон Ньютона: $$\\vec{F} = m\\vec{a}$$\nСила тяжести: $F_{\\text{тяж}} = mg$, где $g \\approx 9.8\\text{ м/с}^2$.",
          sort_order: 2,
          created_at: new Date().toISOString()
        }
      ],
      homeworks: [
        {
          id: hw1,
          lesson_id: l1,
          title: "Задачи по равноускоренному движению",
          description:
            "1. Автомобиль трогается с места с ускорением $a = 2\\text{ м/с}^2$. Какой путь он пройдёт за $t = 5\\text{ с}$?\n2. Нарисуйте график зависимости скорости от времени $v(t)$ и прикрепите фото решения.",
          deadline: "До пятницы",
          max_score: 5,
          created_at: new Date().toISOString()
        }
      ],
      submissions: [
        {
          id: uid(),
          homework_id: hw1,
          student_name: "Иванов Иван",
          student_class: "9А",
          answer_text: "S = (2 * 5^2) / 2 = 25 метров.",
          file_url: "",
          file_name: "",
          status: "pending",
          grade: "",
          teacher_comment: "",
          created_at: new Date().toISOString()
        }
      ],
      tests: [
        {
          id: t1,
          lesson_id: l1,
          title: "Мини-тест: Кинематика",
          description: "Проверка базовых формул и расчётов.",
          questions: [
            {
              text: "Какая величина измеряется в $\\text{м/с}^2$?",
              type: "single",
              options: ["Скорость", "Ускорение", "Путь", "Сила"],
              correct: [1],
              points: 1
            },
            {
              text: "Тело движется из состояния покоя с ускорением $4\\text{ м/с}^2$. Чему равна его скорость через $3\\text{ с}$ (в м/с)?",
              type: "text",
              correctText: "12",
              points: 2
            }
          ],
          created_at: new Date().toISOString()
        }
      ],
      test_results: []
    };
  }

  function loadDemoStore() {
    const raw = localStorage.getItem(DEMO_KEY);
    if (!raw) {
      const seed = getDefaultDemoData();
      localStorage.setItem(DEMO_KEY, JSON.stringify(seed));
      return seed;
    }
    try {
      return JSON.parse(raw);
    } catch {
      const seed = getDefaultDemoData();
      localStorage.setItem(DEMO_KEY, JSON.stringify(seed));
      return seed;
    }
  }

  function saveDemoStore(data) {
    localStorage.setItem(DEMO_KEY, JSON.stringify(data));
  }

  // ---------- Data Layer ----------
  async function loadAllData() {
    if (!isSupabaseConfigured) {
      const d = loadDemoStore();
      state.lessons = d.lessons || [];
      state.homeworks = d.homeworks || [];
      state.submissions = d.submissions || [];
      state.tests = d.tests || [];
      state.testResults = d.test_results || [];
    } else {
      const [lRes, hwRes, subRes, tRes, trRes] = await Promise.all([
        sb.from("lessons").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
        sb.from("homeworks").select("*").order("created_at", { ascending: true }),
        sb.from("submissions").select("*").order("created_at", { ascending: false }),
        sb.from("tests").select("*").order("created_at", { ascending: false }),
        sb.from("test_results").select("*").order("created_at", { ascending: false })
      ]);
      state.lessons = lRes.data || [];
      state.homeworks = hwRes.data || [];
      state.submissions = subRes.data || [];
      state.tests = tRes.data || [];
      state.testResults = trRes.data || [];
    }

    if (!state.activeLessonId || !state.lessons.some(l => l.id === state.activeLessonId)) {
      state.activeLessonId = state.lessons[0]?.id || null;
    }
    renderAll();
  }

  async function dbInsert(table, row) {
    if (!isSupabaseConfigured) {
      const d = loadDemoStore();
      const item = { id: uid(), created_at: new Date().toISOString(), ...row };
      d[table].push(item);
      saveDemoStore(d);
      return item;
    }
    const { data, error } = await sb.from(table).insert(row).select().single();
    if (error) throw error;
    return data;
  }

  async function dbUpdate(table, id, patch) {
    if (!isSupabaseConfigured) {
      const d = loadDemoStore();
      const idx = d[table].findIndex(x => x.id === id);
      if (idx >= 0) d[table][idx] = { ...d[table][idx], ...patch };
      saveDemoStore(d);
      return;
    }
    const { error } = await sb.from(table).update(patch).eq("id", id);
    if (error) throw error;
  }

  async function dbDelete(table, id) {
    if (!isSupabaseConfigured) {
      const d = loadDemoStore();
      d[table] = d[table].filter(x => x.id !== id);
      if (table === "lessons") {
        const hwIds = d.homeworks.filter(h => h.lesson_id === id).map(h => h.id);
        d.homeworks = d.homeworks.filter(h => h.lesson_id !== id);
        d.submissions = d.submissions.filter(s => !hwIds.includes(s.homework_id));
      }
      if (table === "homeworks") {
        d.submissions = d.submissions.filter(s => s.homework_id !== id);
      }
      if (table === "tests") {
        d.test_results = d.test_results.filter(r => r.test_id !== id);
      }
      saveDemoStore(d);
      return;
    }
    const { error } = await sb.from(table).delete().eq("id", id);
    if (error) throw error;
  }

  async function uploadSolutionFile(file) {
    if (!file) return { file_url: "", file_name: "" };
    if (!isSupabaseConfigured) {
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("В демо-режиме файл должен быть не больше 2 МБ");
      }
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return { file_url: dataUrl, file_name: file.name };
    }
    const ext = file.name.split(".").pop() || "bin";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from("solutions").upload(path, file);
    if (error) throw error;
    const { data } = sb.storage.from("solutions").getPublicUrl(path);
    return { file_url: data.publicUrl, file_name: file.name };
  }

  // ---------- Auth ----------
  async function syncAuth() {
    if (!isSupabaseConfigured) {
      state.isTeacher = localStorage.getItem(DEMO_TEACHER_KEY) === "1";
      state.userEmail = state.isTeacher ? "demo-teacher" : null;
    } else {
      const { data } = await sb.auth.getSession();
      state.isTeacher = Boolean(data?.session?.user);
      state.userEmail = data?.session?.user?.email || null;
    }
    updateAuthUI();
  }

  function updateAuthUI() {
    const authBtn = $("#authBtn");
    const reviewNav = $("#reviewNavBtn");
    const addLessonBtn = $("#addLessonBtn");
    const createTestBtn = $("#createTestBtn");

    if (state.isTeacher) {
      authBtn.textContent = "Учитель (Выйти)";
      reviewNav.classList.remove("hidden");
      addLessonBtn.classList.remove("hidden");
      createTestBtn.classList.remove("hidden");
    } else {
      authBtn.textContent = "Вход для учителя";
      reviewNav.classList.add("hidden");
      addLessonBtn.classList.add("hidden");
      createTestBtn.classList.add("hidden");
      if (state.activeView === "review") switchView("lessons");
    }
    updatePendingBadge();
  }

  function updatePendingBadge() {
    const pending = state.submissions.filter(s => s.status !== "graded").length;
    const badge = $("#pendingBadge");
    badge.textContent = pending;
    badge.classList.toggle("hidden", pending === 0);
  }

  // ---------- Modal Helpers ----------
  function openModal(title, html, onMount) {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = html;
    $("#modalBackdrop").classList.remove("hidden");
    if (onMount) onMount($("#modalBody"));
    renderMath($("#modalBody"));
  }

  function closeModal() {
    $("#modalBackdrop").classList.add("hidden");
    $("#modalBody").innerHTML = "";
  }

  // ---------- Navigation ----------
  function switchView(viewName) {
    state.activeView = viewName;
    $$(".nav-pill").forEach(b => b.classList.toggle("active", b.dataset.view === viewName));
    $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${viewName}`));
    if (viewName === "review") renderReviewView();
    if (viewName === "tests") renderTestsView();
    if (viewName === "ege") renderEgeView();
    if (viewName === "lessons") renderLessonsView();
  }

  // ---------- Render: Lessons ----------
  function renderLessonsView() {
    const tabsEl = $("#lessonTabs");
    const contentEl = $("#lessonContent");

    if (state.lessons.length === 0) {
      tabsEl.innerHTML = "";
      contentEl.innerHTML = `
        <div class="empty-state">
          <h3>Пока нет ни одного урока</h3>
          <p>${state.isTeacher ? "Нажмите «+ Новый урок», чтобы создать первую вкладку." : "Учитель скоро добавит материалы."}</p>
        </div>
      `;
      return;
    }

    tabsEl.innerHTML = state.lessons
      .map(
        l => `<button class="lesson-tab ${l.id === state.activeLessonId ? "active" : ""}" data-lesson-id="${escapeHtml(l.id)}">${escapeHtml(l.title)}</button>`
      )
      .join("");

    $$(".lesson-tab", tabsEl).forEach(btn => {
      btn.addEventListener("click", () => {
        state.activeLessonId = btn.dataset.lessonId;
        renderLessonsView();
      });
    });

    const lesson = state.lessons.find(l => l.id === state.activeLessonId) || state.lessons[0];
    const lessonHws = state.homeworks.filter(h => h.lesson_id === lesson.id);
    const lessonTests = state.tests.filter(t => t.lesson_id === lesson.id);

    contentEl.innerHTML = `
      <div class="card">
        <div class="lesson-hero">
          <div>
            <h1>${escapeHtml(lesson.title)}</h1>
            ${lesson.subtitle ? `<p class="muted">${escapeHtml(lesson.subtitle)}</p>` : ""}
          </div>
          ${
            state.isTeacher
              ? `<div class="card-actions">
                  <button class="btn btn-outline btn-sm" id="editLessonBtn">Редактировать урок</button>
                  <button class="btn btn-danger btn-sm" id="deleteLessonBtn">Удалить</button>
                </div>`
              : ""
          }
        </div>

        ${lesson.theory ? `<div class="lesson-theory">${escapeHtml(lesson.theory)}</div>` : ""}

        <div class="sub-section-head">
          <h2>Домашние задания (${lessonHws.length})</h2>
          ${state.isTeacher ? `<button class="btn btn-primary btn-sm" id="addHwBtn">+ Добавить ДЗ</button>` : ""}
        </div>

        ${
          lessonHws.length === 0
            ? `<div class="empty-state">К этому уроку пока нет домашних заданий.</div>`
            : `<div class="cards-grid">
                ${lessonHws
                  .map(hw => {
                    const count = state.submissions.filter(s => s.homework_id === hw.id).length;
                    return `
                      <div class="hw-card">
                        <div>
                          <div class="hw-meta">
                            ${hw.deadline ? `<span class="tag tag-warning">Срок: ${escapeHtml(hw.deadline)}</span>` : ""}
                            <span class="tag tag-primary">Макс. балл: ${escapeHtml(hw.max_score || 5)}</span>
                            ${state.isTeacher ? `<span class="tag">Решений: ${count}</span>` : ""}
                          </div>
                          <h3>${escapeHtml(hw.title)}</h3>
                          <p style="white-space: pre-wrap;">${escapeHtml(hw.description)}</p>
                        </div>
                        <div class="card-actions">
                          <button class="btn btn-primary btn-sm submit-hw-btn" data-hw-id="${escapeHtml(hw.id)}">Отправить решение</button>
                          ${
                            state.isTeacher
                              ? `<button class="btn btn-outline btn-sm edit-hw-btn" data-hw-id="${escapeHtml(hw.id)}">Изменить</button>
                                 <button class="btn btn-danger btn-sm del-hw-btn" data-hw-id="${escapeHtml(hw.id)}">Удалить</button>`
                              : ""
                          }
                        </div>
                      </div>
                    `;
                  })
                  .join("")}
              </div>`
        }

        <div class="sub-section-head">
          <h2>Тесты по этому уроку (${lessonTests.length})</h2>
          ${state.isTeacher ? `<button class="btn btn-outline btn-sm" id="addLessonTestBtn">+ Создать тест</button>` : ""}
        </div>

        ${
          lessonTests.length === 0
            ? `<div class="empty-state">Тестов для этого урока пока нет.</div>`
            : `<div class="cards-grid">${lessonTests.map(renderTestCard).join("")}</div>`
        }
      </div>
    `;

    // Bind lesson actions
    $("#editLessonBtn")?.addEventListener("click", () => openLessonModal(lesson));
    $("#deleteLessonBtn")?.addEventListener("click", async () => {
      if (!confirm(`Удалить урок «${lesson.title}» вместе с его домашними заданиями?`)) return;
      await dbDelete("lessons", lesson.id);
      toast("Урок удалён");
      await loadAllData();
    });
    $("#addHwBtn")?.addEventListener("click", () => openHomeworkModal(lesson.id));
    $("#addLessonTestBtn")?.addEventListener("click", () => openTestBuilderModal(lesson.id));

    $$(".submit-hw-btn", contentEl).forEach(btn => {
      btn.addEventListener("click", () => openSubmitHomeworkModal(btn.dataset.hwId));
    });
    $$(".edit-hw-btn", contentEl).forEach(btn => {
      btn.addEventListener("click", () => {
        const hw = state.homeworks.find(h => h.id === btn.dataset.hwId);
        openHomeworkModal(lesson.id, hw);
      });
    });
    $$(".del-hw-btn", contentEl).forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Удалить это домашнее задание?")) return;
        await dbDelete("homeworks", btn.dataset.hwId);
        toast("Домашнее задание удалено");
        await loadAllData();
      });
    });

    bindTestCardButtons(contentEl);
    renderMath(contentEl);
  }

  // ---------- Render: Tests ----------
  function renderTestCard(t) {
    const lesson = state.lessons.find(l => l.id === t.lesson_id);
    const qCount = Array.isArray(t.questions) ? t.questions.length : 0;
    return `
      <div class="test-card">
        <div>
          <div class="hw-meta">
            ${lesson ? `<span class="tag tag-primary">${escapeHtml(lesson.title)}</span>` : `<span class="tag">Общий тест</span>`}
            <span class="tag">Вопросов: ${qCount}</span>
          </div>
          <h3>${escapeHtml(t.title)}</h3>
          ${t.description ? `<p class="muted">${escapeHtml(t.description)}</p>` : ""}
        </div>
        <div class="card-actions">
          <button class="btn btn-primary btn-sm start-test-btn" data-test-id="${escapeHtml(t.id)}">Пройти тест</button>
          ${
            state.isTeacher
              ? `<button class="btn btn-danger btn-sm del-test-btn" data-test-id="${escapeHtml(t.id)}">Удалить</button>`
              : ""
          }
        </div>
      </div>
    `;
  }

  function bindTestCardButtons(root) {
    $$(".start-test-btn", root).forEach(btn => {
      btn.addEventListener("click", () => openTakeTestModal(btn.dataset.testId));
    });
    $$(".del-test-btn", root).forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Удалить этот тест и все его результаты?")) return;
        await dbDelete("tests", btn.dataset.testId);
        toast("Тест удалён");
        await loadAllData();
      });
    });
  }

  function renderTestsView() {
    const grid = $("#testsGrid");
    if (state.tests.length === 0) {
      grid.innerHTML = `<div class="empty-state">Пока нет ни одного теста.</div>`;
      return;
    }
    grid.innerHTML = state.tests.map(renderTestCard).join("");
    bindTestCardButtons(grid);
    renderMath(grid);
  }

  // ---------- Render: Teacher Review ----------
  function renderReviewView() {
    const filterLesson = $("#filterLesson");
    const currentLessonFilter = filterLesson.value || "all";
    filterLesson.innerHTML =
      `<option value="all">Все уроки</option>` +
      state.lessons.map(l => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.title)}</option>`).join("");
    filterLesson.value = currentLessonFilter;

    const container = $("#reviewContainer");
    const filtersBar = $("#reviewFilters");

    if (state.reviewTab === "test-results") {
      filtersBar.classList.add("hidden");
      if (state.testResults.length === 0) {
        container.innerHTML = `<div class="empty-state">Пока никто не проходил тесты.</div>`;
        return;
      }
      container.innerHTML = `
        <div class="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ученик</th>
                <th>Класс</th>
                <th>Тест</th>
                <th>Результат</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              ${state.testResults
                .map(r => {
                  const t = state.tests.find(x => x.id === r.test_id);
                  const pct = r.max_score ? Math.round((r.score / r.max_score) * 100) : 0;
                  return `
                    <tr>
                      <td><strong>${escapeHtml(r.student_name)}</strong></td>
                      <td>${escapeHtml(r.student_class)}</td>
                      <td>${escapeHtml(t ? t.title : "Удалённый тест")}</td>
                      <td><span class="tag tag-primary">${r.score} / ${r.max_score} (${pct}%)</span></td>
                      <td class="muted">${formatDate(r.created_at)}</td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    filtersBar.classList.remove("hidden");
    const statusFilter = $("#filterStatus").value;
    const lessonFilter = $("#filterLesson").value;

    const list = state.submissions.filter(s => {
      const hw = state.homeworks.find(h => h.id === s.homework_id);
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (lessonFilter !== "all" && hw?.lesson_id !== lessonFilter) return false;
      return true;
    });

    if (list.length === 0) {
      container.innerHTML = `<div class="empty-state">Нет работ по выбранным фильтрам.</div>`;
      return;
    }

    container.innerHTML = `<div class="submission-list">
      ${list
        .map(s => {
          const hw = state.homeworks.find(h => h.id === s.homework_id);
          const lesson = state.lessons.find(l => l.id === hw?.lesson_id);
          const isImage = s.file_url && /\.(png|jpe?g|gif|webp)$/i.test(s.file_name || s.file_url) || s.file_url?.startsWith("data:image/");
          return `
            <div class="submission-card" data-sub-id="${escapeHtml(s.id)}">
              <div class="submission-top">
                <div>
                  <strong>${escapeHtml(s.student_name)}</strong> · <span class="tag">${escapeHtml(s.student_class)}</span>
                  <div class="hint">${escapeHtml(lesson?.title || "Урок")} → ${escapeHtml(hw?.title || "Задание")} · ${formatDate(s.created_at)}</div>
                </div>
                <span class="tag ${s.status === "graded" ? "tag-success" : "tag-warning"}">
                  ${s.status === "graded" ? `Проверено: ${escapeHtml(s.grade)}` : "На проверке"}
                </span>
              </div>

              ${s.answer_text ? `<div class="submission-answer">${escapeHtml(s.answer_text)}</div>` : ""}

              ${
                s.file_url
                  ? isImage
                    ? `<img src="${escapeHtml(s.file_url)}" alt="Решение" class="submission-thumb" />`
                    : `<a href="${escapeHtml(s.file_url)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">📎 Скачать файл: ${escapeHtml(s.file_name || "вложение")}</a>`
                  : ""
              }

              <form class="grade-form">
                <input type="text" class="input grade-input" name="grade" placeholder="Оценка (напр. 5)" value="${escapeHtml(s.grade || "")}" required />
                <input type="text" class="input comment-input" name="comment" placeholder="Комментарий учителя..." value="${escapeHtml(s.teacher_comment || "")}" />
                <button type="submit" class="btn btn-primary btn-sm">Сохранить оценку</button>
              </form>
            </div>
          `;
        })
        .join("")}
    </div>`;

    $$(".submission-thumb", container).forEach(img => {
      img.addEventListener("click", () => {
        $("#lightboxImg").src = img.src;
        $("#lightbox").classList.remove("hidden");
      });
    });

    $$(".grade-form", container).forEach(form => {
      form.addEventListener("submit", async e => {
        e.preventDefault();
        const card = form.closest(".submission-card");
        const id = card.dataset.subId;
        const grade = form.grade.value.trim();
        const teacher_comment = form.comment.value.trim();
        await dbUpdate("submissions", id, { status: "graded", grade, teacher_comment });
        toast("Оценка сохранена");
        await loadAllData();
        renderReviewView();
      });
    });
  }

  // ---------- Modals: Auth, Lesson, Homework, Submit, Test Builder, Take Test ----------
  function openLoginModal() {
    const demoHint = !isSupabaseConfigured
      ? `<div class="hint" style="margin-bottom:12px;">Демо-режим: используйте пароль <code>teacher123</code></div>`
      : `<div class="hint" style="margin-bottom:12px;">Войдите с email и паролем, созданным в Supabase Authentication.</div>`;

    openModal(
      "Вход для учителя",
      `
      <form id="loginForm">
        ${demoHint}
        ${
          isSupabaseConfigured
            ? `<div class="field"><label>Email учителя</label><input type="email" name="email" class="input" required /></div>`
            : ""
        }
        <div class="field">
          <label>Пароль</label>
          <input type="password" name="password" class="input" required />
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%">Войти</button>
      </form>
      `,
      root => {
        $("#loginForm", root).addEventListener("submit", async e => {
          e.preventDefault();
          const pw = e.target.password.value;
          if (!isSupabaseConfigured) {
            if (pw === "teacher123") {
              localStorage.setItem(DEMO_TEACHER_KEY, "1");
              await syncAuth();
              closeModal();
              renderAll();
              toast("Вы вошли как учитель");
            } else {
              toast("Неверный пароль (для демо: teacher123)");
            }
            return;
          }
          const email = e.target.email.value.trim();
          const { error } = await sb.auth.signInWithPassword({ email, password: pw });
          if (error) {
            toast("Ошибка входа: " + error.message);
            return;
          }
          await syncAuth();
          closeModal();
          renderAll();
          toast("Добро пожаловать!");
        });
      }
    );
  }

  function openLessonModal(existing = null) {
    openModal(
      existing ? "Редактировать урок" : "Новый урок (вкладка)",
      `
      <form id="lessonForm">
        <div class="field">
          <label>Название вкладки урока</label>
          <input type="text" name="title" class="input" placeholder="Например: Урок 3: Оптика" value="${escapeHtml(existing?.title || "")}" required />
        </div>
        <div class="field">
          <label>Краткий подзаголовок</label>
          <input type="text" name="subtitle" class="input" placeholder="Отражение и преломление света" value="${escapeHtml(existing?.subtitle || "")}" />
        </div>
        <div class="field">
          <label>Теория и материалы (можно использовать формулы LaTeX: $E=mc^2$)</label>
          <textarea name="theory" class="textarea" placeholder="Конспект, формулы, ссылки на видео...">${escapeHtml(existing?.theory || "")}</textarea>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%">${existing ? "Сохранить изменения" : "Создать урок"}</button>
      </form>
      `,
      root => {
        $("#lessonForm", root).addEventListener("submit", async e => {
          e.preventDefault();
          const payload = {
            title: e.target.title.value.trim(),
            subtitle: e.target.subtitle.value.trim(),
            theory: e.target.theory.value.trim(),
            sort_order: existing ? existing.sort_order : state.lessons.length + 1
          };
          if (existing) {
            await dbUpdate("lessons", existing.id, payload);
            toast("Урок обновлён");
          } else {
            const created = await dbInsert("lessons", payload);
            state.activeLessonId = created.id;
            toast("Урок создан");
          }
          closeModal();
          await loadAllData();
        });
      }
    );
  }

  function openHomeworkModal(lessonId, existing = null) {
    openModal(
      existing ? "Редактировать домашнее задание" : "Новое домашнее задание",
      `
      <form id="hwForm">
        <div class="field">
          <label>Название задания</label>
          <input type="text" name="title" class="input" value="${escapeHtml(existing?.title || "")}" required />
        </div>
        <div class="field">
          <label>Условие задачи / описание (поддерживается LaTeX $...$)</label>
          <textarea name="description" class="textarea" required>${escapeHtml(existing?.description || "")}</textarea>
        </div>
        <div style="display:flex; gap:12px;">
          <div class="field" style="flex:1;">
            <label>Срок сдачи</label>
            <input type="text" name="deadline" class="input" placeholder="Например: До 20 ноября" value="${escapeHtml(existing?.deadline || "")}" />
          </div>
          <div class="field" style="width:140px;">
            <label>Макс. балл</label>
            <input type="number" name="max_score" class="input" value="${escapeHtml(existing?.max_score || 5)}" min="1" />
          </div>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%">Сохранить задание</button>
      </form>
      `,
      root => {
        $("#hwForm", root).addEventListener("submit", async e => {
          e.preventDefault();
          const payload = {
            lesson_id: lessonId,
            title: e.target.title.value.trim(),
            description: e.target.description.value.trim(),
            deadline: e.target.deadline.value.trim(),
            max_score: Number(e.target.max_score.value) || 5
          };
          if (existing) {
            await dbUpdate("homeworks", existing.id, payload);
            toast("Задание обновлено");
          } else {
            await dbInsert("homeworks", payload);
            toast("Задание добавлено");
          }
          closeModal();
          await loadAllData();
        });
      }
    );
  }

  function openSubmitHomeworkModal(homeworkId) {
    const hw = state.homeworks.find(h => h.id === homeworkId);
    if (!hw) return;

    openModal(
      `Сдать работу: ${hw.title}`,
      `
      <form id="submitHwForm">
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <div class="field" style="flex:1; min-width:180px;">
            <label>Фамилия и Имя</label>
            <input type="text" name="student_name" class="input" placeholder="Петров Алексей" required />
          </div>
          <div class="field" style="width:130px;">
            <label>Класс</label>
            <input type="text" name="student_class" class="input" placeholder="9А" required />
          </div>
        </div>
        <div class="field">
          <label>Текстовое решение или ответ</label>
          <textarea name="answer_text" class="textarea" placeholder="Напишите ход решения или пояснение..."></textarea>
        </div>
        <div class="field">
          <label>Фото тетради или файл (необязательно)</label>
          <div id="dropzone" class="dropzone">
            <input type="file" id="hwFileInput" accept="image/*,.pdf,.doc,.docx" class="hidden" />
            <div id="dropzoneText">Нажмите или перетащите фото/PDF сюда</div>
          </div>
        </div>
        <button type="submit" id="submitHwBtn" class="btn btn-primary" style="width:100%">Отправить на проверку</button>
      </form>
      `,
      root => {
        const fileInput = $("#hwFileInput", root);
        const dropzone = $("#dropzone", root);
        const dzText = $("#dropzoneText", root);
        let selectedFile = null;

        dropzone.addEventListener("click", () => fileInput.click());
        dropzone.addEventListener("dragover", e => {
          e.preventDefault();
          dropzone.classList.add("dragover");
        });
        dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
        dropzone.addEventListener("drop", e => {
          e.preventDefault();
          dropzone.classList.remove("dragover");
          if (e.dataTransfer.files[0]) {
            selectedFile = e.dataTransfer.files[0];
            dzText.textContent = `Выбран файл: ${selectedFile.name}`;
          }
        });
        fileInput.addEventListener("change", () => {
          if (fileInput.files[0]) {
            selectedFile = fileInput.files[0];
            dzText.textContent = `Выбран файл: ${selectedFile.name}`;
          }
        });

        $("#submitHwForm", root).addEventListener("submit", async e => {
          e.preventDefault();
          const answerText = e.target.answer_text.value.trim();
          if (!answerText && !selectedFile) {
            toast("Напишите ответ или прикрепите файл с решением");
            return;
          }
          const btn = $("#submitHwBtn", root);
          btn.disabled = true;
          btn.textContent = "Отправка...";
          try {
            const fileMeta = await uploadSolutionFile(selectedFile);
            await dbInsert("submissions", {
              homework_id: homeworkId,
              student_name: e.target.student_name.value.trim(),
              student_class: e.target.student_class.value.trim(),
              answer_text: answerText,
              file_url: fileMeta.file_url,
              file_name: fileMeta.file_name,
              status: "pending",
              grade: "",
              teacher_comment: ""
            });
            closeModal();
            toast("Решение отправлено учителю!");
            await loadAllData();
          } catch (err) {
            toast("Ошибка: " + err.message);
            btn.disabled = false;
            btn.textContent = "Отправить на проверку";
          }
        });
      }
    );
  }

  function openTestBuilderModal(defaultLessonId = "") {
    const questions = [
      { text: "", type: "single", options: ["", ""], correct: [0], correctText: "", points: 1 }
    ];

    openModal(
      "Конструктор теста",
      `
      <form id="testBuilderForm">
        <div class="field">
          <label>Название теста</label>
          <input type="text" name="title" class="input" placeholder="Например: Контрольный тест по механике" required />
        </div>
        <div class="field">
          <label>Привязать к уроку</label>
          <select name="lesson_id" class="input">
            <option value="">Без привязки (общий тест)</option>
            ${state.lessons.map(l => `<option value="${escapeHtml(l.id)}" ${l.id === defaultLessonId ? "selected" : ""}>${escapeHtml(l.title)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Описание</label>
          <input type="text" name="description" class="input" placeholder="Краткая инструкция для учеников" />
        </div>
        <div class="sub-section-head">
          <h3>Вопросы</h3>
          <button type="button" id="addQuestionBtn" class="btn btn-outline btn-sm">+ Добавить вопрос</button>
        </div>
        <div id="questionsBuilderList"></div>
        <button type="submit" class="btn btn-primary" style="width:100%; margin-top:10px;">Опубликовать тест</button>
      </form>
      `,
      root => {
        const listEl = $("#questionsBuilderList", root);

        function renderBuilderQuestions() {
          listEl.innerHTML = questions
            .map((q, qi) => {
              return `
                <div class="q-builder-item" data-qi="${qi}">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong>Вопрос ${qi + 1}</strong>
                    ${questions.length > 1 ? `<button type="button" class="btn btn-danger btn-sm remove-q-btn">Удалить</button>` : ""}
                  </div>
                  <div class="field">
                    <input type="text" class="input q-text" placeholder="Текст вопроса (можно с LaTeX $...$)" value="${escapeHtml(q.text)}" required />
                  </div>
                  <div style="display:flex; gap:10px; margin-bottom:10px;">
                    <select class="input q-type" style="flex:1;">
                      <option value="single" ${q.type === "single" ? "selected" : ""}>Один верный вариант</option>
                      <option value="multiple" ${q.type === "multiple" ? "selected" : ""}>Несколько верных вариантов</option>
                      <option value="text" ${q.type === "text" ? "selected" : ""}>Числовой / краткий ответ</option>
                    </select>
                    <input type="number" class="input q-points" style="width:110px;" min="1" value="${q.points}" title="Баллы" />
                  </div>
                  ${
                    q.type === "text"
                      ? `<div class="field" style="margin-bottom:0;">
                          <label>Правильный ответ (если несколько вариантов записи, через запятую с точкой с запятой: 9.8; 9,8)</label>
                          <input type="text" class="input q-correct-text" value="${escapeHtml(q.correctText)}" placeholder="Например: 12" required />
                        </div>`
                      : `<div>
                          <div class="hint" style="margin-bottom:6px;">Отметьте правильный вариант(ы):</div>
                          ${q.options
                            .map(
                              (opt, oi) => `
                                <div class="q-option-row">
                                  <input type="${q.type === "single" ? "radio" : "checkbox"}" name="correct-${qi}" class="q-opt-check" data-oi="${oi}" ${q.correct.includes(oi) ? "checked" : ""} />
                                  <input type="text" class="input q-opt-input" data-oi="${oi}" placeholder="Вариант ${oi + 1}" value="${escapeHtml(opt)}" required />
                                  ${q.options.length > 2 ? `<button type="button" class="icon-btn remove-opt-btn" data-oi="${oi}">&times;</button>` : ""}
                                </div>
                              `
                            )
                            .join("")}
                          <button type="button" class="btn btn-outline btn-sm add-opt-btn">+ Вариант</button>
                        </div>`
                  }
                </div>
              `;
            })
            .join("");

          $$(".q-builder-item", listEl).forEach(item => {
            const qi = Number(item.dataset.qi);
            const q = questions[qi];
            $(".q-text", item).addEventListener("input", e => (q.text = e.target.value));
            $(".q-points", item).addEventListener("input", e => (q.points = Number(e.target.value) || 1));
            $(".q-type", item).addEventListener("change", e => {
              q.type = e.target.value;
              if (q.type === "single" && q.correct.length > 1) q.correct = [q.correct[0]];
              renderBuilderQuestions();
            });
            $(".remove-q-btn", item)?.addEventListener("click", () => {
              questions.splice(qi, 1);
              renderBuilderQuestions();
            });

            if (q.type === "text") {
              $(".q-correct-text", item).addEventListener("input", e => (q.correctText = e.target.value));
            } else {
              $$(".q-opt-input", item).forEach(inp => {
                inp.addEventListener("input", e => (q.options[Number(inp.dataset.oi)] = e.target.value));
              });
              $$(".q-opt-check", item).forEach(chk => {
                chk.addEventListener("change", () => {
                  const oi = Number(chk.dataset.oi);
                  if (q.type === "single") {
                    q.correct = [oi];
                  } else {
                    if (chk.checked) {
                      if (!q.correct.includes(oi)) q.correct.push(oi);
                    } else {
                      q.correct = q.correct.filter(x => x !== oi);
                    }
                  }
                });
              });
              $$(".remove-opt-btn", item).forEach(btn => {
                btn.addEventListener("click", () => {
                  const oi = Number(btn.dataset.oi);
                  q.options.splice(oi, 1);
                  q.correct = q.correct.filter(x => x !== oi).map(x => (x > oi ? x - 1 : x));
                  if (q.correct.length === 0) q.correct = [0];
                  renderBuilderQuestions();
                });
              });
              $(".add-opt-btn", item).addEventListener("click", () => {
                q.options.push("");
                renderBuilderQuestions();
              });
            }
          });
        }

        renderBuilderQuestions();

        $("#addQuestionBtn", root).addEventListener("click", () => {
          questions.push({ text: "", type: "single", options: ["", ""], correct: [0], correctText: "", points: 1 });
          renderBuilderQuestions();
        });

        $("#testBuilderForm", root).addEventListener("submit", async e => {
          e.preventDefault();
          await dbInsert("tests", {
            title: e.target.title.value.trim(),
            lesson_id: e.target.lesson_id.value || null,
            description: e.target.description.value.trim(),
            questions
          });
          closeModal();
          toast("Тест опубликован!");
          await loadAllData();
        });
      }
    );
  }

  function openTakeTestModal(testId) {
    const test = state.tests.find(t => t.id === testId);
    if (!test) return;

    openModal(
      test.title,
      `
      <form id="takeTestForm">
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
          <div class="field" style="flex:1; min-width:180px;">
            <label>Фамилия и Имя</label>
            <input type="text" name="student_name" class="input" placeholder="Сидорова Анна" required />
          </div>
          <div class="field" style="width:130px;">
            <label>Класс</label>
            <input type="text" name="student_class" class="input" placeholder="9Б" required />
          </div>
        </div>
        ${test.questions
          .map((q, qi) => {
            if (q.type === "text") {
              return `
                <div class="quiz-question-card">
                  <div><strong>${qi + 1}.</strong> ${escapeHtml(q.text)} <span class="tag">${q.points || 1} б.</span></div>
                  <input type="text" class="input" style="margin-top:10px;" name="q_${qi}" placeholder="Введите ответ..." required />
                </div>
              `;
            }
            const inputType = q.type === "single" ? "radio" : "checkbox";
            return `
              <div class="quiz-question-card">
                <div><strong>${qi + 1}.</strong> ${escapeHtml(q.text)} <span class="tag">${q.points || 1} б.</span></div>
                ${q.options
                  .map(
                    (opt, oi) => `
                    <label class="quiz-opt-label">
                      <input type="${inputType}" name="q_${qi}" value="${oi}" ${q.type === "single" ? "required" : ""} />
                      <span>${escapeHtml(opt)}</span>
                    </label>
                  `
                  )
                  .join("")}
              </div>
            `;
          })
          .join("")}
        <button type="submit" class="btn btn-primary" style="width:100%">Завершить тест и узнать результат</button>
      </form>
      `,
      root => {
        $("#takeTestForm", root).addEventListener("submit", async e => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const student_name = fd.get("student_name").trim();
          const student_class = fd.get("student_class").trim();

          let score = 0;
          let max_score = 0;
          const details = [];

          test.questions.forEach((q, qi) => {
            const pts = Number(q.points) || 1;
            max_score += pts;
            let ok = false;

            if (q.type === "text") {
              const userVal = String(fd.get(`q_${qi}`) || "").trim().toLowerCase().replace(",", ".");
              const accepted = String(q.correctText || "")
                .split(";")
                .map(x => x.trim().toLowerCase().replace(",", "."))
                .filter(Boolean);
              ok = accepted.includes(userVal);
            } else {
              const picked = fd.getAll(`q_${qi}`).map(Number).sort((a, b) => a - b);
              const expected = [...(q.correct || [])].sort((a, b) => a - b);
              ok = picked.length === expected.length && picked.every((v, idx) => v === expected[idx]);
            }

            if (ok) score += pts;
            details.push({ qi, ok });
          });

          await dbInsert("test_results", {
            test_id: test.id,
            student_name,
            student_class,
            score,
            max_score,
            answers: details
          });

          const pct = max_score ? Math.round((score / max_score) * 100) : 0;
          $("#modalBody").innerHTML = `
            <div style="text-align:center; padding:12px 0;">
              <h2>Результат: ${score} из ${max_score} (${pct}%)</h2>
              <p class="muted">Ответы сохранены для учителя.</p>
              <div style="text-align:left; margin:18px 0;">
                ${details
                  .map(
                    d => `<div class="quiz-question-card" style="display:flex; justify-content:space-between;">
                      <span>Вопрос ${d.qi + 1}</span>
                      <span class="tag ${d.ok ? "tag-success" : "tag-warning"}">${d.ok ? "Верно" : "Ошибка"}</span>
                    </div>`
                  )
                  .join("")}
              </div>
              <button class="btn btn-primary" id="closeResultBtn">Готово</button>
            </div>
          `;
          $("#closeResultBtn").addEventListener("click", closeModal);
          await loadAllData();
        });
      }
    );
  }

  // ---------- Student Search ----------
  $("#studentSearchForm").addEventListener("submit", e => {
    e.preventDefault();
    const nameQ = $("#searchStudentName").value.trim().toLowerCase();
    const classQ = $("#searchStudentClass").value.trim().toLowerCase();

    const mySubs = state.submissions.filter(s => {
      const okName = s.student_name.toLowerCase().includes(nameQ);
      const okClass = !classQ || s.student_class.toLowerCase() === classQ;
      return okName && okClass;
    });

    const myTests = state.testResults.filter(r => {
      const okName = r.student_name.toLowerCase().includes(nameQ);
      const okClass = !classQ || r.student_class.toLowerCase() === classQ;
      return okName && okClass;
    });

    const area = $("#studentResultsArea");
    if (mySubs.length === 0 && myTests.length === 0) {
      area.innerHTML = `<div class="empty-state">Работы с таким именем пока не найдены.</div>`;
      return;
    }

    area.innerHTML = `
      <div class="submission-list">
        ${mySubs
          .map(s => {
            const hw = state.homeworks.find(h => h.id === s.homework_id);
            return `
              <div class="submission-card">
                <div class="submission-top">
                  <div>
                    <strong>${escapeHtml(hw?.title || "Домашнее задание")}</strong>
                    <div class="hint">${escapeHtml(s.student_name)} (${escapeHtml(s.student_class)}) · ${formatDate(s.created_at)}</div>
                  </div>
                  <span class="tag ${s.status === "graded" ? "tag-success" : "tag-warning"}">
                    ${s.status === "graded" ? `Оценка: ${escapeHtml(s.grade)}` : "На проверке"}
                  </span>
                </div>
                ${s.teacher_comment ? `<p><strong>Комментарий учителя:</strong> ${escapeHtml(s.teacher_comment)}</p>` : ""}
              </div>
            `;
          })
          .join("")}
        ${myTests
          .map(r => {
            const t = state.tests.find(x => x.id === r.test_id);
            const pct = r.max_score ? Math.round((r.score / r.max_score) * 100) : 0;
            return `
              <div class="submission-card">
                <div class="submission-top">
                  <div>
                    <strong>Тест: ${escapeHtml(t?.title || "Тест")}</strong>
                    <div class="hint">${escapeHtml(r.student_name)} (${escapeHtml(r.student_class)}) · ${formatDate(r.created_at)}</div>
                  </div>
                  <span class="tag tag-primary">${r.score} / ${r.max_score} (${pct}%)</span>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  });

  // ---------- Render All ----------
  function renderAll() {
    updatePendingBadge();
    renderLessonsView();
    renderTestsView();
    if (state.activeView === "review") renderReviewView();
  }

  // ---------- EGE Variants (Демидова 2027: 30 вариантов × 26 задач) ----------
  const EGE_STORAGE_KEY = "physics_platform_ege_demidova_2027";
  const EGE_VARIANTS_COUNT = 30;
  const EGE_TASKS_PER_VARIANT = 26;

  function loadEgeProgress() {
    try {
      return JSON.parse(localStorage.getItem(EGE_STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveEgeProgress(data) {
    localStorage.setItem(EGE_STORAGE_KEY, JSON.stringify(data));
  }

  function renderEgeView() {
    const grid = $("#egeVariantsGrid");
    if (!grid) return;

    const progress = loadEgeProgress();
    let totalDone = 0;
    const totalMax = EGE_VARIANTS_COUNT * EGE_TASKS_PER_VARIANT;

    for (let v = 1; v <= EGE_VARIANTS_COUNT; v++) {
      const doneArr = Array.isArray(progress[v]) ? progress[v] : [];
      totalDone += doneArr.length;
    }

    $("#egeTotalProgress").textContent = `${totalDone} / ${totalMax}`;
    $("#egeTotalBar").style.width = `${Math.round((totalDone / totalMax) * 100)}%`;

    const filter = $("#egeFilter")?.value || "all";
    const cards = [];

    for (let v = 1; v <= EGE_VARIANTS_COUNT; v++) {
      const doneSet = new Set(Array.isArray(progress[v]) ? progress[v] : []);
      const count = doneSet.size;
      if (filter === "done" && count < EGE_TASKS_PER_VARIANT) continue;
      if (filter === "todo" && count > 0) continue;
      if (filter === "in-progress" && (count === 0 || count === EGE_TASKS_PER_VARIANT)) continue;

      const pct = Math.round((count / EGE_TASKS_PER_VARIANT) * 100);
      const taskBtns = [];
      for (let t = 1; t <= EGE_TASKS_PER_VARIANT; t++) {
        const isDone = doneSet.has(t);
        const isPart2 = t >= 21;
        taskBtns.push(
          `<button type="button" class="ege-task-btn ${isPart2 ? "part2" : ""} ${isDone ? "done" : ""}" data-variant="${v}" data-task="${t}" title="Задание №${t} (${isPart2 ? "Часть 2" : "Часть 1"})">${t}</button>`
        );
      }

      cards.push(`
        <div class="ege-card">
          <div class="ege-card-head">
            <h3>Вариант ${v}</h3>
            <span class="tag ${count === EGE_TASKS_PER_VARIANT ? "tag-success" : count > 0 ? "tag-primary" : ""}">${count} / ${EGE_TASKS_PER_VARIANT}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${pct}%"></div>
          </div>
          <div class="ege-tasks-grid">${taskBtns.join("")}</div>
          <div class="ege-card-foot">
            <span>№1–20: Часть 1 · №21–26: Часть 2</span>
            <button type="button" class="btn btn-outline btn-sm ege-toggle-all" data-variant="${v}">
              ${count === EGE_TASKS_PER_VARIANT ? "Сбросить" : "Всё решено"}
            </button>
          </div>
        </div>
      `);
    }

    grid.innerHTML = cards.length
      ? cards.join("")
      : `<div class="empty-state">Нет вариантов по выбранному фильтру.</div>`;

    $$(".ege-task-btn", grid).forEach(btn => {
      btn.addEventListener("click", () => {
        const v = Number(btn.dataset.variant);
        const t = Number(btn.dataset.task);
        const p = loadEgeProgress();
        const set = new Set(Array.isArray(p[v]) ? p[v] : []);
        if (set.has(t)) set.delete(t);
        else set.add(t);
        p[v] = Array.from(set).sort((a, b) => a - b);
        saveEgeProgress(p);
        renderEgeView();
      });
    });

    $$(".ege-toggle-all", grid).forEach(btn => {
      btn.addEventListener("click", () => {
        const v = Number(btn.dataset.variant);
        const p = loadEgeProgress();
        const current = Array.isArray(p[v]) ? p[v] : [];
        if (current.length === EGE_TASKS_PER_VARIANT) {
          p[v] = [];
        } else {
          p[v] = Array.from({ length: EGE_TASKS_PER_VARIANT }, (_, i) => i + 1);
        }
        saveEgeProgress(p);
        renderEgeView();
      });
    });
  }

  // ---------- Event Wiring ----------
  function initTheme() {
    const saved = localStorage.getItem("physics_theme") || "light";
    document.documentElement.setAttribute("data-theme", saved);
    $("#themeIcon").textContent = saved === "dark" ? "☀️" : "🌙";
    $("#themeToggle").addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("physics_theme", next);
      $("#themeIcon").textContent = next === "dark" ? "☀️" : "🌙";
    });
  }

  function initEvents() {
    if (cfg.SITE_TITLE) $("#siteTitle").textContent = cfg.SITE_TITLE;
    if (!isSupabaseConfigured) $("#demoBanner").classList.remove("hidden");

    $("#resetDemoBtn")?.addEventListener("click", () => {
      localStorage.removeItem(DEMO_KEY);
      loadAllData();
      toast("Демо-данные сброшены");
    });

    $$(".nav-pill").forEach(btn => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    $("#authBtn").addEventListener("click", async () => {
      if (state.isTeacher) {
        if (!isSupabaseConfigured) {
          localStorage.removeItem(DEMO_TEACHER_KEY);
        } else {
          await sb.auth.signOut();
        }
        await syncAuth();
        renderAll();
        toast("Вы вышли из режима учителя");
      } else {
        openLoginModal();
      }
    });

    $("#addLessonBtn").addEventListener("click", () => openLessonModal());
    $("#createTestBtn").addEventListener("click", () => openTestBuilderModal());

    $$(".seg-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        $$(".seg-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.reviewTab = btn.dataset.reviewTab;
        renderReviewView();
      });
    });

    $("#filterStatus").addEventListener("change", renderReviewView);
    $("#filterLesson").addEventListener("change", renderReviewView);
    $("#egeFilter")?.addEventListener("change", renderEgeView);
    $("#egeResetAllBtn")?.addEventListener("click", () => {
      if (!confirm("Сбросить все отметки по вариантам ЕГЭ?")) return;
      localStorage.removeItem(EGE_STORAGE_KEY);
      renderEgeView();
      toast("Отметки вариантов ЕГЭ сброшены");
    });

    $("#modalClose").addEventListener("click", closeModal);
    $("#modalBackdrop").addEventListener("click", e => {
      if (e.target === $("#modalBackdrop")) closeModal();
    });
    $("#lightboxClose").addEventListener("click", () => $("#lightbox").classList.add("hidden"));
    $("#lightbox").addEventListener("click", e => {
      if (e.target === $("#lightbox")) $("#lightbox").classList.add("hidden");
    });
  }

  // ---------- Boot ----------
  window.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    initEvents();
    await syncAuth();
    await loadAllData();
  });
})();
