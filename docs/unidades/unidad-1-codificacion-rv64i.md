# Unidad 1: Codificación y ejecución básica RV64I

## 1. Introducción

Esta unidad presenta el funcionamiento básico del pipeline de 5 etapas (IF, ID, EX, MEM, WB) usando instrucciones simples de la arquitectura RV64I: carga de inmediatos, operaciones aritméticas y lógicas. El objetivo es familiarizarse con el flujo de instrucciones ciclo a ciclo sin la distracción de riesgos complejos.

Los registros son de 64 bits y se representan internamente con `BigInt` en JavaScript. El banco de registros contiene 32 registros (x0–x31); x0/zero está cableado a cero y nunca puede modificarse.

---

## 2. Objetivos operativos

Al finalizar esta unidad el estudiante debe ser capaz de:

1. Describir las cinco etapas del pipeline y qué ocurre en cada una.
2. Explicar qué información contiene cada registro inter-etapa (IF/ID, ID/EX, EX/MEM, MEM/WB).
3. Interpretar el historial por ciclos e identificar qué instrucción está en cada etapa.
4. Calcular el ciclo en que termina una secuencia de instrucciones sin hazards.
5. Verificar que x0/zero permanece siempre a 0 incluso si se intenta escribirlo.
6. Identificar el valor de PC antes y después de ejecutar cada instrucción.

---

## 3. Código de partida

Copia el siguiente programa en el simulador:

```assembly
li   t0, 10        # t0 = 10
li   t1, 25        # t1 = 25
add  t2, t0, t1    # t2 = t0 + t1 = 35
sub  t3, t2, t0    # t3 = t2 - t0 = 25
and  t4, t2, t1    # t4 = 35 & 25 = 1 (0b00100011 & 0b00011001 = 0b00000001)
or   t5, t0, t1    # t5 = 10 | 25 = 27
xor  t6, t0, t1    # t6 = 10 ^ 25 = 19
```

---

## 4. Configuración del simulador

| Parámetro | Valor |
|---|---|
| Forwarding | **Activado** |
| Flush (Branch) | **Activado** |
| Escenario relacionado | *RV64I: Pipeline básico* |

> **Nota:** Con forwarding activado, estas instrucciones no generan stalls, lo que permite ver el pipeline limpio.

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
10. Abre el **Historial por ciclos** y observa columnas: IF, ID, EX, MEM, WB.

---

## 6. Qué debe observar el estudiante

| Ciclo | IF | ID | EX | MEM | WB | Evento |
|---|---|---|---|---|---|---|
| 1 | li t0,10 | – | – | – | – | Primera captura |
| 2 | li t1,25 | li t0,10 | – | – | – | Solapamiento |
| 3 | add … | li t1,25 | li t0,10 | – | – | 3 instrucciones en vuelo |
| 5 | xor … | or … | and … | sub … | add … | Pipeline lleno |
| 9 | – | – | – | – | xor … | Última instrucción en WB |

**Valores finales esperados:**

| Registro | Valor |
|---|---|
| t0 | 10 |
| t1 | 25 |
| t2 | 35 |
| t3 | 25 |
| t4 | 1 |
| t5 | 27 |
| t6 | 19 |

---

## 7. Ejercicios de autoevaluación

1. ¿En qué ciclo entra `add t2, t0, t1` a la etapa ID? ¿Qué valores tienen rs1Val y rs2Val en el registro ID/EX?
2. ¿Cuántos ciclos tarda en completarse la secuencia completa de 7 instrucciones (desde ciclo 1 hasta que WB procesa la última)?
3. Si añadieras `addi x0, t0, 1` al final, ¿cambiaría el valor de x0? Justifica tu respuesta.
4. ¿Qué diferencia hay entre el valor de PC en el historial ("PC antes") y la instrucción que aparece en IF ese ciclo?
5. Describe la función de cada registro inter-etapa: IF/ID, ID/EX, EX/MEM, MEM/WB.
6. ¿Qué señal de control `RegWrite` debería estar activa para `add t2, t0, t1`? ¿Cuándo se activa `MemRead`?
7. Repite el programa añadiendo `nop` entre `add` y `sub`. ¿Cambia el resultado? ¿Cambia el número de ciclos?

---

## 8. Soluciones orientativas

1. `add` entra en ID en el ciclo 3. rs1Val = 10 (t0) y rs2Val = 25 (t1), leídos del banco de registros al inicio del ciclo 3.
2. La última instrucción (`xor`) entra en IF en el ciclo 7 y llega a WB en el ciclo 11, por lo que el total es **11 ciclos** (7 instrucciones + 4 ciclos de llenado/vaciado).
3. No. El simulador fuerza `x0 = 0n` en cada ciclo WB. Cualquier escritura en x0 es ignorada.
4. El "PC antes" indica la dirección de instrucción que se estaba capturando en ese ciclo. En el ciclo siguiente, el PC ya apunta a la siguiente instrucción (PC + 4 en formato simulado).
5. IF/ID almacena la instrucción recién capturada. ID/EX almacena la instrucción decodificada y los valores de registros. EX/MEM almacena el resultado de la ALU y el valor a guardar (para stores). MEM/WB almacena el resultado final (ALU o dato de memoria) listo para escribirse en registro.
6. `RegWrite = 1` para todas las aritméticas/lógicas. `MemRead = 1` solo para `lw` y `ld`.
7. El resultado es idéntico. Añadir `nop` introduce 1 ciclo adicional por instrucción, alargando la ejecución total en 1 ciclo (no hay hazards que resolver).
