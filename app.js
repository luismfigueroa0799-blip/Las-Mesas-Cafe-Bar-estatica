// Import de Firebase solo para Analytics (gratis, sin tarjeta)

const firebaseConfig = {
  apiKey: "AIzaSyDtqbhR8VMYqMJ4QwpVtl7Xt6gstjdkoGM",
  authDomain: "las-mesas-b714c.firebaseapp.com",
  projectId: "las-mesas-b714c",
  storageBucket: "las-mesas-b714c.firebasestorage.app",
  messagingSenderId: "42512356224",
  appId: "1:42512356224:web:19931ba735b88e9e12e765",
  measurementId: "G-9FR035M2HC"
};
async function iniciarAnalytics() {
  try {
    const [appSdk, analyticsSdk] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.19.0/firebase-analytics.js")
    ]);
    if (!(await analyticsSdk.isSupported())) return;
    const app = appSdk.initializeApp(firebaseConfig);
    analyticsSdk.getAnalytics(app);
  } catch (err) {
    console.warn("Analytics no está disponible; la web sigue funcionando.", err);
  }
}

// URL del Apps Script desplegado como Web App para guardar reservas y opiniones.
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyXsiK3ehL-T7chcNCcKZ34xmCMuoaGAFp0EMr_5xfKSWAJSNEFVw2hs2WyI3OTXtU/exec";

// Error con un mensaje pensado para el cliente (por ejemplo, "no hay mesas disponibles").
class ErrorServidor extends Error {}

async function enviarAlBackend(datos) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(datos)
  });
  const body = await response.text();
  let resultado;
  try {
    resultado = JSON.parse(body);
  } catch {
    throw new Error("El servidor no devolvió una respuesta válida.");
  }
  if (!response.ok || resultado.ok === false || resultado.error) {
    throw new ErrorServidor(resultado.error || "El servidor no pudo guardar la solicitud.");
  }
  return resultado;
}

// ---------- Reservas ----------
function ahoraCanarias() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Atlantic/Canary", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).formatToParts(new Date());
  const v = t => partes.find(x => x.type === t).value;
  const hora = v("hour") === "24" ? "00" : v("hour");
  return { fecha: v("year") + "-" + v("month") + "-" + v("day"), hora: hora + ":" + v("minute") };
}

const reservaForm = document.getElementById("reservaForm");
const reservaStatus = document.getElementById("reservaStatus");

reservaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(e.target));
  // Campo trampa para bots: si viene relleno, se finge éxito sin enviar nada.
  if (datos.web) {
    reservaForm.reset();
    reservaStatus.textContent = "Solicitud guardada.";
    return;
  }
  const ahora = ahoraCanarias();
  if (datos.fecha === ahora.fecha && datos.hora <= ahora.hora) {
    reservaStatus.textContent = "Esa hora ya ha pasado. Elige una hora posterior.";
    return;
  }
  const boton = reservaForm.querySelector("button[type=submit]");
  const textoOriginal = boton.textContent;
  const fechaPartes = datos.fecha.split("-");
  const lineas = [
    "Hola, quiero reservar una mesa en Las Mesas.",
    "Nombre: " + datos.nombre,
    "Teléfono: " + datos.telefono,
    "Fecha: " + fechaPartes[2] + "/" + fechaPartes[1] + "/" + fechaPartes[0],
    "Hora: " + datos.hora,
    "Personas: " + datos.personas
  ];
  if (datos.mensaje && datos.mensaje.trim()) lineas.push("Comentarios: " + datos.mensaje.trim());
  const whatsappUrl = "https://wa.me/" + window.WHATSAPP + "?text=" + encodeURIComponent(lineas.join("\n"));

  // Abre la pestaña durante el toque del usuario para evitar bloqueos en Safari móvil.
  let whatsappWindow = window.open("about:blank", "_blank");
  if (whatsappWindow) {
    whatsappWindow.opener = null;
    whatsappWindow.document.title = "Preparando WhatsApp";
    const mensajeCarga = whatsappWindow.document.createElement("p");
    mensajeCarga.textContent = "Preparando tu solicitud…";
    whatsappWindow.document.body.replaceChildren(mensajeCarga);
  }

  boton.disabled = true;
  boton.textContent = "Enviando...";
  reservaStatus.textContent = "Guardando la reserva…";

  try {
    await enviarAlBackend({
      tipo: "reserva",
      nombre: datos.nombre.trim(),
      telefono: datos.telefono.trim(),
      fecha: datos.fecha,
      hora: datos.hora,
      personas: Number(datos.personas),
      mensaje: datos.mensaje ? datos.mensaje.trim() : ""
    });

    reservaForm.reset();
    if (whatsappWindow && !whatsappWindow.closed) {
      whatsappWindow.location.replace(whatsappUrl);
      reservaStatus.textContent = "Solicitud guardada. Se ha abierto WhatsApp para que la envíes.";
    } else {
      const enlaceWhatsApp = document.createElement("a");
      enlaceWhatsApp.href = whatsappUrl;
      enlaceWhatsApp.target = "_blank";
      enlaceWhatsApp.rel = "noopener noreferrer";
      enlaceWhatsApp.textContent = "Abrir WhatsApp para enviar la solicitud";
      reservaStatus.replaceChildren(document.createTextNode("Solicitud guardada. "), enlaceWhatsApp);
    }
  } catch (err) {
    console.error("Error guardando la reserva:", err);
    if (whatsappWindow && !whatsappWindow.closed) whatsappWindow.close();
    reservaStatus.textContent = err instanceof ErrorServidor
      ? err.message + " Si lo prefieres, llámanos al 928 896 097."
      : "No se pudo confirmar la reserva. Inténtalo de nuevo o llámanos al 928 896 097.";
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
});

// ---------- Opiniones (estrellas + comentario) ----------
const starInput = document.getElementById("starInput");
const stars = [...starInput.querySelectorAll(".star")];
let puntuacion = 0;

function pintarEstrellas(valor) {
  stars.forEach(s => {
    s.classList.toggle("activa", Number(s.dataset.v) <= valor);
    s.setAttribute("aria-pressed", String(Number(s.dataset.v) === puntuacion));
  });
}
const ratingStatus = document.getElementById("ratingStatus");
stars.forEach(s => {
  s.addEventListener("click", () => {
    puntuacion = Number(s.dataset.v);
    pintarEstrellas(puntuacion);
    ratingStatus.textContent = puntuacion + " de 5 estrellas seleccionadas";
  });
  s.addEventListener("mouseenter", () => pintarEstrellas(Number(s.dataset.v)));
});
starInput.addEventListener("mouseleave", () => pintarEstrellas(puntuacion));

const reviewsList = document.getElementById("reviewsList");
const reviewsAvgStars = document.getElementById("reviewsAvgStars");
const reviewsAvgText = document.getElementById("reviewsAvgText");

function escaparHTML(valor) {
  const entidades = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(valor).replace(/[&<>"']/g, caracter => entidades[caracter]);
}

function estrellasTexto(n) {
  const entero = Math.min(5, Math.max(0, Math.round(Number(n) || 0)));
  return "★".repeat(entero) + "☆".repeat(5 - entero);
}

function pintarResenas(resenas) {
  if (!resenas.length) {
    reviewsList.innerHTML = '<p class="reviews-empty">Todavía no hay opiniones publicadas. ¡Sé el primero!</p>';
    reviewsAvgStars.textContent = "☆☆☆☆☆";
    reviewsAvgText.textContent = "Sé el primero en opinar";
    return;
  }
  const valoradas = resenas.filter(r => Number.isFinite(Number(r.estrellas)) && Number(r.estrellas) > 0);
  const cuenta = resenas.length + (resenas.length === 1 ? " opinión" : " opiniones");
  if (valoradas.length) {
    const media = valoradas.reduce((s, r) => s + Number(r.estrellas), 0) / valoradas.length;
    reviewsAvgStars.textContent = estrellasTexto(media);
    reviewsAvgText.textContent = media.toLocaleString("es-ES", { maximumFractionDigits: 1 }) + " de 5 · " + cuenta;
  } else {
    reviewsAvgStars.textContent = "☆☆☆☆☆";
    reviewsAvgText.textContent = cuenta;
  }
reviewsList.innerHTML = resenas.map(r => {
    const fecha = r.fecha ? new Date(r.fecha) : null;
    const fechaHTML = fecha && !Number.isNaN(fecha.getTime())
      ? `<span class="review-date">${fecha.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</span>`
      : "";
    const idsFotos = Array.isArray(r.fotos) ? r.fotos.filter(id => /^[A-Za-z0-9_-]{10,}$/.test(String(id))) : [];
    const fotosHTML = idsFotos.length
      ? `<div class="review-photos">${idsFotos.map(id => `<button type="button" class="review-photo" data-id="${id}" aria-label="Ver foto de ${escaparHTML(r.nombre)}"><img src="https://drive.google.com/thumbnail?id=${id}&sz=w400" alt="Foto de la visita de ${escaparHTML(r.nombre)}" width="92" height="92" loading="lazy" decoding="async"></button>`).join("")}</div>`
      : "";
    return `
      <article class="review-card">
        <div class="review-card-head">
          <strong>${escaparHTML(r.nombre)}</strong>
          <span class="review-stars" aria-label="${Number(r.estrellas)} de 5 estrellas">${estrellasTexto(Number(r.estrellas))}</span>
        </div>
        <p>${escaparHTML(r.comentario || "")}</p>
        ${fotosHTML}
        ${fechaHTML}
      </article>
    `;
  }).join("");
}

function cargarResenas() {
  fetch(APPS_SCRIPT_URL + "?tipo=resenas")
    .then(response => {
      if (!response.ok) throw new Error("No se pudieron cargar las opiniones.");
      return response.json();
    })
    .then(resenas => {
      if (!Array.isArray(resenas)) throw new Error("Respuesta de opiniones no válida.");
      pintarResenas(resenas);
    })
    .catch(err => {
      console.error("No se pudieron cargar las opiniones:", err);
      reviewsList.innerHTML = '<p class="reviews-empty">No se han podido cargar las opiniones ahora mismo.</p>';
      reviewsAvgStars.textContent = "☆☆☆☆☆";
      reviewsAvgText.textContent = "Opiniones temporalmente no disponibles";
    });
}
// Se retrasa a un momento libre del navegador para no competir por red ni
// CPU con la carga del logo y el texto de portada, sobre todo en móvil.
if ("requestIdleCallback" in window) window.requestIdleCallback(cargarResenas, { timeout: 2000 });
else window.setTimeout(cargarResenas, 300);

// Si alguien deja la web abierta y vuelve a la pestaña (por ejemplo, tras
// avisar por WhatsApp), se comprueban de nuevo las opiniones aprobadas.
// No usa temporizador: solo se activa al volver, así no añade carga extra
// ni afecta a las mediciones de rendimiento.
let ultimaCargaResenas = Date.now();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - ultimaCargaResenas < 15000) return;
  ultimaCargaResenas = Date.now();
  cargarResenas();
});

const reviewForm = document.getElementById("reviewForm");
const reviewStatus = document.getElementById("reviewStatus");

// Fotos adjuntas a la opinión: se reducen en el móvil antes de enviarlas (máx. 2)
const MAX_FOTOS_RESENA = 2;
const inputFotos = document.getElementById("reviewPhotos");
const botonFotos = document.getElementById("reviewPhotoBtn");
const vistaFotos = document.getElementById("reviewPhotoPreviews");
let fotosResena = [];
let procesandoFotos = false;

function comprimirFoto(archivo) {
  return new Promise((resolve, reject) => {
    const urlTemporal = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const lado = 1280;
      const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
      const ancho = Math.max(1, Math.round(img.naturalWidth * escala));
      const alto = Math.max(1, Math.round(img.naturalHeight * escala));
      const lienzo = document.createElement("canvas");
      lienzo.width = ancho;
      lienzo.height = alto;
      const ctx = lienzo.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, ancho, alto);
      ctx.drawImage(img, 0, 0, ancho, alto);
      lienzo.toBlob(blob => {
        URL.revokeObjectURL(urlTemporal);
        if (!blob) return reject(new Error("No se pudo preparar la foto."));
        const lector = new FileReader();
        lector.onload = () => resolve({ url: lector.result, b64: String(lector.result).split(",")[1] });
        lector.onerror = () => reject(new Error("No se pudo leer la foto."));
        lector.readAsDataURL(blob);
      }, "image/jpeg", 0.78);
    };
    img.onerror = () => { URL.revokeObjectURL(urlTemporal); reject(new Error("No se pudo abrir la foto.")); };
    img.src = urlTemporal;
  });
}

function pintarFotosResena() {
  vistaFotos.innerHTML = "";
  fotosResena.forEach((f, i) => {
    const caja = document.createElement("div");
    caja.className = "photo-prev";
    const im = document.createElement("img");
    im.src = f.url;
    im.alt = "Foto " + (i + 1) + " añadida";
    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.textContent = "\u2715";
    quitar.setAttribute("aria-label", "Quitar foto " + (i + 1));
    quitar.addEventListener("click", () => {
      fotosResena.splice(i, 1);
      pintarFotosResena();
    });
    caja.append(im, quitar);
    vistaFotos.appendChild(caja);
  });
  botonFotos.disabled = fotosResena.length >= MAX_FOTOS_RESENA;
  botonFotos.textContent = fotosResena.length >= MAX_FOTOS_RESENA ? "Máximo " + MAX_FOTOS_RESENA + " fotos" : (fotosResena.length ? "+ Añadir otra foto" : "+ Añadir fotos");
}

botonFotos.addEventListener("click", () => inputFotos.click());
inputFotos.addEventListener("change", async () => {
  const archivos = Array.from(inputFotos.files || []);
  inputFotos.value = "";
  if (!archivos.length) return;
  const libres = MAX_FOTOS_RESENA - fotosResena.length;
  const validos = archivos.filter(f => f.type.startsWith("image/")).slice(0, libres);
  if (!validos.length) {
    reviewStatus.textContent = "Elige fotos en formato imagen.";
    return;
  }
  procesandoFotos = true;
  reviewStatus.textContent = "Preparando fotos…";
  try {
    for (const archivo of validos) fotosResena.push(await comprimirFoto(archivo));
    reviewStatus.textContent = archivos.length > libres
      ? "Solo se pueden añadir " + MAX_FOTOS_RESENA + " fotos."
      : "";
  } catch (err) {
    console.error("Error preparando la foto:", err);
    reviewStatus.textContent = "No se pudo preparar una de las fotos. Prueba con otra.";
  } finally {
    procesandoFotos = false;
    pintarFotosResena();
  }
});

reviewForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (puntuacion === 0) {
    reviewStatus.textContent = "Elige una puntuación de 1 a 5 estrellas.";
    stars[0].focus();
    return;
  }
  if (procesandoFotos) {
    reviewStatus.textContent = "Espera un momento, estamos preparando tus fotos.";
    return;
  }
  const datos = Object.fromEntries(new FormData(e.target));
  if (datos.web) { // campo trampa para bots
    reviewForm.reset();
    reviewStatus.textContent = "Gracias por tu opinión. La publicaremos cuando la revisemos.";
    return;
  }
  const boton = reviewForm.querySelector("button[type=submit]");
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Enviando...";
  reviewStatus.textContent = "Enviando tu opinión…";

  try {
    await enviarAlBackend({
      tipo: "resena",
      nombre: datos.nombre.trim(),
      estrellas: puntuacion,
      comentario: datos.comentario ? datos.comentario.trim() : "",
      fotos: fotosResena.map(f => f.b64)
    });
    reviewForm.reset();
    fotosResena = [];
    pintarFotosResena();
    puntuacion = 0;
    pintarEstrellas(0);
    ratingStatus.textContent = "Sin valoración seleccionada";
    reviewStatus.textContent = "Gracias por tu opinión. La publicaremos cuando la revisemos.";
  } catch (err) {
    console.error("Error enviando la opinión:", err);
    reviewStatus.textContent = "No se pudo enviar la opinión. Inténtalo de nuevo más tarde.";
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
});

// ---------- Novedades y avisos (los controla la pestaña "Avisos" de la hoja) ----------
// La sección está oculta en el HTML y solo aparece si hay algún aviso activo.
function idDriveValido(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{10,}$/.test(id);
}

function crearVideoAviso(video, titulo) {
  if (!video || typeof video !== "object") return null;
  if (video.tipo === "enlace") {
    let url;
    try { url = new URL(String(video.url)); } catch { return null; }
    if (url.protocol !== "https:") return null;
    const enlace = document.createElement("a");
    enlace.className = "btn btn-outline";
    enlace.href = url.href;
    enlace.target = "_blank";
    enlace.rel = "noopener noreferrer";
    enlace.textContent = "Ver vídeo";
    return enlace;
  }
  if ((video.tipo !== "youtube" && video.tipo !== "drive") || !idDriveValido(video.id)) return null;
  const esYoutube = video.tipo === "youtube";
  const miniatura = esYoutube
    ? "https://i.ytimg.com/vi/" + video.id + "/hqdefault.jpg"
    : "https://drive.google.com/thumbnail?id=" + video.id + "&sz=w800";
  const reproductor = esYoutube
    ? "https://www.youtube-nocookie.com/embed/" + video.id + "?autoplay=1&rel=0"
    : "https://drive.google.com/file/d/" + video.id + "/preview";
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "aviso-video";
  boton.setAttribute("aria-label", "Reproducir vídeo" + (titulo ? ": " + titulo : ""));
  const imagen = document.createElement("img");
  imagen.src = miniatura;
  imagen.alt = "";
  imagen.loading = "lazy";
  imagen.decoding = "async";
  imagen.addEventListener("error", () => imagen.remove());
  const play = document.createElement("span");
  play.className = "aviso-video-play";
  play.setAttribute("aria-hidden", "true");
  boton.append(imagen, play);
  // El reproductor solo se carga al pulsar, para no gastar datos ni ralentizar la web.
  boton.addEventListener("click", () => {
    const marco = document.createElement("div");
    marco.className = "aviso-video";
    const iframe = document.createElement("iframe");
    iframe.src = reproductor;
    iframe.title = titulo || "Vídeo";
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    marco.appendChild(iframe);
    boton.replaceWith(marco);
  }, { once: true });
  return boton;
}

function pintarAvisos(avisos) {
  const seccion = document.getElementById("avisos");
  const lista = document.getElementById("avisosLista");
  if (!seccion || !lista || !Array.isArray(avisos)) return;
  const fragmento = document.createDocumentFragment();
  avisos.slice(0, 4).forEach(aviso => {
    if (!aviso || typeof aviso !== "object") return;
    const titulo = String(aviso.titulo || "");
    const texto = String(aviso.texto || "");
    const tarjeta = document.createElement("article");
    tarjeta.className = "aviso";
    if (idDriveValido(aviso.foto)) {
      const enlace = document.createElement("a");
      enlace.className = "aviso-foto";
      enlace.href = "https://drive.google.com/thumbnail?id=" + aviso.foto + "&sz=w2000";
      enlace.target = "_blank";
      enlace.rel = "noopener noreferrer";
      enlace.setAttribute("aria-label", "Ver foto grande" + (titulo ? ": " + titulo : ""));
      const imagen = document.createElement("img");
      imagen.src = "https://drive.google.com/thumbnail?id=" + aviso.foto + "&sz=w1000";
      imagen.alt = titulo || "Foto del aviso";
      imagen.loading = "lazy";
      imagen.decoding = "async";
      enlace.appendChild(imagen);
      tarjeta.appendChild(enlace);
    }
    const cuerpo = document.createElement("div");
    cuerpo.className = "aviso-cuerpo";
    if (titulo) {
      const h3 = document.createElement("h3");
      h3.textContent = titulo;
      cuerpo.appendChild(h3);
    }
    if (texto) {
      const p = document.createElement("p");
      p.textContent = texto;
      cuerpo.appendChild(p);
    }
    const video = crearVideoAviso(aviso.video, titulo);
    if (video) cuerpo.appendChild(video);
    if (cuerpo.childNodes.length) tarjeta.appendChild(cuerpo);
    if (tarjeta.childNodes.length) fragmento.appendChild(tarjeta);
  });
  if (!fragmento.childNodes.length) {
    seccion.hidden = true;
    lista.textContent = "";
    return;
  }
  lista.replaceChildren(fragmento);
  seccion.hidden = false;
}

let ultimaCargaAvisos = 0;
function cargarAvisos() {
  ultimaCargaAvisos = Date.now();
  fetch(APPS_SCRIPT_URL + "?tipo=avisos")
    .then(response => {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    })
    .then(pintarAvisos)
    .catch(err => console.warn("No se pudieron cargar los avisos:", err));
}
if ("requestIdleCallback" in window) window.requestIdleCallback(cargarAvisos, { timeout: 2500 });
else window.setTimeout(cargarAvisos, 400);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - ultimaCargaAvisos < 60000) return;
  cargarAvisos();
});

// Analytics solo se carga si la persona la ha aceptado en el aviso de cookies.
// Después se carga en un momento libre tras la primera interacción (toque,
// tecla o scroll), para no competir con la carga inicial en móviles.
let analyticsProgramada = false;
function programarAnalytics() {
  if (analyticsProgramada) return;
  analyticsProgramada = true;
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => void iniciarAnalytics(), { timeout: 10000 });
  } else {
    window.setTimeout(() => void iniciarAnalytics(), 5000);
  }
}
function esperarInteraccionYCargarAnalytics() {
  ["pointerdown", "touchstart", "keydown", "scroll"].forEach(tipo => {
    window.addEventListener(tipo, programarAnalytics, { once: true, passive: true });
  });
}

const CLAVE_COOKIES = "lm_cookies";
function leerConsentimiento() {
  try { return window.localStorage.getItem(CLAVE_COOKIES); } catch { return null; }
}
function guardarConsentimiento(valor) {
  try { window.localStorage.setItem(CLAVE_COOKIES, valor); } catch { /* sin almacenamiento: se volverá a preguntar */ }
}
function mostrarBannerCookies() {
  if (document.getElementById("cookieBanner")) return;
  const banner = document.createElement("div");
  banner.id = "cookieBanner";
  banner.className = "cookie-banner";
  banner.setAttribute("role", "region");
  banner.setAttribute("aria-label", "Aviso de cookies");
  banner.innerHTML = '<p>Usamos cookies de analítica (Google Analytics) solo para saber cuántas personas visitan la web. Puedes aceptarlas o rechazarlas.</p>' +
    '<div class="cookie-actions"><button type="button" class="cookie-btn cookie-no">Rechazar</button><button type="button" class="cookie-btn cookie-si">Aceptar</button></div>';
  banner.querySelector(".cookie-si").addEventListener("click", () => {
    guardarConsentimiento("si");
    banner.remove();
    programarAnalytics();
  });
  banner.querySelector(".cookie-no").addEventListener("click", () => {
    guardarConsentimiento("no");
    banner.remove();
  });
  document.body.appendChild(banner);
  banner.querySelector(".cookie-si").focus({ preventScroll: true });
}
(function () {
  const eleccion = leerConsentimiento();
  if (eleccion === "si") esperarInteraccionYCargarAnalytics();
  else if (eleccion !== "no") {
    // Primera visita: se pregunta en un momento libre y, si acepta, se carga Analytics.
    if ("requestIdleCallback" in window) window.requestIdleCallback(mostrarBannerCookies, { timeout: 3000 });
    else window.setTimeout(mostrarBannerCookies, 1500);
  }
  const configurar = document.getElementById("cookieConfig");
  if (configurar) configurar.addEventListener("click", () => {
    try { window.localStorage.removeItem(CLAVE_COOKIES); } catch { /* nada que borrar */ }
    mostrarBannerCookies();
  });
})();

// Carrusel de fotos: botones, puntos y estado activo sin leer layout en el scroll
(function () {
  const pista = document.getElementById("photoTrack");
  if (!pista) return;
  const tarjetas = Array.from(pista.children);
  const prev = document.getElementById("photoPrev");
  const next = document.getElementById("photoNext");
  const puntos = document.getElementById("photoDots");
  const botones = tarjetas.map((t, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.addEventListener("click", () => tarjetas[i].scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" }));
    puntos.appendChild(b);
    return b;
  });
  let activa = 0;
  function marcar(i) {
    activa = i;
    botones.forEach((b, k) => b.classList.toggle("on", k === i));
    prev.disabled = i === 0;
    next.disabled = i === tarjetas.length - 1;
  }
  marcar(0);
  const visibles = new Set([0]);
  if ("IntersectionObserver" in window) {
    const obs = new IntersectionObserver(entradas => {
      entradas.forEach(e => {
        const i = tarjetas.indexOf(e.target);
        if (e.isIntersecting) visibles.add(i); else visibles.delete(i);
      });
      if (visibles.size) marcar(Math.min(...visibles));
    }, { root: pista, threshold: 0.6 });
    tarjetas.forEach(t => obs.observe(t));
  }
  const ir = d => tarjetas[Math.max(0, Math.min(tarjetas.length - 1, activa + d))]
    .scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  prev.addEventListener("click", () => ir(-1));
  next.addEventListener("click", () => ir(1));
  pista.addEventListener("keydown", e => {
    if (e.key === "ArrowRight") { e.preventDefault(); ir(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); ir(-1); }
  });
})();

// Carrusel de fotos: pase automático (se pausa al tocar, con el ratón encima,
// con la pestaña oculta, fuera de pantalla o si el usuario pide menos movimiento)
(function () {
  const pista = document.getElementById("photoTrack");
  if (!pista || pista.children.length < 2) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const tarjetas = Array.from(pista.children);
  const INTERVALO = 4000;
  let temporizador = null;
  let enPantalla = false;
  let pausado = false;

  function siguiente() {
    if (pista.scrollWidth <= pista.clientWidth + 4) return; // se ven todas: nada que mover
    const base = tarjetas[0].offsetLeft;
    const alFinal = pista.scrollLeft + pista.clientWidth >= pista.scrollWidth - 4;
    if (alFinal) { pista.scrollTo({ left: 0, behavior: "smooth" }); return; }
    let actual = 0;
    tarjetas.forEach((t, i) => { if (t.offsetLeft - base <= pista.scrollLeft + 4) actual = i; });
    const destino = tarjetas[Math.min(actual + 1, tarjetas.length - 1)];
    pista.scrollTo({ left: destino.offsetLeft - base, behavior: "smooth" });
  }
  function actualizar() {
    const debeCorrer = enPantalla && !pausado && !document.hidden;
    if (debeCorrer && !temporizador) temporizador = window.setInterval(siguiente, INTERVALO);
    if (!debeCorrer && temporizador) { window.clearInterval(temporizador); temporizador = null; }
  }
  const contenedor = pista.parentElement;
  contenedor.addEventListener("mouseenter", () => { pausado = true; actualizar(); });
  contenedor.addEventListener("mouseleave", () => { pausado = false; actualizar(); });
  contenedor.addEventListener("focusin", () => { pausado = true; actualizar(); });
  contenedor.addEventListener("focusout", () => { pausado = false; actualizar(); });
  // Al tocar con el dedo se detiene del todo (el usuario ya está controlando el carrusel)
  pista.addEventListener("touchstart", () => { pausado = true; actualizar(); }, { passive: true });
  document.addEventListener("visibilitychange", actualizar);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(e => { enPantalla = e[0].isIntersecting; actualizar(); }, { threshold: 0.4 }).observe(contenedor);
  }
})();

// Visor de fotos a pantalla completa: al tocar una foto se ve entera, sin recortar.
// Funciona con el carrusel de la web y con las fotos que los clientes adjuntan a su opinión.
(function () {
  if (typeof HTMLDialogElement === "undefined") return;
  const d = document.createElement("dialog");
  d.className = "photo-lightbox";
  d.setAttribute("aria-label", "Foto ampliada");
  d.innerHTML = '<div class="lb-inner"><img alt=""><div class="lb-cap"><span></span><strong></strong></div></div>' +
    '<button type="button" class="lb-btn lb-close" aria-label="Cerrar">\u2715</button>' +
    '<button type="button" class="lb-btn lb-prev" aria-label="Foto anterior">\u2039</button>' +
    '<button type="button" class="lb-btn lb-next" aria-label="Foto siguiente">\u203a</button>';
  document.body.appendChild(d);
  const img = d.querySelector("img"), sup = d.querySelector(".lb-cap span"), tit = d.querySelector(".lb-cap strong");
  const btnPrev = d.querySelector(".lb-prev"), btnNext = d.querySelector(".lb-next");
  let grupo = [];
  let actual = 0;
  function mostrar(i) {
    actual = (i + grupo.length) % grupo.length;
    const f = grupo[actual];
    img.src = f.src; img.alt = f.alt; sup.textContent = f.sup; tit.textContent = f.tit;
    const varias = grupo.length > 1;
    btnPrev.style.display = varias ? "" : "none";
    btnNext.style.display = varias ? "" : "none";
  }
  function abrir(lista, i) {
    grupo = lista;
    mostrar(i);
    if (!d.open) d.showModal();
  }

  // Carrusel de la web
  const tarjetas = Array.from(document.querySelectorAll("#photoTrack .photo-card"));
  const fotosCarrusel = tarjetas.map(t => ({
    src: t.querySelector("img").getAttribute("src"),
    alt: t.querySelector("img").getAttribute("alt") || "",
    sup: t.querySelector(".photo-caption span")?.textContent || "",
    tit: t.querySelector(".photo-caption strong")?.textContent || ""
  }));
  tarjetas.forEach((t, i) => {
    t.setAttribute("data-zoom", "");
    t.setAttribute("role", "button");
    t.setAttribute("tabindex", "0");
    t.setAttribute("aria-label", "Ver foto ampliada: " + fotosCarrusel[i].tit);
    t.addEventListener("click", () => abrir(fotosCarrusel, i));
    t.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(fotosCarrusel, i); } });
  });

  // Fotos de clientes dentro de las opiniones (las opiniones se cargan después)
  const lista = document.getElementById("reviewsList");
  if (lista) {
    lista.addEventListener("click", e => {
      const boton = e.target.closest(".review-photo");
      if (!boton) return;
      const nombre = boton.closest(".review-card")?.querySelector("strong")?.textContent || "";
      const botones = Array.from(boton.parentElement.querySelectorAll(".review-photo"));
      const fotos = botones.map(b => ({
        src: "https://drive.google.com/thumbnail?id=" + b.dataset.id + "&sz=w1400",
        alt: b.querySelector("img")?.alt || "",
        sup: "Foto de un cliente",
        tit: nombre
      }));
      abrir(fotos, botones.indexOf(boton));
    });
  }

  d.querySelector(".lb-close").addEventListener("click", () => d.close());
  btnPrev.addEventListener("click", () => mostrar(actual - 1));
  btnNext.addEventListener("click", () => mostrar(actual + 1));
  d.addEventListener("click", e => { if (e.target === d || e.target.classList.contains("lb-inner")) d.close(); });
  d.addEventListener("keydown", e => {
    if (grupo.length < 2) return;
    if (e.key === "ArrowLeft") mostrar(actual - 1);
    if (e.key === "ArrowRight") mostrar(actual + 1);
  });
  // Deslizar con el dedo dentro del visor
  let x0 = null;
  d.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
  d.addEventListener("touchend", e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (grupo.length > 1 && Math.abs(dx) > 50) mostrar(actual + (dx < 0 ? 1 : -1));
  }, { passive: true });
})();
