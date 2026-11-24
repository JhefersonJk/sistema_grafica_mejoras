"""Regresiones de API, migración y periodos financieros sobre SQLite temporal."""

import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

TEMP = tempfile.TemporaryDirectory()
DB_PATH = Path(TEMP.name) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH}"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sistema_grafica"))

# Simular el esquema original antes de que exista delivered_at.
with sqlite3.connect(DB_PATH) as connection:
    connection.execute(
        "CREATE TABLE orders (id INTEGER PRIMARY KEY, client_name VARCHAR NOT NULL, details VARCHAR NOT NULL, priority VARCHAR, price FLOAT, status VARCHAR, delivery_time VARCHAR, advance_payment FLOAT)"
    )
    connection.execute(
        "INSERT INTO orders VALUES (1, 'Histórico', 'Conservar', 'normal', 80, 'ENTREGADO', '2026-10-01T10:00', 0)"
    )

import main
import models
from database import SessionLocal, engine
from fastapi.testclient import TestClient
from sqlalchemy import inspect


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_context = TestClient(main.app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)
        engine.dispose()
        TEMP.cleanup()

    def setUp(self):
        with SessionLocal() as db:
            db.query(models.Order).filter(models.Order.id != 1).delete()
            db.query(models.QuickNote).delete()
            db.query(models.CierreDiario).delete()
            db.commit()

    def create(self, **values):
        payload = dict(
            client_name="Cliente",
            details="Tarjetas",
            price=100,
            advance_payment=25,
            priority="normal",
            delivery_time="2026-11-16T15:00",
        )
        payload.update(values)
        return self.client.post("/orders/", json=payload)

    def test_migration_preserves_legacy_order(self):
        self.assertIn("delivered_at", {c["name"] for c in inspect(engine).get_columns("orders")})
        history = self.client.get("/api/orders/history").json()
        self.assertEqual(history[0]["client_name"], "Histórico")
        self.assertIsNone(history[0]["delivered_at"])

    def test_home_assets_and_real_db(self):
        self.assertIn("Mesa de producción", self.client.get("/").text)
        for path in ["/static/style.css", "/static/script.js", "/test-db"]:
            self.assertEqual(self.client.get(path).status_code, 200)

    def test_create_normalizes_and_lists(self):
        response = self.create(client_name="  Ana  ", price=100.125)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["client_name"], "Ana")
        self.assertEqual(response.json()["price"], 100.12)
        self.assertEqual(len(self.client.get("/api/orders/").json()), 1)

    def test_invalid_orders(self):
        for values in [
            dict(client_name="  "),
            dict(details=" "),
            dict(price=-1),
            dict(priority="inventada"),
            dict(delivery_time="no es fecha"),
            dict(advance_payment=101),
            dict(price="Infinity"),
        ]:
            with self.subTest(values=values):
                self.assertEqual(self.create(**values).status_code, 422)

    def test_status_delivery_is_idempotent_and_reopen_clears_date(self):
        order_id = self.create().json()["id"]
        for status in ["EN_PRODUCCION", "LISTO_ENTREGA", "ENTREGADO"]:
            with patch("main.ahora_local", return_value=datetime(2026, 11, 16, 10)):
                self.assertEqual(
                    self.client.put(
                        f"/orders/{order_id}/status", params={"status": status}
                    ).status_code,
                    200,
                )
        with patch("main.ahora_local", return_value=datetime(2026, 11, 17, 10)):
            self.client.put(f"/orders/{order_id}/status", params={"status": "ENTREGADO"})
        with SessionLocal() as db:
            self.assertEqual(
                db.get(models.Order, order_id).delivered_at, datetime(2026, 11, 16, 10)
            )
        self.client.put(f"/orders/{order_id}/status", params={"status": "PENDIENTES"})
        with SessionLocal() as db:
            self.assertIsNone(db.get(models.Order, order_id).delivered_at)

    def test_daily_summary_excludes_other_days_and_legacy(self):
        with SessionLocal() as db:
            for day in [15, 16, 17]:
                db.add(
                    models.Order(
                        client_name="Entrega",
                        details="Prueba",
                        price=100,
                        status="ENTREGADO",
                        delivered_at=datetime(2026, 11, day, 12),
                    )
                )
            db.commit()
        self.create()
        with patch("main.ahora_local", return_value=datetime(2026, 11, 16, 22)):
            result = self.client.get("/api/financial/summary").json()
        self.assertEqual(result["pedidos_entregados_hoy"], 1)
        self.assertEqual(result["monto_recaudado_hoy"], 100)
        self.assertEqual(result["total_por_cobrar"], 75)
        self.assertEqual(result["entregados_sin_fecha"], 1)

    def test_monthly_report_limits_period_and_avoids_duplicate_closures(self):
        with SessionLocal() as db:
            for timestamp in [
                datetime(2026, 10, 31, 23, 59),
                datetime(2026, 11, 1),
                datetime(2026, 12, 1),
            ]:
                db.add(
                    models.Order(
                        client_name="Entrega",
                        details="Prueba",
                        price=100,
                        status="ENTREGADO",
                        delivered_at=timestamp,
                    )
                )
            db.add(
                models.CierreDiario(
                    fecha=datetime(2026, 11, 1).date(), pedidos_entregados=1, monto_recaudado=100
                )
            )
            db.add(
                models.CierreDiario(
                    fecha=datetime(2026, 10, 30).date(), pedidos_entregados=10, monto_recaudado=1000
                )
            )
            db.add(
                models.CierreDiario(
                    fecha=datetime(2026, 11, 2).date(), pedidos_entregados=2, monto_recaudado=50
                )
            )
            db.commit()
        with patch("main.ahora_local", return_value=datetime(2026, 11, 16)):
            result = self.client.get("/api/financial/dashboard-mensual").json()
        self.assertEqual(result["total_mes_recaudado"], 150)
        self.assertEqual(result["total_pedidos_mes"], 3)
        self.assertEqual(result["grafico_linea"]["etiquetas"], ["01/11", "02/11"])

    def test_note_lifecycle_and_validation(self):
        self.assertEqual(self.client.post("/api/notes/", json={"content": " "}).status_code, 422)
        response = self.client.post("/api/notes/", json={"content": "  Recordatorio  "})
        self.assertEqual(response.status_code, 201)
        item = response.json()
        self.assertEqual(item["content"], "Recordatorio")
        self.assertEqual(len(self.client.get("/api/notes/").json()), 1)
        self.assertEqual(self.client.delete(f"/api/notes/{item['id']}").status_code, 200)
        self.assertEqual(self.client.get("/api/notes/").json(), [])
        self.assertEqual(self.client.delete(f"/api/notes/{item['id']}").status_code, 404)

    def test_status_errors(self):
        self.assertEqual(self.client.put("/orders/999999/status?status=ENTREGADO").status_code, 404)
        self.assertEqual(self.client.put("/orders/1/status?status=INVALID").status_code, 400)


if __name__ == "__main__":
    unittest.main()
