# Unidad 2: Forwarding (Anticipación de Datos)

## 1. Introducción

Cuando una instrucción aritmética produce un valor que la siguiente instrucción necesita como operando, se produce una **dependencia RAW** (*Read After Write*). Sin forwarding, el valor solo estaría disponible tras el ciclo WB (3 ciclos después), lo que obliga a insertar burbujas. La técnica de **forwarding** o **anticipación de datos** consiste en conectar la salida de EX/MEM o MEM/WB directamente a la entrada de la ALU, evitando la mayoría de stalls.

Esta unidad estudia cuándo y cómo actúa el forwarding, y qué ocurre cuando se desactiva.

---

## 2. Objetivos operativos

1. Identificar dependencias RAW en un fragmento de código assembly.
2. Explicar por qué EX/MEM puede anticipar un ciclo antes que MEM/WB.
3. Interpretar las señales `ForwardA` y `ForwardB` en el panel de señales.
4. Observar la diferencia entre ejecución con y sin forwarding.
5. Calcular el número de stalls que se insertan al desactivar forwarding.
6. Justificar por qué el forwarding desde EX/MEM tiene prioridad sobre MEM/WB.

---

## 3. Código de partida

```assembly
li  t0, 5
li  t1, 10
add t2, t0, t1    # t2 = 15  (necesita t0, t1 de instrucciones anteriores)
sub t3, t2, t0    # t3 = 10  (necesita t2, dependencia RAW con add)
and t4, t3, t1    # t4 = 8   (necesita t3, dependencia RAW con sub)
or  t5, t4, t0    # t5 = 13  (necesita t4, dependencia RAW con and)
```

---

## 4. Configuración del simulador

### Parte A – Con forwarding

| Parámetro | Valor |
|---|---|
| Forwarding | **Activado** |
| Flush | Activado (no relevante aquí) |
| Escenario | *RV64I: Anticipación aritmética* |

### Parte B – Sin forwarding

| Parámetro | Valor |
|---|---|
| Forwarding | **Desactivado** |
| Flush | Activado |

> **Importante:** Cambia el toggle de Forwarding **antes de cargar** el programa, o recarga después de cambiar.

---

## 5. Pasos de interacción con el simulador

### Parte A: Forwarding activado

1. Carga el programa con Forwarding **activado**.
2. Avanza ciclo a ciclo hasta el ciclo 5.
3. En el ciclo 5, `add` está en EX y `sub` está en ID/EX. Observa en el panel de **Señales** que `ForwardA = 1`.
4. Observa el historial: no aparece ninguna fila con Stall = Sí.
5. Avanza hasta el final. Verifica los valores finales.

### Parte B: Sin forwarding

1. Recarga el programa con Forwarding **desactivado**.
2. Avanza ciclo a ciclo. En el ciclo 4, cuando `sub` entra en ID, detecta que `add` (en ID/EX) aún no ha escrito t2. Se inserta un stall.
3. Observa en el historial: Stall = Sí, stallReason = "RAW hazard without forwarding".
4. Cuenta cuántos stalls se insertan en total.
5. Verifica que los valores finales son **idénticos** a los de la Parte A (el forwarding no cambia la corrección, solo la velocidad).

---

## 6. Qué debe observar el estudiante

### Con forwarding activado (sin stalls)

| Ciclo | EX instrucción | Forwarding activo |
|---|---|---|
| 4 | `li t1` en WB, `add` en EX | No hay dependencia resuelta aún |
| 5 | `add` en MEM, `sub` en EX | **ForwardA desde EX/MEM** (t2 recién calculado) |
| 6 | `sub` en MEM, `and` en EX | **ForwardA desde EX/MEM** (t3 recién calculado) |
| 7 | `and` en MEM, `or` en EX  | **ForwardA desde EX/MEM** (t4 recién calculado) |

### Sin forwarding

Cada instrucción que depende de la anterior debe esperar hasta que la productora complete WB, lo que genera **2 stalls** por dependencia RAW directa. Con 3 dependencias consecutivas, el total puede ser 6 stalls adicionales (la instrucción espera en ID hasta que el productor completa MEM/WB).

---

## 7. Ejercicios de autoevaluación

1. ¿Por qué EX/MEM puede anticipar antes que MEM/WB? ¿Qué dato contiene EX/MEM que ya está disponible?
2. ¿Qué ocurre si la instrucción productora es un `lw`? ¿Puede anticiparse desde EX/MEM?
3. Con el programa dado y forwarding desactivado, ¿cuántos ciclos tarda la ejecución completa? ¿Y con forwarding?
4. Añade `li t6, 0` al final. ¿Genera alguna dependencia? ¿Por qué?
5. ¿Qué significa que `ForwardA = 1` y `ForwardB = 0` al mismo tiempo?
6. Si intercambias `sub t3, t2, t0` y `li t6, 99` (instrucción sin dependencia), ¿cuántos stalls se eliminan con forwarding desactivado?
7. Describe la diferencia entre anticipación desde EX/MEM y desde MEM/WB.
8. ¿El panel de señales muestra el estado de ID/EX o de EX/MEM? ¿Por qué es relevante?

---

## 8. Soluciones orientativas

1. EX/MEM ya contiene el resultado `aluResult` del ciclo anterior, que es el valor que la siguiente instrucción necesita en EX. MEM/WB lo contiene un ciclo más tarde, tras pasar por la etapa de memoria.
2. No. Si la instrucción productora es `lw`, el dato (`memData`) solo está disponible al final de MEM, un ciclo demasiado tarde para anticipar hacia EX en el ciclo siguiente. Por eso `lw` seguido de un uso inmediato requiere un stall incluso con forwarding (load-use hazard).
3. Con forwarding: ≈ 10 ciclos. Sin forwarding: cada dependencia RAW añade 2 stalls, con 3 dependencias consecutivas → ≈ 16 ciclos.
4. `li t6, 0` expande a `addi t6, x0, 0`. No usa ningún registro escrito por `or t5`, así que no genera dependencia.
5. Significa que el operando A (rs1) fue anticipado pero rs2 no necesitaba anticipación (su valor ya estaba actualizado en el banco de registros o era una instrucción de tipo inmediato que no usa rs2).
6. Al intercalar `li t6, 99` entre el productor y el consumidor, hay 1 ciclo de distancia extra, lo que en muchos casos permite que WB ocurra antes de que el consumidor entre en EX, eliminando 1 de los 2 stalls.
7. Desde EX/MEM: el valor viene directo de la ALU del ciclo anterior (aluResult). Desde MEM/WB: puede ser un resultado de ALU o un dato cargado de memoria (memData).
8. El panel de señales muestra señales de ID/EX (la instrucción que está a punto de ejecutarse). ForwardA/B se muestran usando el último history entry porque se calculan durante EX.
