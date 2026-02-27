import React, { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Download, Printer, FileText, CheckSquare, Beaker, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function BatchDocument({ batch }) {
  const printRef = useRef();

  const { data: recipe } = useQuery({
    queryKey: ['recipe', batch.recipe_id],
    queryFn: () => batch.recipe_id ? base44.entities.Recipe.filter({ id: batch.recipe_id }) : Promise.resolve([]),
    enabled: !!batch.recipe_id
  });

  const recipeData = recipe?.[0];

  const handlePrint = () => {
    const printContent = printRef.current?.innerHTML;
    const printWindow = window.open('', '', 'height=800,width=1000');
    printWindow.document.write(`
      <html>
        <head>
          <title>${batch.batch_id} - Batch Document</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
            .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .logo { font-size: 24px; font-weight: bold; }
            .section { margin-bottom: 20px; page-break-inside: avoid; }
            .section-title { font-weight: bold; font-size: 14px; border-bottom: 1px solid #333; padding-bottom: 5px; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #333; padding: 8px; text-align: left; }
            th { background: #f0f0f0; font-weight: 600; }
            .checkbox { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #333; margin-right: 8px; }
            .signature-line { border-bottom: 1px solid #333; width: 200px; display: inline-block; margin: 0 10px; }
            .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handlePrint} className="gap-2">
          <Printer className="w-4 h-4" /> Print
        </Button>
      </div>

      <Tabs defaultValue="traveller" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-zinc-800">
          <TabsTrigger value="traveller">Batch Traveller</TabsTrigger>
          <TabsTrigger value="qc">QC Checklist</TabsTrigger>
          <TabsTrigger value="procedures">Procedures</TabsTrigger>
        </TabsList>

        <div ref={printRef}>
          <TabsContent value="traveller" className="mt-4">
            <div className="bg-zinc-800/50 rounded-lg p-6 border border-zinc-700">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-zinc-600 pb-4 mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-100">neōb</h2>
                  <p className="text-sm text-zinc-400">Batch Traveller Document</p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-zinc-400">Form: BF-TRV-001</p>
                  <p className="text-zinc-400">Rev: 2.0</p>
                </div>
              </div>

              {/* Batch Info */}
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-zinc-700 pb-2">
                    <span className="text-zinc-400">Batch Number:</span>
                    <span className="font-mono font-bold text-orange-400">{batch.batch_id}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-700 pb-2">
                    <span className="text-zinc-400">Product:</span>
                    <span className="text-zinc-100">{batch.product_name}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-700 pb-2">
                    <span className="text-zinc-400">SKU:</span>
                    <span className="font-mono text-zinc-100">{batch.sku}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-zinc-700 pb-2">
                    <span className="text-zinc-400">Quantity:</span>
                    <span className="font-bold text-zinc-100">{batch.quantity} units</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-700 pb-2">
                    <span className="text-zinc-400">Production Date:</span>
                    <span className="text-zinc-100">
                      {batch.production_date ? new Date(batch.production_date).toLocaleDateString() : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-700 pb-2">
                    <span className="text-zinc-400">Line:</span>
                    <span className="text-zinc-100">Line {batch.production_line || 1}</span>
                  </div>
                </div>
              </div>

              {/* Materials Used */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                  <Beaker className="w-4 h-4" /> Materials Used
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-700">
                      <th className="text-left py-2 text-zinc-400">Material</th>
                      <th className="text-right py-2 text-zinc-400">Expected</th>
                      <th className="text-right py-2 text-zinc-400">Actual</th>
                      <th className="text-right py-2 text-zinc-400">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.material_usage?.length > 0 ? (
                      batch.material_usage.map((mat, idx) => (
                        <tr key={idx} className="border-b border-zinc-800">
                          <td className="py-2 text-zinc-200">{mat.material_name}</td>
                          <td className="text-right py-2 text-zinc-400">{mat.expected_qty} {mat.unit}</td>
                          <td className="text-right py-2 text-zinc-200">{mat.actual_qty} {mat.unit}</td>
                          <td className={`text-right py-2 ${mat.variance > 0 ? 'text-red-400' : mat.variance < 0 ? 'text-amber-400' : 'text-green-400'}`}>
                            {mat.variance > 0 ? '+' : ''}{mat.variance} {mat.unit}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-zinc-500">No material usage recorded</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-zinc-700">
                <div>
                  <p className="text-sm text-zinc-400 mb-2">Operator:</p>
                  <p className="text-zinc-100">{batch.operator}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-400 mb-2">Approved By:</p>
                  <p className="text-zinc-100">{batch.approved_by || '________________'}</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="qc" className="mt-4">
            <div className="bg-zinc-800/50 rounded-lg p-6 border border-zinc-700">
              <div className="flex justify-between items-start border-b border-zinc-600 pb-4 mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-100">neōb</h2>
                  <p className="text-sm text-zinc-400">Quality Control Checklist</p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-zinc-400">Batch: {batch.batch_id}</p>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm text-zinc-400">Product: <span className="text-zinc-100">{batch.product_name}</span></p>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="text-left py-2 text-zinc-400 w-8">✓</th>
                    <th className="text-left py-2 text-zinc-400">Checkpoint</th>
                    <th className="text-left py-2 text-zinc-400">Criteria</th>
                    <th className="text-left py-2 text-zinc-400">Result</th>
                    <th className="text-left py-2 text-zinc-400">Initial</th>
                  </tr>
                </thead>
                <tbody>
                  {(batch.qc_results?.length > 0 ? batch.qc_results : [
                    { checkpoint: 'Visual Inspection', criteria: 'No defects, correct color', passed: null },
                    { checkpoint: 'Weight Check', criteria: 'Within ±5% of target', passed: null },
                    { checkpoint: 'Fragrance', criteria: 'Correct scent profile', passed: null },
                    { checkpoint: 'Texture', criteria: 'Smooth, no lumps', passed: null },
                    { checkpoint: 'Packaging', criteria: 'Labels aligned, sealed', passed: null },
                  ]).map((qc, idx) => (
                    <tr key={idx} className="border-b border-zinc-800">
                      <td className="py-3">
                        <div className={`w-5 h-5 border-2 rounded ${qc.passed === true ? 'bg-green-500 border-green-500' : qc.passed === false ? 'bg-red-500 border-red-500' : 'border-zinc-600'}`}>
                          {qc.passed === true && <span className="text-white text-xs">✓</span>}
                          {qc.passed === false && <span className="text-white text-xs">✗</span>}
                        </div>
                      </td>
                      <td className="py-3 text-zinc-200">{qc.checkpoint}</td>
                      <td className="py-3 text-zinc-400">{qc.criteria}</td>
                      <td className="py-3 text-zinc-400">{qc.value || '________'}</td>
                      <td className="py-3 text-zinc-400">{qc.checked_by || '____'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-6 pt-4 border-t border-zinc-700">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-zinc-400">QC Inspector:</p>
                    <p className="text-zinc-100 mt-1">________________</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400">Date:</p>
                    <p className="text-zinc-100 mt-1">________________</p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="procedures" className="mt-4">
            <div className="bg-zinc-800/50 rounded-lg p-6 border border-zinc-700">
              <div className="flex justify-between items-start border-b border-zinc-600 pb-4 mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-100">neōb</h2>
                  <p className="text-sm text-zinc-400">Manufacturing Procedure</p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-zinc-400">Product: {batch.product_name}</p>
                </div>
              </div>

              {recipeData?.procedures?.length > 0 ? (
                <div className="space-y-4">
                  {recipeData.procedures.map((proc, idx) => (
                    <div key={idx} className="flex gap-4 p-4 bg-zinc-900/50 rounded-lg border border-zinc-700">
                      <div className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold shrink-0">
                        {proc.step || idx + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-zinc-200">{proc.description}</p>
                        {proc.duration_minutes && (
                          <p className="text-sm text-zinc-500 mt-1">Duration: {proc.duration_minutes} min</p>
                        )}
                        {proc.notes && (
                          <p className="text-sm text-amber-400 mt-1">Note: {proc.notes}</p>
                        )}
                      </div>
                      <div className="w-6 h-6 border-2 border-zinc-600 rounded shrink-0" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {[
                    { step: 1, description: 'Gather all materials and verify quantities', duration: 10 },
                    { step: 2, description: 'Prepare equipment and sanitize work area', duration: 15 },
                    { step: 3, description: 'Mix dry ingredients according to formula', duration: 20 },
                    { step: 4, description: 'Add wet ingredients gradually while mixing', duration: 30 },
                    { step: 5, description: 'Transfer to molds/containers', duration: 20 },
                    { step: 6, description: 'Allow to set/cure as required', duration: null },
                    { step: 7, description: 'Perform QC checks and package', duration: 30 },
                  ].map((proc) => (
                    <div key={proc.step} className="flex gap-4 p-4 bg-zinc-900/50 rounded-lg border border-zinc-700">
                      <div className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold shrink-0">
                        {proc.step}
                      </div>
                      <div className="flex-1">
                        <p className="text-zinc-200">{proc.description}</p>
                        {proc.duration && (
                          <p className="text-sm text-zinc-500 mt-1">Est. {proc.duration} min</p>
                        )}
                      </div>
                      <div className="w-6 h-6 border-2 border-zinc-600 rounded shrink-0" />
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-zinc-700 text-sm text-zinc-500">
                <p>Check each step as completed. Report any deviations to supervisor.</p>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}