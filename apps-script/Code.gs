/* =====================================================================
   BASE DE DATOS DEL EXPERIMENTO — Google Apps Script + Google Sheets
   Réplica didáctica: niveles de procesamiento y recuerdo (Craik y Tulving, 1975)
   Diseño experimental con el mismo grupo de participantes (intrasujeto)

   Cómo instalar (resumen; detalle en README.md, paso 3):
     1. Abre la hoja «Niveles_Procesamiento_datos» en Google Sheets.
     2. Extensiones > Apps Script. Borra el contenido y pega este archivo.
     3. Cambia CLAVE_RESULTADOS por una palabra que solo sepas tú.
     4. Ejecuta una vez la función «preparar» (autoriza los permisos).
     5. Implementar > Nueva implementación > Aplicación web
          - Ejecutar como: Yo
          - Quién tiene acceso: Cualquier usuario
        Copia la URL que termina en /exec y pégala en js/config.js (ENDPOINT).

   Pestañas de la hoja:
     Resumen     -> estadísticos en vivo con fórmulas (no los escribe este script)
     Respuestas  -> una fila por participante, ya codificada   <- escribe doPost
     Estimulos   -> las 18 preguntas, su nivel y la lista de reconocimiento
     Leeme       -> descripción de las columnas
   ===================================================================== */

const CLAVE_RESULTADOS = "cambia-esta-clave";   // <-- ¡CÁMBIALA!
const HOJA_RESP = "Respuestas";

/* ---------- GET: leer datos (panel de resultados) ---------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.accion === "datos") {
    if (p.clave !== CLAVE_RESULTADOS) return json_({ error: "clave incorrecta" });
    return json_({ filas: leerFilas_(p.cohorte || "") });
  }
  return json_({ ok: true, info: "Servicio del experimento activo" });
}

/* ---------- POST: guardar una fila de respuestas ---------- */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cuerpo = JSON.parse(e.postData.contents);
    if (cuerpo.accion !== "guardar" || !cuerpo.fila) return json_({ error: "petición no válida" });
    const fila = cuerpo.fila;
    fila.recibido = new Date().toISOString();
    const hoja = hoja_(HOJA_RESP);
    // Cabeceras dinámicas: si aparece una columna nueva, se añade al final
    let cab = hoja.getLastColumn() > 0 ? hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0] : [];
    if (!cab.length || cab[0] === "") { cab = COLUMNAS.slice(); hoja.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight("bold"); }
    const nuevas = Object.keys(fila).filter(k => cab.indexOf(k) === -1);
    if (nuevas.length) {
      hoja.getRange(1, cab.length + 1, 1, nuevas.length).setValues([nuevas]).setFontWeight("bold");
      cab = cab.concat(nuevas);
    }
    hoja.appendRow(cab.map(k => (fila[k] === undefined || fila[k] === null) ? "" : fila[k]));
    return json_({ ok: true });
  } catch (err) {
    return json_({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function leerFilas_(cohorte) {
  const h = hoja_(HOJA_RESP);
  if (h.getLastRow() < 2) return [];
  const v = h.getRange(1, 1, h.getLastRow(), h.getLastColumn()).getValues();
  const cab = v[0];
  return v.slice(1).map(r => { const o = {}; cab.forEach((k, i) => o[k] = r[i]); return o; })
          .filter(o => !cohorte || String(o.cohorte) === cohorte);
}

function hoja_(nombre) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(nombre) || ss.insertSheet(nombre);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* Columnas de la pestaña Respuestas (mismo orden que la plantilla) */
const COLUMNAS = ["id", "cohorte", "fecha_inicio", "fecha_fin", "duracion_s", "sexo", "edad", "superficial", "intermedio", "profundo", "aciertos_superficial", "aciertos_intermedio", "aciertos_profundo", "falsas_alarmas", "p_falsas_alarmas", "n_marcadas", "sospecha", "conocia", "condiciones", "cambios_pestana", "movil", "pantalla", "orden_preguntas", "t1_aciertos_orientacion", "t1_tr_medio_ms", "t2_correctos", "t2_errores", "t2_completada", "t2_tiempo_s", "t3_tiempo_s", "q01_resp", "q01_ok", "q01_tr_ms", "q01_rec", "q02_resp", "q02_ok", "q02_tr_ms", "q02_rec", "q03_resp", "q03_ok", "q03_tr_ms", "q03_rec", "q04_resp", "q04_ok", "q04_tr_ms", "q04_rec", "q05_resp", "q05_ok", "q05_tr_ms", "q05_rec", "q06_resp", "q06_ok", "q06_tr_ms", "q06_rec", "q07_resp", "q07_ok", "q07_tr_ms", "q07_rec", "q08_resp", "q08_ok", "q08_tr_ms", "q08_rec", "q09_resp", "q09_ok", "q09_tr_ms", "q09_rec", "q10_resp", "q10_ok", "q10_tr_ms", "q10_rec", "q11_resp", "q11_ok", "q11_tr_ms", "q11_rec", "q12_resp", "q12_ok", "q12_tr_ms", "q12_rec", "q13_resp", "q13_ok", "q13_tr_ms", "q13_rec", "q14_resp", "q14_ok", "q14_tr_ms", "q14_rec", "q15_resp", "q15_ok", "q15_tr_ms", "q15_rec", "q16_resp", "q16_ok", "q16_tr_ms", "q16_rec", "q17_resp", "q17_ok", "q17_tr_ms", "q17_rec", "q18_resp", "q18_ok", "q18_tr_ms", "q18_rec", "recibido"];

/* Ejecutar UNA vez desde el editor para autorizar permisos.
   Con la plantilla ya creada no se borra nada; si partes de una hoja vacía,
   crea la pestaña Respuestas con sus cabeceras. */
function preparar() {
  const r = hoja_(HOJA_RESP);
  if (r.getLastRow() === 0) {
    r.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS])
     .setFontWeight("bold").setFontColor("#FFFFFF").setBackground("#0047E8");
    r.setFrozenRows(1);
  }
  SpreadsheetApp.getActiveSpreadsheet().toast("Hoja preparada. Ahora: Implementar > Nueva implementación > Aplicación web.");
}
