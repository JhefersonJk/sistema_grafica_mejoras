"use strict";

const $ = (id) => document.getElementById(id);
const money = (value) =>
  `Bs ${Number(value || 0).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
let syncing = false;
let lastSnapshot = "";
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

function toast(message, error = false) {
  const element = document.createElement("div");
  element.className = `toast${error ? " error" : ""}`;
  element.textContent = message;
  $("toasts").append(element);
  setTimeout(() => element.remove(), 5000);
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function deliveryInfo(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime()))
    return { text: "Sin fecha de entrega", className: "" };
  const minutes = (date - Date.now()) / 60000;
  const label = date.toLocaleString("es-BO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
        <button class="flow-button" data-order="${order.id}" data-status="${stage.next}" ${busyOrders.has(order.id) ? "disabled" : ""}>${busyOrders.has(order.id) ? "Actualizando…" : stage.action}${icon(stage.next === "ENTREGADO" ? "check" : "arrow")}</button>${whatsapp}</article>`;
}

function renderOrders() {
  const query = $("orderSearch").value.trim().toLocaleLowerCase("es");
  const priority = $("priorityFilter").value;
  const filtered = orders.filter(
    (order) =>
      (!query ||
        `${order.client_name} ${order.details}`
          .toLocaleLowerCase("es")
          .includes(query)) &&
      (priority === "all" || order.priority === priority),
  );
  $("activeCount").textContent = orders.length;
  $("readyCount").textContent = orders.filter(
    (o) => o.status === "LISTO_ENTREGA",
  ).length;
  $("boardCount").textContent = orders.length;
  $("filterSummary").textContent =
    query || priority !== "all"
      ? `${filtered.length} de ${orders.length} pedidos coinciden con tus filtros.`
      : "";
  for (const stage of stages) {
    const items = filtered
      .filter((order) => order.status === stage.status)
      .sort((a, b) => {
        const rank = { urgente: 0, normal: 1, leve: 2 };
        return (
          (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1) ||
          (new Date(a.delivery_time).getTime() || Infinity) -
            (new Date(b.delivery_time).getTime() || Infinity) ||
          b.id - a.id
        );
      });
    $(stage.count).textContent = items.length;
    $(stage.list).innerHTML = items.length
      ? items.map((item) => orderCard(item, stage)).join("")
      : `<div class="empty-state">${icon("package")}<strong>${query || priority !== "all" ? "Sin coincidencias" : stage.empty}</strong><p>${query || priority !== "all" ? "Prueba con otro cliente o prioridad." : stage.hint}</p></div>`;
  }
}

function renderNotes(notes) {
  $("quickNotesList").innerHTML = notes.length
    ? notes
        .map(
          (note) =>
            `<article class="note"><p>${escapeHtml(note.content)}</p><button class="icon-button" data-delete-note="${note.id}" aria-label="Eliminar nota: ${escapeHtml(note.content.slice(0, 40))}" ${deletingNotes.has(note.id) ? "disabled" : ""}>${icon("close")}</button></article>`,
        )
        .join("")
    : '<div class="empty-state">Un espacio para tus pendientes. Agrega tu primera nota.</div>';
}

async function syncWorkshop(force = false) {
  if (syncing || (document.hidden && !force)) return;
  syncing = true;
  try {
    const [newOrders, notes, summary] = await Promise.all([
      api("/api/orders/"),
      api("/api/notes/"),
      api("/api/financial/summary"),
    ]);
    const snapshot = JSON.stringify([
      newOrders,
      notes,
      summary,
      Math.floor(Date.now() / 60000),
    ]);
    if (snapshot !== lastSnapshot || force) {
      // No reconstruir tarjetas mientras un usuario navega sus controles con teclado.
      const focused = document.activeElement;
      const focusOrder = focused?.dataset.order;
      const focusNote = focused?.dataset.deleteNote;
      orders = newOrders;
      renderOrders();
      renderNotes(notes);
      if (focusOrder)
        document
          .querySelector(`[data-order="${focusOrder}"]`)
          ?.focus({ preventScroll: true });
      if (focusNote)
        document
          .querySelector(`[data-delete-note="${focusNote}"]`)
          ?.focus({ preventScroll: true });
      $("summaryDue").textContent = money(summary.total_por_cobrar);
      $("summaryCollected").textContent = money(summary.monto_recaudado_hoy);
      $("summaryDelivered").textContent =
        `${summary.pedidos_entregados_hoy} ${summary.pedidos_entregados_hoy === 1 ? "pedido entregado" : "pedidos entregados"} · valor total`;
      lastSnapshot = snapshot;
    }
    $("connectionStatus").textContent = "Taller sincronizado";
    $("connectionStatus").classList.remove("offline");
    $("loadError").hidden = true;
  } catch {
    $("connectionStatus").textContent = "Sin conexión";
    $("connectionStatus").classList.add("offline");
    $("loadError").hidden = false;
  } finally {
    syncing = false;
  }
}

function openDialog(id) {
  const dialog = $(id);
  if (dialog.open) return;
  dialog.querySelectorAll(".form-error").forEach((error) => {
    error.hidden = true;
  });
  if (id === "orderDialog" && !$("delivery_date").value)
    $("delivery_date").value = localDate();
  dialog.showModal();
  if (id === "historyDialog") loadHistory();
  if (id === "reportDialog") loadReport();
}

function showFormError(form, message) {
  const error = form.querySelector(".form-error");
  error.textContent = message;
  error.hidden = false;
}

async function submitForm(event, path, buildData, success) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  if (button.disabled) return;
  const data = buildData();
  if (!data) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Guardando…";
  form.querySelector(".form-error").hidden = true;
  try {
    await api(path, { method: "POST", body: JSON.stringify(data) });
    form.closest("dialog").close();
    form.reset();
    toast(success);
    await syncWorkshop(true);
  } catch (error) {
    showFormError(
      form,
      error.message === "Failed to fetch"
        ? "No hay conexión. Tus datos siguen aquí; vuelve a intentarlo."
        : error.message,
    );
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

async function changeStatus(id, status, button) {
  if (busyOrders.has(id)) return false;
  busyOrders.add(id);
  if (button) button.disabled = true;
  try {
    await api(`/orders/${id}/status?status=${encodeURIComponent(status)}`, {
      method: "PUT",
    });
    toast(
      status === "ENTREGADO"
        ? "Pedido entregado. ¡Otro trabajo bien hecho!"
        : "Pedido actualizado.",
    );
    return true;
  } catch (error) {
    if (status === "ENTREGADO") {
      $("confirmError").textContent =
        `No se pudo registrar la entrega. ${error.message}`;
      $("confirmError").hidden = false;
    } else {
      toast("No se pudo actualizar el pedido. Inténtalo de nuevo.", true);
    }
    return false;
  } finally {
    busyOrders.delete(id);
    if (button) button.disabled = false;
  }
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
          `<div class="chart-row"><span>${escapeHtml(label)}</span><span class="chart-track" aria-hidden="true"><span class="chart-fill" style="--bar-width:${Math.max(0, (values[index] / maximum) * 100)}%"></span></span><span>${money(values[index])}</span></div>`,
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
    close.closest("dialog").close();
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
    if (flow.dataset.status === "ENTREGADO") {
      deliveryId = id;
      const order = orders.find((item) => item.id === id);
      $("confirmText").textContent =
        `¿Entregar el pedido de ${order.client_name}? Saldo pendiente: ${money(Math.max(0, order.price - order.advance_payment))}.`;
      openDialog("confirmDialog");
    } else {
      if (await changeStatus(id, flow.dataset.status, flow))
        await syncWorkshop(true);
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

$("confirmDelivery").addEventListener("click", async (event) => {
  if (deliveryId === null) return;
  if (await changeStatus(deliveryId, "ENTREGADO", event.currentTarget)) {
    $("confirmDialog").close();
    deliveryId = null;
    await syncWorkshop(true);
  }
});

$("orderForm").addEventListener("submit", (event) =>
  submitForm(
    event,
    "/orders/",
    () => {
      if (Number($("advance_payment").value) > Number($("price").value)) {
        showFormError(
          $("orderForm"),
          "El adelanto no puede superar el precio total.",
        );
        $("advance_payment").setAttribute("aria-invalid", "true");
        $("advance_payment").focus();
        return null;
      }
      if (!$("client_name").value.trim() || !$("details").value.trim()) {
        showFormError(
          $("orderForm"),
          "Escribe el nombre del cliente y el detalle del trabajo.",
        );
        return null;
      }
      return {
        client_name: $("client_name").value.trim(),
        details: $("details").value.trim(),
        price: Number($("price").value),
        advance_payment: Number($("advance_payment").value || 0),
        priority: $("priority").value,
        delivery_time: `${$("delivery_date").value}T${$("delivery_hour").value}`,
      };
    },
    "Pedido guardado. Ya está en el tablero.",
  ),
);
$("advance_payment").addEventListener("input", () =>
  $("advance_payment").removeAttribute("aria-invalid"),
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
    "Nota guardada.",
  ),
);
$("orderSearch").addEventListener("input", renderOrders);
$("priorityFilter").addEventListener("change", renderOrders);
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
