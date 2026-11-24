"""
Modelos de base de datos (SQLAlchemy ORM).

Importante: los nombres de tabla y columna se mantienen sin cambios para
que la base de datos ya existente (database.db) siga funcionando sin
necesidad de migraciones.
"""

from database import Base
from sqlalchemy import Column, Date, DateTime, Float, Integer, String


class Order(Base):
    """Un pedido del taller. Fluye por el tablero Kanban de 3 columnas."""

    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    client_name = Column(String, nullable=False)
    details = Column(String, nullable=False)
    priority = Column(String, default="normal")  # leve | normal | urgente
    price = Column(Float, default=0.0)

    # Estados posibles: PENDIENTES -> EN_PRODUCCION -> LISTO_ENTREGA -> ENTREGADO
    status = Column(String, default="PENDIENTES", index=True)

    delivered_at = Column(
        DateTime, nullable=True, index=True
    )  # Fecha real de entrega; históricos sin fecha = NULL
    delivery_time = Column(String)  # Fecha/hora de entrega elegida en el modal
    advance_payment = Column(Float, default=0.0)  # Adelanto o seña dejada por el cliente


class QuickNote(Base):
    """Nota rápida tipo post-it, visible para todo el taller."""

    __tablename__ = "quick_notes"

    id = Column(Integer, primary_key=True, index=True)
    content = Column(String, nullable=False)


class CierreDiario(Base):
    """Cierres históricos conservados para el reporte mensual."""

    __tablename__ = "cierres_diarios"

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(Date, unique=True, index=True)  # Evita duplicar el cierre de un mismo día
    pedidos_entregados = Column(Integer, default=0)
    monto_recaudado = Column(Float, default=0.0)
