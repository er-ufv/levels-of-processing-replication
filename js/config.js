/* =====================================================================
   CONFIGURACIÓN DEL EXPERIMENTO
   Réplica didáctica del efecto de los niveles de procesamiento
   (Craik y Lockhart, 1972; Craik y Tulving, 1975).
   Diseño experimental con el MISMO GRUPO de participantes (intrasujeto):
   cada persona pasa por los tres niveles de la VI.

   Este es el ÚNICO archivo que normalmente hay que tocar:
     1. ENDPOINT  -> URL de la aplicación web de Google Apps Script.
     2. COHORTE   -> etiqueta del grupo de clase.
   Todo lo demás (index.html y las dos pestañas) lee de aquí.
   ===================================================================== */

window.CONFIG = {

  /* ------------------------------------------------------------------
     1) CONEXIÓN CON LA BASE DE DATOS (Google Sheets vía Apps Script)
     Pega aquí la URL que termina en /exec (ver README, paso 3).
     Si se deja vacía, el experimento funciona en «modo local»:
     guarda las respuestas solo en este navegador (útil para probar).
     ------------------------------------------------------------------ */
  ENDPOINT: "https://script.google.com/macros/s/AKfycbxphLwip5uEIkSBz9X4-lELWu8Ow6ZuG0tTV8rSV14pA5JTf_jMudSPjq6_yRsGVWNf/exec",

  /* Etiqueta del grupo de clase: cámbiala en cada grupo o curso
     (p. ej. "MDTI-2026-G1") para separar las respuestas en la hoja. */
  COHORTE: "MDTI-2026-G1",

  ASIGNATURA: "Métodos, Diseño y Técnicas de Investigación en Psicología",
  TEMA: "Tema 5 · Diseños experimentales con el mismo grupo de participantes",

  /* ------------------------------------------------------------------
     2) VARIABLE INDEPENDIENTE: nivel de procesamiento (3 niveles)
     ------------------------------------------------------------------ */
  NIVELES: [
    { id: "superficial", nombre: "Superficial", tipo: "gráfico",   pregunta: "¿Está escrita con mayúsculas?" },
    { id: "intermedio",  nombre: "Intermedio",  tipo: "fonético",  pregunta: "¿Rima con…?" },
    { id: "profundo",    nombre: "Profundo",    tipo: "semántico", pregunta: "¿Significa…?" }
  ],

  /* ------------------------------------------------------------------
     3) TAREA 1 · CODIFICACIÓN (18 preguntas de sí o no, 6 por nivel)
     El orden es el del documento original: está construido con
     ALEATORIZACIÓN POR BLOQUES (6 bloques de 3 preguntas; cada bloque
     contiene una pregunta de cada nivel, en orden aleatorio).
       palabra : palabra de estudio (tal como se muestra)
       nivel   : superficial | intermedio | profundo
       correcta: respuesta correcta a la pregunta de orientación
     ------------------------------------------------------------------ */
  ORDEN_PREGUNTAS: "fijo",   // "fijo" (documento original) | "bloques" (nuevo sorteo por participante dentro de cada bloque)

  PREGUNTAS: [
    { id: "q01", nivel: "intermedio",  palabra: "disco",  texto: "¿Rima la palabra «disco» con «asterisco»?",            correcta: "Sí" },
    { id: "q02", nivel: "profundo",    palabra: "árbol",  texto: "¿Representa la palabra «árbol» un tipo de vegetal?",   correcta: "Sí" },
    { id: "q03", nivel: "superficial", palabra: "CEDRO",  texto: "¿Está la palabra «CEDRO» escrita con mayúsculas?",     correcta: "Sí" },

    { id: "q04", nivel: "profundo",    palabra: "prado",  texto: "¿Representa la palabra «prado» una extensión de terreno?", correcta: "Sí" },
    { id: "q05", nivel: "intermedio",  palabra: "mesas",  texto: "¿Rima la palabra «mesas» con «pesas»?",                correcta: "Sí" },
    { id: "q06", nivel: "superficial", palabra: "CARTA",  texto: "¿Está la palabra «CARTA» escrita con mayúsculas?",     correcta: "Sí" },

    { id: "q07", nivel: "profundo",    palabra: "claro",  texto: "¿Representa la palabra «claro» un matiz de un color?", correcta: "Sí" },
    { id: "q08", nivel: "intermedio",  palabra: "perro",  texto: "¿Rima la palabra «perro» con «luminoso»?",             correcta: "No" },
    { id: "q09", nivel: "superficial", palabra: "arcón",  texto: "¿Está la palabra «arcón» escrita con mayúsculas?",     correcta: "No" },

    { id: "q10", nivel: "superficial", palabra: "VASOS",  texto: "¿Está la palabra «VASOS» escrita con mayúsculas?",     correcta: "Sí" },
    { id: "q11", nivel: "profundo",    palabra: "silla",  texto: "¿Representa la palabra «silla» un tipo de embarcación?", correcta: "No" },
    { id: "q12", nivel: "intermedio",  palabra: "libro",  texto: "¿Rima la palabra «libro» con «monotonía»?",            correcta: "No" },

    { id: "q13", nivel: "profundo",    palabra: "tacón",  texto: "¿Representa la palabra «tacón» un tipo de moneda?",    correcta: "No" },
    { id: "q14", nivel: "superficial", palabra: "tinto",  texto: "¿Está la palabra «tinto» escrita con mayúsculas?",     correcta: "No" },
    { id: "q15", nivel: "intermedio",  palabra: "queso",  texto: "¿Rima la palabra «queso» con «archiduque»?",           correcta: "No" },

    { id: "q16", nivel: "profundo",    palabra: "clero",  texto: "¿Representa la palabra «clero» una marca de tabaco?",  correcta: "No" },
    { id: "q17", nivel: "intermedio",  palabra: "purga",  texto: "¿Rima la palabra «purga» con «demiurga»?",             correcta: "Sí" },
    { id: "q18", nivel: "superficial", palabra: "calvo",  texto: "¿Está la palabra «calvo» escrita con mayúsculas?",     correcta: "No" }
  ],

  /* Pausa en blanco entre preguntas (ms) */
  PAUSA_ENTRE_PREGUNTAS_MS: 400,

  /* ------------------------------------------------------------------
     4) TAREA 2 · DISTRACTORA: contar hacia atrás de 47 a 1, de dos en dos
     Impide repasar las palabras en la memoria a corto plazo.
     ------------------------------------------------------------------ */
  DISTRACTORA: { desde: 47, hasta: 1, paso: 2, tiempo_max_s: 120 },

  /* ------------------------------------------------------------------
     5) TAREA 3 · RECONOCIMIENTO: 36 palabras (18 estudiadas + 18 nuevas)
     Mismo orden (6 x 6) que en el documento original.
     ------------------------------------------------------------------ */
  RECONOCIMIENTO: [
    "Circo", "Musgo", "Cargo", "Celta", "Cesto", "Calvo",
    "Árbol", "Libro", "Grifo", "Virgo", "Vasos", "Grajo",
    "Perro", "Disco", "Verga", "Arcón", "Queso", "Largo",
    "Silla", "Mesas", "Tacón", "Resto", "Prado", "Clero",
    "Selva", "Cedro", "Ancho", "Carta", "Claro", "Clavo",
    "Cerca", "Purga", "Corto", "Lápiz", "Tinto", "Arcén"
  ],

  /* ------------------------------------------------------------------
     6) PREGUNTAS FINALES (variables de agrupación y criterios de exclusión)
     ------------------------------------------------------------------ */
  PREGUNTAS_FINALES: [
    { id: "sexo", tipo: "opcion", texto: "Sexo",
      opciones: ["Mujer", "Hombre", "Otro", "Prefiero no decirlo"] },
    { id: "edad", tipo: "numero", min: 16, max: 99, texto: "Edad (en años)" },
    { id: "sospecha", tipo: "sino",
      texto: "Mientras respondías a las 18 preguntas de la primera tarea, ¿sabías o sospechabas que después te pedirían recordar las palabras?" },
    { id: "conocia", tipo: "sino", texto: "¿Conocías este experimento o alguien te ha contado de qué trata?" },
    { id: "condiciones", tipo: "sino", texto: "¿Has podido hacer la actividad con atención y sin interrupciones?" }
  ]
};
