export const scenarios = [
  {
    id: "basic-pipeline",
    name: "Pipeline basico",
    description: "Secuencia corta sin riesgos de datos ni de control. Sirve para observar como varias instrucciones se solapan de forma natural entre IF, ID, EX, MEM y WB.",
    code: `li t0, 1
li t1, 2
li t2, 3
add t3, t0, t1
or t4, t2, t0`,
    explanationSteps: [
      { cycle: 1, text: "La primera instruccion entra por IF. Todavia no hay actividad en el resto de etapas." },
      { cycle: 3, text: "Ya hay varias instrucciones en vuelo al mismo tiempo. Este solapamiento es la base del rendimiento de la segmentacion." },
      { cycle: 5, text: "Las instrucciones mas antiguas alcanzan WB mientras las mas jovenes siguen avanzando por el pipeline." },
    ],
  },
  {
    id: "forwarding",
    name: "Ejemplo de anticipacion",
    description: "Este programa crea dependencias aritmeticas consecutivas. La instruccion dependiente puede continuar porque el resultado se anticipa hacia EX sin esperar a WB.",
    code: `li t0, 5
li t1, 10
add t2, t0, t1
sub t3, t2, t0
and t4, t3, t1`,
    explanationSteps: [
      { cycle: 4, text: "La instruccion add esta produciendo un valor que una instruccion aritmetica mas joven necesitara inmediatamente." },
      { cycle: 5, text: "La anticipacion de datos permite usar el resultado reciente de la ALU desde un registro intermedio del pipeline." },
      { cycle: 6, text: "La dependencia continua en ciclos siguientes y muestra como la anticipacion evita stalls innecesarios." },
    ],
  },
  {
    id: "load-use-stall",
    name: "Riesgo load-use",
    description: "Una carga es seguida inmediatamente por una instruccion que necesita el registro cargado. Como el dato aun no esta listo, la unidad de riesgos inserta un stall.",
    code: `.data
value: .word 20
.text
la t0, value
lw t1, 0(t0)
add t2, t1, t0
sw t2, 4(t0)`,
    explanationSteps: [
      { cycle: 3, text: "La carga avanza hacia EX para calcular la direccion, pero el valor de memoria todavia no esta disponible." },
      { cycle: 4, text: "La instruccion add siguiente necesita ese dato demasiado pronto. Se congelan IF e ID durante un ciclo y se inserta una burbuja." },
      { cycle: 5, text: "Tras el stall, el valor cargado ya puede aprovecharse y el flujo vuelve a avanzar con seguridad." },
    ],
  },
  {
    id: "branch-flush",
    name: "Salto y vaciado",
    description: "Este programa muestra un beq tomado. Cuando el salto se resuelve en EX, las instrucciones jovenes del camino erroneo se vacian y la captura se reinicia en el destino.",
    code: `li t0, 1
li t1, 1
beq t0, t1, done
add t2, t0, t1
done:
sub t3, t1, t0`,
    explanationSteps: [
      { cycle: 4, text: "El salto alcanza EX, que es la etapa donde finalmente se resuelve la comparacion." },
      { cycle: 5, text: "Como el salto se toma, se vacian las instrucciones del camino incorrecto y el PC salta a la etiqueta destino." },
      { cycle: 6, text: "La captura de instrucciones se reanuda desde la direccion correcta y el pipeline sigue por el camino valido." },
    ],
  },
];

export function getScenarioById(id) {
  return scenarios.find((scenario) => scenario.id === id) ?? null;
}
