"""API del tablero de producción y caja de Gráfica Ali."""

import os
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

import models
from database import engine, get_db
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session

TIMEZONE = ZoneInfo(os.getenv("APP_TIMEZONE", "America/La_Paz"))
ESTADOS_VALIDOS = ["PENDIENTES", "EN_PRODUCCION", "LISTO_ENTREGA", "ENTREGADO"]
DbSession = Annotated[Session, Depends(get_db)]
MESES = (
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)


def ahora_local():
    return datetime.now(TIMEZONE).replace(tzinfo=None)


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    # Migración aditiva: no inventar fechas de entrega para pedidos anteriores.
    if "delivered_at" not in {c["name"] for c in inspect(engine).get_columns("orders")}:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE orders ADD COLUMN delivered_at DATETIME"))
    for index in models.Order.__table__.indexes:
        if index.name == "ix_orders_delivered_at":
            index.create(bind=engine, checkfirst=True)
    yield


app = FastAPI(title="Sistema Kanban Gráfica Ali", lifespan=lifespan)
SOURCE_DIR = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=SOURCE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=SOURCE_DIR / "templates")


class OrderCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, allow_inf_nan=False)
    client_name: str = Field(min_length=1, max_length=160)
    details: str = Field(min_length=1, max_length=2000)
    priority: Literal["leve", "normal", "urgente"] = "normal"
    price: float = Field(ge=0)
    advance_payment: float = Field(default=0, ge=0)
    delivery_time: datetime

    @field_validator("price", "advance_payment")
    @classmethod
    def redondear_importe(cls, value):
        return round(value, 2)

    @model_validator(mode="after")
    def validar_adelanto(self):
        if self.advance_payment > self.price:
            raise ValueError("El adelanto no puede superar el precio total")
        return self


class QuickNoteCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    content: str = Field(min_length=1, max_length=1000)


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")


@app.get("/test-db")
def test_db(db: DbSession):
    db.execute(select(1)).scalar_one()
    return {"message": "La base de datos está conectada y funcionando"}


@app.post("/orders/", status_code=201)
def create_order(order: OrderCreate, db: DbSession):
    values = order.model_dump()
    delivery = order.delivery_time
    if delivery.tzinfo:
        delivery = delivery.astimezone(TIMEZONE).replace(tzinfo=None)
    values["delivery_time"] = delivery.isoformat(timespec="minutes")
    new_order = models.Order(**values, status="PENDIENTES")
    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    return new_order


@app.get("/api/orders/")
def get_orders(db: DbSession):
    return (
        db.query(models.Order)
        .filter(models.Order.status != "ENTREGADO")
        .order_by(models.Order.id.desc())
        .all()
    )


@app.get("/api/orders/history")
def get_orders_history(db: DbSession):
    return (
        db.query(models.Order)
        .filter(models.Order.status == "ENTREGADO")
        .order_by(models.Order.delivered_at.desc(), models.Order.id.desc())
        .all()
    )


@app.put("/orders/{order_id}/status")
def update_order_status(order_id: int, status: str, db: DbSession):
    order = db.get(models.Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    if status not in ESTADOS_VALIDOS:
        raise HTTPException(status_code=400, detail="Estado no válido")
    if status != order.status:
        order.delivered_at = ahora_local() if status == "ENTREGADO" else None
        order.status = status
        db.commit()
    return {"message": "Estado actualizado"}


@app.get("/api/financial/summary")
def get_financial_summary(db: DbSession):
    start = datetime.combine(ahora_local().date(), time.min)
    count, amount = (
        db.query(func.count(models.Order.id), func.sum(models.Order.price))
        .filter(
            models.Order.status == "ENTREGADO",
            models.Order.delivered_at >= start,
            models.Order.delivered_at < start + timedelta(days=1),
        )
        .one()
    )
    active = db.query(models.Order).filter(models.Order.status != "ENTREGADO").all()
    pending = [
        {
            "cliente": o.client_name,
            "monto": round(max(0, (o.price or 0) - (o.advance_payment or 0)), 2),
        }
        for o in active
        if o.status == "LISTO_ENTREGA" and (o.price or 0) > (o.advance_payment or 0)
    ]
    return {
        "pedidos_entregados_hoy": count,
        "monto_recaudado_hoy": round(amount or 0, 2),
        "total_por_cobrar": round(
            sum(max(0, (o.price or 0) - (o.advance_payment or 0)) for o in active), 2
        ),
        "detalles_pendientes": pending,
        "entregados_sin_fecha": db.query(models.Order)
        .filter(models.Order.status == "ENTREGADO", models.Order.delivered_at.is_(None))
        .count(),
    }


@app.get("/api/financial/dashboard-mensual")
def get_dashboard_mensual(db: DbSession):
    today = ahora_local().date()
    start = today.replace(day=1)
    end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    # Conservar los cierres históricos; las entregas fechadas prevalecen para su día.
    days = {
        c.fecha.isoformat(): (c.pedidos_entregados, c.monto_recaudado)
        for c in db.query(models.CierreDiario)
        .filter(models.CierreDiario.fecha >= start, models.CierreDiario.fecha < end)
        .all()
    }
    rows = (
        db.query(
            func.date(models.Order.delivered_at),
            func.count(models.Order.id),
            func.sum(models.Order.price),
        )
        .filter(
            models.Order.status == "ENTREGADO",
            models.Order.delivered_at >= datetime.combine(start, time.min),
            models.Order.delivered_at < datetime.combine(end, time.min),
        )
        .group_by(func.date(models.Order.delivered_at))
        .all()
    )
    days.update({day: (count, amount or 0) for day, count, amount in rows})
    labels = sorted(days)
    return {
        "mes": f"{MESES[today.month - 1]} de {today.year}",
        "total_mes_recaudado": round(sum(v[1] for v in days.values()), 2),
        "total_pedidos_mes": sum(v[0] for v in days.values()),
        "grafico_linea": {
            "etiquetas": [date.fromisoformat(d).strftime("%d/%m") for d in labels],
            "datos_recaudacion": [round(days[d][1], 2) for d in labels],
        },
    }


@app.get("/api/notes/")
def get_notes(db: DbSession):
    return db.query(models.QuickNote).order_by(models.QuickNote.id.desc()).all()


@app.post("/api/notes/", status_code=201)
def create_note(note: QuickNoteCreate, db: DbSession):
    item = models.QuickNote(content=note.content)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@app.delete("/api/notes/{note_id}")
def delete_note(note_id: int, db: DbSession):
    item = db.get(models.QuickNote, note_id)
    if not item:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    db.delete(item)
    db.commit()
    return {"message": "Nota eliminada"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000)
