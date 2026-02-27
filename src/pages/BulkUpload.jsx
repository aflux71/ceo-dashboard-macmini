import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import Badge from "@/components/ui/Badge";
import {
  FileSpreadsheet,
  TrendingUp,
  Package,
  Beaker,
  Upload,
  CheckCircle,
  AlertTriangle,
  Trash2,
  Edit,
  Clock,
  Search,
  CheckCheck,
  X
} from "lucide-react";
import { toast } from "sonner";
import BulkUploader from "@/components/upload/BulkUploader";
import BulkUploadQueue from "@/components/upload/BulkUploadQueue.jsx";

const UPLOAD_TYPES = [
  {
    id: "forecasting",
    name: "Forecasting Sales Data",
    description: "Upload historical sales data for demand forecasting",
    icon: TrendingUp,
    color: "purple",
    examples: ["Retail sales", "Online orders", "Wholesale transactions"]
  },
  {
    id: "raw_materials",
    name: "Raw Materials & Inventory",
    description: "Bulk import raw materials and packaging items",
    icon: Package,
    color: "blue",
    examples: ["Chemicals", "Essential oils", "Packaging materials"]
  },
  {
    id: "recipes",
    name: "Product Recipes",
    description: "Import product recipes with batch sizes and categories",
    icon: Beaker,
    color: "orange",
    examples: ["Bath bombs", "Body wash", "Scrubs"]
  }
];

export default function BulkUpload() {
  const [activeUploader, setActiveUploader] = useState(null);
  const [activeTab, setActiveTab] = useState("upload"); // "upload" or "queue"
  const queryClient = useQueryClient();

  // Fetch pending queue items
  const { data: queueItems = [], isLoading: queueLoading } = useQuery({
    queryKey: ['bulkUploadQueue'],
    queryFn: () => base44.entities.BulkUploadQueue.filter({ status: 'pending' }, '-created_date'),
  });

  // Add items to queue instead of direct import
  const handleUploadComplete = async (data, entityType) => {
    if (!activeUploader || data.length === 0) return;

    try {
      const batchId = `BULK-${Date.now()}`;
      const queueData = data.map(item => {
        // Clean internal tracking fields
        const cleanData = { ...item };
        delete cleanData._errors;
        delete cleanData._rowIndex;
        
        return {
          entity_type: activeUploader === "raw_materials" ? "inventory" : activeUploader === "recipes" ? "recipe" : "forecasting",
          data: cleanData,
          status: "pending",
          batch_id: batchId,
          errors: item._errors || []
        };
      });

      await base44.entities.BulkUploadQueue.bulkCreate(queueData);
      queryClient.invalidateQueries({ queryKey: ['bulkUploadQueue'] });
      toast.success(`Added ${data.length} items to review queue`);
      setActiveUploader(null);
      setActiveTab("queue");
    } catch (error) {
      toast.error(`Failed to queue items: ${error.message}`);
    }
  };

  const pendingCount = queueItems.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Bulk Upload</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Import data from CSV files with automatic field mapping
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab("upload")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === "upload"
              ? "bg-zinc-800 text-orange-400 border-b-2 border-orange-500"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Upload className="w-4 h-4 inline mr-2" />
          Upload
        </button>
        <button
          onClick={() => setActiveTab("queue")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
            activeTab === "queue"
              ? "bg-zinc-800 text-orange-400 border-b-2 border-orange-500"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Clock className="w-4 h-4" />
          Review Queue
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === "upload" && (
        <>
      {/* Upload Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {UPLOAD_TYPES.map((type) => (
          <Card 
            key={type.id}
            className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer"
            onClick={() => setActiveUploader(type.id)}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className={`p-3 rounded-lg bg-${type.color}-500/20`}>
                  <type.icon className={`w-6 h-6 text-${type.color}-400`} />
                </div>
                <Badge variant={type.color}>{type.id.replace("_", " ")}</Badge>
              </div>
              <CardTitle className="text-lg mt-3">{type.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-400 mb-4">{type.description}</p>
              <div className="space-y-1">
                <p className="text-xs text-zinc-500">Examples:</p>
                <div className="flex flex-wrap gap-1">
                  {type.examples.map((ex, idx) => (
                    <span key={idx} className="text-xs px-2 py-0.5 bg-zinc-800 rounded text-zinc-400">
                      {ex}
                    </span>
                  ))}
                </div>
              </div>
              <Button className="w-full mt-4 bg-orange-600 hover:bg-orange-700">
                <Upload className="w-4 h-4 mr-2" />
                Upload CSV
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>



      {/* Instructions */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-orange-400" />
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center mx-auto mb-2">
                <span className="text-orange-400 font-bold">1</span>
              </div>
              <p className="text-sm text-zinc-300 font-medium">Download Template</p>
              <p className="text-xs text-zinc-500 mt-1">Get a pre-formatted CSV template</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center mx-auto mb-2">
                <span className="text-orange-400 font-bold">2</span>
              </div>
              <p className="text-sm text-zinc-300 font-medium">Fill Your Data</p>
              <p className="text-xs text-zinc-500 mt-1">Add your data to the template</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center mx-auto mb-2">
                <span className="text-orange-400 font-bold">3</span>
              </div>
              <p className="text-sm text-zinc-300 font-medium">Map Fields</p>
              <p className="text-xs text-zinc-500 mt-1">Auto or manual column mapping</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center mx-auto mb-2">
                <span className="text-orange-400 font-bold">4</span>
              </div>
              <p className="text-sm text-zinc-300 font-medium">Import</p>
              <p className="text-xs text-zinc-500 mt-1">Preview and confirm import</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Uploader Dialog */}
      {activeUploader && (
        <BulkUploader
          dataType={activeUploader}
          onUploadComplete={handleUploadComplete}
          onClose={() => setActiveUploader(null)}
        />
      )}
        </>
      )}

      {activeTab === "queue" && (
        <BulkUploadQueue 
          items={queueItems} 
          isLoading={queueLoading}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['bulkUploadQueue'] })}
        />
      )}
    </div>
  );
}