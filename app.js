const $ = (id) => document.getElementById(id);
let state = { sheet: null, tab: null, columns: null, items: [] };
let running = false;
let stopRequested = false;
async function api(path, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Password": localStorage.getItem("appPassword") || "",
      },
      body: JSON.stringify(body),
    });
    if (r.status === 401) {
      const pw = prompt("Password:");
      if (pw === null) throw new Error("Password required");
      localStorage.setItem("appPassword", pw);
      continue;
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  }
  throw new Error("Wrong password");
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function setStatus(text) {
  $("status").textContent = text;
}
// ---------- Load sheet + tabs ----------
$("sheetUrl").value = localStorage.getItem("sheetUrl") || "";
$("loadBtn").onclick = async () => {
  const sheet = $("sheetUrl").value.trim();
  if (!sheet) return;
  localStorage.setItem("sheetUrl", sheet);
  setStatus("Loading tabs…");
  try {
    const { title, tabs } = await api("/api/tabs", { sheet });
    $("sheetTitle").textContent = title;
    $("tabSelect").innerHTML = tabs.map((t) => `<option>${esc(t)}</option>`).join("");
    const saved = localStorage.getItem("tab:" + sheet);
    if (saved && tabs.includes(saved)) $("tabSelect").value = saved;
    await loadItems();
  } catch (e) {
    setStatus("Error: " + e.message);
  }
};
$("tabSelect").onchange = () => loadItems().catch((e) => setStatus("Error: " + e.message));
async function loadItems() {
  const sheet = $("sheetUrl").value.trim();
  const tab = $("tabSelect").value;
  localStorage.setItem("tab:" + sheet, tab);
  setStatus("Loading items…");
  const data = await api("/api/items", { sheet, tab });
  state = {
    sheet,
    tab,
    columns: data.columns,
    items: data.items.map((it) => ({
      ...it,
      status: it.checkedToday ? "checked today" : it.price !== "" ? "has price" : "pending",
    })),
  };
  render();
  const today = state.items.filter((it) => it.checkedToday).length;
  setStatus(
    `${state.items.length} items found (item column: "${data.itemHeader}"), ${today} already checked today`
  );
  $("runBtn").disabled = !state.items.length;
}
// ---------- Price one item ----------
async function priceItem(it) {
  it.status = "🔎 searching…";
  render();
  try {
    const result = await api("/api/price", { item: it.name });
    it.result = result;
    it.status = "✍️ writing…";
    render();
    const { updated } = await api("/api/write", {
      sheet: state.sheet,
      tab: state.tab,
      row: it.row,
      columns: state.columns,
      result,
      item: it.name,
    });
    it.price = result.price ?? "";
    it.updated = updated.slice(0, 16);
    it.checkedToday = true;
    it.status = result.price != null ? "✅ done" : "⚠️ not found";
  } catch (e) {
    it.status = "❌ " + e.message;
  }
  render();
}
// ---------- Run all ----------
$("runBtn").onclick = async () => {
  if (running) return;
  running = true;
  stopRequested = false;
  $("runBtn").disabled = true;
  $("stopBtn").disabled = false;
  const skip = $("skipPriced").checked;
  const todo = state.items.filter((it) => !(skip && it.checkedToday));
  let done = 0;
  setStatus(`0/${todo.length} done`);
  for (const it of todo) {
    if (stopRequested) break;
    await priceItem(it);
    done++;
    setStatus(`${done}/${todo.length} done`);
  }
  setStatus(stopRequested ? `Stopped after ${done}/${todo.length}` : `Finished: ${done} items`);
  running = false;
  $("runBtn").disabled = false;
  $("stopBtn").disabled = true;
};
$("stopBtn").onclick = () => {
  stopRequested = true;
  setStatus("Stopping after current item…");
};
// ---------- Table ----------
function render() {
  const tbody = document.querySelector("#itemsTable tbody");
  tbody.innerHTML = "";
  for (const it of state.items) {
    const r = it.result || {};
    const tr = document.createElement("tr");
    const shop = r.url
      ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.shop || "link")}</a>`
      : esc(r.shop || "");
    tr.innerHTML = `
      <td>${it.row}</td>
      <td>${esc(it.name)}</td>
      <td class="status">${esc(it.status)}</td>
      <td class="num">${esc(it.price)}</td>
      <td>${shop}</td>
      <td class="small">${esc(r.matched_product || r.note || "")}</td>
      <td>${esc(r.confidence || "")}</td>
      <td class="small">${esc(it.updated || "")}</td>
      <td></td>`;
    const btn = document.createElement("button");
    btn.textContent = "↻";
    btn.title = "Look up this item only";
    btn.onclick = () => !running && priceItem(it);
    tr.lastElementChild.appendChild(btn);
    tbody.appendChild(tr);
  }
}