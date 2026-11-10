
import {
  collection,
  getDocs,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  auth,
  db
} from "../firebase.js";

const $ = id => document.getElementById(id);

const CONFIGURACION_INICIAL = Object.freeze({
  nombre: "Tacos Orientales Río Grande",
  latitud: null,
  longitud: null,
  radioMetros: 100,
  precisionMaximaMetros: 100,
  ubicacionObligatoria: true
});

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

let inicializado = false;
let cargando = false;
let guardando = false;
let mapa = null;
let marcador = null;
let circulo = null;
let sucursalActual = null;
let sucursales = [];
let ubicacionSeleccionada = null;
let mapaPreparado = false;
let mapaPendiente = null;
let leafletPendiente = null;

let mostrarToast = () => {};

function coordenadasValidas(latitud, longitud) {
  return Number.isFinite(latitud) &&
    Number.isFinite(longitud) &&
    latitud >= -90 &&
    latitud <= 90 &&
    longitud >= -180 &&
    longitud <= 180;
}

function convertirCoordenada(valor) {
  if (
    valor === null ||
    valor === undefined ||
    String(valor).trim() === ""
  ) {
    return null;
  }

  const numero = Number(valor);

  return Number.isFinite(numero) ? numero : null;
}

function cargarEstiloLeaflet() {
  if (document.querySelector('link[data-leaflet="true"]')) {
    return;
  }

  const enlace = document.createElement("link");

  enlace.rel = "stylesheet";
  enlace.href = LEAFLET_CSS;
  enlace.dataset.leaflet = "true";

  document.head.append(enlace);
}

function cargarScriptLeaflet() {
  if (window.L) {
    return Promise.resolve(window.L);
  }

  if (leafletPendiente) {
    return leafletPendiente;
  }

  leafletPendiente = new Promise((resolve, reject) => {
    const script = document.createElement("script");

    script.src = LEAFLET_JS;
    script.dataset.leaflet = "true";
    script.async = true;

    script.onload = () => {
      if (window.L) {
        resolve(window.L);
      } else {
        reject(new Error("No fue posible iniciar Leaflet."));
      }
    };

    script.onerror = () => {
      reject(new Error("No fue posible cargar el mapa."));
    };

    document.head.append(script);
  }).catch(error => {
    leafletPendiente = null;
    throw error;
  });

  return leafletPendiente;
}

async function prepararLeaflet() {
  cargarEstiloLeaflet();
  return cargarScriptLeaflet();
}

function obtenerRadioFormulario() {
  const radio = Number($("sucursalRadio")?.value);

  return Number.isFinite(radio) && radio > 0
    ? radio
    : CONFIGURACION_INICIAL.radioMetros;
}

function actualizarCamposCoordenadas(latitud, longitud) {
  const campoLatitud = $("sucursalLatitud");
  const campoLongitud = $("sucursalLongitud");

  if (campoLatitud) {
    campoLatitud.value = latitud.toFixed(7);
  }

  if (campoLongitud) {
    campoLongitud.value = longitud.toFixed(7);
  }
}

function actualizarCirculo() {
  if (!circulo) {
    return;
  }

  circulo.setRadius(obtenerRadioFormulario());
}

function seleccionarUbicacion(latitud, longitud, centrar = false) {
  const lat = convertirCoordenada(latitud);
  const lng = convertirCoordenada(longitud);

  if (!coordenadasValidas(lat, lng)) {
    return;
  }

  ubicacionSeleccionada = {
    latitud: lat,
    longitud: lng
  };

  actualizarCamposCoordenadas(lat, lng);

  if (marcador) {
    marcador.setLatLng([lat, lng]);
  }

  if (circulo) {
    circulo.setLatLng([lat, lng]);
    circulo.setRadius(obtenerRadioFormulario());
  }

  if (centrar && mapa) {
    mapa.setView([lat, lng], 17);
  }
}

function configurarEventosMapa() {
  if (!mapa || !marcador) {
    return;
  }

  mapa.on("click", evento => {
    seleccionarUbicacion(
      evento.latlng.lat,
      evento.latlng.lng
    );
  });

  marcador.on("dragend", () => {
    const posicion = marcador.getLatLng();

    seleccionarUbicacion(
      posicion.lat,
      posicion.lng
    );
  });
}

function mostrarMapaSinUbicacion() {
  const contenedor = $("mapaSucursal");

  if (!contenedor) {
    return;
  }

  const aviso = document.createElement("div");
  const titulo = document.createElement("strong");
  const descripcion = document.createElement("p");

  aviso.className = "admin-estado-vacio";
  titulo.textContent = "Mapa no disponible";
  descripcion.textContent =
    "Puedes ingresar manualmente la latitud y longitud de la sucursal.";

  aviso.append(titulo, descripcion);
  contenedor.replaceChildren(aviso);
}

async function inicializarMapa() {
  if (mapaPreparado) {
    if (mapa) {
      setTimeout(() => mapa.invalidateSize(), 150);
    }

    return;
  }

  if (mapaPendiente) {
    return mapaPendiente;
  }

  const contenedor = $("mapaSucursal");

  if (!contenedor) {
    return;
  }

  mapaPendiente = (async () => {
    try {
      const L = await prepararLeaflet();

      contenedor.replaceChildren();

      const posicionInicial = ubicacionSeleccionada
        ? [
            ubicacionSeleccionada.latitud,
            ubicacionSeleccionada.longitud
          ]
        : [16.01, -97.43];

      mapa = L.map(contenedor, {
        zoomControl: true,
        scrollWheelZoom: false
      }).setView(
        posicionInicial,
        ubicacionSeleccionada ? 17 : 12
      );

      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19
        }
      ).addTo(mapa);

      marcador = L.marker(posicionInicial, {
        draggable: true,
        autoPan: true
      }).addTo(mapa);

      circulo = L.circle(posicionInicial, {
        radius: obtenerRadioFormulario(),
        color: "#27824b",
        fillColor: "#4bad70",
        fillOpacity: 0.16,
        weight: 2
      }).addTo(mapa);

      configurarEventosMapa();

      mapaPreparado = true;

      if (ubicacionSeleccionada) {
        seleccionarUbicacion(
          ubicacionSeleccionada.latitud,
          ubicacionSeleccionada.longitud,
          true
        );
      }

      setTimeout(() => mapa.invalidateSize(), 150);
    } catch (error) {
      console.error("Error al inicializar mapa:", error);

      mostrarMapaSinUbicacion();

      mostrarToast(
        "No se pudo cargar el mapa. Puedes escribir las coordenadas manualmente.",
        "error"
      );
    } finally {
      mapaPendiente = null;
    }
  })();

  return mapaPendiente;
}

function actualizarFormulario(sucursal) {
  const datos = sucursal || CONFIGURACION_INICIAL;

  const nombre = $("sucursalNombre");
  const radio = $("sucursalRadio");
  const precision = $("sucursalPrecision");
  const ubicacionObligatoria = $("sucursalUbicacionObligatoria");

  if (nombre) {
    nombre.value =
      datos.nombre || CONFIGURACION_INICIAL.nombre;
  }

  if (radio) {
    radio.value =
      datos.radioMetros ??
      CONFIGURACION_INICIAL.radioMetros;
  }

  if (precision) {
    precision.value =
      datos.precisionMaximaMetros ??
      CONFIGURACION_INICIAL.precisionMaximaMetros;
  }

  if (ubicacionObligatoria) {
    ubicacionObligatoria.checked =
      datos.ubicacionObligatoria !== false;
  }

  const latitud = convertirCoordenada(datos.latitud);
  const longitud = convertirCoordenada(datos.longitud);

  if (coordenadasValidas(latitud, longitud)) {
    seleccionarUbicacion(latitud, longitud, true);
  } else {
    ubicacionSeleccionada = null;

    if ($("sucursalLatitud")) {
      $("sucursalLatitud").value = "";
    }

    if ($("sucursalLongitud")) {
      $("sucursalLongitud").value = "";
    }
  }
}

async function cargarSucursales() {
  if (cargando) {
    return;
  }

  cargando = true;

  try {
    const resultado = await getDocs(
      collection(db, "sucursales")
    );

    sucursales = resultado.docs.map(documento => ({
      ...documento.data(),
      id: documento.id
    }));

    sucursalActual =
      sucursales.find(item => item.principal === true) ||
      sucursales.find(item => item.id === "principal") ||
      sucursales[0] ||
      null;

    actualizarFormulario(sucursalActual);
  } catch (error) {
    console.error("Error al cargar sucursales:", error);

    mostrarToast(
      error.code === "permission-denied"
        ? "Tu cuenta no tiene permisos para consultar las sucursales."
        : "No se pudieron consultar las sucursales.",
      "error"
    );
  } finally {
    cargando = false;
  }
}

function obtenerDatosFormulario() {
  const nombre = String(
    $("sucursalNombre")?.value || ""
  ).trim().replace(/\s+/g, " ");

  const latitud = convertirCoordenada(
    $("sucursalLatitud")?.value
  );

  const longitud = convertirCoordenada(
    $("sucursalLongitud")?.value
  );

  const radioMetros = Number(
    $("sucursalRadio")?.value
  );

  const precisionMaximaMetros = Number(
    $("sucursalPrecision")?.value
  );

  const ubicacionObligatoria =
    $("sucursalUbicacionObligatoria")?.checked === true;

  if (nombre.length < 3 || nombre.length > 100) {
    throw new Error(
      "El nombre de la sucursal debe tener entre 3 y 100 caracteres."
    );
  }

  if (!coordenadasValidas(latitud, longitud)) {
    throw new Error(
      "Selecciona una ubicación válida en el mapa."
    );
  }

  if (
    !Number.isInteger(radioMetros) ||
    radioMetros < 10 ||
    radioMetros > 10000
  ) {
    throw new Error(
      "El radio autorizado debe estar entre 10 y 10000 metros."
    );
  }

  if (
    !Number.isInteger(precisionMaximaMetros) ||
    precisionMaximaMetros < 5 ||
    precisionMaximaMetros > 1000
  ) {
    throw new Error(
      "La precisión GPS debe estar entre 5 y 1000 metros."
    );
  }

  return {
    nombre,
    latitud,
    longitud,
    radioMetros,
    precisionMaximaMetros,
    ubicacionObligatoria,
    principal: sucursalActual
      ? sucursalActual.principal === true ||
        sucursalActual.id === "principal"
      : true,
    activo: sucursalActual
      ? sucursalActual.activo !== false
      : true
  };
}

function establecerGuardando(estado) {
  guardando = estado;

  const boton = $("guardarSucursal");

  if (!boton) {
    return;
  }

  boton.disabled = estado;

  boton.textContent = estado
    ? "Guardando ubicación..."
    : "Guardar configuración";
}

async function guardarSucursal(evento) {
  evento.preventDefault();

  if (guardando || cargando) {
    return;
  }

  try {
    const datos = obtenerDatosFormulario();

    if (!auth.currentUser) {
      throw new Error(
        "Tu sesión ha expirado. Inicia sesión nuevamente."
      );
    }

    establecerGuardando(true);

    const sucursalId = sucursalActual?.id || "principal";

    await setDoc(
      doc(db, "sucursales", sucursalId),
      {
        ...datos,
        actualizadoEn: serverTimestamp(),
        actualizadoPor: auth.currentUser.uid
      },
      {
        merge: true
      }
    );

    sucursalActual = {
      ...sucursalActual,
      ...datos,
      id: sucursalId
    };

    mostrarToast(
      "La ubicación autorizada se guardó correctamente.",
      "exito"
    );

    await cargarSucursales();
  } catch (error) {
    console.error(
      "Error al guardar sucursal:",
      error
    );

    let mensaje =
      error.message ||
      "No fue posible guardar la ubicación.";

    if (error.code === "permission-denied") {
      mensaje =
        "Firestore rechazó el guardado. Revisa los permisos de administrador y las reglas de sucursales.";
    }

    if (error.code === "unavailable") {
      mensaje =
        "No hay conexión con Firebase. Inténtalo nuevamente.";
    }

    mostrarToast(mensaje, "error");
  } finally {
    establecerGuardando(false);
  }
}

function actualizarUbicacionDesdeCampos() {
  const latitud = convertirCoordenada(
    $("sucursalLatitud")?.value
  );

  const longitud = convertirCoordenada(
    $("sucursalLongitud")?.value
  );

  if (coordenadasValidas(latitud, longitud)) {
    seleccionarUbicacion(latitud, longitud, true);
  }
}

function configurarEventos() {
  $("formSucursal")?.addEventListener(
    "submit",
    guardarSucursal
  );

  $("sucursalRadio")?.addEventListener(
    "input",
    actualizarCirculo
  );

  $("sucursalLatitud")?.addEventListener(
    "change",
    actualizarUbicacionDesdeCampos
  );

  $("sucursalLongitud")?.addEventListener(
    "change",
    actualizarUbicacionDesdeCampos
  );

  document.addEventListener(
    "admin:seccion",
    async evento => {
      if (evento.detail?.seccion === "sucursales") {
        await inicializarMapa();
      }
    }
  );
}

async function inicializarSucursales(dependencias = {}) {
  if (inicializado) {
    return;
  }

  mostrarToast =
    dependencias.mostrarToast || mostrarToast;

  inicializado = true;

  configurarEventos();

  await cargarSucursales();
}

export {
  inicializarSucursales,
  cargarSucursales,
  inicializarMapa,
  seleccionarUbicacion
};
