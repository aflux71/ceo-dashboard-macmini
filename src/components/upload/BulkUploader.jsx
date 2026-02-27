import React, { useState, useRef } from "react";
import Papa from "papaparse";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import Badge from "@/components/ui/Badge";
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  X,
  ArrowRight,
  Wand2
} from "lucide-react";

// Template definitions for each data type
const TEMPLATES = {
  forecasting: {
    name: "Forecasting Sales Data",
    requiredFields: ["sku", "quantity"],
    optionalFields: ["product_name", "date", "channel", "location"],
    sampleData: [
      { sku: "BB-LAV-001", product_name: "Lavender Bath Bomb", quantity: 50, date: "2026-01-15", channel: "retail", location: "Store A" },
      { sku: "BW-CIT-002", product_name: "Citrus Body Wash", quantity: 30, date: "2026-01-15", channel: "online", location: "" },
      { sku: "SC-VAN-003", product_name: "Vanilla Scrub", quantity: 25, date: "2026-01-16", channel: "retail", location: "Store B" }
    ],
    description: "Upload sales data for demand forecasting"
  },
  raw_materials: {
    name: "Raw Materials Inventory",
    requiredFields: ["sku", "name", "quantity", "unit"],
    optionalFields: ["reorder_point", "reorder_qty", "supplier", "cost_per_unit", "location"],
    sampleData: [
      { sku: "RM-CITRIC-001", name: "Citric Acid", quantity: 50, unit: "kg", reorder_point: 10, reorder_qty: 25, supplier: "ChemSupply Co", cost_per_unit: 5.50, location: "Shelf A1" },
      { sku: "RM-BSODA-002", name: "Baking Soda", quantity: 100, unit: "kg", reorder_point: 20, reorder_qty: 50, supplier: "ChemSupply Co", cost_per_unit: 3.25, location: "Shelf A2" },
      { sku: "RM-LAVEO-003", name: "Lavender Essential Oil", quantity: 5, unit: "L", reorder_point: 1, reorder_qty: 3, supplier: "Essential Oils Ltd", cost_per_unit: 45.00, location: "Cabinet B" }
    ],
    description: "Upload raw materials and packaging inventory"
  },
  recipes: {
    name: "Product Recipes",
    requiredFields: ["sku", "name", "category", "batch_size"],
    optionalFields: ["production_line", "ingredients_json"],
    sampleData: [
      { sku: "BB-LAV-001", name: "Lavender Bath Bomb", category: "Bath Bombs", batch_size: 100, production_line: 1, ingredients_json: '[{"material":"Citric Acid","sku":"RM-CITRIC-001","qty":2,"unit":"kg"},{"material":"Baking Soda","sku":"RM-BSODA-002","qty":4,"unit":"kg"}]' },
      { sku: "BW-CIT-002", name: "Citrus Body Wash", category: "Body Wash", batch_size: 50, production_line: 2, ingredients_json: '[]' },
      { sku: "SC-VAN-003", name: "Vanilla Sugar Scrub", category: "Scrubs", batch_size: 75, production_line: 1, ingredients_json: '[]' }
    ],
    description: "Upload product recipes with ingredients"
  }
};

export default function BulkUploader({ dataType, onUploadComplete, onClose }) {
  const [step, setStep] = useState(1); // 1: upload, 2: mapping, 3: preview, 4: complete
  const [file, setFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvData, setCsvData] = useState([]);
  const [fieldMapping, setFieldMapping] = useState({});
  const [validationErrors, setValidationErrors] = useState([]);
  const [mappedData, setMappedData] = useState([]);
  const fileInputRef = useRef(null);

  const template = TEMPLATES[dataType];
  const allFields = [...template.requiredFields, ...template.optionalFields];

  // Download template CSV
  const downloadTemplate = () => {
    const headers = allFields;
    const csv = Papa.unparse({
      fields: headers,
      data: template.sampleData.map(row => headers.map(h => row[h] ?? ""))
    });
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dataType}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle file upload
  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);

    // Handle CSV files with Papa Parse
    Papa.parse(uploadedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvHeaders(results.meta.fields || []);
        setCsvData(results.data);
        autoMapFields(results.meta.fields || []);
        setStep(2);
      },
      error: (error) => {
        console.error("CSV Parse Error:", error);
      }
    });
  };

  // Auto-map fields based on header similarity
  const autoMapFields = (headers) => {
    const mapping = {};
    
    allFields.forEach(field => {
      // Exact match
      let match = headers.find(h => h.toLowerCase() === field.toLowerCase());
      
      // Partial match
      if (!match) {
        match = headers.find(h => 
          h.toLowerCase().includes(field.toLowerCase()) ||
          field.toLowerCase().includes(h.toLowerCase())
        );
      }

      // Common aliases
      if (!match) {
        const aliases = {
          sku: ["product_sku", "item_sku", "code", "product_code", "item_code"],
          name: ["product_name", "item_name", "title", "description"],
          quantity: ["qty", "amount", "count", "stock", "on_hand"],
          unit: ["uom", "unit_of_measure", "measure"],
          date: ["sale_date", "order_date", "transaction_date"],
          channel: ["sales_channel", "source", "type"],
          location: ["store", "warehouse", "site"],
          cost_per_unit: ["unit_cost", "price", "cost"],
          batch_size: ["batch_qty", "units_per_batch"]
        };
        
        if (aliases[field]) {
          match = headers.find(h => 
            aliases[field].some(alias => 
              h.toLowerCase() === alias.toLowerCase() ||
              h.toLowerCase().includes(alias.toLowerCase())
            )
          );
        }
      }

      if (match) {
        mapping[field] = match;
      }
    });

    setFieldMapping(mapping);
  };

  // Update field mapping
  const updateMapping = (field, csvHeader) => {
    setFieldMapping(prev => ({
      ...prev,
      [field]: csvHeader === "_none_" ? undefined : csvHeader
    }));
  };

  // Validate and preview data - now allows partial mapping
  const validateAndPreview = () => {
    const errors = [];
    const mapped = [];

    csvData.forEach((row, idx) => {
      const mappedRow = {};
      const rowErrors = [];

      // Map fields
      allFields.forEach(field => {
        const csvHeader = fieldMapping[field];
        if (csvHeader && row[csvHeader] !== undefined && row[csvHeader] !== '') {
          mappedRow[field] = row[csvHeader];
        }
      });

      // Check required fields - track errors but still include row
      template.requiredFields.forEach(field => {
        if (!mappedRow[field] || mappedRow[field].toString().trim() === "") {
          rowErrors.push(`Missing: ${field}`);
          errors.push({ row: idx + 2, field, message: `Missing required field: ${field}` });
        }
      });

      // Type conversions
      if (mappedRow.quantity) mappedRow.quantity = parseFloat(mappedRow.quantity) || 0;
      if (mappedRow.batch_size) mappedRow.batch_size = parseInt(mappedRow.batch_size) || 0;
      if (mappedRow.reorder_point) mappedRow.reorder_point = parseFloat(mappedRow.reorder_point) || 0;
      if (mappedRow.reorder_qty) mappedRow.reorder_qty = parseFloat(mappedRow.reorder_qty) || 0;
      if (mappedRow.cost_per_unit) mappedRow.cost_per_unit = parseFloat(mappedRow.cost_per_unit) || 0;
      if (mappedRow.production_line) mappedRow.production_line = parseInt(mappedRow.production_line) || 1;

      // Parse ingredients JSON for recipes
      if (dataType === "recipes" && mappedRow.ingredients_json) {
        try {
          mappedRow.ingredients = JSON.parse(mappedRow.ingredients_json);
          delete mappedRow.ingredients_json;
        } catch {
          mappedRow.ingredients = [];
        }
      }

      // For raw materials, set type
      if (dataType === "raw_materials") {
        mappedRow.type = "raw_material";
      }

      // Include all rows, track errors separately
      mappedRow._errors = rowErrors;
      mappedRow._rowIndex = idx + 2;
      mapped.push(mappedRow);
    });

    setValidationErrors(errors);
    setMappedData(mapped);
    setStep(3);
  };

  // Complete upload
  const completeUpload = () => {
    onUploadComplete(mappedData);
    setStep(4);
  };

  // No longer require all fields to be mapped - partial mapping allowed
  const anyFieldMapped = Object.values(fieldMapping).some(v => v);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-orange-400" />
            Bulk Upload: {template.name}
          </DialogTitle>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 py-4">
          {[1, 2, 3, 4].map((s) => (
            <React.Fragment key={s}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s ? "bg-orange-500 text-white" : "bg-zinc-800 text-zinc-500"
              }`}>
                {step > s ? <CheckCircle className="w-4 h-4" /> : s}
              </div>
              {s < 4 && <div className={`w-12 h-0.5 ${step > s ? "bg-orange-500" : "bg-zinc-800"}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">{template.description}</p>
            
            <Card className="bg-zinc-900 border-zinc-800 border-dashed">
              <CardContent className="py-8 text-center">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                  className="hidden"
                />
                <Upload className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                <Button onClick={() => fileInputRef.current?.click()} className="bg-orange-600 hover:bg-orange-700">
                  <Upload className="w-4 h-4 mr-2" />
                  Select CSV File
                </Button>
                <p className="text-xs text-zinc-500 mt-3">
                  Supports .csv files up to 10MB
                </p>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between p-4 bg-zinc-900 rounded-lg border border-zinc-800">
              <div>
                <p className="text-sm font-medium text-zinc-200">Need a template?</p>
                <p className="text-xs text-zinc-500">Download a pre-formatted CSV template</p>
              </div>
              <Button variant="outline" onClick={downloadTemplate} className="border-zinc-700">
                <Download className="w-4 h-4 mr-2" />
                Download Template
              </Button>
            </div>

            <div className="text-xs text-zinc-500">
              <p className="font-medium text-zinc-400 mb-1">Required fields:</p>
              <div className="flex flex-wrap gap-1">
                {template.requiredFields.map(f => (
                  <Badge key={f} variant="orange">{f}</Badge>
                ))}
              </div>
              <p className="font-medium text-zinc-400 mt-3 mb-1">Optional fields:</p>
              <div className="flex flex-wrap gap-1">
                {template.optionalFields.map(f => (
                  <Badge key={f} variant="default">{f}</Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Field Mapping */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">
                  Map your CSV columns to the required fields
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  File: {file?.name} ({csvData.length} rows)
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => autoMapFields(csvHeaders)} className="border-zinc-700">
                <Wand2 className="w-4 h-4 mr-1" />
                Auto-Map
              </Button>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {allFields.map(field => {
                const isRequired = template.requiredFields.includes(field);
                const isMapped = !!fieldMapping[field];
                
                return (
                  <div key={field} className="flex items-center gap-3">
                    <div className="w-40 flex items-center gap-2">
                      <span className={`text-sm ${isRequired ? "text-zinc-200 font-medium" : "text-zinc-400"}`}>
                        {field}
                      </span>
                      {isRequired && <span className="text-red-400 text-xs">*</span>}
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-600" />
                    <Select
                      value={fieldMapping[field] || "_none_"}
                      onValueChange={(v) => updateMapping(field, v)}
                    >
                      <SelectTrigger className={`flex-1 bg-zinc-900 ${
                        isMapped ? "border-green-600/50" : isRequired ? "border-red-600/50" : "border-zinc-800"
                      }`}>
                        <SelectValue placeholder="Select column..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none_">-- Not mapped --</SelectItem>
                        {csvHeaders.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isMapped && <CheckCircle className="w-4 h-4 text-green-400" />}
                  </div>
                );
              })}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)} className="border-zinc-700">
                Back
              </Button>
              <Button 
                onClick={validateAndPreview} 
                className="bg-orange-600 hover:bg-orange-700"
              >
                Validate & Preview
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-200">
                  {mappedData.length} rows ready to send to review queue
                </p>
                {validationErrors.length > 0 && (
                  <p className="text-xs text-amber-400 mt-1">
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    {validationErrors.length} fields have missing data - can be completed in review
                  </p>
                )}
              </div>
            </div>

            {/* Info about partial mapping */}
            {validationErrors.length > 0 && (
              <Card className="bg-amber-950/20 border-amber-800/30">
                <CardContent className="py-3">
                  <p className="text-xs text-amber-300">
                    <strong>Partial mapping detected:</strong> Some rows are missing required fields. 
                    These will be sent to the review queue where you can edit and complete the data before approving.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Preview Table */}
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[250px]">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-800 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-zinc-400 font-medium w-16">Status</th>
                      {allFields.filter(f => mappedData.some(r => r[f] !== undefined)).map(f => (
                        <th key={f} className="px-3 py-2 text-left text-zinc-400 font-medium">
                          {f}
                          {template.requiredFields.includes(f) && <span className="text-red-400 ml-1">*</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mappedData.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className={`border-t border-zinc-800 ${row._errors?.length > 0 ? 'bg-amber-950/10' : ''}`}>
                        <td className="px-3 py-2">
                          {row._errors?.length > 0 ? (
                            <Badge variant="amber" className="text-[10px]">Incomplete</Badge>
                          ) : (
                            <Badge variant="green" className="text-[10px]">Ready</Badge>
                          )}
                        </td>
                        {allFields.filter(f => mappedData.some(r => r[f] !== undefined)).map(f => (
                          <td key={f} className={`px-3 py-2 truncate max-w-[150px] ${
                            template.requiredFields.includes(f) && !row[f] ? 'text-red-400 bg-red-950/20' : 'text-zinc-300'
                          }`}>
                            {typeof row[f] === "object" ? JSON.stringify(row[f]).substring(0, 30) + "..." : (row[f] || <span className="text-zinc-600 italic">empty</span>)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mappedData.length > 10 && (
                <div className="px-3 py-2 bg-zinc-900 text-xs text-zinc-500 text-center">
                  Showing 10 of {mappedData.length} rows
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(2)} className="border-zinc-700">
                Back
              </Button>
              <Button 
                onClick={completeUpload} 
                disabled={mappedData.length === 0}
                className="bg-orange-600 hover:bg-orange-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Send {mappedData.length} to Review Queue
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 4 && (
          <div className="py-8 text-center">
            <CheckCircle className="w-16 h-16 text-orange-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-zinc-100 mb-2">Sent to Review Queue!</h3>
            <p className="text-zinc-400 mb-6">
              {mappedData.length} records are now pending review. Edit any incomplete data and approve to add to {dataType === 'raw_materials' ? 'Inventory' : dataType === 'recipes' ? 'Recipes' : 'Forecasting'}.
            </p>
            <Button onClick={onClose} className="bg-orange-600 hover:bg-orange-700">
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}