"""Importación de archivos Excel hacia la base de datos SQLite."""
import openpyxl
from database import get_conn


# Normalización de nombres de columna → campo interno
_COL_MAP = {
    'SUCURSAL':       'branch',
    'DNI':            'dni',
    'NOMBRE':         'nombre',
    'TELÉFONO':       'telefono',
    'TELEFONO':       'telefono',
    'TEL. 2':         'tel2',
    'TEL.2':          'tel2',
    'TEL2':           'tel2',
    'TEL. 3':         'tel3',
    'TEL.3':          'tel3',
    'TEL3':           'tel3',
    'ÚLTIMA COMPRA':  'ultima_compra',
    'ULTIMA COMPRA':  'ultima_compra',
}


def _normalize_header(raw: str) -> str:
    """Limpia y normaliza una cabecera de columna."""
    return str(raw).strip().upper().replace('\xa0', ' ')


def import_excel(filepath: str, branch: str) -> int:
    """
    Lee el archivo Excel y upserta los clientes en la base de datos.
    Retorna la cantidad de filas procesadas.
    Si un cliente con el mismo DNI ya existe en esa sucursal, se actualiza.
    """
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active

    all_rows = list(ws.iter_rows(values_only=True))
    wb.close()

    if not all_rows:
        raise ValueError("El archivo Excel está vacío.")

    # Primera fila = encabezados
    raw_headers = [_normalize_header(h) if h is not None else '' for h in all_rows[0]]
    headers = [_COL_MAP.get(h, None) for h in raw_headers]  # None = columna ignorada

    conn = get_conn()
    count = 0

    for row in all_rows[1:]:
        if not any(cell is not None for cell in row):
            continue  # fila vacía

        def cell(field: str) -> str:
            for i, h in enumerate(headers):
                if h == field and i < len(row):
                    val = row[i]
                    return str(val).strip() if val is not None else ''
            return ''

        nombre = cell('nombre')
        dni    = cell('dni')

        if not nombre and not dni:
            continue  # fila sin datos útiles

        telefono      = cell('telefono')
        tel2          = cell('tel2')
        tel3          = cell('tel3')
        ultima_compra = cell('ultima_compra')

        if dni:
            existing = conn.execute(
                "SELECT id FROM clients WHERE branch = ? AND dni = ?",
                (branch, dni)
            ).fetchone()
            if existing:
                conn.execute(
                    """UPDATE clients
                       SET nombre=?, telefono=?, tel2=?, tel3=?, ultima_compra=?
                       WHERE id=?""",
                    (nombre, telefono, tel2, tel3, ultima_compra, existing['id'])
                )
            else:
                conn.execute(
                    """INSERT INTO clients (branch, dni, nombre, telefono, tel2, tel3, ultima_compra)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (branch, dni, nombre, telefono, tel2, tel3, ultima_compra)
                )
        else:
            conn.execute(
                """INSERT INTO clients (branch, dni, nombre, telefono, tel2, tel3, ultima_compra)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (branch, dni, nombre, telefono, tel2, tel3, ultima_compra)
            )

        count += 1

    conn.commit()
    conn.close()
    return count
