export const scenarios = [
  {
    id: "basic-pipeline",
    name: "RV64I: Pipeline básico",
    description: "Secuencia corta sin riesgos de datos ni de control utilizando instrucciones RV64I de 64 bits. Muestra el solapamiento de etapas.",
    code: `li t0, 1
li t1, 2
li t2, 3
add t3, t0, t1
or t4, t2, t0`,
    explanationSteps: [
      { cycle: 1, text: "La primera instrucción entra por IF." },
      { cycle: 3, text: "Solapamiento de instrucciones en el pipeline sin dependencias." },
      { cycle: 5, text: "La primera instrucción alcanza WB (Write Back)." },
    ],
  },
  {
    id: "forwarding",
    name: "RV64I: Anticipación aritmética",
    description: "Dependencias aritméticas consecutivas. La instrucción dependiente continúa porque el resultado se anticipa hacia EX sin esperar a WB. Puedes desactivar el Forwarding para observar las burbujas.",
    code: `li t0, 5
li t1, 10
add t2, t0, t1
sub t3, t2, t0
and t4, t3, t1`,
    explanationSteps: [
      { cycle: 4, text: "La instrucción add produce un valor que la siguiente instrucción sub necesita (registro t2)." },
      { cycle: 5, text: "Con Forwarding activado, el resultado se anticipa hacia EX desde EX/MEM o MEM/WB." },
    ],
  },
  {
    id: "load-use-stall",
    name: "RV64I: Riesgo Load-Use (lw)",
    description: "Una carga (lw) es seguida por una instrucción que necesita el valor. Se inserta un stall porque el dato proviene de la memoria y se obtiene en MEM.",
    code: `.data
value: .word 20
.text
la t0, value
lw t1, 0(t0)
add t2, t1, t0`,
    explanationSteps: [
      { cycle: 3, text: "lw entra a EX. El procesador detecta que la siguiente instrucción necesita su destino." },
      { cycle: 4, text: "Se inserta una burbuja (Stall). IF e ID se congelan." },
    ],
  },
  {
    id: "store-dependency",
    name: "RV64I: Store con dependencia de datos (sd)",
    description: "Un store (sd) requiere el dato de la instrucción anterior. Usa direccionamiento a memoria de 64 bits.",
    code: `.data
mem64: .dword 0x1122334455667788
.text
la t0, mem64
ld t1, 0(t0)
addi t1, t1, 1
sd t1, 8(t0)`,
    explanationSteps: [
      { cycle: 4, text: "ld carga 64 bits en t1." },
      { cycle: 6, text: "addi suma 1 a t1. sd espera usar t1. Se usa forwarding para entregar t1 al store." },
    ],
  },
  {
    id: "branch-flush",
    name: "RV64I: Control Hazard (Branch Flush)",
    description: "Muestra un beq que se toma. Las instrucciones jóvenes en el camino erróneo se vacían (Flush) y el PC salta al destino.",
    code: `li t0, 1
li t1, 1
beq t0, t1, done
add t2, t0, t1
done:
sub t3, t1, t0`,
    explanationSteps: [
      { cycle: 4, text: "El salto se evalúa en EX. Como t0 == t1, se toma el salto." },
      { cycle: 5, text: "Con Branch Flush habilitado, se vacían IF e ID. El PC cambia a la dirección de 'done'." },
    ],
  },
  {
    id: "m-extension",
    name: "Extensión M: mul, div, rem",
    description: "Uso de operaciones de multiplicación y división (extensión M de 64 bits).",
    code: `li t0, 100
li t1, 3
mul t2, t0, t1
div t3, t0, t1
rem t4, t0, t1`,
    explanationSteps: [
      { cycle: 4, text: "mul multiplica t0 y t1 (100 * 3)." },
      { cycle: 5, text: "div realiza la división entera (100 / 3)." },
      { cycle: 6, text: "rem calcula el resto (100 % 3)." },
    ],
  },
];

export function getScenarioById(id) {
  return scenarios.find((scenario) => scenario.id === id) ?? null;
}
