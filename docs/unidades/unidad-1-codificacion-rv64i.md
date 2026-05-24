# Unidad 1: Codificación y ejecución básica RV64I

## 1. Introducción

Esta unidad presenta el funcionamiento básico del pipeline de 5 etapas (IF, ID, EX, MEM, WB) usando instrucciones simples de la arquitectura RV64I: carga de inmediatos (`li`), operaciones aritméticas (`add`, `sub`, `xor`) y lógicas. El código se ha diseñado deliberadamente para **no tener dependencias RAW cercanas** entre instrucciones consecutivas, de modo que el pipeline funcione sin stalls ni forwarding activo. El objetivo es entender el flujo de instrucciones ciclo a ciclo en condiciones ideales.

Los registros son de 64 bits y se representan internamente con `BigInt`. El banco de registros contiene 32 registros (x0–x31); x0/zero está cableado a cero y nunca puede modificarse.

---

## 2. Objetivos operativos

Al finalizar esta unidad el estudiante debe ser capaz de:

1. Describir las cinco etapas del pipeline y qué ocurre en cada una.
2. Explicar qué información contiene cada registro inter-etapa (IF/ID, ID/EX, EX/MEM, MEM/WB).
3. Interpretar el historial por ciclos e identificar qué instrucción está en cada etapa.
4. Calcular el número total de ciclos para N instrucciones en un pipeline de 5 etapas sin stalls: **N + 4 ciclos**.
5. Verificar que x0/zero permanece siempre a 0 incluso si se intenta escribirlo.
6. Identificar el valor de PC antes y después de ejecutar cada instrucción.

---

## 3. Código de partida

Copia el siguiente programa en el simulador:

```assembly
li   t0, 10        # t0 = 10
li   t1, 25        # t1 = 25
li   t2, 7         # t2 = 7
li   t3, 3         # t3 = 3
add  t4, t0, t1    # t4 = t0 + t1 = 35
sub  t5, t2, t3    # t5 = t2 - t3 = 4
xor  t6, t0, t2    # t6 = t0 ^ t2 = 13
```

> **Nota:** Las instrucciones `li` cargan valores independientes. `add`, `sub` y `xor` usan registros ya listos al menos 3 ciclos antes, por lo que no se generan dependencias RAW que requieran forwarding ni stalls.

---

## 4. Configuración del simulador

| Parámetro | Valor |
|---|---|
| Forwarding | **Activado** (no influye en esta práctica) |
| Flush (Branch) | **Activado** (no influye en esta práctica) |
| Escenario relacionado | *RV64I: Pipeline básico* |

---

## 5. Pasos de interacción con el simulador

1. Pega el código en el cuadro de texto del simulador.
2. Pulsa **Cargar programa**. Verifica que no aparece ningún mensaje de error.
3. Observa el panel de **Resumen**: el ciclo es 0, el PC es 0, el estado es "Ejecutando".
4. Pulsa **Avanzar 1 ciclo**.
   - En la tarjeta **IF/ID** debe aparecer `li t0, 10`.
   - Las demás tarjetas están vacías.
5. Pulsa **Avanzar 1 ciclo** de nuevo.
   - IF/ID: `li t1, 25`
   - ID/EX: `li t0, 10`
6. Continúa avanzando ciclo a ciclo hasta que la primera instrucción llegue a **WB** (ciclo 5).
7. En la tabla de **Registros**, verifica que t0 = 10.
8. Avanza hasta el final con **Ejecutar hasta el final**.
9. Verifica los valores finales en la tabla de Registros.
10. Abre el **Historial por ciclos** y observa las columnas IF, ID, EX, MEM, WB.

---

## 6. Qué debe observar el estudiante

El pipeline se llena progresivamente. En ningún ciclo debe aparecer **Stall = Sí** ni ningún badge de Anticipación.

| Ciclo | IF | ID | EX | MEM | WB | Evento |
|---|---|---|---|---|---|---|
| 1 | li t0,10 | – | – | – | – | Primera captura |
| 2 | li t1,25 | li t0,10 | – | – | – | 2 instrucciones en vuelo |
| 3 | li t2,7 | li t1,25 | li t0,10 | – | – | 3 en vuelo |
| 4 | li t3,3 | li t2,7 | li t1,25 | li t0,10 | – | 4 en vuelo |
| 5 | add t4 | li t3,3 | li t2,7 | li t1,25 | li t0,10 | Pipeline lleno – WB escribe t0 |
| 6 | sub t5 | add t4 | li t3,3 | li t2,7 | li t1,25 | WB escribe t1 |
| 7 | xor t6 | sub t5 | add t4 | li t3,3 | li t2,7 | WB escribe t2 |
| 8 | – | xor t6 | sub t5 | add t4 | li t3,3 | WB escribe t3 |
| 9 | – | – | xor t6 | sub t5 | add t4 | WB escribe t4 = 35 |
| 10 | – | – | – | xor t6 | sub t5 | WB escribe t5 = 4 |
| 11 | – | – | – | – | xor t6 | WB escribe t6 = 13 |

**Fórmula general:** N instrucciones en pipeline ideal de 5 etapas → **N + 4 ciclos**. Con 7 instrucciones: 7 + 4 = **11 ciclos**.

**Valores finales esperados:**

| Registro | Valor |
|---|---|
| t0 | 10 |
| t1 | 25 |
| t2 | 7 |
| t3 | 3 |
| t4 | 35 |
| t5 | 4 |
| t6 | 13 |

---

## 7. Ejercicios de autoevaluación

1. ¿En qué ciclo entra `add t4, t0, t1` a la etapa ID? ¿Qué valores tienen rs1Val y rs2Val en el registro ID/EX?
2. ¿Cuántos ciclos tarda en completarse la secuencia completa de 7 instrucciones? Aplica la fórmula N + 4.
3. Si añadieras `addi x0, t0, 1` al final, ¿cambiaría el valor de x0? Justifica tu respuesta.
4. ¿Qué diferencia hay entre el valor de PC en el historial ("PC antes") y la instrucción que aparece en IF ese ciclo?
5. Describe la función de cada registro inter-etapa: IF/ID, ID/EX, EX/MEM, MEM/WB.
6. ¿Qué señal de control `RegWrite` debería estar activa para `add t4, t0, t1`? ¿Cuándo se activa `MemRead`?
7. Repite el programa añadiendo `nop` entre las cuatro `li` y el `add`. ¿Cambia el resultado final? ¿Cambia el número de ciclos?
8. ¿Por qué en este programa no aparece ningún badge de "Anticipación" (Forwarding) en el historial?

---

## 8. Soluciones orientativas

1. `add t4` entra en ID en el ciclo 5. rs1Val = 10 (t0) y rs2Val = 25 (t1), leídos del banco de registros. Como `li t0` y `li t1` completaron WB en los ciclos 5 y 6 respectivamente, los valores ya están actualizados en el banco de registros gracias al diseño del ciclo (WB escribe antes de que ID lea).
2. Con 7 instrucciones: 7 + 4 = **11 ciclos**.
3. No. El simulador fuerza `x0 = 0n` en cada ciclo WB. Cualquier intento de escritura en x0 es ignorado.
4. El "PC antes" indica la dirección de instrucción que se capturó en ese ciclo. En cada ciclo sin stall, el PC aumenta en 4 (una instrucción hacia adelante, usando el índice entero del simulador).
5. **IF/ID**: almacena la instrucción recién capturada de la memoria de instrucciones. **ID/EX**: almacena la instrucción decodificada, los valores de rs1 y rs2 leídos del banco de registros, y las señales de control. **EX/MEM**: almacena el resultado de la ALU (`aluResult`) y el valor a guardar si es un store. **MEM/WB**: almacena el resultado final (de ALU o de memoria) listo para ser escrito en el registro destino.
6. `RegWrite = 1` para todas las instrucciones que producen un resultado (R-type, I-type ALU, cargas). `MemRead = 1` solo para `lw` y `ld`.
7. El resultado final es idéntico. Añadir `nop` entre las `li` y el `add` introduce 1 ciclo adicional por `nop`, alargando la ejecución total en 4 ciclos (un `nop` por cada instrucción de `nop` añadida), pero no afecta la corrección.
8. Porque no hay dependencias RAW cercanas: cuando `add`, `sub` y `xor` leen sus operandos en ID, los registros fuente ya fueron escritos por WB en ciclos anteriores. No es necesario anticipar ningún dato desde registros inter-etapa.
