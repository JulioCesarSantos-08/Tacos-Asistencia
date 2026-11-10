
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "../firebase.js";

const $ = id => document.getElementById(id);

const ZONA_HORARIA = "America/Mexico_City";
const REGISTROS_POR_PAGINA = 30;

const FORMATO_FECHA = new Intl.DateTimeFormat("es-MX", {
  timeZone: ZONA_HORARIA,
  day: "2-digit",
  month: "short",
  year: "numeric",
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

const ACCIONES = Object.freeze({
  crear_empleado: {
    nombre: "Empleado creado",
    categoria: "empleados",
    clase: "verde",
    simbolo: "+"
  },
  actualizar_empleado: {
    nombre: "Empleado actualizado",
    categoria: "empleados",
    clase: "azul",
    simbolo: "✎"
  },
  activar_empleado: {
    nombre: "Empleado activado",
    categoria: "empleados",
    clase: "verde",
    simbolo: "✓"
  },
  desactivar_empleado: {
    nombre: "Empleado desactivado",
    categoria: "empleados",
    clase: "roja",
    simbolo: "−"
  },
  crear_horario: {
    nombre: "Horario creado",
    categoria: "horarios",
    clase: "verde",
    simbolo: "+"
  },
  actualizar_horario: {
    nombre: "Horario actualizado",
    categoria: "horarios",
    clase: "azul",
    simbolo: "✎"
  },
  activar_horario: {
    nombre: "Horario activado",
    categoria: "horarios",
    clase: "verde",
    simbolo: "✓"
  },
  desactivar_horario: {
    nombre: "Horario desactivado",
    categoria: "horarios",
    clase: "roja",
    simbolo: "−"
  },
  guardar_sucursal: {
    nombre: "Sucursal configurada",
    categoria: "sucursales",
    clase: "azul",
    simbolo: "⌖"
  },
  actualizar_sucursal: {
    nombre: "Sucursal actualizada",
    categoria: "sucursales",
    clase: "azul",
    simbolo: "⌖"
  },
  registrar_incidencia: {
    nombre: "Incidencia registrada",
    categoria: "incidencias",
    clase: "amarilla",
    simbolo: "!"
  },
  corregir_asistencia: {
    nombre: "Asistencia corregida",
    categoria: "asistencias",
    clase: "amarilla",
    simbolo: "✎"
  },
  actualizar_configuracion: {
    nombre: "Configuración modificada",
    categoria: "configuracion",
    clase: "azul",
    simbolo: "⚙"
  }
});

let registros = [];
let ultimoDocumento = null;
let hayMasRegistros = true;
let inicializado = false;
let cargando = false;
let primeraConsultaRealizada = false;
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

function formatearFecha(valor) {
  const fecha = convertirFecha(valor);

  return fecha
    ? FORMATO_FECHA.format(fecha)
    : "Fecha no disponible";
}

function obtenerDiaLocal(fecha) {
  const partes = FORMATO_DIA.formatToParts(fecha);
  const datos = Object.fromEntries(
    partes.map(parte => [parte.type, parte.value])
  );

  return `${datos.year}-${datos.month}-${datos.day}`;
}

function normalizarTexto(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim();
}

function obtenerAccion(registro) {
  const clave = registro.accion || registro.tipo || "";

  return ACCIONES[clave] || {
    nombre: clave
      ? clave.replace(/_/g, " ")
      : "Acción administrativa",
    categoria: registro.categoria || "otros",
    clase: "gris",
    simbolo: "•"
  };
}

function obtenerAdministrador(registro) {
  return (
    registro.nombreAdministrador ||
    registro.actorNombre ||
    registro.administradorNombre ||
    registro.actorUid ||
    "Administrador no identificado"
  );
}

function obtenerFechaRegistro(registro) {
  return convertirFecha(
    registro.creadoEn ??
    registro.fechaHora ??
    registro.timestamp
  );
}

function obtenerDescripcion(registro) {
  if (registro.descripcion) {
    return String(registro.descripcion);
  }

  if (registro.resumen) {
    return String(registro.resumen);
  }

  if (registro.objetivoNombre) {
    return `Registro relacionado con ${registro.objetivoNombre}`;
  }

  if (registro.entidadId) {
    return `Identificador: ${registro.entidadId}`;
  }

  return "Movimiento registrado en el sistema.";
}

function obtenerFiltros() {
  return {
    busqueda: normalizarTexto(
      $("buscarAuditoria")?.value
    ),
    categoria: $("filtroCategoriaAuditoria")?.value || "",
    fecha: $("filtroFechaAuditoria")?.value || ""
  };
}

function coincideFiltros(registro, filtros) {
  const accion = obtenerAccion(registro);

  const contenido = normalizarTexto([
    accion.nombre,
    registro.accion,
    obtenerAdministrador(registro),
    obtenerDescripcion(registro),
    registro.objetivoNombre,
    registro.entidadId,
    registro.actorUid
  ].join(" "));

  const coincideBusqueda =
    !filtros.busqueda ||
    contenido.includes(filtros.busqueda);

  const coincideCategoria =
    !filtros.categoria ||
    accion.categoria === filtros.categoria;

  const fecha = obtenerFechaRegistro(registro);

  const coincideFecha =
    !filtros.fecha ||
    (
      fecha &&
      obtenerDiaLocal(fecha) === filtros.fecha
    );

  return coincideBusqueda &&
    coincideCategoria &&
    coincideFecha;
}

function obtenerRegistrosFiltrados() {
  const filtros = obtenerFiltros();

  return registros.filter(registro => {
    return coincideFiltros(registro, filtros);
  });
}

function mostrarEstado(mensaje, titulo = "Auditoría") {
  const contenedor = $("listaAuditoria");

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

function crearBotonDetalles(registro) {
  const boton = crearElemento(
    "button",
    "admin-accion-tabla",
    "Ver detalles"
  );

  boton.type = "button";

  boton.addEventListener("click", () => {
    mostrarDetalleAuditoria(registro);
  });

  return boton;
}

function crearRegistroAuditoria(registro) {
  const accion = obtenerAccion(registro);

  const contenedor = crearElemento(
    "article",
    "admin-auditoria-item"
  );

  const icono = crearElemento(
    "div",
    `admin-auditoria-icono ${accion.clase}`,
    accion.simbolo
  );

  const informacion = crearElemento(
    "div",
    "admin-auditoria-texto"
  );

  const titulo = crearElemento(
    "strong",
    "",
    accion.nombre
  );

  const descripcion = crearElemento(
    "p",
    "",
    obtenerDescripcion(registro)
  );

  const administrador = crearElemento(
    "small",
    "",
    `Realizado por: ${obtenerAdministrador(registro)}`
  );

  administrador.style.display = "block";
  administrador.style.marginTop = "7px";

  informacion.append(
    titulo,
    descripcion,
    administrador
  );

  const lateral = crearElemento(
    "div",
    "admin-auditoria-lateral"
  );

  const fecha = crearElemento(
    "span",
    "admin-auditoria-fecha",
    formatearFecha(obtenerFechaRegistro(registro))
  );

  lateral.append(
    fecha,
    crearBotonDetalles(registro)
  );

  contenedor.append(
    icono,
    informacion,
    lateral
  );

  return contenedor;
}

function actualizarPaginacion() {
  const boton = $("botonCargarMasAuditoria");

  if (!boton) {
    return;
  }

  boton.hidden = !hayMasRegistros;

  boton.disabled = cargando;

  boton.textContent = cargando
    ? "Cargando..."
    : "Cargar más movimientos";
}

function actualizarContador() {
  const contador = $("contadorAuditoria");

  if (!contador) {
    return;
  }

  const cantidad = obtenerRegistrosFiltrados().length;

  contador.textContent =
    `${cantidad} movimiento${cantidad === 1 ? "" : "s"} visible${cantidad === 1 ? "" : "s"}`;
}

function renderizarAuditoria() {
  const contenedor = $("listaAuditoria");

  if (!contenedor) {
    return;
  }

  const resultados = obtenerRegistrosFiltrados();

  if (!resultados.length) {
    mostrarEstado(
      registros.length
        ? "No hay movimientos que coincidan con los filtros."
        : "Todavía no hay movimientos administrativos registrados.",
      registros.length
        ? "Sin coincidencias"
        : "Sin movimientos"
    );

    actualizarContador();
    actualizarPaginacion();
    return;
  }

  const fragmento = document.createDocumentFragment();

  resultados.forEach(registro => {
    fragmento.append(
      crearRegistroAuditoria(registro)
    );
  });

  contenedor.replaceChildren(fragmento);

  actualizarContador();
  actualizarPaginacion();
}

async function consultarPaginaAuditoria(reiniciar = false) {
  if (cargando) {
    return;
  }

  cargando = true;

  if (reiniciar) {
    registros = [];
    ultimoDocumento = null;
    hayMasRegistros = true;

    mostrarEstado(
      "Consultando los movimientos administrativos...",
      "Cargando historial"
    );
  }

  actualizarPaginacion();

  try {
    const condiciones = [
      orderBy("creadoEn", "desc"),
      limit(REGISTROS_POR_PAGINA + 1)
    ];

    if (ultimoDocumento && !reiniciar) {
      condiciones.splice(
        1,
        0,
        startAfter(ultimoDocumento)
      );
    }

    const resultado = await getDocs(
      query(
        collection(db, "auditoria"),
        ...condiciones
      )
    );

    const documentos = resultado.docs;

    hayMasRegistros =
      documentos.length > REGISTROS_POR_PAGINA;

    const pagina = documentos.slice(
      0,
      REGISTROS_POR_PAGINA
    );

    if (pagina.length) {
      ultimoDocumento = pagina[pagina.length - 1];
    }

    const nuevos = pagina.map(documento => ({
      ...documento.data(),
      id: documento.id
    }));

    const existentes = new Set(
      registros.map(registro => registro.id)
    );

    nuevos.forEach(registro => {
      if (!existentes.has(registro.id)) {
        registros.push(registro);
        existentes.add(registro.id);
      }
    });

    primeraConsultaRealizada = true;

    renderizarAuditoria();
  } catch (error) {
    console.error("Error al cargar auditoría:", error);

    if (!registros.length) {
      mostrarEstado(
        "No fue posible consultar el historial. Revisa tu conexión y los permisos de Firebase.",
        "Error de consulta"
      );
    } else {
      renderizarAuditoria();
    }

    mostrarToast(
      "No se pudieron consultar los movimientos administrativos.",
      "error"
    );
  } finally {
    cargando = false;
    actualizarPaginacion();
  }
}

async function cargarAuditoria() {
  await consultarPaginaAuditoria(true);
}

async function cargarMasAuditoria() {
  if (!hayMasRegistros || cargando) {
    return;
  }

  await consultarPaginaAuditoria(false);
}

function formatearValor(valor) {
  if (valor === null || valor === undefined) {
    return "—";
  }

  if (typeof valor === "boolean") {
    return valor ? "Sí" : "No";
  }

  if (typeof valor === "number") {
    return String(valor);
  }

  if (typeof valor === "string") {
    return valor;
  }

  if (typeof valor?.toDate === "function") {
    return formatearFecha(valor);
  }

  try {
    return JSON.stringify(valor, null, 2);
  } catch {
    return "[Valor no disponible]";
  }
}

function mostrarDetalleAuditoria(registro) {
  const accion = obtenerAccion(registro);

  const detalles = [
    `Acción: ${accion.nombre}`,
    `Administrador: ${obtenerAdministrador(registro)}`,
    `Fecha: ${formatearFecha(obtenerFechaRegistro(registro))}`,
    `Descripción: ${obtenerDescripcion(registro)}`,
    `Categoría: ${accion.categoria}`,
    `Registro afectado: ${registro.entidadId || "—"}`,
    `Identificador de auditoría: ${registro.id}`
  ];

  if (registro.cambios && typeof registro.cambios === "object") {
    detalles.push(
      "",
      "CAMBIOS REGISTRADOS:",
      formatearValor(registro.cambios)
    );
  }

  if (registro.valoresAnteriores) {
    detalles.push(
      "",
      "VALORES ANTERIORES:",
      formatearValor(registro.valoresAnteriores)
    );
  }

  if (registro.valoresNuevos) {
    detalles.push(
      "",
      "VALORES NUEVOS:",
      formatearValor(registro.valoresNuevos)
    );
  }

  window.alert(detalles.join("\n"));
}

function configurarFiltros() {
  $("buscarAuditoria")?.addEventListener(
    "input",
    renderizarAuditoria
  );

  $("filtroCategoriaAuditoria")?.addEventListener(
    "change",
    renderizarAuditoria
  );

  $("filtroFechaAuditoria")?.addEventListener(
    "change",
    renderizarAuditoria
  );
}

function configurarEventos() {
  $("botonCargarMasAuditoria")?.addEventListener(
    "click",
    cargarMasAuditoria
  );

  $("botonActualizarAuditoria")?.addEventListener(
    "click",
    cargarAuditoria
  );

  document.addEventListener("admin:seccion", evento => {
    if (
      evento.detail?.seccion === "auditoria" &&
      !primeraConsultaRealizada
    ) {
      cargarAuditoria();
    }
  });
}

async function inicializarAuditoria(dependencias = {}) {
  if (inicializado) {
    return;
  }

  mostrarToast =
    dependencias.mostrarToast || mostrarToast;

  inicializado = true;

  configurarFiltros();
  configurarEventos();

  actualizarPaginacion();

  const seccion = $("seccion-auditoria");

  if (seccion && !seccion.hidden) {
    await cargarAuditoria();
  }
}

export {
  inicializarAuditoria,
  cargarAuditoria,
  cargarMasAuditoria,
  renderizarAuditoria
};
