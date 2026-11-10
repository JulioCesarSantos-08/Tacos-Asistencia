
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  app,
  auth,
  db
} from "./firebase.js";

const ZONA_HORARIA = "America/Mexico_City";

const functions = getFunctions(app, "us-central1");

const registrarEntradaRemota = httpsCallable(
  functions,
  "registrarEntrada"
);

const registrarSalidaRemota = httpsCallable(
  functions,
  "registrarSalida"
);

const ESTADOS = Object.freeze({
  PUNTUAL: "puntual",
  RETARDO: "retardo",
  FUERA_DE_PLAZO: "fuera_de_plazo",
  FALTA: "falta",
  JUSTIFICADA: "justificada",
  DESCANSO: "descanso",
  EN_CURSO: "en_curso",
  FINALIZADA: "finalizada",
  PENDIENTE: "pendiente"
});

const CONFIGURACION_PREDETERMINADA = Object.freeze({
  zonaHoraria: ZONA_HORARIA,
  toleranciaMinutos: 10,
  limiteEntradaMinutos: 40,
  radioMetros: 100,
  precisionMaximaMetros: 100,
  ubicacionObligatoria: true
});

function crearError(codigo, mensaje) {
  const error = new Error(mensaje);
  error.code = codigo;
  return error;
}

function obtenerUsuario() {
  const usuario = auth.currentUser;

  if (!usuario || usuario.isAnonymous) {
    throw crearError(
      "asistencia/no-autenticado",
      "Debes iniciar sesión con tu cuenta de empleado."
    );
  }

  return usuario;
}

function obtenerFechaActual() {
  return new Date();
}

function formatearFecha(fecha, opciones = {}) {
  const valor = convertirFecha(fecha);

  if (!valor) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...opciones
  }).format(valor);
}

function formatearHora(fecha, segundos = false) {
  const valor = convertirFecha(fecha);

  if (!valor) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
    ...(segundos ? { second: "2-digit" } : {}),
    hour12: false
  }).format(valor);
}

function obtenerClaveFecha(fecha = new Date()) {
  const valor = convertirFecha(fecha);

  if (!valor) {
    return "";
  }

  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(valor);

  const datos = {};

  partes.forEach(parte => {
    if (parte.type !== "literal") {
      datos[parte.type] = parte.value;
    }
  });

  return `${datos.year}-${datos.month}-${datos.day}`;
}

function obtenerClaveMes(fecha = new Date()) {
  return obtenerClaveFecha(fecha).slice(0, 7);
}

function convertirFecha(valor) {
  if (!valor) {
    return null;
  }

  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }

  if (valor instanceof Timestamp) {
    return valor.toDate();
  }

  if (typeof valor?.toDate === "function") {
    return valor.toDate();
  }

  if (typeof valor === "number") {
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  if (typeof valor === "string") {
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  if (typeof valor?.seconds === "number") {
    return new Date(
      valor.seconds * 1000 +
      Math.floor((valor.nanoseconds || 0) / 1000000)
    );
  }

  return null;
}

function validarHora(hora) {
  if (typeof hora !== "string") {
    return false;
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    return false;
  }

  return true;
}

function horaAMinutos(hora) {
  if (!validarHora(hora)) {
    throw crearError(
      "horario/invalido",
      "El horario debe tener el formato HH:MM."
    );
  }

  const [horas, minutos] = hora.split(":").map(Number);

  return horas * 60 + minutos;
}

function calcularDuracionTurno(entrada, salida) {
  const inicio = horaAMinutos(entrada);
  let fin = horaAMinutos(salida);

  if (fin <= inicio) {
    fin += 1440;
  }

  return fin - inicio;
}

function normalizarConfiguracion(datos = {}) {
  const configuracion = {
    ...CONFIGURACION_PREDETERMINADA,
    ...datos
  };

  const enteros = [
    "toleranciaMinutos",
    "limiteEntradaMinutos",
    "radioMetros",
    "precisionMaximaMetros"
  ];

  enteros.forEach(campo => {
    configuracion[campo] = Number(configuracion[campo]);
  });

  return configuracion;
}

function validarConfiguracion(configuracion) {
  const datos = normalizarConfiguracion(configuracion);

  if (
    !Number.isInteger(datos.toleranciaMinutos) ||
    datos.toleranciaMinutos < 0 ||
    datos.toleranciaMinutos > 1440
  ) {
    throw crearError(
      "configuracion/tolerancia-invalida",
      "La tolerancia debe estar entre 0 y 1440 minutos."
    );
  }

  if (
    !Number.isInteger(datos.limiteEntradaMinutos) ||
    datos.limiteEntradaMinutos < datos.toleranciaMinutos ||
    datos.limiteEntradaMinutos > 1440
  ) {
    throw crearError(
      "configuracion/limite-invalido",
      "El límite de entrada debe ser igual o mayor que la tolerancia."
    );
  }

  if (
    !Number.isFinite(datos.radioMetros) ||
    datos.radioMetros < 10 ||
    datos.radioMetros > 10000
  ) {
    throw crearError(
      "configuracion/radio-invalido",
      "El radio permitido debe estar entre 10 y 10000 metros."
    );
  }

  if (
    !Number.isFinite(datos.precisionMaximaMetros) ||
    datos.precisionMaximaMetros < 5 ||
    datos.precisionMaximaMetros > 1000
  ) {
    throw crearError(
      "configuracion/precision-invalida",
      "La precisión máxima debe estar entre 5 y 1000 metros."
    );
  }

  return datos;
}

async function obtenerConfiguracionGeneral() {
  const referencia = doc(db, "configuracion", "asistencias");
  const documento = await getDoc(referencia);

  if (!documento.exists()) {
    throw crearError(
      "configuracion/no-configurada",
      "El administrador todavía no ha configurado el control de asistencias."
    );
  }

  return validarConfiguracion(documento.data());
}

async function obtenerSucursal(sucursalId) {
  if (!sucursalId) {
    throw crearError(
      "sucursal/no-asignada",
      "Tu perfil no tiene una sucursal asignada."
    );
  }

  const referencia = doc(db, "sucursales", sucursalId);
  const documento = await getDoc(referencia);

  if (!documento.exists()) {
    throw crearError(
      "sucursal/no-encontrada",
      "No encontramos la sucursal asignada."
    );
  }

  const datos = documento.data();

  if (datos.activo !== true) {
    throw crearError(
      "sucursal/inactiva",
      "La sucursal asignada no está activa."
    );
  }

  return {
    id: documento.id,
    ...datos
  };
}

async function obtenerHorarioEmpleado(empleado) {
  if (!empleado?.uid) {
    throw crearError(
      "empleado/invalido",
      "No se pudo identificar al empleado."
    );
  }

  const horarioId = empleado.horarioId;

  if (!horarioId) {
    throw crearError(
      "horario/no-asignado",
      "El administrador todavía no te ha asignado un horario."
    );
  }

  const referencia = doc(db, "horarios", horarioId);
  const documento = await getDoc(referencia);

  if (!documento.exists()) {
    throw crearError(
      "horario/no-encontrado",
      "El horario asignado ya no está disponible."
    );
  }

  const horario = documento.data();

  if (horario.activo !== true) {
    throw crearError(
      "horario/inactivo",
      "Tu horario asignado está inactivo."
    );
  }

  return {
    id: documento.id,
    ...horario
  };
}

function gradosARadianes(grados) {
  return grados * Math.PI / 180;
}

function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  const radioTierra = 6371000;

  const diferenciaLatitud = gradosARadianes(lat2 - lat1);
  const diferenciaLongitud = gradosARadianes(lon2 - lon1);

  const a =
    Math.sin(diferenciaLatitud / 2) ** 2 +
    Math.cos(gradosARadianes(lat1)) *
    Math.cos(gradosARadianes(lat2)) *
    Math.sin(diferenciaLongitud / 2) ** 2;

  const valor = Math.min(1, Math.max(0, a));

  return 2 * radioTierra * Math.atan2(
    Math.sqrt(valor),
    Math.sqrt(1 - valor)
  );
}

function validarCoordenadas(latitud, longitud) {
  return (
    Number.isFinite(latitud) &&
    Number.isFinite(longitud) &&
    latitud >= -90 &&
    latitud <= 90 &&
    longitud >= -180 &&
    longitud <= 180
  );
}

function verificarGeocerca(ubicacion, sucursal, configuracion) {
  const latitud = Number(ubicacion?.latitud);
  const longitud = Number(ubicacion?.longitud);
  const precision = Number(ubicacion?.precision);

  const latitudSucursal = Number(sucursal?.latitud);
  const longitudSucursal = Number(sucursal?.longitud);

  if (
    !validarCoordenadas(latitud, longitud) ||
    !validarCoordenadas(latitudSucursal, longitudSucursal)
  ) {
    throw crearError(
      "ubicacion/coordenadas-invalidas",
      "No se pudieron verificar las coordenadas."
    );
  }

  if (!Number.isFinite(precision) || precision < 0) {
    throw crearError(
      "ubicacion/precision-invalida",
      "El dispositivo no proporcionó una precisión válida."
    );
  }

  const radioMetros = Number(
    sucursal.radioMetros ?? configuracion.radioMetros
  );

  const distanciaMetros = calcularDistanciaMetros(
    latitud,
    longitud,
    latitudSucursal,
    longitudSucursal
  );

  const precisionMaxima = Number(
    configuracion.precisionMaximaMetros
  );

  const precisionAceptable = precision <= precisionMaxima;

  const dentroDelRadio = distanciaMetros <= radioMetros;

  const dentroConMargenDePrecision =
    distanciaMetros + precision <= radioMetros;

  return {
    distanciaMetros: Math.round(distanciaMetros),
    radioMetros,
    precisionMetros: Math.round(precision),
    precisionAceptable,
    dentroDelRadio,
    dentroConMargenDePrecision,
    autorizada:
      precisionAceptable &&
      dentroConMargenDePrecision
  };
}

function solicitarUbicacion(opciones = {}) {
  const {
    timeout = 20000,
    maximumAge = 0,
    enableHighAccuracy = true
  } = opciones;

  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) {
      reject(
        crearError(
          "ubicacion/contexto-inseguro",
          "Para registrar asistencia debes abrir la aplicación mediante HTTPS."
        )
      );
      return;
    }

    if (!navigator.geolocation) {
      reject(
        crearError(
          "ubicacion/no-disponible",
          "Este dispositivo no permite consultar su ubicación."
        )
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      posicion => {
        resolve({
          latitud: posicion.coords.latitude,
          longitud: posicion.coords.longitude,
          precision: posicion.coords.accuracy,
          altitud: posicion.coords.altitude,
          capturadaEn: posicion.timestamp
        });
      },
      error => {
        const mensajes = {
          1: "Debes permitir el acceso a tu ubicación para registrar asistencia.",
          2: "No pudimos determinar tu ubicación. Activa el GPS e inténtalo nuevamente.",
          3: "La ubicación tardó demasiado. Inténtalo nuevamente."
        };

        reject(
          crearError(
            "ubicacion/error",
            mensajes[error.code] ||
              "No fue posible obtener tu ubicación."
          )
        );
      },
      {
        timeout,
        maximumAge,
        enableHighAccuracy
      }
    );
  });
}

async function obtenerUbicacionVerificada(sucursal, configuracion) {
  const ubicacion = await solicitarUbicacion();

  const resultado = verificarGeocerca(
    ubicacion,
    sucursal,
    configuracion
  );

  if (!resultado.precisionAceptable) {
    throw crearError(
      "ubicacion/poca-precision",
      `La precisión actual es de aproximadamente ${resultado.precisionMetros} metros. Intenta acercarte a una ventana o activar la ubicación precisa.`
    );
  }

  if (!resultado.autorizada) {
    throw crearError(
      "ubicacion/fuera-de-rango",
      `No se pudo confirmar que estés dentro del área autorizada. Distancia estimada: ${resultado.distanciaMetros} metros.`
    );
  }

  return {
    ...ubicacion,
    verificacion: resultado
  };
}

function obtenerDatosUbicacion(ubicacion) {
  if (!ubicacion) {
    return null;
  }

  return {
    latitud: ubicacion.latitud,
    longitud: ubicacion.longitud,
    precision: ubicacion.precision,
    capturadaEn: ubicacion.capturadaEn
  };
}

async function prepararRegistro(empleado) {
  const usuario = obtenerUsuario();

  if (empleado?.uid !== usuario.uid) {
    throw crearError(
      "empleado/usuario-invalido",
      "La cuenta actual no corresponde al empleado seleccionado."
    );
  }

  if (!navigator.onLine) {
    throw crearError(
      "asistencia/sin-conexion",
      "Necesitas conexión a internet para registrar asistencia."
    );
  }

  if (!empleado?.uid || empleado.activo !== true) {
    throw crearError(
      "empleado/no-autorizado",
      "Tu perfil no está autorizado para registrar asistencia."
    );
  }

  const configuracion = await obtenerConfiguracionGeneral();
  const sucursal = await obtenerSucursal(empleado.sucursalId);
  const horario = await obtenerHorarioEmpleado(empleado);

  let ubicacion = null;

  if (configuracion.ubicacionObligatoria) {
    ubicacion = await obtenerUbicacionVerificada(
      sucursal,
      configuracion
    );
  }

  return {
    configuracion,
    sucursal,
    horario,
    ubicacion
  };
}

async function registrarEntrada(empleado) {
  const datos = await prepararRegistro(empleado);

  const respuesta = await registrarEntradaRemota({
    ubicacion: obtenerDatosUbicacion(datos.ubicacion)
  });

  return respuesta.data;
}

async function registrarSalida(empleado) {
  const datos = await prepararRegistro(empleado);

  const respuesta = await registrarSalidaRemota({
    ubicacion: obtenerDatosUbicacion(datos.ubicacion)
  });

  return respuesta.data;
}

function normalizarAsistencia(documento) {
  return {
    id: documento.id,
    ...documento.data()
  };
}

async function obtenerJornadaActiva(uid) {
  const usuario = obtenerUsuario();

  if (uid !== usuario.uid) {
    throw crearError(
      "asistencia/usuario-invalido",
      "Solo puedes consultar tu propia jornada."
    );
  }

  const consulta = query(
    collection(db, "asistencias"),
    where("empleadoId", "==", uid),
    where("estadoJornada", "==", "en_curso"),
    limit(2)
  );

  const resultado = await getDocs(consulta);

  if (resultado.size > 1) {
    throw crearError(
      "asistencia/jornadas-duplicadas",
      "Se encontraron jornadas activas duplicadas. Comunícate con el administrador."
    );
  }

  if (resultado.empty) {
    return null;
  }

  return normalizarAsistencia(resultado.docs[0]);
}

async function obtenerUltimasAsistencias(uid, cantidad = 5) {
  const usuario = obtenerUsuario();

  if (uid !== usuario.uid) {
    throw crearError(
      "asistencia/usuario-invalido",
      "Solo puedes consultar tus propias asistencias."
    );
  }

  const consulta = query(
    collection(db, "asistencias"),
    where("empleadoId", "==", uid),
    orderBy("fechaInicioProgramada", "desc"),
    limit(Math.min(Math.max(1, cantidad), 50))
  );

  const resultado = await getDocs(consulta);

  return resultado.docs.map(normalizarAsistencia);
}

async function obtenerAsistenciasMes(uid, mes) {
  const usuario = obtenerUsuario();

  if (uid !== usuario.uid) {
    throw crearError(
      "asistencia/usuario-invalido",
      "Solo puedes consultar tus propias asistencias."
    );
  }

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    throw crearError(
      "asistencia/mes-invalido",
      "Selecciona un mes válido."
    );
  }

  const inicio = `${mes}-01`;
  const [anio, numeroMes] = mes.split("-").map(Number);
  const siguiente = new Date(Date.UTC(anio, numeroMes, 1));
  const fin = siguiente.toISOString().slice(0, 10);

  const consulta = query(
    collection(db, "asistencias"),
    where("empleadoId", "==", uid),
    where("fechaTurno", ">=", inicio),
    where("fechaTurno", "<", fin),
    orderBy("fechaTurno", "desc")
  );

  const resultado = await getDocs(consulta);

  return resultado.docs.map(normalizarAsistencia);
}

function calcularHorasTrabajadas(asistencia) {
  const entrada = convertirFecha(asistencia?.entrada);
  const salida = convertirFecha(asistencia?.salida);

  if (!entrada || !salida) {
    return 0;
  }

  const diferencia = salida.getTime() - entrada.getTime();

  if (diferencia <= 0) {
    return 0;
  }

  return diferencia / 3600000;
}

function calcularResumen(asistencias = []) {
  const resumen = {
    asistencias: 0,
    retardos: 0,
    faltas: 0,
    justificadas: 0,
    descansos: 0,
    horasTrabajadas: 0
  };

  asistencias.forEach(asistencia => {
    const estado = asistencia.estadoAsistencia;

    if (
      estado === ESTADOS.PUNTUAL ||
      estado === ESTADOS.RETARDO
    ) {
      resumen.asistencias++;
    }

    if (estado === ESTADOS.RETARDO) {
      resumen.retardos++;
    }

    if (estado === ESTADOS.FALTA) {
      resumen.faltas++;
    }

    if (estado === ESTADOS.JUSTIFICADA) {
      resumen.justificadas++;
    }

    if (estado === ESTADOS.DESCANSO) {
      resumen.descansos++;
    }

    resumen.horasTrabajadas += calcularHorasTrabajadas(
      asistencia
    );
  });

  resumen.horasTrabajadas = Math.round(
    resumen.horasTrabajadas * 100
  ) / 100;

  return resumen;
}

function obtenerNombreEstado(estado) {
  const nombres = {
    puntual: "Asistencia puntual",
    retardo: "Retardo",
    fuera_de_plazo: "Fuera de plazo",
    falta: "Falta",
    justificada: "Justificada",
    descanso: "Día de descanso",
    en_curso: "Jornada en curso",
    finalizada: "Jornada finalizada",
    pendiente: "Pendiente"
  };

  return nombres[estado] || "Sin clasificar";
}

function obtenerMensajeErrorAsistencia(error) {
  const mensajes = {
    "asistencia/no-autenticado": "Inicia sesión para registrar tu asistencia.",
    "asistencia/sin-conexion": "Necesitas conexión a internet para registrar asistencia.",
    "asistencia/usuario-invalido": "No tienes permiso para consultar esos registros.",
    "asistencia/jornadas-duplicadas": "Se detectaron jornadas duplicadas. Contacta al administrador.",
    "asistencia/ya-registrada": "Tu entrada ya fue registrada.",
    "asistencia/sin-entrada": "Primero debes registrar tu entrada.",
    "asistencia/fuera-de-plazo": "El horario permitido para registrar entrada ha terminado.",
    "asistencia/turno-no-programado": "No tienes una jornada programada en este momento.",
    "empleado/no-autorizado": "Tu cuenta no está autorizada para registrar asistencia.",
    "horario/no-asignado": "El administrador todavía no te ha asignado un horario.",
    "ubicacion/error": "No pudimos obtener tu ubicación.",
    "ubicacion/fuera-de-rango": "No estás dentro del área autorizada para registrar asistencia.",
    "ubicacion/poca-precision": "Tu ubicación no tiene suficiente precisión.",
    "functions/not-found": "El servicio de asistencia todavía no está disponible.",
    "functions/unavailable": "El servidor no está disponible. Inténtalo nuevamente.",
    "functions/unauthenticated": "Tu sesión expiró. Vuelve a iniciar sesión.",
    "functions/permission-denied": "No tienes permiso para realizar esta operación.",
    "permission-denied": "No tienes permisos para consultar estos datos.",
    "firestore/permission-denied": "No tienes permisos para consultar estos datos."
  };

  return mensajes[error?.code] ||
    error?.message ||
    "No fue posible completar la operación.";
}

export {
  ZONA_HORARIA,
  ESTADOS,
  CONFIGURACION_PREDETERMINADA,
  obtenerFechaActual,
  formatearFecha,
  formatearHora,
  obtenerClaveFecha,
  obtenerClaveMes,
  convertirFecha,
  validarHora,
  horaAMinutos,
  calcularDuracionTurno,
  normalizarConfiguracion,
  validarConfiguracion,
  obtenerConfiguracionGeneral,
  obtenerSucursal,
  obtenerHorarioEmpleado,
  calcularDistanciaMetros,
  verificarGeocerca,
  solicitarUbicacion,
  obtenerUbicacionVerificada,
  registrarEntrada,
  registrarSalida,
  obtenerJornadaActiva,
  obtenerUltimasAsistencias,
  obtenerAsistenciasMes,
  calcularHorasTrabajadas,
  calcularResumen,
  obtenerNombreEstado,
  obtenerMensajeErrorAsistencia
};
