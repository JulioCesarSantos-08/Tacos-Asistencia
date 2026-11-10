
import {
  auth
} from "./firebase.js";

import {
  protegerPagina,
  cerrarSesion,
  obtenerNombreRol,
  obtenerMensajeError
} from "./auth.js";

import {
  ZONA_HORARIA,
  formatearFecha,
  formatearHora,
  obtenerClaveMes,
  convertirFecha,
  registrarEntrada,
  registrarSalida,
  obtenerJornadaActiva,
  obtenerUltimasAsistencias,
  obtenerAsistenciasMes,
  calcularResumen,
  obtenerNombreEstado,
  obtenerMensajeErrorAsistencia
} from "./asistencias.js";

const $ = id => document.getElementById(id);

const RUTAS = Object.freeze({
  LOGIN: "index.html"
});

const ICONOS_ROL = Object.freeze({
  mesero: "🍽️",
  cocina: "🌮",
  recepcion: "☎️",
  repartidor: "🛵"
});

const FORMATO_HORA = new Intl.DateTimeFormat("es-MX", {
  timeZone: ZONA_HORARIA,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

const FORMATO_FECHA = new Intl.DateTimeFormat("es-MX", {
  timeZone: ZONA_HORARIA,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric"
});

const FORMATO_FECHA_CORTA = new Intl.DateTimeFormat("es-MX", {
  timeZone: ZONA_HORARIA,
  weekday: "short",
  day: "numeric",
  month: "short"
});

const FORMATO_HORA_NUMERICA = new Intl.DateTimeFormat("es-MX", {
  timeZone: ZONA_HORARIA,
  hour: "numeric",
  hour12: false
});

let empleado = null;
let jornadaActual = null;
let historialReciente = [];
let operacionActual = null;
let procesandoRegistro = false;
let cargandoDatos = false;
let relojIntervalo = null;
let actualizacionIntervalo = null;
let temporizadorToast = null;
let modalActivo = null;

function establecerTexto(id, valor) {
  const elemento = $(id);

  if (elemento) {
    elemento.textContent = valor ?? "—";
  }
}

function mostrarElemento(id, visible) {
  const elemento = $(id);

  if (elemento) {
    elemento.hidden = !visible;
  }
}

function obtenerSaludo() {
  const hora = Number(
    FORMATO_HORA_NUMERICA.format(new Date())
  );

  if (hora >= 5 && hora < 12) {
    return "¡Buenos días!";
  }

  if (hora >= 12 && hora < 19) {
    return "¡Buenas tardes!";
  }

  return "¡Buenas noches!";
}

function capitalizar(texto) {
  const valor = String(texto || "");

  return valor
    ? valor.charAt(0).toLocaleUpperCase("es-MX") + valor.slice(1)
    : "";
}

function actualizarReloj() {
  const ahora = new Date();

  establecerTexto("relojEmpleado", FORMATO_HORA.format(ahora));
  establecerTexto(
    "fechaEmpleado",
    capitalizar(FORMATO_FECHA.format(ahora))
  );
  establecerTexto(
    "fechaActualCorta",
    capitalizar(FORMATO_FECHA_CORTA.format(ahora))
  );
  establecerTexto("saludoHorario", obtenerSaludo());

  if (!$("modalConfirmacion")?.hidden) {
    establecerTexto("confirmacionHora", FORMATO_HORA.format(ahora));
    establecerTexto(
      "confirmacionFecha",
      capitalizar(FORMATO_FECHA_CORTA.format(ahora))
    );
  }
}

function iniciarReloj() {
  actualizarReloj();

  if (relojIntervalo !== null) {
    clearInterval(relojIntervalo);
  }

  relojIntervalo = setInterval(actualizarReloj, 1000);
}

function actualizarConexion() {
  const conectado = navigator.onLine;
  const contenedor = $("estadoConexion");

  if (contenedor) {
    contenedor.classList.toggle("conectado", conectado);
    contenedor.classList.toggle("desconectado", !conectado);
  }

  establecerTexto(
    "textoConexion",
    conectado ? "En línea" : "Sin conexión"
  );

  actualizarBotones();
}

function mostrarToast(mensaje, tipo = "exito") {
  const toast = $("toastEmpleado");

  if (!toast) {
    return;
  }

  clearTimeout(temporizadorToast);

  toast.textContent = mensaje;
  toast.className = "empleado-toast";

  if (tipo === "error") {
    toast.classList.add("error");
  }

  toast.hidden = false;

  temporizadorToast = setTimeout(() => {
    toast.hidden = true;
  }, 5500);
}

function mostrarMensajeAsistencia(mensaje, tipo = "exito") {
  const contenedor = $("mensajeAsistencia");

  if (!contenedor) {
    return;
  }

  contenedor.textContent = mensaje;
  contenedor.className = "jornada-mensaje";

  if (tipo === "error") {
    contenedor.classList.add("error");
  }

  contenedor.hidden = false;
}

function limpiarMensajeAsistencia() {
  const contenedor = $("mensajeAsistencia");

  if (contenedor) {
    contenedor.textContent = "";
    contenedor.hidden = true;
  }
}

function obtenerError(error) {
  return obtenerMensajeErrorAsistencia(error) ||
    obtenerMensajeError(error) ||
    "Ocurrió un error inesperado.";
}

function configurarPerfil() {
  if (!empleado) {
    return;
  }

  const rol = empleado.rol;
  const icono = ICONOS_ROL[rol] || "🌮";
  const nombreRol = obtenerNombreRol(rol);

  establecerTexto("nombreEmpleado", empleado.nombreCompleto);
  establecerTexto("nombreRol", nombreRol);
  establecerTexto("iconoRol", icono);
  establecerTexto("ilustracionRol", icono);
  establecerTexto("avatarIniciales", empleado.iniciales);
  establecerTexto("perfilAvatar", empleado.iniciales);
  establecerTexto("perfilNombre", empleado.nombreCompleto);
  establecerTexto("perfilRol", nombreRol);
  establecerTexto("perfilPuesto", nombreRol);
  establecerTexto("perfilCorreo", auth.currentUser?.email || empleado.correo || "—");
  establecerTexto(
    "perfilEstado",
    empleado.activo ? "Cuenta activa" : "Cuenta inactiva"
  );
}

function actualizarBotones() {
  const entrada = $("botonEntrada");
  const salida = $("botonSalida");

  const disponible =
    Boolean(empleado) &&
    navigator.onLine &&
    !procesandoRegistro &&
    !cargandoDatos;

  const activa = jornadaActual?.estadoJornada === "en_curso";

  if (entrada) {
    entrada.disabled = !disponible || activa;
  }

  if (salida) {
    salida.disabled = !disponible || !activa;
  }
}

function actualizarEstadoJornada() {
  const insignia = $("insigniaJornada");

  if (!jornadaActual) {
    establecerTexto("textoEstadoJornada", "Sin jornada activa");
    establecerTexto(
      "descripcionEstadoJornada",
      "Consulta tu horario y registra tu entrada cuando corresponda."
    );
    establecerTexto("horaEntrada", "--:--");
    establecerTexto("horaSalida", "--:--");

    if (insignia) {
      insignia.textContent = "Sin jornada activa";
      insignia.className = "insignia insignia-oscura";
    }
  } else {
    establecerTexto("textoEstadoJornada", "Jornada en curso");
    establecerTexto(
      "descripcionEstadoJornada",
      "Tu entrada está registrada. Recuerda marcar tu salida al terminar."
    );
    establecerTexto(
      "horaEntrada",
      formatearHora(jornadaActual.entrada)
    );
    establecerTexto("horaSalida", "--:--");

    if (insignia) {
      insignia.textContent = "En curso";
      insignia.className = "insignia insignia-verde";
    }
  }

  actualizarBotones();
}

function crearHistorialVacio(titulo, descripcion) {
  const contenedor = document.createElement("div");
  contenedor.className = "historial-vacio";

  const icono = document.createElement("div");
  icono.className = "historial-vacio-icono";
  icono.textContent = "◷";

  const texto = document.createElement("strong");
  texto.textContent = titulo;

  const parrafo = document.createElement("p");
  parrafo.textContent = descripcion;

  contenedor.append(icono, texto, parrafo);

  return contenedor;
}

function obtenerFechaRegistro(asistencia) {
  return convertirFecha(
    asistencia.fechaInicioProgramada ||
    asistencia.entrada ||
    asistencia.salida
  );
}

function crearElementoHistorial(asistencia) {
  const item = document.createElement("div");
  item.className = "historial-item";

  const informacion = document.createElement("div");
  informacion.className = "historial-item-informacion";

  const icono = document.createElement("div");
  icono.className = "historial-item-icono";
  icono.textContent = "✓";

  const textos = document.createElement("div");
  textos.className = "historial-item-textos";

  const fecha = document.createElement("strong");
  fecha.textContent = formatearFecha(
    obtenerFechaRegistro(asistencia),
    {
      day: "numeric",
      month: "short",
      year: "numeric"
    }
  );

  const estado = document.createElement("small");
  estado.textContent = obtenerNombreEstado(
    asistencia.estadoAsistencia ||
    asistencia.estadoJornada
  );

  textos.append(fecha, estado);
  informacion.append(icono, textos);

  const datos = document.createElement("div");
  datos.className = "historial-item-datos";

  const horas = document.createElement("strong");
  horas.textContent =
    `${formatearHora(asistencia.entrada)} - ${formatearHora(asistencia.salida)}`;

  const estadoJornada = document.createElement("small");
  estadoJornada.textContent =
    asistencia.estadoJornada === "en_curso"
      ? "En curso"
      : "Registro";

  datos.append(horas, estadoJornada);
  item.append(informacion, datos);

  return item;
}

function renderizarHistorial(contenedorId, registros) {
  const contenedor = $(contenedorId);

  if (!contenedor) {
    return;
  }

  contenedor.replaceChildren();

  if (!registros.length) {
    contenedor.append(
      crearHistorialVacio(
        "Sin registros",
        "Todavía no hay asistencias para mostrar."
      )
    );
    return;
  }

  const fragmento = document.createDocumentFragment();

  registros.forEach(registro => {
    fragmento.append(crearElementoHistorial(registro));
  });

  contenedor.append(fragmento);
}

function actualizarResumen(resumen) {
  establecerTexto("totalAsistencias", resumen.asistencias);
  establecerTexto("totalRetardos", resumen.retardos);
  establecerTexto("totalFaltas", resumen.faltas);
  establecerTexto(
    "totalHoras",
    `${resumen.horasTrabajadas.toFixed(1)} h`
  );
}

async function cargarResumenMensual() {
  const mes = obtenerClaveMes();

  const registros = await obtenerAsistenciasMes(
    empleado.uid,
    mes
  );

  actualizarResumen(calcularResumen(registros));
}

async function cargarJornada() {
  jornadaActual = await obtenerJornadaActiva(empleado.uid);
  actualizarEstadoJornada();
}

async function cargarHistorialReciente() {
  historialReciente = await obtenerUltimasAsistencias(
    empleado.uid,
    5
  );

  renderizarHistorial("listaHistorial", historialReciente);
}

async function cargarDatos() {
  if (!empleado || cargandoDatos || procesandoRegistro) {
    return;
  }

  cargandoDatos = true;
  actualizarBotones();

  try {
    await cargarJornada();
    await cargarHistorialReciente();
    await cargarResumenMensual();
  } catch (error) {
    console.error("Error al consultar asistencias:", error);

    mostrarToast(
      obtenerError(error),
      "error"
    );
  } finally {
    cargandoDatos = false;
    actualizarBotones();
  }
}

function abrirModal(id) {
  const modal = $(id);

  if (!modal) {
    return;
  }

  if (modalActivo) {
    cerrarModal(modalActivo);
  }

  modal.hidden = false;
  modalActivo = id;
  document.body.style.overflow = "hidden";
}

function cerrarModal(id) {
  const modal = $(id);

  if (modal) {
    modal.hidden = true;
  }

  if (modalActivo === id) {
    modalActivo = null;
  }

  if (!modalActivo) {
    document.body.style.overflow = "";
  }

  if (id === "modalConfirmacion") {
    operacionActual = null;
  }
}

function prepararConfirmacion(tipo) {
  if (
    !empleado ||
    procesandoRegistro ||
    cargandoDatos ||
    !navigator.onLine
  ) {
    return;
  }

  const entrada = tipo === "entrada";

  if (entrada && jornadaActual) {
    mostrarToast(
      "Ya tienes una jornada activa.",
      "error"
    );
    return;
  }

  if (!entrada && !jornadaActual) {
    mostrarToast(
      "No tienes una jornada activa para finalizar.",
      "error"
    );
    return;
  }

  operacionActual = tipo;

  establecerTexto(
    "tituloConfirmacion",
    entrada ? "Registrar entrada" : "Registrar salida"
  );

  establecerTexto(
    "descripcionConfirmacion",
    entrada
      ? "¿Confirmas que deseas comenzar tu jornada? Verificaremos tu ubicación y horario."
      : "¿Confirmas que has terminado tu jornada? Verificaremos tu ubicación antes de registrar la salida."
  );

  establecerTexto(
    "confirmacionIcono",
    entrada ? "✓" : "↗"
  );

  const boton = $("aceptarConfirmacion");

  if (boton) {
    boton.disabled = false;
    boton.textContent = entrada
      ? "Confirmar entrada"
      : "Confirmar salida";
  }

  actualizarReloj();
  abrirModal("modalConfirmacion");
}

async function confirmarRegistro() {
  if (!operacionActual || procesandoRegistro || !empleado) {
    return;
  }

  const tipo = operacionActual;
  const boton = $("aceptarConfirmacion");

  procesandoRegistro = true;

  if (boton) {
    boton.disabled = true;
    boton.textContent = "Verificando...";
  }

  actualizarBotones();
  limpiarMensajeAsistencia();

  try {
    const resultado = tipo === "entrada"
      ? await registrarEntrada(empleado)
      : await registrarSalida(empleado);

    cerrarModal("modalConfirmacion");

    const mensaje = resultado?.mensaje ||
      (tipo === "entrada"
        ? "Tu entrada fue registrada correctamente."
        : "Tu salida fue registrada correctamente.");

    mostrarMensajeAsistencia(mensaje);
    mostrarToast(mensaje);

    procesandoRegistro = false;

    await cargarDatos();
  } catch (error) {
    console.error("Error al registrar asistencia:", error);

    const mensaje = obtenerError(error);

    mostrarMensajeAsistencia(mensaje, "error");
    mostrarToast(mensaje, "error");

    if (boton) {
      boton.textContent = tipo === "entrada"
        ? "Confirmar entrada"
        : "Confirmar salida";
    }
  } finally {
    procesandoRegistro = false;

    if (boton) {
      boton.disabled = false;
    }

    actualizarBotones();
  }
}

async function abrirHistorial() {
  const filtro = $("filtroMesHistorial");

  if (filtro && !filtro.value) {
    filtro.value = obtenerClaveMes();
  }

  abrirModal("modalHistorial");
  await cargarHistorialCompleto();
}

async function cargarHistorialCompleto() {
  const filtro = $("filtroMesHistorial");
  const contenedor = $("historialCompleto");

  if (!filtro || !contenedor || !empleado) {
    return;
  }

  contenedor.replaceChildren(
    crearHistorialVacio(
      "Consultando historial",
      "Estamos cargando tus registros."
    )
  );

  try {
    const registros = await obtenerAsistenciasMes(
      empleado.uid,
      filtro.value
    );

    renderizarHistorial("historialCompleto", registros);
  } catch (error) {
    contenedor.replaceChildren(
      crearHistorialVacio(
        "No se pudo cargar",
        obtenerError(error)
      )
    );
  }
}

function desplazarA(id) {
  const elemento = document.querySelector(id);

  if (!elemento) {
    return;
  }

  elemento.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function configurarNavegacion() {
  $("navInicio")?.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });

  $("navAsistencia")?.addEventListener("click", () => {
    desplazarA(".empleado-jornada-seccion");
  });

  $("navHistorial")?.addEventListener("click", abrirHistorial);
  $("navPerfil")?.addEventListener("click", () => abrirModal("modalPerfil"));

  $("botonPerfil")?.addEventListener("click", () => abrirModal("modalPerfil"));
  $("botonVerHistorial")?.addEventListener("click", abrirHistorial);
}

function configurarModales() {
  $("botonEntrada")?.addEventListener("click", () => {
    prepararConfirmacion("entrada");
  });

  $("botonSalida")?.addEventListener("click", () => {
    prepararConfirmacion("salida");
  });

  $("aceptarConfirmacion")?.addEventListener(
    "click",
    confirmarRegistro
  );

  $("cancelarConfirmacion")?.addEventListener("click", () => {
    if (!procesandoRegistro) {
      cerrarModal("modalConfirmacion");
    }
  });

  $("cerrarModalPerfil")?.addEventListener("click", () => {
    cerrarModal("modalPerfil");
  });

  $("cerrarModalHistorial")?.addEventListener("click", () => {
    cerrarModal("modalHistorial");
  });

  document.querySelectorAll("[data-cerrar-modal]").forEach(fondo => {
    fondo.addEventListener("click", () => {
      if (procesandoRegistro) {
        return;
      }

      const tipo = fondo.dataset.cerrarModal;

      const ids = {
        confirmacion: "modalConfirmacion",
        perfil: "modalPerfil",
        historial: "modalHistorial"
      };

      if (ids[tipo]) {
        cerrarModal(ids[tipo]);
      }
    });
  });

  document.addEventListener("keydown", evento => {
    if (evento.key === "Escape" && modalActivo && !procesandoRegistro) {
      cerrarModal(modalActivo);
    }
  });

  $("filtroMesHistorial")?.addEventListener(
    "change",
    cargarHistorialCompleto
  );
}

function configurarSesion() {
  $("botonCerrarSesion")?.addEventListener("click", async () => {
    const boton = $("botonCerrarSesion");

    if (boton) {
      boton.disabled = true;
      boton.textContent = "Cerrando sesión...";
    }

    try {
      await cerrarSesion();
      window.location.replace(RUTAS.LOGIN);
    } catch (error) {
      mostrarToast(
        obtenerMensajeError(error),
        "error"
      );

      if (boton) {
        boton.disabled = false;
        boton.textContent = "Cerrar sesión";
      }
    }
  });
}

function configurarEventos() {
  window.addEventListener("online", () => {
    actualizarConexion();
    cargarDatos();
  });

  window.addEventListener("offline", actualizarConexion);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      actualizarReloj();
      actualizarConexion();
      cargarDatos();
    }
  });

  window.addEventListener("pagehide", () => {
    clearInterval(relojIntervalo);
    clearInterval(actualizacionIntervalo);
    clearTimeout(temporizadorToast);
  });
}

function iniciarActualizacionPeriodica() {
  if (actualizacionIntervalo !== null) {
    clearInterval(actualizacionIntervalo);
  }

  actualizacionIntervalo = setInterval(() => {
    if (
      !document.hidden &&
      navigator.onLine &&
      !procesandoRegistro
    ) {
      cargarDatos();
    }
  }, 60000);
}

async function iniciarAplicacion() {
  mostrarElemento("pantallaCarga", true);
  mostrarElemento("aplicacionEmpleado", false);

  const perfil = await protegerPagina([
    "mesero",
    "cocina",
    "recepcion",
    "repartidor"
  ]);

  if (!perfil) {
    return;
  }

  empleado = perfil;

  configurarPerfil();
  configurarNavegacion();
  configurarModales();
  configurarSesion();
  configurarEventos();

  iniciarReloj();
  actualizarConexion();

  mostrarElemento("aplicacionEmpleado", true);
  mostrarElemento("pantallaCarga", false);

  await cargarDatos();

  iniciarActualizacionPeriodica();
}

iniciarAplicacion();
