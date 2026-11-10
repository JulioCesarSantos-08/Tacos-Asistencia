
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import { auth } from "./firebase.js";

import {
  obtenerPerfil,
  cerrarSesion,
  normalizarRol
} from "./auth.js";

import {
  inicializarEmpleados
} from "./admin/empleados.js";

import {
  inicializarHorarios
} from "./admin/horarios.js";

import {
  inicializarSucursales
} from "./admin/sucursales.js";

import {
  inicializarAsistencias
} from "./admin/asistencias.js";

import {
  inicializarPermisos
} from "./admin/permisos.js";

import {
  inicializarReportes
} from "./admin/reportes.js";

import {
  inicializarAuditoria
} from "./admin/auditoria.js";

import {
  inicializarConfiguracion
} from "./admin/configuracion.js";

const $ = id => document.getElementById(id);

const SECCIONES = Object.freeze([
  "dashboard",
  "asistencias",
  "empleados",
  "horarios",
  "permisos",
  "sucursales",
  "reportes",
  "auditoria",
  "configuracion"
]);

const TITULOS = Object.freeze({
  dashboard: "Panel general",
  asistencias: "Control de asistencias",
  empleados: "Administración de empleados",
  horarios: "Horarios de trabajo",
  permisos: "Permisos e incidencias",
  sucursales: "Sucursales y ubicación",
  reportes: "Reportes administrativos",
  auditoria: "Historial de auditoría",
  configuracion: "Configuración general"
});

const INICIALIZADORES = Object.freeze({
  asistencias: inicializarAsistencias,
  empleados: inicializarEmpleados,
  horarios: inicializarHorarios,
  permisos: inicializarPermisos,
  sucursales: inicializarSucursales,
  reportes: inicializarReportes,
  auditoria: inicializarAuditoria,
  configuracion: inicializarConfiguracion
});

const MODALES = Object.freeze({
  modalEmpleado: "modalEmpleado",
  modalHorario: "modalHorario",
  modalIncidencia: "modalIncidencia",
  modalSucursal: "modalSucursal"
});

let seccionActual = "dashboard";
let perfilAdministrador = null;
let sesionValidada = false;
let interfazInicializada = false;
let navegacionBloqueada = false;
let toastTimeout = null;

const modulosInicializados = new Set();
const modulosPendientes = new Map();

function crearElemento(etiqueta, clase = "", texto) {
  const nodo = document.createElement(etiqueta);

  if (clase) {
    nodo.className = clase;
  }

  if (texto !== undefined) {
    nodo.textContent = String(texto);
  }

  return nodo;
}

function establecerTexto(id, valor) {
  const elemento = $(id);

  if (elemento) {
    elemento.textContent = String(valor ?? "");
  }
}

function establecerEstadoCargaTabla(id, mensaje, columnas = 6) {
  const cuerpo = $(id);

  if (!cuerpo) {
    return;
  }

  const fila = document.createElement("tr");
  const celda = document.createElement("td");

  celda.colSpan = columnas;
  celda.className = "admin-tabla-vacia";
  celda.textContent = mensaje;

  fila.append(celda);
  cuerpo.replaceChildren(fila);
}

function obtenerContenedorToast() {
  let contenedor =
    $("adminToast") ||
    $("contenedorToast") ||
    $("toastAdmin");

  if (contenedor) {
    return contenedor;
  }

  contenedor = crearElemento(
    "div",
    "admin-toast"
  );

  contenedor.id = "adminToast";
  contenedor.setAttribute("role", "status");
  contenedor.setAttribute("aria-live", "polite");

  document.body.append(contenedor);

  return contenedor;
}

function mostrarToast(mensaje, tipo = "exito") {
  const contenedor = obtenerContenedorToast();

  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  const tipos = {
    exito: "exito",
    success: "exito",
    error: "error",
    advertencia: "advertencia",
    warning: "advertencia",
    info: "info"
  };

  const tipoNormalizado = tipos[tipo] || "info";

  contenedor.className =
    `admin-toast admin-toast-${tipoNormalizado} visible`;

  contenedor.textContent = String(mensaje);

  contenedor.hidden = false;

  toastTimeout = setTimeout(() => {
    contenedor.classList.remove("visible");
    contenedor.hidden = true;
  }, 4500);
}

function obtenerModal(id) {
  if (!id) {
    return null;
  }

  if (typeof id !== "string") {
    return id instanceof HTMLElement ? id : null;
  }

  return $(id);
}

function abrirModal(id) {
  const modal = obtenerModal(id);

  if (!modal) {
    console.warn("Modal no encontrado:", id);
    return;
  }

  modal.hidden = false;
  modal.classList.add("activo", "visible", "abierto");
  modal.setAttribute("aria-hidden", "false");

  document.body.classList.add("admin-modal-abierto");

  const primerCampo = modal.querySelector(
    "input:not([type='hidden']):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)"
  );

  requestAnimationFrame(() => {
    primerCampo?.focus();
  });
}

function cerrarModal(id) {
  const modal = obtenerModal(id);

  if (!modal) {
    return;
  }

  modal.classList.remove("activo", "visible", "abierto");
  modal.setAttribute("aria-hidden", "true");
  modal.hidden = true;

  const modalesAbiertos = document.querySelector(
    ".admin-modal.activo, .admin-modal.visible, .admin-modal.abierto"
  );

  if (!modalesAbiertos) {
    document.body.classList.remove("admin-modal-abierto");
  }
}

function cerrarTodosLosModales() {
  Object.values(MODALES).forEach(cerrarModal);

  document.querySelectorAll(".admin-modal").forEach(modal => {
    cerrarModal(modal);
  });
}

function obtenerSeccionDesdeURL() {
  const hash = window.location.hash.replace("#", "");

  return SECCIONES.includes(hash)
    ? hash
    : "dashboard";
}

function obtenerBotonesNavegacion() {
  return [
    ...document.querySelectorAll(
      "[data-seccion], [data-section], [data-admin-seccion]"
    )
  ];
}

function obtenerNombreSeccionBoton(boton) {
  return (
    boton.dataset.seccion ||
    boton.dataset.section ||
    boton.dataset.adminSeccion ||
    ""
  );
}

function actualizarNavegacion(seccion) {
  obtenerBotonesNavegacion().forEach(boton => {
    const activa =
      obtenerNombreSeccionBoton(boton) === seccion;

    boton.classList.toggle("activo", activa);
    boton.classList.toggle("active", activa);

    if (activa) {
      boton.setAttribute("aria-current", "page");
    } else {
      boton.removeAttribute("aria-current");
    }
  });
}

function actualizarSecciones(seccion) {
  SECCIONES.forEach(nombre => {
    const contenedor = $(`seccion-${nombre}`);

    if (!contenedor) {
      return;
    }

    const activa = nombre === seccion;

    contenedor.hidden = !activa;
    contenedor.classList.toggle("activo", activa);
    contenedor.classList.toggle("active", activa);
  });
}

function actualizarTitulo(seccion) {
  const titulo = TITULOS[seccion] || "Administración";

  [
    "tituloSeccion",
    "tituloPagina",
    "adminTituloPagina"
  ].forEach(id => {
    establecerTexto(id, titulo);
  });

  document.title = `${titulo} | Tacos Orientales`;
}

function cerrarMenuMovil() {
  const sidebar =
    $("adminSidebar") ||
    $("sidebarAdmin") ||
    document.querySelector(".admin-sidebar");

  if (!sidebar) {
    return;
  }

  sidebar.classList.remove("abierto", "activo", "open");

  document.body.classList.remove(
    "admin-sidebar-abierto"
  );

  const boton =
    $("botonMenuAdmin") ||
    $("abrirMenuAdmin");

  boton?.setAttribute("aria-expanded", "false");
}

function alternarMenuMovil() {
  const sidebar =
    $("adminSidebar") ||
    $("sidebarAdmin") ||
    document.querySelector(".admin-sidebar");

  if (!sidebar) {
    return;
  }

  const abierto = sidebar.classList.toggle("abierto");

  document.body.classList.toggle(
    "admin-sidebar-abierto",
    abierto
  );

  const boton =
    $("botonMenuAdmin") ||
    $("abrirMenuAdmin");

  boton?.setAttribute(
    "aria-expanded",
    String(abierto)
  );
}

async function inicializarModulo(nombre) {
  if (!INICIALIZADORES[nombre]) {
    return;
  }

  if (modulosInicializados.has(nombre)) {
    return;
  }

  if (modulosPendientes.has(nombre)) {
    return modulosPendientes.get(nombre);
  }

  const dependencias = {
    mostrarToast,
    abrirModal,
    cerrarModal,
    establecerTexto,
    establecerEstadoCargaTabla
  };

  const tarea = Promise.resolve()
    .then(() => INICIALIZADORES[nombre](dependencias))
    .then(() => {
      modulosInicializados.add(nombre);
    })
    .catch(error => {
      console.error(
        `Error al inicializar ${nombre}:`,
        error
      );

      mostrarToast(
        `No se pudo iniciar el módulo de ${TITULOS[nombre].toLowerCase()}.`,
        "error"
      );
    })
    .finally(() => {
      modulosPendientes.delete(nombre);
    });

  modulosPendientes.set(nombre, tarea);

  return tarea;
}

async function cambiarSeccion(nombre, opciones = {}) {
  if (
    !sesionValidada ||
    navegacionBloqueada ||
    !SECCIONES.includes(nombre)
  ) {
    return;
  }

  seccionActual = nombre;

  actualizarSecciones(nombre);
  actualizarNavegacion(nombre);
  actualizarTitulo(nombre);
  cerrarMenuMovil();
  cerrarTodosLosModales();

  if (opciones.actualizarURL !== false) {
    const hash = `#${nombre}`;

    if (window.location.hash !== hash) {
      history.replaceState(null, "", hash);
    }
  }

  await inicializarModulo(nombre);

  if (seccionActual !== nombre) {
    return;
  }

  document.dispatchEvent(
    new CustomEvent("admin:seccion", {
      detail: {
        seccion: nombre
      }
    })
  );
}

function configurarNavegacion() {
  obtenerBotonesNavegacion().forEach(boton => {
    boton.addEventListener("click", evento => {
      const seccion = obtenerNombreSeccionBoton(boton);

      if (!SECCIONES.includes(seccion)) {
        return;
      }

      evento.preventDefault();
      cambiarSeccion(seccion);
    });
  });

  window.addEventListener("hashchange", () => {
    cambiarSeccion(
      obtenerSeccionDesdeURL(),
      {
        actualizarURL: false
      }
    );
  });

  [
    "botonMenuAdmin",
    "abrirMenuAdmin"
  ].forEach(id => {
    $(id)?.addEventListener(
      "click",
      alternarMenuMovil
    );
  });

  [
    "botonCerrarMenuAdmin",
    "cerrarMenuAdmin"
  ].forEach(id => {
    $(id)?.addEventListener(
      "click",
      cerrarMenuMovil
    );
  });

  document.addEventListener("click", evento => {
    const objetivo = evento.target;

    if (!(objetivo instanceof Element)) {
      return;
    }

    if (
      objetivo.closest(
        "[data-cerrar-menu-admin]"
      )
    ) {
      cerrarMenuMovil();
    }
  });
}

function configurarModales() {
  document.addEventListener("click", evento => {
    const objetivo = evento.target;

    if (!(objetivo instanceof Element)) {
      return;
    }

    const botonCerrar = objetivo.closest(
      "[data-cerrar-modal], [data-modal-cerrar]"
    );

    if (botonCerrar) {
      const id =
        botonCerrar.dataset.cerrarModal ||
        botonCerrar.dataset.modalCerrar ||
        botonCerrar.closest(".admin-modal")?.id;

      if (id) {
        cerrarModal(id);
      }

      return;
    }

    const botonAbrir = objetivo.closest(
      "[data-abrir-modal], [data-modal-abrir]"
    );

    if (botonAbrir) {
      const id =
        botonAbrir.dataset.abrirModal ||
        botonAbrir.dataset.modalAbrir;

      if (id) {
        abrirModal(id);
      }
    }
  });

  document.addEventListener("keydown", evento => {
    if (evento.key !== "Escape") {
      return;
    }

    const modal = document.querySelector(
      ".admin-modal.activo, .admin-modal.visible, .admin-modal.abierto"
    );

    if (modal) {
      cerrarModal(modal);
    } else {
      cerrarMenuMovil();
    }
  });
}

function obtenerNombrePerfil(perfil, usuario) {
  return (
    perfil?.nombreCompleto ||
    perfil?.nombre ||
    usuario?.displayName ||
    "Administrador"
  );
}

function obtenerIniciales(nombre) {
  const partes = String(nombre)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!partes.length) {
    return "AD";
  }

  if (partes.length === 1) {
    return partes[0].slice(0, 2).toUpperCase();
  }

  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

function actualizarDatosAdministrador(usuario, perfil) {
  const nombre = obtenerNombrePerfil(perfil, usuario);

  [
    "nombreAdministrador",
    "adminNombre",
    "usuarioAdministrador"
  ].forEach(id => {
    establecerTexto(id, nombre);
  });

  [
    "correoAdministrador",
    "adminCorreo"
  ].forEach(id => {
    establecerTexto(
      id,
      usuario.email || ""
    );
  });

  [
    "avatarAdministrador",
    "adminAvatar"
  ].forEach(id => {
    establecerTexto(
      id,
      obtenerIniciales(nombre)
    );
  });
}

async function ejecutarCierreSesion() {
  const confirmado = window.confirm(
    "¿Deseas cerrar tu sesión administrativa?"
  );

  if (!confirmado) {
    return;
  }

  navegacionBloqueada = true;

  try {
    await cerrarSesion();
    window.location.replace("index.html");
  } catch (error) {
    navegacionBloqueada = false;

    console.error(
      "Error al cerrar sesión:",
      error
    );

    mostrarToast(
      "No fue posible cerrar la sesión.",
      "error"
    );
  }
}

function configurarCierreSesion() {
  [
    "botonCerrarSesion",
    "cerrarSesionAdmin",
    "btnCerrarSesion"
  ].forEach(id => {
    $(id)?.addEventListener(
      "click",
      ejecutarCierreSesion
    );
  });
}

function configurarAccesosRapidos() {
  document.querySelectorAll(
    "[data-ir-seccion]"
  ).forEach(boton => {
    boton.addEventListener("click", evento => {
      const nombre = boton.dataset.irSeccion;

      if (!SECCIONES.includes(nombre)) {
        return;
      }

      evento.preventDefault();
      cambiarSeccion(nombre);
    });
  });
}

function configurarInterfaz() {
  if (interfazInicializada) {
    return;
  }

  interfazInicializada = true;

  configurarNavegacion();
  configurarModales();
  configurarCierreSesion();
  configurarAccesosRapidos();
}

async function cargarResumenDashboard() {
  await inicializarModulo("asistencias");
}

function mostrarPantallaCarga(mostrar) {
  const pantalla =
    $("pantallaCargaAdmin") ||
    $("adminLoader");

  if (pantalla) {
    pantalla.hidden = !mostrar;
  }
}

function mostrarAccesoDenegado() {
  mostrarPantallaCarga(false);

  const contenedor = document.createElement("div");

  contenedor.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:99999",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:24px",
    "background:#101411",
    "color:#fff",
    "font-family:system-ui,sans-serif"
  ].join(";");

  const tarjeta = document.createElement("div");

  tarjeta.style.cssText = [
    "width:min(100%,440px)",
    "padding:32px",
    "border:1px solid rgba(255,255,255,.12)",
    "border-radius:20px",
    "background:#1c241e",
    "text-align:center"
  ].join(";");

  const titulo = crearElemento(
    "h2",
    "",
    "Acceso restringido"
  );

  const descripcion = crearElemento(
    "p",
    "",
    "Tu cuenta no tiene permisos para ingresar al panel administrativo."
  );

  descripcion.style.lineHeight = "1.6";
  descripcion.style.color = "#d1d5d2";

  const boton = crearElemento(
    "button",
    "",
    "Volver al inicio"
  );

  boton.type = "button";

  boton.style.cssText = [
    "margin-top:12px",
    "padding:13px 22px",
    "border:0",
    "border-radius:12px",
    "background:#e8b54d",
    "color:#181818",
    "font-weight:700",
    "cursor:pointer"
  ].join(";");

  boton.addEventListener("click", () => {
    window.location.replace("index.html");
  });

  tarjeta.append(
    titulo,
    descripcion,
    boton
  );

  contenedor.append(tarjeta);
  document.body.append(contenedor);
}

async function validarAdministrador(usuario) {
  const perfil = await obtenerPerfil(usuario.uid);

  if (!perfil) {
    return null;
  }

  const rol = normalizarRol(perfil.rol);

  if (rol !== "admin" || perfil.activo === false) {
    return null;
  }

  return perfil;
}

async function iniciarPanelAdministrador(usuario) {
  try {
    mostrarPantallaCarga(true);

    const perfil = await validarAdministrador(usuario);

    if (!perfil) {
      mostrarAccesoDenegado();
      return;
    }

    perfilAdministrador = perfil;
    sesionValidada = true;

    actualizarDatosAdministrador(
      usuario,
      perfilAdministrador
    );

    configurarInterfaz();

    mostrarPantallaCarga(false);

    await cambiarSeccion(
      obtenerSeccionDesdeURL(),
      {
        actualizarURL: false
      }
    );

    if (seccionActual === "dashboard") {
      await cargarResumenDashboard();
    }
  } catch (error) {
    console.error(
      "Error al iniciar panel administrativo:",
      error
    );

    mostrarPantallaCarga(false);

    mostrarToast(
      "No se pudo verificar tu cuenta administrativa.",
      "error"
    );
  }
}

function iniciarAutenticacion() {
  onAuthStateChanged(
    auth,
    async usuario => {
      if (!usuario) {
        sesionValidada = false;
        window.location.replace("index.html");
        return;
      }

      if (sesionValidada) {
        return;
      }

      await iniciarPanelAdministrador(usuario);
    },
    error => {
      console.error(
        "Error de autenticación:",
        error
      );

      mostrarPantallaCarga(false);

      mostrarToast(
        "Ocurrió un error al verificar la sesión.",
        "error"
      );
    }
  );
}

function iniciarAplicacion() {
  mostrarPantallaCarga(true);
  iniciarAutenticacion();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    iniciarAplicacion,
    {
      once: true
    }
  );
} else {
  iniciarAplicacion();
}

export {
  abrirModal,
  cerrarModal,
  cambiarSeccion,
  mostrarToast,
  establecerTexto,
  establecerEstadoCargaTabla
};
