import * as XLSX from "xlsx";
import { ordenarFilas } from "./traceability";

export function exportarPlanillaExcel(planilla) {
  const filas = ordenarFilas(planilla.planilla_neumaticos || []);

  const encabezado = [
    ["Patente", planilla.matricula],
    ["Tipo", planilla.tipo],
    ["Fecha", planilla.fecha],
    ["Chofer", planilla.chofer || "-"],
    ["Tipo de vehículo", planilla.tipo_vehiculo || "-"],
    ["Km", planilla.km ?? "-"],
    [],
  ];

  const filasTabla = filas.map((f) => ({
    Posición: f.posicion || "-",
    Acción: f.accion,
    Marca: f.marca || "-",
    Modelo: f.modelo || "-",
    Medida: f.medida || "-",
    "N° Serie": f.numero_serie || "-",
    DOT: f.dot || "-",
    Estado: f.estado || "-",
    "% Desgaste": f.porcentaje_desgaste ?? "-",
    Recapado: f.recapado ? "Sí" : "No",
    Reparación: f.reparacion || "-",
    Procedencia: f.procedencia || "-",
    Destino: f.destino || "-",
  }));

  const hoja = XLSX.utils.aoa_to_sheet(encabezado);
  XLSX.utils.sheet_add_json(hoja, filasTabla, { origin: -1 });
  hoja["!cols"] = [
    { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
    { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
    { wch: 20 }, { wch: 20 }, { wch: 20 },
  ];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Planilla");

  if (planilla.observaciones) {
    const hojaObs = XLSX.utils.aoa_to_sheet([["Observaciones"], [planilla.observaciones]]);
    hojaObs["!cols"] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(libro, hojaObs, "Observaciones");
  }

  XLSX.writeFile(libro, `planilla_${planilla.matricula}_${planilla.fecha}.xlsx`);
}

export function exportarEstadoActualExcel(vehiculo, estadoActual) {
  const filas = [...estadoActual]
    .sort((a, b) => String(a.posicion).localeCompare(String(b.posicion), undefined, { numeric: true }))
    .map((f) => ({
      Posición: f.posicion,
      Marca: f.tiene_neumatico === false ? "SIN NEUMÁTICO" : f.marca || "-",
      Modelo: f.tiene_neumatico === false ? "" : f.modelo || "-",
      Medida: f.tiene_neumatico === false ? "" : f.medida || "-",
      "N° Serie": f.tiene_neumatico === false ? "" : f.numero_serie || "-",
      DOT: f.tiene_neumatico === false ? "" : f.dot || "-",
      Estado: f.tiene_neumatico === false ? "" : f.estado || "-",
      "% Desgaste": f.tiene_neumatico === false ? "" : f.porcentaje_desgaste ?? "-",
      Recapado: f.tiene_neumatico === false ? "" : f.recapado ? "Sí" : "No",
      Reparación: f.tiene_neumatico === false ? "" : f.reparacion || "-",
      Proveedor: f.tiene_neumatico === false ? "" : f.proveedor_origen || "-",
    }));

  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja["!cols"] = [
    { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 16 },
  ];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Estado actual");

  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `estado_actual_${vehiculo.matricula}_${fecha}.xlsx`);
}
