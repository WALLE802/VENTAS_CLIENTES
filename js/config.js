// ─── Configuración del repositorio ───────────────────────────────────────────
// Editá estos valores con tu usuario, repositorio y token de GitHub.
// El token debe tener permisos de "Contents: Read and Write" sobre este repo.
// Generalo en: https://github.com/settings/tokens?type=beta  (Fine-grained token)
// IMPORTANTE: si el repo es público, cualquiera que vea el código verá el token.
// Por eso usá un token de alcance MÍNIMO (solo este repo, solo contents:write).
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
    GITHUB_USER:   'WALLE802',
    GITHUB_REPO:   'VENTAS_CLIENTES',
    GITHUB_BRANCH: 'main',
    DATA_PREFIX:   '',

    // Token compartido para escribir registros de contacto en data/logs/
    // Se guarda en cada dispositivo al hacer login — no poner aquí por seguridad.
    LOGS_TOKEN: '',

    // Mensaje de promoción predefinido para WhatsApp.
    // Usá {nombre} para insertar el primer nombre del cliente.
    PROMO_MSG: "Hola {nombre} te hablamos de MARATHON DEPORTES ,hace tiempo que no compras con credito personal y tenemos una promocion para ofrecerte!!\n3 Cuotas sin interes en marcas seleccionadas!! \nEntra a este link y descubri mas promociones para vos!! https://catalogo.maromega.com.ar/ ,*sujeto a aprobacion crediticia*",

    get RAW_BASE() {
        // Siempre usar raw.githubusercontent.com para evitar caché del CDN de GitHub Pages
        return `https://raw.githubusercontent.com/${this.GITHUB_USER}/${this.GITHUB_REPO}/${this.GITHUB_BRANCH}`;
    },
    get API_BASE() {
        return `https://api.github.com/repos/${this.GITHUB_USER}/${this.GITHUB_REPO}/contents`;
    }
};
