// ─── Autenticación ────────────────────────────────────────────────────────────
// Las contraseñas se hashean con SHA-256 usando el nombre de usuario como sal:
//   hash = SHA256("usuario:contraseña")
// Implementación pura en JS para compatibilidad con HTTP y HTTPS.
// ─────────────────────────────────────────────────────────────────────────────

async function sha256(str) {
    // Usar Web Crypto si está disponible (HTTPS/localhost), sino usar implementación pura
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Implementación pura SHA-256 (funciona en HTTP)
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    let result = '';
    const words = [];
    const asciiBitLength = str.length * 8;
    let hash = [];
    const k = [];
    let primeCounter = 0;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (let i = candidate * candidate; i < 313; i += candidate) isComposite[i] = true;
            hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        }
    }
    str += '\x80';
    while (str.length % 64 - 56) str += '\x00';
    for (let i = 0; i < str.length; i++) {
        const j = str.charCodeAt(i);
        if (j >> 8) return '';
        words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength | 0);
    for (let j = 0; j < words.length;) {
        const w = words.slice(j, j += 16);
        const oldHash = hash.slice(0);
        for (let i = 0; i < 64; i++) {
            const w15 = w[i - 15], w2 = w[i - 2];
            const a = hash[0], e = hash[4];
            const temp1 = hash[7]
                + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                + ((e & hash[5]) ^ (~e & hash[6]))
                + k[i]
                + (w[i] = (i < 16) ? w[i] : (
                    w[i - 16]
                    + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                    + w[i - 7]
                    + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                ) | 0);
            const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
            hash = [(temp1 + temp2) | 0].concat(hash);
            hash[4] = (hash[4] + temp1) | 0;
            hash.length = 8;
        }
        hash = hash.map((h, i) => (h + oldHash[i]) | 0);
    }
    hash.forEach(h => {
        for (let i = 3; i + 1; i--) {
            const byte = (h >> (i * 8)) & 255;
            result += ((byte < 16) ? '0' : '') + byte.toString(16);
        }
    });
    return result;
}

async function login(username, password) {
    if (!username || !password) {
        throw new Error('Ingresá usuario y contraseña');
    }

    let users;
    try {
        // raw.githubusercontent.com sirve siempre la versión actualizada (sin CDN)
        const usersUrl = `${CONFIG.RAW_BASE}/data/users.json?t=${Date.now()}`;
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
