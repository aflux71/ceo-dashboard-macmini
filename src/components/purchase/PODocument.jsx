import React, { useRef } from "react";
import { Printer, Download, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Badge from "@/components/ui/Badge";
import { jsPDF } from "jspdf";

export default function PODocument({ po, onEdit, onDelete, companyName = "neōb" }) {
  const printRef = useRef();

  const handlePrint = () => {
    const printContent = printRef.current?.innerHTML;
    const printWindow = window.open('', '', 'height=800,width=1000');
    printWindow.document.write(`
      <html>
        <head>
          <title>${po.po_number} - Purchase Order</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
            .logo { font-size: 28px; font-weight: bold; }
            .po-info { text-align: right; }
            .section { margin-bottom: 20px; }
            .section-title { font-weight: bold; font-size: 14px; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background: #f5f5f5; font-weight: 600; }
            .total-row { font-weight: bold; background: #f9f9f9; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleDownload = async () => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    // Header
    pdf.setFontSize(12);
    pdf.setFont(undefined, 'bold');
    pdf.text(companyName, margin, y);
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'normal');
    pdf.text('Purchase Order', margin, y + 5);

    // PO Number & Status
    pdf.setFontSize(16);
    pdf.setFont(undefined, 'bold');
    pdf.text(po.po_number, pageWidth - margin, y, { align: 'right' });
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'normal');
    pdf.text(`Status: ${po.status?.toUpperCase() || 'DRAFT'}`, pageWidth - margin, y + 6, { align: 'right' });

    y += 20;
    pdf.setDrawColor(200);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 10;

    // Supplier Info
    pdf.setFontSize(9);
    pdf.setTextColor(100);
    pdf.text('SUPPLIER', margin, y);
    pdf.text('ORDER DETAILS', pageWidth / 2 + 10, y);
    y += 6;
    pdf.setTextColor(0);
    pdf.setFontSize(11);
    pdf.setFont(undefined, 'bold');
    pdf.text(po.supplier || '-', margin, y);
    pdf.setFont(undefined, 'normal');
    pdf.setFontSize(10);
    pdf.text(`Order Date: ${po.order_date ? new Date(po.order_date).toLocaleDateString() : '-'}`, pageWidth / 2 + 10, y);
    y += 5;
    if (po.supplier_contact) {
      pdf.setFontSize(9);
      pdf.text(po.supplier_contact, margin, y);
    }
    pdf.setFontSize(10);
    pdf.text(`Expected: ${po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '-'}`, pageWidth / 2 + 10, y);
    y += 15;

    // Items Table Header
    pdf.setFillColor(245, 245, 245);
    pdf.rect(margin, y - 4, pageWidth - margin * 2, 8, 'F');
    pdf.setFontSize(8);
    pdf.setTextColor(80);
    pdf.text('SKU', margin + 2, y);
    pdf.text('DESCRIPTION', margin + 30, y);
    pdf.text('QTY', pageWidth - margin - 60, y, { align: 'right' });
    pdf.text('UNIT COST', pageWidth - margin - 30, y, { align: 'right' });
    pdf.text('TOTAL', pageWidth - margin - 2, y, { align: 'right' });
    y += 8;

    // Items
    pdf.setTextColor(0);
    pdf.setFontSize(9);
    (po.items || []).forEach((item) => {
      pdf.text(item.sku || '-', margin + 2, y);
      pdf.text((item.name || '-').substring(0, 35), margin + 30, y);
      pdf.text(`${item.quantity} ${item.unit || ''}`, pageWidth - margin - 60, y, { align: 'right' });
      pdf.text(`$${(item.unit_cost || 0).toFixed(2)}`, pageWidth - margin - 30, y, { align: 'right' });
      pdf.text(`$${(item.total_cost || 0).toFixed(2)}`, pageWidth - margin - 2, y, { align: 'right' });
      y += 6;
    });

    y += 5;
    pdf.setDrawColor(220);
    pdf.line(pageWidth / 2, y, pageWidth - margin, y);
    y += 8;

    // Totals — labels right-aligned to a fixed column, values right-aligned to page edge
    const labelX = pageWidth - margin - 50; // right edge for labels
    const valueX = pageWidth - margin - 2;  // right edge for values
    pdf.setFontSize(10);
    pdf.text('Subtotal:', labelX, y, { align: 'right' });
    pdf.text(`$${(po.subtotal || 0).toFixed(2)}`, valueX, y, { align: 'right' });
    y += 6;
    if (po.tax > 0) {
      pdf.text('Tax:', labelX, y, { align: 'right' });
      pdf.text(`$${po.tax.toFixed(2)}`, valueX, y, { align: 'right' });
      y += 6;
    }
    if (po.shipping > 0) {
      pdf.text('Shipping:', labelX, y, { align: 'right' });
      pdf.text(`$${po.shipping.toFixed(2)}`, valueX, y, { align: 'right' });
      y += 6;
    }
    y += 2;
    pdf.setFont(undefined, 'bold');
    pdf.setFontSize(12);
    pdf.text('TOTAL:', labelX, y, { align: 'right' });
    pdf.text(`$${(po.total || 0).toFixed(2)} ${po.currency || 'CAD'}`, valueX, y, { align: 'right' });

    // Notes
    if (po.notes) {
      y += 15;
      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(100);
      pdf.text('NOTES', margin, y);
      y += 5;
      pdf.setTextColor(0);
      pdf.text(po.notes, margin, y, { maxWidth: pageWidth - margin * 2 });
    }

    // Footer
    y = pdf.internal.pageSize.getHeight() - 15;
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(`Created by: ${po.created_by_name || po.created_by || '-'}`, margin, y);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, y, { align: 'right' });

    pdf.save(`${po.po_number}.pdf`);
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: '#71717a',
      submitted: '#f59e0b',
      confirmed: '#3b82f6',
      shipped: '#06b6d4',
      received: '#22c55e',
      cancelled: '#ef4444'
    };
    return colors[status] || '#71717a';
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <div className="flex gap-2">
          {po.status === 'draft' && onDelete && (
            <Button variant="outline" onClick={onDelete} className="gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10">
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {po.status !== 'received' && po.status !== 'cancelled' && onEdit && (
            <Button variant="outline" onClick={onEdit} className="gap-2">
              <Edit className="w-4 h-4" /> Edit
            </Button>
          )}
          <Button variant="outline" onClick={handleDownload} className="gap-2">
            <Download className="w-4 h-4" /> Download PDF
          </Button>
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <Printer className="w-4 h-4" /> Print
          </Button>
        </div>
      </div>

      <div ref={printRef} className="bg-zinc-800/50 rounded-lg p-6 border border-zinc-700">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-zinc-600 pb-4 mb-6">
          <div>
            <h2 className="text-3xl font-bold text-zinc-100">{companyName}</h2>
            <p className="text-sm text-zinc-400 mt-1">Purchase Order</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-orange-400">{po.po_number}</p>
            <p className="text-sm text-zinc-400 mt-1" style={{ color: getStatusColor(po.status) }}>
              Status: {po.status?.toUpperCase()}
            </p>
          </div>
        </div>

        {/* Supplier & Order Info */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <h3 className="text-sm font-semibold text-zinc-400 mb-2">SUPPLIER</h3>
            <p className="text-lg text-zinc-100 font-medium">{po.supplier}</p>
            {po.supplier_contact && (
              <p className="text-sm text-zinc-400">{po.supplier_contact}</p>
            )}
          </div>
          <div className="text-right">
            <div className="mb-2">
              <span className="text-sm text-zinc-400">Order Date: </span>
              <span className="text-zinc-100">{po.order_date ? new Date(po.order_date).toLocaleDateString() : '-'}</span>
            </div>
            <div className="mb-2">
              <span className="text-sm text-zinc-400">Expected: </span>
              <span className="text-zinc-100">{po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '-'}</span>
            </div>
            {po.received_date && (
              <div>
                <span className="text-sm text-zinc-400">Received: </span>
                <span className="text-green-400">{new Date(po.received_date).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Line Items */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-zinc-400 mb-3">ORDER ITEMS</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-800/50">
                <th className="text-left py-3 px-4 text-zinc-400">SKU</th>
                <th className="text-left py-3 px-4 text-zinc-400">Description</th>
                <th className="text-right py-3 px-4 text-zinc-400">Qty</th>
                <th className="text-right py-3 px-4 text-zinc-400">Unit Cost</th>
                <th className="text-right py-3 px-4 text-zinc-400">Total</th>
              </tr>
            </thead>
            <tbody>
              {po.items?.map((item, idx) => (
                <tr key={idx} className="border-b border-zinc-800">
                  <td className="py-3 px-4 font-mono text-orange-400">{item.sku}</td>
                  <td className="py-3 px-4 text-zinc-200">{item.name}</td>
                  <td className="py-3 px-4 text-right text-zinc-200">{item.quantity} {item.unit}</td>
                  <td className="py-3 px-4 text-right text-zinc-400">${item.unit_cost?.toFixed(2)}</td>
                  <td className="py-3 px-4 text-right text-zinc-200 font-medium">${item.total_cost?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-zinc-800/50">
                <td colSpan={4} className="py-3 px-4 text-right font-semibold text-zinc-200">Subtotal:</td>
                <td className="py-3 px-4 text-right font-semibold text-zinc-200">${po.subtotal?.toFixed(2) || '0.00'}</td>
              </tr>
              {(po.tax > 0) && (
                <tr className="bg-zinc-800/50">
                  <td colSpan={4} className="py-3 px-4 text-right text-zinc-400">Tax:</td>
                  <td className="py-3 px-4 text-right text-zinc-400">${po.tax?.toFixed(2)}</td>
                </tr>
              )}
              {(po.shipping > 0) && (
                <tr className="bg-zinc-800/50">
                  <td colSpan={4} className="py-3 px-4 text-right text-zinc-400">Shipping:</td>
                  <td className="py-3 px-4 text-right text-zinc-400">${po.shipping?.toFixed(2)}</td>
                </tr>
              )}
              <tr className="bg-orange-500/10 border-t-2 border-orange-500/30">
                <td colSpan={4} className="py-4 px-4 text-right font-bold text-lg text-zinc-100">TOTAL:</td>
                <td className="py-4 px-4 text-right font-bold text-lg text-orange-400">${po.total?.toFixed(2) || '0.00'} {po.currency || 'CAD'}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Notes */}
        {po.notes && (
          <div className="mb-6 p-4 bg-zinc-900/50 rounded-lg">
            <h3 className="text-sm font-semibold text-zinc-400 mb-2">NOTES</h3>
            <p className="text-zinc-300">{po.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="pt-4 border-t border-zinc-700 text-xs text-zinc-500">
          <div className="flex justify-between">
            <span>Created by: {po.created_by_name || po.created_by}</span>
            <span>Generated: {new Date().toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}