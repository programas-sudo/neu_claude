# Sistema de Trazabilidad de Neumáticos

App interna para registrar y consultar el estado y el historial de neumáticos
de la flota de vehículos/equipos de la empresa.

## Qué incluye

- **Buscar por matrícula** (coincidencia parcial): estado actual de cada
  posición (marca, modelo, medida, N° serie, estado, % desgaste), historial
  cronológico completo de todas las planillas cargadas para ese vehículo, y
  desde cada neumático se puede ver su trayecto completo.
- **Buscar por N° de serie / DOT** (coincidencia parcial): trayecto completo
  de un neumático puntual (vehículos, posiciones, fechas, recapados,
  reparaciones), útil para saber hace cuánto está colocado uno que se rompió.
- **Nueva planilla**: relevamiento o movimiento. Se cargan todas las
  posiciones del vehículo (relevamiento completo) o solo las que cambian
  (movimiento parcial: fila "sale" + fila "entra" para la misma posición).
  Genera automáticamente un informe comparando contra la planilla anterior
  del vehículo, tiene campo de observaciones libre, y permite adjuntar PDF,
  Excel o fotos.
- Exportación de cualquier planilla a PDF.
- Un neumático sin número de serie ni DOT queda registrado igual (marca,
  modelo, medida, estado) pero no es trazable entre planillas: el sistema lo
  marca como "sin identificación" y no intenta cruzarlo con otras filas.

## Stack

Next.js (App Router) + Supabase (Postgres + Storage) + Vercel + GitHub.
Sin backend propio: el frontend habla directo con Supabase usando la clave
"anon" (pensado para uso interno de la empresa; ver sección de seguridad).

---

## 1. Puesta en marcha (una sola vez)

### 1.1 Supabase

1. Creá un proyecto nuevo en https://supabase.com (uno solo, para siempre).
2. Andá a **SQL Editor** y pegá el contenido completo de `supabase/schema.sql`.
   Ejecutalo. Esto crea las tablas, vistas, índices y el bucket de Storage.
3. Andá a **Project Settings > API** y copiá:
   - `Project URL`
   - `anon public key`

### 1.2 Repositorio en GitHub

1. Creá un repo nuevo (vacío) en GitHub, por ejemplo `trazabilidad-neumaticos`.
2. Subí este proyecto:
   ```bash
   cd tire-traceability
   git init
   git add .
   git commit -m "Sistema de trazabilidad de neumáticos - versión inicial"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/trazabilidad-neumaticos.git
   git push -u origin main
   ```

### 1.3 Vercel

1. En https://vercel.com, **Add New Project** → elegí el repo que acabás de
   subir. Esto se hace **una sola vez**.
2. En la configuración del proyecto, agregá las variables de entorno:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (los valores que copiaste en el paso 1.1)
3. Deploy. Listo, ya tenés la URL pública de la app.

---

## 2. Cómo modificar la app en el futuro (SIN crear proyectos nuevos)

Esto es clave para tu flujo de trabajo:

- **Cambios de código / interfaz**: editás los archivos localmente (o le
  pedís a Claude que te genere los cambios), y hacés:
  ```bash
  git add .
  git commit -m "descripción del cambio"
  git push
  ```
  Vercel detecta el push al repo **ya conectado** y redeploya automáticamente
  la **misma** app, en la **misma** URL. Nunca hace falta crear un proyecto
  nuevo en Vercel ni en GitHub.

- **Cambios de base de datos** (agregar una columna, una tabla, un campo
  nuevo, etc.): abrís el **mismo** proyecto de Supabase → SQL Editor → corrés
  el `ALTER TABLE` o `CREATE TABLE` que corresponda. Es buena práctica ir
  guardando estos cambios como archivos nuevos en `supabase/migrations/` (por
  ejemplo `supabase/migrations/002_correcciones.sql`) para tener un
  historial, pero se ejecutan sobre el mismo proyecto de siempre.

  Ya existe `supabase/migrations/002_correcciones.sql` con la primera tanda
  de correcciones (ver más abajo). Se corre una sola vez, pegando su
  contenido completo en el SQL Editor de Supabase.

- **Local, antes de subir cambios**:
  ```bash
  npm install
  cp .env.local.example .env.local   # y completar con tus datos de Supabase
  npm run dev
  ```

---

## 3. Estructura del proyecto

```
supabase/schema.sql        → todo el modelo de datos (tablas, vistas, RLS)
lib/supabaseClient.js      → conexión a Supabase
lib/traceability.js        → toda la lógica de negocio (búsquedas, guardado,
                              informe automático, chequeos de consistencia)
lib/pdf.js                 → exportación de planillas a PDF
app/page.js                → home con las 3 funciones
app/buscar-matricula/      → búsqueda por matrícula + historial + trayecto
app/buscar-serie/          → búsqueda por N° de serie/DOT
app/planilla/nueva/        → carga de relevamientos y movimientos
```

Al ser un proyecto chico y sin backend propio, casi cualquier cambio futuro
(agregar un campo, cambiar un texto, agregar una columna a una tabla) se
resuelve tocando 1 o 2 archivos.

## 4. Lógica de trazabilidad (cómo funciona por dentro)

- Cada planilla (relevamiento o movimiento) genera una fila por cada
  neumático reportado, con una `posicion` y una `accion`
  (`permanece` / `entra` / `sale`).
- El **estado actual** de una posición es, para cada `(vehículo, posición)`,
  la fila más reciente en el tiempo que **no** sea `sale`. Esto funciona
  igual de bien con relevamientos completos que con movimientos parciales
  (solo se reportan 2 filas: la que sale y la que entra en esa posición).
- El **trayecto** de un neumático es simplemente todas las filas históricas
  que comparten su número de serie o DOT, ordenadas por fecha.
- Antes de guardar una planilla, el sistema compara cada posición contra el
  estado vigente anterior y arma el **informe automático** de cambios
  (cambio de neumático, variación de desgaste, recapado, reparación, etc.).
- Si un neumático que "entra" en una planilla figura como vigente en otro
  vehículo/posición (porque no se registró su salida ahí), el sistema
  muestra un aviso para que se revise — no bloquea el guardado, para no
  trabar la carga en el día a día, pero deja la inconsistencia visible.
- Un neumático sin número de serie ni DOT se guarda igual (queda su marca,
  modelo, medida, estado), pero no participa de las búsquedas por
  identificador ni del cruce entre planillas.

## 5. Seguridad (a mejorar cuando quieras)

Las políticas de RLS que trae el esquema son permisivas (cualquiera con la
clave `anon` puede leer/escribir), para que arranques rápido sin gestionar
usuarios. Cuando quieras restringirlo:

1. Activá Supabase Auth (email/password o el proveedor que prefieras).
2. Reemplazá las políticas `for all using (true)` del `schema.sql` por
   políticas que chequeen `auth.uid()` o un rol específico.
3. Es un cambio que se hace en el mismo proyecto de Supabase, sin tocar el
   resto de la app.
