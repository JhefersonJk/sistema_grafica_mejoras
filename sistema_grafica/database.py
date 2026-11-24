"""
Configuración de la base de datos (SQLite + SQLAlchemy).
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./database.db")

# El motor de base de datos.
# check_same_thread=False es necesario porque FastAPI puede usar la misma
# conexión desde distintos hilos (workers de la petición).
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

# Fábrica de sesiones que usaremos para hablar con la base de datos
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Clase base para los modelos declarativos
Base = declarative_base()


def get_db():
    """Dependencia de FastAPI: entrega una sesión y la cierra siempre al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
