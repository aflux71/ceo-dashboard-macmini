import React from "react";

export default function RecipeBatchSheet({ recipes, showVerifyCheckboxes = true }) {
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  return (
    <div className="print-batch-sheet bg-white text-black p-8">
      <style>{`
        @media print {
          @page {
            margin: 0.6in 0.5in;
            size: letter;
          }
          body * { visibility: hidden; }
          .print-batch-sheet, .print-batch-sheet * { visibility: visible; }
          .print-batch-sheet { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .page-break { page-break-after: always; }
          .no-print { display: none !important; }
        }
        .print-batch-sheet {
          font-family: Arial, sans-serif;
          font-size: 12px;
          line-height: 1.4;
        }
        .batch-header {
          border-bottom: 2px solid #333;
          padding-bottom: 12px;
          margin-bottom: 16px;
        }
        .section-title {
          background: #f3f4f6;
          padding: 8px 12px;
          font-weight: bold;
          border: 1px solid #d1d5db;
          margin-bottom: 0;
        }
        .checkbox-row {
          display: flex;
          align-items: flex-start;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-top: none;
        }
        .checkbox {
          width: 18px;
          height: 18px;
          border: 2px solid #374151;
          margin-right: 12px;
          flex-shrink: 0;
        }
        .verify-section {
          margin-top: 8px;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-top: none;
          background: #fef3c7;
        }
        .signature-line {
          border-bottom: 1px solid #374151;
          min-width: 150px;
          display: inline-block;
          margin-left: 8px;
        }
        .ingredients-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 16px;
        }
        .ingredients-table th,
        .ingredients-table td {
          border: 1px solid #d1d5db;
          padding: 8px;
          text-align: left;
        }
        .ingredients-table th {
          background: #f3f4f6;
          font-weight: bold;
        }
        .ingredients-table tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .recipe-page {
          margin-bottom: 32px;
        }
        .section-block {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .section-header-keep {
          page-break-after: avoid;
          break-after: avoid;
        }
        .checkbox-row {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .ingredients-table thead {
          display: table-header-group;
        }
        .ingredients-table tbody tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .verify-section {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        h2.section-title {
          page-break-after: avoid;
          break-after: avoid;
        }
      `}</style>

      {recipes.map((recipe, recipeIdx) => (
        <div key={recipe.id} className={`recipe-page ${recipeIdx < recipes.length - 1 ? 'page-break' : ''}`}>
          {/* Header */}
          <div className="batch-header">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold mb-1">{recipe.name}</h1>
                <p className="text-gray-600">SKU: {recipe.sku} | Category: {recipe.category}</p>
              </div>
              <div className="text-right">
                <p className="font-bold">BATCH RECORD</p>
                <p className="text-sm text-gray-600">{currentDate}</p>
              </div>
            </div>
          </div>

          {/* Batch Info Section */}
          <div className="mb-6">
            <div className="grid grid-cols-3 gap-4 p-4 border border-gray-300 rounded">
              <div>
                <p className="text-xs text-gray-500 uppercase">Batch ID</p>
                <p className="font-bold border-b border-gray-400 pb-1 min-h-6"></p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Production Date</p>
                <p className="font-bold border-b border-gray-400 pb-1 min-h-6"></p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Operator</p>
                <p className="font-bold border-b border-gray-400 pb-1 min-h-6"></p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Batch Size</p>
                <p className="font-bold">{recipe.batch_size} units</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Production Line</p>
                <p className="font-bold">Line {recipe.production_line || 1}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Expiry Date</p>
                <p className="font-bold border-b border-gray-400 pb-1 min-h-6"></p>
              </div>
            </div>
          </div>

          {/* Ingredients Section */}
          {recipe.ingredients?.length > 0 && (
            <div className="mb-6">
              <h2 className="section-title">INGREDIENTS / BILL OF MATERIALS</h2>
              <table className="ingredients-table">
                <thead>
                  <tr>
                    {showVerifyCheckboxes && <th className="w-12">✓</th>}
                    <th>SKU</th>
                    <th>Material</th>
                    <th className="w-24">Target Qty</th>
                    <th className="w-24">Actual Qty</th>
                    <th className="w-16">Unit</th>
                    {showVerifyCheckboxes && <th className="w-32">Verified By</th>}
                  </tr>
                </thead>
                <tbody>
                  {recipe.ingredients.map((ing, idx) => (
                    <tr key={idx}>
                      {showVerifyCheckboxes && (
                        <td className="text-center">
                          <div className="checkbox mx-auto"></div>
                        </td>
                      )}
                      <td className="font-mono text-sm">{ing.sku}</td>
                      <td>{ing.material}</td>
                      <td className="text-right font-bold">{ing.qty}</td>
                      <td></td>
                      <td>{ing.unit}</td>
                      {showVerifyCheckboxes && <td></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {showVerifyCheckboxes && (
                <div className="verify-section">
                  <strong>Materials Verification:</strong> All materials checked and quantities confirmed.
                  <br />
                  <span className="mt-2 inline-block">
                    Signature: <span className="signature-line"></span>
                    &nbsp;&nbsp;&nbsp;Date: <span className="signature-line" style={{minWidth: '100px'}}></span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Packaging Components Section */}
          {recipe.packaging?.length > 0 && (
            <div className="mb-6">
              <h2 className="section-title">PACKAGING COMPONENTS</h2>
              <table className="ingredients-table">
                <thead>
                  <tr>
                    {showVerifyCheckboxes && <th className="w-12">✓</th>}
                    <th>SKU</th>
                    <th>Item</th>
                    <th className="w-32">Qty / Unit</th>
                    <th className="w-32">Qty / Batch</th>
                    {showVerifyCheckboxes && <th className="w-32">Verified By</th>}
                  </tr>
                </thead>
                <tbody>
                  {recipe.packaging.map((pkg, idx) => (
                    <tr key={idx}>
                      {showVerifyCheckboxes && (
                        <td className="text-center">
                          <div className="checkbox mx-auto"></div>
                        </td>
                      )}
                      <td className="font-mono text-sm">{pkg.sku}</td>
                      <td>{pkg.name}</td>
                      <td className="text-right font-bold">{pkg.qty_per_unit}</td>
                      <td className="text-right font-bold">{pkg.qty_per_batch ?? (pkg.qty_per_unit * recipe.batch_size)}</td>
                      {showVerifyCheckboxes && <td></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {showVerifyCheckboxes && (
                <div className="verify-section">
                  <strong>Packaging Verification:</strong> All packaging components checked and quantities confirmed.
                  <br />
                  <span className="mt-2 inline-block">
                    Signature: <span className="signature-line"></span>
                    &nbsp;&nbsp;&nbsp;Date: <span className="signature-line" style={{minWidth: '100px'}}></span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Manufacturing Procedures Section */}
          {recipe.procedures?.length > 0 && (
            <div className="mb-6">
              <h2 className="section-title">MANUFACTURING PROCEDURES (SOP)</h2>
              {recipe.procedures.map((proc, idx) => (
                <div key={idx} className="checkbox-row">
                  {showVerifyCheckboxes && <div className="checkbox"></div>}
                  <div className="flex-1">
                    <div className="flex items-start gap-3">
                      <span className="font-bold text-gray-700 min-w-8">
                        Step {proc.step}:
                      </span>
                      <div className="flex-1">
                        <p>{proc.description}</p>
                        {proc.duration_minutes > 0 && (
                          <p className="text-xs text-gray-500 mt-1">
                            Duration: {proc.duration_minutes} minutes
                          </p>
                        )}
                        {proc.notes && (
                          <p className="text-xs text-gray-500 italic mt-1">
                            Note: {proc.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  {showVerifyCheckboxes && (
                    <div className="text-xs text-gray-400 ml-4 w-32">
                      Initials: _______
                    </div>
                  )}
                </div>
              ))}
              {showVerifyCheckboxes && (
                <div className="verify-section">
                  <strong>Procedures Verification:</strong> All steps completed as documented.
                  <br />
                  <span className="mt-2 inline-block">
                    Signature: <span className="signature-line"></span>
                    &nbsp;&nbsp;&nbsp;Date: <span className="signature-line" style={{minWidth: '100px'}}></span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* QC Checkpoints Section */}
          {recipe.qc_checks?.length > 0 && (
            <div className="mb-6">
              <h2 className="section-title">QUALITY CONTROL CHECKPOINTS</h2>
              <table className="ingredients-table">
                <thead>
                  <tr>
                    {showVerifyCheckboxes && <th className="w-12">Pass</th>}
                    <th>Checkpoint</th>
                    <th>Criteria</th>
                    <th>Method</th>
                    {showVerifyCheckboxes && (
                      <>
                        <th className="w-24">Result</th>
                        <th className="w-32">Checked By</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {recipe.qc_checks.map((qc, idx) => (
                    <tr key={idx}>
                      {showVerifyCheckboxes && (
                        <td className="text-center">
                          <div className="checkbox mx-auto"></div>
                        </td>
                      )}
                      <td className="font-medium">{qc.checkpoint}</td>
                      <td>{qc.criteria}</td>
                      <td>{qc.method}</td>
                      {showVerifyCheckboxes && (
                        <>
                          <td></td>
                          <td></td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {showVerifyCheckboxes && (
                <div className="verify-section">
                  <strong>QC Verification:</strong> All quality checks passed.
                  <br />
                  <span className="mt-2 inline-block">
                    QC Signature: <span className="signature-line"></span>
                    &nbsp;&nbsp;&nbsp;Date: <span className="signature-line" style={{minWidth: '100px'}}></span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Notes Section */}
          <div className="mb-6">
            <h2 className="section-title">BATCH NOTES</h2>
            <div className="border border-gray-300 border-t-0 p-4 min-h-24">
              <div className="border-b border-gray-200 mb-2 pb-2"></div>
              <div className="border-b border-gray-200 mb-2 pb-2"></div>
              <div className="border-b border-gray-200 mb-2 pb-2"></div>
            </div>
          </div>

          {/* Final Approval Section */}
          {showVerifyCheckboxes && (
            <div className="border-2 border-gray-400 p-4 bg-gray-50">
              <h2 className="font-bold mb-4">FINAL BATCH APPROVAL</h2>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="text-sm mb-2">Produced By:</p>
                  <p>Name: <span className="signature-line"></span></p>
                  <p className="mt-2">Signature: <span className="signature-line"></span></p>
                  <p className="mt-2">Date: <span className="signature-line" style={{minWidth: '100px'}}></span></p>
                </div>
                <div>
                  <p className="text-sm mb-2">Approved By (Supervisor):</p>
                  <p>Name: <span className="signature-line"></span></p>
                  <p className="mt-2">Signature: <span className="signature-line"></span></p>
                  <p className="mt-2">Date: <span className="signature-line" style={{minWidth: '100px'}}></span></p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-300">
                <div className="flex items-center gap-4">
                  <div className="checkbox"></div>
                  <span><strong>BATCH APPROVED</strong> - Ready for inventory</span>
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <div className="checkbox"></div>
                  <span><strong>BATCH REJECTED</strong> - Reason: <span className="signature-line" style={{minWidth: '200px'}}></span></span>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}