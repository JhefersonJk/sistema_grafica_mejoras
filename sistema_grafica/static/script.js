"use strict";

const $ = (id) => document.getElementById(id);
const moneyFormat = new Intl.NumberFormat("es-BO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const deliveryFormat = new Intl.DateTimeFormat("es-BO", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const money = (value) => `Bs ${moneyFormat.format(Number(value || 0))}`;
const searchText = (value) =>
  value.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
const rank = { urgente: 0, normal: 1, leve: 2 };
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const icon = (name) =>
  `<svg aria-hidden="true"><use href="#icon-${name}"/></svg>`;
const priorities = { normal: "Normal", urgente: "Urgente", leve: "Sin prisa" };
const stages = [
  {
    status: "PENDIENTES",
    list: "listPending",
    count: "countPending",
    next: "EN_PRODUCCION",
    action: "Pasar a producción",
    empty: "Todo bajo control",
    hint: "Los nuevos pedidos aparecerán aquí.",
  },
  {
    status: "EN_PRODUCCION",
    list: "listProduction",
    count: "countProduction",
    next: "LISTO_ENTREGA",
    action: "Marcar como listo",
    empty: "Mesa despejada",
    hint: "Aquí verás los trabajos en marcha.",
  },
  {
    status: "LISTO_ENTREGA",
    list: "listReady",
    count: "countReady",
    next: "ENTREGADO",
    action: "Entregar y cobrar",
    empty: "Pronto habrá algo listo",
    hint: "Los pedidos terminados llegan aquí.",
  },
];
let orders = [];
let syncing = null;
let orderSnapshot = "";
let notesSnapshot = "";
let summarySnapshot = "";
let orderMinute = null;
const columnMarkup = new Map();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const stackedBoard = window.matchMedia("(max-width: 640px)");
const stageFeedback = {
  PENDIENTES: { color: "cyan", text: "Pedido guardado en Pendientes." },
  EN_PRODUCCION: { color: "magenta", text: "Pedido en producción." },
  LISTO_ENTREGA: { color: "yellow", text: "Pedido listo para entrega." },
  ENTREGADO: { color: "delivered", text: "Pedido entregado y registrado en el historial." },
};
let deliveryId = null;
const busyOrders = new Set();
const deletingNotes = new Set();

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("El servidor devolvió una respuesta inesperada.");
  }
  if (!response.ok) {
    const detail = data.detail;
    const message =
      typeof detail === "string"
        ? detail
        : "Revisa los campos del formulario e inténtalo de nuevo.";
    throw new Error(message);
  }
  return data;
}

function toast(message, error = false, color = "") {
  const element = document.createElement("div");
  element.className = `toast ${error ? "error" : color}`;
  if (color) element.innerHTML = icon("check");
  const text = document.createElement("span");
  text.textContent = message;
  element.append(text);
  $("toasts").append(element);
  setTimeout(() => element.remove(), 5000);
}

function localDate(offset = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offset);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const dateShortcuts = [...document.querySelectorAll("[data-date-offset]")];
const hourShortcuts = [...document.querySelectorAll("[data-delivery-hour]")];

function updateScheduleShortcuts() {
  for (const button of dateShortcuts) {
    const selected = $("delivery_date").value === localDate(Number(button.dataset.dateOffset));
    button.setAttribute("aria-pressed", String(selected));
  }
  for (const button of hourShortcuts) {
    const selected = $("delivery_hour").value === button.dataset.deliveryHour;
    button.setAttribute("aria-pressed", String(selected));
  }
}

function updateOrderBalance() {
  const price = $("price").valueAsNumber;
  const advanceField = $("advance_payment");
  const advance = advanceField.valueAsNumber || 0;
  const valid = Number.isFinite(price) && $("price").validity.valid &&
    advanceField.validity.valid && advance <= price;
  $("orderBalance").textContent = valid ? money(price - advance) : "—";
}

function animateOrderStage(id, status) {
  if (status === "ENTREGADO") {
    if (reducedMotion.matches) return;
    $("deliveredMetric").animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.025)" }, { transform: "scale(1)" }],
      { duration: 440, easing: "ease-out" },
    );
    return;
  }
  const stage = stages.find((entry) => entry.status === status);
  const action = $(stage.list).querySelector(`[data-order="${id}"]`);
  if (action && action === document.activeElement) {
    action.scrollIntoView({ block: "nearest", behavior: "instant" });
  }
  if (reducedMotion.matches) return;
  const card = action?.closest(".order-card");
  const enter = status === "PENDIENTES" || stackedBoard.matches
    ? "translateY(-12px)"
    : "translateX(-16px)";
  card?.animate(
    [{ transform: enter, opacity: 0.55 }, { transform: "none", opacity: 1 }],
    { duration: 300, easing: "cubic-bezier(.2,.75,.3,1)" },
  );
  $(stage.list).previousElementSibling.querySelector(".stage-icon").animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.2)" }, { transform: "scale(1)" }],
    { duration: 380, easing: "ease-out" },
  );
}

function deliveryInfo(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime()))
    return { text: "Sin fecha de entrega", className: "" };
  const minutes = (date - Date.now()) / 60000;
  const label = deliveryFormat.format(date);
  if (minutes < 0) return { text: `Vencido · ${label}`, className: "late" };
  if (minutes <= 60)
    return { text: `Próximo a vencer · ${label}`, className: "soon" };
  return { text: label, className: "" };
}

function orderCard(order, stage) {
  const priority = Object.hasOwn(priorities, order.priority)
    ? order.priority
    : "normal";
  const due = Math.max(
    0,
    Number(order.price || 0) - Number(order.advance_payment || 0),
  );
  const delivery = deliveryInfo(order.delivery_time);
  // Compatibilidad con clientes antiguos que incluyen un teléfono en el nombre.
  const candidate = String(order.client_name).match(
    /(?:\+?591[\s-]?)?[67]\d{7}\b/,
  );
  let whatsapp = "";
  if (order.status === "LISTO_ENTREGA" && candidate) {
    const digits = candidate[0].replace(/\D/g, "");
    const phone = digits.length === 8 ? `591${digits}` : digits;
    const message = encodeURIComponent(
      `¡Hola! Tu pedido ya está listo para recoger: ${order.details}. Gracias por confiar en Gráfica Ali.`,
    );
    whatsapp = `<a class="whatsapp" href="https://wa.me/${phone}?text=${message}" target="_blank" rel="noopener noreferrer">Avisar por WhatsApp ↗</a>`;
  }
  return `<article class="order-card" aria-label="Pedido ${order.id}: ${escapeHtml(order.client_name)}">
        <div class="card-top"><span class="order-number">#${String(order.id).padStart(3, "0")}</span><span class="priority-badge ${priority}">${priorities[priority]}</span></div>
        <h4>${escapeHtml(order.client_name)}</h4><p class="order-detail">${escapeHtml(order.details)}</p>
        <p class="delivery-time ${delivery.className}">${icon("clock")}<span>${escapeHtml(delivery.text)}</span></p>
        <div class="card-finance"><div>Total<strong>${money(order.price)}</strong></div><div>${due > 0 ? "Por cobrar" : "Pagado"}<strong>${money(due)}</strong></div></div>
        <button class="flow-button" data-order="${order.id}" data-status="${stage.next}">${stage.action}${icon(stage.next === "ENTREGADO" ? "check" : "arrow")}</button>${whatsapp}</article>`;
}

function renderOrders() {
  const query = searchText($("orderSearch").value.trim());
  const priority = $("priorityFilter").value;
  const filtering = Boolean(query || priority !== "all");
  const filtered = orders.filter(
    (order) =>
      (!query || order.search.includes(query)) &&
      (priority === "all" || order.priority === priority),
  );
  const focused = document.activeElement;
  const focusedCard = focused?.closest(".order-card");
  const focusOrder = focusedCard?.querySelector("[data-order]").dataset.order;
  const focusSelector = focused?.matches(".whatsapp") ? ".whatsapp" : ".flow-button";

  $("filterSummary").textContent = filtering
    ? `${filtered.length} de ${orders.length} pedidos coinciden con tus filtros.`
    : "";
  $("resetFilters").hidden = !filtering;
  for (const stage of stages) {
    const items = filtered.filter((order) => order.status === stage.status);
    const markup = items.length
      ? items.map((item) => orderCard(item, stage)).join("")
      : `<div class="empty-state">${icon("package")}<strong>${filtering ? "Sin coincidencias" : stage.empty}</strong><p>${filtering ? "Prueba con otro cliente o prioridad." : stage.hint}</p></div>`;
    if (columnMarkup.get(stage.list) !== markup) {
      $(stage.count).textContent = items.length;
      $(stage.list).innerHTML = markup;
      columnMarkup.set(stage.list, markup);
    }
  }
  if (focusOrder && !focused.isConnected) {
    const card = document.querySelector(`[data-order="${focusOrder}"]`)?.closest(".order-card");
    (card?.querySelector(focusSelector) || card?.querySelector(".flow-button") ||
      $("orderSearch")).focus({ preventScroll: true });
  }
}

function renderNotes(notes) {
  $("quickNotesList").innerHTML = notes.length
    ? notes
        .map(
          (note) =>
            `<article class="note"><p>${escapeHtml(note.content)}</p><button class="icon-button" data-delete-note="${note.id}" aria-label="Eliminar nota: ${escapeHtml(note.content.slice(0, 40))}">${icon("close")}</button></article>`,
        )
        .join("")
    : '<div class="empty-state">Un espacio para tus pendientes. Agrega tu primera nota.</div>';
}

async function syncWorkshop(force = false) {
  if (document.hidden && !force) return;
  if (syncing) {
    if (force) {
      await syncing;
      return syncWorkshop(true);
    }
    return syncing;
  }
  syncing = fetchWorkshop();
  try {
    await syncing;
  } finally {
    syncing = null;
  }
}

async function fetchWorkshop() {
  try {
    const [newOrders, notes, summary] = await Promise.all([
      api("/api/orders/"),
      api("/api/notes/"),
      api("/api/financial/summary"),
    ]);
    const nextOrders = JSON.stringify(newOrders);
    const minute = Math.floor(Date.now() / 60000);
    const ordersChanged = nextOrders !== orderSnapshot;
    if (ordersChanged) {
      orders = newOrders.map((order) => ({
        ...order,
        search: searchText(`${order.client_name} ${order.details}`),
        deadline: Date.parse(order.delivery_time) || Infinity,
      })).sort((a, b) =>
        (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1) ||
        a.deadline - b.deadline || b.id - a.id,
      );
      $("activeCount").textContent = orders.length;
      $("readyCount").textContent = orders.filter((order) => order.status === "LISTO_ENTREGA").length;
      $("boardCount").textContent = orders.length;
      orderSnapshot = nextOrders;
    }
    if (ordersChanged || minute !== orderMinute) {
      renderOrders();
      orderMinute = minute;
    }

    const nextNotes = JSON.stringify(notes);
    if (nextNotes !== notesSnapshot) {
      const focusNote = document.activeElement?.dataset.deleteNote;
      renderNotes(notes);
      if (focusNote)
        (document.querySelector(`[data-delete-note="${focusNote}"]`) ||
          document.querySelector('[data-open="noteDialog"]')).focus({ preventScroll: true });
      notesSnapshot = nextNotes;
    }

    const nextSummary = JSON.stringify(summary);
    if (nextSummary !== summarySnapshot) {
      $("summaryDue").textContent = money(summary.total_por_cobrar);
      $("summaryCollected").textContent = money(summary.monto_recaudado_hoy);
      $("summaryDelivered").textContent =
        `${summary.pedidos_entregados_hoy} ${summary.pedidos_entregados_hoy === 1 ? "pedido entregado" : "pedidos entregados"} · valor total`;
      summarySnapshot = nextSummary;
    }
    if ($("connectionStatus").textContent !== "Taller sincronizado")
      $("connectionStatus").textContent = "Taller sincronizado";
    $("connectionStatus").classList.remove("offline");
    $("loadError").hidden = true;
  } catch {
    $("connectionStatus").textContent = "Sin conexión";
    $("connectionStatus").classList.add("offline");
    $("loadError").hidden = false;
  }
}

function openDialog(id) {
  const dialog = $(id);
  if (dialog.open) return;
  dialog.querySelectorAll(".form-error").forEach((error) => {
    error.hidden = true;
  });
  if (id === "orderDialog") {
    if (!$("delivery_date").value) $("delivery_date").value = localDate();
    $("orderSaved").textContent = "";
    updateScheduleShortcuts();
    updateOrderBalance();
  }
  dialog.showModal();
  if (id === "historyDialog") loadHistory();
  if (id === "reportDialog") loadReport();
}

function showFormError(form, message) {
  const error = form.querySelector(".form-error");
  error.textContent = message;
  error.hidden = false;
}

async function submitForm(event, path, buildData, onSaved) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  if (button.disabled) return;
  const errorBox = form.querySelector(".form-error");
  errorBox.hidden = true;
  const data = buildData(form);
  if (!data) return;
  const label = button.querySelector("span") || button;
  const idleText = label.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  label.textContent = "Guardando…";
  let saved;
  try {
    saved = await api(path, { method: "POST", body: JSON.stringify(data) });
  } catch (error) {
    showFormError(
      form,
      error.message === "Failed to fetch"
        ? "No hay conexión. Tus datos siguen aquí; vuelve a intentarlo."
        : error.message,
    );
    errorBox.scrollIntoView({ block: "nearest", behavior: "instant" });
    return;
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    label.textContent = idleText;
  }
  await onSaved(form, saved);
}

async function changeStatus(id, status, button) {
  if (busyOrders.has(id)) return;
  busyOrders.add(id);
  button.setAttribute("aria-disabled", "true");
  button.setAttribute("aria-busy", "true");
  try {
    await api(`/orders/${id}/status?status=${encodeURIComponent(status)}`, { method: "PUT" });
    if (status === "ENTREGADO") {
      $("confirmDialog").close();
      deliveryId = null;
    }
    const feedback = stageFeedback[status];
    toast(feedback.text, false, feedback.color);
    await syncWorkshop(true);
  } catch (error) {
    if (status === "ENTREGADO") {
      $("confirmError").textContent =
        `No se pudo registrar la entrega. ${error.message}`;
      $("confirmError").hidden = false;
    } else {
      toast("No se pudo actualizar el pedido. Inténtalo de nuevo.", true);
    }
    return;
  } finally {
    busyOrders.delete(id);
    button.removeAttribute("aria-disabled");
    button.removeAttribute("aria-busy");
  }
  animateOrderStage(id, status);
}

async function loadHistory() {
  $("historyContent").innerHTML =
    '<p class="empty-state">Cargando entregas…</p>';
  try {
    const history = await api("/api/orders/history");
    $("historyContent").innerHTML = history.length
      ? `<div class="table-wrap"><table><caption class="sr-only">Pedidos entregados, del más reciente al más antiguo</caption><thead><tr><th scope="col">Cliente / trabajo</th><th scope="col">Entregado</th><th scope="col" class="amount">Total</th></tr></thead><tbody>${history.map((order) => `<tr><td><strong>${escapeHtml(order.client_name)}</strong><br>${escapeHtml(order.details)}</td><td>${order.delivered_at ? escapeHtml(new Date(order.delivered_at).toLocaleDateString("es-BO")) : "Sin fecha registrada"}</td><td class="amount">${money(order.price)}</td></tr>`).join("")}</tbody></table></div><p class="report-note">Las entregas antiguas sin fecha se conservan en el historial y no se atribuyen a las ventas de hoy.</p>`
      : '<div class="empty-state">Aún no hay entregas. Los pedidos completados aparecerán aquí.</div>';
  } catch {
    $("historyContent").innerHTML =
      '<div class="error-banner">No pudimos cargar el historial. <button class="button secondary" data-retry="history">Reintentar</button></div>';
  }
}

async function loadReport() {
  $("reportContent").innerHTML =
    '<p class="empty-state">Preparando el reporte…</p>';
  $("reportMonth").textContent = "";
  try {
    const data = await api("/api/financial/dashboard-mensual");
    $("reportMonth").textContent = data.mes;
    const values = data.grafico_linea.datos_recaudacion;
    const maximum = Math.max(...values, 1);
    const bars = data.grafico_linea.etiquetas
      .map(
        (label, index) =>
          `<div class="chart-row"><span>${escapeHtml(label)}</span><span class="chart-track" aria-hidden="true"><span class="chart-fill" style="--bar-scale:${Math.max(0, values[index] / maximum)}"></span></span><span>${money(values[index])}</span></div>`,
      )
      .join("");
    $("reportContent").innerHTML =
      `<div class="report-stats"><div class="report-stat">Valor de entregas<strong>${money(data.total_mes_recaudado)}</strong></div><div class="report-stat">Pedidos entregados<strong>${data.total_pedidos_mes}</strong></div></div><h3>Entregas por día</h3>${bars || '<p class="empty-state">Todavía no hay entregas registradas este mes.</p>'}<p class="report-note">Incluye las entregas con fecha y los cierres históricos disponibles de este mes. El valor corresponde al precio total del pedido; no es un registro de movimientos de caja.</p>`;
  } catch {
    $("reportContent").innerHTML =
      '<div class="error-banner">No pudimos cargar el reporte. <button class="button secondary" data-retry="report">Reintentar</button></div>';
  }
}

document.addEventListener("click", async (event) => {
  const open = event.target.closest("[data-open]");
  if (open) {
    openDialog(open.dataset.open);
    return;
  }
  const close = event.target.closest("[data-close]");
  if (close) {
    const dialog = close.closest("dialog");
    if (!dialog.querySelector('[aria-busy="true"]')) dialog.close();
    return;
  }
  const retry = event.target.closest("[data-retry]");
  if (retry) {
    retry.dataset.retry === "history" ? loadHistory() : loadReport();
    return;
  }
  const flow = event.target.closest("[data-order]");
  if (flow) {
    const id = Number(flow.dataset.order);
    if (busyOrders.has(id)) return;
    if (flow.dataset.status === "ENTREGADO") {
      deliveryId = id;
      const order = orders.find((item) => item.id === id);
      $("confirmText").textContent =
        `¿Entregar el pedido de ${order.client_name}? Saldo pendiente: ${money(Math.max(0, order.price - order.advance_payment))}.`;
      openDialog("confirmDialog");
    } else {
      await changeStatus(id, flow.dataset.status, flow);
    }
    return;
  }
  const remove = event.target.closest("[data-delete-note]");
  if (remove) {
    const id = Number(remove.dataset.deleteNote);
    if (deletingNotes.has(id)) return;
    deletingNotes.add(id);
    remove.disabled = true;
    try {
      await api(`/api/notes/${id}`, { method: "DELETE" });
      toast("Nota eliminada.");
    } catch {
      toast("No se pudo eliminar la nota. Inténtalo de nuevo.", true);
    } finally {
      deletingNotes.delete(id);
      remove.disabled = false;
      await syncWorkshop(true);
    }
  }
});

for (const dialog of [$("orderDialog"), $("noteDialog"), $("confirmDialog")]) {
  dialog.addEventListener("cancel", (event) => {
    if (dialog.querySelector('[aria-busy="true"]')) event.preventDefault();
  });
}

$("confirmDelivery").addEventListener("click", (event) => {
  if (deliveryId === null) return;
  $("confirmError").hidden = true;
  changeStatus(deliveryId, "ENTREGADO", event.currentTarget);
});

for (const button of dateShortcuts) {
  button.addEventListener("click", () => {
    $("delivery_date").value = localDate(Number(button.dataset.dateOffset));
    updateScheduleShortcuts();
  });
}
for (const button of hourShortcuts) {
  button.addEventListener("click", () => {
    $("delivery_hour").value = button.dataset.deliveryHour;
    updateScheduleShortcuts();
  });
}
$("delivery_date").addEventListener("input", updateScheduleShortcuts);
$("delivery_hour").addEventListener("input", updateScheduleShortcuts);
for (const field of [$("price"), $("advance_payment")]) {
  field.addEventListener("input", () => {
    if ($("advance_payment").hasAttribute("aria-invalid")) {
      $("advance_payment").removeAttribute("aria-invalid");
      $("orderFormError").hidden = true;
    }
    updateOrderBalance();
  });
}

$("orderForm").addEventListener("submit", (event) =>
  submitForm(
    event,
    "/orders/",
    (form) => {
      $("orderSaved").textContent = "";
      if (Number($("advance_payment").value) > Number($("price").value)) {
        showFormError(form, "El adelanto no puede superar el precio total.");
        $("advance_payment").setAttribute("aria-invalid", "true");
        $("advance_payment").focus();
        return null;
      }
      const client = $("client_name");
      const details = $("details");
      if (!client.value.trim() || !details.value.trim()) {
        showFormError(form, "Escribe el nombre del cliente y el detalle del trabajo.");
        (client.value.trim() ? details : client).focus();
        return null;
      }
      return {
        client_name: client.value.trim(),
        details: details.value.trim(),
        price: Number($("price").value),
        advance_payment: Number($("advance_payment").value || 0),
        priority: form.elements.priority.value,
        delivery_time: `${$("delivery_date").value}T${$("delivery_hour").value}`,
      };
    },
    async (form, order) => {
      const keepOpen = form.elements.keepOpen.checked;
      form.reset();
      $("advance_payment").removeAttribute("aria-invalid");
      if (keepOpen) {
        form.elements.keepOpen.checked = true;
        $("delivery_date").value = localDate();
        updateScheduleShortcuts();
        updateOrderBalance();
        $("client_name").focus();
        $("orderSaved").textContent = "Pedido guardado en Pendientes. Puedes registrar el siguiente.";
      } else {
        $("orderDialog").close();
        const feedback = stageFeedback.PENDIENTES;
        toast(feedback.text, false, feedback.color);
      }
      await syncWorkshop(true);
      if (!keepOpen) animateOrderStage(order.id, "PENDIENTES");
    },
  ),
);
$("noteForm").addEventListener("submit", (event) =>
  submitForm(
    event,
    "/api/notes/",
    () => {
      const content = $("note_content").value.trim();
      if (!content) {
        showFormError(
          $("noteForm"),
          "Escribe un recordatorio antes de guardar.",
        );
        return null;
      }
      return { content };
    },
    async (form) => {
      $("noteDialog").close();
      form.reset();
      toast("Nota guardada.");
      await syncWorkshop(true);
    },
  ),
);
$("orderSearch").addEventListener("input", renderOrders);
$("priorityFilter").addEventListener("change", renderOrders);
$("resetFilters").addEventListener("click", () => {
  $("orderSearch").value = "";
  $("priorityFilter").value = "all";
  $("orderSearch").focus();
  renderOrders();
});
$("retryLoad").addEventListener("click", () => syncWorkshop(true));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncWorkshop(true);
});
window.addEventListener("online", () => syncWorkshop(true));
$("todayLabel").textContent = new Date()
  .toLocaleDateString("es-BO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
  .toLocaleUpperCase("es");
syncWorkshop(true);
// La siguiente consulta espera a la anterior; no se superponen solicitudes lentas.
async function poll() {
  await syncWorkshop();
  setTimeout(poll, 10000);
}
setTimeout(poll, 10000);
