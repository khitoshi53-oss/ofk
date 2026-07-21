/* 営業管理アプリ本体ロジック
 * Firestore (Firebase) をバックエンドに使い、複数端末からリアルタイムに
 * 予定表・TODO・日報・確定/見込・取引先データを共有する。
 */

const REPS = ["新谷 壮央", "白木 寿樹", "川﨑 人志"];

const state = {
  currentUser: null,
  db: null,
  auth: null,
  currentView: "view-dashboard",
  editing: { collection: null, id: null },
  calendar: { weekStart: startOfWeek(todayStr()) },
  data: {
    schedule: [],
    todos: [],
    dailyReports: [],
    deals: [],
    clients: [],
    settings: null,
  },
};

/* ---------------- Firebase init ---------------- */
function initFirebase() {
  try {
    if (!window.FIREBASE_CONFIG || window.FIREBASE_CONFIG.apiKey === "YOUR_API_KEY") {
      setGateStatus("⚠ firebase-config.js が未設定です。SETUP_GUIDE.md の手順に沿って設定してください。");
      return false;
    }
    firebase.initializeApp(window.FIREBASE_CONFIG);
    state.db = firebase.firestore();
    state.auth = firebase.auth();
    return true;
  } catch (e) {
    console.error(e);
    setGateStatus("⚠ Firebaseの初期化に失敗しました: " + e.message);
    return false;
  }
}

function setGateStatus(msg) {
  const el = document.getElementById("gate-status");
  if (el) el.textContent = msg;
}

function signInAnon() {
  return state.auth.signInAnonymously();
}

/* ---------------- Gate (name select) ---------------- */
function setupGate() {
  const wrap = document.getElementById("gate-rep-buttons");
  wrap.innerHTML = "";
  REPS.forEach((rep) => {
    const btn = document.createElement("button");
    btn.textContent = rep;
    btn.addEventListener("click", () => chooseUser(rep));
    wrap.appendChild(btn);
  });

  const saved = localStorage.getItem("eigyo_current_user");
  if (saved && REPS.includes(saved)) {
    chooseUser(saved, true);
  }
}

function chooseUser(rep, silent) {
  state.currentUser = rep;
  localStorage.setItem("eigyo_current_user", rep);
  document.getElementById("current-user-label").textContent = rep + " さん";
  if (!silent) enterApp();
  else enterApp();
}

function enterApp() {
  document.getElementById("gate").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
}

document.getElementById("switch-user-btn").addEventListener("click", () => {
  document.getElementById("app").classList.add("hidden");
  document.getElementById("gate").classList.remove("hidden");
});

/* ---------------- Nav ---------------- */
function setupNav() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
      const viewId = btn.dataset.view;
      document.getElementById(viewId).classList.remove("hidden");
      state.currentView = viewId;
    });
  });
}

/* ---------------- Modals ---------------- */
function setupModals() {
  document.querySelectorAll("[data-open-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.editing = { collection: null, id: null };
      openModal(btn.dataset.openModal);
      if (btn.dataset.openModal === "modal-schedule") {
        document.getElementById("schedule-delete-btn").classList.add("hidden");
        document.getElementById("form-schedule").date.value = todayStr();
      }
    });
  });
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeAllModals());
  });
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeAllModals();
    });
  });
}
function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}
function closeAllModals() {
  document.querySelectorAll(".modal-backdrop").forEach((m) => m.classList.add("hidden"));
  document.querySelectorAll(".modal-card").forEach((f) => f.reset && f.reset());
  document.getElementById("schedule-delete-btn").classList.add("hidden");
  state.editing = { collection: null, id: null };
}

function populateRepSelects() {
  const selects = document.querySelectorAll(
    'select[name="rep"], select[name="assignee"], select[name="owner"], #schedule-rep-filter, #todo-rep-filter, #report-rep-filter, #deal-rep-filter'
  );
  selects.forEach((sel) => {
    const keepFirst = sel.querySelector('option[value=""]');
    sel.innerHTML = "";
    if (keepFirst) sel.appendChild(keepFirst);
    REPS.forEach((rep) => {
      const opt = document.createElement("option");
      opt.value = rep;
      opt.textContent = rep;
      sel.appendChild(opt);
    });
  });
}

/* ---------------- Firestore CRUD helpers ---------------- */
function colRef(name) {
  return state.db.collection(name);
}

function addDoc(collection, data) {
  return colRef(collection).add({
    ...data,
    createdBy: state.currentUser,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

function updateDoc(collection, id, data) {
  return colRef(collection).doc(id).update({
    ...data,
    updatedBy: state.currentUser,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

function deleteDoc(collection, id) {
  return colRef(collection).doc(id).delete();
}

function listen(collection, onChange) {
  colRef(collection)
    .orderBy("createdAt", "desc")
    .onSnapshot(
      (snap) => {
        const items = [];
        snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
        onChange(items);
      },
      (err) => {
        console.error("listen error", collection, err);
        showToast("データ取得エラー: " + collection);
      }
    );
}

/* ---------------- Toast ---------------- */
let toastTimer;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2200);
}

/* ---------------- Formatting helpers ---------------- */
function yen(n) {
  n = Number(n) || 0;
  return "¥" + n.toLocaleString("ja-JP");
}
function fmtDate(d) {
  if (!d) return "";
  return d;
}
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ================================================================
 * 予定表（担当者 × 曜日の週グリッド表示）
 * ================================================================ */
const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

function startOfWeek(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - d.getDay());
  return d;
}
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function openScheduleModalFor(dateStr, rep) {
  state.editing = { collection: null, id: null };
  document.getElementById("schedule-delete-btn").classList.add("hidden");
  openModal("modal-schedule");
  const form = document.getElementById("form-schedule");
  form.date.value = dateStr;
  if (rep) form.rep.value = rep;
}
function renderSchedule() {
  const weekStart = new Date(state.calendar.weekStart);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  document.getElementById("cal-month-label").textContent =
    `${days[0].getFullYear()}年${days[0].getMonth() + 1}月${days[0].getDate()}日 〜 ` +
    `${days[6].getMonth() + 1}月${days[6].getDate()}日`;

  const repFilter = document.getElementById("schedule-rep-filter").value;
  const reps = repFilter ? [repFilter] : REPS;
  const today = todayStr();

  const itemsByRepDate = {};
  state.data.schedule.forEach((item) => {
    if (!item.date || !item.rep) return;
    if (repFilter && item.rep !== repFilter) return;
    itemsByRepDate[item.rep] = itemsByRepDate[item.rep] || {};
    (itemsByRepDate[item.rep][item.date] = itemsByRepDate[item.rep][item.date] || []).push(item);
  });

  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  const headerRow = document.createElement("div");
  headerRow.className = "week-row week-header-row";
  headerRow.appendChild(Object.assign(document.createElement("div"), { className: "week-cell week-corner" }));
  days.forEach((d) => {
    const dateStr = toDateStr(d);
    const cell = document.createElement("div");
    cell.className = "week-cell week-day-header";
    if (d.getDay() === 6) cell.classList.add("week-sat");
    if (d.getDay() === 0) cell.classList.add("week-sun");
    if (dateStr === today) cell.classList.add("week-today");
    cell.textContent = `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS_JA[d.getDay()]})`;
    headerRow.appendChild(cell);
  });
  grid.appendChild(headerRow);

  reps.forEach((rep) => {
    const row = document.createElement("div");
    row.className = "week-row";
    const labelCell = document.createElement("div");
    labelCell.className = "week-cell week-rep-label";
    labelCell.textContent = rep;
    row.appendChild(labelCell);

    days.forEach((d) => {
      const dateStr = toDateStr(d);
      const cell = document.createElement("div");
      cell.className = "week-cell week-day-cell";
      if (d.getDay() === 6) cell.classList.add("week-sat");
      if (d.getDay() === 0) cell.classList.add("week-sun");
      if (dateStr === today) cell.classList.add("week-today");

      const items = ((itemsByRepDate[rep] && itemsByRepDate[rep][dateStr]) || []).slice();
      items.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      items.forEach((item) => {
        const chip = document.createElement("div");
        chip.className = "week-item-chip";

        const line1 = document.createElement("div");
        line1.className = "chip-line1";
        const timeSpan = document.createElement("span");
        timeSpan.className = "chip-time";
        timeSpan.textContent = item.time || "終日";
        line1.appendChild(timeSpan);
        if (items.length > 1) {
          const dupTag = document.createElement("span");
          dupTag.className = "chip-dup";
          dupTag.textContent = "重複";
          line1.appendChild(dupTag);
        }
        chip.appendChild(line1);

        if (item.content) {
          const line2 = document.createElement("div");
          line2.className = "chip-line2";
          line2.textContent = item.content;
          chip.appendChild(line2);
        }

        if (item.memo) chip.title = item.memo;
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          editSchedule(item);
        });
        cell.appendChild(chip);
      });
      cell.addEventListener("click", () => openScheduleModalFor(dateStr, rep));
      row.appendChild(cell);
    });
    grid.appendChild(row);
  });
}
function editSchedule(item) {
  state.editing = { collection: "schedule", id: item.id };
  const form = document.getElementById("form-schedule");
  form.date.value = item.date || "";
  form.rep.value = item.rep || "";
  form.time.value = item.time || "";
  form.content.value = item.content || "";
  form.memo.value = item.memo || "";
  document.getElementById("schedule-delete-btn").classList.remove("hidden");
  openModal("modal-schedule");
}
document.getElementById("form-schedule").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const payload = {
    date: f.date.value,
    rep: f.rep.value,
    time: f.time.value,
    content: f.content.value,
    memo: f.memo.value,
  };
  const p =
    state.editing.collection === "schedule"
      ? updateDoc("schedule", state.editing.id, payload)
      : addDoc("schedule", payload);
  p.then(() => {
    showToast("予定を保存しました");
    closeAllModals();
  }).catch((err) => showToast("保存エラー: " + err.message));
});
document.getElementById("schedule-delete-btn").addEventListener("click", () => {
  if (state.editing.collection !== "schedule" || !state.editing.id) return;
  if (!confirm("この予定を削除しますか？")) return;
  deleteDoc("schedule", state.editing.id)
    .then(() => {
      showToast("予定を削除しました");
      closeAllModals();
    })
    .catch((err) => showToast("削除エラー: " + err.message));
});

/* ================================================================
 * TODO
 * ================================================================ */
function elapsedDays(dueDate) {
  if (!dueDate) return "";
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((today - due) / 86400000);
  return diff;
}
function renderTodo() {
  const statusFilter = document.getElementById("todo-status-filter").value;
  const repFilter = document.getElementById("todo-rep-filter").value;
  let items = state.data.todos.slice();
  if (statusFilter) items = items.filter((i) => i.status === statusFilter);
  if (repFilter) items = items.filter((i) => i.assignee === repFilter);

  const list = document.getElementById("todo-list");
  list.innerHTML = "";
  if (items.length === 0) {
    list.innerHTML = '<div class="empty-msg">タスクがありません</div>';
    return;
  }
  items.forEach((item) => {
    const overdue = item.status !== "完了" && item.dueDate && elapsedDays(item.dueDate) > 0;
    const el = document.createElement("div");
    el.className = "list-item";
    el.innerHTML = `
      <div class="row1"><span>${escapeHtml(item.title || "")}</span><span class="tag status-${escapeHtml(item.status || "未着手")}">${escapeHtml(item.status || "未着手")}</span></div>
      <div class="row2">担当: ${escapeHtml(item.assignee || "-")} ／ 依頼者: ${escapeHtml(item.requester || "-")}</div>
      <div class="row2">期限: ${escapeHtml(item.dueDate || "-")} ${overdue ? "⚠ 期限超過" : ""}</div>
      ${item.memo ? `<div class="row2">📝 ${escapeHtml(item.memo)}</div>` : ""}
      <div class="item-actions">
        <button data-edit="${item.id}">編集</button>
        <button data-delete="${item.id}" class="danger">削除</button>
      </div>`;
    el.querySelector("[data-edit]").addEventListener("click", () => editTodo(item));
    el.querySelector("[data-delete]").addEventListener("click", () => {
      if (confirm("このタスクを削除しますか？")) deleteDoc("todos", item.id);
    });
    list.appendChild(el);
  });
}
function editTodo(item) {
  state.editing = { collection: "todos", id: item.id };
  const form = document.getElementById("form-todo");
  form.assignee.value = item.assignee || "";
  form.requester.value = item.requester || "";
  form.title.value = item.title || "";
  form.contactMethod.value = item.contactMethod || "";
  form.category.value = item.category || "";
  form.requestDate.value = item.requestDate || "";
  form.dueDate.value = item.dueDate || "";
  form.status.value = item.status || "未着手";
  form.memo.value = item.memo || "";
  openModal("modal-todo");
}
document.getElementById("form-todo").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const payload = {
    assignee: f.assignee.value,
    requester: f.requester.value,
    title: f.title.value,
    contactMethod: f.contactMethod.value,
    category: f.category.value,
    requestDate: f.requestDate.value,
    dueDate: f.dueDate.value,
    status: f.status.value,
    memo: f.memo.value,
  };
  const p =
    state.editing.collection === "todos"
      ? updateDoc("todos", state.editing.id, payload)
      : addDoc("todos", payload);
  p.then(() => {
    showToast("タスクを保存しました");
    closeAllModals();
  }).catch((err) => showToast("保存エラー: " + err.message));
});

/* ================================================================
 * 日報
 * ================================================================ */
function renderReports() {
  const repFilter = document.getElementById("report-rep-filter").value;
  const monthFilter = document.getElementById("report-month-filter").value; // YYYY-MM
  let items = state.data.dailyReports.slice();
  if (repFilter) items = items.filter((i) => i.rep === repFilter);
  if (monthFilter) items = items.filter((i) => (i.date || "").startsWith(monthFilter));
  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  // summary
  const summaryEl = document.getElementById("report-summary");
  const monthKey = monthFilter || currentMonthKey();
  const monthItems = state.data.dailyReports.filter(
    (i) => (repFilter ? i.rep === repFilter : true) && (i.date || "").startsWith(monthKey)
  );
  const submittedDays = new Set(monthItems.map((i) => i.date)).size;
  summaryEl.innerHTML = `
    <h3>${monthKey} のサマリー ${repFilter ? "（" + escapeHtml(repFilter) + "）" : "（全担当者）"}</h3>
    <table class="mini-table">
      <tr><th>提出日数</th><td>${submittedDays}日</td></tr>
      <tr><th>訪問件数</th><td>${monthItems.length}件</td></tr>
    </table>`;

  const list = document.getElementById("report-list");
  list.innerHTML = "";
  if (items.length === 0) {
    list.innerHTML = '<div class="empty-msg">日報がありません</div>';
    return;
  }
  items.forEach((item) => {
    const el = document.createElement("div");
    el.className = "list-item";
    el.innerHTML = `
      <div class="row1"><span>${escapeHtml(item.date || "")} ${escapeHtml(item.time || "")}</span><span class="tag">${escapeHtml(item.rep || "")}</span></div>
      <div class="row2">顧客: ${escapeHtml(item.clientName || "")} ／ 区分: ${escapeHtml(item.workType || "-")}</div>
      <div class="row2">${escapeHtml(item.content || "")}</div>
      <div class="row2">請求対象: ${escapeHtml(item.billing || "-")} ／ 次回訪問: ${escapeHtml(item.nextVisit || "-")}</div>
      <div class="item-actions">
        <button data-edit="${item.id}">編集</button>
        <button data-delete="${item.id}" class="danger">削除</button>
      </div>`;
    el.querySelector("[data-edit]").addEventListener("click", () => editReport(item));
    el.querySelector("[data-delete]").addEventListener("click", () => {
      if (confirm("この日報を削除しますか？")) deleteDoc("dailyReports", item.id);
    });
    list.appendChild(el);
  });
}
function editReport(item) {
  state.editing = { collection: "dailyReports", id: item.id };
  const form = document.getElementById("form-report");
  form.rep.value = item.rep || "";
  form.date.value = item.date || "";
  form.clientName.value = item.clientName || "";
  form.content.value = item.content || "";
  form.workType.value = item.workType || "";
  form.billing.value = item.billing || "対象";
  form.nextVisit.value = item.nextVisit || "";
  form.time.value = item.time || "";
  openModal("modal-report");
}
document.getElementById("form-report").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const payload = {
    rep: f.rep.value,
    date: f.date.value,
    clientName: f.clientName.value,
    content: f.content.value,
    workType: f.workType.value,
    billing: f.billing.value,
    nextVisit: f.nextVisit.value,
    time: f.time.value,
  };
  const p =
    state.editing.collection === "dailyReports"
      ? updateDoc("dailyReports", state.editing.id, payload)
      : addDoc("dailyReports", payload);
  p.then(() => {
    showToast("日報を保存しました");
    closeAllModals();
  }).catch((err) => showToast("保存エラー: " + err.message));
});

/* ================================================================
 * 確定・見込
 * ================================================================ */
function renderDeals() {
  const typeFilter = document.getElementById("deal-type-filter").value;
  const repFilter = document.getElementById("deal-rep-filter").value;
  let items = state.data.deals.slice();
  if (typeFilter) items = items.filter((i) => i.type === typeFilter);
  if (repFilter) items = items.filter((i) => i.owner === repFilter);

  const totalSales = items.reduce((s, i) => s + (Number(i.salesAmount) || 0), 0);
  const totalProfit = items.reduce((s, i) => s + (Number(i.grossProfit) || 0), 0);
  document.getElementById("deal-summary").innerHTML = `
    <h3>集計</h3>
    <table class="mini-table">
      <tr><th>件数</th><td>${items.length}件</td></tr>
      <tr><th>売上金額合計</th><td>${yen(totalSales)}</td></tr>
      <tr><th>粗利益合計</th><td>${yen(totalProfit)}</td></tr>
    </table>`;

  const list = document.getElementById("deal-list");
  list.innerHTML = "";
  if (items.length === 0) {
    list.innerHTML = '<div class="empty-msg">案件がありません</div>';
    return;
  }
  items.forEach((item) => {
    const el = document.createElement("div");
    el.className = "list-item";
    el.innerHTML = `
      <div class="row1"><span>${escapeHtml(item.clientName || "")}</span><span class="tag type-${escapeHtml(item.type || "見込")}">${escapeHtml(item.type || "見込")}</span></div>
      <div class="row2">担当: ${escapeHtml(item.owner || "-")} ／ 商品: ${escapeHtml(item.product || "-")}</div>
      <div class="row2">売上: ${yen(item.salesAmount)} ／ 粗利: ${yen(item.grossProfit)} ／ 確度: ${escapeHtml(String(item.probability ?? "-"))}%</div>
      <div class="row2">ステージ: ${escapeHtml(item.stage || "-")} ／ 受注予定: ${escapeHtml(item.expectedDate || "-")}</div>
      <div class="tags">
        ${item.invoiced ? '<span class="tag">伝票発行済</span>' : ""}
        ${item.competition ? `<span class="tag">${escapeHtml(item.competition)}</span>` : ""}
      </div>
      <div class="item-actions">
        <button data-edit="${item.id}">編集</button>
        <button data-delete="${item.id}" class="danger">削除</button>
      </div>`;
    el.querySelector("[data-edit]").addEventListener("click", () => editDeal(item));
    el.querySelector("[data-delete]").addEventListener("click", () => {
      if (confirm("この案件を削除しますか？")) deleteDoc("deals", item.id);
    });
    list.appendChild(el);
  });
}
function editDeal(item) {
  state.editing = { collection: "deals", id: item.id };
  const form = document.getElementById("form-deal");
  form.type.value = item.type || "確定";
  form.owner.value = item.owner || "";
  form.clientName.value = item.clientName || "";
  form.product.value = item.product || "";
  form.salesAmount.value = item.salesAmount || "";
  form.grossProfit.value = item.grossProfit || "";
  form.probability.value = item.probability || "";
  form.stage.value = item.stage || "";
  form.expectedDate.value = item.expectedDate || "";
  form.competition.value = item.competition || "";
  form.invoiced.checked = !!item.invoiced;
  form.memo.value = item.memo || "";
  openModal("modal-deal");
}
document.getElementById("form-deal").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const salesAmount = Number(f.salesAmount.value) || 0;
  const probability = Number(f.probability.value) || 0;
  const payload = {
    type: f.type.value,
    owner: f.owner.value,
    clientName: f.clientName.value,
    product: f.product.value,
    salesAmount,
    grossProfit: Number(f.grossProfit.value) || 0,
    probability,
    weightedAmount: Math.round((salesAmount * probability) / 100),
    stage: f.stage.value,
    expectedDate: f.expectedDate.value,
    competition: f.competition.value,
    invoiced: f.invoiced.checked,
    memo: f.memo.value,
  };
  const p =
    state.editing.collection === "deals"
      ? updateDoc("deals", state.editing.id, payload)
      : addDoc("deals", payload);
  p.then(() => {
    showToast("案件を保存しました");
    closeAllModals();
  }).catch((err) => showToast("保存エラー: " + err.message));
});

/* ================================================================
 * 取引先
 * ================================================================ */
function renderClients() {
  const q = (document.getElementById("client-search").value || "").trim();
  let items = state.data.clients.slice();
  if (q) {
    items = items.filter(
      (i) => (i.company || "").includes(q) || (i.kanaCompany || "").includes(q)
    );
  }
  items.sort((a, b) => (a.company || "").localeCompare(b.company || "", "ja"));

  const list = document.getElementById("client-list");
  list.innerHTML = "";
  if (items.length === 0) {
    list.innerHTML = '<div class="empty-msg">取引先が登録されていません</div>';
    return;
  }
  items.forEach((item) => {
    const el = document.createElement("div");
    el.className = "list-item";
    el.innerHTML = `
      <div class="row1"><span>${escapeHtml(item.company || "")}</span></div>
      <div class="row2">${escapeHtml(item.kanaCompany || "")}</div>
      <div class="row2">${item.zip ? "〒" + escapeHtml(item.zip) + " " : ""}${escapeHtml(item.address || "")}</div>
      <div class="row2">TEL: ${escapeHtml(item.tel || "-")} ／ FAX: ${escapeHtml(item.fax || "-")}</div>
      <div class="row2">担当: ${escapeHtml(item.dept || "-")} ${escapeHtml(item.contactName || "")} ／ ${escapeHtml(item.email || "-")}</div>
      ${item.paymentTerms ? `<div class="row2">支払条件: ${escapeHtml(item.paymentTerms)}</div>` : ""}
      <div class="item-actions">
        <button data-edit="${item.id}">編集</button>
        <button data-delete="${item.id}" class="danger">削除</button>
      </div>`;
    el.querySelector("[data-edit]").addEventListener("click", () => editClient(item));
    el.querySelector("[data-delete]").addEventListener("click", () => {
      if (confirm("この取引先を削除しますか？")) deleteDoc("clients", item.id);
    });
    list.appendChild(el);
  });
}
function editClient(item) {
  state.editing = { collection: "clients", id: item.id };
  const form = document.getElementById("form-client");
  form.company.value = item.company || "";
  form.kanaCompany.value = item.kanaCompany || "";
  form.repName.value = item.repName || "";
  form.zip.value = item.zip || "";
  form.address.value = item.address || "";
  form.tel.value = item.tel || "";
  form.fax.value = item.fax || "";
  form.dept.value = item.dept || "";
  form.contactName.value = item.contactName || "";
  form.email.value = item.email || "";
  form.paymentTerms.value = item.paymentTerms || "";
  form.memo.value = item.memo || "";
  openModal("modal-client");
}
document.getElementById("form-client").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const payload = {
    company: f.company.value,
    kanaCompany: f.kanaCompany.value,
    repName: f.repName.value,
    zip: f.zip.value,
    address: f.address.value,
    tel: f.tel.value,
    fax: f.fax.value,
    dept: f.dept.value,
    contactName: f.contactName.value,
    email: f.email.value,
    paymentTerms: f.paymentTerms.value,
    memo: f.memo.value,
  };
  const p =
    state.editing.collection === "clients"
      ? updateDoc("clients", state.editing.id, payload)
      : addDoc("clients", payload);
  p.then(() => {
    showToast("取引先を保存しました");
    closeAllModals();
  }).catch((err) => showToast("保存エラー: " + err.message));
});
document.getElementById("client-search").addEventListener("input", renderClients);

/* ================================================================
 * ダッシュボード
 * ================================================================ */
function renderDashboard() {
  const settings = state.data.settings || {
    monthlyProfitTarget: 0,
    monthlySalesTarget: Array(12).fill(0),
    monthlyProfitTargetByMonth: Array(12).fill(0),
    lastYearMonthlySales: Array(12).fill(0),
  };
  const now = new Date();
  const monthIdx = now.getMonth(); // 0-11
  const monthKey = currentMonthKey();

  const confirmedInvoiced = state.data.deals.filter((d) => d.type === "確定" && d.invoiced);
  const confirmedNotInvoiced = state.data.deals.filter((d) => d.type === "確定" && !d.invoiced);
  const prospects = state.data.deals.filter((d) => d.type === "見込");

  const sum = (arr, key) => arr.reduce((s, i) => s + (Number(i[key]) || 0), 0);

  const salesInvoiced = sum(confirmedInvoiced, "salesAmount");
  const profitInvoiced = sum(confirmedInvoiced, "grossProfit");
  const salesConfirmedNoInvoice = sum(confirmedNotInvoiced, "salesAmount");
  const profitConfirmedNoInvoice = sum(confirmedNotInvoiced, "grossProfit");
  const salesProspect = sum(prospects, "salesAmount");
  const profitProspect = sum(prospects, "grossProfit");

  const salesTarget = (settings.monthlySalesTarget && settings.monthlySalesTarget[monthIdx]) || 0;
  const profitTarget = (settings.monthlyProfitTargetByMonth && settings.monthlyProfitTargetByMonth[monthIdx]) || settings.monthlyProfitTarget || 0;

  const kpiGrid = document.getElementById("kpi-grid");
  kpiGrid.innerHTML = "";
  const kpis = [
    { label: "売上（伝票発行済）", value: yen(salesInvoiced), sub: `目標 ${yen(salesTarget)}`, cls: salesInvoiced >= salesTarget && salesTarget > 0 ? "good" : "" },
    { label: "粗利（伝票発行済）", value: yen(profitInvoiced), sub: `目標 ${yen(profitTarget)}`, cls: profitInvoiced >= profitTarget && profitTarget > 0 ? "good" : "" },
    { label: "確定（伝票未発行）売上", value: yen(salesConfirmedNoInvoice), sub: `粗利 ${yen(profitConfirmedNoInvoice)}`, cls: "" },
    { label: "見込 売上", value: yen(salesProspect), sub: `粗利 ${yen(profitProspect)}`, cls: "" },
  ];
  kpis.forEach((k) => {
    const div = document.createElement("div");
    div.className = "kpi-card " + k.cls;
    div.innerHTML = `<div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div><div class="kpi-sub">${k.sub}</div>`;
    kpiGrid.appendChild(div);
  });

  // sales chart: this year (from deals, by expectedDate month, 確定 only) vs last year (settings)
  const thisYearMonthly = Array(12).fill(0);
  state.data.deals
    .filter((d) => d.type === "確定" && d.expectedDate)
    .forEach((d) => {
      const m = new Date(d.expectedDate).getMonth();
      if (!isNaN(m)) thisYearMonthly[m] += Number(d.salesAmount) || 0;
    });
  const lastYear = settings.lastYearMonthlySales || Array(12).fill(0);
  const maxVal = Math.max(1, ...thisYearMonthly, ...lastYear);
  const chartEl = document.getElementById("sales-chart");
  chartEl.innerHTML = "";
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  legend.innerHTML = '<span class="legend-this">今年</span><span class="legend-last">前年</span>';
  chartEl.parentElement.insertBefore(legend, chartEl);
  for (let m = 0; m < 12; m++) {
    const group = document.createElement("div");
    group.className = "bar-group";
    const bars = document.createElement("div");
    bars.className = "bars";
    const b1 = document.createElement("div");
    b1.className = "bar this-year";
    b1.style.height = Math.round((thisYearMonthly[m] / maxVal) * 100) + "%";
    b1.title = `今年 ${m + 1}月: ${yen(thisYearMonthly[m])}`;
    const b2 = document.createElement("div");
    b2.className = "bar last-year";
    b2.style.height = Math.round((lastYear[m] / maxVal) * 100) + "%";
    b2.title = `前年 ${m + 1}月: ${yen(lastYear[m])}`;
    bars.appendChild(b1);
    bars.appendChild(b2);
    const label = document.createElement("div");
    label.className = "bar-label";
    label.textContent = m + 1 + "月";
    group.appendChild(bars);
    group.appendChild(label);
    chartEl.appendChild(group);
  }

  // TODO summary per rep
  const todoTable = document.getElementById("dash-todo-table");
  let rows = '<tr><th>担当者</th><th>未着手</th><th>進行中</th><th>完了</th><th>期限切れ</th></tr>';
  const totals = { 未着手: 0, 進行中: 0, 完了: 0, overdue: 0 };
  REPS.forEach((rep) => {
    const mine = state.data.todos.filter((t) => t.assignee === rep);
    const counts = { 未着手: 0, 進行中: 0, 完了: 0, overdue: 0 };
    mine.forEach((t) => {
      counts[t.status || "未着手"] = (counts[t.status || "未着手"] || 0) + 1;
      if (t.status !== "完了" && t.dueDate && elapsedDays(t.dueDate) > 0) counts.overdue++;
    });
    Object.keys(totals).forEach((k) => (totals[k] += counts[k] || 0));
    rows += `<tr><td>${escapeHtml(rep)}</td><td>${counts["未着手"]}</td><td>${counts["進行中"]}</td><td>${counts["完了"]}</td><td>${counts.overdue}</td></tr>`;
  });
  rows += `<tr><td><b>合計</b></td><td>${totals["未着手"]}</td><td>${totals["進行中"]}</td><td>${totals["完了"]}</td><td>${totals.overdue}</td></tr>`;
  todoTable.innerHTML = rows;

  // Daily report submission status this month
  const reportTable = document.getElementById("dash-report-table");
  const businessDaysSoFar = businessDaysInMonthSoFar();
  let rrows = '<tr><th>担当者</th><th>今月提出数</th><th>営業日数</th><th>提出率</th></tr>';
  REPS.forEach((rep) => {
    const days = new Set(
      state.data.dailyReports.filter((r) => r.rep === rep && (r.date || "").startsWith(monthKey)).map((r) => r.date)
    ).size;
    const rate = businessDaysSoFar > 0 ? Math.round((days / businessDaysSoFar) * 100) : 0;
    rrows += `<tr><td>${escapeHtml(rep)}</td><td>${days}日</td><td>${businessDaysSoFar}日</td><td>${rate}% ${rate < 80 ? "⚠" : "✅"}</td></tr>`;
  });
  reportTable.innerHTML = rrows;
}

function businessDaysInMonthSoFar() {
  const now = new Date();
  let count = 0;
  for (let d = 1; d <= now.getDate(); d++) {
    const date = new Date(now.getFullYear(), now.getMonth(), d);
    const day = date.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/* ---------------- Utils ---------------- */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ---------------- Wire filters to re-render ---------------- */
function setupFilters() {
  document.getElementById("schedule-rep-filter").addEventListener("change", renderSchedule);
  document.getElementById("cal-prev").addEventListener("click", () => {
    const d = new Date(state.calendar.weekStart);
    d.setDate(d.getDate() - 7);
    state.calendar.weekStart = d;
    renderSchedule();
  });
  document.getElementById("cal-next").addEventListener("click", () => {
    const d = new Date(state.calendar.weekStart);
    d.setDate(d.getDate() + 7);
    state.calendar.weekStart = d;
    renderSchedule();
  });
  document.getElementById("cal-today").addEventListener("click", () => {
    state.calendar.weekStart = startOfWeek(todayStr());
    renderSchedule();
  });
  ["todo-status-filter", "todo-rep-filter"].forEach((id) =>
    document.getElementById(id).addEventListener("change", renderTodo)
  );
  ["report-rep-filter", "report-month-filter"].forEach((id) =>
    document.getElementById(id).addEventListener("change", renderReports)
  );
  ["deal-type-filter", "deal-rep-filter"].forEach((id) =>
    document.getElementById(id).addEventListener("change", renderDeals)
  );
  document.getElementById("report-month-filter").value = currentMonthKey();
}

/* ---------------- Bootstrap ---------------- */
function loadSettings() {
  state.db
    .collection("settings")
    .doc("main")
    .get()
    .then((doc) => {
      if (doc.exists) {
        state.data.settings = doc.data();
      } else {
        // seed default settings on first run
        const defaults = {
          monthlyProfitTarget: 2000000,
          monthlySalesTarget: [5000000, 5000000, 5000000, 5000000, 5000000, 5000000, 5000000, 0, 0, 0, 0, 0],
          monthlyProfitTargetByMonth: [3000000, 3000000, 3000000, 3000000, 3000000, 3000000, 3000000, 0, 0, 0, 0, 0],
          lastYearMonthlySales: [4079512, 7617207, 8389019, 3148879, 3204342, 1932761, 2187642, 4761530, 3990195, 4098109, 2999198, 1905012],
        };
        state.db.collection("settings").doc("main").set(defaults);
        state.data.settings = defaults;
      }
      renderDashboard();
    })
    .catch((err) => console.error("settings load error", err));
}

function startListeners() {
  listen("schedule", (items) => {
    state.data.schedule = items;
    renderSchedule();
    renderDashboard();
  });
  listen("todos", (items) => {
    state.data.todos = items;
    renderTodo();
    renderDashboard();
  });
  listen("dailyReports", (items) => {
    state.data.dailyReports = items;
    renderReports();
    renderDashboard();
  });
  listen("deals", (items) => {
    state.data.deals = items;
    renderDeals();
    renderDashboard();
  });
  listen("clients", (items) => {
    state.data.clients = items;
    renderClients();
  });
}

function init() {
  setupGate();
  setupNav();
  setupModals();
  setupFilters();
  populateRepSelects();

  if (!initFirebase()) return;

  signInAnon()
    .then(() => {
      setGateStatus("接続しました。お名前を選んでください。");
      loadSettings();
      startListeners();
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("sw.js").catch(() => {});
      }
    })
    .catch((err) => {
      console.error(err);
      setGateStatus("⚠ 接続エラー: " + err.message + "（SETUP_GUIDEでAnonymous認証が有効か確認してください）");
    });
}

init();
