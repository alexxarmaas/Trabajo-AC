# Trabajo AC - Simulador RISC-V segmentado

## Descripción

Simulador web educativo de un procesador RISC-V segmentado de 5 etapas (IF, ID, EX, MEM, WB). Permite ejecutar un **subconjunto educativo de RV64IM** ciclo a ciclo directamente en el navegador, observando el flujo de instrucciones a través de los registros inter-etapa (IF/ID, ID/EX, EX/MEM, MEM/WB), la anticipación de datos (*forwarding*), los riesgos de datos, los stalls, los vaciados (*flush*) del pipeline y las señales de control.

Diseñado como herramienta de laboratorio para la asignatura de Arquitectura de Computadores.

---

## Relación con el enunciado

| Requisito del PDF | Cómo se cumple | Archivo(s) |
|---|---|---|
| Simulador web ejecutable en navegador | HTML + JS modulares, sin frameworks externos | `index.html`, `main.js` |
| Servidor web local con Node | Servidor Node.js mínimo usando módulo `http` | `server.mjs`, `package.json` |
| Pipeline de 5 etapas (IF, ID, EX, MEM, WB) | Cada etapa implementada con lógica explícita | `pipeline.js` |
| Registros inter-etapa (IF/ID, ID/EX, EX/MEM, MEM/WB) | Objetos JS con instrucción, valores, señales y resultado | `pipeline.js` |
| Subconjunto educativo RV64IM de 64 bits | ALU y registros con `BigInt`. No cubre el estándar completo. | `parser.js`, `pipeline.js` |
| Registros representados con `BigInt` | Array de 32 `BigInt`. Aritmética 64 bits real. | `cpu.js`, `pipeline.js` |
| x0/zero inmutable | x0 forzado a `0n` en cada ciclo WB | `pipeline.js` |
| Memoria direccionada byte a byte | Cada dirección es 1 byte. Lecturas/escrituras multi-byte explícitas. | `pipeline.js`, `parser.js` |
| `.word` (4 bytes) y `.dword` (8 bytes) | Sección `.data` con `parseWordValues` y `parseDwordValues` | `parser.js` |
| `lw`/`sw` (32 bits) y `ld`/`sd` (64 bits) | `lw` → signExtend32; `ld` → BigInt.asIntN(64); `sw`/`sd` little-endian | `pipeline.js` |
| Forwarding EX/MEM y MEM/WB | Anticipación desde ambos registros hacia la entrada ALU en EX | `pipeline.js` |
| Load-use hazard | 1 stall obligatorio cuando `lw`/`ld` es seguido de uso inmediato | `pipeline.js` |
| RAW hazards sin forwarding | Con forwarding desactivado: stall por ID_EX o EX_MEM con dependencia | `pipeline.js` |
| Store hazards | Store con dependencia ALU → forwarding; con dependencia load → stall | `pipeline.js` |
| Branch/jump flush | `beq`, `bne`, `jal`, `jalr` evaluados en EX; flush de IF e ID si salto tomado | `pipeline.js` |
| `jal` y `jalr` | `jal` salta a label+offset; `jalr` salta a `(rs1+imm) & ~1`; ambos escriben PC+4 en rd | `pipeline.js`, `parser.js` |
| Historial por ciclos | Tabla: IF/ID/EX/MEM/WB, stall, stallReason, flush, branchTaken, jumpTaken, forwardA/B | `pipeline.js`, `main.js` |
| Panel de señales | RegWrite, MemRead, MemWrite, MemToReg, Branch, Jump, ForwardA, ForwardB, Stall, Flush | `main.js`, `index.html` |
| Escenarios docentes | 9 escenarios precargados con explicaciones por ciclo | `scenarios.js` |
| Pruebas manuales | 12 pruebas con resultado esperado y observaciones | `test/manual-tests.md` |
| Cuatro unidades didácticas | Guías completas de laboratorio en `docs/unidades/` | `docs/unidades/` |

---

## Alcance de instrucciones soportadas

> El proyecto implementa un **subconjunto educativo** de RV64IM, no el repertorio oficial completo.

### RV64I

| Tipo | Instrucciones |
|---|---|
| R-type aritmético-lógico | `add`, `sub`, `and`, `or`, `xor`, `sll`, `srl`, `sra` |
| I-type aritmético-lógico | `addi`, `andi`, `ori`, `xori` |
| Cargas | `lw` (32 bits con signo), `ld` (64 bits con signo) |
| Almacenes | `sw` (32 bits), `sd` (64 bits) |
| Saltos condicionales | `beq`, `bne` |
| Saltos incondicionales | `jal`, `jalr` |
| U-type | `lui`, `auipc` |

### Extensión M

| Instrucción | Operación |
|---|---|
| `mul` | Multiplicación entera 64 bits |
| `div` | División entera 64 bits (con signo) |
| `rem` | Resto 64 bits (con signo) |

### Pseudoinstrucciones

| Pseudoinstrucción | Expansión / Efecto |
|---|---|
| `li rd, imm` | `addi rd, x0, imm` |
| `la rd, label` | Carga la dirección base del label en rd |
| `nop` | `addi x0, x0, 0` |

---

## Arquitectura del simulador

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Estructura visual: editor, controles, tarjetas de etapas, panel de señales, tablas de registros/memoria/historial |
| `main.js` | Controlador de la interfaz: enlaza eventos UI con el estado CPU y renderiza todos los paneles |
| `parser.js` | Analiza el código ensamblador: valida sintaxis, resuelve etiquetas, convierte inmediatos a BigInt, gestiona `.data`/`.text`. Produce estructuras listas para ejecución. |
| `cpu.js` | Estado inicial del procesador: PC, registros (BigInt), memoria, pipeline, historial y opciones de simulación |
| `pipeline.js` | Lógica de segmentación: avanza un ciclo de reloj, aplica forwarding, detecta hazards (load-use, RAW, control), ejecuta ALU, accede a memoria y escribe WB |
| `scenarios.js` | Base de datos de programas ensamblador precargados con explicaciones por ciclo |
| `server.mjs` | Servidor Node.js que sirve los archivos estáticos en `http://localhost:3000` |
| `test/manual-tests.md` | 12 programas de prueba con resultado esperado y observaciones |
| `docs/unidades/` | Cuatro unidades didácticas completas para uso en laboratorio |

---

## Modelo de pipeline

```
   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐
   │  IF   │→  │  ID   │→  │  EX   │→  │  MEM  │→  │  WB   │
   └───────┘   └───────┘   └───────┘   └───────┘   └───────┘
        ↓            ↓           ↓            ↓
     IF/ID        ID/EX       EX/MEM       MEM/WB
```

| Etapa | Función |
|---|---|
| **IF** | Captura la instrucción en PC. Almacena en IF/ID. Actualiza PC a PC+4 (salvo stall). |
| **ID** | Decodifica la instrucción, lee rs1/rs2 del banco de registros. Detecta load-use/RAW para insertar stall. Genera señales de control en ID/EX. |
| **EX** | La ALU ejecuta la operación. Se aplica forwarding desde EX/MEM y MEM/WB. Los saltos se evalúan aquí. Resultado en EX/MEM. |
| **MEM** | Lee o escribe memoria de datos. El dato leído se almacena en MEM/WB. |
| **WB** | Escribe el resultado (ALU o dato de memoria) en el registro destino (rd). x0 forzado a 0n. |

Los **registros inter-etapa** (IF/ID, ID/EX, EX/MEM, MEM/WB) almacenan la instrucción en vuelo junto con los valores de operandos, señales de control y resultados intermedios.

---

## Señales de control visibles

El panel de señales muestra el estado de las señales asociadas a la instrucción en ID/EX, completado con datos del historial para ForwardA/B, Stall y Flush:

| Señal | Significado |
|---|---|
| `RegWrite` | La instrucción escribe un registro destino |
| `MemRead` | La instrucción lee de memoria (`lw`, `ld`) |
| `MemWrite` | La instrucción escribe en memoria (`sw`, `sd`) |
| `MemToReg` | El valor de WB viene de memoria (activo en loads) |
| `Branch` | Instrucción de salto condicional (`beq`, `bne`) |
| `Jump` | Instrucción de salto incondicional (`jal`, `jalr`) |
| `ForwardA` | Operando A fue anticipado (desde EX/MEM o MEM/WB) |
| `ForwardB` | Operando B fue anticipado (desde EX/MEM o MEM/WB) |
| `Stall` | El pipeline está detenido este ciclo por un hazard |
| `Flush` | Las etapas IF e ID fueron vaciadas por un salto tomado |

---

## Riesgos implementados

### RAW hazards (Read After Write)
Una instrucción lee un registro que una instrucción anterior aún no ha escrito.

### Forwarding EX/MEM y MEM/WB
Con forwarding activado, el resultado de la ALU (desde EX/MEM) o el dato de memoria (desde MEM/WB) se conecta directamente a la entrada de la ALU en EX, evitando la mayoría de stalls RAW.

### Load-use hazard
`lw`/`ld` seguido inmediatamente de una instrucción que usa el registro cargado. El dato solo existe al final de MEM, un ciclo demasiado tarde para anticipar. El simulador inserta **1 stall obligatorio** incluso con forwarding activado.

### RAW hazards cuando forwarding está desactivado
Con forwarding desactivado, se detectan dependencias contra ID_EX y EX_MEM. Si alguna instrucción en vuelo va a escribir un registro que ID necesita, se congela el pipeline hasta que WB completa la escritura.

> **Nota de implementación:** MEM/WB no genera stall porque WB escribe en el banco de registros antes de que ID lo lea dentro del mismo modelo de ciclo.

### Store hazards
- Si el dato a guardar (`rs2` del store) depende de una instrucción aritmética anterior → forwarding lo resuelve.
- Si depende de `lw`/`ld` inmediatamente anterior → stall load-use.

### Control hazards con flush
`beq`, `bne`, `jal`, `jalr` se resuelven en EX. Si el salto se toma, las instrucciones en IF e ID (camino incorrecto) se descartan mediante **flush** (2 ciclos de penalización). Si el salto no se toma, no hay penalización.

La opción "Flush" puede desactivarse en la interfaz para observar el efecto de no descartar las instrucciones incorrectas.

### Branch/jump handling
- `beq`/`bne`: saltos condicionales. Si la condición se cumple → branchTaken, flush, PC = destino.
- `jal`: salto incondicional a dirección de texto (label). Escribe PC+4 en rd.
- `jalr`: salto incondicional a dirección dinámica `(rs1 + imm) & ~1`. Escribe PC+4 en rd.

---

## Instalación y ejecución

```bash
# Sin dependencias externas necesarias
npm install

# Iniciar servidor local
npm start
```

Abrir en el navegador: **http://localhost:3000**

---

## Uso del simulador

| Acción | Descripción |
|---|---|
| **Cargar escenario** | Seleccionar del menú desplegable y pulsar "Cargar escenario" |
| **Escribir código** | Editar en el cuadro de texto. Soporte para `#` comentarios, `.data`/`.text`, `.word`, `.dword` |
| **Cargar programa** | Compila e inicializa la CPU |
| **Avanzar 1 ciclo** | Observa paso a paso el avance por las etapas |
| **Ejecutar hasta el final** | Completa la ejecución (límite de 2000 ciclos) |
| **Activar/desactivar Forwarding** | Cambia si se aplica anticipación de datos |
| **Activar/desactivar Flush** | Cambia si se descartan instrucciones incorrectas tras salto |
| **Registros** | Tabla con los 32 registros y sus valores BigInt |
| **Memoria** | Tabla byte a byte con dirección y valor en hex y decimal |
| **Historial** | Tabla completa por ciclo: etapas, stall, flush, branch, wbWrite |
| **Panel de señales** | 10 señales de control del ciclo actual |

> **Nota:** La memoria se visualiza **byte a byte** porque la arquitectura usa direccionamiento por bytes. Un `.word` genera 4 filas y un `.dword` genera 8 filas.

---

## Escenarios docentes incluidos

| # | Nombre | Concepto |
|---|---|---|
| 1 | RV64I: Pipeline básico | Solapamiento de etapas sin hazards |
| 2 | RV64I: Anticipación aritmética | Forwarding EX/MEM y MEM/WB |
| 3 | RV64I: Riesgo Load-Use (lw) | Stall load-use obligatorio |
| 4 | RV64I: Store con dependencia de datos (sd) | Forwarding para stores, ld 64 bits |
| 5 | RV64I: Control Hazard – Branch Flush | Salto condicional tomado y flush |
| 6 | RV64I: Branch no tomado | Ausencia de penalización sin salto |
| 7 | RV64I: jal | Salto incondicional, registro de retorno |
| 8 | RV64I: jalr | Salto a dirección dinámica |
| 9 | Extensión M: mul, div, rem | Multiplicación y división de 64 bits |

---

## Unidades didácticas

Guías de laboratorio diseñadas para sesiones de 2–4 horas. Cada unidad incluye: introducción, objetivos operativos, código de partida, configuración del simulador, pasos de interacción, tabla de observaciones, ejercicios de autoevaluación y soluciones orientativas.

| Unidad | Título | Enlace |
|---|---|---|
| 1 | Codificación/ejecución básica RV64I | [unidad-1-codificacion-rv64i.md](docs/unidades/unidad-1-codificacion-rv64i.md) |
| 2 | Forwarding / anticipación de datos | [unidad-2-forwarding.md](docs/unidades/unidad-2-forwarding.md) |
| 3 | Load-use hazard y stalls | [unidad-3-load-use-stalls.md](docs/unidades/unidad-3-load-use-stalls.md) |
| 4 | Riesgos de control y flush | [unidad-4-control-hazards.md](docs/unidades/unidad-4-control-hazards.md) |

---

## Pruebas / manual tests

El archivo [`test/manual-tests.md`](test/manual-tests.md) contiene 12 pruebas manuales con:
- Código ensamblador listo para copiar.
- Configuración de toggles (Forwarding, Flush).
- Resultado esperado de registros y memoria.
- Qué observar en historial y panel de señales.

Casos cubiertos: forwarding sin stall, stalls RAW sin forwarding, load-use con 1 stall, store con dependencia ALU, store con dependencia load, branch tomado/no tomado, jal, jalr, mul/div/rem, ld/sd con .dword, x0 inmutable.

---

## Limitaciones conocidas

- **Simulador educativo**: no es un emulador RISC-V completo ni apto para producción.
- **Repertorio parcial**: implementa un subconjunto representativo de RV64IM, no el estándar oficial completo.
- **Extensión M simplificada**: `mul`, `div`, `rem` tienen latencia de 1 ciclo en EX. En hardware real pueden tardar múltiples ciclos.
- **Sin caché**: no modela latencias de caché ni jerarquía de memoria. Toda lectura/escritura toma 1 ciclo.
- **Sin predicción avanzada de saltos**: el modelo asume "salto no tomado"; si se toma, se descarta con 2 ciclos de penalización.
- **Sin CSR, excepciones ni interrupciones**.
- **Sin instrucciones de punto flotante** (extensiones F/D).
- **Memoria visualizada byte a byte**: un `.dword` aparece como 8 filas en la tabla de memoria.

---

## Autores / asignatura

- **Nombres**: _[completar]_
- **Grupo**: _[completar]_
- **Asignatura**: Arquitectura de Computadores
- **Curso**: _[completar]_
