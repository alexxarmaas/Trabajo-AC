// ============================================================
// scenarios.js  –  Escenarios didácticos para el simulador
// Cada escenario tiene: id, name, description, code,
// explanationSteps (cycle, text).
// ============================================================

export const scenarios = [
  // ──────────────────────────────────────────────────────────
  // 1. Pipeline básico sin hazards
  // ──────────────────────────────────────────────────────────
  {
    id: "basic-pipeline",
    name: "RV64I: Pipeline básico",
    description:
      "Secuencia sin dependencias de datos ni de control. Observa cómo las instrucciones solapan etapas IF→ID→EX→MEM→WB de forma limpia.",
    code: `li t0, 1
li t1, 2
li t2, 3
add t3, t0, t1
or  t4, t2, t0`,
    explanationSteps: [
      { cycle: 1, text: "La primera instrucción entra en IF. El resto del pipeline está vacío." },
      { cycle: 3, text: "Tres instrucciones en vuelo simultáneo. Esto es el solapamiento del pipeline." },
      { cycle: 5, text: "La primera instrucción alcanza WB mientras las más jóvenes aún avanzan." },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // 2. Forwarding (anticipación aritmética)
  // ──────────────────────────────────────────────────────────
  {
    id: "forwarding",
    name: "RV64I: Anticipación aritmética",
    description:
      "Dependencias RAW consecutivas. Con forwarding activado, los resultados se anticipan desde EX/MEM y MEM/WB sin stalls. Desactiva forwarding para ver las burbujas.",
    code: `li t0, 5
li t1, 10
add t2, t0, t1
sub t3, t2, t0
and t4, t3, t1`,
    explanationSteps: [
      { cycle: 4, text: "add produce t2 = 15. sub necesita t2 inmediatamente." },
      { cycle: 5, text: "Forwarding desde EX/MEM lleva t2 a sub sin stall. Observa ForwardA = 1 en señales." },
      { cycle: 6, text: "and depende de t3 (resultado de sub). Forwarding continúa resolviendo la cadena." },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // 3. Load-use hazard
  // ──────────────────────────────────────────────────────────
  {
    id: "load-use-stall",
    name: "RV64I: Riesgo Load-Use (lw)",
    description:
      "Un lw seguido de una instrucción que necesita el valor cargado. El forwarding no basta porque el dato llega de memoria en MEM, un ciclo tarde. Se inserta 1 stall.",
    code: `.data
value: .word 20
.text
la t0, value
lw t1, 0(t0)
add t2, t1, t0`,
    explanationSteps: [
      { cycle: 3, text: "lw entra en EX. El procesador detecta que add necesita t1, que lw todavía no ha leído." },
      { cycle: 4, text: "Se inserta burbuja. IF e ID se congelan. Observa Stall = 1 en señales y historial." },
      { cycle: 5, text: "Tras el stall, t1 ya está disponible. add continúa con el valor correcto." },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // 4. Store con dependencia de ALU previa
  // ──────────────────────────────────────────────────────────
  {
    id: "store-dependency",
    name: "RV64I: Store con dependencia de datos (sd)",
    description:
      "Un sd necesita el dato de la instrucción aritmética anterior. Con forwarding, el dato se anticipa desde EX/MEM sin stall. También usa .dword y ld para 64 bits.",
    code: `.data
mem64: .dword 0x1122334455667788
.text
la  t0, mem64
ld  t1, 0(t0)
addi t1, t1, 1
sd  t1, 8(t0)`,
    explanationSteps: [
      { cycle: 4, text: "ld carga 64 bits en t1. Observa MemRead = 1 en señales." },
      { cycle: 5, text: "addi suma 1 a t1. Load-use provoca stall porque ld aún no terminó MEM." },
      { cycle: 7, text: "sd escribe el valor actualizado. Con forwarding, ForwardB = 1 anticipa t1 al store." },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // 5. Control hazard (branch flush)
  // ──────────────────────────────────────────────────────────
  {
    id: "branch-flush",
    name: "RV64I: Control Hazard – Branch Flush",
    description:
      "beq tomado. Cuando el salto se resuelve en EX, se descartan las instrucciones del camino incorrecto. Desactiva Flush para ver las instrucciones erróneas en el pipeline.",
    code: `li t0, 1
li t1, 1
beq t0, t1, done
add t2, t0, t1
done:
sub t3, t1, t0`,
    explanationSteps: [
      { cycle: 4, text: "beq llega a EX. t0 == t1, así que el salto se toma." },
      { cycle: 5, text: "Con flush activado, IF e ID se vacían. Las instrucciones del camino incorrecto desaparecen." },
      { cycle: 6, text: "sub se captura desde la dirección correcta. t3 = 0." },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // 6. Branch no tomado
  // ──────────────────────────────────────────────────────────
  {
    id: "branch-not-taken",
    name: "RV64I: Branch no tomado",
    description:
      "beq cuya condición es falsa. El PC continúa secuencialmente. No hay flush ni salto. Buen contraste con el escenario de branch tomado.",
    code: `li t0, 1
li t1, 2
beq t0, t1, skip
addi t2, t0, 100
skip:
addi t3, t1, 200`,
    explanationSteps: [
      { cycle: 4, text: "beq llega a EX. t0 != t1, el salto NO se toma. El flujo continúa secuencialmente." },
      { cycle: 5, text: "addi t2 se ejecuta normalmente. No hay flush ni burbuja de control." },
      { cycle: 7, text: "Al final: t2 = 101, t3 = 202." },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // 7. jal – salto incondicional y link
  // ──────────────────────────────────────────────────────────
  {
    id: "jal-example",
    name: "RV64I: jal",
    description:
      "jal escribe PC+4 en rd (dirección de retorno) y salta al destino. Observa el flush y la escritura en ra.",
    code: `li a0, 42
jal ra, func
addi a1, zero, 99
func:
add a2, a0, a0`,
    explanationSteps: [
      { cycle: 3, text: "jal llega a EX. Escribe PC+4 en ra (dirección de retorno) y salta a func." },
      { cycle: 4, text: "Con flush activado, addi a1 (instrucción del camino incorrecto) se descarta." },
      { cycle: 5, text: "add a2 se ejecuta. Resultado: a2 = 84." },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // 8. jalr – salto a dirección dinámica
  // ──────────────────────────────────────────────────────────
  {
    id: "jalr-example",
    name: "RV64I: jalr",
    description:
      "jalr salta a la dirección almacenada en un registro (rs1 + imm). Permite saltos a direcciones calculadas en tiempo de ejecución. Observa cómo ra recibe PC+4 y se descartan las instrucciones del camino incorrecto.",
    code: `li t0, 16
jalr ra, 0(t0)
addi t1, zero, 99
nop
addi t2, zero, 7
addi t3, zero, 8`,
    explanationSteps: [
      { cycle: 2, text: "jalr entra en ID. t0 = 16 (dirección de destino). ra recibirá PC+4 = 8." },
      { cycle: 3, text: "jalr llega a EX. Calcula destino: (t0 + 0) & ~1 = 16. Escribe PC+4 en ra." },
      { cycle: 4, text: "Con flush activado, addi t1 (camino incorrecto) se descarta." },
      { cycle: 5, text: "El pipeline captura addi t2 desde la dirección 16. t2 = 7." },
      { cycle: 6, text: "addi t3 se ejecuta. t3 = 8. Ejecución finalizada correctamente." },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // 9. Extensión M
  // ──────────────────────────────────────────────────────────
  {
    id: "m-extension",
    name: "Extensión M: mul, div, rem",
    description:
      "Operaciones de la extensión M (multiplicación y división entera de 64 bits). Modeladas con latencia de 1 ciclo en EX, como simplificación didáctica.",
    code: `li t0, 100
li t1, 3
mul t2, t0, t1
div t3, t0, t1
rem t4, t0, t1`,
    explanationSteps: [
      { cycle: 4, text: "mul calcula t2 = 100 × 3 = 300." },
      { cycle: 5, text: "div calcula t3 = 100 ÷ 3 = 33 (división entera)." },
      { cycle: 6, text: "rem calcula t4 = 100 mod 3 = 1." },
    ],
  },
];

export function getScenarioById(id) {
  return scenarios.find((s) => s.id === id) ?? null;
}
