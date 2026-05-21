import sqlite3
import hashlib
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'ventas.db')


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS branches (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS clients (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            branch        TEXT    NOT NULL,
            dni           TEXT,
            nombre        TEXT,
            telefono      TEXT,
            tel2          TEXT,
            tel3          TEXT,
            ultima_compra TEXT
        );

        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT UNIQUE NOT NULL,
            password_hash TEXT        NOT NULL,
            branch        TEXT
        );
    """)
    # Sucursales por defecto
    for b in ('aguilares', 'con1', 'monteros'):
        c.execute("INSERT OR IGNORE INTO branches (name) VALUES (?)", (b,))
    conn.commit()
    conn.close()


def hash_password(username: str, password: str) -> str:
    """SHA-256 con el nombre de usuario como sal.
    Debe coincidir con la lógica de js/auth.js:
        SHA256("usuario:contraseña")
    """
    salted = f"{username}:{password}"
    return hashlib.sha256(salted.encode('utf-8')).hexdigest()
