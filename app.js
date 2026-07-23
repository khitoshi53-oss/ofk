/* 営業管理アプリ本体ロジック
 * Firestore (Firebase) をバックエンドに使い、複数端末からリアルタイムに
 * 予定表・TODO・日報・確定/見込・取引先データを共有する。
 */

const REPS = ["新谷 壮央", "白木 寿樹", "川﨑 人志"];
// 社員別 売上・粗利の金額を入力・変更できるのは管理者（川﨑）のみ
const ADMIN_REP = "川﨑 人志";

const state = {
  currentUser: null,
  db: null,
  auth: null,
  currentView: "view-dashboard",
  editing: { collection: null, id: null },
  calendar: { weekStart: startOfWeek(todayStr()) },
  holidays: {}, // "YYYY-MM-DD" -> 祝日名
  data: {
    schedule: [],
    todos: [],
    dailyReports: [],
    deals: [],
    clients: [],
    requests: [],
    orders: [],
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
        showScheduleCompanionSection(true);
        renderCompanionList();
      }
      if (btn.dataset.openModal === "modal-report") {
        document.getElementById("report-modal-title").textContent = "日報を追加";
        document.getElementById("report-delete-btn").classList.add("hidden");
        document.getElementById("report-add-entry-btn").classList.remove("hidden");
        document.getElementById("report-entries").innerHTML = "";
        document.getElementById("form-report").date.value = todayStr();
        addReportEntry();
      }
      if (btn.dataset.openModal === "modal-target") {
        fillTargetForm();
      }
      if (btn.dataset.openModal === "modal-deal") {
        updateDealFormVisibility();
      }
      if (btn.dataset.openModal === "modal-leave") {
        document.getElementById("leave-modal-title").textContent = "有給休暇申請";
        document.getElementById("leave-delete-btn").classList.add("hidden");
        const form = document.getElementById("form-leave");
        form.startDate.value = todayStr();
        form.endDate.value = todayStr();
        form.status.value = "承認待ち";
      }
      if (btn.dataset.openModal === "modal-expense") {
        document.getElementById("expense-modal-title").textContent = "経費精算申請";
        document.getElementById("expense-delete-btn").classList.add("hidden");
        const form = document.getElementById("form-expense");
        form.expenseDate.value = todayStr();
        form.status.value = "承認待ち";
      }
      if (btn.dataset.openModal === "modal-order") {
        document.getElementById("order-modal-title").textContent = "受注書を追加";
        document.getElementById("order-delete-btn").classList.add("hidden");
        const form = document.getElementById("form-order");
        form.orderDate.value = todayStr();
        form.deliveryNoteStatus.value = "未発行";
        updateOrderSupplierVisibility();
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
  document.getElementById("schedule-companion-toggle").checked = false;
  document.getElementById("schedule-companion-list").classList.add("hidden");
  document.getElementById("schedule-companion-list").innerHTML = "";
  document.getElementById("report-delete-btn").classList.add("hidden");
  document.getElementById("report-add-entry-btn").classList.remove("hidden");
  document.getElementById("report-entries").innerHTML = "";
  document.getElementById("leave-delete-btn").classList.add("hidden");
  document.getElementById("expense-delete-btn").classList.add("hidden");
  document.getElementById("order-delete-btn").classList.add("hidden");
  document.getElementById("order-supplier-other-wrap").classList.add("hidden");
  state.editing = { collection: null, id: null };
}

/* ---------------- 予定: 同行スタッフ選択 ---------------- */
function showScheduleCompanionSection(show) {
  const wrap = document.getElementById("schedule-companion-toggle").closest("label");
  const addTodoLabel = document.querySelector('#form-schedule input[name="addTodo"]').closest("label");
  [wrap, addTodoLabel].forEach((el) => el.classList.toggle("hidden", !show));
  if (!show) {
    document.getElementById("schedule-companion-toggle").checked = false;
    document.getElementById("schedule-companion-list").classList.add("hidden");
  }
}
function renderCompanionList() {
  const list = document.getElementById("schedule-companion-list");
  const currentRep = document.getElementById("form-schedule").rep.value;
  list.innerHTML = "";
  REPS.filter((rep) => rep !== currentRep).forEach((rep) => {
    const label = document.createElement("label");
    label.className = "checkbox-label companion-item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = rep;
    input.name = "companion";
    label.appendChild(input);
    label.appendChild(document.createTextNode(rep));
    list.appendChild(label);
  });
}
function getCheckedCompanions() {
  return Array.from(document.querySelectorAll('#schedule-companion-list input[name="companion"]:checked')).map(
    (el) => el.value
  );
}
document.getElementById("schedule-companion-toggle").addEventListener("change", (e) => {
  document.getElementById("schedule-companion-list").classList.toggle("hidden", !e.target.checked);
});
document.getElementById("form-schedule").rep.addEventListener("change", renderCompanionList);

function populateRepSelects() {
  const selects = document.querySelectorAll(
    'select[name="rep"], select[name="assignee"], select[name="owner"], select[name="requester"], select[name="orderTakenBy"], select[name="orderPlacedBy"], select[name="deliveredBy"], #schedule-rep-filter, #todo-rep-filter, #report-rep-filter, #deal-rep-filter, #request-rep-filter, #order-rep-filter'
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

// 予定表は「当日を一番左」にした7日間表示にするため、
// 日曜始まりへの補正はせず、指定日をそのまま起点にする。
function startOfWeek(dateStr) {
  return new Date(dateStr + "T00:00:00");
}
/* --- 日本の祝祭日（holidays-jp.github.io の公開APIを利用、オフライン用にキャッシュ） --- */
const HOLIDAYS_CACHE_KEY = "eigyo_jp_holidays_v1";
function loadHolidays() {
  try {
    const cached = JSON.parse(localStorage.getItem(HOLIDAYS_CACHE_KEY) || "null");
    if (cached && cached.data) {
      state.holidays = cached.data;
      renderSchedule();
    }
  } catch (e) {
    /* ignore cache errors */
  }
  fetch("https://holidays-jp.github.io/api/v1/date.json")
    .then((res) => res.json())
    .then((data) => {
      state.holidays = data || {};
      try {
        localStorage.setItem(HOLIDAYS_CACHE_KEY, JSON.stringify({ data: state.holidays, fetchedAt: Date.now() }));
      } catch (e) {
        /* ignore storage errors */
      }
      renderSchedule();
    })
    .catch((err) => console.warn("祝日データの取得に失敗しました", err));
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
  showScheduleCompanionSection(true);
  renderCompanionList();
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
    const holidayName = state.holidays && state.holidays[dateStr];
    const cell = document.createElement("div");
    cell.className = "week-cell week-day-header";
    if (d.getDay() === 6) cell.classList.add("week-sat");
    if (d.getDay() === 0 || holidayName) cell.classList.add("week-sun");
    if (dateStr === today) cell.classList.add("week-today");
    cell.innerHTML = `<div>${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS_JA[d.getDay()]})</div>`;
    if (holidayName) {
      cell.title = holidayName;
      cell.innerHTML += `<div class="week-holiday-name">${escapeHtml(holidayName)}</div>`;
    }
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
      const holidayName = state.holidays && state.holidays[dateStr];
      const cell = document.createElement("div");
      cell.className = "week-cell week-day-cell";
      if (d.getDay() === 6) cell.classList.add("week-sat");
      if (d.getDay() === 0 || holidayName) cell.classList.add("week-sun");
      if (dateStr === today) cell.classList.add("week-today");

      const items = ((itemsByRepDate[rep] && itemsByRepDate[rep][dateStr]) || []).slice();
      items.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      items.forEach((item) => {
        const chip = document.createElement("div");
        chip.className = "week-item-chip";
        if (item.type) chip.classList.add("chip-type-" + item.type);

        const line1 = document.createElement("div");
        line1.className = "chip-line1";
        const timeSpan = document.createElement("span");
        timeSpan.className = "chip-time";
        const typeLabel = item.type ? item.type + " " : "";
        timeSpan.textContent = `${typeLabel}${item.time || "終日"}`;
        line1.appendChild(timeSpan);
        chip.appendChild(line1);

        const line2Text = [item.clientName, item.content].filter(Boolean).join(" / ");
        if (line2Text) {
          const line2 = document.createElement("div");
          line2.className = "chip-line2";
          line2.textContent = line2Text;
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

  renderScheduleMarquee(state.data.settings || {});
}
function editSchedule(item) {
  state.editing = { collection: "schedule", id: item.id };
  const form = document.getElementById("form-schedule");
  form.date.value = item.date || "";
  form.rep.value = item.rep || "";
  form.type.value = item.type || "外出";
  form.clientName.value = item.clientName || "";
  form.time.value = item.time || "";
  form.content.value = item.content || "";
  form.memo.value = item.memo || "";
  form.addTodo.checked = false;
  document.getElementById("schedule-delete-btn").classList.remove("hidden");
  // 既存の予定の編集では、同行複製・TODO追加は行わない（二重登録を避けるため）
  showScheduleCompanionSection(false);
  openModal("modal-schedule");
}
document.getElementById("form-schedule").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const payload = {
    date: f.date.value,
    rep: f.rep.value,
    type: f.type.value,
    clientName: f.clientName.value,
    time: f.time.value,
    content: f.content.value,
    memo: f.memo.value,
  };
  const isNew = state.editing.collection !== "schedule";
  const companionReps = isNew ? getCheckedCompanions() : [];
  const addTodoFlag = isNew && f.addTodo.checked;

  const writes = [];
  writes.push(
    isNew ? addDoc("schedule", payload) : updateDoc("schedule", state.editing.id, payload)
  );
  companionReps.forEach((repName) => {
    writes.push(addDoc("schedule", { ...payload, rep: repName }));
  });

  if (addTodoFlag && payload.content) {
    const todoAssignees = [payload.rep, ...companionReps];
    todoAssignees.forEach((assignee) => {
      writes.push(
        addDoc("todos", {
          assignee,
          requester: "",
          title: payload.content,
          contactMethod: "",
          category: payload.type || "",
          requestDate: todayStr(),
          dueDate: payload.date,
          status: "未着手",
          memo: payload.clientName ? `お客様: ${payload.clientName}` : "",
        })
      );
    });
  }

  Promise.all(writes)
    .then(() => {
      showToast("予定を保存しました");
      closeAllModals();
    })
    .catch((err) => showToast("保存エラー: " + err.message));
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
 * 受注書
 * ================================================================ */
function updateOrderSupplierVisibility() {
  const form = document.getElementById("form-order");
  document.getElementById("order-supplier-other-wrap").classList.toggle("hidden", form.supplier.value !== "その他");
}
document.getElementById("form-order").supplier.addEventListener("change", updateOrderSupplierVisibility);

function orderSupplierLabel(item) {
  return item.supplier === "その他" ? item.supplierOther || "その他" : item.supplier || "-";
}

function orderItemTotals(items) {
  return (items || []).reduce(
    (acc, it) => {
      acc.qty += Number(it.qty) || 0;
      acc.cost += Number(it.costAmount) || 0;
      acc.sale += Number(it.saleAmount) || 0;
      return acc;
    },
    { qty: 0, cost: 0, sale: 0 }
  );
}

function renderOrders() {
  const statusFilter = document.getElementById("order-status-filter").value;
  const repFilter = document.getElementById("order-rep-filter").value;
  let items = state.data.orders.slice();
  if (statusFilter) items = items.filter((i) => (i.deliveryNoteStatus || "未発行") === statusFilter);
  if (repFilter) items = items.filter((i) => i.orderTakenBy === repFilter);
  items.sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || ""));

  const list = document.getElementById("order-list");
  list.innerHTML = "";
  if (items.length === 0) {
    list.innerHTML = '<div class="empty-msg">受注書がありません</div>';
    return;
  }
  items.forEach((item) => {
    const status = item.deliveryNoteStatus || "未発行";
    const totals = orderItemTotals(item.items);
    const productNames = (item.items || []).map((it) => it.productName).filter(Boolean).join("、");
    const el = document.createElement("div");
    el.className = "list-item";
    el.innerHTML = `
      <div class="row1"><span>${escapeHtml(item.clientName || "")}</span><span class="tag status-${escapeHtml(status)}">${escapeHtml(status)}</span></div>
      <div class="row2">受注日: ${escapeHtml(item.orderDate || "-")} ／ 受注者: ${escapeHtml(item.orderTakenBy || "-")}</div>
      <div class="row2">発注日: ${escapeHtml(item.purchaseDate || "-")} ／ 発注者: ${escapeHtml(item.orderPlacedBy || "-")} ／ 発注先: ${escapeHtml(orderSupplierLabel(item))}</div>
      <div class="row2">納品日: ${escapeHtml(item.deliveryDate || "-")} ／ 納品者: ${escapeHtml(item.deliveredBy || "-")}</div>
      ${productNames ? `<div class="row2">商品: ${escapeHtml(productNames)}</div>` : ""}
      <div class="row2">数量計: ${totals.qty} ／ 仕切金額計: ${yen(totals.cost)} ／ 販売金額計: ${yen(totals.sale)}</div>
      <div class="item-actions">
        <button data-edit="${item.id}">編集</button>
        <button data-delete="${item.id}" class="danger">削除</button>
      </div>`;
    el.querySelector("[data-edit]").addEventListener("click", () => editOrder(item));
    el.querySelector("[data-delete]").addEventListener("click", () => {
      if (confirm("この受注書を削除しますか？")) deleteDoc("orders", item.id);
    });
    list.appendChild(el);
  });
}

function editOrder(item) {
  state.editing = { collection: "orders", id: item.id };
  const form = document.getElementById("form-order");
  form.clientName.value = item.clientName || "";
  form.orderDate.value = item.orderDate || "";
  form.orderTakenBy.value = item.orderTakenBy || "";
  form.purchaseDate.value = item.purchaseDate || "";
  form.orderPlacedBy.value = item.orderPlacedBy || "";
  form.supplier.value = item.supplier || "";
  form.supplierOther.value = item.supplierOther || "";
  form.deliveryDate.value = item.deliveryDate || "";
  form.deliveredBy.value = item.deliveredBy || "";
  form.deliveryNoteStatus.value = item.deliveryNoteStatus || "未発行";
  form.memo.value = item.memo || "";
  updateOrderSupplierVisibility();

  const rows = document.querySelectorAll("#form-order .order-item-row[data-order-row]");
  const savedItems = item.items || [];
  rows.forEach((row, idx) => {
    const it = savedItems[idx] || {};
    row.querySelector('[data-field="productName"]').value = it.productName || "";
    row.querySelector('[data-field="qty"]').value = it.qty || "";
    row.querySelector('[data-field="costAmount"]').value = it.costAmount || "";
    row.querySelector('[data-field="saleAmount"]').value = it.saleAmount || "";
  });

  document.getElementById("order-modal-title").textContent = "受注書を編集";
  document.getElementById("order-delete-btn").classList.remove("hidden");
  openModal("modal-order");
}

document.getElementById("form-order").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const rows = document.querySelectorAll("#form-order .order-item-row[data-order-row]");
  const items = Array.from(rows)
    .map((row) => ({
      productName: row.querySelector('[data-field="productName"]').value,
      qty: row.querySelector('[data-field="qty"]').value,
      costAmount: row.querySelector('[data-field="costAmount"]').value,
      saleAmount: row.querySelector('[data-field="saleAmount"]').value,
    }))
    .filter((it) => it.productName || it.qty || it.costAmount || it.saleAmount);

  const payload = {
    clientName: f.clientName.value,
    orderDate: f.orderDate.value,
    orderTakenBy: f.orderTakenBy.value,
    purchaseDate: f.purchaseDate.value,
    orderPlacedBy: f.orderPlacedBy.value,
    supplier: f.supplier.value,
    supplierOther: f.supplier.value === "その他" ? f.supplierOther.value : "",
    deliveryDate: f.deliveryDate.value,
    deliveredBy: f.deliveredBy.value,
    deliveryNoteStatus: f.deliveryNoteStatus.value,
    memo: f.memo.value,
    items,
  };

  const p =
    state.editing.collection === "orders" && state.editing.id
      ? updateDoc("orders", state.editing.id, payload)
      : addDoc("orders", payload);
  p.then(() => {
    showToast("受注書を保存しました");
    closeAllModals();
  }).catch((err) => showToast("保存エラー: " + err.message));
});
document.getElementById("order-delete-btn").addEventListener("click", () => {
  if (state.editing.collection !== "orders" || !state.editing.id) return;
  if (!confirm("この受注書を削除しますか？")) return;
  deleteDoc("orders", state.editing.id)
    .then(() => {
      showToast("受注書を削除しました");
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

/* --- 日報画面: 「＋ 日報をまとめて入力」の横にある顧客名検索で、その顧客の全履歴を表示 --- */
function renderReportClientHistorySearch() {
  const input = document.getElementById("report-client-history-search");
  const card = document.getElementById("report-client-history-card");
  if (!input || !card) return;
  const q = input.value.trim();
  if (!q) {
    card.innerHTML = "";
    card.classList.add("hidden");
    return;
  }
  const matches = state.data.dailyReports
    .filter((r) => (r.clientName || "").includes(q))
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (matches.length === 0) {
    card.innerHTML = `<h3>🕘 「${escapeHtml(q)}」の履歴</h3><div class="history-empty">この顧客の過去履歴はありません</div>`;
    card.classList.remove("hidden");
    return;
  }
  card.innerHTML =
    `<h3>🕘 「${escapeHtml(q)}」の履歴（${matches.length}件）</h3>` +
    matches
      .map(
        (m) => `
      <div class="history-item">
        <div class="history-item-row1"><span class="history-date">${escapeHtml(m.date || "")}</span><span class="history-rep">${escapeHtml(m.rep || "")}</span></div>
        <div class="history-item-row2">${escapeHtml(m.content || m.workType || "-")}</div>
        <div class="history-item-row3">請求対象: ${escapeHtml(m.billing || "-")} ／ 次回訪問: ${escapeHtml(m.nextVisit || "-")}</div>
      </div>`
      )
      .join("");
  card.classList.remove("hidden");
}
function setupReportClientHistorySearch() {
  const input = document.getElementById("report-client-history-search");
  if (!input) return;
  input.addEventListener("input", renderReportClientHistorySearch);
}
/* --- 日報モーダル: 1日分の訪問・案件をまとめて入力するエントリー行 --- */
let reportEntrySeq = 0;
function createReportEntryEl(data) {
  data = data || {};
  reportEntrySeq++;
  const wrap = document.createElement("div");
  wrap.className = "report-entry";
  wrap.dataset.entrySeq = String(reportEntrySeq);
  wrap.innerHTML = `
    <div class="report-entry-header">
      <span class="report-entry-num"></span>
      <button type="button" class="report-entry-remove">✕ この行を削除</button>
    </div>
    <label>顧客名<input type="text" data-field="clientName" list="known-clients" required autocomplete="off" /></label>
    <div class="report-entry-history hidden" data-history></div>
    <label>内容<input type="text" data-field="content" /></label>
    <label>作業区分
      <select data-field="workType">
        <option value="">選択してください</option>
        <option value="営業">営業</option>
        <option value="納品">納品</option>
        <option value="集金">集金</option>
        <option value="来社">来社</option>
        <option value="設置">設置</option>
        <option value="訪問修理">訪問修理</option>
        <option value="訪問サポート">訪問サポート</option>
        <option value="リモートサポート">リモートサポート</option>
        <option value="電話サポート">電話サポート</option>
        <option value="持込修理">持込修理</option>
        <option value="持込サポート">持込サポート</option>
        <option value="その他">その他</option>
      </select>
    </label>
    <label>請求対象
      <select data-field="billing">
        <option value="対象">対象</option>
        <option value="対象外">対象外</option>
        <option value="保守契約">保守契約</option>
        <option value="リモート保守契約">リモート保守契約</option>
        <option value="見積請求">見積請求</option>
      </select>
    </label>
    <label>次回訪問<input type="date" data-field="nextVisit" /></label>
    <label>時間
      <span class="report-entry-time-row">
        <input type="time" data-field="timeStart" />
        <span class="report-entry-time-sep">〜</span>
        <input type="time" data-field="timeEnd" />
      </span>
    </label>`;
  wrap.querySelector('[data-field="clientName"]').value = data.clientName || "";
  wrap.querySelector('[data-field="content"]').value = data.content || "";
  wrap.querySelector('[data-field="workType"]').value = data.workType || "";
  wrap.querySelector('[data-field="billing"]').value = data.billing || "対象";
  wrap.querySelector('[data-field="nextVisit"]').value = data.nextVisit || "";
  const [savedTimeStart, savedTimeEnd] = (data.time || "").split("〜");
  wrap.querySelector('[data-field="timeStart"]').value = savedTimeStart || "";
  wrap.querySelector('[data-field="timeEnd"]').value = savedTimeEnd || "";
  wrap.querySelector(".report-entry-remove").addEventListener("click", () => {
    wrap.remove();
    renumberReportEntries();
  });
  const clientInput = wrap.querySelector('[data-field="clientName"]');
  const historyEl = wrap.querySelector("[data-history]");
  const excludeId = state.editing.collection === "dailyReports" ? state.editing.id : null;
  clientInput.addEventListener("input", () => {
    renderClientHistory(clientInput.value, historyEl, excludeId);
  });
  renderClientHistory(clientInput.value, historyEl, excludeId);
  return wrap;
}
/* 顧客名にマッチする過去の日報履歴を表示 */
function renderClientHistory(name, el, excludeId) {
  const q = (name || "").trim();
  if (!q) {
    el.innerHTML = "";
    el.classList.add("hidden");
    return;
  }
  const matches = state.data.dailyReports
    .filter((r) => r.id !== excludeId && (r.clientName || "").includes(q))
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (matches.length === 0) {
    el.innerHTML = '<div class="history-empty">この顧客の過去履歴はありません</div>';
    el.classList.remove("hidden");
    return;
  }
  const shown = matches.slice(0, 5);
  el.innerHTML =
    `<div class="history-title">🕘 「${escapeHtml(q)}」の履歴（${matches.length}件中${shown.length}件表示）</div>` +
    shown
      .map(
        (m) => `
      <div class="history-item">
        <div class="history-item-row1"><span class="history-date">${escapeHtml(m.date || "")}</span><span class="history-rep">${escapeHtml(m.rep || "")}</span></div>
        <div class="history-item-row2">${escapeHtml(m.content || m.workType || "-")}</div>
      </div>`
      )
      .join("");
  el.classList.remove("hidden");
}
function addReportEntry(data) {
  document.getElementById("report-entries").appendChild(createReportEntryEl(data));
  renumberReportEntries();
}
function renumberReportEntries() {
  const entries = document.querySelectorAll("#report-entries .report-entry");
  entries.forEach((el, idx) => {
    el.querySelector(".report-entry-num").textContent = `訪問・案件 ${idx + 1}`;
    el.querySelector(".report-entry-remove").classList.toggle("hidden", entries.length <= 1);
  });
}
document.getElementById("report-add-entry-btn").addEventListener("click", () => addReportEntry());

function editReport(item) {
  state.editing = { collection: "dailyReports", id: item.id };
  const form = document.getElementById("form-report");
  form.rep.value = item.rep || "";
  form.date.value = item.date || "";
  document.getElementById("report-modal-title").textContent = "日報を編集";
  document.getElementById("report-entries").innerHTML = "";
  addReportEntry(item);
  // 編集は1件のみ（複数行への分割・追加は行わない）
  document.getElementById("report-add-entry-btn").classList.add("hidden");
  document.getElementById("report-delete-btn").classList.remove("hidden");
  openModal("modal-report");
}
document.getElementById("form-report").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const rep = f.rep.value;
  const date = f.date.value;
  const entries = Array.from(document.querySelectorAll("#report-entries .report-entry")).map((el) => {
    const timeStart = el.querySelector('[data-field="timeStart"]').value;
    const timeEnd = el.querySelector('[data-field="timeEnd"]').value;
    let time = "";
    if (timeStart && timeEnd) time = `${timeStart}〜${timeEnd}`;
    else if (timeStart) time = timeStart;
    return {
      clientName: el.querySelector('[data-field="clientName"]').value,
      content: el.querySelector('[data-field="content"]').value,
      workType: el.querySelector('[data-field="workType"]').value,
      billing: el.querySelector('[data-field="billing"]').value,
      nextVisit: el.querySelector('[data-field="nextVisit"]').value,
      time,
    };
  });
  if (entries.length === 0) {
    showToast("少なくとも1件の訪問・案件を入力してください");
    return;
  }

  const p =
    state.editing.collection === "dailyReports" && state.editing.id
      ? updateDoc("dailyReports", state.editing.id, { rep, date, ...entries[0] })
      : Promise.all(entries.map((entry) => addDoc("dailyReports", { rep, date, ...entry })));

  p.then(() => {
    showToast(entries.length > 1 ? `日報を保存しました（${entries.length}件）` : "日報を保存しました");
    closeAllModals();
  }).catch((err) => showToast("保存エラー: " + err.message));
});
document.getElementById("report-delete-btn").addEventListener("click", () => {
  if (state.editing.collection !== "dailyReports" || !state.editing.id) return;
  if (!confirm("この日報を削除しますか？")) return;
  deleteDoc("dailyReports", state.editing.id)
    .then(() => {
      showToast("日報を削除しました");
      closeAllModals();
    })
    .catch((err) => showToast("削除エラー: " + err.message));
});

/* ================================================================
 * 確定・見込
 * ================================================================ */
function renderDeals() {
  const typeFilter = document.getElementById("deal-type-filter").value;
  const categoryFilter = document.getElementById("deal-category-filter").value;
  const repFilter = document.getElementById("deal-rep-filter").value;
  let items = state.data.deals.slice();
  if (typeFilter) items = items.filter((i) => i.type === typeFilter);
  if (categoryFilter) items = items.filter((i) => (i.category || "売掛") === categoryFilter);
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
    const isReceivable = (item.category || "売掛") === "売掛";
    const titleText = isReceivable ? item.receiptNumber ? `伝票番号: ${item.receiptNumber}` : "伝票番号未入力" : item.clientName || "";
    el.innerHTML = `
      <div class="row1"><span>${escapeHtml(titleText)}</span><span class="row1-tags"><span class="tag type-${escapeHtml(item.type || "見込")}">${escapeHtml(item.type || "見込")}</span><span class="tag">${escapeHtml(item.category || "売掛")}</span></span></div>
      <div class="row2">担当: ${escapeHtml(item.owner || "-")}${isReceivable ? "" : ` ／ 商品: ${escapeHtml(item.product || "-")}`}</div>
      <div class="row2">売上: ${yen(item.salesAmount)} ／ 粗利: ${yen(item.grossProfit)}${isReceivable ? "" : ` ／ 確度: ${escapeHtml(String(item.probability ?? "-"))}%`}</div>
      ${isReceivable ? "" : `<div class="row2">ステージ: ${escapeHtml(item.stage || "-")} ／ 受注予定: ${escapeHtml(item.expectedDate || "-")}</div>`}
      <div class="tags">
        ${item.invoiced ? '<span class="tag">伝票発行済</span>' : ""}
        ${!isReceivable && item.competition ? `<span class="tag">${escapeHtml(item.competition)}</span>` : ""}
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
// 契約種別=売掛のときは伝票番号・担当者・売上金額・粗利益のみ表示する
function updateDealFormVisibility() {
  const form = document.getElementById("form-deal");
  const isReceivable = form.category.value === "売掛";
  document
    .querySelectorAll("#form-deal .deal-field-full")
    .forEach((el) => el.classList.toggle("hidden", isReceivable));
  document
    .querySelectorAll("#form-deal .deal-field-receivable")
    .forEach((el) => el.classList.toggle("hidden", !isReceivable));
}
document.getElementById("form-deal").category.addEventListener("change", updateDealFormVisibility);
function editDeal(item) {
  state.editing = { collection: "deals", id: item.id };
  const form = document.getElementById("form-deal");
  form.type.value = item.type || "確定";
  form.category.value = item.category || "売掛";
  form.owner.value = item.owner || "";
  form.receiptNumber.value = item.receiptNumber || "";
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
  updateDealFormVisibility();
  openModal("modal-deal");
}
document.getElementById("form-deal").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const category = f.category.value;
  const isReceivable = category === "売掛";
  const salesAmount = Number(f.salesAmount.value) || 0;
  const grossProfit = Number(f.grossProfit.value) || 0;
  let payload;
  if (isReceivable) {
    const receiptNumber = f.receiptNumber.value.trim();
    payload = {
      type: f.type.value,
      category,
      owner: f.owner.value,
      receiptNumber,
      clientName: "",
      product: "",
      salesAmount,
      grossProfit,
      probability: 0,
      weightedAmount: 0,
      stage: "",
      expectedDate: "",
      competition: "",
      invoiced: !!receiptNumber,
      memo: "",
    };
  } else {
    if (!f.clientName.value.trim()) {
      showToast("顧客名を入力してください");
      return;
    }
    const probability = Number(f.probability.value) || 0;
    payload = {
      type: f.type.value,
      category,
      owner: f.owner.value,
      receiptNumber: "",
      clientName: f.clientName.value,
      product: f.product.value,
      salesAmount,
      grossProfit,
      probability,
      weightedAmount: Math.round((salesAmount * probability) / 100),
      stage: f.stage.value,
      expectedDate: f.expectedDate.value,
      competition: f.competition.value,
      invoiced: f.invoiced.checked,
      memo: f.memo.value,
    };
  }
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
 * 各種申請（有給休暇申請・経費精算申請）
 * ================================================================ */
function requestSortDate(item) {
  return item.startDate || item.expenseDate || "";
}
function renderRequests() {
  const typeFilter = document.getElementById("request-type-filter").value;
  const statusFilter = document.getElementById("request-status-filter").value;
  const repFilter = document.getElementById("request-rep-filter").value;
  let items = state.data.requests.slice();
  if (typeFilter) items = items.filter((i) => i.reqType === typeFilter);
  if (statusFilter) items = items.filter((i) => (i.status || "承認待ち") === statusFilter);
  if (repFilter) items = items.filter((i) => i.rep === repFilter);
  items.sort((a, b) => requestSortDate(b).localeCompare(requestSortDate(a)));

  // summary
  const summaryEl = document.getElementById("request-summary");
  const pendingLeave = state.data.requests.filter(
    (r) => r.reqType === "有給休暇" && (r.status || "承認待ち") === "承認待ち"
  );
  const pendingExpense = state.data.requests.filter(
    (r) => r.reqType === "経費精算" && (r.status || "承認待ち") === "承認待ち"
  );
  const pendingExpenseAmount = pendingExpense.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const approvedExpenseAmount = state.data.requests
    .filter((r) => r.reqType === "経費精算" && r.status === "承認")
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
  summaryEl.innerHTML = `
    <h3>申請サマリー</h3>
    <table class="mini-table">
      <tr><th>有給休暇 承認待ち</th><td>${pendingLeave.length}件</td></tr>
      <tr><th>経費精算 承認待ち</th><td>${pendingExpense.length}件 ／ ${yen(pendingExpenseAmount)}</td></tr>
      <tr><th>経費精算 承認済み合計</th><td>${yen(approvedExpenseAmount)}</td></tr>
    </table>`;

  const list = document.getElementById("request-list");
  list.innerHTML = "";
  if (items.length === 0) {
    list.innerHTML = '<div class="empty-msg">申請がありません</div>';
    return;
  }
  items.forEach((item) => {
    const el = document.createElement("div");
    el.className = "list-item";
    const status = item.status || "承認待ち";
    if (item.reqType === "有給休暇") {
      el.innerHTML = `
        <div class="row1"><span>${escapeHtml(item.rep || "")} ／ 有給休暇申請</span><span class="tag status-${escapeHtml(status)}">${escapeHtml(status)}</span></div>
        <div class="row2">期間: ${escapeHtml(item.startDate || "")} 〜 ${escapeHtml(item.endDate || "")} ／ 日数: ${escapeHtml(String(item.days ?? "-"))}</div>
        ${item.reason ? `<div class="row2">理由: ${escapeHtml(item.reason)}</div>` : ""}
        ${item.memo ? `<div class="row2">📝 ${escapeHtml(item.memo)}</div>` : ""}
        <div class="item-actions">
          <button data-edit="${item.id}">編集</button>
          <button data-delete="${item.id}" class="danger">削除</button>
        </div>`;
    } else {
      el.innerHTML = `
        <div class="row1"><span>${escapeHtml(item.rep || "")} ／ 経費精算申請</span><span class="tag status-${escapeHtml(status)}">${escapeHtml(status)}</span></div>
        <div class="row2">支出日: ${escapeHtml(item.expenseDate || "")} ／ 費目: ${escapeHtml(item.category || "-")}</div>
        <div class="row2">金額: ${yen(item.amount)} ／ 領収書: ${item.hasReceipt ? "あり" : "なし"}</div>
        ${item.content ? `<div class="row2">内容: ${escapeHtml(item.content)}</div>` : ""}
        ${item.memo ? `<div class="row2">📝 ${escapeHtml(item.memo)}</div>` : ""}
        <div class="item-actions">
          <button data-edit="${item.id}">編集</button>
          <button data-delete="${item.id}" class="danger">削除</button>
        </div>`;
    }
    el.querySelector("[data-edit]").addEventListener("click", () => editRequest(item));
    el.querySelector("[data-delete]").addEventListener("click", () => {
      if (confirm("この申請を削除しますか？")) deleteDoc("requests", item.id);
    });
    list.appendChild(el);
  });
}
function editRequest(item) {
  state.editing = { collection: "requests", id: item.id };
  if (item.reqType === "有給休暇") {
    const form = document.getElementById("form-leave");
    form.rep.value = item.rep || "";
    form.startDate.value = item.startDate || "";
    form.endDate.value = item.endDate || "";
    form.days.value = item.days ?? "";
    form.reason.value = item.reason || "";
    form.status.value = item.status || "承認待ち";
    form.memo.value = item.memo || "";
    document.getElementById("leave-modal-title").textContent = "有給休暇申請を編集";
    document.getElementById("leave-delete-btn").classList.remove("hidden");
    openModal("modal-leave");
  } else {
    const form = document.getElementById("form-expense");
    form.rep.value = item.rep || "";
    form.expenseDate.value = item.expenseDate || "";
    form.category.value = item.category || "";
    form.content.value = item.content || "";
    form.amount.value = item.amount || "";
    form.hasReceipt.checked = !!item.hasReceipt;
    form.status.value = item.status || "承認待ち";
    form.memo.value = item.memo || "";
    document.getElementById("expense-modal-title").textContent = "経費精算申請を編集";
    document.getElementById("expense-delete-btn").classList.remove("hidden");
    openModal("modal-expense");
  }
}
document.getElementById("form-leave").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const start = f.startDate.value;
  const end = f.endDate.value;
  let days = Number(f.days.value) || 0;
  if (!days && start && end) {
    const d1 = new Date(start + "T00:00:00");
    const d2 = new Date(end + "T00:00:00");
    days = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
  }
  const payload = {
    reqType: "有給休暇",
    rep: f.rep.value,
    startDate: start,
    endDate: end,
    days: days || 1,
    reason: f.reason.value,
    status: f.status.value,
    memo: f.memo.value,
  };
  const p =
    state.editing.collection === "requests" && state.editing.id
      ? updateDoc("requests", state.editing.id, payload)
      : addDoc("requests", payload);
  p.then(() => {
    showToast("有給休暇申請を保存しました");
    closeAllModals();
  }).catch((err) => showToast("保存エラー: " + err.message));
});
document.getElementById("leave-delete-btn").addEventListener("click", () => {
  if (state.editing.collection !== "requests" || !state.editing.id) return;
  if (!confirm("この申請を削除しますか？")) return;
  deleteDoc("requests", state.editing.id)
    .then(() => {
      showToast("申請を削除しました");
      closeAllModals();
    })
    .catch((err) => showToast("削除エラー: " + err.message));
});
document.getElementById("form-expense").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const payload = {
    reqType: "経費精算",
    rep: f.rep.value,
    expenseDate: f.expenseDate.value,
    category: f.category.value,
    content: f.content.value,
    amount: Number(f.amount.value) || 0,
    hasReceipt: f.hasReceipt.checked,
    status: f.status.value,
    memo: f.memo.value,
  };
  const p =
    state.editing.collection === "requests" && state.editing.id
      ? updateDoc("requests", state.editing.id, payload)
      : addDoc("requests", payload);
  p.then(() => {
    showToast("経費精算申請を保存しました");
    closeAllModals();
  }).catch((err) => showToast("保存エラー: " + err.message));
});
document.getElementById("expense-delete-btn").addEventListener("click", () => {
  if (state.editing.collection !== "requests" || !state.editing.id) return;
  if (!confirm("この申請を削除しますか？")) return;
  deleteDoc("requests", state.editing.id)
    .then(() => {
      showToast("申請を削除しました");
      closeAllModals();
    })
    .catch((err) => showToast("削除エラー: " + err.message));
});

/* ================================================================
 * 社員別 売上・粗利（管理者＝川﨑のみ入力・変更可）
 * ================================================================ */
// 売掛（確定・伝票発行済）案件を担当者ごとに自動集計する
function getAutoRepReceivableTotals() {
  const totals = {};
  state.data.deals
    .filter((d) => (d.category || "売掛") === "売掛" && d.type === "確定" && d.invoiced)
    .forEach((d) => {
      const rep = d.owner || "";
      if (!rep) return;
      totals[rep] = totals[rep] || { sales: 0, profit: 0 };
      totals[rep].sales += Number(d.salesAmount) || 0;
      totals[rep].profit += Number(d.grossProfit) || 0;
    });
  return totals;
}
// リース契約（確定・伝票発行済）案件を担当者ごとに自動集計する
function getAutoRepLeaseTotals() {
  const totals = {};
  state.data.deals
    .filter((d) => d.category === "リース契約" && d.type === "確定" && d.invoiced)
    .forEach((d) => {
      const rep = d.owner || "";
      if (!rep) return;
      totals[rep] = totals[rep] || { sales: 0, profit: 0 };
      totals[rep].sales += Number(d.salesAmount) || 0;
      totals[rep].profit += Number(d.grossProfit) || 0;
    });
  return totals;
}
function openRepSalesModal() {
  const settings = state.data.settings || {};
  const repSales = settings.repSales || {};
  const autoTotals = getAutoRepReceivableTotals();
  const autoLeaseTotals = getAutoRepLeaseTotals();
  const isAdmin = state.currentUser === ADMIN_REP;
  const body = document.getElementById("rep-sales-body");

  const rows = REPS.map((rep) => {
    const entry = repSales[rep] || {};
    const manualSales = Number(entry.sales) || 0;
    const manualProfit = Number(entry.profit) || 0;
    const auto = autoTotals[rep] || { sales: 0, profit: 0 };
    const autoLease = autoLeaseTotals[rep] || { sales: 0, profit: 0 };
    const totalSales = auto.sales + autoLease.sales + manualSales;
    const totalProfit = auto.profit + autoLease.profit + manualProfit;
    if (isAdmin) {
      return `
        <tr>
          <td>${escapeHtml(rep)}</td>
          <td>${yen(auto.sales)}</td>
          <td>${yen(auto.profit)}</td>
          <td>${yen(autoLease.sales)}</td>
          <td>${yen(autoLease.profit)}</td>
          <td><input type="number" min="0" step="1" class="rep-sales-input" data-rep="${escapeHtml(rep)}" data-field="sales" value="${manualSales}" /></td>
          <td><input type="number" min="0" step="1" class="rep-sales-input" data-rep="${escapeHtml(rep)}" data-field="profit" value="${manualProfit}" /></td>
          <td>${yen(totalSales)}</td>
          <td>${yen(totalProfit)}</td>
        </tr>`;
    }
    return `
      <tr>
        <td>${escapeHtml(rep)}</td>
        <td>${yen(auto.sales)}</td>
        <td>${yen(auto.profit)}</td>
        <td>${yen(autoLease.sales)}</td>
        <td>${yen(autoLease.profit)}</td>
        <td>${yen(manualSales)}</td>
        <td>${yen(manualProfit)}</td>
        <td>${yen(totalSales)}</td>
        <td>${yen(totalProfit)}</td>
      </tr>`;
  }).join("");

  body.innerHTML = `
    <div class="rep-sales-table-wrap">
    <table class="mini-table rep-sales-table">
      <tr><th>担当者</th><th>売掛確定<br>売上</th><th>売掛確定<br>粗利</th><th>リース契約確定<br>売上</th><th>リース契約確定<br>粗利</th><th>手動入力<br>売上</th><th>手動入力<br>粗利</th><th>合計<br>売上</th><th>合計<br>粗利</th></tr>
      ${rows}
    </table>
    </div>
    <p class="muted small">「売掛確定」「リース契約確定」は種別が確定かつ伝票発行済の案件から自動集計しています。「手動入力」はそれ以外の調整額です。${isAdmin ? "手動入力欄を変更して「保存」を押してください（管理者のみ編集できます）。" : "手動入力欄の変更は管理者（川﨑）のみ行えます。"}</p>`;

  document.getElementById("rep-sales-save-btn").classList.toggle("hidden", !isAdmin);
  openModal("modal-rep-sales");
}
document.getElementById("rep-sales-save-btn").addEventListener("click", () => {
  if (state.currentUser !== ADMIN_REP) {
    showToast("権限がありません（管理者のみ編集できます）");
    return;
  }
  const repSales = {};
  document.querySelectorAll("#rep-sales-body .rep-sales-input").forEach((input) => {
    const rep = input.dataset.rep;
    const field = input.dataset.field;
    repSales[rep] = repSales[rep] || { sales: 0, profit: 0 };
    repSales[rep][field] = Number(input.value) || 0;
  });
  state.db
    .collection("settings")
    .doc("main")
    .set({ repSales }, { merge: true })
    .then(() => {
      state.data.settings = { ...(state.data.settings || {}), repSales };
      showToast("社員別 売上・粗利を保存しました");
      closeAllModals();
      renderDashboard();
    })
    .catch((err) => showToast("保存エラー: " + err.message));
});

/* ================================================================
 * ダッシュボード
 * ================================================================ */
function renderDashboard() {
  const settings = state.data.settings || {
    monthlyProfitTarget: 0,
    monthlySalesTarget: Array(12).fill(0),
    monthlyProfitTargetByMonth: Array(12).fill(0),
    lastYearMonthlySales: Array(12).fill(0),
    businessDaysOverride: {},
    manualSalesAdjustment: 0,
    manualProfitAdjustment: 0,
    repSales: {},
    dashboardMarquee: "",
  };
  const now = new Date();
  const monthIdx = now.getMonth(); // 0-11
  const monthKey = currentMonthKey();

  const confirmedInvoiced = state.data.deals.filter((d) => d.type === "確定" && d.invoiced);
  const confirmedNotInvoiced = state.data.deals.filter((d) => d.type === "確定" && !d.invoiced);
  const prospects = state.data.deals.filter((d) => d.type === "見込");

  const sum = (arr, key) => arr.reduce((s, i) => s + (Number(i[key]) || 0), 0);

  const manualSalesAdjustment = Number(settings.manualSalesAdjustment) || 0;
  const manualProfitAdjustment = Number(settings.manualProfitAdjustment) || 0;

  const repSales = settings.repSales || {};
  const repSalesTotal = REPS.reduce((s, rep) => s + (Number(repSales[rep] && repSales[rep].sales) || 0), 0);
  const repProfitTotal = REPS.reduce((s, rep) => s + (Number(repSales[rep] && repSales[rep].profit) || 0), 0);

  const salesInvoiced = sum(confirmedInvoiced, "salesAmount") + manualSalesAdjustment + repSalesTotal;
  const profitInvoiced = sum(confirmedInvoiced, "grossProfit") + manualProfitAdjustment + repProfitTotal;
  const salesConfirmedNoInvoice = sum(confirmedNotInvoiced, "salesAmount");
  const profitConfirmedNoInvoice = sum(confirmedNotInvoiced, "grossProfit");
  const salesProspect = sum(prospects, "salesAmount");
  const profitProspect = sum(prospects, "grossProfit");

  const salesTarget = (settings.monthlySalesTarget && settings.monthlySalesTarget[monthIdx]) || 0;
  const profitTarget = (settings.monthlyProfitTargetByMonth && settings.monthlyProfitTargetByMonth[monthIdx]) || settings.monthlyProfitTarget || 0;

  const kpiGrid = document.getElementById("kpi-grid");
  kpiGrid.innerHTML = "";
  const kpis = [
    { label: "売上（伝票発行済）", value: yen(salesInvoiced), sub: `目標 ${yen(salesTarget)}${manualSalesAdjustment ? ` ／ 少額売掛金 +${yen(manualSalesAdjustment)}` : ""}${repSalesTotal ? ` ／ 社員別 +${yen(repSalesTotal)}` : ""}`, cls: salesInvoiced >= salesTarget && salesTarget > 0 ? "good" : "", clickable: true },
    { label: "粗利（伝票発行済）", value: yen(profitInvoiced), sub: `目標 ${yen(profitTarget)}${manualProfitAdjustment ? ` ／ 少額売掛金 +${yen(manualProfitAdjustment)}` : ""}${repProfitTotal ? ` ／ 社員別 +${yen(repProfitTotal)}` : ""}`, cls: profitInvoiced >= profitTarget && profitTarget > 0 ? "good" : "", clickable: true },
    { label: "確定（伝票未発行）売上", value: yen(salesConfirmedNoInvoice), sub: `粗利 ${yen(profitConfirmedNoInvoice)}`, cls: "" },
    { label: "見込 売上", value: yen(salesProspect), sub: `粗利 ${yen(profitProspect)}`, cls: "" },
  ];
  kpis.forEach((k) => {
    const div = document.createElement("div");
    div.className = "kpi-card " + k.cls + (k.clickable ? " kpi-clickable" : "");
    div.innerHTML =
      `<div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div><div class="kpi-sub">${k.sub}</div>` +
      (k.clickable ? '<div class="kpi-tap-hint">👥 タップで社員別を表示</div>' : "");
    if (k.clickable) {
      div.addEventListener("click", () => openRepSalesModal());
    }
    kpiGrid.appendChild(div);
  });

  // 月別 売上・粗利（今年）: 確定案件（expectedDateの月）から自動集計し、
  // Excelで確定済みの実績月（thisYearMonthly*Override）があればそちらを優先する
  const thisYearMonthlySales = Array(12).fill(0);
  const thisYearMonthlyProfit = Array(12).fill(0);
  state.data.deals
    .filter((d) => d.type === "確定" && d.expectedDate)
    .forEach((d) => {
      const m = new Date(d.expectedDate).getMonth();
      if (!isNaN(m)) {
        thisYearMonthlySales[m] += Number(d.salesAmount) || 0;
        thisYearMonthlyProfit[m] += Number(d.grossProfit) || 0;
      }
    });
  const salesOverride = settings.thisYearMonthlySalesOverride || Array(12).fill(null);
  const profitOverride = settings.thisYearMonthlyProfitOverride || Array(12).fill(null);
  for (let m = 0; m < 12; m++) {
    if (salesOverride[m] !== null && salesOverride[m] !== undefined) thisYearMonthlySales[m] = Number(salesOverride[m]) || 0;
    if (profitOverride[m] !== null && profitOverride[m] !== undefined) thisYearMonthlyProfit[m] = Number(profitOverride[m]) || 0;
  }
  const maxVal = Math.max(1, ...thisYearMonthlySales, ...thisYearMonthlyProfit);
  const chartEl = document.getElementById("sales-chart");
  chartEl.innerHTML = "";
  chartEl.parentElement.querySelectorAll(".chart-legend").forEach((el) => el.remove());
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  legend.innerHTML = '<span class="legend-sales">売上</span><span class="legend-profit">粗利</span>';
  chartEl.parentElement.insertBefore(legend, chartEl);
  for (let m = 0; m < 12; m++) {
    const group = document.createElement("div");
    group.className = "bar-group";
    const bars = document.createElement("div");
    bars.className = "bars";
    const b1 = document.createElement("div");
    b1.className = "bar bar-sales";
    b1.style.height = Math.round((thisYearMonthlySales[m] / maxVal) * 100) + "%";
    b1.title = `売上 ${m + 1}月: ${yen(thisYearMonthlySales[m])}`;
    const b2 = document.createElement("div");
    b2.className = "bar bar-profit";
    b2.style.height = Math.round((thisYearMonthlyProfit[m] / maxVal) * 100) + "%";
    b2.title = `粗利 ${m + 1}月: ${yen(thisYearMonthlyProfit[m])}`;
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
  const businessDaysOverride = settings.businessDaysOverride && settings.businessDaysOverride[monthKey];
  const businessDaysSoFar =
    businessDaysOverride !== undefined && businessDaysOverride !== null && businessDaysOverride !== ""
      ? Number(businessDaysOverride)
      : businessDaysInMonthSoFar();
  let rrows = '<tr><th>担当者</th><th>今月提出数</th><th>営業日数</th><th>提出率</th></tr>';
  REPS.forEach((rep) => {
    const days = new Set(
      state.data.dailyReports.filter((r) => r.rep === rep && (r.date || "").startsWith(monthKey)).map((r) => r.date)
    ).size;
    const rate = businessDaysSoFar > 0 ? Math.round((days / businessDaysSoFar) * 100) : 0;
    rrows += `<tr><td>${escapeHtml(rep)}</td><td>${days}日</td><td>${businessDaysSoFar}日</td><td>${rate}% ${rate < 80 ? "⚠" : "✅"}</td></tr>`;
  });
  reportTable.innerHTML = rrows;

  // 各種申請（承認待ち）サマリー
  const requestTable = document.getElementById("dash-request-table");
  if (requestTable) {
    const pendingLeave = state.data.requests.filter(
      (r) => r.reqType === "有給休暇" && (r.status || "承認待ち") === "承認待ち"
    );
    const pendingExpense = state.data.requests.filter(
      (r) => r.reqType === "経費精算" && (r.status || "承認待ち") === "承認待ち"
    );
    const pendingExpenseAmount = pendingExpense.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    requestTable.innerHTML = `
      <tr><th>種別</th><th>承認待ち件数</th><th>金額</th></tr>
      <tr><td>有給休暇申請</td><td>${pendingLeave.length}件</td><td>-</td></tr>
      <tr><td>経費精算申請</td><td>${pendingExpense.length}件</td><td>${yen(pendingExpenseAmount)}</td></tr>`;
  }

  renderMarquee(settings);
}

/* ---------------- お知らせ（スクロールテキスト）共通処理 ----------------
 * 編集できるのは管理者（川﨑）のみ。ダッシュボード・予定表それぞれに1本ずつ持つ。 */
function updateMarqueeDisplay(text, ids) {
  const wrap = document.getElementById(ids.wrap);
  const track = document.getElementById(ids.track);
  const spanA = document.getElementById(ids.textA);
  const spanB = document.getElementById(ids.textB);
  const editBtn = document.getElementById(ids.editBtn);
  const isAdmin = state.currentUser === ADMIN_REP;

  if (editBtn) editBtn.classList.toggle("hidden", !isAdmin);

  const trimmed = (text || "").trim();
  if (!trimmed) {
    wrap.classList.add("hidden");
    track.classList.remove("is-animating");
    spanA.textContent = "";
    spanB.textContent = "";
    return;
  }
  wrap.classList.remove("hidden");
  spanA.textContent = trimmed;
  spanB.textContent = trimmed;
  // 文字量に応じてスクロール時間を調整（速すぎ/遅すぎを防止）
  const duration = Math.max(8, Math.min(40, trimmed.length * 0.35));
  track.style.animationDuration = duration + "s";
  track.classList.add("is-animating");
}
function setupMarquee(opts) {
  // opts: { settingsKey, ids: {wrap, track, textA, textB, editBtn}, editBtnId, formId, modalId }
  document.getElementById(opts.editBtnId).addEventListener("click", () => {
    if (state.currentUser !== ADMIN_REP) {
      showToast("権限がありません（管理者のみ編集できます）");
      return;
    }
    const settings = state.data.settings || {};
    document.getElementById(opts.formId).marqueeText.value = settings[opts.settingsKey] || "";
    openModal(opts.modalId);
  });
  document.getElementById(opts.formId).addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.currentUser !== ADMIN_REP) {
      showToast("権限がありません（管理者のみ編集できます）");
      return;
    }
    const value = e.target.marqueeText.value.trim();
    const payload = { [opts.settingsKey]: value };
    state.db
      .collection("settings")
      .doc("main")
      .set(payload, { merge: true })
      .then(() => {
        state.data.settings = { ...(state.data.settings || {}), ...payload };
        showToast("お知らせを保存しました");
        closeAllModals();
        renderDashboard();
        renderSchedule();
      })
      .catch((err) => showToast("保存エラー: " + err.message));
  });
}

const DASHBOARD_MARQUEE_IDS = {
  wrap: "dashboard-marquee",
  track: "dashboard-marquee-track",
  textA: "dashboard-marquee-text-a",
  textB: "dashboard-marquee-text-b",
  editBtn: "marquee-edit-btn",
};
const SCHEDULE_MARQUEE_IDS = {
  wrap: "schedule-marquee",
  track: "schedule-marquee-track",
  textA: "schedule-marquee-text-a",
  textB: "schedule-marquee-text-b",
  editBtn: "schedule-marquee-edit-btn",
};

function renderMarquee(settings) {
  updateMarqueeDisplay(settings.dashboardMarquee, DASHBOARD_MARQUEE_IDS);
}
function renderScheduleMarquee(settings) {
  updateMarqueeDisplay(settings.scheduleMarquee, SCHEDULE_MARQUEE_IDS);
}

setupMarquee({ settingsKey: "dashboardMarquee", editBtnId: "marquee-edit-btn", formId: "form-marquee", modalId: "modal-marquee" });
setupMarquee({
  settingsKey: "scheduleMarquee",
  editBtnId: "schedule-marquee-edit-btn",
  formId: "form-schedule-marquee",
  modalId: "modal-schedule-marquee",
});

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

/* ---------------- 目標金額・営業日数 設定モーダル ---------------- */
function fillTargetForm() {
  const settings = state.data.settings || {};
  const now = new Date();
  const monthIdx = now.getMonth();
  const monthKey = currentMonthKey();
  document.getElementById("target-month-label").textContent = `対象月: ${now.getFullYear()}年${monthIdx + 1}月`;

  const form = document.getElementById("form-target");
  form.salesTarget.value = (settings.monthlySalesTarget && settings.monthlySalesTarget[monthIdx]) || 0;
  form.profitTarget.value =
    (settings.monthlyProfitTargetByMonth && settings.monthlyProfitTargetByMonth[monthIdx]) ||
    settings.monthlyProfitTarget ||
    0;
  form.manualSalesAdjustment.value = settings.manualSalesAdjustment || 0;
  form.manualProfitAdjustment.value = settings.manualProfitAdjustment || 0;
  const businessDaysOverride = settings.businessDaysOverride && settings.businessDaysOverride[monthKey];
  form.businessDays.value =
    businessDaysOverride !== undefined && businessDaysOverride !== null && businessDaysOverride !== ""
      ? businessDaysOverride
      : businessDaysInMonthSoFar();
}
document.getElementById("form-target").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const now = new Date();
  const monthIdx = now.getMonth();
  const monthKey = currentMonthKey();
  const settings = state.data.settings || {};

  const monthlySalesTarget = (settings.monthlySalesTarget || Array(12).fill(0)).slice();
  const monthlyProfitTargetByMonth = (settings.monthlyProfitTargetByMonth || Array(12).fill(0)).slice();
  monthlySalesTarget[monthIdx] = Number(f.salesTarget.value) || 0;
  monthlyProfitTargetByMonth[monthIdx] = Number(f.profitTarget.value) || 0;

  const businessDaysOverride = { ...(settings.businessDaysOverride || {}) };
  businessDaysOverride[monthKey] = Number(f.businessDays.value) || 0;

  const payload = {
    monthlySalesTarget,
    monthlyProfitTargetByMonth,
    manualSalesAdjustment: Number(f.manualSalesAdjustment.value) || 0,
    manualProfitAdjustment: Number(f.manualProfitAdjustment.value) || 0,
    businessDaysOverride,
    // 確定・見込の目標は廃止したため、既存データがあれば削除する
    dealConfirmedTarget: firebase.firestore.FieldValue.delete(),
    dealProspectTarget: firebase.firestore.FieldValue.delete(),
  };

  state.db
    .collection("settings")
    .doc("main")
    .set(payload, { merge: true })
    .then(() => {
      state.data.settings = { ...settings, ...payload };
      delete state.data.settings.dealConfirmedTarget;
      delete state.data.settings.dealProspectTarget;
      showToast("目標・営業日数を保存しました");
      closeAllModals();
      renderDashboard();
    })
    .catch((err) => showToast("保存エラー: " + err.message));
});

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
  ["deal-type-filter", "deal-category-filter", "deal-rep-filter"].forEach((id) =>
    document.getElementById(id).addEventListener("change", renderDeals)
  );
  ["request-type-filter", "request-status-filter", "request-rep-filter"].forEach((id) =>
    document.getElementById(id).addEventListener("change", renderRequests)
  );
  ["order-status-filter", "order-rep-filter"].forEach((id) =>
    document.getElementById(id).addEventListener("change", renderOrders)
  );
  document.getElementById("report-month-filter").value = currentMonthKey();
}

// 前年売上.xlsx（2025年度）の実績値。以前の「前年」系列用（現在は月別グラフでは未使用、データは保持）。
const LAST_YEAR_SALES_FROM_EXCEL = [
  2953724, 1620795, 3970677, 6502733, 2885659, 3100523, 10960258, 5606135, 5034361, 5962747, 5918959, 5378436,
];
const LAST_YEAR_SALES_SOURCE_TAG = "excel_2025_2026-07-23";

// 前年売上.xlsx（今年度上半期）の実績値。月別売上粗利チャートの「今年」系列に使用。
// 1〜6月はExcelの実績値、7〜12月は未確定のため null（＝確定案件から自動計算した値を使用）。
const THIS_YEAR_SALES_OVERRIDE_FROM_EXCEL = [4218539, 5321085, 8237228, 8991159, 3014109, 4103627, null, null, null, null, null, null];
const THIS_YEAR_PROFIT_OVERRIDE_FROM_EXCEL = [959281, 1282081, 3171037, 4500619, 1295504, 1780663, null, null, null, null, null, null];
const THIS_YEAR_SALES_PROFIT_SOURCE_TAG = "excel_thisyear_2026H1_2026-07-23";

/* ---------------- Bootstrap ---------------- */
function loadSettings() {
  state.db
    .collection("settings")
    .doc("main")
    .get()
    .then((doc) => {
      if (doc.exists) {
        state.data.settings = doc.data();
        // 前年売上.xlsx の実績値を反映（1回限りの移行。以降は手動編集を尊重する）
        if (state.data.settings.lastYearSalesSource !== LAST_YEAR_SALES_SOURCE_TAG) {
          const migrated = {
            lastYearMonthlySales: LAST_YEAR_SALES_FROM_EXCEL,
            lastYearSalesSource: LAST_YEAR_SALES_SOURCE_TAG,
          };
          state.db
            .collection("settings")
            .doc("main")
            .set(migrated, { merge: true })
            .catch((err) => console.error("lastYear migration error", err));
          state.data.settings = { ...state.data.settings, ...migrated };
        }
        // 今年度売上・粗利額（Excel）を月別売上粗利チャートに反映（1回限りの移行）
        if (state.data.settings.thisYearSalesProfitSource !== THIS_YEAR_SALES_PROFIT_SOURCE_TAG) {
          const migrated2 = {
            thisYearMonthlySalesOverride: THIS_YEAR_SALES_OVERRIDE_FROM_EXCEL,
            thisYearMonthlyProfitOverride: THIS_YEAR_PROFIT_OVERRIDE_FROM_EXCEL,
            thisYearSalesProfitSource: THIS_YEAR_SALES_PROFIT_SOURCE_TAG,
          };
          state.db
            .collection("settings")
            .doc("main")
            .set(migrated2, { merge: true })
            .catch((err) => console.error("thisYear migration error", err));
          state.data.settings = { ...state.data.settings, ...migrated2 };
        }
      } else {
        // seed default settings on first run
        const defaults = {
          monthlyProfitTarget: 2000000,
          monthlySalesTarget: [5000000, 5000000, 5000000, 5000000, 5000000, 5000000, 5000000, 0, 0, 0, 0, 0],
          monthlyProfitTargetByMonth: [3000000, 3000000, 3000000, 3000000, 3000000, 3000000, 3000000, 0, 0, 0, 0, 0],
          lastYearMonthlySales: LAST_YEAR_SALES_FROM_EXCEL,
          lastYearSalesSource: LAST_YEAR_SALES_SOURCE_TAG,
          thisYearMonthlySalesOverride: THIS_YEAR_SALES_OVERRIDE_FROM_EXCEL,
          thisYearMonthlyProfitOverride: THIS_YEAR_PROFIT_OVERRIDE_FROM_EXCEL,
          thisYearSalesProfitSource: THIS_YEAR_SALES_PROFIT_SOURCE_TAG,
          businessDaysOverride: {},
          manualSalesAdjustment: 0,
          manualProfitAdjustment: 0,
          repSales: {},
          dashboardMarquee: "",
          scheduleMarquee: "",
        };
        state.db.collection("settings").doc("main").set(defaults);
        state.data.settings = defaults;
      }
      renderDashboard();
      renderSchedule();
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
    populateKnownClientsDatalist();
    renderReportClientHistorySearch();
  });
  listen("deals", (items) => {
    state.data.deals = items;
    renderDeals();
    renderDashboard();
  });
  listen("clients", (items) => {
    state.data.clients = items;
    renderClients();
    populateKnownClientsDatalist();
  });
  listen("requests", (items) => {
    state.data.requests = items;
    renderRequests();
    renderDashboard();
  });
  listen("orders", (items) => {
    state.data.orders = items;
    renderOrders();
  });
}

/* 日報・取引先から既知の顧客名を集めてオートコンプリート候補を更新 */
function populateKnownClientsDatalist() {
  const dl = document.getElementById("known-clients");
  if (!dl) return;
  const names = new Set();
  state.data.dailyReports.forEach((r) => {
    if (r.clientName) names.add(r.clientName);
  });
  state.data.clients.forEach((c) => {
    if (c.company) names.add(c.company);
  });
  dl.innerHTML = Array.from(names)
    .sort((a, b) => a.localeCompare(b, "ja"))
    .map((n) => `<option value="${escapeHtml(n)}"></option>`)
    .join("");
}

function init() {
  setupGate();
  setupNav();
  setupModals();
  setupFilters();
  setupReportClientHistorySearch();
  populateRepSelects();
  loadHolidays();

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
