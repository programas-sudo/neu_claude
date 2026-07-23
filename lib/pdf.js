import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ordenarFilas } from "./traceability";

// Escribe un bloque de texto respetando el ancho de página y agregando
// páginas nuevas cuando el contenido no entra (antes el texto largo se
// cortaba y no se veía el resto).
function agregarTextoPaginado(doc, texto, x, y, maxWidth, lineHeight = 4.5) {
  const lineas = doc.splitTextToSize(texto, maxWidth);
  const pageHeight = doc.internal.pageSize.getHeight();
  const margenInferior = 15;
  for (const linea of lineas) {
    if (y + lineHeight > pageHeight - margenInferior) {
      doc.addPage();
      y = 15;
    }
    doc.text(linea, x, y);
    y += lineHeight;
  }
  return y;
}

function agregarBloqueTitulado(doc, titulo, texto, y) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + 12 > pageHeight - 15) {
    doc.addPage();
    y = 15;
  }
  doc.setFontSize(11);
  doc.text(titulo, 14, y);
  y += 6;
  doc.setFontSize(9);
  y = agregarTextoPaginado(doc, texto, 14, y, 180);
  return y + 6;
}

export function exportarPlanillaPDF(planilla) {
  const doc = new jsPDF();

  doc.setFontSize(14);
  doc.text("Planilla de Neumáticos", 14, 15);

  doc.setFontSize(10);
  const cabecera = [
    `Matrícula: ${planilla.matricula}`,
    `Tipo: ${planilla.tipo}`,
    `Fecha: ${planilla.fecha}`,
    `Chofer: ${planilla.chofer || "-"}`,
    `Tipo de vehículo: ${planilla.tipo_vehiculo || "-"}`,
    `Km: ${planilla.km ?? "-"}`,
  ];
  doc.text(cabecera, 14, 24);

  const filasOrdenadas = ordenarFilas(planilla.planilla_neumaticos || []);
  const filas = filasOrdenadas.map((f) => [
    f.posicion || "-",
    f.accion,
    f.marca || "-",
    f.modelo || "-",
    f.medida || "-",
    f.numero_serie || f.dot || (f.sin_identificacion ? "s/identificación" : "-"),
    f.estado || "-",
    f.porcentaje_desgaste != null ? `${f.porcentaje_desgaste}%` : "-",
  ]);

  autoTable(doc, {
    startY: 55,
    head: [["Pos.", "Acción", "Marca", "Modelo", "Medida", "Serie/DOT", "Estado", "% Desgaste"]],
    body: filas,
    styles: { fontSize: 8 },
  });

  let y = doc.lastAutoTable.finalY + 10;

  if (planilla.informe_automatico) {
    y = agregarBloqueTitulado(doc, "Informe automático:", planilla.informe_automatico, y);
  }
  if (planilla.observaciones) {
    y = agregarBloqueTitulado(doc, "Observaciones:", planilla.observaciones, y);
  }

  doc.save(`planilla_${planilla.matricula}_${planilla.fecha}.pdf`);
}

export function exportarEstadoActualPDF(vehiculo, estadoActual) {
  const doc = new jsPDF();

  doc.setFontSize(14);
  doc.text("Estado actual de neumáticos", 14, 15);
  doc.setFontSize(10);
  doc.text(
    [`Matrícula: ${vehiculo.matricula}`, `Tipo de vehículo: ${vehiculo.tipo_vehiculo || "-"}`],
    14,
    24
  );

  const filas = [...estadoActual]
    .sort((a, b) => String(a.posicion).localeCompare(String(b.posicion), undefined, { numeric: true }))
    .map((f) => [
      f.posicion,
      f.tiene_neumatico === false ? "SIN NEUMÁTICO" : f.marca || "-",
      f.tiene_neumatico === false ? "" : f.modelo || "-",
      f.tiene_neumatico === false ? "" : f.medida || "-",
      f.tiene_neumatico === false ? "" : f.numero_serie || f.dot || "s/identificación",
      f.tiene_neumatico === false ? "" : f.estado || "-",
      f.tiene_neumatico === false ? "" : f.porcentaje_desgaste != null ? `${f.porcentaje_desgaste}%` : "-",
    ]);

  autoTable(doc, {
    startY: 34,
    head: [["Posición", "Marca", "Modelo", "Medida", "Serie/DOT", "Estado", "% Desgaste"]],
    body: filas,
    styles: { fontSize: 8 },
  });

  const fecha = new Date().toISOString().slice(0, 10);
  doc.save(`estado_actual_${vehiculo.matricula}_${fecha}.pdf`);
}
