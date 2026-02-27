import React, { useState } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Play, 
  Pause, 
  Clock, 
  AlertCircle,
  Package,
  Factory
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Badge from "@/components/ui/Badge";

const statusConfig = {
  draft: { label: "Draft", color: "default", icon: Package },
  started: { label: "Started", color: "blue", icon: Play },
  on_hold: { label: "On Hold", color: "amber", icon: Pause },
};

export default function ProductionQueuePanel({ 
  batches = [], 
  activeBatchId,
  onSelectBatch,
  onNewBatch,
  isCollapsed,
  onToggleCollapse
}) {
  const queueBatches = batches.filter(b => ['draft', 'started', 'on_hold'].includes(b.status));
  
  const groupedBatches = {
    started: queueBatches.filter(b => b.status === 'started'),
    on_hold: queueBatches.filter(b => b.status === 'on_hold'),
    draft: queueBatches.filter(b => b.status === 'draft'),
  };

  const totalCount = queueBatches.length;

  if (isCollapsed) {
    return (
      <div className="w-12 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center py-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="mb-4"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
            <Factory className="w-4 h-4 text-orange-400" />
          </div>
          {totalCount > 0 && (
            <span className="text-xs font-bold text-orange-400">{totalCount}</span>
          )}
        </div>

        {groupedBatches.started.length > 0 && (
          <div className="mt-4 flex flex-col items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-xs text-blue-400">{groupedBatches.started.length}</span>
          </div>
        )}

        {groupedBatches.on_hold.length > 0 && (
          <div className="mt-2 flex flex-col items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-xs text-amber-400">{groupedBatches.on_hold.length}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Factory className="w-5 h-5 text-orange-400" />
          <span className="font-semibold text-zinc-100">Production Queue</span>
          {totalCount > 0 && (
            <Badge variant="orange">{totalCount}</Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="text-zinc-400"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>

      {/* New Batch Button */}
      <div className="p-3 border-b border-zinc-800">
        <Button
          onClick={onNewBatch}
          className="w-full bg-orange-500 hover:bg-orange-600"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Batch
        </Button>
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto">
        {/* Started Section */}
        {groupedBatches.started.length > 0 && (
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-xs font-semibold text-zinc-400 uppercase">
                In Progress ({groupedBatches.started.length})
              </span>
            </div>
            <div className="space-y-2">
              {groupedBatches.started.map(batch => (
                <BatchCard 
                  key={batch.id} 
                  batch={batch} 
                  isActive={batch.id === activeBatchId}
                  onClick={() => onSelectBatch(batch)}
                />
              ))}
            </div>
          </div>
        )}

        {/* On Hold Section */}
        {groupedBatches.on_hold.length > 0 && (
          <div className="p-3 border-t border-zinc-800">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-xs font-semibold text-zinc-400 uppercase">
                On Hold ({groupedBatches.on_hold.length})
              </span>
            </div>
            <div className="space-y-2">
              {groupedBatches.on_hold.map(batch => (
                <BatchCard 
                  key={batch.id} 
                  batch={batch} 
                  isActive={batch.id === activeBatchId}
                  onClick={() => onSelectBatch(batch)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Draft Section */}
        {groupedBatches.draft.length > 0 && (
          <div className="p-3 border-t border-zinc-800">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-zinc-500" />
              <span className="text-xs font-semibold text-zinc-400 uppercase">
                Drafts ({groupedBatches.draft.length})
              </span>
            </div>
            <div className="space-y-2">
              {groupedBatches.draft.map(batch => (
                <BatchCard 
                  key={batch.id} 
                  batch={batch} 
                  isActive={batch.id === activeBatchId}
                  onClick={() => onSelectBatch(batch)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {totalCount === 0 && (
          <div className="p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-3">
              <Package className="w-6 h-6 text-zinc-500" />
            </div>
            <p className="text-sm text-zinc-500">No batches in queue</p>
            <p className="text-xs text-zinc-600 mt-1">Click "New Batch" to start</p>
          </div>
        )}
      </div>
    </div>
  );
}

function BatchCard({ batch, isActive, onClick }) {
  const config = statusConfig[batch.status] || statusConfig.draft;
  const StepIcon = config.icon;

  const stepLabels = ["Select", "Details", "Materials", "Review"];
  const currentStepLabel = stepLabels[(batch.current_step || 1) - 1];

  return (
    <div
      onClick={onClick}
      className={`
        p-3 rounded-lg border cursor-pointer transition-all
        ${isActive 
          ? 'bg-orange-500/10 border-orange-500/50' 
          : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'}
      `}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm text-orange-400 truncate">
            {batch.batch_id || 'New Batch'}
          </p>
          <p className="text-sm text-zinc-200 truncate">{batch.product_name || 'No product selected'}</p>
        </div>
        <Badge variant={config.color} className="ml-2 shrink-0">
          {config.label}
        </Badge>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 text-zinc-500">
          <Clock className="w-3 h-3" />
          <span>Step {batch.current_step || 1}: {currentStepLabel}</span>
        </div>
        {batch.operator && (
          <span className="text-zinc-500 truncate ml-2">{batch.operator}</span>
        )}
      </div>

      {/* Step Progress Indicator */}
      <div className="flex gap-1 mt-2">
        {[1, 2, 3, 4].map(step => (
          <div 
            key={step}
            className={`h-1 flex-1 rounded-full ${
              step < (batch.current_step || 1) ? 'bg-orange-500' :
              step === (batch.current_step || 1) ? 'bg-orange-500/50' :
              'bg-zinc-700'
            }`}
          />
        ))}
      </div>

      {batch.status === 'on_hold' && batch.hold_reason && (
        <div className="mt-2 p-2 bg-amber-500/10 rounded text-xs text-amber-400 flex items-start gap-1">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="truncate">{batch.hold_reason}</span>
        </div>
      )}
    </div>
  );
}