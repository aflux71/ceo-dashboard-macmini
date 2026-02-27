import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Play,
  Pause,
  Clock,
  Package,
  ChevronRight,
  AlertCircle,
  FileText
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Badge from "@/components/ui/Badge";

const statusConfig = {
  draft: { label: "Draft", color: "default", icon: FileText },
  started: { label: "In Progress", color: "blue", icon: Play },
  on_hold: { label: "On Hold", color: "amber", icon: Pause },
};

const stepLabels = ["Select Product", "Batch Details", "Materials & QC", "Review"];

export default function ProductionQueue() {
  const [filter, setFilter] = useState("all");

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['production-queue-batches'],
    queryFn: () => base44.entities.Batch.filter({
      status: { $in: ['draft', 'started', 'on_hold'] }
    }),
  });

  const filteredBatches = filter === "all" 
    ? batches 
    : batches.filter(b => b.status === filter);

  const counts = {
    all: batches.length,
    started: batches.filter(b => b.status === 'started').length,
    on_hold: batches.filter(b => b.status === 'on_hold').length,
    draft: batches.filter(b => b.status === 'draft').length,
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Production Queue</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Active batches in production
          </p>
        </div>
        <Link to={createPageUrl("ProductionEntry")}>
          <Button className="bg-orange-500 hover:bg-orange-600">
            <Play className="w-4 h-4 mr-2" />
            New Batch
          </Button>
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
          className={filter === "all" ? "bg-orange-500 hover:bg-orange-600" : ""}
        >
          All ({counts.all})
        </Button>
        <Button
          variant={filter === "started" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("started")}
          className={filter === "started" ? "bg-blue-500 hover:bg-blue-600" : ""}
        >
          <span className="w-2 h-2 bg-blue-400 rounded-full mr-2 animate-pulse"></span>
          In Progress ({counts.started})
        </Button>
        <Button
          variant={filter === "on_hold" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("on_hold")}
          className={filter === "on_hold" ? "bg-amber-500 hover:bg-amber-600" : ""}
        >
          <span className="w-2 h-2 bg-amber-400 rounded-full mr-2"></span>
          On Hold ({counts.on_hold})
        </Button>
        <Button
          variant={filter === "draft" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("draft")}
          className={filter === "draft" ? "bg-zinc-600 hover:bg-zinc-500" : ""}
        >
          Drafts ({counts.draft})
        </Button>
      </div>

      {/* Queue List */}
      {isLoading ? (
        <div className="text-center py-12 text-zinc-500">Loading...</div>
      ) : filteredBatches.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-zinc-500" />
            </div>
            <p className="text-zinc-400 font-medium">No batches in queue</p>
            <p className="text-sm text-zinc-500 mt-1">Start a new production batch to see it here</p>
            <Link to={createPageUrl("ProductionEntry")} className="mt-4 inline-block">
              <Button className="bg-orange-500 hover:bg-orange-600">
                Start New Batch
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredBatches.map(batch => {
            const config = statusConfig[batch.status] || statusConfig.draft;
            const StatusIcon = config.icon;
            const currentStep = batch.current_step || 1;

            return (
              <Link
                key={batch.id}
                to={`${createPageUrl("ProductionEntry")}?batchId=${batch.id}`}
                className="block"
              >
                <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {/* Status Icon */}
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                          batch.status === 'started' ? 'bg-blue-500/20' :
                          batch.status === 'on_hold' ? 'bg-amber-500/20' :
                          'bg-zinc-800'
                        }`}>
                          <StatusIcon className={`w-5 h-5 ${
                            batch.status === 'started' ? 'text-blue-400' :
                            batch.status === 'on_hold' ? 'text-amber-400' :
                            'text-zinc-400'
                          }`} />
                        </div>

                        {/* Batch Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm text-orange-400">
                              {batch.batch_id || 'New Batch'}
                            </span>
                            <Badge variant={config.color}>{config.label}</Badge>
                          </div>
                          <p className="text-zinc-200 font-medium truncate">
                            {batch.product_name || 'No product selected'}
                          </p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Step {currentStep}: {stepLabels[currentStep - 1]}
                            </span>
                            {batch.operator && (
                              <span>Operator: {batch.operator}</span>
                            )}
                            {batch.quantity > 0 && (
                              <span>{batch.quantity} units</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Step Progress & Arrow */}
                      <div className="flex items-center gap-4">
                        {/* Progress Bar */}
                        <div className="hidden sm:flex gap-1 w-24">
                          {[1, 2, 3, 4].map(step => (
                            <div 
                              key={step}
                              className={`h-1.5 flex-1 rounded-full ${
                                step < currentStep ? 'bg-orange-500' :
                                step === currentStep ? 'bg-orange-500/50' :
                                'bg-zinc-700'
                              }`}
                            />
                          ))}
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-500" />
                      </div>
                    </div>

                    {/* Hold Reason */}
                    {batch.status === 'on_hold' && batch.hold_reason && (
                      <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                        <span className="text-sm text-amber-400">{batch.hold_reason}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}