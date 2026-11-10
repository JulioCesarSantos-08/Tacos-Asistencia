
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  auth,
  db
} from "../firebase.js";

import {
  validarHora,
  horaAMinutos,
  calcularDuracionTurno
} from "../asistencias.js";

const $ = id => document.getElementById(id);

const DIAS = Object.freeze([
  { valor: 0, nombre: "Domingo", corto: "Dom" },
  { valor: 1, nombre: "Lunes", corto: "Lun" },
  { valor: 2, nombre: "Martes", corto: "Mar" },
  { valor: 3, nombre: "Miércoles", corto: "Mié" },
  { valor: 4, nombre: "Jueves", corto: "Jue" },
  { valor: 5, nombre: "Viernes", corto: "Vie" },
  { valor: 6, nombre: "Sábado", corto: "Sáb" }
]);

let horarios = [];
let inicializado = false;
let cargando = false;
let guardando = false;
let horarioEditando = null;

let mostrarToast = () => {};
let abrirModal = () => {};
let cerrarModal = () => {};

function crearElemento(etiqueta, clase = "", texto) {
  const elemento = document.createElement(etiqueta);

  if (clase) {
    elemento.className = clase;
  }

  if (texto !== undefined) {
    elemento.textContent = String(texto);
  }

  return elemento;
}

function crearBoton(texto, clase, accion) {
  const boton = crearElemento("button", clase, texto);

  boton.type = "button";
  boton.addEventListener("click", accion);

  return boton;
}

function normalizarDias(dias) {
  if (!Array.isArray(dias)) {
    return [];
  }

  return [...new Set(
    dias.map(Number).filter(dia =>
      Number.isInteger(dia) &&
      dia >= 0 &&
      dia <= 6
    )
  )].sort((a, b) => a - b);
}

function obtenerDiasFormulario() {
  return normalizarDias(
    [...document.querySelectorAll(
      'input[name="horarioDia"]:checked'
    )].map(input => Number(input.value))
  );
}

function establecerDiasFormulario(dias) {
  const seleccionados = normalizarDias(dias);

  document.querySelectorAll(
    'input[name="horarioDia"]'
  ).forEach(input => {
    input.checked = seleccionados.includes(
      Number(input.value)
    );
  });
}

function formatearDias(dias) {
  const seleccionados = normalizarDias(dias);

  if (seleccionados.length === 7) {
    return "Todos los días";
  }

  if (!seleccionados.length) {
    return "Sin días asignados";
  }

  return seleccionados
    .map(dia => DIAS.find(item => item.valor === dia)?.corto)
    .filter(Boolean)
    .join(" · ");
}

function formatearDuracion(minutos) {
  if (!Number.isFinite(minutos) || minutos <= 0) {
    return "—";
  }

  const horas = Math.floor(minutos / 60);
  const restantes = minutos % 60;

  return restantes
    ? `${horas} h ${restantes} min`
    : `${horas} h`;
}

function crearDetalle(etiqueta, valor) {
  const fila = document.createElement("div");

  fila.append(
    crearElemento("span", "", etiqueta),
    crearElemento("strong", "", valor)
  );

  return fila;
}

function crearTarjetaHorario(horario) {
  const tarjeta = crearElemento(
    "article",
    "admin-horario-card"
  );

  const encabezado = crearElemento(
    "div",
    "admin-horario-card-header"
  );

  const titulo = crearElemento(
    "h3",
    "",
    horario.nombre || "Horario sin nombre"
  );

  const estado = crearElemento(
    "span",
    `admin-insignia ${horario.activo ? "verde" : "gris"}`,
    horario.activo ? "Activo" : "Inactivo"
  );

  encabezado.append(titulo, estado);

  const horas = crearElemento(
    "div",
    "admin-horario-card-horas"
  );

  horas.append(
    crearElemento(
      "strong",
      "",
      horario.horaEntrada || "--:--"
    ),
    crearElemento("span", "", "→"),
    crearElemento(
      "strong",
      "",
      horario.horaSalida || "--:--"
    )
  );

  const detalles = crearElemento(
    "div",
    "admin-horario-card-detalles"
  );

  const duracion = calcularDuracionTurno(
    horario.horaEntrada,
    horario.horaSalida
  );

  const nocturno =
    validarHora(horario.horaEntrada) &&
    validarHora(horario.horaSalida) &&
    horaAMinutos(horario.horaSalida) <=
    horaAMinutos(horario.horaEntrada);

  detalles.append(
    crearDetalle(
      "Duración de jornada",
      formatearDuracion(duracion)
    ),
    crearDetalle(
      "Tolerancia",
      `${horario.toleranciaMinutos ?? 10} minutos`
    ),
    crearDetalle(
      "Límite de entrada",
      `${horario.limiteEntradaMinutos ?? 40} minutos`
    ),
    crearDetalle(
      "Tipo de jornada",
      nocturno ? "Cruza medianoche" : "Mismo día"
    ),
    crearDetalle(
      "Días laborales",
      formatearDias(horario.diasTrabajo)
    )
  );

  const acciones = crearElemento(
    "div",
    "admin-horario-card-acciones"
  );

  acciones.append(
    crearBoton(
      "Editar horario",
      "admin-boton-secundario",
      () => editarHorario(horario.id)
    ),
    crearBoton(
      horario.activo ? "Desactivar" : "Activar",
      horario.activo
        ? "admin-accion-tabla peligro"
        : "admin-accion-tabla",
      () => cambiarEstadoHorario(horario)
    )
  );

  tarjeta.append(
    encabezado,
    horas,
    detalles,
    acciones
  );

  return tarjeta;
}

function mostrarEstado(mensaje, titulo = "Horarios") {
  const contenedor = $("listaHorarios");

  if (!contenedor) {
    return;
  }

  const vacio = crearElemento(
    "div",
    "admin-estado-vacio"
  );

  vacio.append(
    crearElemento("strong", "", titulo),
    crearElemento("p", "", mensaje)
  );

  contenedor.replaceChildren(vacio);
}

function renderizarHorarios() {
  const contenedor = $("listaHorarios");

  if (!contenedor) {
    return;
  }

  if (!horarios.length) {
    mostrarEstado(
      "Crea el primer horario para comenzar a organizar los turnos.",
      "Sin horarios registrados"
    );
    return;
  }

  const fragmento = document.createDocumentFragment();

  horarios.forEach(horario => {
    fragmento.append(crearTarjetaHorario(horario));
  });

  contenedor.replaceChildren(fragmento);
}

async function cargarHorarios() {
  if (cargando) {
    return;
  }

  cargando = true;

  mostrarEstado(
    "Consultando los horarios configurados...",
    "Cargando horarios"
  );

  try {
    const resultado = await getDocs(
      collection(db, "horarios")
    );

    horarios = resultado.docs.map(documento => ({
      ...documento.data(),
      id: documento.id
    }));

    horarios.sort((a, b) => {
      const entradaA = validarHora(a.horaEntrada)
        ? horaAMinutos(a.horaEntrada)
        : 0;

      const entradaB = validarHora(b.horaEntrada)
        ? horaAMinutos(b.horaEntrada)
        : 0;

      return entradaA - entradaB ||
        String(a.nombre || "").localeCompare(
          String(b.nombre || ""),
          "es-MX"
        );
    });

    renderizarHorarios();
  } catch (error) {
    console.error("Error al cargar horarios:", error);

    mostrarEstado(
      "No fue posible consultar los horarios.",
      "Error de conexión"
    );

    mostrarToast(
      error.code === "permission-denied"
        ? "No tienes permisos para consultar los horarios."
        : "No se pudieron consultar los horarios.",
      "error"
    );
  } finally {
    cargando = false;
  }
}

function limpiarFormularioHorario() {
  $("formHorario")?.reset();

  horarioEditando = null;

  $("horarioId").value = "";
  $("horarioNombre").value = "";
  $("horarioEntrada").value = "17:00";
  $("horarioSalida").value = "23:59";
  $("horarioTolerancia").value = "10";
  $("horarioLimite").value = "40";
  $("horarioActivo").checked = true;

  establecerDiasFormulario([1, 2, 3, 4, 5, 6]);

  $("tituloModalHorario").textContent = "Crear horario";
  $("guardarHorario").textContent = "Guardar horario";
}

function nuevoHorario() {
  limpiarFormularioHorario();
  abrirModal("modalHorario");
}

function editarHorario(id) {
  const horario = horarios.find(
    item => item.id === id
  );

  if (!horario) {
    mostrarToast(
      "No se encontró el horario seleccionado.",
      "error"
    );
    return;
  }

  limpiarFormularioHorario();

  horarioEditando = horario;

  $("horarioId").value = horario.id;
  $("horarioNombre").value = horario.nombre || "";
  $("horarioEntrada").value =
    horario.horaEntrada || "17:00";
  $("horarioSalida").value =
    horario.horaSalida || "23:59";
  $("horarioTolerancia").value =
    horario.toleranciaMinutos ?? 10;
  $("horarioLimite").value =
    horario.limiteEntradaMinutos ?? 40;
  $("horarioActivo").checked =
    horario.activo === true;

  establecerDiasFormulario(horario.diasTrabajo);

  $("tituloModalHorario").textContent = "Editar horario";
  $("guardarHorario").textContent = "Guardar cambios";

  abrirModal("modalHorario");
}

function obtenerDatosFormulario() {
  const nombre = $("horarioNombre").value
    .trim()
    .replace(/\s+/g, " ");

  const horaEntrada = $("horarioEntrada").value;
  const horaSalida = $("horarioSalida").value;

  const toleranciaMinutos = Number(
    $("horarioTolerancia").value
  );

  const limiteEntradaMinutos = Number(
    $("horarioLimite").value
  );

  const diasTrabajo = obtenerDiasFormulario();
  const activo = $("horarioActivo").checked;

  if (nombre.length < 3 || nombre.length > 80) {
    throw new Error(
      "El nombre del horario debe contener entre 3 y 80 caracteres."
    );
  }

  if (
    !validarHora(horaEntrada) ||
    !validarHora(horaSalida)
  ) {
    throw new Error(
      "Selecciona horas válidas de entrada y salida."
    );
  }

  if (horaEntrada === horaSalida) {
    throw new Error(
      "La hora de entrada y salida no pueden ser iguales."
    );
  }

  const duracion = calcularDuracionTurno(
    horaEntrada,
    horaSalida
  );

  if (
    !Number.isFinite(duracion) ||
    duracion <= 0 ||
    duracion > 16 * 60
  ) {
    throw new Error(
      "La jornada debe durar más de cero y como máximo 16 horas."
    );
  }

  if (
    !Number.isInteger(toleranciaMinutos) ||
    toleranciaMinutos < 0 ||
    toleranciaMinutos > 180
  ) {
    throw new Error(
      "La tolerancia debe estar entre 0 y 180 minutos."
    );
  }

  if (
    !Number.isInteger(limiteEntradaMinutos) ||
    limiteEntradaMinutos < 0 ||
    limiteEntradaMinutos > 360
  ) {
    throw new Error(
      "El límite de entrada debe estar entre 0 y 360 minutos."
    );
  }

  if (limiteEntradaMinutos < toleranciaMinutos) {
    throw new Error(
      "El límite de entrada no puede ser menor que la tolerancia."
    );
  }

  if (limiteEntradaMinutos >= duracion) {
    throw new Error(
      "El límite de entrada debe ser menor que la duración del turno."
    );
  }

  if (!diasTrabajo.length) {
    throw new Error(
      "Selecciona al menos un día laboral."
    );
  }

  return {
    nombre,
    horaEntrada,
    horaSalida,
    toleranciaMinutos,
    limiteEntradaMinutos,
    diasTrabajo,
    activo
  };
}

function establecerGuardando(estado) {
  guardando = estado;

  const boton = $("guardarHorario");

  if (!boton) {
    return;
  }

  boton.disabled = estado;

  boton.textContent = estado
    ? "Guardando..."
    : horarioEditando
      ? "Guardar cambios"
      : "Guardar horario";
}

function obtenerMensajeError(error) {
  if (error.code === "permission-denied") {
    return "Firestore rechazó la operación. Revisa las reglas de horarios y tu cuenta de administrador.";
  }

  if (error.code === "unauthenticated") {
    return "Tu sesión ha expirado. Inicia sesión nuevamente.";
  }

  if (error.code === "unavailable") {
    return "No hay conexión con Firebase. Inténtalo nuevamente.";
  }

  return error.message ||
    "No fue posible completar la operación.";
}

async function guardarHorario(evento) {
  evento.preventDefault();

  if (guardando) {
    return;
  }

  try {
    const datos = obtenerDatosFormulario();
    const usuario = auth.currentUser;

    if (!usuario) {
      throw new Error(
        "Debes iniciar sesión para guardar horarios."
      );
    }

    const esEdicion = Boolean(horarioEditando?.id);
    const referencia = esEdicion
      ? doc(db, "horarios", horarioEditando.id)
      : doc(collection(db, "horarios"));

    establecerGuardando(true);

    if (esEdicion) {
      await updateDoc(referencia, {
        ...datos,
        actualizadoEn: serverTimestamp(),
        actualizadoPor: usuario.uid
      });
    } else {
      await setDoc(referencia, {
        ...datos,
        creadoEn: serverTimestamp(),
        creadoPor: usuario.uid,
        actualizadoEn: serverTimestamp(),
        actualizadoPor: usuario.uid
      });
    }

    cerrarModal("modalHorario");
    limpiarFormularioHorario();

    mostrarToast(
      esEdicion
        ? "El horario fue actualizado correctamente."
        : "El horario fue creado correctamente.",
      "exito"
    );

    await cargarHorarios();
  } catch (error) {
    console.error("Error al guardar horario:", error);

    mostrarToast(
      obtenerMensajeError(error),
      "error"
    );
  } finally {
    establecerGuardando(false);
  }
}

async function cambiarEstadoHorario(horario) {
  if (guardando) {
    return;
  }

  const nuevoEstado = horario.activo !== true;

  const confirmado = window.confirm(
    `¿Deseas ${nuevoEstado ? "activar" : "desactivar"} el horario "${horario.nombre}"?`
  );

  if (!confirmado) {
    return;
  }

  try {
    const usuario = auth.currentUser;

    if (!usuario) {
      throw new Error(
        "Debes iniciar sesión para modificar horarios."
      );
    }

    guardando = true;

    await updateDoc(
      doc(db, "horarios", horario.id),
      {
        activo: nuevoEstado,
        actualizadoEn: serverTimestamp(),
        actualizadoPor: usuario.uid
      }
    );

    mostrarToast(
      nuevoEstado
        ? "El horario fue activado."
        : "El horario fue desactivado.",
      "exito"
    );

    await cargarHorarios();
  } catch (error) {
    console.error(
      "Error al cambiar estado del horario:",
      error
    );

    mostrarToast(
      obtenerMensajeError(error),
      "error"
    );
  } finally {
    guardando = false;
  }
}

function configurarEventos() {
  $("formHorario")?.addEventListener(
    "submit",
    guardarHorario
  );

  document.addEventListener(
    "admin:seccion",
    evento => {
      if (evento.detail?.seccion === "horarios") {
        cargarHorarios();
      }
    }
  );
}

async function inicializarHorarios(dependencias = {}) {
  if (inicializado) {
    return;
  }

  mostrarToast =
    dependencias.mostrarToast || mostrarToast;

  abrirModal =
    dependencias.abrirModal || abrirModal;

  cerrarModal =
    dependencias.cerrarModal || cerrarModal;

  inicializado = true;

  configurarEventos();

  const botonNuevo = $("botonNuevoHorario");

  if (botonNuevo) {
    botonNuevo.disabled = false;
    botonNuevo.addEventListener("click", nuevoHorario);
  }

  const botonGuardar = $("guardarHorario");

  if (botonGuardar) {
    botonGuardar.disabled = false;
  }

  await cargarHorarios();
}

export {
  inicializarHorarios,
  cargarHorarios,
  renderizarHorarios,
  nuevoHorario,
  editarHorario
};
