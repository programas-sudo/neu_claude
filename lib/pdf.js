import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

  const filas = (planilla.planilla_neumaticos || []).map((f) => [
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
    doc.setFontSize(11);
    doc.text("Informe automático:", 14, y);
    y += 6;
    doc.setFontSize(9);
    const lineas = doc.splitTextToSize(planilla.informe_automatico, 180);
    doc.text(lineas, 14, y);
    y += lineas.length * 4 + 6;
  }

  if (planilla.observaciones) {
    doc.setFontSize(11);
    doc.text("Observaciones:", 14, y);
    y += 6;
    doc.setFontSize(9);
    const lineas = doc.splitTextToSize(planilla.observaciones, 180);
    doc.text(lineas, 14, y);
  }

  doc.save(`planilla_${planilla.matricula}_${planilla.fecha}.pdf`);
}
