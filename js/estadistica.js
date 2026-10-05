/* =====================================================================
   FUNCIONES ESTADÍSTICAS (sin dependencias externas)
   Diseño con el mismo grupo (medidas repetidas), como en JASP:
   - Descriptivos: N, media, DT, error típico, coeficiente de variación
   - Prueba de esfericidad de Mauchly y ε de Greenhouse-Geisser y Huynh-Feldt
   - ANOVA de medidas repetidas (SC tipo III) con corrección GG / HF
     y tamaño del efecto ω² (y η² parcial)
   - Post hoc por pares con término de error agrupado, IC al 95 %
     ajustados por Bonferroni, d de Cohen, p de Bonferroni y de Holm
   - Prueba de Friedman, W de Kendall y post hoc de Conover
   - t de Student para muestras relacionadas (2 niveles)
   Verificado con SciPy / pingouin y con la salida de JASP 0.18.1.
   ===================================================================== */
window.EST = (function () {
  "use strict";
  const media = (x) => x.reduce((a, b) => a + b, 0) / x.length;
  const varianza = (x) => { const m = media(x); return x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1); };
  const de = (x) => Math.sqrt(varianza(x));
  const mediana = (x) => { const s = [...x].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const cuantil = (x, q) => { const s = [...x].sort((a, b) => a - b); const pos = (s.length - 1) * q, b = Math.floor(pos); return s[b] + ((s[b + 1] ?? s[b]) - s[b]) * (pos - b); };

  /* log-gamma (Lanczos) */
  function lnGamma(z) {
    const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
      12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    z -= 1; let x = 0.99999999999980993;
    for (let i = 0; i < 8; i++) x += g[i] / (z + i + 1);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  /* beta incompleta regularizada (fracción continua, Numerical Recipes) */
  function betacf(a, b, x) {
    const MAX = 300, EPS = 3e-12, FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= MAX; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function ibeta(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  /* p bilateral de la t de Student */
  const pT = (t, gl) => ibeta(gl / 2, 0.5, gl / (gl + t * t));
  /* normal estándar */
  function phi(z) { // CDF, Abramowitz-Stegun 7.1.26 vía erf
    const s = z < 0 ? -1 : 1, x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return 0.5 * (1 + s * y);
  }
  const pZ = (z) => 2 * (1 - phi(Math.abs(z)));
  /* p de chi-cuadrado con 1 gl */
  const pChi1 = (x2) => pZ(Math.sqrt(x2));

  function welch(a, b) {
    const n1 = a.length, n2 = b.length;
    if (n1 < 2 || n2 < 2) return null;
    const m1 = media(a), m2 = media(b), v1 = varianza(a), v2 = varianza(b);
    const se = Math.sqrt(v1 / n1 + v2 / n2);
    if (se === 0) return { t: 0, gl: n1 + n2 - 2, p: 1, d: 0, m1, m2 };
    const t = (m1 - m2) / se;
    const gl = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
    const sp = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
    return { t, gl, p: pT(t, gl), d: sp ? (m1 - m2) / sp : 0, m1, m2 };
  }

  function mannWhitney(a, b) {
    const n1 = a.length, n2 = b.length, N = n1 + n2;
    if (!n1 || !n2) return null;
    const todos = a.map((v) => ({ v, g: 1 })).concat(b.map((v) => ({ v, g: 2 }))).sort((x, y) => x.v - y.v);
    let i = 0, T = 0;
    while (i < N) {
      let j = i; while (j + 1 < N && todos[j + 1].v === todos[i].v) j++;
      const r = (i + j) / 2 + 1, k = j - i + 1;
      for (let q = i; q <= j; q++) todos[q].r = r;
      T += k ** 3 - k; i = j + 1;
    }
    const R1 = todos.filter((o) => o.g === 1).reduce((s, o) => s + o.r, 0);
    const U1 = R1 - n1 * (n1 + 1) / 2, U2 = n1 * n2 - U1, U = Math.min(U1, U2);
    const mu = n1 * n2 / 2;
    const sigma = Math.sqrt(n1 * n2 / 12 * ((N + 1) - T / (N * (N - 1))));
    const z = sigma ? (U1 - mu - Math.sign(U1 - mu) * 0.5) / sigma : 0;
    return { U, U1, z, p: sigma ? pZ(z) : 1, r: z / Math.sqrt(N) };
  }

  /* Tabla 2x2: a = aciertos G1, b = fallos G1, c = aciertos G2, d = fallos G2 */
  function chi2Yates(a, b, c, d) {
    const n = a + b + c + d, den = (a + b) * (c + d) * (a + c) * (b + d);
    if (!den) return null;
    const x2 = n * Math.max(0, Math.abs(a * d - b * c) - n / 2) ** 2 / den;
    return { x2, p: pChi1(x2) };
  }
  const lnFact = (n) => lnGamma(n + 1);
  function fisher(a, b, c, d) {
    const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
    const prob = (x) => Math.exp(lnFact(r1) + lnFact(r2) + lnFact(c1) + lnFact(n - c1) - lnFact(n) - lnFact(x) - lnFact(r1 - x) - lnFact(c1 - x) - lnFact(r2 - c1 + x));
    const p0 = prob(a); let p = 0;
    for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) { const px = prob(x); if (px <= p0 * (1 + 1e-7)) p += px; }
    return Math.min(1, p);
  }


  /* ---------- distribuciones adicionales ---------- */
  /* gamma incompleta regularizada P(a, x) */
  function gammaP(a, x) {
    if (x <= 0) return 0;
    if (x < a + 1) {             // serie
      let sum = 1 / a, del = sum, ap = a;
      for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
      return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
    }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;      // fracción continua
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  }
  const pChi = (x2, gl) => x2 <= 0 ? 1 : 1 - gammaP(gl / 2, x2 / 2);
  /* p de la F (cola derecha), admite gl no enteros (corrección GG/HF) */
  const pF = (F, d1, d2) => F <= 0 ? 1 : ibeta(d2 / 2, d1 / 2, d2 / (d2 + d1 * F));
  /* cuantil de la t de Student: valor t tal que P(|T| > t) = alfa */
  function tCrit(alfa, gl) {
    let lo = 0, hi = 1000;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (pT(m, gl) > alfa) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  /* ---------- álgebra mínima ---------- */
  function det(M) {
    const A = M.map((r) => r.slice()), n = A.length; let d = 1;
    for (let i = 0; i < n; i++) {
      let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      if (Math.abs(A[p][i]) < 1e-300) return 0;
      if (p !== i) { [A[p], A[i]] = [A[i], A[p]]; d = -d; }
      d *= A[i][i];
      for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; }
    }
    return d;
  }
  /* contrastes ortonormales de Helmert (k-1 filas x k columnas) */
  function helmert(k) {
    const H = [];
    for (let i = 1; i < k; i++) {
      const fila = Array(k).fill(0), s = Math.sqrt(i * (i + 1));
      for (let j = 0; j < i; j++) fila[j] = 1 / s;
      fila[i] = -i / s; H.push(fila);
    }
    return H;
  }
  function covarianza(X) {      // X: n x k  ->  k x k
    const n = X.length, k = X[0].length, m = Array(k).fill(0);
    X.forEach((r) => r.forEach((v, j) => m[j] += v / n));
    const S = Array.from({ length: k }, () => Array(k).fill(0));
    X.forEach((r) => { for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) S[a][b] += (r[a] - m[a]) * (r[b] - m[b]) / (n - 1); });
    return S;
  }

  /* ---------- descriptivos de una columna ---------- */
  function descriptivos(x) {
    const n = x.length;
    if (!n) return { n: 0 };
    const m = media(x), s = n > 1 ? de(x) : NaN, se = s / Math.sqrt(n);
    const tc = n > 1 ? tCrit(0.05, n - 1) : NaN;
    return { n, media: m, de: s, se, cv: s / m, mediana: mediana(x), min: Math.min(...x), max: Math.max(...x),
             q1: cuantil(x, 0.25), q3: cuantil(x, 0.75), li: m - tc * se, ls: m + tc * se };
  }

  /* ---------- esfericidad (Mauchly) ---------- */
  function mauchly(X) {
    const n = X.length, k = X[0].length, p = k - 1;
    const H = helmert(k), S = covarianza(X);
    // Sc = H S H'
    const HS = H.map((h) => S[0].map((_, j) => h.reduce((s, hv, a) => s + hv * S[a][j], 0)));
    const Sc = HS.map((r) => H.map((h) => r.reduce((s, v, a) => s + v * h[a], 0)));
    const tr = Sc.reduce((s, r, i) => s + r[i], 0);
    const tr2 = Sc.reduce((s, r, i) => s + r.reduce((t, v, j) => t + v * Sc[j][i], 0), 0);
    const W = p === 1 ? 1 : det(Sc) / Math.pow(tr / p, p);
    const gl = p * (p + 1) / 2 - 1;
    const chi2 = p === 1 ? 0 : -(n - 1 - (2 * p * p + p + 2) / (6 * p)) * Math.log(W);
    const gg = Math.min(1, (tr * tr) / (p * tr2));
    const hf = Math.min(1, (n * p * gg - 2) / (p * (n - 1 - p * gg)));
    return { W, chi2, gl, p: p === 1 ? NaN : pChi(chi2, gl), gg, hf, lb: 1 / p };
  }

  /* ---------- ANOVA de medidas repetidas (un factor) ---------- */
  function anovaRM(X) {
    const n = X.length, k = X[0].length;
    const gran = X.flat().reduce((a, b) => a + b, 0) / (n * k);
    const mCond = X[0].map((_, j) => X.reduce((s, r) => s + r[j], 0) / n);
    const mSuj = X.map((r) => r.reduce((a, b) => a + b, 0) / k);
    const ssTot = X.flat().reduce((s, v) => s + (v - gran) ** 2, 0);
    const ssCond = n * mCond.reduce((s, m) => s + (m - gran) ** 2, 0);
    const ssSuj = k * mSuj.reduce((s, m) => s + (m - gran) ** 2, 0);
    const ssErr = ssTot - ssCond - ssSuj;
    const glC = k - 1, glE = (n - 1) * (k - 1), glS = n - 1;
    const msC = ssCond / glC, msE = ssErr / glE, msS = ssSuj / glS;
    const F = msC / msE;
    const esf = mauchly(X);
    const fila = (eps, nombre) => ({ nombre, eps, ssC: ssCond, glC: glC * eps, msC: ssCond / (glC * eps),
      ssE: ssErr, glE: glE * eps, msE: ssErr / (glE * eps), F, p: pF(F, glC * eps, glE * eps) });
    const omega2 = Math.max(0, (glC * (msC - msE)) / (ssTot + msS));   // como JASP
    const eta2p = ssCond / (ssCond + ssErr);
    const eta2 = ssCond / ssTot;
    return { n, k, mCond, ssTot, ssCond, ssSuj, ssErr, glC, glE, glS, msC, msE, msS, F, omega2, eta2p, eta2, esf,
             ninguna: fila(1, "Ninguna"), gg: fila(esf.gg, "Greenhouse-Geisser"), hf: fila(esf.hf, "Huynh-Feldt") };
  }

  /* ---------- ajustes de p para comparaciones múltiples ---------- */
  function holm(ps) {
    const m = ps.length, ord = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), out = Array(m);
    let max = 0;
    ord.forEach(([p, i], r) => { max = Math.max(max, Math.min(1, (m - r) * p)); out[i] = max; });
    return out;
  }
  const bonf = (ps) => ps.map((p) => Math.min(1, p * ps.length));

  /* ---------- post hoc del ANOVA MR (término de error agrupado, como JASP) ---------- */
  function posthocRM(X, nombres) {
    const a = anovaRM(X), n = a.n, k = a.k;
    const se = Math.sqrt(2 * a.msE / n), gl = a.glE;
    const sdPool = Math.sqrt(X[0].map((_, j) => varianza(X.map((r) => r[j]))).reduce((s, v) => s + v, 0) / k);
    const pares = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) pares.push([i, j]);
    const tc = tCrit(0.05 / pares.length, gl);           // IC ajustado por Bonferroni
    const filas = pares.map(([i, j]) => {
      const dif = a.mCond[i] - a.mCond[j], t = dif / se;
      return { a: nombres[i], b: nombres[j], dif, li: dif - tc * se, ls: dif + tc * se, se, t, gl, d: dif / sdPool, p: pT(t, gl) };
    });
    const pb = bonf(filas.map((f) => f.p)), ph = holm(filas.map((f) => f.p));
    filas.forEach((f, i) => { f.pBonf = pb[i]; f.pHolm = ph[i]; });
    return filas;
  }

  /* ---------- t para muestras relacionadas (2 niveles) ---------- */
  function tRelacionadas(x, y) {
    const d = x.map((v, i) => v - y[i]), n = d.length;
    if (n < 2) return null;
    const md = media(d), sd = de(d), t = sd ? md / (sd / Math.sqrt(n)) : 0;
    return { t, gl: n - 1, p: pT(t, n - 1), dz: sd ? md / sd : 0, md };
  }

  /* ---------- rangos dentro de cada persona (empates = rango medio) ---------- */
  function rangosFila(r) {
    const idx = r.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]), out = Array(r.length);
    let i = 0;
    while (i < idx.length) {
      let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let q = i; q <= j; q++) out[idx[q][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return out;
  }

  /* ---------- Friedman + W de Kendall + Conover ---------- */
  function friedman(X, nombres) {
    const b = X.length, k = X[0].length;
    const R = X.map(rangosFila);
    const Rs = Array(k).fill(0); R.forEach((r) => r.forEach((v, j) => Rs[j] += v));
    const A1 = R.flat().reduce((s, v) => s + v * v, 0);
    const C1 = b * k * (k + 1) ** 2 / 4;
    const sumR2 = Rs.reduce((s, v) => s + v * v, 0);
    const chi2 = (A1 - C1) > 0 ? (k - 1) * (sumR2 - b * C1) / (A1 - C1) : 0;   // corrige empates
    const gl = k - 1, p = pChi(chi2, gl), W = chi2 / (b * (k - 1));
    // Conover (1999, p. 371)
    const glC = (b - 1) * (k - 1);
    const den = Math.sqrt(2 * (b * A1 - sumR2) / glC);
    const pares = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      const t = den ? Math.abs(Rs[i] - Rs[j]) / den : 0;
      pares.push({ a: nombres[i], b: nombres[j], t, gl: glC, Wi: Rs[i], Wj: Rs[j], p: pT(t, glC) });
    }
    const pb = bonf(pares.map((f) => f.p)), ph = holm(pares.map((f) => f.p));
    pares.forEach((f, i) => { f.pBonf = pb[i]; f.pHolm = ph[i]; });
    return { chi2, gl, p, W, Rs, conover: pares };
  }

  /* ---------- densidad kernel (para violines y raincloud) ---------- */
  function kde(x, desde, hasta, nPuntos = 60) {
    const n = x.length; if (n < 2) return [];
    const s = de(x), iqr = cuantil(x, .75) - cuantil(x, .25);
    const h = 0.9 * Math.min(s, iqr / 1.34 || s) * Math.pow(n, -0.2) || 0.05;
    const out = [];
    for (let i = 0; i <= nPuntos; i++) {
      const v = desde + (hasta - desde) * i / nPuntos;
      const dens = x.reduce((a, xi) => a + Math.exp(-0.5 * ((v - xi) / h) ** 2), 0) / (n * h * Math.sqrt(2 * Math.PI));
      out.push([v, dens]);
    }
    return out;
  }

  return { media, de, varianza, mediana, cuantil, pT, pZ, pF, pChi, tCrit, descriptivos, mauchly, anovaRM,
           posthocRM, tRelacionadas, friedman, holm, bonf, kde };
})();
