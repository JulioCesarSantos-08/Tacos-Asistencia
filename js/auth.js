
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  auth,
  db,
  persistenciaLista
} from "./firebase.js";

const ROLES = Object.freeze({
  ADMIN: "admin",
  MESERO: "mesero",
  COCINA: "cocina",
  RECEPCION: "recepcion",
  REPARTIDOR: "repartidor"
});

const ROLES_VALIDOS = Object.values(ROLES);

const RUTAS = Object.freeze({
  LOGIN: "index.html",
  ADMIN: "admin.html",
  EMPLEADO: "empleado.html"
});

let empleadoActual = null;

function normalizarRol(rol) {
  return String(rol || "").trim().toLowerCase();
}

function normalizarNombre(nombre) {
  return String(nombre || "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("es-MX");
}

function obtenerIniciales(nombre) {
  const palabras = normalizarNombre(nombre).split(" ").filter(Boolean);

  if (!palabras.length) {
    return "TO";
  }

  if (palabras.length === 1) {
    return palabras[0].slice(0, 2);
  }

  return `${palabras[0][0]}${palabras[1][0]}`;
}

function obtenerNombreRol(rol) {
  const nombres = {
    admin: "Administrador",
    mesero: "Mesero",
    cocina: "Cocina",
    recepcion: "Recepción",
    repartidor: "Repartidor"
  };

  return nombres[normalizarRol(rol)] || "Sin asignar";
}

function crearError(codigo, mensaje) {
  const error = new Error(mensaje);
  error.code = codigo;
  return error;
}

async function obtenerPerfil(uid) {
  if (!uid) {
    throw crearError(
      "empleado/uid-invalido",
      "No se pudo identificar al empleado."
    );
  }

  const referencia = doc(db, "empleados", uid);
  const documento = await getDoc(referencia);

  if (!documento.exists()) {
    throw crearError(
      "empleado/sin-perfil",
      "Tu cuenta todavía no tiene un perfil de empleado. Comunícate con el administrador."
    );
  }

  const datos = documento.data();
  const rol = normalizarRol(datos.rol);

  if (datos.activo !== true) {
    throw crearError(
      "empleado/inactivo",
      "Tu cuenta no está activa. Comunícate con el administrador."
    );
  }

  if (!ROLES_VALIDOS.includes(rol)) {
    throw crearError(
      "empleado/rol-invalido",
      "Tu cuenta no tiene un rol válido. Comunícate con el administrador."
    );
  }

  const nombreCompleto = normalizarNombre(datos.nombreCompleto);

  if (!nombreCompleto) {
    throw crearError(
      "empleado/nombre-invalido",
      "Tu perfil no tiene un nombre registrado. Comunícate con el administrador."
    );
  }

  return {
    ...datos,
    uid,
    nombreCompleto,
    rol,
    activo: true,
    nombreRol: obtenerNombreRol(rol),
    iniciales: obtenerIniciales(nombreCompleto)
  };
}

async function iniciarSesion(correo, contrasena) {
  const email = String(correo || "").trim();
  const password = String(contrasena || "");

  if (!email || !password) {
    throw crearError(
      "auth/campos-vacios",
      "Ingresa tu correo electrónico y contraseña."
    );
  }

  await persistenciaLista;

  const credencial = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  try {
    const perfil = await obtenerPerfil(credencial.user.uid);
    empleadoActual = perfil;
    return perfil;
  } catch (error) {
    empleadoActual = null;
    await signOut(auth);
    throw error;
  }
}

async function cerrarSesion() {
  empleadoActual = null;
  await signOut(auth);
}

function obtenerEmpleadoActual() {
  return empleadoActual;
}

function obtenerRutaPorRol(rol) {
  return normalizarRol(rol) === ROLES.ADMIN
    ? RUTAS.ADMIN
    : RUTAS.EMPLEADO;
}

function obtenerRutaActual() {
  return window.location.pathname.split("/").pop() || RUTAS.LOGIN;
}

function navegar(ruta, reemplazar = true) {
  if (obtenerRutaActual() === ruta) {
    return;
  }

  if (reemplazar) {
    window.location.replace(ruta);
  } else {
    window.location.assign(ruta);
  }
}

function esperarAutenticacion() {
  return new Promise((resolve, reject) => {
    const cancelar = onAuthStateChanged(
      auth,
      usuario => {
        cancelar();
        resolve(usuario);
      },
      error => {
        cancelar();
        reject(error);
      }
    );
  });
}

async function verificarSesion() {
  await persistenciaLista;

  const usuario = await esperarAutenticacion();

  if (!usuario) {
    empleadoActual = null;
    return null;
  }

  try {
    const perfil = await obtenerPerfil(usuario.uid);
    empleadoActual = perfil;
    return perfil;
  } catch (error) {
    empleadoActual = null;
    await signOut(auth);
    throw error;
  }
}

async function protegerPagina(rolesPermitidos = []) {
  try {
    const perfil = await verificarSesion();

    if (!perfil) {
      navegar(RUTAS.LOGIN);
      return null;
    }

    if (
      rolesPermitidos.length &&
      !rolesPermitidos.includes(perfil.rol)
    ) {
      navegar(obtenerRutaPorRol(perfil.rol));
      return null;
    }

    return perfil;
  } catch (error) {
    console.error("No se pudo validar la sesión:", error);
    navegar(RUTAS.LOGIN);
    return null;
  }
}

async function redirigirSiAutenticado() {
  try {
    const perfil = await verificarSesion();

    if (perfil) {
      navegar(obtenerRutaPorRol(perfil.rol));
      return perfil;
    }

    return null;
  } catch (error) {
    return null;
  }
}

function obtenerMensajeError(error) {
  const mensajes = {
    "auth/invalid-email": "El correo electrónico no es válido.",
    "auth/invalid-credential": "El correo o la contraseña son incorrectos.",
    "auth/wrong-password": "El correo o la contraseña son incorrectos.",
    "auth/user-not-found": "No encontramos una cuenta con ese correo.",
    "auth/user-disabled": "Esta cuenta fue deshabilitada.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
    "auth/network-request-failed": "No se pudo conectar. Revisa tu conexión a internet.",
    "auth/operation-not-allowed": "El acceso con correo y contraseña no está habilitado.",
    "permission-denied": "No tienes permisos para consultar tu perfil.",
    "firestore/permission-denied": "No tienes permisos para consultar tu perfil.",
    "unavailable": "El servicio no está disponible. Inténtalo nuevamente.",
    "firestore/unavailable": "El servicio no está disponible. Inténtalo nuevamente.",
    "empleado/sin-perfil": "Tu cuenta todavía no tiene un perfil de empleado. Comunícate con el administrador.",
    "empleado/inactivo": "Tu cuenta no está activa. Comunícate con el administrador.",
    "empleado/rol-invalido": "Tu cuenta no tiene un rol válido. Comunícate con el administrador.",
    "empleado/nombre-invalido": "Tu perfil no tiene un nombre registrado. Comunícate con el administrador."
  };

  return mensajes[error?.code] ||
    error?.message ||
    "Ocurrió un error inesperado. Inténtalo nuevamente.";
}

export {
  ROLES,
  ROLES_VALIDOS,
  RUTAS,
  normalizarRol,
  normalizarNombre,
  obtenerIniciales,
  obtenerNombreRol,
  obtenerPerfil,
  iniciarSesion,
  cerrarSesion,
  obtenerEmpleadoActual,
  obtenerRutaPorRol,
  verificarSesion,
  protegerPagina,
  redirigirSiAutenticado,
  obtenerMensajeError
};
