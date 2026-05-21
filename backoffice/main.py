"""
Backoffice - Ventas Telefónicas Locales
Aplicación de escritorio (tkinter) para administrar sucursales,
clientes, usuarios y sincronizar con GitHub Pages.
"""
import csv
import json
import os
import sys
import threading
import tkinter as tk
from datetime import date
from tkinter import filedialog, messagebox, simpledialog, ttk

# Asegurar que el directorio actual sea el del script
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import get_conn, hash_password, init_db
from excel_import import import_excel
from github_sync import GitHubSync

CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'config.json')


# ─── Configuración local ──────────────────────────────────────────────────────

def load_config() -> dict:
    defaults = {
        'github_token':  '',
        'github_user':   'WALLE802',
        'github_repo':   'VENTAS_CLIENTES',
        'github_branch': 'main',
    }
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, encoding='utf-8') as f:
            return {**defaults, **json.load(f)}
    return defaults


def save_config(cfg: dict) -> None:
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


# ─── Aplicación principal ─────────────────────────────────────────────────────

class BackofficeApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Backoffice · Ventas Telefónicas")
        self.geometry("960x680")
        self.minsize(800, 550)

        init_db()
        self.cfg = load_config()
        self._branch_combos: list[ttk.Combobox] = []

        self._setup_style()
        self._build_header()
        self._build_notebook()

    # ─── Estilos ──────────────────────────────────────────────────────────────

    def _setup_style(self):
        style = ttk.Style(self)
        style.theme_use('clam')
        style.configure('TNotebook.Tab', padding=[12, 5], font=('Segoe UI', 10))
        style.configure('Treeview',        rowheight=26, font=('Segoe UI', 9))
        style.configure('Treeview.Heading', font=('Segoe UI', 9, 'bold'))
        style.configure('TButton',          padding=[8, 5])

    def _build_header(self):
        bar = tk.Frame(self, bg='#1a73e8', height=48)
        bar.pack(fill='x')
        bar.pack_propagate(False)
        tk.Label(
            bar, text="📞  Backoffice · Ventas Telefónicas",
            bg='#1a73e8', fg='white', font=('Segoe UI', 13, 'bold')
        ).pack(side='left', padx=16, pady=10)

    def _build_notebook(self):
        nb = ttk.Notebook(self)
        nb.pack(fill='both', expand=True, padx=6, pady=6)

        self._build_tab_sucursales(nb)
        self._build_tab_clientes(nb)
        self._build_tab_usuarios(nb)
        self._build_tab_sincronizar(nb)
        self._build_tab_reportes(nb)

    # ─── TAB: SUCURSALES ──────────────────────────────────────────────────────

    def _build_tab_sucursales(self, nb):
        tab = ttk.Frame(nb)
        nb.add(tab, text='🏢  Sucursales')

        left = ttk.LabelFrame(tab, text='Sucursales activas')
        left.pack(side='left', fill='both', expand=True, padx=10, pady=10)

        self.branch_lb = tk.Listbox(left, font=('Segoe UI', 12),
                                    selectbackground='#1a73e8', activestyle='none')
        sb = ttk.Scrollbar(left, command=self.branch_lb.yview)
        self.branch_lb.configure(yscrollcommand=sb.set)
        self.branch_lb.pack(side='left', fill='both', expand=True, padx=(5,0), pady=5)
        sb.pack(side='right', fill='y', pady=5)

        right = ttk.LabelFrame(tab, text='Administrar')
        right.pack(side='right', fill='y', padx=10, pady=10)

        ttk.Label(right, text='Nombre:').pack(padx=12, pady=(14,2), anchor='w')
        self.branch_entry = ttk.Entry(right, width=22)
        self.branch_entry.pack(padx=12, pady=2)
        self.branch_entry.bind('<Return>', lambda _: self._add_branch())

        ttk.Button(right, text='➕  Agregar',  command=self._add_branch).pack(padx=12, pady=6, fill='x')
        ttk.Button(right, text='🗑  Eliminar', command=self._del_branch).pack(padx=12, pady=6, fill='x')

        self._refresh_branches()

    def _refresh_branches(self):
        self.branch_lb.delete(0, 'end')
        conn = get_conn()
        rows = conn.execute("SELECT name FROM branches ORDER BY name").fetchall()
        conn.close()
        for r in rows:
            self.branch_lb.insert('end', r['name'])
        self._sync_branch_combos()

    def _sync_branch_combos(self):
        conn = get_conn()
        values = [r['name'] for r in conn.execute(
            "SELECT name FROM branches ORDER BY name"
        ).fetchall()]
        conn.close()
        for cb in self._branch_combos:
            current = cb.get()
            cb['values'] = values
            if current in values:
                cb.set(current)

    def _add_branch(self):
        name = self.branch_entry.get().strip()
        if not name:
            messagebox.showwarning("Atención", "Ingresá el nombre de la sucursal.", parent=self)
            return
        conn = get_conn()
        try:
            conn.execute("INSERT INTO branches (name) VALUES (?)", (name,))
            conn.commit()
            self.branch_entry.delete(0, 'end')
            self._refresh_branches()
        except Exception:
            messagebox.showerror("Error", f"Ya existe una sucursal llamada '{name}'.", parent=self)
        finally:
            conn.close()

    def _del_branch(self):
        sel = self.branch_lb.curselection()
        if not sel:
            messagebox.showwarning("Atención", "Seleccioná una sucursal.", parent=self)
            return
        name = self.branch_lb.get(sel[0])
        if not messagebox.askyesno(
            "Confirmar", f"¿Eliminar la sucursal '{name}' y todos sus clientes?\nEsta acción no se puede deshacer.",
            parent=self
        ):
            return
        conn = get_conn()
        conn.execute("DELETE FROM clients  WHERE branch = ?", (name,))
        conn.execute("DELETE FROM branches WHERE name   = ?", (name,))
        conn.commit()
        conn.close()
        self._refresh_branches()

    # ─── TAB: CLIENTES ────────────────────────────────────────────────────────

    def _build_tab_clientes(self, nb):
        tab = ttk.Frame(nb)
        nb.add(tab, text='👥  Clientes')

        # Barra superior
        top = ttk.Frame(tab)
        top.pack(fill='x', padx=10, pady=6)

        ttk.Label(top, text='Sucursal:').pack(side='left')
        self.cl_branch = ttk.Combobox(top, state='readonly', width=16)
        self.cl_branch.pack(side='left', padx=(4, 10))
        self.cl_branch.bind('<<ComboboxSelected>>', lambda _: self._load_clients())
        self._branch_combos.append(self.cl_branch)

        ttk.Button(top, text='📂 Importar Excel',    command=self._import_excel).pack(side='left', padx=3)
        ttk.Button(top, text='🗑 Limpiar sucursal',  command=self._clear_clients).pack(side='left', padx=3)
        ttk.Button(top, text='❌ Eliminar fila',      command=self._del_client).pack(side='left', padx=3)

        # Tabla
        frame = ttk.Frame(tab)
        frame.pack(fill='both', expand=True, padx=10, pady=(0, 5))

        cols = ('DNI', 'Nombre', 'Teléfono', 'Tel.2', 'Tel.3', 'Última Compra')
        self.cl_tree = ttk.Treeview(frame, columns=cols, show='headings')
        widths = (90, 200, 110, 110, 110, 120)
        for col, w in zip(cols, widths):
            self.cl_tree.heading(col, text=col)
            self.cl_tree.column(col, width=w, minwidth=60)

        vsb = ttk.Scrollbar(frame, orient='vertical',   command=self.cl_tree.yview)
        hsb = ttk.Scrollbar(frame, orient='horizontal', command=self.cl_tree.xview)
        self.cl_tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
        self.cl_tree.grid(row=0, column=0, sticky='nsew')
        vsb.grid(row=0, column=1, sticky='ns')
        hsb.grid(row=1, column=0, sticky='ew')
        frame.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)

        self.cl_status = ttk.Label(tab, text='')
        self.cl_status.pack(pady=2)

    def _load_clients(self):
        branch = self.cl_branch.get()
        if not branch:
            return
        self.cl_tree.delete(*self.cl_tree.get_children())
        conn = get_conn()
        rows = conn.execute(
            "SELECT id, dni, nombre, telefono, tel2, tel3, ultima_compra "
            "FROM clients WHERE branch = ? ORDER BY nombre",
            (branch,)
        ).fetchall()
        conn.close()
        for r in rows:
            self.cl_tree.insert('', 'end', iid=str(r['id']),
                                values=(r['dni'], r['nombre'], r['telefono'],
                                        r['tel2'], r['tel3'], r['ultima_compra']))
        self.cl_status.config(text=f"{len(rows)} cliente(s) en '{branch}'")

    def _import_excel(self):
        branch = self.cl_branch.get()
        if not branch:
            messagebox.showwarning("Atención", "Seleccioná una sucursal primero.", parent=self)
            return
        path = filedialog.askopenfilename(
            title='Seleccionar archivo Excel',
            filetypes=[('Excel', '*.xlsx *.xls'), ('Todos', '*.*')],
            parent=self
        )
        if not path:
            return
        try:
            n = import_excel(path, branch)
            messagebox.showinfo("Listo", f"✅ {n} cliente(s) importados a '{branch}'.", parent=self)
            self._load_clients()
        except Exception as e:
            messagebox.showerror("Error al importar", str(e), parent=self)

    def _clear_clients(self):
        branch = self.cl_branch.get()
        if not branch:
            messagebox.showwarning("Atención", "Seleccioná una sucursal.", parent=self)
            return
        if not messagebox.askyesno(
            "Confirmar", f"¿Eliminar TODOS los clientes de '{branch}'?", parent=self
        ):
            return
        conn = get_conn()
        conn.execute("DELETE FROM clients WHERE branch = ?", (branch,))
        conn.commit()
        conn.close()
        self._load_clients()

    def _del_client(self):
        sel = self.cl_tree.selection()
        if not sel:
            messagebox.showwarning("Atención", "Seleccioná un cliente.", parent=self)
            return
        if not messagebox.askyesno("Confirmar", "¿Eliminar el cliente seleccionado?", parent=self):
            return
        conn = get_conn()
        conn.execute("DELETE FROM clients WHERE id = ?", (sel[0],))
        conn.commit()
        conn.close()
        self._load_clients()

    # ─── TAB: USUARIOS ────────────────────────────────────────────────────────

    def _build_tab_usuarios(self, nb):
        tab = ttk.Frame(nb)
        nb.add(tab, text='👤  Usuarios')

        # Tabla izquierda
        left = ttk.Frame(tab)
        left.pack(side='left', fill='both', expand=True, padx=10, pady=10)

        cols = ('Usuario', 'Sucursal')
        self.usr_tree = ttk.Treeview(left, columns=cols, show='headings')
        for col in cols:
            self.usr_tree.heading(col, text=col)
            self.usr_tree.column(col, width=160)
        vsb = ttk.Scrollbar(left, command=self.usr_tree.yview)
        self.usr_tree.configure(yscrollcommand=vsb.set)
        self.usr_tree.pack(side='left', fill='both', expand=True)
        vsb.pack(side='right', fill='y')
        self.usr_tree.bind('<<TreeviewSelect>>', self._on_user_select)

        # Formulario derecho
        right = ttk.LabelFrame(tab, text='Datos del usuario')
        right.pack(side='right', fill='y', padx=10, pady=10)

        def lbl_entry(parent, label, show=''):
            ttk.Label(parent, text=label).pack(padx=12, pady=(10, 2), anchor='w')
            e = ttk.Entry(parent, width=22, show=show)
            e.pack(padx=12, pady=2)
            return e

        self.usr_name = lbl_entry(right, 'Usuario:')
        self.usr_pass = lbl_entry(right, 'Contraseña:', show='*')
        ttk.Label(right, text='(dejar en blanco para no cambiar)',
                  font=('Segoe UI', 8), foreground='gray').pack(padx=12, anchor='w')

        ttk.Label(right, text='Sucursal:').pack(padx=12, pady=(10, 2), anchor='w')
        self.usr_branch = ttk.Combobox(right, state='readonly', width=20)
        self.usr_branch.pack(padx=12, pady=2)
        self._branch_combos.append(self.usr_branch)

        ttk.Separator(right).pack(fill='x', padx=12, pady=10)
        ttk.Button(right, text='➕  Agregar',   command=self._add_user).pack(padx=12, pady=4, fill='x')
        ttk.Button(right, text='✏️  Modificar', command=self._edit_user).pack(padx=12, pady=4, fill='x')
        ttk.Button(right, text='🗑  Eliminar',  command=self._del_user).pack(padx=12, pady=4, fill='x')
        ttk.Button(right, text='🔄  Limpiar',   command=self._clear_user_form).pack(padx=12, pady=4, fill='x')

        self._refresh_users()

    def _refresh_users(self):
        self.usr_tree.delete(*self.usr_tree.get_children())
        conn = get_conn()
        rows = conn.execute(
            "SELECT id, username, branch FROM users ORDER BY username"
        ).fetchall()
        conn.close()
        for r in rows:
            self.usr_tree.insert('', 'end', iid=str(r['id']),
                                 values=(r['username'], r['branch'] or ''))

    def _on_user_select(self, _event=None):
        sel = self.usr_tree.selection()
        if not sel:
            return
        vals = self.usr_tree.item(sel[0])['values']
        self.usr_name.delete(0, 'end')
        self.usr_name.insert(0, vals[0])
        self.usr_pass.delete(0, 'end')
        self.usr_branch.set(vals[1] if vals[1] else '')

    def _add_user(self):
        username = self.usr_name.get().strip()
        password = self.usr_pass.get().strip()
        branch   = self.usr_branch.get().strip()
        if not username or not password:
            messagebox.showwarning("Atención", "Completá usuario y contraseña.", parent=self)
            return
        if not branch:
            messagebox.showwarning("Atención", "Asigná una sucursal al usuario.", parent=self)
            return
        conn = get_conn()
        try:
            conn.execute(
                "INSERT INTO users (username, password_hash, branch) VALUES (?, ?, ?)",
                (username, hash_password(username, password), branch)
            )
            conn.commit()
            messagebox.showinfo("Listo", f"Usuario '{username}' creado.", parent=self)
            self._clear_user_form()
            self._refresh_users()
        except Exception:
            messagebox.showerror("Error", f"Ya existe un usuario con ese nombre.", parent=self)
        finally:
            conn.close()

    def _edit_user(self):
        sel = self.usr_tree.selection()
        if not sel:
            messagebox.showwarning("Atención", "Seleccioná un usuario.", parent=self)
            return
        uid      = sel[0]
        username = self.usr_name.get().strip()
        password = self.usr_pass.get().strip()
        branch   = self.usr_branch.get().strip()
        if not username:
            messagebox.showwarning("Atención", "Completá el nombre de usuario.", parent=self)
            return
        conn = get_conn()
        if password:
            conn.execute(
                "UPDATE users SET username=?, password_hash=?, branch=? WHERE id=?",
                (username, hash_password(username, password), branch or None, uid)
            )
        else:
            conn.execute(
                "UPDATE users SET username=?, branch=? WHERE id=?",
                (username, branch or None, uid)
            )
        conn.commit()
        conn.close()
        messagebox.showinfo("Listo", "Usuario modificado.", parent=self)
        self._clear_user_form()
        self._refresh_users()

    def _del_user(self):
        sel = self.usr_tree.selection()
        if not sel:
            messagebox.showwarning("Atención", "Seleccioná un usuario.", parent=self)
            return
        vals = self.usr_tree.item(sel[0])['values']
        if not messagebox.askyesno("Confirmar", f"¿Eliminar usuario '{vals[0]}'?", parent=self):
            return
        conn = get_conn()
        conn.execute("DELETE FROM users WHERE id = ?", (sel[0],))
        conn.commit()
        conn.close()
        self._refresh_users()

    def _clear_user_form(self):
        self.usr_name.delete(0, 'end')
        self.usr_pass.delete(0, 'end')
        self.usr_branch.set('')

    # ─── TAB: SINCRONIZAR ─────────────────────────────────────────────────────

    def _build_tab_sincronizar(self, nb):
        tab = ttk.Frame(nb)
        nb.add(tab, text='☁️  Sincronizar')

        # Config
        cfg_frame = ttk.LabelFrame(tab, text='Configuración de GitHub')
        cfg_frame.pack(fill='x', padx=15, pady=12)

        grid = ttk.Frame(cfg_frame)
        grid.pack(fill='x', padx=10, pady=10)

        fields = [
            ('Usuario GitHub:',  'github_user'),
            ('Repositorio:',     'github_repo'),
            ('Rama (branch):',   'github_branch'),
        ]
        self._cfg_entries: dict[str, ttk.Entry] = {}
        for row_idx, (label, key) in enumerate(fields):
            ttk.Label(grid, text=label).grid(row=row_idx, column=0, sticky='w', padx=5, pady=3)
            e = ttk.Entry(grid, width=30)
            e.insert(0, self.cfg.get(key, ''))
            e.grid(row=row_idx, column=1, sticky='ew', padx=5, pady=3)
            self._cfg_entries[key] = e

        ttk.Label(grid, text='Token GitHub:').grid(row=len(fields), column=0, sticky='w', padx=5, pady=3)
        self.token_entry = ttk.Entry(grid, width=50, show='*')
        self.token_entry.insert(0, self.cfg.get('github_token', ''))
        self.token_entry.grid(row=len(fields), column=1, sticky='ew', padx=5, pady=3)
        grid.columnconfigure(1, weight=1)

        ttk.Label(cfg_frame,
                  text='🔑 Generá el token en github.com/settings/tokens → Fine-grained token → Contents: Read & Write',
                  foreground='#555', font=('Segoe UI', 8)).pack(padx=10, pady=(0, 6), anchor='w')

        ttk.Button(cfg_frame, text='💾 Guardar configuración', command=self._save_cfg).pack(pady=(0, 10))

        # Sync
        sync_frame = ttk.LabelFrame(tab, text='Sincronizar con GitHub Pages')
        sync_frame.pack(fill='x', padx=15, pady=0)
        ttk.Label(sync_frame,
                  text='Sube todos los datos (sucursales, clientes, usuarios) al repositorio de GitHub.\n'
                       'Los operadores verán los cambios inmediatamente.',
                  wraplength=600).pack(padx=10, pady=8)
        ttk.Button(sync_frame, text='🚀 Sincronizar ahora', command=self._sync_now).pack(pady=(0, 10))

        # Log
        log_frame = ttk.LabelFrame(tab, text='Resultado')
        log_frame.pack(fill='both', expand=True, padx=15, pady=12)
        self.sync_log = tk.Text(log_frame, height=8, state='disabled',
                                font=('Courier New', 9), bg='#1e1e1e', fg='#d4d4d4',
                                insertbackground='white')
        self.sync_log.pack(fill='both', expand=True, padx=5, pady=5)

    def _save_cfg(self):
        for key, entry in self._cfg_entries.items():
            self.cfg[key] = entry.get().strip()
        self.cfg['github_token'] = self.token_entry.get().strip()
        save_config(self.cfg)
        messagebox.showinfo("Listo", "Configuración guardada.", parent=self)

    def _log_sync(self, msg: str):
        self.sync_log.config(state='normal')
        self.sync_log.insert('end', msg + '\n')
        self.sync_log.see('end')
        self.sync_log.config(state='disabled')
        self.update_idletasks()

    def _sync_now(self):
        token = self.token_entry.get().strip()
        if not token:
            messagebox.showwarning("Atención", "Ingresá el token de GitHub primero.", parent=self)
            return

        self.sync_log.config(state='normal')
        self.sync_log.delete('1.0', 'end')
        self.sync_log.config(state='disabled')

        def run():
            try:
                syncer = GitHubSync(
                    token=token,
                    user=self.cfg.get('github_user',   'WALLE802'),
                    repo=self.cfg.get('github_repo',   'VENTAS_CLIENTES'),
                    branch=self.cfg.get('github_branch', 'main'),
                )
                self._log_sync("⏳ Conectando con GitHub...")
                syncer.sync_all(log_callback=self._log_sync)
                self._log_sync("\n✅ Sincronización completada exitosamente.")
            except Exception as e:
                self._log_sync(f"\n❌ Error: {e}")
                messagebox.showerror("Error de sincronización", str(e), parent=self)

        threading.Thread(target=run, daemon=True).start()

    # ─── TAB: REPORTES ────────────────────────────────────────────────────────

    def _build_tab_reportes(self, nb):
        tab = ttk.Frame(nb)
        nb.add(tab, text='📊  Reportes')

        top = ttk.Frame(tab)
        top.pack(fill='x', padx=10, pady=8)

        ttk.Label(top, text='Fecha:').pack(side='left')
        self.rpt_date = ttk.Entry(top, width=12)
        self.rpt_date.insert(0, date.today().strftime('%Y-%m-%d'))
        self.rpt_date.pack(side='left', padx=(4, 10))

        ttk.Button(top, text='🔍 Ver registros',  command=self._load_report).pack(side='left', padx=3)
        ttk.Button(top, text='💾 Exportar CSV',   command=self._export_csv).pack(side='left', padx=3)

        # Tabla
        frame = ttk.Frame(tab)
        frame.pack(fill='both', expand=True, padx=10, pady=(0, 5))

        cols = ('Hora', 'Usuario', 'Sucursal', 'DNI', 'Nombre', 'Tipo', 'Teléfono')
        self.rpt_tree = ttk.Treeview(frame, columns=cols, show='headings')
        widths = (60, 100, 100, 90, 180, 90, 120)
        for col, w in zip(cols, widths):
            self.rpt_tree.heading(col, text=col)
            self.rpt_tree.column(col, width=w, minwidth=50)

        vsb = ttk.Scrollbar(frame, orient='vertical',   command=self.rpt_tree.yview)
        hsb = ttk.Scrollbar(frame, orient='horizontal', command=self.rpt_tree.xview)
        self.rpt_tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
        self.rpt_tree.grid(row=0, column=0, sticky='nsew')
        vsb.grid(row=0, column=1, sticky='ns')
        hsb.grid(row=1, column=0, sticky='ew')
        frame.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)

        self.rpt_status = ttk.Label(tab, text='')
        self.rpt_status.pack(pady=2)
        self._rpt_data: list[dict] = []

    def _load_report(self):
        token = self.cfg.get('github_token', '') or self.token_entry.get().strip()
        if not token:
            messagebox.showwarning("Atención",
                                   "Configurá el token de GitHub en la pestaña Sincronizar.", parent=self)
            return

        date_str = self.rpt_date.get().strip()
        self.rpt_tree.delete(*self.rpt_tree.get_children())
        self._rpt_data = []

        def run():
            try:
                syncer = GitHubSync(
                    token=token,
                    user=self.cfg.get('github_user',   'WALLE802'),
                    repo=self.cfg.get('github_repo',   'VENTAS_CLIENTES'),
                    branch=self.cfg.get('github_branch', 'main'),
                )
                logs = syncer.get_logs(date_str)
                self._rpt_data = logs
                for e in logs:
                    self.rpt_tree.insert('', 'end', values=(
                        e.get('time', ''),
                        e.get('username', ''),
                        e.get('branch', ''),
                        e.get('client_dni', ''),
                        e.get('client_name', ''),
                        e.get('contact_type', ''),
                        e.get('phone_used', ''),
                    ))
                self.rpt_status.config(text=f"{len(logs)} registro(s) para {date_str}")
            except Exception as e:
                messagebox.showerror("Error", str(e), parent=self)

        threading.Thread(target=run, daemon=True).start()

    def _export_csv(self):
        if not self._rpt_data:
            messagebox.showwarning("Atención", "No hay datos para exportar.", parent=self)
            return
        path = filedialog.asksaveasfilename(
            defaultextension='.csv',
            filetypes=[('CSV', '*.csv')],
            initialfile=f"reporte_{self.rpt_date.get()}.csv",
            parent=self
        )
        if not path:
            return
        fields = ['time', 'username', 'branch', 'client_dni', 'client_name', 'contact_type', 'phone_used']
        with open(path, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(self._rpt_data)
        messagebox.showinfo("Listo", f"Exportado:\n{path}", parent=self)


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    app = BackofficeApp()
    app.mainloop()
