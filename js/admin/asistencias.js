
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "../firebase.js";

const $ = id => document.getElementById(id);

const ZONA_HORARIA = "America/Mexico_City";
const LIMITE_CONSULTA = 1000;

const FORMATO_FECHA = new Intl.DateTimeFormat("es-MX", {
  timeZone: ZONA_HORARIA,
  day: "2-digit",
  month: "short",
  year: "numeric"
});

const FORMATO_HORA = new Intl.DateTimeFormat("es-MX", {
  timeZone: ZONA_HORARIA,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const FORMATO_DIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

let asistencias = [];
let empleados = [];
let inicializado = false;
let cargando = false;
let ultimaConsulta = null;
let mostrarToast = () => {};

function elemento(etiqueta, clase = "", texto = null) {
  const nodo = document.createElement(etiqueta);

  if (clase) {
    nodo.className = clase;
  }

  if (texto !== null) {
    nodo.textContent = String(texto);
  }

  return nodo;
}

function convertirFecha(valor) {
  if (!valor) {
    return null;
  }

  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }

  if (typeof valor.toDate === "function") {
    return convertirFecha(valor.toDate());
  }

  if (typeof valor.seconds === "number") {
    return convertirFecha(new Date(valor.seconds * 1000));
  }

  if (typeof valor === "number") {
    return convertirFecha(new Date(valor));
  }

  if (typeof valor === "string") {
    return convertirFecha(new Date(valor));
  }

  return null;
}

function obtenerFechaLocal(fecha = new Date()) {
  const partes = FORMATO_DIA.formatToParts(fecha);
  const datos = Object.fromEntries(
    partes.map(parte => [parte.type, parte.value])
  );

  return `${datos.year}-${datos.month}-${datos.day}`;
}

function formatearFecha(valor) {
  const fecha = convertirFecha(valor);

  return fecha ? FORMATO_FECHA.format(fecha) : "—";
}

function formatearHora(valor) {
  const fecha = convertirFecha(valor);

  return fecha ? FORMATO_HORA.format(fecha) : "—";
}

function normalizarTexto(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim();
}

function obtenerNombreEmpleado(registro) {
  if (registro.nombreCompleto) {
    return registro.nombreCompleto;
  }

  if (registro.nombreEmpleado) {
    return registro.nombreEmpleado;
  }

  const empleado = empleados.find(
    item => item.uid === registro.empleadoId
  );

  return empleado?.nombreCompleto || "Empleado no identificado";
}

function obtenerIniciales(nombre) {
  const partes = String(nombre)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!partes.length) {
    return "EM";
  }

  return partes.length === 1
    ? partes[0].slice(0, 2).toUpperCase()
    : `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

function obtenerEntrada(registro) {
  return convertirFecha(
    registro.entrada?.fechaHora ??
    registro.entrada?.timestamp ??
    registro.fechaEntrada ??
    registro.horaEntradaReal ??
    registro.entrada
  );
}

function obtenerSalida(registro) {
  return convertirFecha(
    registro.salida?.fechaHora ??
    registro.salida?.timestamp ??
    registro.fechaSalida ??
    registro.horaSalidaReal ??
    registro.salida
  );
}

function obtenerMinutosTrabajados(registro) {
  const entrada = obtenerEntrada(registro);
  const salida = obtenerSalida(registro);

  if (!entrada || !salida) {
    return null;
  }

  const minutos = Math.round(
    (salida.getTime() - entrada.getTime()) / 60000
  );

  if (minutos < 0 || minutos > 24 * 60) {
    return null;
  }

  return minutos;
}

function formatearDuracion(minutos) {
  if (!Number.isFinite(minutos)) {
    return "—";
  }

  const horas = Math.floor(minutos / 60);
  const restantes = minutos % 60;

  return `${horas} h ${String(restantes).padStart(2, "0")} min`;
}

function obtenerEstado(registro) {
  const estado = normalizarTexto(
    registro.estadoAsistencia ??
    registro.estado ??
    registro.clasificacion ??
    ""
  );

  if (["falta", "ausente"].includes(estado)) {
    return {
      texto: "Falta",
      clase: "roja",
      clave: "falta"
    };
  }

  if (["retardo", "tarde", "retardo_grave"].includes(estado)) {
    return {
      texto: "Retardo",
      clase: "amarilla",
      clave: "retardo"
    };
  }

  if (["puntual", "a_tiempo", "atiempo"].includes(estado)) {
    return {
      texto: "Puntual",
      clase: "verde",
      clave: "puntual"
    };
  }

  if (["justificada", "justificado", "permiso"].includes(estado)) {
    return {
      texto: "Justificado",
      clase: "azul",
      clave: "justificado"
    };
  }

  if (["fuera_de_horario", "rechazada"].includes(estado)) {
    return {
      texto: "Fuera de horario",
      clase: "roja",
      clave: "fuera_de_horario"
    };
  }

  if (obtenerEntrada(registro) && !obtenerSalida(registro)) {
    return {
      texto: "Jornada abierta",
      clase: "azul",
      clave: "abierta"
    };
  }

  if (obtenerEntrada(registro) && obtenerSalida(registro)) {
    return {
      texto: "Completada",
      clase: "verde",
      clave: "completada"
    };
  }

  return {
    texto: "Sin clasificar",
    clase: "gris",
    clave: "desconocido"
  };
}

function obtenerFechaJornada(registro) {
  const fecha = registro.fechaJornada ??
    registro.fecha ??
    registro.dia;

  if (typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return fecha;
  }

  const entrada = obtenerEntrada(registro);

  return entrada ? obtenerFechaLocal(entrada) : null;
}

function establecerMensajeTabla(mensaje) {
  const cuerpo = $("tablaAsistencias");

  if (!cuerpo) {
    return;
  }

  const fila = elemento("tr");
  const celda = elemento(
    "td",
    "admin-tabla-vacia",
    mensaje
  );

  celda.colSpan = 7;
  fila.append(celda);
  cuerpo.replaceChildren(fila);
}

function crearCeldaEmpleado(registro) {
  const nombre = obtenerNombreEmpleado(registro);
  const celda = elemento("td");
  const usuario = elemento("div", "admin-tabla-usuario");

  const avatar = elemento(
    "div",
    "admin-tabla-avatar",
    obtenerIniciales(nombre)
  );

  const informacion = elemento("div");

  const titulo = elemento("strong", "", nombre);
  const subtitulo = elemento(
    "small",
    "",
    registro.puesto ||
    registro.rol ||
    "Personal"
  );

  informacion.append(titulo, subtitulo);
  usuario.append(avatar, informacion);
  celda.append(usuario);

  return celda;
}

function crearFilaAsistencia(registro) {
  const fila = elemento("tr");
  const estado = obtenerEstado(registro);

  const fecha = obtenerFechaJornada(registro);
  const entrada = obtenerEntrada(registro);
  const salida = obtenerSalida(registro);
  const minutos = obtenerMinutosTrabajados(registro);

  const celdaFecha = elemento(
    "td",
    "",
    fecha || "—"
  );

  const celdaEntrada = elemento(
    "td",
    "",
    formatearHora(entrada)
  );

  const celdaSalida = elemento(
    "td",
    "",
    formatearHora(salida)
  );

  const celdaHoras = elemento(
    "td",
    "",
    formatearDuracion(minutos)
  );

  const celdaEstado = elemento("td");

  celdaEstado.append(
    elemento(
      "span",
      `admin-insignia ${estado.clase}`,
      estado.texto
    )
  );

  fila.append(
    crearCeldaEmpleado(registro),
    celdaFecha,
    celdaEntrada,
    celdaSalida,
    celdaHoras,
    celdaEstado
  );

  const celdaDetalle = elemento("td");

  const boton = elemento(
    "button",
    "admin-accion-tabla",
    "Detalles"
  );

  boton.type = "button";
  boton.addEventListener("click", () => {
    mostrarDetalleAsistencia(registro);
  });

  celdaDetalle.append(boton);
  fila.append(celdaDetalle);

  return fila;
}

function obtenerFiltros() {
  return {
    fecha: $("filtroFechaAsistencias")?.value || "",
    empleado: $("filtroEmpleadoAsistencias")?.value || "",
    estado: $("filtroEstadoAsistencias")?.value || ""
  };
}

function filtrarAsistencias() {
  const filtros = obtenerFiltros();

  return asistencias.filter(registro => {
    const coincideFecha =
      !filtros.fecha ||
      obtenerFechaJornada(registro) === filtros.fecha;

    const coincideEmpleado =
      !filtros.empleado ||
      registro.empleadoId === filtros.empleado;

    const estado = obtenerEstado(registro);

    const coincideEstado =
      !filtros.estado ||
      estado.clave === filtros.estado;

    return coincideFecha &&
      coincideEmpleado &&
      coincideEstado;
  });
}

function renderizarAsistencias() {
  const cuerpo = $("tablaAsistencias");

  if (!cuerpo) {
    return;
  }

  const resultados = filtrarAsistencias();

  if (!resultados.length) {
    establecerMensajeTabla(
      asistencias.length
        ? "No hay asistencias que coincidan con los filtros."
        : "No se encontraron asistencias registradas."
    );
    return;
  }

  const fragmento = document.createDocumentFragment();

  resultados.forEach(registro => {
    fragmento.append(
      crearFilaAsistencia(registro)
    );
  });

  cuerpo.replaceChildren(fragmento);
}

function actualizarOpcionesEmpleados() {
  const selector = $("filtroEmpleadoAsistencias");

  if (!selector) {
    return;
  }

  const seleccionAnterior = selector.value;

  selector.replaceChildren(
    new Option("Todos los empleados", "")
  );

  empleados.forEach(empleado => {
    selector.add(
      new Option(
        empleado.nombreCompleto || empleado.uid,
        empleado.uid
      )
    );
  });

  if ([...selector.options].some(
    opcion => opcion.value === seleccionAnterior
  )) {
    selector.value = seleccionAnterior;
  }
}

async function cargarEmpleados() {
  const resultado = await getDocs(
    collection(db, "empleados")
  );

  empleados = resultado.docs.map(documento => ({
    ...documento.data(),
    uid: documento.id
  }));

  empleados.sort((a, b) => {
    return String(a.nombreCompleto || "").localeCompare(
      String(b.nombreCompleto || ""),
      "es-MX"
    );
  });

  actualizarOpcionesEmpleados();
}

async function cargarAsistencias() {
  if (cargando) {
    return;
  }

  cargando = true;
  establecerMensajeTabla("Consultando asistencias...");

  try {
    const resultado = await getDocs(
      query(
        collection(db, "asistencias"),
        orderBy("fechaJornada", "desc"),
        limit(LIMITE_CONSULTA)
      )
    );

    asistencias = resultado.docs.map(documento => ({
      ...documento.data(),
      id: documento.id
    }));

    ultimaConsulta = new Date();

    renderizarAsistencias();
    actualizarMetricasDashboard();
    renderizarActividadReciente();
  } catch (error) {
    console.error("Error al cargar asistencias:", error);

    establecerMensajeTabla(
      "No fue posible consultar las asistencias."
    );

    mostrarToast(
      "No se pudieron cargar las asistencias. Revisa tu conexión y los permisos de Firebase.",
      "error"
    );
  } finally {
    cargando = false;
  }
}

function obtenerAsistenciasHoy() {
  const hoy = obtenerFechaLocal();

  return asistencias.filter(
    registro => obtenerFechaJornada(registro) === hoy
  );
}

function actualizarMetricasDashboard() {
  const registrosHoy = obtenerAsistenciasHoy();

  const empleadosPresentes = new Set(
    registrosHoy
      .filter(registro => obtenerEntrada(registro))
      .map(registro => registro.empleadoId)
      .filter(Boolean)
  );

  const retardos = registrosHoy.filter(
    registro => obtenerEstado(registro).clave === "retardo"
  ).length;

  const jornadasCompletadas = registrosHoy.filter(
    registro => obtenerEntrada(registro) && obtenerSalida(registro)
  ).length;

  if ($("metricaAsistencias")) {
    $("metricaAsistencias").textContent =
      empleadosPresentes.size;
  }

  if ($("metricaRetardos")) {
    $("metricaRetardos").textContent =
      retardos;
  }

  if ($("metricaJornadas")) {
    $("metricaJornadas").textContent =
      jornadasCompletadas;
  }
}

function crearActividad(registro) {
  const nombre = obtenerNombreEmpleado(registro);
  const estado = obtenerEstado(registro);

  const contenedor = elemento(
    "div",
    "admin-auditoria-item"
  );

  const icono = elemento(
    "div",
    "admin-auditoria-icono",
    obtenerSalida(registro) ? "✓" : "↗"
  );

  const informacion = elemento(
    "div",
    "admin-auditoria-texto"
  );

  const titulo = elemento(
    "strong",
    "",
    nombre
  );

  const descripcion = elemento(
    "p",
    "",
    `${estado.texto} · Entrada: ${formatearHora(obtenerEntrada(registro))} · Salida: ${formatearHora(obtenerSalida(registro))}`
  );

  informacion.append(titulo, descripcion);

  const hora = elemento(
    "span",
    "admin-auditoria-fecha",
    formatearHora(
      obtenerSalida(registro) || obtenerEntrada(registro)
    )
  );

  contenedor.append(icono, informacion, hora);

  return contenedor;
}

function renderizarActividadReciente() {
  const contenedor = $("dashboardActividad");

  if (!contenedor) {
    return;
  }

  const registros = obtenerAsistenciasHoy()
    .sort((a, b) => {
      const fechaA = obtenerSalida(a) || obtenerEntrada(a);
      const fechaB = obtenerSalida(b) || obtenerEntrada(b);

      return (fechaB?.getTime() || 0) -
        (fechaA?.getTime() || 0);
    })
    .slice(0, 6);

  if (!registros.length) {
    const vacio = elemento(
      "div",
      "admin-estado-vacio"
    );

    vacio.append(
      elemento(
        "strong",
        "",
        "Todavía no hay movimientos"
      ),
      elemento(
        "p",
        "",
        "Las entradas y salidas de hoy aparecerán aquí."
      )
    );

    contenedor.replaceChildren(vacio);
    return;
  }

  const fragmento = document.createDocumentFragment();

  registros.forEach(registro => {
    fragmento.append(crearActividad(registro));
  });

  contenedor.replaceChildren(fragmento);
}

function mostrarDetalleAsistencia(registro) {
  const estado = obtenerEstado(registro);
  const nombre = obtenerNombreEmpleado(registro);

  const datos = [
    `Empleado: ${nombre}`,
    `Fecha de jornada: ${obtenerFechaJornada(registro) || "—"}`,
    `Entrada: ${formatearFecha(obtenerEntrada(registro))} ${formatearHora(obtenerEntrada(registro))}`,
    `Salida: ${formatearFecha(obtenerSalida(registro))} ${formatearHora(obtenerSalida(registro))}`,
    `Estado: ${estado.texto}`,
    `Tiempo trabajado: ${formatearDuracion(obtenerMinutosTrabajados(registro))}`,
    `Identificador: ${registro.id}`
  ];

  window.alert(datos.join("\n"));
}

function configurarFiltros() {
  [
    "filtroFechaAsistencias",
    "filtroEmpleadoAsistencias",
    "filtroEstadoAsistencias"
  ].forEach(id => {
    const control = $(id);

    control?.addEventListener(
      id === "filtroFechaAsistencias" ? "change" : "input",
      renderizarAsistencias
    );
  });
}

function configurarEventos() {
  $("botonActualizarAsistencias")?.addEventListener(
    "click",
    cargarAsistencias
  );

  document.addEventListener("admin:seccion", evento => {
    if (evento.detail?.seccion === "asistencias") {
      cargarAsistencias();
    }

    if (evento.detail?.seccion === "dashboard") {
      actualizarMetricasDashboard();
      renderizarActividadReciente();
    }
  });
}

async function inicializarAsistencias(dependencias = {}) {
  if (inicializado) {
    return;
  }

  mostrarToast =
    dependencias.mostrarToast || mostrarToast;

  inicializado = true;

  configurarFiltros();
  configurarEventos();

  try {
    await cargarEmpleados();
  } catch (error) {
    console.error("Error al cargar empleados:", error);

    mostrarToast(
      "No fue posible cargar el catálogo de empleados.",
      "error"
    );
  }

  await cargarAsistencias();
}

export {
  inicializarAsistencias,
  cargarAsistencias,
  renderizarAsistencias,
  actualizarMetricasDashboard,
  renderizarActividadReciente,
  obtenerAsistenciasHoy,
  obtenerEstado,
  obtenerMinutosTrabajados
};
