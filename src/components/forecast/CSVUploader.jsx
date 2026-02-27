import React, { useState } from "react";
import { Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Papa from "papaparse";

export default function CSVUploader({ onDataLoaded, type, label }) {
  const [fileName, setFileName] = useState("");
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const parseCSV = (file) => {
    setLoading(true);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: function(results) {
        const data = results.data.map(row => {
          // Different column mappings for inventory vs sales
          if (type === 'inventory') {
            return {
              sku: row['Product variant SKU'] || row['Product SKU'] || row.SKU || row.sku || row['Variant SKU'] || row['Item SKU'] || row.Variant,
              product: row['Product title'] || row.Product || row.product || row.Title || row['Product Title'] || row.Name || row.name,
              quantity: parseInt(row.Available || row['On hand'] || row['On Hand'] || row.Quantity || row.quantity || row.Qty || row.qty || row.Stock || row.stock || 0),
              unit: row.Unit || row.unit || 'units'
            };
          }
          
          // Sales data mapping
          return {
            day: row.Day || row.day || row.DATE || row.Date || row.date,
            sku: row['Product variant SKU'] || row['Product SKU'] || row.SKU || row.sku || row['Variant SKU'] || row['Item SKU'] || row.Variant,
            product: row['Product title'] || row.Product || row.product || row.Title || row['Product Title'] || row.Name,
            location: row['POS location name'] || row.Location || row.location || '',
            qty: parseInt(row['Quantity ordered'] || row.Available || row['Net quantity'] || row.Qty || row.qty || row.Quantity || row.quantity || 0)
          };
        }).filter(r => {
          const hasSku = r.sku && r.sku.trim() !== '';
          
          // For inventory, allow zero quantities (we want to know what's at 0)
          if (type === 'inventory') {
            const hasValidQty = !isNaN(r.quantity);
            return hasSku && hasValidQty;
          }
          
          // For sales, require positive quantity
          const hasValidQty = !isNaN(r.qty) && r.qty > 0;
          const valid = hasSku && hasValidQty;
          
          return valid;
        });
        
        setFileName(file.name);
        setRowCount(data.length);
        setLoading(false);
        onDataLoaded(data, type);
      },
      error: function(error) {
        alert('Error parsing CSV: ' + error.message);
        setLoading(false);
      }
    });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      parseCSV(file);
    }
  };

  const handleClear = () => {
    setFileName("");
    setRowCount(0);
    onDataLoaded(null, type);
  };

  return (
    <Card className="bg-zinc-800/50 border-zinc-700">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-zinc-300">{label}</label>
          {fileName && (
            <button onClick={handleClear} className="text-zinc-500 hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        
        {fileName ? (
          <div className="flex items-center gap-3 p-3 bg-zinc-900 rounded-lg border border-zinc-700">
            <FileText className="w-5 h-5 text-green-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-200 truncate">{fileName}</p>
              <p className="text-xs text-zinc-500">{rowCount.toLocaleString()} rows loaded</p>
            </div>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-orange-500/50 transition-colors">
            <Upload className="w-8 h-8 text-zinc-600 mb-2" />
            <span className="text-sm text-zinc-500">{loading ? 'Processing...' : 'Click to upload CSV'}</span>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              disabled={loading}
            />
          </label>
        )}
      </CardContent>
    </Card>
  );
}