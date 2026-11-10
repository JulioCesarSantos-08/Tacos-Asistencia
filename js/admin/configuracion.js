import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { auth, db } from "../firebase.js";
const $ = id => document.getElementById(id);

const CONFIGURACION_PREDETERMINADA = Object.freeze({
  nombreNegocio: "Tacos Orientales",
  zonaHoraria: "America/Mexico_City",
  toleranciaMinutos: 10,
  limiteEntradaMinutos: 40,
  anticipacionEntradaMinutos: 15,
  anticipacionSalidaMinutos: 0,
  margenSalidaMinutos: 120,
  ubicacionObligatoria: true,
  validarPrecisionGPS: true,
  precisionMaximaMetros: 100,
  permitirEntradaFueraHorario: false,
  permitirSalidaSinEntrada: false,
  permitirMultiplesEntradas: false,
  requerirConfirmacionSalida: true,
  permitirRegistroSinConexion: false,
  mostrarHistorialEmpleado: true,
  diasHistorialEmpleado: 30,
  sistemaActivo: true
});

const CAMPOS = Object.freeze({
  nombreNegocio: "configNombreNegocio",
  zonaHoraria: "configZonaHoraria",
  toleranciaMinutos: "configTolerancia",
  limiteEntradaMinutos: "configLimiteEntrada",
  anticipacionEntradaMinutos: "configAnticipacionEntrada",
  anticipacionSalidaMinutos: "configAnticipacionSalida",
  margenSalidaMinutos: "configMargenSalida",
  ubicacionObligatoria: "configUbicacionObligatoria",
  validarPrecisionGPS: "configValidarPrecision",
  precisionMaximaMetros: "configPrecisionMaxima",
  permitirEntradaFueraHorario: "configEntradaFueraHorario",
  permitirSalidaSinEntrada: "configSalidaSinEntrada",
  permitirMultiplesEntradas: "configMultiplesEntradas",
  requerirConfirmacionSalida: "configConfirmacionSalida",
  permitirRegistroSinConexion: "configRegistroSinConexion",
  mostrarHistorialEmpleado: "configMostrarHistorial",
  diasHistorialEmpleado: "configDiasHistorial",
  sistemaActivo: "configSistemaActivo"
});

const CAMPOS_BOOLEANOS = new Set([
  "ubicacionObligatoria",
  "validarPrecisionGPS",
  "permitirEntradaFueraHorario",
  "permitirSalidaSinEntrada",
  "permitirMultiplesEntradas",
  "requerirConfirmacionSalida",
  "permitirRegistroSinConexion",
  "mostrarHistorialEmpleado",
  "sistemaActivo"
]);

const CAMPOS_NUMERICOS = new Set([
  "toleranciaMinutos",
  "limiteEntradaMinutos",
  "anticipacionEntradaMinutos",
  "anticipacionSalidaMinutos",
  "margenSalidaMinutos",
  "precisionMaximaMetros",
  "diasHistorialEmpleado"
]);

const LIMITES = Object.freeze({
  toleranciaMinutos: [0, 180],
  limiteEntradaMinutos: [0, 360],
  anticipacionEntradaMinutos: [0, 180],
  anticipacionSalidaMinutos: [0, 180],
  margenSalidaMinutos: [0, 720],
  precisionMaximaMetros: [5, 1000],
  diasHistorialEmpleado: [1, 365]
});

let configuracionActual = {
  ...CONFIGURACION_PREDETERMINADA
};

let inicializado = false;
let cargando = false;
let guardando = false;
let configuracionCargada = false;
let mostrarToast = () => {};

function obtenerControl(clave) {
  return $(CAMPOS[clave]);
}

function asignarValorControl(clave, valor) {
  const control = obtenerControl(clave);

  if (!control) {
    return;
  }

  if (CAMPOS_BOOLEANOS.has(clave)) {
    control.checked = valor === true;
    return;
  }

  control.value = valor ?? "";
}

function leerValorControl(clave, predeterminado) {
  const control = obtenerControl(clave);

  if (!control) {
    return predeterminado;
  }

  if (CAMPOS_BOOLEANOS.has(clave)) {
    return control.checked;
  }

  if (CAMPOS_NUMERICOS.has(clave)) {
    const texto = String(control.value).trim();

    if (!texto) {
      return NaN;
    }

    return Number(texto);
  }

  return String(control.value).trim();
}

function aplicarConfiguracion(datos) {
  configuracionActual = {
    ...CONFIGURACION_PREDETERMINADA,
    ...datos
  };

  Object.keys(CAMPOS).forEach(clave => {
    asignarValorControl(
      clave,
      configuracionActual[clave]
    );
  });

  actualizarResumen();
  actualizarDependencias();
}

function obtenerConfiguracionFormulario() {
  const datos = {};

  Object.keys(CAMPOS).forEach(clave => {
    datos[clave] = leerValorControl(
      clave,
      configuracionActual[clave]
    );
  });

  return datos;
}

function validarEntero(nombre, valor) {
  const limites = LIMITES[nombre];

  if (!limites) {
    return;
  }

  const [minimo, maximo] = limites;

  if (
    !Number.isInteger(valor) ||
    valor < minimo ||
    valor > maximo
  ) {
    throw new Error(
      `El valor de ${nombre} debe estar entre ${minimo} y ${maximo}.`
    );
  }
}

function validarConfiguracion(datos) {
  if (
    datos.nombreNegocio.length < 3 ||
    datos.nombreNegocio.length > 100
  ) {
    throw new Error(
      "El nombre del negocio debe tener entre 3 y 100 caracteres."
    );
  }

  if (datos.zonaHoraria !== "America/Mexico_City") {
    throw new Error(
      "Actualmente el sistema está configurado para la zona horaria America/Mexico_City."
    );
  }

  CAMPOS_NUMERICOS.forEach(clave => {
    validarEntero(clave, datos[clave]);
  });

  if (datos.limiteEntradaMinutos < datos.toleranciaMinutos) {
    throw new Error(
      "El límite de entrada no puede ser menor que la tolerancia."
    );
  }

  if (
    datos.permitirRegistroSinConexion ||
    datos.permitirSalidaSinEntrada ||
    datos.permitirMultiplesEntradas
  ) {
    throw new Error(
      "Los registros sin conexión, las salidas sin entrada y las entradas múltiples permanecerán deshabilitados hasta que el servidor implemente sus controles específicos."
    );
  }

  return {
    ...datos,
    nombreNegocio: datos.nombreNegocio.replace(/\s+/g, " "),
    zonaHoraria: "America/Mexico_City",
    permitirRegistroSinConexion: false,
    permitirSalidaSinEntrada: false,
    permitirMultiplesEntradas: false
  };
}

function actualizarDependencias() {
  const ubicacion = obtenerControl(
    "ubicacionObligatoria"
  );

  const precision = obtenerControl(
    "validarPrecisionGPS"
  );

  const precisionMaxima = obtenerControl(
    "precisionMaximaMetros"
  );

  const historial = obtenerControl(
    "mostrarHistorialEmpleado"
  );

  const diasHistorial = obtenerControl(
    "diasHistorialEmpleado"
  );

  if (precision && ubicacion) {
    precision.disabled = !ubicacion.checked;
  }

  if (precisionMaxima) {
    precisionMaxima.disabled =
      !ubicacion?.checked || !precision?.checked;
  }

  if (diasHistorial && historial) {
    diasHistorial.disabled = !historial.checked;
  }

  [
    "permitirRegistroSinConexion",
    "permitirSalidaSinEntrada",
    "permitirMultiplesEntradas"
  ].forEach(clave => {
    const control = obtenerControl(clave);

    if (control) {
      control.checked = false;
      control.disabled = true;
    }
  });
}

function actualizarResumen() {
  const datos = obtenerConfiguracionFormulario();

  const resumen = {
    resumenConfigTolerancia:
      `${datos.toleranciaMinutos} min`,
    resumenConfigLimite:
      `${datos.limiteEntradaMinutos} min`,
    resumenConfigUbicacion:
      datos.ubicacionObligatoria
        ? "Obligatoria"
        : "Opcional",
    resumenConfigSistema:
      datos.sistemaActivo
        ? "Activo"
        : "Suspendido"
  };

  Object.entries(resumen).forEach(([id, valor]) => {
    const elemento = $(id);

    if (elemento) {
      elemento.textContent = valor;
    }
  });
}

function establecerCargando(estado) {
  cargando = estado;

  const boton = $("guardarConfiguracion");

  if (boton) {
    boton.disabled = estado || guardando;
    boton.textContent = estado
      ? "Cargando configuración..."
      : guardando
        ? "Guardando cambios..."
        : "Guardar configuración";
  }
}

function establecerGuardando(estado) {
  guardando = estado;

  const boton = $("guardarConfiguracion");

  if (boton) {
    boton.disabled = estado || cargando;
    boton.textContent = estado
      ? "Guardando cambios..."
      : "Guardar configuración";
  }
}

async function cargarConfiguracion() {
  if (cargando) {
    return;
  }

  establecerCargando(true);

  try {
    const referencia = doc(
      db,
      "configuracion",
      "asistencias"
    );

    const resultado = await getDoc(referencia);

    const datos = resultado.exists()
      ? resultado.data()
      : CONFIGURACION_PREDETERMINADA;

    aplicarConfiguracion(datos);

    configuracionCargada = true;
  } catch (error) {
    console.error(
      "Error al cargar configuración:",
      error
    );

    configuracionCargada = false;

    mostrarToast(
      "No se pudo cargar la configuración. No se permitirán cambios hasta recuperar la conexión.",
      "error"
    );
  } finally {
    establecerCargando(false);
  }
}

async function guardarConfiguracion(evento) {
  evento.preventDefault();

  if (
    guardando ||
    cargando ||
    !configuracionCargada
  ) {
    return;
  }

  try {
    const datos = validarConfiguracion(
      obtenerConfiguracionFormulario()
    );

    const cambiosCriticos = (
      configuracionActual.sistemaActivo &&
      !datos.sistemaActivo
    ) || (
      configuracionActual.ubicacionObligatoria &&
      !datos.ubicacionObligatoria
    ) || (
      !configuracionActual.permitirEntradaFueraHorario &&
      datos.permitirEntradaFueraHorario
    );

    if (cambiosCriticos) {
      const confirmado = window.confirm(
        "Estás modificando restricciones importantes del sistema de asistencias. ¿Deseas continuar?"
      );

      if (!confirmado) {
        return;
      }
    }

    establecerGuardando(true);

    const administrador = auth.currentUser;

    if (!administrador) {
      throw new Error("La sesión del administrador ha caducado.");
    }

    await setDoc(
      doc(db, "configuracion", "asistencias"),
      {
        ...datos,
        actualizadoEn: serverTimestamp(),
        actualizadoPor: administrador.uid
      },
      { merge: true }
    );

    configuracionActual = {
      ...datos
    };

    aplicarConfiguracion(configuracionActual);

    mostrarToast(
      "La configuración fue actualizada correctamente."
    );
  } catch (error) {
    console.error(
      "Error al guardar configuración:",
      error
    );

    mostrarToast(
      error.message ||
      "No fue posible guardar la configuración.",
      "error"
    );
  } finally {
    establecerGuardando(false);
  }
}

function restaurarFormulario() {
  if (!configuracionCargada || guardando) {
    return;
  }

  aplicarConfiguracion(configuracionActual);

  mostrarToast(
    "Se restauraron los últimos valores guardados."
  );
}

function establecerValoresPredeterminados() {
  if (guardando || cargando) {
    return;
  }

  const confirmado = window.confirm(
    "¿Deseas colocar los valores predeterminados en el formulario? Los cambios no se guardarán hasta que presiones Guardar configuración."
  );

  if (!confirmado) {
    return;
  }

  Object.keys(CAMPOS).forEach(clave => {
    asignarValorControl(
      clave,
      CONFIGURACION_PREDETERMINADA[clave]
    );
  });

  actualizarDependencias();
  actualizarResumen();

  mostrarToast(
    "Se colocaron los valores predeterminados. Recuerda guardar para aplicarlos."
  );
}

function configurarEventos() {
  $("formConfiguracion")?.addEventListener(
    "submit",
    guardarConfiguracion
  );

  $("botonRestaurarConfiguracion")?.addEventListener(
    "click",
    restaurarFormulario
  );

  $("botonValoresPredeterminados")?.addEventListener(
    "click",
    establecerValoresPredeterminados
  );

  Object.keys(CAMPOS).forEach(clave => {
    const control = obtenerControl(clave);

    if (!control) {
      return;
    }

    const evento = CAMPOS_BOOLEANOS.has(clave)
      ? "change"
      : "input";

    control.addEventListener(evento, () => {
      actualizarDependencias();
      actualizarResumen();
    });
  });

  document.addEventListener("admin:seccion", evento => {
    if (
      evento.detail?.seccion === "configuracion" &&
      !configuracionCargada
    ) {
      cargarConfiguracion();
    }
  });
}

async function inicializarConfiguracion(dependencias = {}) {
  if (inicializado) {
    return;
  }

  mostrarToast =
    dependencias.mostrarToast || mostrarToast;

  inicializado = true;

  configurarEventos();

  const botonGuardar = $("guardarConfiguracion");

  if (botonGuardar) {
    botonGuardar.disabled = true;
  }

  await cargarConfiguracion();
}

export {
  inicializarConfiguracion,
  cargarConfiguracion,
  guardarConfiguracion,
  restaurarFormulario
};
