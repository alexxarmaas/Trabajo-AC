# Trabajo AC - Simulador RISC-V segmentado

## Descripción
Este repositorio contiene un simulador web educativo de un procesador RISC-V segmentado de 5 etapas (IF, ID, EX, MEM, WB). Está diseñado como una herramienta didáctica para comprender internamente el flujo de instrucciones y la resolución de riesgos (*hazards*) en arquitecturas pipeline modernas. El simulador se ejecuta por completo en el navegador mediante HTML, CSS y JavaScript puro, permitiendo visualizar el estado de las etapas, la memoria y los registros ciclo a ciclo.

## Relación con el enunciado

| Requisito del PDF | Cómo se cumple en el repositorio | Archivo(s) relacionados |
| --- | --- | --- |
| Simulador web ejecutable en navegador | Uso de HTML, CSS y JS modular (sin frameworks), sirviéndose con Node. | `index.html`, `main.js` |
| Procesador segmentado de 5 etapas | Se modelan exactamente las etapas IF, ID, EX, MEM y WB, con avance ciclo a ciclo. | `pipeline.js`, `cpu.js` |
| Subconjunto RV64IM de 64 bits | Uso interno de `BigInt` para garantizar ancho de 64 bits en ALU y registros. Operaciones M incluidas. | `pipeline.js`, `parser.js` |
| Forwarding | Implementado desde EX/MEM y MEM/WB hacia EX. | `pipeline.js` |
| Load-use hazard | Detección de uso inmediato tras carga, insertando un ciclo de stall (burbuja). | `pipeline.js` |
| Stalls / burbujas | Anulación de instrucción en `IF_ID` y detención de PC al detectar riesgos no salvables. | `pipeline.js` |
| Branch flush | Los saltos tomados anulan las instrucciones prematuramente cargadas en IF e ID. | `pipeline.js` |
| Registros | Array de 32 elementos (usando `BigInt`), forzando `x0` siempre a 0. | `cpu.js`, `pipeline.js` |
| Memoria | Direccionamiento byte a byte con soporte para escrituras de 4 bytes (`.word`, `sw`) y 8 bytes (`.dword`, `sd`). | `pipeline.js`, `parser.js` |
| Historial por ciclos | Se registra cada ciclo documentando el flujo de PC, etapas y eventos (stalls, flush). | `main.js`, `pipeline.js` |
| Escenarios docentes | Casos precargados para demostrar características clave del pipeline. | `scenarios.js` |
| Servidor web local | Script simple en Node.js que sirve los archivos estáticos usando el módulo `http`. | `server.mjs`, `package.json` |

## Alcance de instrucciones soportadas

Se modela un **subconjunto educativo** de la arquitectura RV64IM de 64 bits.

**RV64I (Instrucciones base):**
- Aritméticas/Lógicas (R-type): `add`, `sub`, `and`, `or`, `xor`, `sll`, `srl`, `sra`
- Aritméticas/Lógicas (I-type): `addi`, `andi`, `ori`, `xori`
- Memoria de 32 bits: `lw`, `sw` (con extensión de signo en cargas)
- Memoria de 64 bits: `ld`, `sd`
- Control/Saltos: `beq`, `bne`, `jal`, `jalr`
- Especiales: `lui`, `auipc`

**Extensión M (Multiplicación y División):**
- `mul`, `div`, `rem`

**Pseudoinstrucciones:**
- `li` (Load Immediate)
- `la` (Load Address)
- `nop` (No Operation)

## Arquitectura del simulador

- **`parser.js`**: Procesa el código fuente en lenguaje ensamblador, validando sintaxis, resolviendo etiquetas `.text` / `.data` y transformándolas en un array de estructuras listes para ejecución.
- **`cpu.js`**: Encapsula el estado inicial del procesador (PC, Memoria, Registros, Historial) y provee la función `stepCPU()` para avanzar un ciclo.
- **`pipeline.js`**: Contiene la lógica profunda del pipeline. Maneja la propagación de datos entre etapas, la lógica de la ALU en la etapa EX, la lectura/escritura de memoria en MEM, y la detección de riesgos (stalls, flushes, forwarding).
- **`main.js`**: Controlador de la interfaz gráfica. Enlaza los eventos de los botones con el estado de la CPU (`cpu.js`) y renderiza dinámicamente las tablas (registros, historial, pipeline).
- **`scenarios.js`**: Base de datos de programas ensamblador predefinidos, útiles para probar y visualizar conceptos de Arquitectura.
- **`index.html`**: Estructura visual principal del simulador con diseño moderno y tablas de inspección.
- **`server.mjs`**: Servidor de desarrollo ligero que permite abrir la app sin errores de CORS en el navegador.

## Modelo de pipeline

El procesador utiliza un modelo clásico MIPS/RISC-V de 5 etapas:
1. **IF (Instruction Fetch)**: Extrae la instrucción en curso según el PC actual.
2. **ID (Instruction Decode)**: Decodifica la instrucción y obtiene los operandos (`rs1`, `rs2`). Detecta riesgos (ej. load-use hazard) para insertar Stalls y congelar IF/ID.
3. **EX (Execute)**: La ALU computa operaciones aritméticas, direcciones de memoria o condiciones de salto. Se encarga del Forwarding para obtener datos actualizados, y detecta qué ramas (`beq`/`bne`/`jal`) se toman para activar un Flush en IF/ID si corresponde.
4. **MEM (Memory Access)**: Realiza lecturas (`lw`, `ld`) o escrituras (`sw`, `sd`) en la memoria de datos (direccionamiento por bytes).
5. **WB (Write Back)**: Guarda los resultados de la ALU o de Memoria en el banco de registros destino (`rd`), protegiendo siempre a `x0`.

Se mantienen los registros intermedios (`IF_ID`, `ID_EX`, `EX_MEM`, `MEM_WB`) visibles en la interfaz.

## Riesgos implementados

- **RAW hazards (Read After Write)**: Detectados automáticamente.
- **Forwarding (Anticipación)**: Desde `EX_MEM` y `MEM_WB` hacia la entrada de la ALU en la etapa `EX`. Evita bloqueos cuando una operación depende inmediatamente del resultado de una operación aritmética previa.
- **Load-use hazard**: Cuando una instrucción aritmética/lógica o un Store necesita un dato que apenas se está cargando (`lw`/`ld`) en memoria, es imposible usar Forwarding. Se inserta un **Stall** de un ciclo.
- **Store hazards**: Si el registro a guardar (`rs2` del store) tiene una dependencia, el forwarding lo resuelve, a menos que el origen sea un load, en cuyo caso ocurre el Stall.
- **Control hazards con flush**: Las instrucciones de salto (`beq`, `bne`, `jal`, `jalr`) se evalúan en EX. Si el salto se toma, las instrucciones atrapadas en las etapas IF e ID (que fueron erróneamente precargadas) son anuladas inmediatamente insertando burbujas (**Flush**).

## Instalación y ejecución

El repositorio incluye un pequeño servidor para evitar los bloqueos CORS de los módulos ES6 en navegadores modernos.

1. Instalar las dependencias (si aplica):
   ```bash
   npm install
   ```
2. Iniciar el servidor local:
   ```bash
   npm start
   ```
3. Abrir el navegador en la siguiente dirección:
   **http://localhost:3000**

## Uso del simulador

- **Cargar escenarios**: Selecciona un programa precargado desde el menú desplegable en la barra lateral y presiona "Cargar escenario". Esto escribirá el código de prueba automáticamente.
- **Escribir código**: Puedes modificar el texto o crear tu propio ensamblador en el editor principal. Presiona **Cargar programa** para compilar e iniciar.
- **Avanzar ciclos**: Usa el botón **Avanzar 1 ciclo** para ver paso a paso cómo recorren las etapas.
- **Ejecutar**: El botón **Ejecutar** avanza múltiples ciclos para agilizar la prueba.
- **Opciones interactivas**: Desactiva el *Forwarding* o el *Flush* en las casillas marcadas para observar cómo el simulador pierde el beneficio de estas técnicas de mitigación de riesgos.
- **Inspección visual**: Monitoriza la tabla de Señales de control, Registros, Memoria e Historial.

## Escenarios docentes incluidos

En el simulador podrás cargar los siguientes programas (`scenarios.js`):
1. **RV64I: Pipeline básico**: Concepto de llenado y solapamiento del cauce (pipeline).
2. **RV64I: Anticipación aritmética**: Ejecución seguida con dependencia de datos que se resuelve sin burbujas gracias al forwarding.
3. **RV64I: Riesgo Load-Use (lw)**: Muestra una carga (Load) seguida por un uso de registro, forzando la creación de un Stall en IF e ID.
4. **RV64I: Store con dependencia de datos (sd)**: Verifica que un store también detiene su ciclo o aplica forwarding correctamente en instrucciones 64-bit.
5. **RV64I: Control Hazard (Branch Flush)**: Demostración de descarte de instrucciones incorrectamente capturadas tras un salto ejecutado.
6. **Extensión M: mul, div, rem**: Para validar el funcionamiento correcto de las multiplicaciones y divisiones a 64-bit del set extendido.

## Pruebas/manual tests

Se ha proporcionado un documento en `test/manual-tests.md` que incluye recortes de código probados e instrucciones explícitas para validación manual del Forwarding, Stalls, operaciones M y el uso de registros de 64 bits (`.dword`, `ld`, `sd`). Puede ser utilizado para corroborar la corrección del proyecto por parte del profesorado.

## Limitaciones conocidas

- **Simulador educativo**: Este proyecto es una herramienta puramente didáctica y *no* es un emulador RISC-V completo destinado a ser utilizado en producción o compilación nativa avanzada.
- **Repertorio**: No cubre el 100% de las instrucciones oficiales RV64IM, sólo implementa el subconjunto representativo mencionado.
- **Cachés/Memoria**: No modela latencias complejas de lectura a memoria (siempre 1 ciclo), fallos de caché o jerarquía de memoria física real.
- **Predicción de saltos**: No implementa un Branch Target Buffer (BTB) ni esquemas avanzados de predicción de saltos estática o dinámica (por defecto, los saltos son predichos como "no tomados").
- **Excepciones**: No incluye manejadores CSR ni trap/interrupts.

## Autores / asignatura
- **Nombres**: [Espacio para completar nombres de alumnos]
- **Grupo**: [Espacio para grupo]
- **Asignatura**: Arquitectura de Computadores
