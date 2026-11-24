"""Prueba real de UI con Chromium y una base temporal; no toca datos del taller.

Ejecutar desde la raíz: python tests/browser_smoke.py
Requiere playwright y Chromium (CHROMIUM_PATH permite elegir el ejecutable).
"""

import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from contextlib import ExitStack
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "sistema_grafica"
ARTIFACTS = Path(os.environ.get("UI_ARTIFACTS", ROOT / "artifacts"))
ARTIFACTS.mkdir(parents=True, exist_ok=True)
SERVER_PYTHON = os.environ.get("APP_PYTHON", sys.executable)


def main():
    with tempfile.TemporaryDirectory() as temp, ExitStack() as stack:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        env = dict(
            os.environ, DATABASE_URL=f"sqlite:///{temp}/browser.db", PYTHONDONTWRITEBYTECODE="1"
        )
        log = stack.enter_context(open(Path(temp) / "server.log", "w+"))
        server = subprocess.Popen(
            [
                SERVER_PYTHON,
                "-m",
                "uvicorn",
                "main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
            ],
            cwd=SOURCE,
            env=env,
            stdout=log,
            stderr=log,
        )
        try:
            base = f"http://127.0.0.1:{port}"
            for _ in range(100):
                if server.poll() is not None:
                    log.seek(0)
                    raise RuntimeError(log.read())
                try:
                    with urlopen(base + "/test-db", timeout=1) as response:
                        if response.status == 200:
                            break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("El servidor no inició a tiempo")
            with sync_playwright() as p:
                executable = os.environ.get("CHROMIUM_PATH") or shutil.which("chromium")
                browser = p.chromium.launch(
                    executable_path=executable, headless=True, args=["--no-sandbox"]
                )
                page = browser.new_page(
                    viewport={"width": 1440, "height": 1050}, timezone_id="America/La_Paz"
                )
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(base)
                expect(page.get_by_text("Taller sincronizado")).to_be_visible()
                expect(page.locator("#activeCount")).to_have_text("0")
                # El modal nativo limita el foco y Escape restaura el activador.
                page.get_by_role("button", name="Nuevo pedido", exact=True).click()
                expect(page.get_by_role("dialog", name="Nuevo pedido")).to_be_visible()
                page.keyboard.press("Escape")
                expect(page.get_by_role("button", name="Nuevo pedido", exact=True)).to_be_focused()
                page.get_by_role("button", name="Nuevo pedido", exact=True).click()
                page.get_by_label("Cliente", exact=True).fill("Ana <img src=x onerror=alert(1)>")
                page.get_by_label("Detalle del trabajo").fill("500 tarjetas · Papel couché 300 g")
                page.get_by_label("Hora de entrega").fill("17:00")
                page.get_by_label("Precio total (Bs)").fill("240")
                page.get_by_label("Adelanto (Bs)").fill("300")
                page.get_by_role("button", name="Guardar pedido").click()
                expect(page.get_by_role("alert").filter(has_text="El adelanto")).to_be_visible()
                page.get_by_label("Adelanto (Bs)").fill("80")
                page.get_by_role("button", name="Guardar pedido").click()
                expect(page.locator("#activeCount")).to_have_text("1")
                expect(page.locator(".order-card img")).to_have_count(0)
                expect(page.locator("#summaryDue")).to_contain_text("160")
                page.get_by_role("searchbox").fill("sin coincidencias")
                expect(page.locator("#filterSummary")).to_contain_text("0 de 1")
                page.get_by_role("searchbox").fill("")
                page.locator("#priorityFilter").select_option("urgente")
                expect(page.locator(".order-card")).to_have_count(0)
                page.locator("#priorityFilter").select_option("all")
                page.get_by_role("button", name="Pasar a producción").click()
                expect(page.locator("#countProduction")).to_have_text("1")
                page.get_by_role("button", name="Marcar como listo").click()
                expect(page.locator("#readyCount")).to_have_text("1")
                page.get_by_role("button", name="Entregar y cobrar").click()
                expect(page.get_by_role("dialog", name="Confirmar entrega")).to_be_visible()
                page.get_by_role("button", name="Confirmar entrega", exact=True).click()
                expect(page.locator("#activeCount")).to_have_text("0")
                expect(page.locator("#summaryCollected")).to_contain_text("240")
                page.get_by_role("button", name="Historial de entregas").click()
                expect(page.locator("#historyContent")).to_contain_text("Ana <img")
                page.keyboard.press("Escape")
                page.get_by_role("button", name="Reporte mensual").click()
                expect(page.locator("#reportContent .report-stat").first).to_contain_text("240")
                page.keyboard.press("Escape")
                page.get_by_role("button", name="Agregar nota").click()
                page.get_by_label("Recordatorio", exact=True).fill("Pedir papel para mañana")
                # Fallo de red: conservar el borrador y mostrar feedback.
                page.route(
                    "**/api/notes/",
                    lambda route: (
                        route.abort() if route.request.method == "POST" else route.continue_()
                    ),
                )
                page.get_by_role("button", name="Guardar nota").click()
                expect(page.locator("#noteForm .form-error")).to_be_visible()
                expect(page.get_by_label("Recordatorio", exact=True)).to_have_value(
                    "Pedir papel para mañana"
                )
                page.unroute("**/api/notes/")
                page.get_by_role("button", name="Guardar nota").click()
                expect(page.locator("#quickNotesList")).to_contain_text("Pedir papel para mañana")
                page.get_by_role("button", name="Eliminar nota: Pedir papel para mañana").click()
                expect(page.locator(".note")).to_have_count(0)
                # Datos exclusivamente de muestra para inspección visual; base temporal.
                examples = [
                    (
                        "Estudio Norte",
                        "500 tarjetas personales · Couche 300 g",
                        "urgente",
                        "PENDIENTES",
                        350,
                        150,
                    ),
                    (
                        "Café Botánica",
                        "Menús A4 · Laminado mate · 20 unidades",
                        "normal",
                        "PENDIENTES",
                        280,
                        100,
                    ),
                    (
                        "Valeria Mendoza",
                        "Invitaciones de boda · 100 unidades",
                        "normal",
                        "EN_PRODUCCION",
                        680,
                        340,
                    ),
                    (
                        "Colegio San José",
                        "Certificados a color · 80 unidades",
                        "leve",
                        "EN_PRODUCCION",
                        320,
                        100,
                    ),
                    (
                        "Flor de Loto",
                        "Stickers troquelados · 1.000 unidades",
                        "normal",
                        "LISTO_ENTREGA",
                        450,
                        250,
                    ),
                ]
                for client, details, priority, status, price, advance in examples:
                    result = page.request.post(
                        base + "/orders/",
                        data={
                            "client_name": client,
                            "details": details,
                            "priority": priority,
                            "delivery_time": "2026-11-17T17:00",
                            "price": price,
                            "advance_payment": advance,
                        },
                    )
                    assert result.status == 201
                    if status != "PENDIENTES":
                        page.request.put(
                            base + f"/orders/{result.json()['id']}/status?status={status}"
                        )
                for content in [
                    "Confirmar el color del logo con Valeria antes de imprimir.",
                    "Revisar stock de papel couché 300 g.",
                ]:
                    page.request.post(base + "/api/notes/", data={"content": content})
                page.reload()
                expect(page.locator("#activeCount")).to_have_text("5")
                page.screenshot(path=str(ARTIFACTS / "desktop-cmyk.png"), full_page=True)
                for width, height in [
                    (375, 812),
                    (768, 1024),
                    (1024, 768),
                    (1440, 1050),
                    (812, 375),
                ]:
                    page.set_viewport_size({"width": width, "height": height})
                    page.emulate_media(reduced_motion="reduce")
                    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth"), (
                        f"Overflow a {width}px"
                    )
                    page.get_by_role("button", name="Nuevo pedido", exact=True).click()
                    expect(page.get_by_label("Cliente", exact=True)).to_be_visible()
                    page.keyboard.press("Escape")
                    if width == 375:
                        page.screenshot(path=str(ARTIFACTS / "mobile-cmyk.png"), full_page=True)
                axe_path = os.environ.get("AXE_PATH")
                if axe_path:
                    page.set_viewport_size({"width": 1440, "height": 1050})
                    page.add_script_tag(content=Path(axe_path).read_text())
                    for state in [
                        "page",
                        "orderDialog",
                        "noteDialog",
                        "historyDialog",
                        "reportDialog",
                    ]:
                        if state != "page":
                            page.evaluate("openDialog", state)
                            if state == "historyDialog":
                                expect(page.locator("#historyContent table")).to_be_visible()
                            if state == "reportDialog":
                                expect(page.locator("#reportContent .report-stats")).to_be_visible()
                        violations = page.evaluate(
                            "async () => (await axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa']}})).violations"
                        )
                        assert not violations, [
                            (v["id"], [n["target"] for n in v["nodes"]]) for v in violations
                        ]
                        if state != "page":
                            page.keyboard.press("Escape")
                    print("PASS axe: sin infracciones WCAG A/AA detectadas en tablero y 4 diálogos")
                # Zoom tipográfico: no cortar contenido horizontalmente.
                page.set_viewport_size({"width": 375, "height": 812})
                page.evaluate("""() => {
                    const sizes = [...document.querySelectorAll('body *')].map(el => [el, parseFloat(getComputedStyle(el).fontSize)]);
                    for (const [el, size] of sizes) el.style.fontSize = `${size * 2}px`;
                }""")
                assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
                # La app comunica una caída y permite recuperar con Reintentar.
                page.route("**/api/orders/", lambda route: route.abort())
                page.evaluate("syncWorkshop(true)")
                expect(page.locator("#loadError")).to_be_visible()
                page.unroute("**/api/orders/")
                page.get_by_role("button", name="Reintentar", exact=True).click()
                expect(page.locator("#loadError")).to_be_hidden()
                assert not errors, errors
                browser.close()
                print(
                    "PASS UI: formularios, validación, XSS, filtros, flujo completo, historial, reporte, notas, error de red, teclado y 5 viewports. Sin errores JS."
                )
                print(f"Capturas: {ARTIFACTS}")
        finally:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
            log.close()


if __name__ == "__main__":
    main()
