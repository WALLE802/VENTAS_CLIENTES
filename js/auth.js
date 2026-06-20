// ─── Autenticación ────────────────────────────────────────────────────────────
// Las contraseñas se hashean con SHA-256 usando el nombre de usuario como sal:
//   hash = SHA256("usuario:contraseña")
// Esto previene ataques de rainbow table.
// ─────────────────────────────────────────────────────────────────────────────

async function sha256(str) {
    const buffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(str)
    );
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function login(username, password) {
    if (!username || !password) {
        throw new Error('Ingresá usuario y contraseña');
    }

    let users;
    try {
        // Usar raw.githubusercontent.com para evitar caché del CDN de GitHub Pages
        const usersUrl = 'https://raw.githubusercontent.com/WALLE802/walle802.github.io/main/VENTAS_CLIENTES/data/users.json?t=' + Date.now();
        const resp = await fetch(usersUrl, { cache: 'no-store' });
        if (!resp.ok) throw new Error('No se pudo conectar al servidor');
        users = await resp.json();
    } catch (e) {
        if (e.message.includes('conectar')) throw e;
        throw new Error('Error de red. Verificá tu conexión a internet.');
    }

    const hash = await sha256(`${username}:${password}`);
    const user = users.find(u => u.username === username && u.password_hash === hash);

    if (!user) {
        throw new Error('Usuario o contraseña incorrectos');
    }

    if (!user.branch) {
        throw new Error('Tu cuenta no tiene sucursal asignada. Contactá al administrador.');
    }

    // Guardar sesión en sessionStorage (se borra al cerrar el navegador)
    sessionStorage.setItem('vt_session', JSON.stringify({
        username: user.username,
        branch: user.branch
    }));

    return user;
}

function getSession() {
    const data = sessionStorage.getItem('vt_session');
    return data ? JSON.parse(data) : null;
}

function logout() {
    sessionStorage.removeItem('vt_session');
    window.location.replace('index.html');
}
