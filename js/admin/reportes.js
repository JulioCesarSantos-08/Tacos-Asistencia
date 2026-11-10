
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "../firebase.js";

const $ = id => document.getElementById(id);

const ZONA_HORARIA = "America/Mexico_City";
const LIMITE_CONSULTA = 5000;

const FORMATO_FECHA = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

let empleados = [];
let registros = [];
let resultados = [];
let inicializado = false;
let cargando = false;
let consultaCompleta = false;
let mostrarToast = () => {};

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

function fechaLocal(fecha = new Date()) {
  const partes = FORMATO_FECHA.formatToParts(fecha);
  const datos = Object.fromEntries(
    partes.map(parte => [parte.type, parte.value])
  );

  return `${datos.year}-${datos.month}-${datos.day}`;
}

function inicioMesActual() {
  return `${fechaLocal().slice(0, 7)}-01`;
}

function fechaValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
    return false;
  }

  const [anio, mes, dia] = valor.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  return fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;
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

function obtenerFechaJornada(registro) {
  const fecha = registro.fechaJornada ??
    registro.fecha ??
    registro.dia;

  if (fechaValida(fecha)) {
    return fecha;
  }

  const entrada = obtenerEntrada(registro);

  return entrada ? fechaLocal(entrada) : "";
}

function obtenerMinutosTrabajados(registro) {
  const entrada = obtenerEntrada(registro);
  const salida = obtenerSalida(registro);

  if (!entrada || !salida) {
    return 0;
  }

  const minutos = Math.round(
    (salida.getTime() - entrada.getTime()) / 60000
  );

  return minutos >= 0 && minutos <= 1440
    ? minutos
    : 0;
}

function formatearHoras(minutos) {
  const horas = Math.floor(minutos / 60);
  const restantes = minutos % 60;

  return `${horas} h ${String(restantes).padStart(2, "0")} min`;
}

function normalizarEstado(registro) {
  const estado = String(
    registro.estadoAsistencia ??
    registro.estado ??
    registro.clasificacion ??
    ""
  ).toLowerCase();

  if (["puntual", "a_tiempo", "atiempo"].includes(estado)) {
    return "puntual";
  }

  if (["retardo", "tarde", "retardo_grave"].includes(estado)) {
    return "retardo";
  }

  if (["falta", "ausente"].includes(estado)) {
    return "falta";
  }

  if (["justificada", "justificado", "permiso"].includes(estado)) {
    return "justificada";
  }

  if (obtenerEntrada(registro)) {
    return "sin_clasificar";
  }

  return "desconocido";
}

function obtenerNombreEmpleado(uid) {
  return empleados.find(
    empleado => empleado.uid === uid
  )?.nombreCompleto || "Empleado no identificado";
}

function obtenerRolEmpleado(uid) {
  return empleados.find(
    empleado => empleado.uid === uid
  )?.rol || "Sin puesto";
}

function obtenerFiltros() {
  return {
    desde: $("reporteFechaInicio")?.value || inicioMesActual(),
    hasta: $("reporteFechaFin")?.value || fechaLocal(),
    empleadoId: $("reporteEmpleado")?.value || ""
  };
}

function validarFiltros(filtros) {
  if (!fechaValida(filtros.desde) || !fechaValida(filtros.hasta)) {
    throw new Error(
      "Selecciona fechas válidas para generar el reporte."
    );
  }

  if (filtros.desde > filtros.hasta) {
    throw new Error(
      "La fecha inicial no puede ser posterior a la fecha final."
    );
  }

  const dias = Math.round(
    (
      Date.parse(`${filtros.hasta}T00:00:00Z`) -
      Date.parse(`${filtros.desde}T00:00:00Z`)
    ) / 86400000
  );

  if (dias > 366) {
    throw new Error(
      "Selecciona un período máximo de 367 días."
    );
  }
}

function agruparPorEmpleado(registrosFiltrados) {
  const grupos = new Map();

  registrosFiltrados.forEach(registro => {
    const uid = registro.empleadoId;

    if (!uid) {
      return;
    }

    if (!grupos.has(uid)) {
      grupos.set(uid, {
        uid,
        nombre: obtenerNombreEmpleado(uid),
        rol: obtenerRolEmpleado(uid),
        asistencias: 0,
        puntuales: 0,
        retardos: 0,
        faltas: 0,
        justificadas: 0,
        sinClasificar: 0,
        jornadasCompletadas: 0,
        minutosTrabajados: 0
      });
    }

    const grupo = grupos.get(uid);
    const estado = normalizarEstado(registro);

    if (obtenerEntrada(registro)) {
      grupo.asistencias++;
    }

    if (estado === "puntual") {
      grupo.puntuales++;
    } else if (estado === "retardo") {
      grupo.retardos++;
    } else if (estado === "falta") {
      grupo.faltas++;
    } else if (estado === "justificada") {
      grupo.justificadas++;
    } else {
      grupo.sinClasificar++;
    }

    if (obtenerEntrada(registro) && obtenerSalida(registro)) {
      grupo.jornadasCompletadas++;
    }

    grupo.minutosTrabajados +=
      obtenerMinutosTrabajados(registro);
  });

  return [...grupos.values()].sort((a, b) => {
    return a.nombre.localeCompare(b.nombre, "es-MX");
  });
}

function calcularResumen(grupos) {
  return grupos.reduce((resumen, grupo) => {
    resumen.asistencias += grupo.asistencias;
    resumen.puntuales += grupo.puntuales;
    resumen.retardos += grupo.retardos;
    resumen.faltas += grupo.faltas;
    resumen.justificadas += grupo.justificadas;
    resumen.sinClasificar += grupo.sinClasificar;
    resumen.jornadasCompletadas += grupo.jornadasCompletadas;
    resumen.minutosTrabajados += grupo.minutosTrabajados;

    return resumen;
  }, {
    asistencias: 0,
    puntuales: 0,
    retardos: 0,
    faltas: 0,
    justificadas: 0,
    sinClasificar: 0,
    jornadasCompletadas: 0,
    minutosTrabajados: 0
  });
}

function establecerMetrica(id, valor) {
  const elementoMetrica = $(id);

  if (elementoMetrica) {
    elementoMetrica.textContent = String(valor);
  }
}

function actualizarMetricas(grupos) {
  const resumen = calcularResumen(grupos);

  establecerMetrica(
    "reporteTotalAsistencias",
    resumen.asistencias
  );

  establecerMetrica(
    "reporteTotalPuntuales",
    resumen.puntuales
  );

  establecerMetrica(
    "reporteTotalRetardos",
    resumen.retardos
  );

  establecerMetrica(
    "reporteTotalFaltas",
    resumen.faltas
  );

  establecerMetrica(
    "reporteTotalHoras",
    formatearHoras(resumen.minutosTrabajados)
  );

  establecerMetrica(
    "reporteTotalJustificadas",
    resumen.justificadas
  );
}

function mostrarEstadoTabla(mensaje) {
  const cuerpo = $("tablaReportes");

  if (!cuerpo) {
    return;
  }

  const fila = crearElemento("tr");
  const celda = crearElemento(
    "td",
    "admin-tabla-vacia",
    mensaje
  );

  celda.colSpan = 8;
  fila.append(celda);
  cuerpo.replaceChildren(fila);
}

function crearFilaReporte(grupo) {
  const fila = crearElemento("tr");

  const empleado = crearElemento("td");
  const nombre = crearElemento(
    "strong",
    "",
    grupo.nombre
  );

  const rol = crearElemento(
    "small",
    "",
    grupo.rol
  );

  nombre.style.display = "block";
  rol.style.display = "block";
  rol.style.marginTop = "4px";

  empleado.append(nombre, rol);

  const celdas = [
    empleado,
    crearElemento("td", "", grupo.asistencias),
    crearElemento("td", "", grupo.puntuales),
    crearElemento("td", "", grupo.retardos),
    crearElemento("td", "", grupo.faltas),
    crearElemento("td", "", grupo.justificadas),
    crearElemento("td", "", grupo.jornadasCompletadas),
    crearElemento(
      "td",
      "",
      formatearHoras(grupo.minutosTrabajados)
    )
  ];

  fila.append(...celdas);

  return fila;
}

function renderizarReportes() {
  const cuerpo = $("tablaReportes");

  if (!cuerpo) {
    return;
  }

  if (!resultados.length) {
    mostrarEstadoTabla(
      "No hay registros de asistencia para el período seleccionado."
    );

    actualizarMetricas([]);
    return;
  }

  const fragmento = document.createDocumentFragment();

  resultados.forEach(grupo => {
    fragmento.append(crearFilaReporte(grupo));
  });

  cuerpo.replaceChildren(fragmento);
  actualizarMetricas(resultados);
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

  const selector = $("reporteEmpleado");

  if (!selector) {
    return;
  }

  const valorAnterior = selector.value;

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
    opcion => opcion.value === valorAnterior
  )) {
    selector.value = valorAnterior;
  }
}

async function consultarRegistros(filtros) {
  const condiciones = [
    where("fechaJornada", ">=", filtros.desde),
    where("fechaJornada", "<=", filtros.hasta),
    orderBy("fechaJornada", "asc"),
    limit(LIMITE_CONSULTA + 1)
  ];

  const resultado = await getDocs(
    query(
      collection(db, "asistencias"),
      ...condiciones
    )
  );

  if (resultado.size > LIMITE_CONSULTA) {
    throw new Error(
      "El período contiene demasiados registros. Selecciona un rango más pequeño para obtener un reporte completo."
    );
  }

  consultaCompleta = true;

  return resultado.docs.map(documento => ({
    ...documento.data(),
    id: documento.id
  }));
}

function establecerCargando(estado) {
  cargando = estado;

  const boton = $("botonGenerarReporte");

  if (boton) {
    boton.disabled = estado;
    boton.textContent = estado
      ? "Generando reporte..."
      : "Generar reporte";
  }

  const exportar = $("botonExportarReporte");

  if (exportar) {
    exportar.disabled = estado || !consultaCompleta;
  }
}

async function generarReporte(evento) {
  evento?.preventDefault();

  if (cargando) {
    return;
  }

  consultaCompleta = false;
  registros = [];
  resultados = [];

  try {
    const filtros = obtenerFiltros();

    validarFiltros(filtros);
    establecerCargando(true);

    mostrarEstadoTabla("Generando reporte...");

    registros = await consultarRegistros(filtros);

    const registrosFiltrados = registros.filter(registro => {
      return !filtros.empleadoId ||
        registro.empleadoId === filtros.empleadoId;
    });

    resultados = agruparPorEmpleado(registrosFiltrados);

    renderizarReportes();

    mostrarToast(
      "El reporte se generó correctamente."
    );
  } catch (error) {
    console.error("Error al generar reporte:", error);

    consultaCompleta = false;
    resultados = [];

    mostrarEstadoTabla(
      "No fue posible generar el reporte."
    );

    actualizarMetricas([]);

    mostrarToast(
      error.message ||
      "No se pudo consultar la información.",
      "error"
    );
  } finally {
    establecerCargando(false);
  }
}

function protegerCeldaCSV(valor) {
  let texto = String(valor ?? "");

  if (/^[\s]*[=+\-@\t\r]/.test(texto)) {
    texto = `'${texto}`;
  }

  return `"${texto.replace(/"/g, '""')}"`;
}

function crearContenidoCSV(filas) {
  return "\uFEFF" + filas
    .map(fila => fila.map(protegerCeldaCSV).join(";"))
    .join("\r\n");
}

function exportarReporte() {
  if (!consultaCompleta || cargando) {
    mostrarToast(
      "Primero genera un reporte completo.",
      "error"
    );
    return;
  }

  if (!resultados.length) {
    mostrarToast(
      "No hay información para exportar.",
      "error"
    );
    return;
  }

  const filtros = obtenerFiltros();

  const filas = [
    [
      "Empleado",
      "Puesto",
      "Asistencias",
      "Puntuales",
      "Retardos",
      "Faltas",
      "Justificadas",
      "Jornadas completadas",
      "Minutos trabajados",
      "Horas trabajadas"
    ]
  ];

  resultados.forEach(grupo => {
    filas.push([
      grupo.nombre,
      grupo.rol,
      grupo.asistencias,
      grupo.puntuales,
      grupo.retardos,
      grupo.faltas,
      grupo.justificadas,
      grupo.jornadasCompletadas,
      grupo.minutosTrabajados,
      (grupo.minutosTrabajados / 60).toFixed(2)
    ]);
  });

  const resumen = calcularResumen(resultados);

  filas.push([
    "TOTAL",
    "",
    resumen.asistencias,
    resumen.puntuales,
    resumen.retardos,
    resumen.faltas,
    resumen.justificadas,
    resumen.jornadasCompletadas,
    resumen.minutosTrabajados,
    (resumen.minutosTrabajados / 60).toFixed(2)
  ]);

  const contenido = crearContenidoCSV(filas);

  const archivo = new Blob(
    [contenido],
    {
      type: "text/csv;charset=utf-8;"
    }
  );

  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");

  enlace.href = url;
  enlace.download =
    `tacos-asistencias-${filtros.desde}-al-${filtros.hasta}.csv`;

  document.body.append(enlace);
  enlace.click();
  enlace.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);

  mostrarToast(
    "El archivo CSV está listo para abrirse en Excel."
  );
}

function establecerFechasIniciales() {
  const inicio = $("reporteFechaInicio");
  const fin = $("reporteFechaFin");

  if (inicio && !inicio.value) {
    inicio.value = inicioMesActual();
  }

  if (fin && !fin.value) {
    fin.value = fechaLocal();
  }
}

function configurarEventos() {
  $("formReportes")?.addEventListener(
    "submit",
    generarReporte
  );

  $("botonGenerarReporte")?.addEventListener(
    "click",
    evento => {
      if ($("formReportes")) {
        return;
      }

      generarReporte(evento);
    }
  );

  $("botonExportarReporte")?.addEventListener(
    "click",
    exportarReporte
  );

  document.addEventListener("admin:seccion", evento => {
    if (evento.detail?.seccion === "reportes" && !consultaCompleta) {
      generarReporte();
    }
  });
}

async function inicializarReportes(dependencias = {}) {
  if (inicializado) {
    return;
  }

  mostrarToast =
    dependencias.mostrarToast || mostrarToast;

  inicializado = true;

  establecerFechasIniciales();
  configurarEventos();

  if ($("botonExportarReporte")) {
    $("botonExportarReporte").disabled = true;
  }

  try {
    await cargarEmpleados();
  } catch (error) {
    console.error("Error al cargar empleados:", error);

    mostrarToast(
      "No se pudo cargar la lista de empleados.",
      "error"
    );
  }

  await generarReporte();
}

export {
  inicializarReportes,
  generarReporte,
  exportarReporte,
  renderizarReportes
};
