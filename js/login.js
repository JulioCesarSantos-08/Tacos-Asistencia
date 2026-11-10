
import {
  iniciarSesion,
  obtenerRutaPorRol,
  redirigirSiAutenticado,
  obtenerMensajeError
} from "./auth.js";

const ZONA_HORARIA = "America/Mexico_City";

const elementos = {
  formulario: document.getElementById("formLogin"),
  correo: document.getElementById("correo"),
  contrasena: document.getElementById("contrasena"),
  mostrarContrasena: document.getElementById("mostrarContrasena"),
  iconoMostrar: document.getElementById("iconoMostrar"),
  botonIngresar: document.getElementById("botonIngresar"),
  textoIngresar: document.getElementById("textoIngresar"),
  flechaIngresar: document.getElementById("flechaIngresar"),
  cargandoIngresar: document.getElementById("cargandoIngresar"),
  mensajeLogin: document.getElementById("mensajeLogin"),
  relojHora: document.getElementById("relojHora"),
  relojFecha: document.getElementById("relojFecha"),
  anioActual: document.getElementById("anioActual")
};

let iniciandoSesion = false;
let comprobandoSesion = true;
let temporizadorReloj = null;

const formatoHora = new Intl.DateTimeFormat("es-MX", {
  timeZone: ZONA_HORARIA,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

const formatoFecha = new Intl.DateTimeFormat("es-MX", {
  timeZone: ZONA_HORARIA,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric"
});

function actualizarReloj() {
  const ahora = new Date();

  if (elementos.relojHora) {
    elementos.relojHora.textContent = formatoHora.format(ahora);
  }

  if (elementos.relojFecha) {
    const fecha = formatoFecha.format(ahora);

    elementos.relojFecha.textContent =
      fecha.charAt(0).toLocaleUpperCase("es-MX") + fecha.slice(1);
  }

  if (elementos.anioActual) {
    elementos.anioActual.textContent = new Intl.DateTimeFormat("es-MX", {
      timeZone: ZONA_HORARIA,
      year: "numeric"
    }).format(ahora);
  }
}

function iniciarReloj() {
  actualizarReloj();

  if (temporizadorReloj !== null) {
    clearInterval(temporizadorReloj);
  }

  temporizadorReloj = setInterval(actualizarReloj, 1000);
}

function mostrarMensaje(mensaje, tipo = "error") {
  const contenedor = elementos.mensajeLogin;

  if (!contenedor) {
    return;
  }

  contenedor.textContent = mensaje;
  contenedor.className = "login-mensaje";

  if (tipo === "exito") {
    contenedor.classList.add("exito");
  }

  if (tipo === "advertencia") {
    contenedor.classList.add("advertencia");
  }

  contenedor.hidden = false;
}

function ocultarMensaje() {
  if (!elementos.mensajeLogin) {
    return;
  }

  elementos.mensajeLogin.hidden = true;
  elementos.mensajeLogin.textContent = "";
  elementos.mensajeLogin.className = "login-mensaje";
}

function establecerCarga(cargando, texto = "Ingresando...") {
  const boton = elementos.botonIngresar;

  if (!boton) {
    return;
  }

  boton.disabled = cargando;
  boton.setAttribute("aria-busy", String(cargando));

  if (elementos.textoIngresar) {
    elementos.textoIngresar.textContent = cargando
      ? texto
      : "Ingresar a mi cuenta";
  }

  if (elementos.flechaIngresar) {
    elementos.flechaIngresar.hidden = cargando;
  }

  if (elementos.cargandoIngresar) {
    elementos.cargandoIngresar.hidden = !cargando;
  }
}

function configurarVisibilidadContrasena() {
  const boton = elementos.mostrarContrasena;
  const campo = elementos.contrasena;

  if (!boton || !campo) {
    return;
  }

  boton.addEventListener("click", () => {
    const visible = campo.type === "text";

    campo.type = visible ? "password" : "text";

    boton.setAttribute("aria-pressed", String(!visible));
    boton.setAttribute(
      "aria-label",
      visible ? "Mostrar contraseña" : "Ocultar contraseña"
    );

    if (elementos.iconoMostrar) {
      elementos.iconoMostrar.innerHTML = visible
        ? `
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        `
        : `
          <path d="M3 3l18 18"></path>
          <path d="M10.6 5.1A11.6 11.6 0 0 1 12 5c6.5 0 10 7 10 7a15 15 0 0 1-3.3 4.1"></path>
          <path d="M6.2 6.2C3.5 8.1 2 12 2 12s3.5 7 10 7a10.9 10.9 0 0 0 4.1-.8"></path>
          <path d="M10 10a3 3 0 0 0 4 4"></path>
        `;
    }

    campo.focus({ preventScroll: true });
  });
}

function validarCorreo(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

function configurarCampos() {
  const campos = [elementos.correo, elementos.contrasena];

  campos.forEach(campo => {
    if (!campo) {
      return;
    }

    campo.addEventListener("input", ocultarMensaje);
  });

  if (elementos.correo) {
    elementos.correo.addEventListener("blur", () => {
      elementos.correo.value = elementos.correo.value.trim();
    });
  }
}

async function procesarInicioSesion(evento) {
  evento.preventDefault();

  if (iniciandoSesion || comprobandoSesion) {
    return;
  }

  const correo = elementos.correo?.value.trim() || "";
  const contrasena = elementos.contrasena?.value || "";

  ocultarMensaje();

  if (!correo || !contrasena) {
    mostrarMensaje("Ingresa tu correo electrónico y contraseña.");
    return;
  }

  if (!validarCorreo(correo)) {
    mostrarMensaje("Ingresa un correo electrónico válido.");
    elementos.correo?.focus();
    return;
  }

  if (contrasena.length < 6) {
    mostrarMensaje("La contraseña debe contener al menos 6 caracteres.");
    elementos.contrasena?.focus();
    return;
  }

  iniciandoSesion = true;
  establecerCarga(true, "Verificando cuenta...");

  try {
    const perfil = await iniciarSesion(correo, contrasena);

    establecerCarga(true, "Accediendo...");
    mostrarMensaje(
      `Bienvenido, ${perfil.nombreCompleto}. Preparando tu panel...`,
      "exito"
    );

    const destino = obtenerRutaPorRol(perfil.rol);

    window.location.replace(destino);
  } catch (error) {
    mostrarMensaje(obtenerMensajeError(error));
    iniciandoSesion = false;
    establecerCarga(false);
  }
}

async function comprobarSesionExistente() {
  establecerCarga(true, "Comprobando sesión...");

  try {
    const perfil = await redirigirSiAutenticado();

    if (perfil) {
      return;
    }
  } catch (error) {
    mostrarMensaje(obtenerMensajeError(error));
  } finally {
    comprobandoSesion = false;
    establecerCarga(false);
  }
}

function configurarFormulario() {
  if (!elementos.formulario) {
    return;
  }

  elementos.formulario.addEventListener(
    "submit",
    procesarInicioSesion
  );
}

function configurarActualizacionPantalla() {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      actualizarReloj();
    }
  });

  window.addEventListener("pageshow", () => {
    actualizarReloj();
  });

  window.addEventListener("pagehide", () => {
    if (temporizadorReloj !== null) {
      clearInterval(temporizadorReloj);
      temporizadorReloj = null;
    }
  });
}

async function iniciarAplicacion() {
  iniciarReloj();
  configurarVisibilidadContrasena();
  configurarCampos();
  configurarFormulario();
  configurarActualizacionPantalla();

  await comprobarSesionExistente();
}

iniciarAplicacion();
