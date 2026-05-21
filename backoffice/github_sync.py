"""Sincronización de datos locales (SQLite) con el repositorio de GitHub."""
import json
import base64
from typing import Callable, Optional

import requests

from database import get_conn


class GitHubSync:
    def __init__(self, token: str, user: str, repo: str, branch: str = 'main'):
        self.token  = token
        self.user   = user
        self.repo   = repo
        self.branch = branch
        self.api_base = f"https://api.github.com/repos/{user}/{repo}/contents"
        self._headers = {
            'Authorization': f'token {token}',
            'Accept':        'application/vnd.github.v3+json',
            'Content-Type':  'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
        }

    # ─── Primitivas de la API ─────────────────────────────────────────────────

    def _get_sha(self, path: str) -> Optional[str]:
        """Devuelve el SHA del archivo si existe, o None si no existe."""
        resp = requests.get(
            f"{self.api_base}/{path}",
            headers=self._headers,
            params={'ref': self.branch},
            timeout=15
        )
        if resp.status_code == 200:
            return resp.json().get('sha')
        if resp.status_code == 404:
            return None
        resp.raise_for_status()

    def _put_file(self, path: str, content: str, message: str) -> None:
        """Crea o actualiza un archivo en el repositorio."""
        sha = self._get_sha(path)
        encoded = base64.b64encode(content.encode('utf-8')).decode('ascii')
        body: dict = {
            'message': message,
            'content': encoded,
            'branch':  self.branch
        }
        if sha:
            body['sha'] = sha

        resp = requests.put(
            f"{self.api_base}/{path}",
            headers=self._headers,
            json=body,
            timeout=20
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(
                f"Error al subir '{path}': HTTP {resp.status_code}\n{resp.text[:300]}"
            )

    # ─── Sincronización completa ──────────────────────────────────────────────

    def sync_all(self, log_callback: Optional[Callable[[str], None]] = None) -> None:
        def log(msg: str) -> None:
            if log_callback:
                log_callback(msg)

        conn = get_conn()

        # 1. Sucursales
        branches = [r['name'] for r in conn.execute(
            "SELECT name FROM branches ORDER BY name"
        ).fetchall()]
        self._put_file(
            'data/branches.json',
            json.dumps(branches, ensure_ascii=False, indent=2),
            'sync: branches'
        )
        log(f"✓ Sucursales: {branches}")

        # 2. Clientes por sucursal
        for branch in branches:
            rows = conn.execute(
                """SELECT dni, nombre, telefono, tel2, tel3, ultima_compra
                   FROM clients WHERE branch = ? ORDER BY nombre""",
                (branch,)
            ).fetchall()
            clients_data = [
                {
                    'dni':           r['dni']           or '',
                    'nombre':        r['nombre']        or '',
                    'telefono':      r['telefono']      or '',
                    'tel2':          r['tel2']          or '',
                    'tel3':          r['tel3']          or '',
                    'ultima_compra': r['ultima_compra'] or '',
                }
                for r in rows
            ]
            self._put_file(
                f'data/clients/{branch}.json',
                json.dumps(clients_data, ensure_ascii=False, indent=2),
                f'sync: clients/{branch} ({len(clients_data)} registros)'
            )
            log(f"✓ Clientes '{branch}': {len(clients_data)} registros")

        # 3. Usuarios (con hash, sin contraseña en texto plano)
        users = conn.execute(
            "SELECT username, password_hash, branch FROM users ORDER BY username"
        ).fetchall()
        users_data = [
            {
                'username':      r['username'],
                'password_hash': r['password_hash'],
                'branch':        r['branch'] or ''
            }
            for r in users
        ]
        self._put_file(
            'data/users.json',
            json.dumps(users_data, ensure_ascii=False, indent=2),
            f'sync: users ({len(users_data)} usuarios)'
        )
        log(f"✓ Usuarios: {len(users_data)} registros")

        conn.close()

    # ─── Lectura de logs ──────────────────────────────────────────────────────

    def get_logs(self, date_str: str) -> list:
        """Devuelve la lista de registros del día indicado (YYYY-MM-DD)."""
        resp = requests.get(
            f"{self.api_base}/data/logs/{date_str}.json",
            headers=self._headers,
            params={'ref': self.branch},
            timeout=15
        )
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        raw_content = resp.json().get('content', '').replace('\n', '')
        return json.loads(base64.b64decode(raw_content).decode('utf-8'))
