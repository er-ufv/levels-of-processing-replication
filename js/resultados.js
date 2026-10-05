/* =====================================================================
   PESTAÑA «RESULTADOS» (lo que proyecta el profesor)
   Lee las filas (Google Sheets, datos simulados o este navegador),
   aplica filtros de exclusión y reproduce los análisis de JASP:
   descriptivos (opcionalmente por sexo), gráficos descriptivo, raincloud
   y de violín, Mauchly, ANOVA de medidas repetidas con corrección,
   post hoc (Bonferroni/Holm), Friedman + Conover y redacción APA.
   ===================================================================== */
(function () {
  "use strict";
  const C = window.CONFIG, E = window.EST;
  const $ = (s) => document.querySelector(s);
  const NIV = C.NIVELES.map((n) => n.id);
  const NOMBRE = Object.fromEntries(C.NIVELES.map((n) => [n.id, n.nombre]));
  const COL = { superficial: "#8C97AE", intermedio: "#0047E8", profundo: "#FF9606" };
  const COL_SEXO = { Mujer: "#0047E8", Hombre: "#FF9606", Otro: "#0A8F7B", "Prefiero no decirlo": "#8C97AE" };
  let FILAS = [], timer = null, cargado = false;

  $("#cohorte").value = C.COHORTE;
  try { $("#clave").value = sessionStorage.getItem("clave_res") || ""; } catch (e) { }

  /* ---------- formato: punto decimal, como en la salida de JASP ---------- */
  const fmt = (x, d = 3) => (x === null || x === undefined || !isFinite(x)) ? "–" : Number(x).toFixed(d);
  const fmtP = (p) => !isFinite(p) ? "–" : p < 0.001 ? "< .001" : fmt(p, 3);
  const apaN = (x, d = 2) => Number(x).toFixed(d);
  const apaD = (x, d = 3) => Number(x).toFixed(d).replace(/^(-?)0\./, "$1.");   // sin cero inicial (p, ε, W, ω²)
  const apaP = (p) => p < 0.001 ? "< .001" : "= " + apaD(p, 3);
  const num = (v) => (v === "" || v === null || v === undefined) ? NaN : Number(String(v).replace(",", "."));
  const estado = (t) => { $("#estado").textContent = t; };

  /* ---------- fuentes de datos ---------- */
  async function cargarServidor() {
    if (!C.ENDPOINT) { estado("No hay ENDPOINT en js/config.js: usa «Datos simulados» o «Datos de este navegador»."); return; }
    const clave = $("#clave").value.trim();
    try { sessionStorage.setItem("clave_res", clave); } catch (e) { }
    estado("Cargando…");
    try {
      const r = await fetch(`${C.ENDPOINT}?accion=datos&clave=${encodeURIComponent(clave)}&cohorte=${encodeURIComponent($("#cohorte").value.trim())}`);
      const j = await r.json();
      if (j.error) { estado("Error: " + j.error); return; }
      FILAS = j.filas; estado(`Datos de la hoja · ${FILAS.length} filas · ${new Date().toLocaleTimeString()}`); pintar();
    } catch (e) { estado("No se pudo conectar con la hoja de datos."); }
  }
  function cargarLocal() {
    try { FILAS = JSON.parse(localStorage.getItem("niveles_datos_local") || "[]"); } catch (e) { FILAS = []; }
    estado(`${FILAS.length} respuestas guardadas en este navegador (modo prueba).`); pintar();
  }
  function simular() {
    // 30 participantes ficticios con un patrón parecido al de clase (profundo > intermedio ≈ superficial)
    const bin = (n, p) => { let s = 0; for (let i = 0; i < n; i++) s += Math.random() < p ? 1 : 0; return s; };
    const clamp = (x) => Math.max(0.02, Math.min(0.98, x));
    const filas = [];
    for (let i = 0; i < 30; i++) {
      const hab = (Math.random() - 0.5) * 0.3;
      const f = { id: "SIM-" + (i + 1), cohorte: "simulado", sexo: Math.random() < 0.68 ? "Mujer" : "Hombre",
        edad: 18 + Math.floor(Math.random() * 6), sospecha: Math.random() < 0.07 ? "Sí" : "No",
        conocia: Math.random() < 0.04 ? "Sí" : "No", condiciones: "Sí", cambios_pestana: Math.random() < 0.05 ? 1 : 0 };
      const p = { superficial: clamp(0.47 + hab), intermedio: clamp(0.5 + hab), profundo: clamp(0.8 + hab * 0.7) };
      NIV.forEach((nv) => {
        const ps = C.PREGUNTAS.filter((q) => q.nivel === nv);
        let ac = 0;
        ps.forEach((q) => { const r = Math.random() < p[nv] ? 1 : 0; f[q.id + "_rec"] = r; ac += r; });
        f["aciertos_" + nv] = ac; f[nv] = Math.round(1000 * ac / 6) / 1000;
      });
      f.falsas_alarmas = bin(18, 0.1 + Math.max(0, -hab) * 0.3); f.p_falsas_alarmas = Math.round(1000 * f.falsas_alarmas / 18) / 1000;
      filas.push(f);
    }
    FILAS = filas; estado("Datos SIMULADOS (no son reales)."); pintar();
  }

  /* ---------- filtros ---------- */
  function completos(f) { return NIV.every((nv) => isFinite(num(f[nv]))); }
  function filtrar() {
    return FILAS.filter((f) => {
      if (!completos(f)) return false;
      if ($("#f-sospecha").checked && f.sospecha === "Sí") return false;
      if ($("#f-conocia").checked && f.conocia === "Sí") return false;
      if ($("#f-condiciones").checked && f.condiciones === "No") return false;
      if ($("#f-pestana").checked && num(f.cambios_pestana) > 0) return false;
      return true;
    });
  }

  /* ---------- SVG y tooltip ---------- */
  const tip = $("#tip");
  function conTip(el, html) {
    el.addEventListener("mousemove", (e) => { tip.innerHTML = html; tip.style.display = "block"; tip.style.left = (e.clientX + 14) + "px"; tip.style.top = (e.clientY + 14) + "px"; });
    el.addEventListener("mouseleave", () => { tip.style.display = "none"; });
  }
  const NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, padre) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (padre) padre.appendChild(e); return e; }
  function texto(padre, x, y, t, extra = {}) { const e = el("text", Object.assign({ x, y }, extra), padre); e.textContent = t; return e; }
  function ejeY(svg, x0, x1, yEsc, min, max, paso, titulo, H) {
    for (let v = min; v <= max + 1e-9; v += paso) {
      const y = yEsc(v);
      el("line", { x1: x0, x2: x1, y1: y, y2: y, stroke: "#E3E8F4", "stroke-width": 1 }, svg);
      texto(svg, x0 - 6, y + 4, fmt(v, paso < 0.1 ? 2 : 1), { "text-anchor": "end" });
    }
    if (titulo) texto(svg, 14, H / 2, titulo, { transform: `rotate(-90 14 ${H / 2})`, "text-anchor": "middle" });
  }
  const jit = (i) => (((i * 7919) % 97) / 97 - 0.5);   // jitter determinista

  /* ----- Gráfico 1: medias con IC 95 % ----- */
  function graficoDescriptivo(X) {
    const W = 560, H = 320, m = { l: 62, r: 20, t: 18, b: 44 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Medias e intervalos de confianza por nivel" });
    const d = NIV.map((_, j) => E.descriptivos(X.map((r) => r[j])));
    const lo = Math.max(0, Math.floor((Math.min(...d.map((x) => x.li)) - 0.05) * 10) / 10);
    const hi = Math.min(1, Math.ceil((Math.max(...d.map((x) => x.ls)) + 0.05) * 10) / 10);
    const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo));
    ejeY(svg, m.l, W - m.r, y, lo, hi, 0.1, "Proporción reconocida", H);
    const x = (j) => m.l + (W - m.l - m.r) * (j + 0.5) / NIV.length;
    el("polyline", { points: d.map((s, j) => `${x(j)},${y(s.media)}`).join(" "), fill: "none", stroke: "#001447", "stroke-width": 2 }, svg);
    d.forEach((s, j) => {
      el("line", { x1: x(j), x2: x(j), y1: y(s.li), y2: y(s.ls), stroke: "#001447", "stroke-width": 2 }, svg);
      [s.li, s.ls].forEach((v) => el("line", { x1: x(j) - 10, x2: x(j) + 10, y1: y(v), y2: y(v), stroke: "#001447", "stroke-width": 2 }, svg));
      const c = el("circle", { cx: x(j), cy: y(s.media), r: 8, fill: COL[NIV[j]], stroke: "#fff", "stroke-width": 2 }, svg);
      texto(svg, x(j) + 14, y(s.media) - 8, fmt(s.media, 2), { "font-weight": 700, fill: "#001447" });
      texto(svg, x(j), H - m.b + 20, NOMBRE[NIV[j]], { "text-anchor": "middle", "font-weight": 600 });
      const hit = el("rect", { x: x(j) - 40, y: m.t, width: 80, height: H - m.t - m.b, fill: "transparent" }, svg);
      conTip(hit, `<b>${NOMBRE[NIV[j]]}</b><br>Media ${fmt(s.media)}<br>IC 95 %: [${fmt(s.li)}, ${fmt(s.ls)}]<br>n = ${s.n}`);
    });
    return svg;
  }

  /* ----- Gráfico 2: raincloud (líneas por persona + caja + densidad) ----- */
  function raincloud(X) {
    const W = 560, H = 320, m = { l: 62, r: 16, t: 14, b: 44 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Puntuaciones individuales por nivel" });
    const lo = -0.1, hi = 1.1;
    const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo));
    ejeY(svg, m.l, W - m.r, y, 0, 1, 0.25, "Proporción reconocida", H);
    const banda = (W - m.l - m.r) / NIV.length;
    const xp = (j, i) => m.l + banda * j + banda * 0.18 + jit(i) * banda * 0.12;
    X.forEach((r, i) => el("polyline", { points: r.map((v, j) => `${xp(j, i)},${y(v)}`).join(" "), fill: "none", stroke: "#B9C1D3", "stroke-width": 1, "stroke-opacity": .7 }, svg));
    NIV.forEach((nv, j) => {
      const xs = X.map((r) => r[j]), s = E.descriptivos(xs);
      X.forEach((r, i) => { const c = el("circle", { cx: xp(j, i), cy: y(r[j]), r: 4, fill: COL[nv], "fill-opacity": .85, stroke: "#fff", "stroke-width": 1 }, svg); });
      const bx = m.l + banda * j + banda * 0.42, bw = banda * 0.12;
      el("line", { x1: bx + bw / 2, x2: bx + bw / 2, y1: y(s.min), y2: y(s.max), stroke: "#43506B", "stroke-width": 1.5 }, svg);
      el("rect", { x: bx, y: y(s.q3), width: bw, height: Math.max(1, y(s.q1) - y(s.q3)), fill: COL[nv], stroke: "#001447", "stroke-width": 1.2, rx: 2 }, svg);
      el("line", { x1: bx, x2: bx + bw, y1: y(s.mediana), y2: y(s.mediana), stroke: "#001447", "stroke-width": 2.5 }, svg);
      const dens = E.kde(xs, -0.1, 1.1), maxD = Math.max(...dens.map((p) => p[1]), 1e-9), x0 = m.l + banda * j + banda * 0.6;
      if (dens.length) el("path", { d: `M${x0},${y(dens[0][0])}` + dens.map((p) => `L${x0 + banda * 0.36 * p[1] / maxD},${y(p[0])}`).join("") + `L${x0},${y(dens[dens.length - 1][0])}Z`,
        fill: COL[nv], "fill-opacity": .35, stroke: COL[nv], "stroke-width": 1 }, svg);
      texto(svg, m.l + banda * (j + 0.5), H - m.b + 20, NOMBRE[nv], { "text-anchor": "middle", "font-weight": 600 });
      const hit = el("rect", { x: m.l + banda * j, y: m.t, width: banda, height: H - m.t - m.b, fill: "transparent" }, svg);
      conTip(hit, `<b>${NOMBRE[nv]}</b><br>Mediana ${fmt(s.mediana, 2)} · Q1 ${fmt(s.q1, 2)} · Q3 ${fmt(s.q3, 2)}<br>Mín ${fmt(s.min, 2)} · Máx ${fmt(s.max, 2)}`);
    });
    return svg;
  }

  /* ----- Gráfico 3: violín + caja + puntos (opcionalmente por sexo) ----- */
  function violines(F, porSexo) {
    const W = 1100, H = 320, m = { l: 62, r: 16, t: 14, b: 44 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Distribución por nivel" });
    const lo = -0.2, hi = 1.2;
    const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo));
    ejeY(svg, m.l, W - m.r, y, 0, 1, 0.25, "Proporción reconocida", H);
    const grupos = porSexo ? [...new Set(F.map((f) => f.sexo || "Sin dato"))].sort((a, b) => (a === "Mujer" ? -1 : b === "Mujer" ? 1 : a.localeCompare(b))) : [null];
    const banda = (W - m.l - m.r) / NIV.length, sb = banda / grupos.length;
    NIV.forEach((nv, j) => {
      grupos.forEach((g, gi) => {
        const xs = F.filter((f) => g === null || (f.sexo || "Sin dato") === g).map((f) => num(f[nv]));
        const cx = m.l + banda * j + sb * (gi + 0.5), color = g === null ? COL[nv] : (COL_SEXO[g] || "#5A6472");
        if (xs.length >= 2) {
          const dens = E.kde(xs, -0.2, 1.2), maxD = Math.max(...dens.map((p) => p[1]), 1e-9), half = Math.min(70, sb * 0.42);
          const der = dens.map((p) => `${cx + half * p[1] / maxD},${y(p[0])}`), izq = dens.slice().reverse().map((p) => `${cx - half * p[1] / maxD},${y(p[0])}`);
          el("polygon", { points: der.concat(izq).join(" "), fill: color, "fill-opacity": .22, stroke: color, "stroke-width": 1.2 }, svg);
          const s = E.descriptivos(xs);
          el("rect", { x: cx - 9, y: y(s.q3), width: 18, height: Math.max(1, y(s.q1) - y(s.q3)), fill: "#fff", stroke: "#001447", "stroke-width": 1.2 }, svg);
          el("line", { x1: cx - 9, x2: cx + 9, y1: y(s.mediana), y2: y(s.mediana), stroke: "#001447", "stroke-width": 2.5 }, svg);
          const hit = el("rect", { x: cx - sb / 2, y: m.t, width: sb, height: H - m.t - m.b, fill: "transparent" }, svg);
          conTip(hit, `<b>${NOMBRE[nv]}${g ? " · " + g : ""}</b><br>n = ${s.n} · Media ${fmt(s.media)} · DT ${fmt(s.de)}<br>Mediana ${fmt(s.mediana, 2)}`);
        }
        xs.forEach((v, i) => el("circle", { cx: cx + jit(i + j * 31) * 26, cy: y(v), r: 3.5, fill: color, "fill-opacity": .8, stroke: "#fff", "stroke-width": 1 }, svg));
        if (porSexo) texto(svg, cx, H - m.b + 16, `${g} (${xs.length})`, { "text-anchor": "middle", "font-size": 11 });
      });
      texto(svg, m.l + banda * (j + 0.5), H - m.b + (porSexo ? 34 : 20), NOMBRE[nv], { "text-anchor": "middle", "font-weight": 700 });
      if (j > 0) el("line", { x1: m.l + banda * j, x2: m.l + banda * j, y1: m.t, y2: H - m.b, stroke: "#D6DCEA", "stroke-dasharray": "4 4" }, svg);
    });
    $("#ley-violin").innerHTML = porSexo ? grupos.map((g) => `<span><i style="background:${COL_SEXO[g] || "#5A6472"}"></i>${g}</span>`).join("") : "";
    return svg;
  }

  /* ----- Gráfico 4: falsas alarmas ----- */
  function graficoFA(fa) {
    const W = 560, H = 230, m = { l: 44, r: 10, t: 14, b: 40 }, MAX = 18;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Distribución de falsas alarmas" });
    const cuentas = Array(MAX + 1).fill(0); fa.forEach((v) => { if (v >= 0 && v <= MAX) cuentas[v]++; });
    const top = Math.max(2, ...cuentas);
    const y = (v) => m.t + (H - m.t - m.b) * (1 - v / top);
    const paso = top > 10 ? 5 : top > 4 ? 2 : 1;
    for (let v = 0; v <= top; v += paso) { el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: "#E3E8F4" }, svg); texto(svg, m.l - 6, y(v) + 4, v, { "text-anchor": "end" }); }
    const bw = (W - m.l - m.r) / (MAX + 1);
    cuentas.forEach((c, k) => {
      const x = m.l + k * bw + 3, h = y(0) - y(c);
      if (c) el("rect", { x, y: y(c), width: bw - 6, height: h, fill: "#001447", rx: 3 }, svg);
      texto(svg, x + (bw - 6) / 2, H - m.b + 16, k, { "text-anchor": "middle" });
      const hit = el("rect", { x, y: m.t, width: bw - 6, height: y(0) - m.t, fill: "transparent" }, svg);
      conTip(hit, `<b>${k} falsas alarmas</b><br>${c} participante(s)`);
    });
    texto(svg, W / 2, H - 6, "Número de palabras nuevas marcadas (0-18)", { "text-anchor": "middle" });
    return svg;
  }

  /* ---------- tablas ---------- */
  function tablaDescriptivos(F, porSexo) {
    const cols = [];
    NIV.forEach((nv) => {
      if (!porSexo) cols.push({ cab: NOMBRE[nv], xs: F.map((f) => num(f[nv])) });
      else [...new Set(F.map((f) => f.sexo || "Sin dato"))].sort().forEach((g) =>
        cols.push({ cab: `${NOMBRE[nv]}<br><small>${g}</small>`, xs: F.filter((f) => (f.sexo || "Sin dato") === g).map((f) => num(f[nv])) }));
    });
    const ds = cols.map((c) => E.descriptivos(c.xs));
    const filas = [["Válidos", (d) => d.n], ["Media", (d) => fmt(d.media)], ["Desviación típica", (d) => fmt(d.de)],
      ["Error típico", (d) => fmt(d.se)], ["Coef. de variación", (d) => fmt(d.cv)], ["Mediana", (d) => fmt(d.mediana)],
      ["Mínimo", (d) => fmt(d.min)], ["Máximo", (d) => fmt(d.max)], ["IC 95 % (inferior)", (d) => fmt(d.li)], ["IC 95 % (superior)", (d) => fmt(d.ls)]];
    return `<tr><th></th>${cols.map((c) => `<th>${c.cab}</th>`).join("")}</tr>` +
      filas.map(([n, f]) => `<tr><td>${n}</td>${ds.map((d) => `<td>${d.n ? f(d) : "–"}</td>`).join("")}</tr>`).join("");
  }

  function sig(p) { return p < .05 ? '<span class="sig">significativo</span>' : '<span class="nosig">no significativo</span>'; }

  /* ---------- pintar todo ---------- */
  function pintar() {
    const F = filtrar();
    const X = F.map((f) => NIV.map((nv) => num(f[nv])));
    const porSexo = $("#por-sexo").checked;
    $("#t-n").textContent = F.length;
    const medias = NIV.map((_, j) => X.length ? E.media(X.map((r) => r[j])) : NaN);
    ["#t-sup", "#t-int", "#t-prof"].forEach((s, j) => $(s).textContent = fmt(medias[j], 2));
    const excl = FILAS.filter(completos).length - F.length;
    $("#estado").dataset.excluidos = excl;

    $("#tab-desc").innerHTML = X.length ? tablaDescriptivos(F, porSexo) : "<tr><td>Sin datos.</td></tr>";
    const vacios = ["#g-desc", "#g-rain", "#g-violin", "#g-fa"];
    if (X.length < 3) {
      vacios.forEach((s) => $(s).innerHTML = "<p class='nota'>Se necesitan al menos 3 participantes con datos completos.</p>");
      ["#tab-mauchly", "#tab-anova", "#tab-entre", "#tab-posthoc", "#tab-friedman", "#tab-conover", "#tab-items"].forEach((s) => $(s).innerHTML = "");
      $("#interp").innerHTML = ""; $("#apa").innerHTML = "Aún no hay datos suficientes."; $("#interp-fa").innerHTML = "";
      crudos(); return;
    }
    $("#g-desc").replaceChildren(graficoDescriptivo(X));
    $("#g-rain").replaceChildren(raincloud(X));
    $("#g-violin").replaceChildren(violines(F, porSexo));
    $("#sub-violin").textContent = porSexo ? "Violín + caja + puntos de cada participante, separados por sexo" : "Violín + caja + puntos de cada participante";

    /* --- ANOVA MR --- */
    const a = E.anovaRM(X), M = a.esf;
    $("#tab-mauchly").innerHTML = `<tr><th></th><th>W de Mauchly</th><th><span class="gr">χ²</span> aprox.</th><th>gl</th><th>p</th><th><span class="gr">ε</span> Greenhouse-Geisser</th><th><span class="gr">ε</span> Huynh-Feldt</th><th>Límite inferior <span class="gr">ε</span></th></tr>
      <tr><td>Nivel de procesamiento</td><td>${fmt(M.W)}</td><td>${fmt(M.chi2)}</td><td>${M.gl}</td><td>${fmtP(M.p)}</td><td>${fmt(M.gg)}</td><td>${fmt(M.hf)}</td><td>${fmt(M.lb)}</td></tr>
      <tr class="nota-tabla"><td colspan="8">${M.p < .05 ? "La esfericidad <b>no se cumple</b> (p < .05): hay que usar una corrección (Greenhouse-Geisser si ε < .75; Huynh-Feldt si ε ≥ .75)." : "No se rechaza la esfericidad (p ≥ .05). Aun así, JASP suele informar la corrección de Greenhouse-Geisser, que es conservadora."}</td></tr>`;
    const sel = $("#correccion").value;
    const lista = sel === "all" ? [a.ninguna, a.gg, a.hf] : [{ none: a.ninguna, gg: a.gg, hf: a.hf }[sel]];
    $("#tab-anova").innerHTML = `<tr><th>Casos</th><th>Corrección de esfericidad</th><th>Suma de cuadrados</th><th>gl</th><th>Media cuadrática</th><th>F</th><th>p</th><th><span class="gr">ω²</span></th><th><span class="gr">η²</span> parcial</th></tr>` +
      lista.map((r) => `<tr class="destacada"><td>Nivel de procesamiento</td><td class="izq">${r.nombre}</td><td>${fmt(r.ssC)}</td><td>${fmt(r.glC)}</td><td>${fmt(r.msC)}</td><td>${fmt(r.F)}</td><td>${fmtP(r.p)}</td><td>${fmt(a.omega2)}</td><td>${fmt(a.eta2p)}</td></tr>`).join("") +
      lista.map((r) => `<tr><td>Residuos</td><td class="izq">${r.nombre}</td><td>${fmt(r.ssE)}</td><td>${fmt(r.glE)}</td><td>${fmt(r.msE)}</td><td></td><td></td><td></td><td></td></tr>`).join("") +
      `<tr class="nota-tabla"><td colspan="9">Nota. Suma de cuadrados tipo III.</td></tr>`;
    $("#tab-entre").innerHTML = `<tr><th>Casos</th><th>Suma de cuadrados</th><th>gl</th><th>Media cuadrática</th></tr>
      <tr><td>Residuos (diferencias entre personas)</td><td>${fmt(a.ssSuj)}</td><td>${a.glS}</td><td>${fmt(a.msS)}</td></tr>
      <tr class="nota-tabla"><td colspan="4">Esta variabilidad (${fmt(100 * a.ssSuj / a.ssTot, 1)} % del total) se debe a que unas personas recuerdan más que otras.
        En un diseño con grupos distintos formaría parte del error; aquí se separa, y por eso el diseño intrasujeto es más potente.</td></tr>`;

    const ph = E.posthocRM(X, NIV.map((n) => NOMBRE[n]));
    $("#tab-posthoc").innerHTML = `<tr><th>Comparación</th><th>Diferencia de medias</th><th>IC 95 % inf.</th><th>IC 95 % sup.</th><th>ET</th><th>t</th><th>gl</th><th>d de Cohen</th><th>p Bonferroni</th><th>p Holm</th></tr>` +
      ph.map((f) => `<tr${f.pBonf < .05 ? ' class="destacada"' : ""}><td>${f.a} – ${f.b}</td><td>${fmt(f.dif)}</td><td>${fmt(f.li)}</td><td>${fmt(f.ls)}</td><td>${fmt(f.se)}</td><td>${fmt(f.t)}</td><td>${f.gl}</td><td>${fmt(f.d)}</td><td>${fmtP(f.pBonf)}${f.pBonf < .001 ? " ***" : f.pBonf < .01 ? " **" : f.pBonf < .05 ? " *" : ""}</td><td>${fmtP(f.pHolm)}</td></tr>`).join("") +
      `<tr class="nota-tabla"><td colspan="10">Nota. IC ajustados por Bonferroni para 3 comparaciones. * p < .05 · ** p < .01 · *** p < .001</td></tr>`;

    const R = sel === "all" ? a.gg : lista[0];
    const sigs = ph.filter((f) => f.pBonf < .05).map((f) => `${f.a.toLowerCase()} y ${f.b.toLowerCase()}`);
    const nos = ph.filter((f) => f.pBonf >= .05).map((f) => `${f.a.toLowerCase()} y ${f.b.toLowerCase()}`);
    const orden = NIV.map((n, j) => [NOMBRE[n], medias[j]]).sort((p, q) => q[1] - p[1]);
    $("#interp").innerHTML = `El efecto del nivel de procesamiento es ${sig(R.p)} (F = ${fmt(R.F, 2)}, p ${R.p < .001 ? "< .001" : "= " + fmtP(R.p)}, ω² = ${fmt(a.omega2, 2)}).
      La media más alta corresponde al nivel <b>${orden[0][0].toLowerCase()}</b> (${fmt(orden[0][1], 2)}) y la más baja al <b>${orden[2][0].toLowerCase()}</b> (${fmt(orden[2][1], 2)}).
      ${sigs.length ? `Difieren significativamente: ${sigs.join("; ")}.` : "Ninguna comparación por pares es significativa."}
      ${nos.length ? `No difieren: ${nos.join("; ")}.` : ""}
      <br><span class="nota">Hipótesis (a mayor profundidad, mayor recuerdo): ${medias[2] > medias[1] && medias[1] > medias[0] ? "el orden de las medias coincide con la predicción" : "el orden de las medias no coincide del todo con la predicción"}.
      ω² ≈ .01 pequeño · .06 mediano · .14 grande.</span>`;

    /* --- Friedman --- */
    const fr = E.friedman(X, NIV.map((n) => NOMBRE[n]));
    $("#tab-friedman").innerHTML = `<tr><th>Factor</th><th><span class="gr">χ²</span></th><th>gl</th><th>p</th><th>W de Kendall</th></tr>
      <tr><td>Nivel de procesamiento</td><td>${fmt(fr.chi2)}</td><td>${fr.gl}</td><td>${fmtP(fr.p)}</td><td>${fmt(fr.W)}</td></tr>
      <tr class="nota-tabla"><td colspan="5">Compara los rangos de cada persona (1.º, 2.º, 3.º) en lugar de las puntuaciones: no supone normalidad. χ² corregido por empates.</td></tr>`;
    $("#tab-conover").innerHTML = `<tr><th>Comparación</th><th>T</th><th>gl</th><th>W<sub>i</sub></th><th>W<sub>j</sub></th><th>p</th><th>p Bonferroni</th><th>p Holm</th></tr>` +
      fr.conover.map((f) => `<tr${f.pBonf < .05 ? ' class="destacada"' : ""}><td>${f.a} – ${f.b}</td><td>${fmt(f.t)}</td><td>${f.gl}</td><td>${fmt(f.Wi, 1)}</td><td>${fmt(f.Wj, 1)}</td><td>${fmtP(f.p)}</td><td>${fmtP(f.pBonf)}</td><td>${fmtP(f.pHolm)}</td></tr>`).join("") +
      `<tr class="nota-tabla"><td colspan="8">W = suma de rangos de cada nivel. Conover (1999).</td></tr>`;

    /* --- APA --- */
    const d3 = NIV.map((_, j) => E.descriptivos(X.map((r) => r[j])));
    const corrTxt = R.nombre === "Ninguna" ? "" : ` con corrección de ${R.nombre} (ε = ${apaD(R.eps, 2)})`;
    const mauTxt = `La prueba de Mauchly ${M.p < .05 ? "indicó que no se cumplía" : "no indicó violación de"} la esfericidad, <i>W</i> = ${apaD(M.W, 2)}, χ²(${M.gl}) = ${apaN(M.chi2)}, <i>p</i> ${apaP(M.p)}.`;
    const phTxt = ph.map((f) => `${f.a.toLowerCase()} frente a ${f.b.toLowerCase()}: <i>p</i> ${apaP(f.pBonf)}, <i>d</i> = ${apaN(f.d)}`).join("; ");
    $("#apa").innerHTML = `${mauTxt} Un ANOVA de medidas repetidas${corrTxt} mostró que el efecto del nivel de procesamiento sobre la proporción de palabras reconocidas
      ${R.p < .05 ? "fue" : "no fue"} estadísticamente significativo, <i>F</i>(${apaN(R.glC)}, ${apaN(R.glE)}) = ${apaN(R.F)}, <i>p</i> ${apaP(R.p)}, ω² = ${apaD(a.omega2, 2)}.
      Las medias fueron: superficial <i>M</i> = ${apaN(d3[0].media)} (<i>DT</i> = ${apaN(d3[0].de)}), intermedio <i>M</i> = ${apaN(d3[1].media)} (<i>DT</i> = ${apaN(d3[1].de)})
      y profundo <i>M</i> = ${apaN(d3[2].media)} (<i>DT</i> = ${apaN(d3[2].de)}). Comparaciones post hoc con corrección de Bonferroni: ${phTxt}.
      La prueba de Friedman ${fr.p < .05 ? "confirmó" : "no confirmó"} el resultado, χ²(${fr.gl}, <i>N</i> = ${X.length}) = ${apaN(fr.chi2)}, <i>p</i> ${apaP(fr.p)}, <i>W</i> de Kendall = ${apaD(fr.W, 2)}.`;

    /* --- Falsas alarmas --- */
    const fa = F.map((f) => num(f.falsas_alarmas)).filter((v) => isFinite(v));
    if (fa.length) {
      $("#g-fa").replaceChildren(graficoFA(fa));
      const pfa = E.media(fa) / 18;
      $("#interp-fa").innerHTML = `Tasa media de falsas alarmas: <b>${fmt(100 * pfa, 1)} %</b>. Reconocimiento corregido (aciertos − falsas alarmas):
        superficial ${fmt(medias[0] - pfa, 2)} · intermedio ${fmt(medias[1] - pfa, 2)} · profundo ${fmt(medias[2] - pfa, 2)}.
        <br><span class="nota">Si alguien marcara las 36 palabras tendría un 100 % de aciertos… y un 100 % de falsas alarmas. Por eso conviene mirar ambas cosas.</span>`;
    } else { $("#g-fa").innerHTML = "<p class='nota'>Sin datos de falsas alarmas.</p>"; $("#interp-fa").innerHTML = ""; }

    /* --- Por palabra --- */
    const filasIt = C.PREGUNTAS.map((p) => {
      const v = F.map((f) => num(f[p.id + "_rec"])).filter((x) => isFinite(x));
      return { p, pct: v.length ? 100 * E.media(v) : NaN };
    });
    const porResp = (r) => { const v = filasIt.filter((x) => x.p.correcta === r && isFinite(x.pct)).map((x) => x.pct); return v.length ? E.media(v) : NaN; };
    $("#tab-items").innerHTML = `<tr><th>Palabra</th><th>Nivel</th><th>Respuesta correcta</th><th>% reconocida</th></tr>` +
      filasIt.slice().sort((a, b) => NIV.indexOf(a.p.nivel) - NIV.indexOf(b.p.nivel) || b.pct - a.pct).map((x) =>
        `<tr><td>${x.p.palabra}</td><td class="izq"><b style="color:${COL[x.p.nivel]}">■</b> ${NOMBRE[x.p.nivel]}</td><td>${x.p.correcta}</td><td>${fmt(x.pct, 0)}</td></tr>`).join("") +
      `<tr class="nota-tabla"><td colspan="4">Media de palabras con respuesta «Sí»: <b>${fmt(porResp("Sí"), 0)} %</b> · con respuesta «No»: <b>${fmt(porResp("No"), 0)} %</b>.
        Craik y Tulving (1975) observaron que las palabras con respuesta «sí» se recordaban mejor (efecto de congruencia).</td></tr>`;
    crudos();
  }

  function crudos() {
    const cols = [...new Set(FILAS.flatMap((f) => Object.keys(f)))];
    $("#crudos").innerHTML = FILAS.length ? `<table class="tabla"><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>${FILAS.map((f) => `<tr>${cols.map((c) => `<td>${f[c] ?? ""}</td>`).join("")}</tr>`).join("")}</table>` : "<p class='nota'>Sin datos.</p>";
  }

  /* CSV en formato ancho, listo para abrir en JASP (coma como separador, punto decimal) */
  function csv() {
    const F = filtrar();
    if (!F.length) { estado("No hay datos que exportar."); return; }
    const cols = ["id", "sexo", "edad", ...NIV.map((n) => "Procesamiento " + NOMBRE[n]), "falsas_alarmas"];
    const q = (v) => { const s = v === undefined || v === null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const txt = [cols.join(",")].concat(F.map((f) => [f.id, f.sexo, f.edad, ...NIV.map((n) => num(f[n])), f.falsas_alarmas].map(q).join(","))).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
    a.download = `niveles_procesamiento_${$("#cohorte").value || "datos"}.csv`; a.click();
  }

  $("#btn-cargar").addEventListener("click", cargarServidor);
  $("#btn-demo").addEventListener("click", simular);
  $("#btn-local").addEventListener("click", cargarLocal);
  $("#btn-csv").addEventListener("click", csv);
  ["#f-sospecha", "#f-conocia", "#f-condiciones", "#f-pestana", "#por-sexo", "#correccion"].forEach((s) => $(s).addEventListener("change", pintar));
  $("#auto").addEventListener("change", (e) => { clearInterval(timer); if (e.target.checked) { cargarServidor(); timer = setInterval(cargarServidor, 15000); } });
  document.addEventListener("abrir-resultados", () => { if (!cargado) { cargado = true; pintar(); } });
  pintar();
})();
