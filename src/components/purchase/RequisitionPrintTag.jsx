import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

const urgencyLabels = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  critical: "CRITICAL"
};

export default function RequisitionPrintTag({ requisition }) {
  const printRef = useRef();

  const handlePrint = () => {
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open('', '', 'width=300,height=400');
    printWindow.document.write(`
      <html>
        <head>
          <title>Requisition Tag</title>
          <style>
            @page { 
              size: 80mm auto; 
              margin: 2mm;
            }
            body { 
              font-family: 'Courier New', monospace;
              font-size: 12px;
              margin: 0;
              padding: 8px;
              width: 76mm;
            }
            .tag {
              border: 2px solid #000;
              padding: 8px;
            }
            .header {
              text-align: center;
              font-size: 14px;
              font-weight: bold;
              border-bottom: 1px dashed #000;
              padding-bottom: 6px;
              margin-bottom: 6px;
            }
            .urgency {
              text-align: center;
              font-size: 16px;
              font-weight: bold;
              padding: 4px;
              margin: 6px 0;
              border: 2px solid #000;
            }
            .urgency.critical { background: #000; color: #fff; }
            .urgency.high { background: #666; color: #fff; }
            .row {
              display: flex;
              justify-content: space-between;
              margin: 4px 0;
            }
            .label { font-weight: bold; }
            .sku { 
              font-size: 14px; 
              font-weight: bold;
              text-align: center;
              margin: 8px 0;
            }
            .name {
              text-align: center;
              font-size: 13px;
              margin-bottom: 8px;
            }
            .footer {
              border-top: 1px dashed #000;
              padding-top: 6px;
              margin-top: 6px;
              font-size: 10px;
              text-align: center;
            }
          </style>
        </head>
        <body>
          ${printContent}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const req = requisition;

  return (
    <div>
      <div ref={printRef}>
        <div className="tag">
          <div className="header">REORDER REQUEST</div>
          <div className="sku">{req.item_sku}</div>
          <div className="name">{req.item_name}</div>
          <div className={`urgency ${req.urgency}`}>
            {urgencyLabels[req.urgency]}
          </div>
          <div className="row">
            <span className="label">Current:</span>
            <span>{req.current_qty}</span>
          </div>
          <div className="row">
            <span className="label">Order Qty:</span>
            <span>{req.suggested_qty}</span>
          </div>
          <div className="row">
            <span className="label">Requested:</span>
            <span>{req.requested_by}</span>
          </div>
          <div className="footer">
            {new Date(req.requested_at).toLocaleDateString()} {new Date(req.requested_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          </div>
        </div>
      </div>

      {/* Preview styled for screen */}
      <div className="mt-4 p-4 bg-white text-black rounded-lg font-mono text-sm">
        <div className="border-2 border-black p-3">
          <div className="text-center font-bold text-base border-b border-dashed border-black pb-2 mb-2">
            REORDER REQUEST
          </div>
          <div className="text-center font-bold text-lg">{req.item_sku}</div>
          <div className="text-center mb-2">{req.item_name}</div>
          <div className={`text-center font-bold py-1 border-2 border-black mb-2 ${
            req.urgency === 'critical' ? 'bg-black text-white' :
            req.urgency === 'high' ? 'bg-gray-600 text-white' : ''
          }`}>
            {urgencyLabels[req.urgency]}
          </div>
          <div className="flex justify-between">
            <span className="font-bold">Current:</span>
            <span>{req.current_qty}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold">Order Qty:</span>
            <span>{req.suggested_qty}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold">Requested:</span>
            <span>{req.requested_by}</span>
          </div>
          <div className="text-center text-xs border-t border-dashed border-black pt-2 mt-2">
            {new Date(req.requested_at).toLocaleDateString()} {new Date(req.requested_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          </div>
        </div>
      </div>

      <Button onClick={handlePrint} className="w-full mt-4 bg-orange-500 hover:bg-orange-600">
        <Printer className="w-4 h-4 mr-2" />
        Print Tag
      </Button>
    </div>
  );
}