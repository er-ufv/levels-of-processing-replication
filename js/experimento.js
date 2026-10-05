/* =====================================================================
   LÓGICA DEL EXPERIMENTO (pestaña «Experimento»)
   Flujo: consentimiento -> tarea 1 (18 preguntas de orientación) ->
          tarea 2 (contar hacia atrás, distractora) -> tarea 3 (reconocimiento
          de 36 palabras) -> preguntas finales -> codificación y envío
   Diseño intrasujeto: todos pasan por los tres niveles de la VI.
   ===================================================================== */
(function () {
  "use strict";
  const C = window.CONFIG;
  const $ = (s) => document.querySelector(s);
  const CLAVE_ESTADO = "niveles_estado_" + C.COHORTE;
  const CLAVE_LOCAL = "niveles_datos_local";

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  };
  const norm = (s) => String(s).toLowerCase().normalize("NFC").trim();
  const sinTilde = (s) => norm(s).normalize("NFD").replace(/[̀-ͯ]/g, "");

  /* ---------- datos del participante ---------- */
  const D = {
    id: "P-" + Date.now().toString(36).toUpperCase().slice(-5) + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(),
    cohorte: C.COHORTE,
    fecha_inicio: new Date().toISOString(),
    cambios_pestana: 0,
    pantalla: window.innerWidth + "x" + window.innerHeight,
    movil: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 1 : 0,
    t1: [], t2: {}, marcadas: new Set()
  };

  /* ---------- textos de cabecera ---------- */
  $("#asig").textContent = C.ASIGNATURA;
  $("#tema").textContent = C.TEMA;
  $("#pie-asig").textContent = C.ASIGNATURA;

  /* ---------- pestañas ---------- */
  function irPestana(destino) {
    document.querySelectorAll("#pestanas button").forEach((b) => {
      const on = b.dataset.destino === destino;
      b.classList.toggle("activa", on); b.setAttribute("aria-selected", on);
    });
    $("#vista-exp").classList.toggle("oculto", destino !== "vista-exp");
    $("#vista-res").classList.toggle("oculto", destino !== "vista-res");
    if (destino === "vista-res") document.dispatchEvent(new Event("abrir-resultados"));
  }
  document.querySelectorAll("#pestanas button").forEach((b) => b.addEventListener("click", () => irPestana(b.dataset.destino)));
  if (location.hash === "#resultados") irPestana("vista-res");

  /* ---------- navegación entre pantallas ---------- */
  function mostrar(id) {
    document.querySelectorAll("#vista-exp > section").forEach((s) => s.classList.add("oculto"));
    $(id).classList.remove("oculto");
    window.scrollTo(0, 0);
  }
  function bloquearAtras() {
    history.pushState({ paso: 1 }, "", location.href);
    window.addEventListener("popstate", () => history.pushState({ paso: 1 }, "", location.href));
  }
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  const params = new URLSearchParams(location.search);
  if (params.get("reset") === "1") store.del(CLAVE_ESTADO);
  if (store.get(CLAVE_ESTADO)) { mostrar("#p-repetido"); return; }

  document.addEventListener("visibilitychange", () => { if (document.hidden && D.empezado && !D.enviado) D.cambios_pestana++; });
  window.addEventListener("beforeunload", (e) => { if (D.empezado && !D.enviado) { e.preventDefault(); e.returnValue = ""; } });

  /* ================== 1. CONSENTIMIENTO ================== */
  $("#chk-edad").addEventListener("change", (e) => { $("#btn-acepto").disabled = !e.target.checked; });
  $("#btn-rechazo").addEventListener("click", () => mostrar("#p-rechazo"));
  $("#btn-acepto").addEventListener("click", () => {
    D.empezado = true;
    store.set(CLAVE_ESTADO, "iniciado");
    $("#pestanas").classList.add("oculto");     // durante la actividad no se puede ir a «Resultados»
    bloquearAtras();
    mostrar("#p-instr1");
  });

  /* ================== 2. TAREA 1 · CODIFICACIÓN ================== */
  function ordenPreguntas() {
    const P = C.PREGUNTAS.slice();
    if (C.ORDEN_PREGUNTAS !== "bloques") return P;
    // Nuevo sorteo dentro de cada bloque de 3 (aleatorización por bloques por participante)
    const out = [];
    for (let i = 0; i < P.length; i += 3) {
      const b = P.slice(i, i + 3);
      for (let j = b.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [b[j], b[k]] = [b[k], b[j]]; }
      out.push(...b);
    }
    return out;
  }
  const resaltar = (t) => t.replace(/«([^»]+)»/g, '<span class="pal">«$1»</span>');

  let cola = [], actual = null, tPres = 0, esperandoResp = false;
  $("#btn-empezar1").addEventListener("click", async () => {
    cola = ordenPreguntas();
    D.orden_preguntas = cola.map((p) => p.id).join("|");
    mostrar("#p-tarea1");
    siguientePregunta();
  });

  async function siguientePregunta() {
    const n = D.t1.length;
    if (n >= cola.length) { mostrar("#p-instr2"); return; }
    $("#t1-pregunta").innerHTML = "&nbsp;";
    setBotones1(false);
    await esperar(C.PAUSA_ENTRE_PREGUNTAS_MS);
    actual = cola[n];
    $("#t1-contador").textContent = `Pregunta ${n + 1} de ${cola.length}`;
    $("#t1-barra").style.width = (100 * n / cola.length) + "%";
    $("#t1-pregunta").innerHTML = "<p>" + resaltar(actual.texto) + "</p>";
    tPres = performance.now();
    setBotones1(true);
  }
  function setBotones1(on) {
    esperandoResp = on;
    document.querySelectorAll("#t1-botones button").forEach((b) => b.disabled = !on);
  }
  function responder1(r) {
    if (!esperandoResp || !actual) return;
    setBotones1(false);
    D.t1.push({ id: actual.id, resp: r, ok: r === actual.correcta ? 1 : 0, tr: Math.round(performance.now() - tPres), pos: D.t1.length + 1 });
    siguientePregunta();
  }
  document.querySelectorAll("#t1-botones button").forEach((b) => b.addEventListener("click", () => responder1(b.dataset.r)));
  document.addEventListener("keydown", (e) => {
    if ($("#p-tarea1").classList.contains("oculto")) return;
    const k = e.key.toLowerCase();
    if (k === "s") responder1("Sí"); else if (k === "n") responder1("No");
  });

  /* ================== 3. TAREA 2 · DISTRACTORA ================== */
  const T2 = C.DISTRACTORA;
  let esperado = T2.desde - T2.paso, t2Inicio = 0, t2Timer = null;
  $("#btn-empezar2").addEventListener("click", () => {
    D.t2 = { correctos: 0, errores: 0, completada: 0 };
    mostrar("#p-tarea2");
    $("#t2-input").focus();
    t2Inicio = Date.now();
    t2Timer = setInterval(() => {
      const f = Math.min(1, (Date.now() - t2Inicio) / (T2.tiempo_max_s * 1000));
      $("#t2-barra").style.width = (f * 100) + "%";
      if (f >= 1) finTarea2();
    }, 250);
  });
  $("#t2-input").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, "").slice(0, 2); });
  $("#t2-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = $("#t2-input"), v = parseInt(inp.value, 10);
    if (isNaN(v)) return;
    if (v === esperado) {
      D.t2.correctos++;
      $("#t2-ultimo").textContent = v; $("#t2-aviso").textContent = "";
      esperado -= T2.paso;
      if (esperado < T2.hasta) { D.t2.completada = 1; finTarea2(); return; }
    } else {
      D.t2.errores++;
      $("#t2-aviso").textContent = "Ese no es el número correcto. Inténtalo de nuevo.";
    }
    inp.value = ""; inp.focus();
  });
  function finTarea2() {
    if (t2Timer === null) return;
    clearInterval(t2Timer); t2Timer = null;
    D.t2.tiempo_s = Math.round((Date.now() - t2Inicio) / 1000);
    construirReconocimiento();
    mostrar("#p-tarea3");
  }

  /* ================== 4. TAREA 3 · RECONOCIMIENTO ================== */
  function construirReconocimiento() {
    const r = $("#t3-rejilla"); r.innerHTML = "";
    D.t3Inicio = performance.now();
    C.RECONOCIMIENTO.forEach((w) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = w; b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => {
        const k = norm(w);
        if (D.marcadas.has(k)) D.marcadas.delete(k); else D.marcadas.add(k);
        b.classList.toggle("marcada", D.marcadas.has(k));
        b.setAttribute("aria-pressed", D.marcadas.has(k));
        $("#t3-cuenta").textContent = "Palabras marcadas: " + D.marcadas.size;
      });
      r.appendChild(b);
    });
  }
  $("#btn-fin3").addEventListener("click", () => {
    if (D.marcadas.size === 0 && !confirm("No has marcado ninguna palabra. ¿Seguro que has terminado?")) return;
    D.t3_tiempo_s = Math.round((performance.now() - D.t3Inicio) / 1000);
    construirFinales();
    mostrar("#p-finales");
  });

  /* ================== 5. PREGUNTAS FINALES ================== */
  function htmlOpciones(nombre, valores, fila) {
    return `<div class="opciones ${fila ? "fila" : ""}">` + valores.map((v) =>
      `<label class="opcion"><input type="radio" name="${nombre}" value="${String(v).replace(/"/g, "&quot;")}"><span>${v}</span></label>`).join("") + "</div>";
  }
  function construirFinales() {
    $("#form-finales").innerHTML = C.PREGUNTAS_FINALES.map((p, i) => {
      let campo = "";
      if (p.tipo === "numero") campo = `<input type="number" name="${p.id}" inputmode="numeric" min="${p.min}" max="${p.max}" step="1" autocomplete="off">`;
      else if (p.tipo === "opcion") campo = htmlOpciones(p.id, p.opciones, true);
      else if (p.tipo === "sino") campo = htmlOpciones(p.id, ["Sí", "No"], true);
      const aviso = p.tipo === "numero" ? `Escribe un número entero entre ${p.min} y ${p.max}.` : "Esta pregunta es obligatoria.";
      return `<div class="pregunta" data-id="${p.id}"><div class="enunciado"><span class="num">${i + 1}.</span> ${p.texto}</div>${campo}<div class="aviso">${aviso}</div></div>`;
    }).join("");
  }
  function leerFinales() {
    const f = $("#form-finales"), res = {}; let primero = null;
    C.PREGUNTAS_FINALES.forEach((p) => {
      const bloque = f.querySelector(`[data-id="${p.id}"]`); let v = null, ok = true;
      if (p.tipo === "numero") {
        const n = parseInt(f.querySelector(`[name="${p.id}"]`).value, 10);
        if (isNaN(n) || n < p.min || n > p.max) ok = false; else v = n;
      } else {
        const r = f.querySelector(`[name="${p.id}"]:checked`);
        if (!r) ok = false; else v = r.value;
      }
      bloque.classList.toggle("falta", !ok);
      if (!ok && !primero) primero = bloque;
      res[p.id] = v;
    });
    if (primero) { primero.scrollIntoView({ behavior: "smooth", block: "center" }); return null; }
    return res;
  }

  /* ================== 6. CODIFICACIÓN Y ENVÍO ================== */
  function codificar() {
    const fila = {
      id: D.id, cohorte: D.cohorte,
      fecha_inicio: D.fecha_inicio, fecha_fin: new Date().toISOString(),
      duracion_s: Math.round((Date.now() - new Date(D.fecha_inicio).getTime()) / 1000),
      movil: D.movil, pantalla: D.pantalla, cambios_pestana: D.cambios_pestana,
      orden_preguntas: D.orden_preguntas
    };
    // VD: proporción de aciertos de reconocimiento por nivel
    const estudiadas = {};
    C.PREGUNTAS.forEach((p) => { estudiadas[sinTilde(p.palabra)] = p; });
    const marcadas = new Set([...D.marcadas].map(sinTilde));
    C.NIVELES.forEach((nv) => {
      const ps = C.PREGUNTAS.filter((p) => p.nivel === nv.id);
      const ac = ps.filter((p) => marcadas.has(sinTilde(p.palabra))).length;
      fila["aciertos_" + nv.id] = ac;
      fila[nv.id] = Math.round(1000 * ac / ps.length) / 1000;   // proporción 0-1 (como en la hoja de clase)
    });
    const nuevas = C.RECONOCIMIENTO.filter((w) => !estudiadas[sinTilde(w)]);
    const fa = nuevas.filter((w) => marcadas.has(sinTilde(w))).length;
    fila.falsas_alarmas = fa;
    fila.p_falsas_alarmas = Math.round(1000 * fa / nuevas.length) / 1000;
    fila.n_marcadas = D.marcadas.size;
    // Tarea 1: respuesta, acierto y tiempo de cada pregunta + si la palabra se reconoció
    const porId = {}; D.t1.forEach((r) => porId[r.id] = r);
    let okOri = 0, trs = [];
    C.PREGUNTAS.forEach((p) => {
      const r = porId[p.id] || {};
      fila[p.id + "_resp"] = r.resp ?? ""; fila[p.id + "_ok"] = r.ok ?? ""; fila[p.id + "_tr_ms"] = r.tr ?? "";
      fila[p.id + "_rec"] = marcadas.has(sinTilde(p.palabra)) ? 1 : 0;
      okOri += r.ok || 0; if (r.tr) trs.push(r.tr);
    });
    fila.t1_aciertos_orientacion = okOri;
    fila.t1_tr_medio_ms = trs.length ? Math.round(trs.reduce((a, b) => a + b, 0) / trs.length) : "";
    fila.t2_correctos = D.t2.correctos; fila.t2_errores = D.t2.errores;
    fila.t2_completada = D.t2.completada; fila.t2_tiempo_s = D.t2.tiempo_s;
    fila.t3_tiempo_s = D.t3_tiempo_s;
    Object.assign(fila, D.finales);
    return fila;
  }

  $("#btn-enviar").addEventListener("click", async () => {
    const r = leerFinales();
    if (!r) return;
    D.finales = r;
    $("#btn-enviar").disabled = true;
    const fila = codificar();
    D.enviado = true;
    store.set(CLAVE_ESTADO, "completado");
    try { const prev = JSON.parse(store.get(CLAVE_LOCAL) || "[]"); prev.push(fila); store.set(CLAVE_LOCAL, JSON.stringify(prev)); } catch (e) { }

    mostrar("#p-fin");
    $("#codigo").textContent = D.id;
    $("#mis-resultados").innerHTML = C.NIVELES.map((nv) =>
      `<div><b>${String(fila[nv.id].toFixed(2)).replace(".", ",")}</b><span>${nv.nombre} · ${fila["aciertos_" + nv.id]} de 6</span></div>`).join("");
    if (!C.ENDPOINT) { $("#estado-envio").textContent = "Modo de prueba: respuestas guardadas solo en este navegador."; return; }
    try {
      await fetch(C.ENDPOINT, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ accion: "guardar", fila }) });
      $("#estado-envio").textContent = "Respuestas enviadas correctamente.";
    } catch (e) {
      $("#estado-envio").textContent = "No se ha podido enviar (sin conexión). Avisa al profesor e indícale tu código.";
    }
  });
})();
